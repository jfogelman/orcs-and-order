import { fatCrossIndices, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';

/**
 * Garrison posts: somewhere for soldiers to stand that is not the city tile.
 *
 * Section 102, and section 101's unfinished business. A Posting was a building
 * inside the walls that wanted two soldiers standing in the city, and the game
 * is one unit to a tile, so two could never be there. Section 101 patched it by
 * counting the soldiers standing *around* the city, which works and is a patch
 * on the rule rather than a reason for it.
 *
 * This is the reason. A post is a thing on the map -- a hut with a spear leaning
 * on it -- built by a worker on a tile, like a road. A soldier standing on one
 * is standing somewhere on purpose, and the city it belongs to is calmer for it.
 * Two soldiers now have two places to stand, which is what the building always
 * meant and could never say.
 *
 * Deliberately like roads in every way that can be copied: built by the same
 * units, saved the same way, drawn over the terrain, and torn up by the same
 * pillaging rule. A post has no owner for the same reason a road has none --
 * what matters is who is standing on it.
 */
export const POSTS = {
  /** Whether posts can be built at all. A lever, so it measures as an arm. */
  enabled: true,
  /** Worker-turns to put one up, wherever it goes. */
  turns: 3,
  /** Content citizens a manned post is worth to the city whose land it is on. */
  contentBonus: 1,
  /**
   * Manned posts a city is paid for.
   *
   * Two, which is section 101's number: the Posting wanted two soldiers and
   * could not have them. Now it can, and each one needs its own hut.
   */
  maxPerCity: 2,
};

/** Whether there is a post on this tile. */
export function hasPost(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
  return state.posts?.[idx(x, y, state.width)] === 1;
}

/** Whether this unit could put up a post where it stands, and why not. */
export function canBuildPost(state: GameState, unit: Unit): { ok: boolean; reason?: string } {
  if (!POSTS.enabled) return { ok: false, reason: 'Nobody builds those.' };
  if (!unitType(unit.type).settler) return { ok: false, reason: 'Only workers build posts.' };
  const i = idx(unit.x, unit.y, state.width);
  if (TERRAIN[state.terrain[i]].water) return { ok: false, reason: 'Not on water.' };
  if (state.cities.some((c) => c.x === unit.x && c.y === unit.y)) {
    return { ok: false, reason: 'A city has its own walls.' };
  }
  if (state.posts?.[i] === 1) return { ok: false, reason: 'There is a post here already.' };
  return { ok: true };
}

/** Set a worker building. Returns whether it started. */
export function startPost(state: GameState, unit: Unit): boolean {
  if (!canBuildPost(state, unit).ok) return false;
  unit.order = 'post';
  unit.work = POSTS.turns;
  unit.goto = null;
  return true;
}

/**
 * One turn of building, at the top of the worker's turn.
 *
 * `stopped` when there is no longer a post to build here -- somebody else
 * finished it, or founded a city on the spot -- which frees the worker rather
 * than leaving it hammering at something that already exists.
 */
export function advancePostWork(state: GameState, unit: Unit): 'done' | 'working' | 'stopped' {
  if (!canBuildPost(state, unit).ok) {
    unit.order = 'none';
    delete unit.work;
    return 'stopped';
  }
  unit.work = (unit.work ?? POSTS.turns) - 1;
  if (unit.work > 0) return 'working';
  // Created with the first post rather than with the map, so a game nobody has
  // built in -- and every save from before posts existed -- carries nothing.
  state.posts ??= new Array(state.width * state.height).fill(0);
  state.posts[idx(unit.x, unit.y, state.width)] = 1;
  unit.order = 'none';
  delete unit.work;
  return 'done';
}

/**
 * Posts on this city's land with one of its own soldiers standing on them.
 *
 * The city's land is the same twenty-one tiles it works, which is the only
 * boundary the game has ever drawn around a city, and it keeps a post from
 * calming a city on the other side of the map. Settlers do not count, here or
 * anywhere else: a Peon standing in a guardhouse is a Peon hiding.
 */
export function mannedPosts(state: GameState, city: City): number {
  if (!POSTS.enabled || !state.posts) return 0;
  let manned = 0;
  for (const i of fatCrossIndices(city.x, city.y, state.width, state.height)) {
    if (state.posts[i] !== 1) continue;
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const held = state.units.some(
      (u) => u.x === x && u.y === y && u.owner === city.owner && !unitType(u.type).settler,
    );
    if (held) manned++;
  }
  return Math.min(manned, POSTS.maxPerCity);
}

/** Content citizens this city gets from the posts around it that are manned. */
export function postCalm(state: GameState, city: City): number {
  return mannedPosts(state, city) * POSTS.contentBonus;
}
