import { distance, idx } from '../engine/grid';
import { findPath, reachableWithin } from '../engine/pathfind';
import type { CostFn } from '../engine/pathfind';
import { TERRAIN } from '../model/terrain';
import { hasPerk } from '../model/perks';
import { unitType } from '../model/units';
import type { City, GameState, Player, Unit } from '../model/types';
import { RUIN } from './city';
import type { CombatResult } from './combat';
import {
  breatheThrough,
  destroyUnit,
  detonate,
  rearm,
  resolveCombat,
  stormEmptyCity,
  awardXp,
  XP
} from './combat';
import { cityAt, log, recomputeVisibility, unitAt, withRng } from './gamestate';
import { effectiveMove, terrainMoveCost } from './rules';

/**
 * Movement, and the one place where moving turns into fighting.
 *
 * One unit per tile is a hard rule here, which is what gives the count units
 * their meaning: the only way to get more soldiers onto a tile is to research
 * your way to a unit type that already has more soldiers on it.
 */

export type MoveOutcome =
  | { kind: 'moved' }
  /** `retryable` means the obstruction is a friendly unit that may move on. */
  | { kind: 'blocked'; reason: string; retryable: boolean }
  | { kind: 'combat'; result: CombatResult; defenderDied: boolean; attackerDied: boolean }
  | { kind: 'captured'; city: City };

/**
 * Extra cost charged for routing across a tile a friendly unit is standing on.
 *
 * With one unit to a tile, a friendly cannot actually be walked through — but
 * treating it as a hard wall deadlocks whole armies behind their own front
 * rank. Planning through it at a penalty makes units prefer to go around,
 * while still queuing up behind a blocker that is about to move.
 */
export const FRIENDLY_BLOCK_PENALTY = 6;

/**
 * Movement cost function for pathing, honouring terrain, water and stacking.
 *
 * Occupancy is indexed once per call rather than scanned per tile: the
 * pathfinder asks about thousands of tiles, and a linear search through every
 * unit on each of them made late-game turns crawl.
 */
export function costFnFor(state: GameState, unit: Unit): CostFn {
  const owner = state.players[unit.owner];
  const type = unitType(unit.type);

  // Route by what this player actually knows, not by the true state of the
  // board. An enemy standing unseen in the fog used to block the route, so a
  // move order across unexplored ground silently failed and the unit just
  // stood there -- and the failure itself leaked the enemy's position.
  const occupants = new Map<number, number>();
  for (const u of state.units) {
    if (u.owner === unit.owner || owner.visible[idx(u.x, u.y, state.width)]) {
      occupants.set(idx(u.x, u.y, state.width), u.owner);
    }
  }
  const foreignCities = new Set<number>();
  for (const c of state.cities) {
    if (c.owner !== unit.owner && owner.explored[idx(c.x, c.y, state.width)]) {
      foreignCities.add(idx(c.x, c.y, state.width));
    }
  }

  return (x, y) => {
    const i = idx(x, y, state.width);
    // Unexplored ground is assumed walkable and ordinary. If it turns out to
    // be sea or occupied, the step is refused when the unit gets there, which
    // is the correct way to find out.
    if (!owner.explored[i]) return type.flies ? 1 : 1;

    const terrain = state.terrain[i];
    if (!type.flies && TERRAIN[terrain].water) return null;
    // Enemy ground is entered by attacking or capturing, never by pathing.
    if (foreignCities.has(i)) return null;
    const occupantOwner = occupants.get(i);
    if (occupantOwner !== undefined && occupantOwner !== unit.owner) return null;
    const base = type.flies ? 1 : terrainMoveCost(owner, terrain);
    return occupantOwner !== undefined ? base + FRIENDLY_BLOCK_PENALTY : base;
  };
}

/** Ids of enemy units this player can currently see. */
function visibleEnemies(state: GameState, playerId: number): Set<number> {
  const seen = new Set<number>();
  const viewer = state.players[playerId];
  for (const u of state.units) {
    if (u.owner !== playerId && viewer.visible[idx(u.x, u.y, state.width)]) seen.add(u.id);
  }
  return seen;
}

