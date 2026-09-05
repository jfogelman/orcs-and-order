import { distance, fatCrossIndices, idx } from '../engine/grid';
import { BUILDINGS, buildingsForFaction } from '../model/buildings';
import { hasPerk } from '../model/perks';
import { TERRAIN } from '../model/terrain';
import { unitType, UNIT_TYPES } from '../model/units';
import { availableRaces } from '../model/citizens';
import type { UnitTypeDef } from '../model/units';
import type { BuildingDef } from '../model/buildings';
import type { City, GameState, ProductionItem, Unit, AutoBuild, Player } from '../model/types';
import { cityAt, log, nextCityName, recomputeVisibility, spawnUnit, unitAt, withRng } from './gamestate';
import { BEAKERS_PER_TRADE, TRADE_STEPS, splitTrade, tradeRates } from './research';
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

/**
 * How many citizens are content with nothing helping them.
 *
 * A mutable object rather than a bare number so a sweep can move it -- section
 * 59: emulate a control by moving a constant, never by stashing the source.
 *
 * Flat for both sides, which section 85 points out is not the neutral rule it
 * looks like: the side whose cities grow faster reaches the limit first, and
 * the Horde grows about a fifth faster on better ground. It riots on 16 to 18
 * per cent of its city-turns against the Kingdom's 10, and a rioting city
 * produces nothing at all.
 *
 * **Six, not five, and measured.** Section 86 swept this against the two other
 * ways of attacking the same loop, 432 games:
 *
 * | | tuned | held-out | orc wins /108 |
 * |---|---|---|---|
 * | five | 21-33 | 16-38 | 37 (34%) |
 * | **six** | **27-27** | **27-27** | **54 (50%)** |
 * | build the Totem earlier | 18-36 | 19-35 | 37 (34%) |
 * | buy calm earlier | 17-37 | 15-39 | 32 (30%) |
 *
 * Dead even on both seed sets independently, which no other lever came close
 * to. It reads as a Horde buff and is not one: the Kingdom's population barely
 * moves (47.4 to 47.8, 53.7 to 54.2) because it was never the side pressed
 * against the limit. Only the side that grows faster was, which is the whole
 * argument for the number not being flat at five.
 */
export const CALM = { base: 6 };

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
/**
 * Can a citizen be put on this tile at all?
 *
 * The centre is worked for free, somebody else's claim is not ours to take,
 * and an enemy standing on a tile stops it being farmed. Shared so that the
 * greedy assignment and the player's own picks agree about what is legal --
 * two answers to that question is how a hand-picked tile silently stops
 * working.
 */
export function tileWorkable(state: GameState, city: City, i: number): boolean {
  if (i === idx(city.x, city.y, state.width)) return false;
  const inRange = fatCrossIndices(city.x, city.y, state.width, state.height).includes(i);
  if (!inRange) return false;
  for (const other of state.cities) {
    if (other.id === city.id) continue;
    if (idx(other.x, other.y, state.width) === i) return false;
    if (other.workedTiles.includes(i)) return false;
  }
  const blocker = unitAt(state, i % state.width, Math.floor(i / state.width));
  return !(blocker && blocker.owner !== city.owner);
}

/**
 * Tiles the player chose that are still legal to work, in the order chosen.
 *
 * Section 16 asked for two things of a hand-picked tile: that growth does not
 * quietly reshuffle it, and that losing it falls back gracefully rather than
 * breaking. Both come out of filtering here rather than anywhere clever -- a
 * choice that cannot be honoured this turn is dropped for this turn and stays
 * on the list, because an enemy standing on your wheat field is usually
 * temporary and forgetting the choice would not be.
 */
export function honouredChoices(state: GameState, city: City): number[] {
  if (!city.chosenTiles?.length) return [];
  return city.chosenTiles.filter((i) => tileWorkable(state, city, i)).slice(0, city.size);
}

/**
 * Put a citizen on a tile, or take one off it.
 *
 * Returns whether anything changed, so the interface can decline quietly
 * rather than pretending a click on somebody else's wheat did something.
 *
 * Choosing more tiles than there are citizens drops the oldest choice rather
 * than refusing. Refusing would mean a player at full assignment has to work
 * out which tile to release before they can pick a new one, which is a puzzle
 * about the interface rather than about the city.
 */
