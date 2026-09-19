import { DIRS8, distance, idx } from '../engine/grid';
import { findPath, reachableWithin } from '../engine/pathfind';
import type { CostFn } from '../engine/pathfind';
import { TERRAIN } from '../model/terrain';
import { hasPerk } from '../model/perks';
import { unitType } from '../model/units';
import type { City, GameState, Player, Unit } from '../model/types';
import { RUIN, isRuined, markDamaged, resettleTurns, workingBuildings } from './city';
import { count } from '../model/advisors';
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
import { board, canBoard } from './ships';
import { effectiveMove, terrainMoveCost } from './rules';
import {
  ROADS,
  canBuildRoad,
  canLayRoads,
  hasRoad,
  roadTurns,
  snapMoves,
  startRoad,
  stepCost,
} from './roads';
import { BUILDINGS } from '../model/buildings';
import { isFolly } from './follyEffects';

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

  return (x, y, fromX, fromY) => {
    const i = idx(x, y, state.width);
    // Unexplored ground is assumed walkable and ordinary. If it turns out to
    // be sea or occupied, the step is refused when the unit gets there, which
    // is the correct way to find out.
    if (!owner.explored[i]) return 1;

    const terrain = state.terrain[i];
    // Ships keep to the water; everything else but a flyer keeps off it.
    if (type.sails ? !TERRAIN[terrain].water : !type.flies && TERRAIN[terrain].water) return null;
    // Enemy ground is entered by attacking or capturing, never by pathing.
    if (foreignCities.has(i)) return null;
    const occupantOwner = occupants.get(i);
    if (occupantOwner !== undefined && occupantOwner !== unit.owner) return null;
    const base = type.flies || type.sails ? 1 : stepCost(state, owner, fromX, fromY, x, y);
    return occupantOwner !== undefined ? base + FRIENDLY_BLOCK_PENALTY : base;
  };
}

