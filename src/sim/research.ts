import { BUILDINGS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
import { TECHS_BY_ID, techsForFaction } from '../model/techs';
import type { TechDef } from '../model/techs';
import { unitType, UNIT_TYPES } from '../model/units';
import type { UnitTypeDef } from '../model/units';
import type { GameState, Player, TechId, TradeRates } from '../model/types';
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
/**
 * How much dearer each advance gets for every one already held.
 *
 * Kept gentle on purpose. At 6% the top of the counting ladder cost over 400
 * beakers and no game ever reached Ten Orcs, which rather defeats the object of
 * the exercise. It is the lever on how *deep* a game gets rather than how fast
 * it starts, since it compounds: at 3.5% a side holding twenty advances pays
 * 1.7 times list for the next one.
 */
export const TECH_ESCALATION = 0.035;

export function techCost(player: Player, t: TechDef): number {
  const known = Math.max(0, player.techs.length - 1);
  return Math.round(t.cost * (1 + known * TECH_ESCALATION));
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
  // Nobody's next project is chosen here.
  //
  // This used to call autoPickResearch for AI players, which picks the
  // cheapest available advance. Because the economy runs at the start of a
  // player's turn and the AI chooses its research later in that same turn,
  // the cheapest pick always got there first and the AI's techPriority list
  // was never consulted once -- both factions researched cheapest-first for
  // the whole of the game's life. The AI now decides in `chooseResearch`, and
  // a human is asked; beakers bank up either way, so the delay costs nothing.
  if (!player.researching) {
    player.beakers += amount;
    return { completed: null };
  }

  player.beakers += amount;
  const def = TECHS_BY_ID[player.researching];
  const cost = techCost(player, def);
  if (player.beakers < cost) return { completed: null };

  player.beakers -= cost;
  player.techs.push(def.id);
  player.researching = null;
  log(state, `${def.name} discovered.`, 'research', player.id, 'discovery');
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

  return { completed: def };
}

/** Split a turn's trade between the treasury and the laboratories. */
/** Twelfths, so an even three-way split is a whole number each. */
export const TRADE_STEPS = 12;

/** What an empire starts on: evenly divided, and moved off it on purpose. */
export const EVEN_RATES: TradeRates = {
  coin: TRADE_STEPS / 3,
  beakers: TRADE_STEPS / 3,
  calm: TRADE_STEPS / 3,
};

/**
 * How this empire divides its trade, defaulting for saves written before the
 * setting existed. An old `taxRate` is honoured on the way past, so a game in
 * progress keeps the balance it had rather than silently being reset.
 */
export function tradeRates(player: Player): TradeRates {
  if (player.rates) return player.rates;
  if (player.taxRate !== undefined) {
    const coin = Math.round((player.taxRate / 10) * TRADE_STEPS);
    return { coin, beakers: TRADE_STEPS - coin, calm: 0 };
  }
  return EVEN_RATES;
}

/**
 * Divide a city's trade three ways.
 *
 * Rounded so the parts always add back up to the whole: gold and beakers are
 * rounded and luxury takes the remainder, rather than each being rounded on its
 * own and the total quietly gaining or losing a point.
 */
export function splitTrade(
  player: Player,
  trade: number,
): { gold: number; beakers: number; luxury: number } {
  const rates = tradeRates(player);
  const gold = Math.round((trade * rates.coin) / TRADE_STEPS);
  const beakers = Math.round((trade * rates.beakers) / TRADE_STEPS);
  return { gold, beakers, luxury: Math.max(0, trade - gold - beakers) };
}
