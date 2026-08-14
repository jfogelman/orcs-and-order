import { distance, idx } from '../engine/grid';
import { findPath, reachableWithin } from '../engine/pathfind';
import type { CostFn } from '../engine/pathfind';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { City, GameState, Unit } from '../model/types';
import type { CombatResult } from './combat';
import { destroyUnit, resolveCombat } from './combat';
import { cityAt, log, recomputeVisibility, unitAt } from './gamestate';
import { terrainMoveCost } from './rules';

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
  const occupants = new Map<number, number>();
  for (const u of state.units) occupants.set(idx(u.x, u.y, state.width), u.owner);
  const foreignCities = new Set<number>();
  for (const c of state.cities) {
    if (c.owner !== unit.owner) foreignCities.add(idx(c.x, c.y, state.width));
  }

  return (x, y) => {
    const i = idx(x, y, state.width);
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

/** Route to a destination, ignoring this turn's movement budget. */
export function routeTo(
  state: GameState,
  unit: Unit,
  x: number,
  y: number,
): Array<[number, number]> | null {
  return findPath(state.width, state.height, [unit.x, unit.y], [x, y], costFnFor(state, unit));
}

function captureCity(state: GameState, unit: Unit, city: City): void {
  const from = state.players[city.owner];
  const to = state.players[unit.owner];
  city.owner = unit.owner;
  city.disorder = false;
  city.workedTiles = [];
  // A sacked city loses a citizen and its garrison buildings.
  city.size = Math.max(1, city.size - 1);
  city.buildings = city.buildings.filter((b) => b !== 'walls');
  city.producing = { kind: 'coin' };
  city.shields = 0;
  log(state, `${city.name} falls to ${to.name}.`, 'combat', unit.owner);
  log(state, `${city.name} has been taken by ${to.name}.`, 'bad', from.id);
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
        `${type.name} defeats ${defenderType.name} after ${result.rounds} rounds.`,
        'combat',
        unit.owner,
      );
      destroyUnit(state, occupant, 'is wiped out');
    } else {
      log(
        state,
        `${defenderType.name} holds against ${type.name}.`,
        'combat',
        occupant.owner,
      );
      destroyUnit(state, unit, 'is destroyed attacking');
    }
    if (result.promoted) {
      const winner = result.attackerWon ? type.name : defenderType.name;
      log(state, `${winner} is promoted to veteran.`, 'good', result.attackerWon ? unit.owner : occupant.owner);
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
  const cost = type.flies ? 1 : terrainMoveCost(owner, terrain);
  unit.x = x;
  unit.y = y;
  unit.moves = Math.max(0, unit.moves - cost);
  if (unit.order === 'fortified') unit.order = 'none';
  recomputeVisibility(state, unit.owner);

  if (capturing && city) {
    captureCity(state, unit, city);
    unit.moves = 0;
    unit.goto = null;
    return { kind: 'captured', city };
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
    last = tryStep(state, unit, nx, ny);
    if (last.kind === 'moved') {
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