/** Ids of enemy units this player can currently see. */
export function visibleEnemies(state: GameState, playerId: number): Set<number> {
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
      const atSea = TERRAIN[state.terrain[idx(x, y, state.width)]].water;
      // Nobody on land fights a ship; a ship takes no town, empty or not.
      if (atSea && !type.sails && !type.flies) continue;
      if (occupant && occupant.owner !== unit.owner) out.add(idx(x, y, state.width));
      else if (!occupant && city && city.owner !== unit.owner && !type.sails) out.add(idx(x, y, state.width));
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
    const [px, py] = route[i - 1];
    const cost = type.flies || type.sails ? 1 : stepCost(state, owner, px, py, x, y);
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
    const [px, py] = route[i - 1];
    const cost = type.flies || type.sails ? 1 : stepCost(state, owner, px, py, x, y);
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
 * The route a road-to follows: a march's route, with a hair's preference for
 * going straight.
 *
 * On open ground many routes cost exactly the same -- three steps east can be
 * taken as east, north-east, south-east -- and the pathfinder takes whichever it
 * meets first. A march does not care. A road is left behind as a record of the
 * route, and one that wanders off the straight line for no reason reads as a
 * mistake. A thousandth of a point on every diagonal step breaks those ties
 * toward the straight line; even sixty-four diagonals add less than one road
 * step costs, so it never makes a longer route win. Marches keep the plain
 * route, so no AI game changes.
 */
export function roadRouteTo(
  state: GameState,
  unit: Unit,
  x: number,
  y: number,
): Array<[number, number]> | null {
  const walk = costFnFor(state, unit);
  const cost: CostFn = (tx, ty, fx, fy) => {
    const c = walk(tx, ty, fx, fy);
    return c === null ? null : c + (tx !== fx && ty !== fy ? 0.001 : 0);
  };
  return findPath(state.width, state.height, [unit.x, unit.y], [x, y], cost);
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
    awardXp(state, unit, XP.raze);
    recomputeVisibility(state, to.id);
    recomputeVisibility(state, from.id);
    return false;
  }

  city.owner = unit.owner;
  city.disorder = false;
  city.workedTiles = [];
  city.size = city.size - severity;
  // Nothing grows here for a while, and how long depends on how much of a
  // place it still is. Without this the city is back to full size before
  // anyone returns, and no amount of sacking ever adds up.
  city.ruinedUntil = state.turn + resettleTurns(city.size);

  // The walls, however, stay standing and change hands with the city.
  //
  // Levelling them on capture made a taken city markedly easier to take back
  // than it had been to take, so cities flipped back and forth for the rest of
  // the game and no war ever resolved. Whoever holds the city holds its walls.
  for (let razed = 0; razed < severity; razed++) {
    // Nor a folly (section 111): there is only one, and it is worth more standing.
    const sackable = city.buildings.filter((b) => b !== 'walls' && !isFolly(BUILDINGS[b]));
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
  awardXp(state, unit, XP.city);
  return true;
}

/**
 * Attempt a single step onto an adjacent tile. Moving into an enemy is an
 * attack; moving into an undefended enemy city captures it.
 */
/**
 * The step back a knight takes when it attacks something and fails to finish it.
 *
 * The first thing in this game that moves a unit outside its owner's turn, so
 * it is deliberately narrow. Section 11 named the two traps and both are
 * handled here rather than discovered later:
 *
 * - **Nowhere to go.** Surrounded, or backed onto water, it simply stays and
 *   takes what comes. Withdrawal is a chance, not a guarantee.
 * - **Not into a city.** Any city, including its own. A retreat that garrisons
 *   a settlement for free would make attacking-and-failing a *better* way to
 *   defend than walking there.
 *
 * Prefers the tile furthest from what it just attacked, so falling back is
 * actually falling back rather than sidestepping into the same trouble.
 */
function stepBack(state: GameState, unit: Unit, fromX: number, fromY: number): boolean {
  const cost = costFnFor(state, unit);
  let best: { x: number; y: number; away: number } | null = null;

  for (const [dx, dy] of DIRS8) {
    const x = unit.x + dx;
    const y = unit.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    // The cost function answers "may this unit step here from there", and
    // null is its way of saying no -- so an impassable tile and one it simply
    // cannot afford are the same answer here.
    const step = cost(x, y, unit.x, unit.y);
    if (step === null || !Number.isFinite(step)) continue;
    if (unitAt(state, x, y)) continue;
    if (cityAt(state, x, y)) continue;
    const away = distance(x, y, fromX, fromY);
    if (!best || away > best.away) best = { x, y, away };
  }
  if (!best) return false;

  unit.x = best.x;
  unit.y = best.y;
  recomputeVisibility(state, unit.owner);
  return true;
}

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
    markDamaged(state, city);
    log(
      state,
      `${type.name} brings the walls of ${city.name} down, and goes with them.`,
      'combat',
      unit.owner,
      'explosion',
      [city.x, city.y],
    );
    // Heard by the city that lost them, not only by the side that did it.
    log(state, `The walls of ${city.name} are gone.`, 'bad', city.owner, 'explosion', [
      city.x,
      city.y,
    ]);
    // Everything adjacent is caught, including whoever is holding the gate.
    detonate(state, unit);
    destroyUnit(state, unit, 'is spent bringing down a wall');
    recomputeVisibility(state, unit.owner);
    recomputeVisibility(state, city.owner);
    return { kind: 'blocked', reason: `The walls of ${city.name} come down.`, retryable: false };
  }

  // --- boarding --------------------------------------------------------
  // Stepping onto one of our own carriers with room is going aboard.
  if (occupant && canBoard(unit, occupant)) {
    board(state, unit, occupant);
    return { kind: 'moved' };
  }

  // --- attack ----------------------------------------------------------
  // Nobody wades out to fight a ship. A ship can hit the shore; the shore
  // cannot hit back.
  if (occupant && occupant.owner !== unit.owner && !type.sails && !type.flies && TERRAIN[terrain].water) {
    return { kind: 'blocked', reason: `${type.name} cannot fight at sea.`, retryable: false };
  }
  if (occupant && occupant.owner !== unit.owner) {
    if (type.attack <= 0) {
      return {
        kind: 'blocked',
        reason: `${type.name} cannot attack anything.`,
        retryable: false,
      };
    }
    // A garrison charging out past something encouraging -- the Broken
    // Catapult's whole point -- is said, so the charge can be seen.
    const home = cityAt(state, unit.x, unit.y);
    const rallyingPoint =
      home && home.owner === unit.owner
        ? workingBuildings(state, home).find((b) => (BUILDINGS[b]?.sallyBonus ?? 0) > 0)
        : undefined;
    if (home && rallyingPoint) {
      log(
        state,
        `${type.name} charges out of ${home.name} past the ${BUILDINGS[rallyingPoint]?.name ?? rallyingPoint}.`,
        'info',
        unit.owner,
        undefined,
        [home.x, home.y],
        undefined,
        'sally',
      );
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
      // It broke off rather than dying, and is standing on one hit point in
      // front of the thing that nearly killed it. Either it gets a step back or
      // the withdrawal was never really available -- section 11 asked for a
      // rule for having nowhere to go, and this is it: a cornered knight dies
      // like anybody else.
      const withdrawn = result.withdrew === true && stepBack(state, unit, occupant.x, occupant.y);
      if (result.withdrew && !withdrawn) unit.hp = 0;

      if (withdrawn) {
        log(
          state,
          `${type.name} thinks better of it and falls back.`,
          'combat',
          unit.owner,
          undefined,
          [unit.x, unit.y],
          unit.id,
        );
      }
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
      // Losing used to mean dying, so this was unconditional. A unit that got
      // away is the first exception, and it must not be buried on its way out.
      if (!withdrawn) {
        destroyUnit(state, unit, result.withdrew ? 'is cornered, and does not get away' : 'is destroyed attacking');
        awardXp(state, occupant, XP.kill);
      } else {
        awardXp(state, occupant, XP.survive);
      }
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
  if (type.sails && !TERRAIN[terrain].water) {
    return { kind: 'blocked', reason: `${type.name} keeps to the water.`, retryable: false };
  }
  if (!type.flies && !type.sails && TERRAIN[terrain].water) {
    return {
      kind: 'blocked',
      reason: `${type.name} cannot cross open water.`,
      retryable: false,
    };
  }

  // --- move / capture --------------------------------------------------
  const capturing = city !== undefined && city.owner !== unit.owner;

  // Raiders never take a city, whoever is steering them.
  //
  // Their own brain sacks an empty city instead of stepping onto it, so this
  // used to be enforced only there. That was the mistake: the rule lived in one
  // brain, and while the empire AI was also moving them -- see `runAiTurn` -- it
  // walked them onto empty cities like any other unit and the capture went
  // through. A rule about what may happen belongs where it happens.
  if (capturing && owner.barbarian) {
    return { kind: 'blocked', reason: 'Raiders do not take cities.', retryable: false };
  }

  // A city still clearing the rubble of its last sacking cannot change hands
  // again. The old population is leaving and the new one has not settled, so
  // there is no functioning place to take.
  //
  // This is the see-saw fix from section 4i. The war there is reciprocal:
  // whoever loses a city takes it straight back, because the army that lost it
  // is still standing next to it, so no lead ever compounds into a win and
  // every game runs to the turn limit. Captures after turn 150 outnumbered
  // those before it two to one and settled nothing.
  //
  // Deliberately reuses `ruinedUntil`, which capture already sets, rather than
  // inventing a second clock: the period a city spends unable to grow and the
  // period it spends unable to be taken are the same period, and two
  // overlapping timers for one event is how a captured city stops being worth
  // capturing.
  if (capturing && city && RUIN.protects && isRuined(state, city)) {
    // Says how long, because the old wording did not. Standing a dragon next
    // to an undefended city and being told only that it "cannot be taken yet"
    // reads as the game refusing a legal move for no reason -- reported from a
    // real save at turn 238, where the wait had six turns left on it.
    const left = (city.ruinedUntil ?? state.turn) - state.turn;
    return {
      kind: 'blocked',
      reason: `${city.name} changed hands too recently -- the new lot are still moving in, with ${count(left, 'turn')} to go.`,
      retryable: true,
    };
  }

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
  const cost = type.flies || type.sails ? 1 : stepCost(state, owner, unit.x, unit.y, x, y);
  unit.x = x;
  unit.y = y;
  unit.moves = snapMoves(unit.moves - cost);
  // Walking off abandons a road half dug, as it abandons a fortification: the
  // work was on the tile it just left.
  if (unit.order === 'fortified' || unit.order === 'road') {
    unit.order = 'none';
    delete unit.work;
  }
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

/**
 * Lay a road all the way to a tile -- "Build Road To".
 *
 * Asked for the moment roads existed, because nobody wants to place a road one
 * tile and one order at a time. Everything after this call is `advanceRoadTo`,
 * run now and then at the top of every turn.
 */
export function startRoadTo(
  state: GameState,
  unit: Unit,
  x: number,
  y: number,
): { ok: boolean; reason?: string } {
  const may = canLayRoads(state, unit);
  if (!may.ok) return may;
  if (!(unit.x === x && unit.y === y) && !roadRouteTo(state, unit, x, y)) {
    return { ok: false, reason: 'No route to that tile.' };
  }
  unit.goto = null;
  unit.roadTo = { x, y };
  advanceRoadTo(state, unit);
  return { ok: true };
}

/**
 * Carry a road-to order as far as this turn allows.
 *
 * Dig where it stands if the ground wants a road. Otherwise walk the route,
 * stepping over road that is already there -- which costs a third, so a worker
 * can cross several tiles of it in one turn -- and stop to dig at the first tile
 * that wants one. The order ends at the destination.
 *
 * Interrupted the way a march is: a friendly in the way is a traffic jam and
 * waits; anything else that stops the step, or an enemy coming into view, ends
 * the order, because a worker walking on past a waiting army is never what was
 * meant.
 */
export function advanceRoadTo(state: GameState, unit: Unit): void {
  const plan = unit.roadTo;
  if (!plan || unit.order === 'road') return;
  for (let guard = 0; guard < 128; guard++) {
    if (canBuildRoad(state, unit).ok) {
      startRoad(state, unit);
      return;
    }
    if (unit.x === plan.x && unit.y === plan.y) {
      delete unit.roadTo;
      return;
    }
    // Nothing left on the way that wants a road, so the order is done even
    // though the worker is not standing on the destination.
    //
    // Reported from a real game as "Road To does nothing from a road": the
    // destination was the player's own city, a tile that can never take a road
    // and always has a garrison standing on it. The worker tried to step into
    // it, was turned back as a traffic jam, waited, and did that for ever --
    // on a road, so there was nothing to dig where it stood either.
    if (!routeWantsRoad(state, unit, plan)) {
      delete unit.roadTo;
      log(
        state,
        `${unitType(unit.type).name} finishes the road: there is nothing left to lay that way.`,
        'good',
        unit.owner,
        undefined,
        [unit.x, unit.y],
      );
      return;
    }
    if (unit.moves <= 0) return;
    const route = roadRouteTo(state, unit, plan.x, plan.y);
    if (!route || route.length < 2) {
      delete unit.roadTo;
      return;
    }
    const seenBefore = visibleEnemies(state, unit.owner);
    const outcome = tryStep(state, unit, route[1][0], route[1][1]);
    if (outcome.kind !== 'moved') {
      if (!(outcome.kind === 'blocked' && outcome.retryable)) delete unit.roadTo;
      return;
    }
    for (const id of visibleEnemies(state, unit.owner)) {
      if (!seenBefore.has(id)) {
        delete unit.roadTo;
        return;
      }
    }
  }
}

/**
 * Whether anything between here and the destination still wants a road.
 *
 * The destination counts, and so does the tile underfoot. A city, open water
 * and a stretch already laid all want nothing, which is what ends an order that
 * would otherwise wait for ever at a gate it cannot walk through.
 */
function routeWantsRoad(state: GameState, unit: Unit, plan: { x: number; y: number }): boolean {
  const route = roadRouteTo(state, unit, plan.x, plan.y);
  if (!route) return false;
  return route.some(([x, y]) => {
    const terrain = state.terrain[idx(x, y, state.width)];
    if (TERRAIN[terrain].water || roadTurns(terrain) === null) return false;
    if (hasRoad(state, x, y)) return false;
    return !state.cities.some((c) => c.x === x && c.y === y);
  });
}

/**
 * How many turns a road-to along this route will take, start to finish.
 *
 * Not `estimateTurns`, which is a march: walking there and laying a road there
 * are different lengths of time, and the preview on the map said "4" for a road
 * that took eight. This follows `advanceRoadTo` step for step instead -- every
 * tile that wants a road costs its digging turns, both ends included; finishing
 * a stretch refills movement, so the walk onto the next tile happens the same
 * turn; and a stretch of road already down costs only the walk across it, a
 * third a step, with the rule that any movement left buys one more step.
 */
export function estimateRoadTurns(
  state: GameState,
  unit: Unit,
  route: Array<[number, number]>,
): number {
  if (route.length === 0) return 0;
  const owner = state.players[unit.owner];
  const perTurn = Math.max(1, effectiveMove(owner, unit.type));
  const laid = new Set<number>();
  const isRoad = (x: number, y: number) => laid.has(idx(x, y, state.width)) || hasRoad(state, x, y);
  const wantsRoad = (x: number, y: number) => {
    const terrain = state.terrain[idx(x, y, state.width)];
    return !isRoad(x, y) && !TERRAIN[terrain].water && roadTurns(terrain) !== null;
  };

  let turns = 0;
  let left = unit.moves;
  for (let i = 0; ; i++) {
    const [x, y] = route[i];
    if (wantsRoad(x, y)) {
      // The tile it is already digging costs only what is left of that job.
      turns +=
        i === 0 && unit.order === 'road' && unit.work !== undefined
          ? unit.work
          : roadTurns(state.terrain[idx(x, y, state.width)])!;
      laid.add(idx(x, y, state.width));
      left = perTurn;
    }
    if (i === route.length - 1) break;
    const [nx, ny] = route[i + 1];
    const ground = terrainMoveCost(owner, state.terrain[idx(nx, ny, state.width)]);
    const cost = isRoad(x, y) && isRoad(nx, ny) ? Math.min(ground, ROADS.moveCost) : ground;
    if (left <= 0) {
      turns += 1;
      left = perTurn;
    }
    left = snapMoves(left - Math.min(cost, left));
  }
  return Math.max(1, turns);
}

/** Carry every road-to order forward at the top of a turn. */
export function resumeRoadOrders(state: GameState, playerId: number): void {
  for (const unit of [...state.units]) {
    if (unit.owner !== playerId || !unit.roadTo) continue;
    if (!state.units.includes(unit)) continue;
    advanceRoadTo(state, unit);
  }
}