/**
 * Tiles this unit can reach and stop on with the movement it has left.
 * Tiles occupied by friendly units are pathable but not valid destinations.
 */
export function reachableTiles(state: GameState, unit: Unit): Map<number, number> {
  const raw = reachableWithin(
    state.width,
    state.height,
    [unit.x, unit.y],
    unit.moves,
    costFnFor(state, unit),
  );
  for (const i of [...raw.keys()]) {
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    if (unitAt(state, x, y)) raw.delete(i);
  }
  return raw;
}

/** Tiles this unit could attack or capture right now. */
export function attackTargets(state: GameState, unit: Unit): Set<number> {
  const out = new Set<number>();
  const type = unitType(unit.type);
  if (unit.moves <= 0 || type.attack <= 0) return out;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      const occupant = unitAt(state, x, y);
      const city = cityAt(state, x, y);
      if (occupant && occupant.owner !== unit.owner) out.add(idx(x, y, state.width));
      else if (!occupant && city && city.owner !== unit.owner) out.add(idx(x, y, state.width));
    }
  }
  return out;
}

/**
 * Roughly how many turns a route will take, counting the movement already
 * spent this turn. Terrain costs are summed and divided by the unit's
 * allowance, with the Civ2 rule that any leftover movement always buys one
 * more step baked in by charging at most the remaining budget per tile.
 */
export function estimateTurns(
  state: GameState,
  unit: Unit,
  route: Array<[number, number]>,
): number {
  if (route.length < 2) return 0;
  const owner = state.players[unit.owner];
  const type = unitType(unit.type);
  const perTurn = Math.max(1, effectiveMove(owner, unit.type));
  let turns = 1;
  let left = unit.moves;

  for (let i = 1; i < route.length; i++) {
    const [x, y] = route[i];
    const cost = type.flies ? 1 : terrainMoveCost(owner, state.terrain[idx(x, y, state.width)]);
    if (left <= 0) {
      turns++;
      left = perTurn;
    }
    left -= Math.min(cost, left);
  }
  return turns;
}

/**
 * How far along a route the unit gets before this turn's movement runs out.
 *
 * Returned as an index into `route`, one past the last tile it can reach, so
 * `route.slice(0, stepsThisTurn(...))` is exactly the part of the march that
 * happens now and the rest is what happens later.
 */
export function stepsThisTurn(
  state: GameState,
  unit: Unit,
  route: Array<[number, number]>,
): number {
  if (route.length < 2) return route.length;
  const owner = state.players[unit.owner];
  const type = unitType(unit.type);
  let left = unit.moves;
  let i = 1;
  for (; i < route.length; i++) {
    if (left <= 0) break;
    const [x, y] = route[i];
    const cost = type.flies ? 1 : terrainMoveCost(owner, state.terrain[idx(x, y, state.width)]);
    // Any movement left always buys one more step, however rough the ground.
    left -= Math.min(cost, left);
  }
  return i;
}

/** Route to a destination, ignoring this turn's movement budget. */
export function routeTo(
  state: GameState,
  unit: Unit,
  x: number,
  y: number,
): Array<[number, number]> | null {
  return findPath(state.width, state.height, [unit.x, unit.y], [x, y], costFnFor(state, unit));
}

/**
 * How thoroughly a city is wrecked when it changes hands.
 *
 * Scales with whoever turned up. One goblin takes a city; Ten Orcs take it and
 * there is visibly less of it afterwards. Capped, because a city reduced to
 * nothing is not worth taking and the war would stop meaning anything.
 */
export const SACKING = {
  /** Most citizens a flat sacking can take, before the proportional part. */
  cap: 3,
  /** Attack strength per citizen taken. */
  perAttack: 8,
  /**
   * Share of the city taken as well, on top of the flat part.
   *
   * The flat part alone could not finish anything. A sacking took at most
   * three citizens, so a city of twelve needed four captures in a row to
   * reach nothing -- and captures at a given city land about ninety turns
   * apart, so it regrew and the count reset. Taking a *share* means a large
   * city costs the same number of visits to erase as a small one, which is
   * what makes repeated capture add up to something.
   */
  fraction: 0.6,
};

/**
 * How many citizens a capture costs, given who turned up and how big the
 * place is.
 */
