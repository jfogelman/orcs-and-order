import { DIRS8, distance, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { log, unitAt } from './gamestate';
import { routeTo, tryStep, visibleEnemies } from './movement';

/**
 * Explore -- section 15's auto-scout.
 *
 * A unit set exploring walks toward the nearest edge of the unknown each turn and
 * **halts the moment something new comes into view**: an enemy, a raider, or a city
 * that is not ours. That halt is the whole point -- without it this is a way to lose
 * a unit unattended.
 *
 * Section 15 wanted it for the Outrider and a new Goblin Scout. The Horde has no
 * scout, and a new one wants art; so it is an order any soldier can take, the way
 * Civ2's explore was. It steps a tile at a time rather than handing the walk to a
 * march, so the halt is checked after every step and not only at the top of a turn.
 */

/** Explored land beside unexplored land, for this unit's owner. */
function frontier(state: GameState, playerId: number): Array<[number, number]> {
  const seen = state.players[playerId].explored;
  const out: Array<[number, number]> = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const i = idx(x, y, state.width);
      if (!seen[i] || TERRAIN[state.terrain[i]].water) continue;
      if (
        DIRS8.some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < state.width && ny < state.height && !seen[idx(nx, ny, state.width)];
        })
      ) {
        out.push([x, y]);
      }
    }
  }
  return out;
}

/** Foreign cities this player can see right now. */
function visibleCities(state: GameState, playerId: number): Set<number> {
  const viewer = state.players[playerId];
  const out = new Set<number>();
  for (const c of state.cities) {
    if (c.owner !== playerId && viewer.visible[idx(c.x, c.y, state.width)]) out.add(c.id);
  }
  return out;
}

/** Whether this unit could be sent exploring, and why not. */
export function canExplore(unit: Unit): { ok: boolean; reason?: string } {
  if (unitType(unit.type).settler) return { ok: false, reason: 'Workers have work. Send a soldier.' };
  return { ok: true };
}

/** Send a unit exploring, and take its first steps now. */
export function startExplore(state: GameState, unit: Unit): boolean {
  if (!canExplore(unit).ok) return false;
  unit.exploring = true;
  unit.goto = null;
  unit.order = 'none';
  advanceExplore(state, unit);
  return true;
}

/** Stop exploring, with a line saying why. */
function stop(state: GameState, unit: Unit, why: string): void {
  delete unit.exploring;
  log(state, `${unitType(unit.type).name} ${why}`, 'info', unit.owner, undefined, [unit.x, unit.y]);
}

/**
 * As far as this turn allows: step toward the nearest unknown, and stop the moment
 * an enemy or a foreign city comes into view that was not in view before the step.
 */
export function advanceExplore(state: GameState, unit: Unit): void {
  if (!unit.exploring || unit.order !== 'none') return;
  for (let guard = 0; guard < 64 && unit.moves > 0; guard++) {
    // The nearest edge of the unknown there is a way to: the nearest by distance
    // may be across water, and giving up on that would strand an explorer that
    // still has a whole continent to walk.
    const edges = frontier(state, unit.owner)
      .map(([x, y]) => ({ x, y, d: distance(unit.x, unit.y, x, y) }))
      .filter((e) => e.d > 0)
      .sort((a, b) => a.d - b.d);
    if (edges.length === 0) {
      stop(state, unit, 'has seen all there is to see from here.');
      return;
    }
    let route: Array<[number, number]> | null = null;
    for (const e of edges.slice(0, 12)) {
      route = routeTo(state, unit, e.x, e.y);
      if (route && route.length >= 2) break;
      route = null;
    }
    if (!route) {
      stop(state, unit, 'can find no way on into the unknown.');
      return;
    }
    // An explorer looks; it does not pick fights.
    const ahead = unitAt(state, route[1][0], route[1][1]);
    if (ahead && ahead.owner !== unit.owner) {
      stop(state, unit, 'halts: something is in the way.');
      return;
    }
    const enemiesBefore = visibleEnemies(state, unit.owner);
    const citiesBefore = visibleCities(state, unit.owner);
    const outcome = tryStep(state, unit, route[1][0], route[1][1]);
    if (outcome.kind !== 'moved') {
      if (!(outcome.kind === 'blocked' && outcome.retryable)) stop(state, unit, 'stops: the way is blocked.');
      return;
    }
    for (const id of visibleEnemies(state, unit.owner)) {
      if (!enemiesBefore.has(id)) {
        stop(state, unit, 'halts: something is out there.');
        return;
      }
    }
    for (const id of visibleCities(state, unit.owner)) {
      if (!citiesBefore.has(id)) {
        stop(state, unit, 'halts: a city not ours, ahead.');
        return;
      }
    }
  }
}

/** Carry every explorer on at the top of its owner's turn. */
export function resumeExplore(state: GameState, playerId: number): void {
  for (const unit of [...state.units]) {
    if (unit.owner !== playerId || !unit.exploring) continue;
    if (!state.units.includes(unit)) continue;
    advanceExplore(state, unit);
  }
}
