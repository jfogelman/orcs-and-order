import { idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import type { GameState, Unit } from '../model/types';
import { unitType, worksGround } from '../model/units';
import { hasFlag } from './rules';

/**
 * The Caravan: somewhere to ask from. Section 145.
 *
 * The Wandering Folk's signature structure, and the thing that makes them a
 * faction rather than a third roster with a price premium. From
 * `WANDERERS_PLAN.md`: *"A fixed terrain improvement, same category as a fort
 * or watchtower -- built once by a worker-type unit and permanent from then
 * on, not a mobile structure."*
 *
 * **An improvement, not a building**, and the bible says both. The prose is
 * unambiguous -- it describes a thing planted on a tile near a contested
 * border, visible and attackable -- while the draft tech entry lists
 * `buildings: ['caravan']`, which is a one-word slip from writing the tech
 * table in the same pass. The art prompt settles it: the Caravan is filed
 * under *House style (terrain improvement)*, beside the irrigation and mine
 * overlays, not under the city buildings.
 *
 * Deliberately section 102's garrison post in every way that can be copied --
 * built by the same units, on the same kind of tile, saved the same way, drawn
 * over the terrain, and **torn up by the same pillaging rule**. Jeremy, asked
 * directly whether a Caravan can be destroyed or captured, which his own bible
 * left open: pillaged, like a post. So a forward Caravan is a real risk and
 * needs no new mechanism to be one.
 *
 * What it is *for* is `recruiting.ts`. This file only puts it on the map.
 */
export const CARAVANS = {
  /** Whether Caravans can be built at all. A lever, so it measures as an arm. */
  enabled: true,
  /**
   * Worker-turns to put one up.
   *
   * Longer than a post's three, and deliberately. A post is a hut with a spear
   * leaning on it; this is the structure an entire faction's economy hangs
   * off, and it should cost more than an afternoon.
   */
  turns: 6,
  /**
   * How far a Caravan can see, and therefore how far it can ask.
   *
   * The recruitment radius of the bible: *"any enemy or neutral unit within a
   * Caravan's sight-line is a valid recruit target"*. Two, which is a Scout's
   * sight rather than a soldier's one -- the Caravan is not watching for
   * trouble, it is watching for people.
   */
  sight: 2,
};

/** Whether there is a Caravan on this tile. */
export function hasCaravan(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
  return state.caravans?.[idx(x, y, state.width)] === 1;
}

/**
 * Whether this unit could plant a Caravan where it stands, and why not.
 *
 * The faction gate is here rather than on the advance alone, because an
 * advance can change hands -- section 136's espionage steals them -- and a
 * Horde peon who has somehow learned Somewhere To Ask From still has nobody to
 * ask on its behalf.
 */
export function canBuildCaravan(
  state: GameState,
  unit: Unit,
): { ok: boolean; reason?: string } {
  if (!CARAVANS.enabled) return { ok: false, reason: 'Nobody builds those.' };
  const owner = state.players[unit.owner];
  if (owner?.faction !== 'wandering') {
    return { ok: false, reason: 'Only the Wandering Folk keep Caravans.' };
  }
  // Through the flag rather than the advance's id, the way `bridges` gates
  // laying a road -- so a rename of the advance cannot quietly unbuild this.
  if (!hasFlag(owner, 'caravans')) {
    return { ok: false, reason: 'Somewhere To Ask From has not been worked out yet.' };
  }
  // Section 148: a worker always, and after *Somewhere To Ask From* anybody
  // at all. A garrison post is built and a ring of parked wagons is only
  // stopped, so there was never much reason a soldier could not stop.
  if (!worksGround(unitType(unit.type)) && !hasFlag(owner, 'anyone-parks')) {
    return { ok: false, reason: 'Only workers can park one, for now.' };
  }
  const i = idx(unit.x, unit.y, state.width);
  if (TERRAIN[state.terrain[i]].water) return { ok: false, reason: 'Not on water.' };
  if (state.cities.some((c) => c.x === unit.x && c.y === unit.y)) {
    return { ok: false, reason: 'A city can already do this.' };
  }
  if (hasCaravan(state, unit.x, unit.y)) {
    return { ok: false, reason: 'There is a Caravan here already.' };
  }
  return { ok: true };
}

/** Set a worker building one. Returns whether it started. */
export function startCaravan(state: GameState, unit: Unit): boolean {
  if (!canBuildCaravan(state, unit).ok) return false;
  unit.order = 'caravan';
  unit.work = CARAVANS.turns;
  unit.goto = null;
  return true;
}

/**
 * One turn of building, at the top of the worker's turn.
 *
 * `stopped` when there is no longer a Caravan to build here -- somebody else
 * finished it, or founded a city on the spot -- which frees the worker rather
 * than leaving it hammering at something that already exists. Exactly the
 * post's shape, for exactly the post's reason.
 */
export function advanceCaravanWork(
  state: GameState,
  unit: Unit,
): 'done' | 'working' | 'stopped' {
  if (!canBuildCaravan(state, unit).ok) {
    unit.order = 'none';
    delete unit.work;
    return 'stopped';
  }
  unit.work = (unit.work ?? CARAVANS.turns) - 1;
  if (unit.work > 0) return 'working';
  // Created with the first Caravan rather than with the map, so a game nobody
  // has built in -- and every save from before this existed -- carries nothing.
  state.caravans ??= new Array(state.width * state.height).fill(0);
  state.caravans[idx(unit.x, unit.y, state.width)] = 1;
  unit.order = 'none';
  delete unit.work;
  return 'done';
}

/** Every Caravan this player holds, as tile indices. */
export function caravansOf(state: GameState, playerId: number): number[] {
  if (!CARAVANS.enabled || !state.caravans) return [];
  // A Caravan has no owner stored on it, for the same reason a post and a road
  // do not: what matters is whose it is to use, and only one side can use one.
  // So "theirs" is "the Wandering Folk's", and there is at most one of those.
  if (state.players[playerId]?.faction !== 'wandering') return [];
  const out: number[] = [];
  for (let i = 0; i < state.caravans.length; i++) {
    if (state.caravans[i] === 1) out.push(i);
  }
  return out;
}

/** Whether any Caravan of this player's can see that tile. */
export function withinAsking(state: GameState, playerId: number, x: number, y: number): boolean {
  for (const i of caravansOf(state, playerId)) {
    const cx = i % state.width;
    const cy = Math.floor(i / state.width);
    if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= CARAVANS.sight) return true;
  }
  return false;
}
