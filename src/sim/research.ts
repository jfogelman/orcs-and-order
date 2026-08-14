import { BUILDINGS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
import { TECHS_BY_ID, techsForFaction } from '../model/techs';
import type { TechDef } from '../model/techs';
import { unitType, UNIT_TYPES } from '../model/units';
import type { UnitTypeDef } from '../model/units';
import type { GameState, Player, TechId } from '../model/types';
import { log } from './gamestate';

/**
 * Research: what a player knows, what they can learn next, and what that
 * unlocks. The tech graph itself lives in `model/techs.ts`; this file only
 * walks it.
 */

export function knowsTech(player: Player, id: TechId): boolean {
  return player.techs.includes(id);
}

/** Advances whose prerequisites are all met and which are not yet known. */
export function researchableTechs(player: Player): TechDef[] {
  return techsForFaction(player.faction).filter(
    (t) => !knowsTech(player, t.id) && t.prereqs.every((p) => knowsTech(player, p)),
  );
}

/** Every unit type this player may currently build. */
export function unlockedUnits(player: Player): UnitTypeDef[] {
  const ids = new Set<string>();
  for (const id of player.techs) {
    const t = TECHS_BY_ID[id];
    if (!t) continue;
    for (const u of t.units) ids.add(u);
  }
  return [...ids]
    .filter((id) => UNIT_TYPES[id] !== undefined)
    .map((id) => unitType(id))
    .filter((u) => u.faction === player.faction)
    .sort((a, b) => a.cost - b.cost);
}

export function unlockedBuildings(player: Player): BuildingDef[] {
  const ids = new Set<string>();
  for (const id of player.techs) {
    const t = TECHS_BY_ID[id];
    if (!t) continue;
    for (const b of t.buildings) ids.add(b);
  }
  return [...ids]
    .map((id) => BUILDINGS[id])
    .filter((b): b is BuildingDef => b !== undefined)
    .filter((b) => b.faction === 'both' || b.faction === player.faction);
}

/**
 * Research gets more expensive as an empire accumulates advances, so the
 * last rungs of the counting ladder stay a real commitment.
 */
export function techCost(player: Player, t: TechDef): number {
  const known = Math.max(0, player.techs.length - 1);
  // Kept gentle on purpose. At 6% per known advance the top of the counting
  // ladder cost over 400 beakers and no game ever reached Ten Orcs, which
  // rather defeats the object of the exercise.
  return Math.round(t.cost * (1 + known * 0.035));
}

export function setResearch(state: GameState, player: Player, id: TechId | null): void {
  if (id !== null && !researchableTechs(player).some((t) => t.id === id)) return;
  // Switching targets loses the partial work, which discourages dithering.
  if (player.researching !== id) player.beakers = 0;
  player.researching = id;
  if (id) {
    log(state, `Research begins: ${TECHS_BY_ID[id].name}.`, 'research', player.id);
  }
}

/** Pick something sensible when a player has no current project. */
export function autoPickResearch(state: GameState, player: Player): void {
  if (player.researching) return;
  const options = researchableTechs(player);
  if (options.length === 0) return;
  const cheapest = options.reduce((a, b) => (techCost(player, a) <= techCost(player, b) ? a : b));
  setResearch(state, player, cheapest.id);
}

export interface ResearchEvent {
  completed: TechDef | null;
}

export function addBeakers(state: GameState, player: Player, amount: number): ResearchEvent {
  autoPickResearch(state, player);
  if (!player.researching) return { completed: null };

  player.beakers += amount;
  const def = TECHS_BY_ID[player.researching];
  const cost = techCost(player, def);
  if (player.beakers < cost) return { completed: null };

  player.beakers -= cost;
  player.techs.push(def.id);
  player.researching = null;
  log(state, `${def.name} discovered.`, 'research', player.id);
  log(state, def.flavor, 'info', player.id);

  const newUnits = def.units.filter((u) => UNIT_TYPES[u] !== undefined).map((u) => unitType(u).name);
  if (newUnits.length > 0) {
    log(state, `Now available: ${newUnits.join(', ')}.`, 'good', player.id);
  }
  const newBuildings = def.buildings
    .map((b) => BUILDINGS[b])
    .filter((b): b is BuildingDef => b !== undefined)
    .filter((b) => b.faction === 'both' || b.faction === player.faction)
    .map((b) => b.name);
  if (newBuildings.length > 0) {
    log(state, `Now buildable: ${newBuildings.join(', ')}.`, 'good', player.id);
  }

  autoPickResearch(state, player);
  return { completed: def };
}

/** Split a turn's trade between the treasury and the laboratories. */
export function splitTrade(player: Player, trade: number): { gold: number; beakers: number } {
  const gold = Math.round((trade * player.taxRate) / 10);
  return { gold, beakers: trade - gold };
}
