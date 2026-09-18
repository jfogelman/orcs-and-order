import { distance, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { contentLimit } from './city';
import { log, playerCities, playerUnits } from './gamestate';
import { moveToward, roadRouteTo, routeTo, tryStep } from './movement';
import { hasFlag } from './rules';
import { JOBS, TERRAFORM, jobTurns, startImprove, tileBlocked } from './terraform';
import type { Job } from './terraform';

/**
 * Section 112: finding land to work, for whoever is not choosing it by hand.
 *
 * The AI's workers and a player's worker on **Auto work** ask the same question
 * the same way, so it lives here rather than in `ai.ts`. And **Irrigate To**, the
 * ditch-digging cousin of Road To, which needs to walk and so cannot live in
 * `terraform.ts` (which `city.ts` imports, and walking imports `city.ts`).
 */

/**
 * The best piece of worked land a worker could improve, or null.
 *
 * Worked tiles only: a ditch nobody farms is a ditch for nothing. Irrigation and
 * mines add, so they are always worth it -- except that a ditch for a city
 * already at its content limit is food for more people to riot, which cost the
 * Horde seventeen games in 108 before anybody asked. Clearing a *forest* trades
 * two shields for one food and one shield, so it is left alone; a swamp is
 * strictly worse than the grass it becomes. A tile somebody is standing on, or
 * that another worker is walking to or working, is somebody else's.
 */
export function bestImproveJob(
  state: GameState,
  playerId: number,
  from: Unit | null,
): { i: number; job: Job } | null {
  if (!TERRAFORM.enabled || !hasFlag(state.players[playerId], 'terraform')) return null;
  const w = state.width;
  const claimed = new Set<number>();
  for (const u of playerUnits(state, playerId)) {
    if ((from && u.id === from.id) || !unitType(u.type).settler) continue;
    if (u.order === 'improve') claimed.add(idx(u.x, u.y, w));
    if (u.goto) claimed.add(idx(u.goto.x, u.goto.y, w));
  }
  let best: { i: number; job: Job } | null = null;
  let bestScore = -Infinity;
  for (const city of playerCities(state, playerId)) {
    const roomToGrow = city.size < contentLimit(state, city) - 1;
    for (const i of city.workedTiles) {
      if (claimed.has(i)) continue;
      const x = i % w;
      const y = Math.floor(i / w);
      if (state.units.some((u) => u.x === x && u.y === y && u.id !== from?.id)) continue;
      const terrain = state.terrain[i];
      for (const job of JOBS) {
        if (job === 'clear' && terrain !== 'swamp') continue;
        if (job === 'irrigate' && !roomToGrow) continue;
        if (tileBlocked(state, i, job, playerId) !== null) continue;
        const value = job === 'irrigate' ? 3 : job === 'mine' ? 2 * (TERRAFORM.shields[terrain] ?? 0) : 4;
        const score = value * 4 - (from ? distance(from.x, from.y, x, y) : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { i, job };
        }
      }
    }
  }
  return best;
}

/** Whether any of this empire's worked land is still waiting for a worker. */
export function improveWorkToDo(state: GameState, playerId: number): boolean {
  return bestImproveJob(state, playerId, null) !== null;
}

/** Walk to the best piece of land to improve, and start on it once there. */
export function takeImproveJob(state: GameState, unit: Unit): boolean {
  const target = bestImproveJob(state, unit.owner, unit);
  if (!target) return false;
  const x = target.i % state.width;
  const y = Math.floor(target.i / state.width);
  if (unit.x !== x || unit.y !== y) {
    if (!routeTo(state, unit, x, y)) return false;
    moveToward(state, unit, x, y);
    if (unit.x !== x || unit.y !== y) return true;
  }
  return startImprove(state, unit, target.job);
}

/**
 * Workers on Auto work, at the top of their owner's turn: any that is not already
 * busy or walking somewhere takes the best job there is. One that finds nothing
 * simply waits, still on Auto work, for the land around it to need something.
 */
export function resumeAutoWork(state: GameState, playerId: number): void {
  for (const unit of [...state.units]) {
    if (unit.owner !== playerId || !unit.autoWork) continue;
    if (!state.units.includes(unit)) continue;
    if (unit.order !== 'none' || unit.goto || unit.roadTo || unit.irrigateTo) continue;
    takeImproveJob(state, unit);
  }
}

/** Whether this worker could be given an Irrigate To at all, and why not. */
export function canIrrigateTo(state: GameState, unit: Unit): { ok: boolean; reason?: string } {
  if (!TERRAFORM.enabled) return { ok: false, reason: 'Nobody here knows how to improve the land.' };
  if (!unitType(unit.type).settler) return { ok: false, reason: 'Only workers dig.' };
  if (!hasFlag(state.players[unit.owner], 'terraform')) return { ok: false, reason: 'That needs Tree-Hugging.' };
  return { ok: true };
}

/** Whether anything between here and the destination could still be watered. */
function routeWantsDitch(state: GameState, unit: Unit, plan: { x: number; y: number }): boolean {
  const route = roadRouteTo(state, unit, plan.x, plan.y) ?? [[unit.x, unit.y]];
  return route.some(([x, y]) => {
    const i = idx(x, y, state.width);
    const terrain = state.terrain[i];
    if (TERRAIN[terrain].water || jobTurns('irrigate', terrain) === null) return false;
    if (state.irrigation?.[i] === 1) return false;
    return !state.cities.some((c) => c.x === x && c.y === y);
  });
}

/**
 * Dig ditches all the way to a tile -- Irrigate To.
 *
 * Asked for because irrigation needs water beside it: a field has to be walked
 * inland from the coast one ditch at a time, and doing that an order at a time is
 * the same chore Road To was built to end.
 */
export function startIrrigateTo(
  state: GameState,
  unit: Unit,
  x: number,
  y: number,
): { ok: boolean; reason?: string } {
  const may = canIrrigateTo(state, unit);
  if (!may.ok) return may;
  if (!(unit.x === x && unit.y === y) && !roadRouteTo(state, unit, x, y)) {
    return { ok: false, reason: 'No route to that tile.' };
  }
  unit.goto = null;
  delete unit.roadTo;
  unit.irrigateTo = { x, y };
  advanceIrrigateTo(state, unit);
  return { ok: true };
}

/**
 * Carry an Irrigate To as far as this turn allows: dig where the ground can be
 * watered, walk on where it cannot, stop at the destination -- or as soon as
 * nothing left on the way could be watered, which is what keeps it from waiting
 * for ever at a city gate, the mistake Road To made first.
 */
export function advanceIrrigateTo(state: GameState, unit: Unit): void {
  const plan = unit.irrigateTo;
  if (!plan || unit.order === 'improve') return;
  for (let guard = 0; guard < 128; guard++) {
    if (tileBlocked(state, idx(unit.x, unit.y, state.width), 'irrigate', unit.owner) === null) {
      startImprove(state, unit, 'irrigate');
      return;
    }
    if (unit.x === plan.x && unit.y === plan.y) {
      delete unit.irrigateTo;
      return;
    }
    if (!routeWantsDitch(state, unit, plan)) {
      delete unit.irrigateTo;
      log(
        state,
        `${unitType(unit.type).name} finishes the ditches: there is nothing left to water that way.`,
        'good',
        unit.owner,
        undefined,
        [unit.x, unit.y],
      );
      return;
    }
    if (unit.moves <= 0) return;
    // Road To's route, which leans toward the straight line. A march's route takes
    // whichever of several equal diagonals it meets first, and a chain of ditches
    // is left behind as a record of the way it went: pointed along a row, it wandered
    // off the row a tile in.
    const route = roadRouteTo(state, unit, plan.x, plan.y);
    if (!route || route.length < 2) {
      delete unit.irrigateTo;
      return;
    }
    const outcome = tryStep(state, unit, route[1][0], route[1][1]);
    if (outcome.kind !== 'moved') {
      if (!(outcome.kind === 'blocked' && outcome.retryable)) delete unit.irrigateTo;
      return;
    }
  }
}

/** Carry every Irrigate To forward at the top of a turn. */
export function resumeIrrigateOrders(state: GameState, playerId: number): void {
  for (const unit of [...state.units]) {
    if (unit.owner !== playerId || !unit.irrigateTo) continue;
    if (!state.units.includes(unit)) continue;
    advanceIrrigateTo(state, unit);
  }
}
