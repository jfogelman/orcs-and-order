import { distance, fatCrossIndices, idx } from '../engine/grid';
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

/** Extra share of this city's gold income from its buildings. */
export function cityGoldBonus(state: GameState, city: City): number {
  return sumBonus(state, city, (b) => b.goldBonus);
}

/** Extra share of this city's research output from its buildings. */
export function cityScienceBonus(state: GameState, city: City): number {
  return sumBonus(state, city, (b) => b.scienceBonus);
}

/** Is anybody actually standing in this city? Settlers do not count as cover. */
export function isGarrisoned(state: GameState, city: City): boolean {
  return state.units.some(
    (u) => u.owner === city.owner && u.x === city.x && u.y === city.y && !unitType(u.type).settler,
  );
}

/**
 * Add up one kind of bonus across a city's buildings, skipping any that wants
 * a garrison and has not got one.
 */
function sumBonus(
  state: GameState,
  city: City,
  pick: (b: BuildingDef) => number | undefined,
): number {
  let garrisoned: boolean | null = null;
  let total = 0;
  for (const id of city.buildings) {
    const def = BUILDINGS[id];
    const value = def ? pick(def) : undefined;
    if (!def || !value) continue;
    if (def.needsGarrison) {
      // Worked out at most once per city, not once per building.
      garrisoned ??= isGarrisoned(state, city);
      if (!garrisoned) continue;
    }
    total += value;
  }
  return total;
}

/**
 * Defence a city puts up with nobody garrisoning it.
 *
 * Cities were being taken by walking into them: measured over four games, 228
 * of 237 changes of hands were into a city with nobody standing in it. That
 * made every defensive rule in the game -- walls, terrain, fortification,
 * veterancy -- a bonus applied to a defender who was not there, and turned the
 * war into a see-saw of unattended towns.
 *
 * So the citizens do something. Not much, and not enough to hold off an army,
 * but enough that a lone goblin cannot annex a city of eight people by walking
 * up to it. Scales with size, because that is what there is more of.
 */
export function militiaStrength(city: City): number {
  return city.size * MILITIA.perCitizen;
}

/**
 * Defence contributed by each citizen of an ungarrisoned city.
 *
 * Swept over eighteen seeds at 0, 0.3, 0.6 and 1.0. A light toll does the most
 * good: it takes a captured city's median tenure from 21 turns to 37 and drops
 * changes of hands from 45.8 a game to 37.1, and the heavier settings achieve
 * less of both while costing the same.
 *
 * It is *not* free. All three non-zero settings land on 5-13 against 8-10 with
 * no toll -- making cities sticky helps whoever already holds more of them,
 * which is the Kingdom. Kept anyway: a game where 96% of cities are taken by
 * walking into them unopposed is a worse game than one that is three wins out
 * of eighteen off level, and the balance is better attacked somewhere that is
 * not defensive.
 *
 * Held in an object rather than as a bare constant so a measurement can sweep
 * it without editing this file; 0 restores the old behaviour exactly.
 */
export const MILITIA = { perCitizen: 0.3 };

/**
 * Supply.
 *
 * A unit within `range` tiles of somewhere that supplies an army fights and
 * heals normally. Beyond that it attacks weakly and does not heal at all --
 * the Horde in particular has a long history of setting off without deciding
 * who is carrying the food.
 *
 * What supplies an army is deliberately *not* "any city you own". That would
 * scale with how many cities you have, and the side with more cities would get
 * a denser network as a reward for already being ahead -- the same trap that
 * caught rush-buying, unit-driven buildings and the militia.
 *
 * Instead: **your capital, and any city where you have built an outpost.**
 * Every player has exactly one capital, so the base network is identical
 * whatever the size of the empire, and extending it costs shields in a
 * building that a sacking destroys. Conquest does not feed itself for free.
 */
export const SUPPLY = {
  /** Tiles from a supplying city. Anything at or beyond 99 turns it off. */
  range: 4,
  /** Attack multiplier when supply has run out entirely. */
  attackPenalty: 0.6,
  /**
   * How far supply can jump from one post to the next along the chain.
   *
   * Wider than `range`, because a supply line runs between places rather than
   * to a unit standing in a field -- outposts a little too far apart to cover
   * the same ground can still hand things along.
   */
  linkRange: 7,
};

/**
 * Shields an outpost costs, per tile of distance from the capital.
 *
 * A depot on the doorstep is cheap and one at the far end of the map is not,
 * which is both the obvious logistics of the thing and what stops a player
 * simply papering the map with them.
 */
export const OUTPOST_DISTANCE_COST = 6;

/** What this city would charge to build the given thing. */
export function productionCostIn(state: GameState, city: City, item: ProductionItem): number {
  const base = productionCost(item);
  if (item.kind !== 'building' || !BUILDINGS[item.id]?.suppliesArmy) return base;
  const seat = capitalOf(state, city.owner);
  if (!seat) return base;
  return base + Math.round(distance(seat.x, seat.y, city.x, city.y) * OUTPOST_DISTANCE_COST);
}

/**
 * The seat of a player's power: the oldest city they still hold.
 *
 * Derived rather than stored, so it needs no save migration and cannot go
 * stale. Losing your capital promotes the next oldest, which is the right
 * behaviour anyway -- the front collapses toward whatever you have left.
 */