export function sackSeverity(attacker: Unit, size = 0): number {
  // Somebody who has done this before, and is thorough about it.
  const extra = hasPerk(attacker, 'butcher') ? 1 : 0;
  const flat = Math.min(
    SACKING.cap,
    Math.max(1, Math.round(unitType(attacker.type).attack / SACKING.perAttack)),
  );
  return extra + Math.max(flat, Math.ceil(size * SACKING.fraction));
}

/**
 * Wipe a city off the map.
 *
 * A place that has been sacked to nothing is not a prize, it is a ruin. This
 * is what stops the see-saw: measured over eighteen seeds, roughly fifty
 * cities changed hands per game across about fifteen tiles, and neither side
 * was ever pushed near elimination because whatever they lost they took
 * straight back. A city ground down by repeated capture now stops existing,
 * so the thing being fought over eventually leaves the board.
 */
function razeCity(state: GameState, city: City, taker: Player, loser: Player): void {
  const at = state.cities.indexOf(city);
  if (at >= 0) state.cities.splice(at, 1);
  // Anything homed here is on its own now, rather than vanishing with it.
  for (const u of state.units) {
    if (u.homeCity === city.id) u.homeCity = null;
  }
  // The tier matches the city sprite sizes, so the settlement that collapses
  // is the one that was standing there.
  const tier = city.size >= 8 ? 8 : city.size >= 4 ? 4 : 1;
  log(
    state,
    `${city.name} is sacked down to nothing and ceases to be a place.`,
    'combat',
    taker.id,
    'capture',
    [city.x, city.y],
    undefined,
    `razed-${loser.faction}-${tier}`,
  );
  log(state, `${city.name} is gone.`, 'bad', loser.id, 'city-lost', [city.x, city.y]);
}

/** Returns whether there is still a city here afterwards. */
function captureCity(state: GameState, unit: Unit, city: City): boolean {
  const from = state.players[city.owner];
  const to = state.players[unit.owner];
  const severity = sackSeverity(unit, city.size);

  // Citizens do not survive a sacking, in proportion to how large it was. A
  // city taken with nobody left in it is razed rather than handed over.
  if (city.size - severity < 1) {
    razeCity(state, city, to, from);
    recomputeVisibility(state, to.id);
    recomputeVisibility(state, from.id);
    return false;
  }

  city.owner = unit.owner;
  city.disorder = false;
  city.workedTiles = [];
  city.size = city.size - severity;
  // Nothing grows here for a while. Without this the place is back to full
  // size before anyone returns, and no amount of sacking ever adds up.
  city.ruinedUntil = state.turn + RUIN.turns;

  // The walls, however, stay standing and change hands with the city.
  //
  // Levelling them on capture made a taken city markedly easier to take back
  // than it had been to take, so cities flipped back and forth for the rest of
  // the game and no war ever resolved. Whoever holds the city holds its walls.
  for (let razed = 0; razed < severity; razed++) {
    const sackable = city.buildings.filter((b) => b !== 'walls');
    if (sackable.length === 0) break;
    const lost = withRng(state, (rng) => rng.pick(sackable));
    city.buildings = city.buildings.filter((b) => b !== lost);
  }

  // Whoever took it is now holding it, and digs in without being told.
  unit.order = 'fortified';
  city.producing = { kind: 'coin' };
  city.shields = 0;
  log(state, `${city.name} falls to ${to.name}.`, 'combat', unit.owner, 'capture', [city.x, city.y]);
  log(state, `${city.name} has been taken by ${to.name}.`, 'bad', from.id, 'city-lost', [city.x, city.y]);
  return true;
}

/**
 * Attempt a single step onto an adjacent tile. Moving into an enemy is an
 * attack; moving into an undefended enemy city captures it.
 */
