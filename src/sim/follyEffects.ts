import { fatCrossIndices, idx } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';

/**
 * Section 111: what the follies do, asked from wherever it matters.
 *
 * Kept apart from `follies.ts`, which announces and races and tears things down,
 * because the questions here are asked by `rules.ts` and `combat.ts` -- and
 * `rules.ts` is imported by `gamestate`, so anything it imports must not import
 * `gamestate` back. Everything here reads `state.cities` directly for that reason.
 */
export const FOLLIES = {
  /**
   * Whether the follies exist at all. Off, none is offered, The Argument With The
   * Sky is not researchable, and any standing in a save do nothing: the game from
   * before section 111, for a sweep's control arm.
   */
  enabled: true,
};

/** Whether a building is one of section 111's follies. */
export function isFolly(b: BuildingDef | undefined): boolean {
  return !!b?.folly;
}

/** Every folly standing in this empire's cities, while follies are switched on. */
export function heldFollies(state: GameState, playerId: number): BuildingDef[] {
  if (!FOLLIES.enabled) return [];
  const out: BuildingDef[] = [];
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    for (const id of c.buildings) {
      const b = BUILDINGS[id];
      if (b?.folly) out.push(b);
    }
  }
  return out;
}

/** An empire-wide folly bonus: the sum over every folly this empire holds. */
export function empireBonus(
  state: GameState,
  playerId: number,
  pick: (b: BuildingDef) => number | undefined,
): number {
  return heldFollies(state, playerId).reduce((n, b) => n + (pick(b) ?? 0), 0);
}

/** A city folly bonus: the sum over the follies standing in this one city. */
export function cityFollyBonus(city: City, pick: (b: BuildingDef) => number | undefined): number {
  if (!FOLLIES.enabled) return 0;
  return city.buildings.reduce((n, id) => {
    const b = BUILDINGS[id];
    return b?.folly ? n + (pick(b) ?? 0) : n;
  }, 0);
}

/** Whether a city's own sight ignores terrain, because of a folly standing in it. */
export function citySightUnblocked(city: City): boolean {
  return FOLLIES.enabled && city.buildings.some((id) => BUILDINGS[id]?.folly && BUILDINGS[id].sightUnblocked);
}

/**
 * The creatures that ride something. Nothing in the unit table said so, and the
 * Long Vigil is the first rule that needs to know.
 */
export const MOUNTED = new Set(['outrider', 'knight', 'paladin']);

export function isMounted(unit: Unit): boolean {
  return MOUNTED.has(unitType(unit.type).base);
}

/**
 * Whether a tile is this empire's own land: a city of its own, or a tile any of
 * its cities could work. There was no notion of territory before the Long March
 * needed one, and the fat cross is the land a city already calls its own.
 */
export function onOwnLand(state: GameState, playerId: number, x: number, y: number): boolean {
  const here = idx(x, y, state.width);
  return state.cities.some(
    (c) =>
      c.owner === playerId &&
      ((c.x === x && c.y === y) || fatCrossIndices(c.x, c.y, state.width, state.height).includes(here)),
  );
}