export function capitalOf(state: GameState, playerId: number): City | null {
  let best: City | null = null;
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    if (!best || c.foundedTurn < best.foundedTurn || (c.foundedTurn === best.foundedTurn && c.id < best.id)) {
      best = c;
    }
  }
  return best;
}

/** Does this city feed an army standing near it? */
export function suppliesArmy(state: GameState, city: City): boolean {
  if (city.buildings.some((b) => BUILDINGS[b]?.suppliesArmy)) return true;
  return capitalOf(state, city.owner)?.id === city.id;
}

/**
 * The chain of places a player can actually get supplies to, and how far along
 * the chain each one sits.
 *
 * Supply starts at the capital and walks outward: an outpost within `range` of
 * somewhere already supplied joins the chain, and one stranded beyond that
 * reach does not, however much was spent on it. Returns each supplying city's
 * distance in hops from the capital -- zero for the capital itself.
 *
 * This is what makes a run of outposts worth more than a single distant one.
 * A chain laid out across the map carries supply the whole way; a lone depot
 * planted deep in somebody else's country carries nothing, because there is
 * nothing behind it.
 */
export function supplyChain(state: GameState, playerId: number): Map<number, number> {
  const hops = new Map<number, number>();
  const seat = capitalOf(state, playerId);
  if (!seat) return hops;

  const posts = state.cities.filter(
    (c) => c.owner === playerId && c.buildings.some((b) => BUILDINGS[b]?.suppliesArmy),
  );
  hops.set(seat.id, 0);
  const frontier: City[] = [seat];
  while (frontier.length > 0) {
    const here = frontier.shift()!;
    const depth = hops.get(here.id)!;
    for (const post of posts) {
      if (hops.has(post.id)) continue;
      if (distance(here.x, here.y, post.x, post.y) > SUPPLY.linkRange) continue;
      hops.set(post.id, depth + 1);
      frontier.push(post);
    }
  }
  return hops;
}

/**
 * How well supplied a unit is, from 0 (nothing at all) to 1 (fully).
 *
 * Falls away with distance rather than stopping at a cliff edge, so an army
 * a step past the line is slightly worse off rather than suddenly useless.
 */
export function supplyQuality(state: GameState, unit: Unit): number {
  if (SUPPLY.range >= 99) return 1;
  const chain = supplyChain(state, unit.owner);
  if (chain.size === 0) return 0;

  let best = 0;
  for (const c of state.cities) {
    if (c.owner !== unit.owner || !chain.has(c.id)) continue;
    const d = distance(c.x, c.y, unit.x, unit.y);
    if (d <= SUPPLY.range) return 1;
    // Beyond the ring, thinning out over the same distance again before it
    // runs out entirely.
    const fade = 1 - (d - SUPPLY.range) / SUPPLY.range;
    best = Math.max(best, fade);
  }
  return Math.max(0, best);
}

export function inSupply(state: GameState, unit: Unit): boolean {
  return supplyQuality(state, unit) >= 1;
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

/**
 * Gold to finish what a city is building, right now.
 *
 * Superlinear in what is left to do, so buying a nearly-finished thing is
 * cheap and buying something from nothing is punishing. Starting from an empty
 * shield box costs double on top of that, which stops gold from replacing
 * production outright -- it should shorten a wait, not remove the need to have
 * a city worth building in.
 *
 * Returns 0 for anything that cannot be bought.
 */
export function rushCost(state: GameState, city: City): number {
  const item = city.producing;
  if (item.kind === 'coin') return 0;
  const remaining = productionCostIn(state, city, item) - city.shields;
  if (remaining <= 0) return 0;
  const base = 2 * remaining + (remaining * remaining) / 20;
  return Math.ceil(city.shields === 0 ? base * 2 : base);
}

/** Why this city cannot be rushed, or null if it can. */
export function rushBlocked(state: GameState, city: City): string | null {
  if (city.producing.kind === 'coin') return 'This city is not building anything.';
  const cost = rushCost(state, city);
  if (cost <= 0) return 'This is already paid for.';
  if (state.players[city.owner].gold < cost) return `Needs ${cost} gold.`;
  return null;
}

/**
 * Pay to fill the shield box. The thing itself appears on the next turn, the
 * same as if the shields had been earned, so nothing else has to know that
 * gold was involved.
 */
export function rushBuy(state: GameState, city: City): boolean {
  if (rushBlocked(state, city) !== null) return false;
  const cost = rushCost(state, city);
  state.players[city.owner].gold -= cost;
  city.shields = productionCostIn(state, city, city.producing);
  log(
    state,
    `${city.name} pays ${cost} gold to have ${productionName(city.producing)} finished at once.`,
    'good',
    city.owner,
    'coin',
  );
  return true;
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
  // A city in disorder does not grow. Without this it keeps right on growing
  // while producing no shields and no trade, so every empire drifts into a
  // sprawl of large permanently-rioting cities that contribute nothing but
  // population -- which then dominates the score. It can still starve, since
  // disorder should not conjure food either.
  const raw = yields.food - city.size * FOOD_PER_CITIZEN;
  const surplus = city.disorder ? Math.min(0, raw) : raw;
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
    const cost = productionCostIn(state, city, item);
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

  log(state, `${city.name} is founded.`, 'good', city.owner, 'city-founded');
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