export function tryStep(state: GameState, unit: Unit, x: number, y: number): MoveOutcome {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
    return { kind: 'blocked', reason: 'Off the edge of the world.', retryable: false };
  }
  if (distance(unit.x, unit.y, x, y) !== 1) {
    return { kind: 'blocked', reason: 'That tile is not adjacent.', retryable: false };
  }
  if (unit.moves <= 0) {
    return { kind: 'blocked', reason: 'Out of movement for this turn.', retryable: true };
  }

  const type = unitType(unit.type);
  const owner = state.players[unit.owner];
  const i = idx(x, y, state.width);
  const terrain = state.terrain[i];
  const occupant = unitAt(state, x, y);
  const city = cityAt(state, x, y);

  // --- demolition ------------------------------------------------------
  // A sapper walked into a walled city brings the walls down and is spent
  // doing it. Cheap, one-use, and the only way the Horde gets through a
  // Kingdom wall -- the rest of the army walks in afterwards.
  if (city && city.owner !== unit.owner && type.demolishes && city.buildings.includes('walls')) {
    city.buildings = city.buildings.filter((b) => b !== 'walls');
    log(
      state,
      `${type.name} brings the walls of ${city.name} down, and goes with them.`,
      'combat',
      unit.owner,
      'explosion',
      [city.x, city.y],
    );
    log(state, `The walls of ${city.name} are gone.`, 'bad', city.owner);
    // Everything adjacent is caught, including whoever is holding the gate.
    detonate(state, unit);
    destroyUnit(state, unit, 'is spent bringing down a wall');
    recomputeVisibility(state, unit.owner);
    recomputeVisibility(state, city.owner);
    return { kind: 'blocked', reason: `The walls of ${city.name} come down.`, retryable: false };
  }

  // --- attack ----------------------------------------------------------
  if (occupant && occupant.owner !== unit.owner) {
    if (type.attack <= 0) {
      return {
        kind: 'blocked',
        reason: `${type.name} cannot attack anything.`,
        retryable: false,
      };
    }
    const result = resolveCombat(state, unit, occupant);
    unit.moves = 0;
    unit.order = 'none';
    unit.goto = null;

    const defenderType = unitType(occupant.type);
    if (result.attackerWon) {
      log(
        state,
        result.executed
          ? `${type.name} finishes off a wounded ${defenderType.name} without a fight.`
          : `${type.name} defeats ${defenderType.name} after ${result.rounds} rounds.`,
        'combat',
        unit.owner,
        undefined,
        [occupant.x, occupant.y],
        unit.id,
      );
      // A dragon's breath does not stop at the thing it hit. Measured before
      // the defender is removed, since the damage it took is the input.
      breatheThrough(state, unit, occupant, unitType(occupant.type).hp - Math.max(0, occupant.hp));
      // A defender that goes up on death does so before it leaves the board,
      // so the attacker standing next to it is very much included.
      const blastVictims = defenderType.explodes > 0 ? detonate(state, occupant) : [];
      destroyUnit(state, occupant, 'is wiped out');
      // Killing teaches most. Nothing is awarded for the blast above, which
      // the sapper's victims did not choose to be part of.
      awardXp(state, unit, XP.kill);
      rearm(state, unit, 'picks its axe back up off the corpse');
      // The attacker may not have survived its own victory.
      if (blastVictims.some((v) => v.id === unit.id)) {
        recomputeVisibility(state, unit.owner);
        recomputeVisibility(state, occupant.owner);
        return { kind: 'combat', result, defenderDied: true, attackerDied: true };
      }
    } else {
      log(
        state,
        `${defenderType.name} holds against ${type.name}.`,
        'combat',
        occupant.owner,
        undefined,
        [occupant.x, occupant.y],
        // The swinger, not the one who held: it is the attacker that moves.
        unit.id,
      );
      destroyUnit(state, unit, 'is destroyed attacking');
      awardXp(state, occupant, XP.kill);
    }
    if (result.promoted) {
      const winner = result.attackerWon ? type.name : defenderType.name;
      log(
        state,
        `${winner} is promoted to veteran.`,
        'good',
        result.attackerWon ? unit.owner : occupant.owner,
        'promote',
      );
    }
    recomputeVisibility(state, unit.owner);
    recomputeVisibility(state, occupant.owner);
    return {
      kind: 'combat',
      result,
      defenderDied: result.attackerWon,
      attackerDied: !result.attackerWon,
    };
  }

  if (occupant) {
    return {
      kind: 'blocked',
      reason: 'One unit to a tile — they will not share.',
      retryable: true,
    };
  }

  // --- terrain ---------------------------------------------------------
  if (!type.flies && TERRAIN[terrain].water) {
    return {
      kind: 'blocked',
      reason: `${type.name} cannot cross open water.`,
      retryable: false,
    };
  }

  // --- move / capture --------------------------------------------------
  const capturing = city !== undefined && city.owner !== unit.owner;

  // Nobody is holding the gate -- there is no unit here, or the attack branch
  // above would have run -- but the people who live here are still in it.
  if (capturing && city) {
    const stand = stormEmptyCity(state, unit, city);
    if (stand.damage > 0) {
      log(
        state,
        `The people of ${city.name} throw what they have at ${type.name}.`,
        'combat',
        city.owner,
        undefined,
        [city.x, city.y],
      );
    }
    if (!stand.taken) {
      log(
        state,
        `${type.name} is driven off by the citizens of ${city.name}, which is embarrassing for everyone.`,
        'combat',
        unit.owner,
        undefined,
        [city.x, city.y],
      );
      destroyUnit(state, unit, 'is seen off by a mob');
      recomputeVisibility(state, city.owner);
      return { kind: 'blocked', reason: `${city.name} threw them back.`, retryable: false };
    }
  }
  const cost = type.flies ? 1 : terrainMoveCost(owner, terrain);
  unit.x = x;
  unit.y = y;
  unit.moves = Math.max(0, unit.moves - cost);
  if (unit.order === 'fortified') unit.order = 'none';
  // Somewhere with a forge, and somebody to complain to about losing an axe.
  if (city && city.owner === unit.owner) rearm(state, unit, 'is handed a new axe');
  recomputeVisibility(state, unit.owner);

  if (capturing && city) {
    const held = captureCity(state, unit, city);
    unit.moves = 0;
    unit.goto = null;
    // A city sacked out of existence was not captured; the unit is simply
    // standing on the ground where one used to be.
    return held ? { kind: 'captured', city } : { kind: 'moved' };
  }
  return { kind: 'moved' };
}

