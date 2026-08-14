import { fatCrossIndices, idx } from '../engine/grid';
import { BUILDINGS, buildingsForFaction } from '../model/buildings';
import { TERRAIN } from '../model/terrain';
import { unitType, UNIT_TYPES } from '../model/units';
import type { UnitTypeDef } from '../model/units';
import type { BuildingDef } from '../model/buildings';
import type { City, GameState, ProductionItem, Unit } from '../model/types';
import { cityAt, log, nextCityName, recomputeVisibility, spawnUnit, unitAt } from './gamestate';
import { unlockedBuildings, unlockedUnits } from './research';

/**
 * Cities: yields, growth, and production.
 *
 * Citizens are assigned to tiles automatically each turn by simple greedy
 * scoring. Manual tile assignment is the kind of thing that doubles the UI and
 * changes very few games, so it is left out of the first version.
 */

export interface Yield {
  food: number;
  shields: number;
  trade: number;
}

/** Citizens beyond this go unhappy without help. */
export const BASE_CONTENT = 5;
/** Food eaten per citizen per turn. */
export const FOOD_PER_CITIZEN = 2;

export function foodToGrow(size: number): number {
  return (size + 1) * 8;
}

export function tileYield(state: GameState, index: number, isCenter: boolean): Yield {
  const def = TERRAIN[state.terrain[index]];
  const special = state.specials[index] && def.special ? def.special : null;
  const y: Yield = {
    food: special ? special.food : def.food,
    shields: special ? special.shields : def.shields,
    trade: special ? special.trade : def.trade,
  };
  if (isCenter) {
    // The city itself is always worth working, whatever it was built on.
    y.food = Math.max(y.food, 1);
    y.shields = Math.max(y.shields, 1);
    y.trade = Math.max(y.trade, 1);
  }
  return y;
}

function tileScore(y: Yield): number {
  return y.food * 3 + y.shields * 2 + y.trade;
}

/**
 * Greedily assign citizens to the best free tiles in the fat cross.
 * Tiles claimed by another city, or standing under an enemy unit, are skipped.
 */
export function assignWorkers(state: GameState, city: City): void {
  const center = idx(city.x, city.y, state.width);
  const claimed = new Set<number>();
  for (const other of state.cities) {
    if (other.id === city.id) continue;
    claimed.add(idx(other.x, other.y, state.width));
    for (const t of other.workedTiles) claimed.add(t);
  }

  const candidates: Array<{ index: number; score: number }> = [];
  for (const i of fatCrossIndices(city.x, city.y, state.width, state.height)) {
    if (i === center || claimed.has(i)) continue;
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const blocker = unitAt(state, x, y);
    if (blocker && blocker.owner !== city.owner) continue;
    candidates.push({ index: i, score: tileScore(tileYield(state, i, false)) });
  }
  candidates.sort((a, b) => b.score - a.score);
  city.workedTiles = candidates.slice(0, city.size).map((c) => c.index);
}

export function cityYield(state: GameState, city: City): Yield {
  const total: Yield = { food: 0, shields: 0, trade: 0 };
  const center = tileYield(state, idx(city.x, city.y, state.width), true);
  total.food += center.food;
  total.shields += center.shields;
  total.trade += center.trade;
  for (const i of city.workedTiles) {
    const y = tileYield(state, i, false);
    total.food += y.food;
    total.shields += y.shields;
    total.trade += y.trade;
  }
  if (city.disorder) return { food: total.food, shields: 0, trade: 0 };
  return total;
}

export function contentLimit(state: GameState, city: City): number {
  const owner = state.players[city.owner];
  let limit = BASE_CONTENT;
  for (const b of city.buildings) limit += BUILDINGS[b]?.contentBonus ?? 0;
  if (owner.techs.some((t) => t === 'happiness')) limit += 1;
  return limit;
}

export function foodSurplus(state: GameState, city: City): number {
  return cityYield(state, city).food - city.size * FOOD_PER_CITIZEN;
}

export function buildingUpkeep(city: City): number {
  return city.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.upkeep ?? 0), 0);
}

/** Units a city supports for free before shields start going to rations. */
export function freeSupport(city: City): number {
  return Math.max(2, city.size);
}

/**
 * Shields per turn spent feeding this city's units.
 *
 * Without this, a city with a decent shield yield simply produces soldiers
 * forever and the map fills up. Charging shields (rather than gold) keeps the
 * pressure local and avoids a bankruptcy death spiral.
 */
export function unitUpkeep(state: GameState, city: City): number {
  const supported = state.units.filter((u) => u.homeCity === city.id).length;
  return Math.max(0, supported - freeSupport(city));
}

// ------------------------------------------------------------- production

export function productionCost(item: ProductionItem): number {
  if (item.kind === 'unit') return unitType(item.id).cost;
  if (item.kind === 'building') return BUILDINGS[item.id].cost;
  return 0;
}

export function productionName(item: ProductionItem): string {
  if (item.kind === 'unit') return unitType(item.id).name;
  if (item.kind === 'building') return BUILDINGS[item.id].name;
  return 'Coin';
}

/** Everything this city could start building right now. */
export function buildOptions(
  state: GameState,
  city: City,
): { units: UnitTypeDef[]; buildings: BuildingDef[] } {
  const owner = state.players[city.owner];
  const units = unlockedUnits(owner);
  const already = new Set(city.buildings);
  const buildings = unlockedBuildings(owner)
    .filter((b) => !already.has(b.id))
    .filter((b) => buildingsForFaction(owner.faction).some((f) => f.id === b.id));
  return { units, buildings };
}