export function toggleChosenTile(state: GameState, city: City, i: number): boolean {
  const chosen = city.chosenTiles ?? [];
  const at = chosen.indexOf(i);
  if (at >= 0) {
    city.chosenTiles = chosen.filter((t) => t !== i);
    assignWorkers(state, city);
    return true;
  }
  if (!tileWorkable(state, city, i)) return false;
  const next = [...chosen, i];
  while (next.length > city.size) next.shift();
  city.chosenTiles = next;
  assignWorkers(state, city);
  return true;
}

/** Hand the whole thing back to the greedy assignment. */
export function clearChosenTiles(state: GameState, city: City): void {
  delete city.chosenTiles;
  assignWorkers(state, city);
}

export function assignWorkers(state: GameState, city: City): void {
  // The player's picks first, in the order they picked them, then the greedy
  // fill for whatever is left over.
  const chosen = honouredChoices(state, city);
  const taken = new Set(chosen);

  const candidates: Array<{ index: number; score: number }> = [];
  for (const i of fatCrossIndices(city.x, city.y, state.width, state.height)) {
    if (taken.has(i) || !tileWorkable(state, city, i)) continue;
    candidates.push({ index: i, score: tileScore(tileYield(state, i, false)) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const filler = candidates.slice(0, Math.max(0, city.size - chosen.length));
  city.workedTiles = [...chosen, ...filler.map((c) => c.index)];
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
  if (city.disorder) {
    // A rioting city downs tools -- except on the one thing everybody in it
    // agrees about, which is whatever will calm the place down.
    //
    // Without this exception disorder is a trap rather than a setback: no
    // shields means the calming building can never be finished, growth is
    // capped at zero in the same breath so the city cannot shrink out either,
    // and the only escape is an empire-wide advance arriving for other
    // reasons. Measured at a third of all Horde city-turns and a fifth of the
    // Kingdom's, which is most of the gap between them -- see section 20.
    //
    // Deliberately narrow. Units, walls, treasuries and the rest still stop
    // dead, and trade is still nothing, so a riot is no cheaper than it was.
    // The city can work on its own way out and on nothing else.
    const canWorkItsWayOut = DISORDER.canBuildItsWayOut && calmingBuild(city);
    return { food: total.food, shields: canWorkItsWayOut ? total.shields : 0, trade: 0 };
  }
  return total;
}

/**
 * Whether a rioting city may work on its own way out.
 *
 * A mutable object in the style of MILITIA, SUPPLY and RESETTLE, so the arm
 * without the section 21 fix can be run without editing the rule -- see section
 * 59 on why a control is emulated rather than stashed.
 */
export const DISORDER = { canBuildItsWayOut: true };

/** True when this city is building something that would raise its own limit. */
export function calmingBuild(city: City): boolean {
  const item = city.producing;
  return item.kind === 'building' && (BUILDINGS[item.id]?.contentBonus ?? 0) > 0;
}

/**
 * How placated a city is while it spends its whole production on placating.
 *
 * Worth more than a Totem, because it costs everything the city makes rather
 * than being built once and then forgotten. That is what keeps the buildings
 * worth having: they are permanent and leave the city free to do something
 * else, where this is neither.
 */
export const CALM_BONUS = 3;

/** Trade per extra content citizen, when an empire spends on keeping calm. */
export const LUXURY_PER_CONTENT = 2;

/**
 * Trade the tiles here produce, before a riot stops anyone collecting it.
 *
 * Deliberately not `cityYield().trade`, which is zero during disorder -- money
 * spent on keeping people calm has to work on the city that is actually
 * rioting, or the setting would be useless at the only moment it is wanted.
 * A city in a riot is not collecting this; the empire is spending on it anyway,
 * which is what buying your way out of a riot means.
 */
export function baseTrade(state: GameState, city: City): number {
  let trade = tileYield(state, idx(city.x, city.y, state.width), true).trade;
  for (const i of city.workedTiles) trade += tileYield(state, i, false).trade;
  return trade;
}

export function contentLimit(state: GameState, city: City): number {
  const owner = state.players[city.owner];
  let limit = CALM.base;
  for (const b of workingBuildings(state, city)) limit += BUILDINGS[b]?.contentBonus ?? 0;
  if (owner.techs.some((t) => t === 'happiness')) limit += 1;
  if (city.producing.kind === 'calm') limit += CALM_BONUS;
  // What the empire spends on keeping this particular city calm.
  const rates = tradeRates(owner);
  limit += Math.floor(
    (baseTrade(state, city) * rates.calm) / (TRADE_STEPS * LUXURY_PER_CONTENT),
  );
  return limit;
}

export function foodSurplus(state: GameState, city: City): number {
  return cityYield(state, city).food - city.size * FOOD_PER_CITIZEN;
}

/**
 * What one city hands its owner in a turn, after the buildings that multiply it.
 *
 * Extracted so the turn and the empire report cannot drift apart. They were
 * written twice and briefly disagreed by construction: two copies of a formula
 * that includes two separate percentage bonuses is a defect waiting for
 * somebody to change one of them.
 *
 * Pure, and reads the city as it stands. The turn calls it at a particular
 * moment -- after the city has grown and re-assigned its workers -- and that
 * timing stays the turn's business, not this function's.
 */
export function cityIncome(
  state: GameState,
  city: City,
  player: Player,
): { gold: number; beakers: number } {
  const split = splitTrade(player, cityYield(state, city).trade);
  return {
    gold: Math.round(split.gold * (1 + cityGoldBonus(state, city))),
    beakers: Math.round(
      split.beakers * BEAKERS_PER_TRADE.multiplier * (1 + cityScienceBonus(state, city)),
    ),
  };
}

/**
 * Gold per turn to keep this city's buildings standing.
 *
 * A building shut for resettlement costs nothing, because there is nobody in it
 * to pay. Charging for one that is doing nothing would be a third penalty on
 * the same event, on top of the wait and the shut door.
 */
export function buildingUpkeep(state: GameState, city: City): number {
  return workingBuildings(state, city).reduce((sum, b) => sum + (BUILDINGS[b]?.upkeep ?? 0), 0);
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
  for (const id of workingBuildings(state, city)) {
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
/**
 * What it takes to send settlers out.
 *
 * A mutable object rather than bare consts so a sweep can run a control arm
 * without editing the rules, in the same style as MILITIA and SUPPLY below.
 * Expansion is the dominant term in every measurement in DESIGN_QUEUE, so these
 * are the switches most worth being able to turn off.
 *
 * `costsCitizen` was the first attempt and is off after measuring: it braked
 * expansion no more reliably than nothing at all, and cost the Horde about half
 * its wins across two seed sets. A charge denominated in citizens is regressive
 * against whoever builds small cities, and Horde cities are roughly half the
 * size of Kingdom ones. See section 17.
 *
 * `minCitySize` is the replacement, and is set to the smallest value that does
 * the job. Three was measured and brakes expansion properly -- more reliably
 * than the charge ever did -- but it cost the Horde exactly as many wins,
 * because a threshold in citizens takes a small city longer to reach and Horde
 * cities are half the size of Kingdom ones. Both attempts were denominated in
 * city size, and both landed on the side that builds small.
 *
 * So two: enough to stop a size-one city producing settlers forever, which was
 * the actual defect, and not enough to be a balance lever. The Horde was
 * already losing two games in three before any of this existed, and that is the
 * problem worth solving instead. See section 17.
 */
export const SETTLER = { minCitySize: 2, costsCitizen: false };

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
  /** Extra tiles of reach for a unit that has learned where things are. */
  perkReach: 2,
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
/**
 * The oldest city this player **founded** and still holds.
 *
 * Founded, not merely held: taking somebody else's ancient capital used to move
 * your own seat of government into it, because the search was by age across
 * everything you owned. That moved the whole supply network to the front line
 * on the turn you captured a city, which is the opposite of what capturing one
 * should do.
 *
 * Falls back to the oldest city held when a player founded none that survive --
 * a civilisation living entirely in captured cities still has to run its
 * supply from somewhere.
 */
/**
 * Units resting inside a city: fortified or on sentry, on the city's own tile.
 *
 * Shared by the renderer, the click handler and the city panel so all three
 * agree on what "in the garrison" means. Skipping units that are merely passing
 * through matters: a unit with orders left is one the player is still thinking
 * about, and hiding it inside the city is how it gets forgotten.
 */
export function garrisonOf(state: GameState, city: City): Unit[] {
  return state.units.filter(
    (u) =>
      u.owner === city.owner &&
      u.x === city.x &&
      u.y === city.y &&
      (u.order === 'fortified' || u.order === 'sentry'),
  );
}

/**
 * Everything of the owner's standing on the city tile, awake or not.
 *
 * Wider than `garrisonOf`, which counts only what is tucked out of sight and
 * feeds the number drawn on the city. This is the list the city panel shows,
 * and it has to include a unit that is merely standing there -- a newly built
 * one has no orders yet, and clicking the city no longer selects it, so this
 * list is the way back to it.
 */
export function unitsInCity(state: GameState, city: City): Unit[] {
  return state.units.filter(
    (u) => u.owner === city.owner && u.x === city.x && u.y === city.y,
  );
}

export function capitalOf(state: GameState, playerId: number): City | null {
  const older = (a: City, b: City) =>
    a.foundedTurn < b.foundedTurn || (a.foundedTurn === b.foundedTurn && a.id < b.id);

  let own: City | null = null;
  let any: City | null = null;
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    if (!any || older(c, any)) any = c;
    // Old saves do not record a founder; treat the holder as one, which is
    // what the rule used to assume for everybody.
    if ((c.foundedBy ?? c.owner) !== playerId) continue;
    if (!own || older(c, own)) own = c;
  }
  return own ?? any;
}

/** Does this city feed an army standing near it? */
export function suppliesArmy(state: GameState, city: City): boolean {
  if (workingBuildings(state, city).some((b) => BUILDINGS[b]?.suppliesArmy)) return true;
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
/**
 * A city this player took from somebody else and has since finished sacking.
 *
 * `foundedBy` is absent on saves written before it existed, and the rest of
 * this file reads that as "the holder founded it" -- so it is read the same way
 * here rather than treating every old city as captured.
 */
function isCapturedBase(state: GameState, city: City): boolean {
  if (city.foundedBy === undefined || city.foundedBy === city.owner) return false;
  return !isRuined(state, city);
}

export function supplyChain(state: GameState, playerId: number): Map<number, number> {
  const hops = new Map<number, number>();
  const seat = capitalOf(state, playerId);
  if (!seat) return hops;

  const posts = state.cities.filter(
    (c) =>
      c.owner === playerId &&
      (c.buildings.some((b) => BUILDINGS[b]?.suppliesArmy) ||
        // A city taken by force, and then held long enough for the rubble to be
        // cleared, becomes a forward base.
        //
        // Without this, conquest could not compound: the chain was the capital
        // and whatever depots had been built, so taking a city extended your
        // reach not at all and the front could never advance. Measured, sides
        // owned 8.18 cities with 2.46 of them supplying, and a third of them
        // fought the whole game out of one eight-tile bubble -- which is why
        // eighty-five per cent of attacks on cities happened within four tiles
        // of home. See DESIGN_QUEUE sections 50 to 53.
        //
        // Only captured cities, and only after the sack. One you founded is
        // normally raised inside your own territory and already in supply; one
        // you took is at the front, which is where reach is actually wanted.
        // The fifteen turns are what keeps conquest expensive: the reward for
        // taking a city arrives long after the fight for it.
        isCapturedBase(state, c)),
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
  // Somebody in this lot knows where to find things.
  const reach = SUPPLY.range + (hasPerk(unit, 'quartermaster') ? SUPPLY.perkReach : 0);
  const chain = supplyChain(state, unit.owner);
  if (chain.size === 0) return 0;

  let best = 0;
  for (const c of state.cities) {
    if (c.owner !== unit.owner || !chain.has(c.id)) continue;
    const d = distance(c.x, c.y, unit.x, unit.y);
    if (d <= reach) return 1;
    // Beyond the ring, thinning out over the same distance again before it
    // runs out entirely.
    const fade = 1 - (d - reach) / SUPPLY.range;
    best = Math.max(best, fade);
  }
  return Math.max(0, best);
}

export function inSupply(state: GameState, unit: Unit): boolean {
  return supplyQuality(state, unit) >= 1;
}

/**
 * Pick who has just been born here.
 *
 * Weighted across whatever sorts the owner can currently attract, so a Horde
 * that has learned about ogres starts seeing the occasional ogre without the
 * goblins going anywhere. Uses the game's own RNG, so a replay produces the
 * same people.
 */
export function rollCitizen(state: GameState, city: City): string {
  const options = availableRaces(state.players[city.owner]);
  if (options.length === 0) return 'goblin';
  const total = options.reduce((sum, r) => sum + r.weight, 0);
  return withRng(state, (rng) => {
    let roll = rng.float() * total;
    for (const race of options) {
      roll -= race.weight;
      if (roll <= 0) return race.id;
    }
    return options[options.length - 1].id;
  });
}

/**
 * Make the roster match the size, filling any gap with fresh rolls.
 *
 * Cities from before this existed, and every test fixture, have no roster at
 * all; rather than demand one everywhere, they get people the first time
 * anybody looks. Existing entries are never touched.
 */
export function syncCitizens(state: GameState, city: City): string[] {
  if (!city.citizens) city.citizens = [];
  while (city.citizens.length > city.size) city.citizens.pop();
  while (city.citizens.length < city.size) city.citizens.push(rollCitizen(state, city));
  return city.citizens;
}

/**
 * How long a sacked city stays a ruin, in turns.
 *
 * Measured: without this, a city sacked to size 2 regrew to 8 long before the
 * next army arrived, so razing almost never fired -- only 0.9 cities a game
 * were ground out of existence. A ruin that stays ruined is what lets repeated
 * capture actually finish the job.
 */
/**
 * How long a city spends clearing the rubble after being taken.
 *
 * `protects` makes that same period one in which it cannot change hands again.
 * A mutable object so a sweep can run the arm without it, in the style of
 * MILITIA and SUPPLY.
 */
export const RUIN = { protects: true };

/**
 * How long resettlement takes, by the size of the place after it was sacked.
 *
 * The timer this replaced was flat: fifteen turns whether the army had taken a
 * hamlet or a capital. Thematically the wait is people moving -- the old
 * population leaving and the new one arriving -- and there are more of them to
 * move in a large city, so it scales. The cap is there because a very large
 * city would otherwise be worth less than the ground it stands on.
 *
 * Mutable in the style of MILITIA and SUPPLY, so a sweep can run an arm with
 * different numbers without editing the call sites.
 */
export const RESETTLE = {
  base: 6,
  perCitizen: 1,
  cap: 15,
  /** Whether it may only build Coin and shared infrastructure meanwhile. */
  restrictsBuilds: true,
  /** Whether the buildings already standing here stop working meanwhile. */
  shutsBuildings: true,
};

export function resettleTurns(size: number): number {
  return Math.min(RESETTLE.cap, RESETTLE.base + size * RESETTLE.perCitizen);
}

/** Is this place still being resettled? */
export function isRuined(state: GameState, city: City): boolean {
  return city.ruinedUntil !== undefined && state.turn < city.ruinedUntil;
}

/**
 * The buildings whose effects actually apply right now.
 *
 * During resettlement almost nothing here works. The people who ran the market
 * have gone and the people who will run it have not arrived, so it is a
 * building full of nobody. Masonry is the exception: a wall does not need to be
 * staffed to be in the way, and it is the one thing that plainly does not care
 * who is living behind it.
 *
 * They are not destroyed and they are not sold -- the effects come back on
 * their own when the place is somebody's again, which is the version of this
 * rule that is easiest to explain to whoever just captured the city.
 */
export function workingBuildings(state: GameState, city: City): City['buildings'] {
  if (!RESETTLE.shutsBuildings || !isRuined(state, city)) return city.buildings;
  return city.buildings.filter((id) => BUILDINGS[id]?.defenseMult);
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
  // None of the standing choices ever completes, so none of them has a cost.
  if (item.kind !== 'unit' && item.kind !== 'building') return 0;
  const remaining = productionCostIn(state, city, item) - city.shields;
  if (remaining <= 0) return 0;
  const base = 2 * remaining + (remaining * remaining) / 20;
  return Math.ceil(city.shields === 0 ? base * 2 : base);
}

/** Why this city cannot be rushed, or null if it can. */
export function rushBlocked(state: GameState, city: City): string | null {
  const kind = city.producing.kind;
  if (kind !== 'unit' && kind !== 'building') return 'This city is not building anything.';
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
  if (item.kind === 'beakers') return 'Study';
  if (item.kind === 'calm') return 'Placating';
  return 'Coin';
}

/** Everything this city could start building right now. */
export function buildOptions(
  state: GameState,
  city: City,
): { units: UnitTypeDef[]; buildings: BuildingDef[] } {
  const owner = state.players[city.owner];
  const allUnits = unlockedUnits(owner);
  const already = new Set(city.buildings);
  const seat = capitalOf(state, city.owner);
  // A city of one cannot send anybody away without ceasing to exist, so it is
  // not offered the choice rather than being allowed to queue something it can
  // never finish.
  // A city below the threshold is not offered a settler at all, rather than
  // allowed to queue one it can never finish.
  const units =
    city.size >= SETTLER.minCitySize ? allUnits : allUnits.filter((u) => !u.settler);
  // A place still being resettled raises nobody. There is no population here
  // yet that thinks of itself as yours, and conscripting the people who are
  // in the middle of leaving is not a thing an army can do.
  const resettling = RESETTLE.restrictsBuilds && isRuined(state, city);
  const buildings = unlockedBuildings(owner)
    .filter((b) => !already.has(b.id))
    // A second tier needs its first standing here. Without this the cheap one
    // is skippable and the expensive one is a parallel choice rather than an
    // upgrade -- and a city could hold a Cathedral it never built a Chapel for.
    .filter((b) => !b.needs || already.has(b.needs))
    .filter((b) => buildingsForFaction(owner.faction).some((f) => f.id === b.id))
    // A capital already supplies an army; building a depot in the place the
    // supplies come from is not a thing anybody would do.
    .filter((b) => !b.suppliesArmy || seat?.id !== city.id)
    // Shared infrastructure only while resettling: a granary is a shed for
    // food and does not care whose food it is, but nobody is raising a totem
    // to the new owner's gods in a town that is still half the old owner's.
    .filter((b) => !resettling || b.faction === 'both');
  return { units: resettling ? [] : units, buildings };
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
  /** Blocked specifically because the city is too small to spare anybody. */
  tooSmall: boolean;
  /** Production turned straight into research this turn, if any. */
  beakers: number;
  enteredDisorder: boolean;
}

export function processCity(state: GameState, city: City): CityTurnEvents {
  const events: CityTurnEvents = {
    grew: false,
    starved: false,
    completed: null,
    blocked: false,
    tooSmall: false,
    beakers: 0,
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
  // A place still smoking does not put on population. It can still starve --
  // being sacked does not conjure food either -- but nothing accumulates
  // toward the next citizen while people are still clearing the rubble.
  const ruined = isRuined(state, city);
  const raw = yields.food - city.size * FOOD_PER_CITIZEN;
  const surplus = city.disorder || ruined ? Math.min(0, raw) : raw;
  city.food += surplus;
  if (city.food < 0) {
    city.food = 0;
    if (city.size > 1) {
      city.size -= 1;
      // Somebody has left, or worse. Last in, first out.
      syncCitizens(state, city);
      events.starved = true;
    }
  } else if (city.food >= foodToGrow(city.size)) {
    const granary = workingBuildings(state, city).includes('granary');
    const kept = granary ? Math.floor(foodToGrow(city.size) * (BUILDINGS.granary.foodKept ?? 0)) : 0;
    city.size += 1;
    city.food = kept;
    syncCitizens(state, city);
    events.grew = true;
    assignWorkers(state, city);
  }

  // --- shields ---------------------------------------------------------
  const net = yields.shields - unitUpkeep(state, city);
  city.shields = Math.max(0, city.shields + net);
  const item = city.producing;
  if (item.kind === 'coin' || item.kind === 'beakers' || item.kind === 'calm') {
    // The standing choices. None of them ever finishes, so the shield box is
    // emptied each turn rather than accumulating toward anything.
    //
    // Calm banks nothing at all: the production goes on placating people, and
    // what it buys is the content bonus in contentLimit rather than a number
    // anywhere. That is the point of it -- it is the one thing a rioting city
    // can always work at, so disorder is a setback rather than a dead end.
    if (item.kind === 'coin') owner.gold += Math.max(0, net);
    if (item.kind === 'beakers') events.beakers = Math.max(0, net);
    city.shields = 0;
  } else {
    const cost = productionCostIn(state, city, item);
    if (city.shields >= cost) {
      if (item.kind === 'unit') {
        const spot = placementFor(state, city);
        // A settler is people, not equipment: the ones who walk out are the
        // ones who were living here. A city of one has nobody to send without
        // ceasing to be a city, so it holds the shields until it has grown --
        // the same way it holds them when there is nowhere to stand.
        const isSettler = unitType(item.id).settler;
        const takesCitizen = SETTLER.costsCitizen && isSettler;
        // Too small to send anybody out. Holds the shields rather than
        // shrinking below the point where it stops being a city.
        if (isSettler && city.size < SETTLER.minCitySize) {
          events.blocked = true;
          events.tooSmall = true;
        } else if (!spot) {
          // Nowhere to put it; hold the shields until a tile frees up.
          events.blocked = true;
        } else {
          // Best of everything standing here, so a drill ground does not have
          // to care whether the barracks beneath it still exists.
          const rank = workingBuildings(state, city).reduce((best, id) => {
            const b = BUILDINGS[id];
            if (!b) return best;
            return Math.max(best, b.startingRank ?? (b.veteranUnits ? 1 : 0));
          }, 0);
          const unit: Unit = spawnUnit(state, city.owner, item.id, spot[0], spot[1], rank > 0);
          unit.rank = Math.max(unit.rank, rank);
          unit.homeCity = city.id;
          city.shields -= cost;
          if (takesCitizen) {
            city.size -= 1;
            syncCitizens(state, city);
          }
          // Remembered so a standing order can put it back on afterwards.
          city.lastUnit = item.id;
          events.completed = unitType(item.id).name;
          // A city set to ask has to actually stop, and finishing a unit does
          // not clear production on its own -- which is why "Ask me" appeared
          // to do nothing at all for a city building units. Dropping to Coin
          // is what makes it idle, and idle is what raises the prompt.
          //
          // Only for a player who can be asked. The AI has no interface for it
          // and would simply lose a turn's production every time.
          if (
            autoBuildOf(city) === 'ask' &&
            state.players[city.owner].controller === 'human'
          ) {
            city.producing = { kind: 'coin' };
          }
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
    citizens: [],
    food: 0,
    shields: 0,
    buildings: [],
    producing: { kind: 'unit', id: state.players[unit.owner].faction === 'orc' ? 'goblin' : 'footman' },
    workedTiles: [],
    disorder: false,
    foundedTurn: state.turn,
    foundedBy: unit.owner,
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
/** A city's setting, defaulting to `ask` for anything that never set one. */
export function autoBuildOf(city: City): AutoBuild {
  return city.autoBuild ?? 'ask';
}

/**
 * What a city on `repeat` goes back to once it has run out of orders.
 *
 * The unit it was last making, if it can still be made. A city churning out
 * Three Orcs that stops to put up a Barracks returns to Three Orcs afterwards
 * rather than idling or being handed something it never asked for, which is the
 * whole point of the setting.
 *
 * The remembering is necessary rather than fussy: finishing a unit does not
 * clear `producing`, so a city making units already makes more without being
 * told, and a standing order is only ever consulted after a *building*
 * completed -- by which time what it was making has been gone for turns.
 *
 * Falls back to the cheapest unit it can build if the old one is no longer
 * available, and only then to Coin. Note it never reaches for a structure:
 * picking buildings on the player's behalf is what "auto" should not do, and
 * `ask` is there for when the answer is genuinely open.
 *
 * Deliberately separate from `defaultProduction`, which is the AI's fallback
 * and reaches for the cheapest *attacker*. Sharing one function would have
 * meant changing what the AI builds in order to change what a player's cities
 * do, and those are not the same question.
 */
export function nextProduction(state: GameState, city: City): ProductionItem {
  const units = buildOptions(state, city).units;
  const again = city.lastUnit && units.find((u) => u.id === city.lastUnit);
  if (again) return { kind: 'unit', id: again.id };
  const cheapest = [...units].sort((a, b) => a.cost - b.cost)[0];
  return cheapest ? { kind: 'unit', id: cheapest.id } : { kind: 'coin' };
}

export function defaultProduction(state: GameState, city: City): ProductionItem {
  const options = buildOptions(state, city);
  const cheapest = options.units
    .filter((u) => u.attack > 0)
    .sort((a, b) => a.cost - b.cost)[0];
  return cheapest ? { kind: 'unit', id: cheapest.id } : { kind: 'coin' };
}

export const ALL_UNIT_DEFS = UNIT_TYPES;