/**
 * Walk toward a destination for as long as this turn's movement allows,
 * remembering the destination so the unit continues next turn.
 */
export function moveToward(state: GameState, unit: Unit, x: number, y: number): MoveOutcome {
  let last: MoveOutcome = { kind: 'blocked', reason: 'Nowhere to go.', retryable: false };
  // Plan once and walk the route, only re-planning if a step actually fails.
  // Re-running A* for every tile of a long march was the single most expensive
  // thing the AI did.
  let route = routeTo(state, unit, x, y);
  let step = 1;

  for (let guard = 0; guard < 512; guard++) {
    if (unit.x === x && unit.y === y) {
      unit.goto = null;
      return last;
    }
    if (unit.moves <= 0) {
      unit.goto = { x, y };
      return last;
    }
    if (!route || step >= route.length) {
      route = routeTo(state, unit, x, y);
      step = 1;
      if (!route || route.length < 2) {
        unit.goto = null;
        return { kind: 'blocked', reason: 'No route to that tile.', retryable: false };
      }
    }

    const [nx, ny] = route[step];
    const seenBefore = visibleEnemies(state, unit.owner);
    last = tryStep(state, unit, nx, ny);
    if (last.kind === 'moved') {
      // Walking into the unknown stops the moment the unknown has someone in
      // it. Marching blindly past a waiting army is never what was intended.
      for (const id of visibleEnemies(state, unit.owner)) {
        if (!seenBefore.has(id)) {
          unit.goto = null;
          return last;
        }
      }
      step++;
      continue;
    }
    // A friendly in the way is a traffic jam, not a cancelled order: keep the
    // destination so the unit tries again once the road clears.
    unit.goto = last.kind === 'blocked' && last.retryable ? { x, y } : null;
    return last;
  }
  return last;
}

/** Resume standing move orders at the start of a turn. */
export function resumeGotoOrders(state: GameState, playerId: number): void {
  for (const unit of [...state.units]) {
    if (unit.owner !== playerId || !unit.goto) continue;
    // The unit may have died in the meantime.
    if (!state.units.includes(unit)) continue;
    const { x, y } = unit.goto;
    moveToward(state, unit, x, y);
  }
}
