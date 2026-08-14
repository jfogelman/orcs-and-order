import { TERRAIN } from '../model/terrain';
import type { TechFlag } from '../model/techs';
import { TECHS_BY_ID } from '../model/techs';
import { unitType } from '../model/units';
import type { GameState, Player, TerrainId, Unit, UnitTypeId } from '../model/types';
import { idx } from '../engine/grid';

/**
 * Derived stats that depend on both a unit and what its owner has researched.
 * Kept in one place so combat, movement, fog and the UI all agree.
 */

export function knowsTech(player: Player, id: string): boolean {
  return player.techs.includes(id);
}

export function hasFlag(player: Player, flag: TechFlag): boolean {
  for (const id of player.techs) {
    const t = TECHS_BY_ID[id];
    if (t && t.flags.includes(flag)) return true;
  }
  return false;
}

/**
 * Movement points per turn. Groups of five or more lose one to internal
 * disagreement until their faction researches how to walk in a line.
 */
export function effectiveMove(player: Player, typeId: UnitTypeId): number {
  const t = unitType(typeId);
  if (t.crowded && !hasFlag(player, 'coordination')) {
    return Math.max(1, t.move - 1);
  }
  return t.move;
}

/** Sight radius, boosted by Mapmaking and by standing on high ground. */
export function effectiveSight(state: GameState, player: Player, unit: Unit): number {
  const t = unitType(unit.type);
  let sight = t.sight;
  if (hasFlag(player, 'mapmaking')) sight += 1;
  const terrain = state.terrain[idx(unit.x, unit.y, state.width)];
  if (terrain === 'hills' || terrain === 'mountains') sight += 1;
  return sight;
}

/** Movement points needed to enter a tile. Bridge Building tames the rough stuff. */
export function terrainMoveCost(player: Player, terrain: TerrainId): number {
  const def = TERRAIN[terrain];
  if (hasFlag(player, 'bridges') && (terrain === 'forest' || terrain === 'swamp')) return 1;
  return def.moveCost;
}

/** Can a land unit stand on this terrain at all? */
export function canOccupy(typeId: UnitTypeId, terrain: TerrainId): boolean {
  const t = unitType(typeId);
  if (t.flies) return true;
  return !TERRAIN[terrain].water;
}

/** City sight radius; Tower Building adds a ring. */
export function citySight(player: Player): number {
  return hasFlag(player, 'watchtower') ? 3 : 2;
}