/**
 * A free tile for a freshly built unit: the city itself, else the nearest
 * open ground. One unit to a tile means a busy city can ring itself with its
 * own army, so the search reaches beyond the immediate neighbours before
 * giving up and stalling production.
 */
const PLACEMENT_RADIUS = 3;

function placementFor(state: GameState, city: City): [number, number] | null {
  if (!unitAt(state, city.x, city.y)) return [city.x, city.y];
  for (let r = 1; r <= PLACEMENT_RADIUS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = city.x + dx;
        const y = city.y + dy;
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
        if (!unitAt(state, x, y)) return [x, y];
      }
    }
  }
  return null;
}

export interface CityTurnEvents {
  grew: boolean;
  starved: boolean;
  completed: string | null;
  blocked: boolean;
  enteredDisorder: boolean;
}

export function processCity(state: GameState, city: City): CityTurnEvents {
  const events: CityTurnEvents = {
    grew: false,
    starved: false,
    completed: null,
    blocked: false,
    enteredDisorder: false,
  };
  const owner = state.players[city.owner];

  assignWorkers(state, city);
  const wasDisorder = city.disorder;
  city.disorder = city.size > contentLimit(state, city);
  if (city.disorder && !wasDisorder) events.enteredDisorder = true;

  const yields = cityYield(state, city);

  // --- food ------------------------------------------------------------
  const surplus = yields.food - city.size * FOOD_PER_CITIZEN;
  city.food += surplus;
  if (city.food < 0) {
    city.food = 0;
    if (city.size > 1) {
      city.size -= 1;
      events.starved = true;
    }
  } else if (city.food >= foodToGrow(city.size)) {
    const granary = city.buildings.includes('granary');
    const kept = granary ? Math.floor(foodToGrow(city.size) * (BUILDINGS.granary.foodKept ?? 0)) : 0;
    city.size += 1;
    city.food = kept;
    events.grew = true;
    assignWorkers(state, city);
  }

  // --- shields ---------------------------------------------------------
  const net = yields.shields - unitUpkeep(state, city);
  city.shields = Math.max(0, city.shields + net);
  const item = city.producing;
  if (item.kind === 'coin') {
    owner.gold += Math.max(0, net);
    city.shields = 0;
  } else {
    const cost = productionCost(item);
    if (city.shields >= cost) {
      if (item.kind === 'unit') {
        const spot = placementFor(state, city);
        if (!spot) {
          // Nowhere to put it; hold the shields until a tile frees up.
          events.blocked = true;
        } else {
          const veteran = city.buildings.includes('barracks');
          const unit: Unit = spawnUnit(state, city.owner, item.id, spot[0], spot[1], veteran);
          unit.homeCity = city.id;
          city.shields -= cost;
          events.completed = unitType(item.id).name;
          recomputeVisibility(state, city.owner);
        }
      } else {
        city.buildings.push(item.id);
        city.shields -= cost;
        events.completed = BUILDINGS[item.id].name;
        city.producing = { kind: 'coin' };
      }
    }
  }

  return events;
}

// ---------------------------------------------------------------- founding

export interface FoundCheck {
  ok: boolean;
  reason?: string;
}

export const MIN_CITY_SPACING = 3;

export function canFoundCity(state: GameState, unit: Unit, x: number, y: number): FoundCheck {
  if (!unitType(unit.type).settler) {
    return { ok: false, reason: `${unitType(unit.type).name} does not build cities.` };
  }
  const terrain = TERRAIN[state.terrain[idx(x, y, state.width)]];
  if (terrain.water) return { ok: false, reason: 'Cities do not float.' };
  if (terrain.noCity) return { ok: false, reason: `Nothing will grow on ${terrain.name}.` };
  if (cityAt(state, x, y)) return { ok: false, reason: 'There is already a city here.' };
  for (const c of state.cities) {
    if (Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < MIN_CITY_SPACING) {
      return { ok: false, reason: `Too close to ${c.name}.` };
    }
  }
  return { ok: true };
}

export function foundCity(state: GameState, unit: Unit): City | null {
  const check = canFoundCity(state, unit, unit.x, unit.y);
  if (!check.ok) return null;

  const city: City = {
    id: state.nextCityId++,
    owner: unit.owner,
    name: nextCityName(state, state.players[unit.owner].faction),
    x: unit.x,
    y: unit.y,
    size: 1,
    food: 0,
    shields: 0,
    buildings: [],
    producing: { kind: 'unit', id: state.players[unit.owner].faction === 'orc' ? 'goblin' : 'footman' },
    workedTiles: [],
    disorder: false,
    foundedTurn: state.turn,
  };
  state.cities.push(city);
  assignWorkers(state, city);

  // The settlers become the city.
  const i = state.units.indexOf(unit);
  if (i >= 0) state.units.splice(i, 1);

  log(state, `${city.name} is founded.`, 'good', city.owner);
  recomputeVisibility(state, city.owner);
  return city;
}

/** Default production for a newly captured or confused city. */
export function defaultProduction(state: GameState, city: City): ProductionItem {
  const options = buildOptions(state, city);
  const cheapest = options.units
    .filter((u) => u.attack > 0)
    .sort((a, b) => a.cost - b.cost)[0];
  return cheapest ? { kind: 'unit', id: cheapest.id } : { kind: 'coin' };
}

export const ALL_UNIT_DEFS = UNIT_TYPES;
