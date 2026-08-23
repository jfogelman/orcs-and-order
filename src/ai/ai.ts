import { DIRS8, distance, fatCrossIndices, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import type { UnitTypeDef } from '../model/units';
import { unitType } from '../model/units';
import type { City, GameState, Player, ProductionItem, Unit } from '../model/types';
import { owedPerks, perkChoices } from '../model/perks';
import { buildOptions, canFoundCity, contentLimit, foundCity, tileYield,
  rushBlocked,
  rushBuy,
  rushCost,
  capitalOf,
  suppliesArmy,
  SUPPLY,
  supplyChain,
  supplyQuality
} from '../sim/city';
import { rankBonus } from '../sim/combat';
import { playerCities, playerUnits, withRng } from '../sim/gamestate';
import { attackTargets, moveToward, routeTo, tryStep } from '../sim/movement';
import { researchableTechs, setResearch, techCost } from '../sim/research';

/**
 * The opposition.
 *
 * Deliberately simple and deliberately in character: the Horde builds the
 * biggest thing it can afford and walks it at the nearest enemy, while the
 * Kingdom expands and garrisons first and only then goes looking for trouble.
 * The interface is one function, so a better brain can replace this wholesale.
 */

export interface AiPersonality {
  /** Cities the AI wants before it stops prioritising settlers. */
  targetCities: number;
  /** Share of production spent on defenders rather than attackers. */
  garrisonPerCity: number;
  /** Preferred research, tried in order before falling back to cheapest. */
  techPriority: string[];
  /** How readily it attacks at poor odds. 1 = only good odds, 0 = always. */
  caution: number;
  /** Units it wants gathered around a city before storming it. */
  stormingParty: number;
}

/**
 * Exported so a measurement can vary one trait and hold the rest still.
 * Tuning these by reasoning about them has produced four wrong answers; the
 * only thing that has ever worked is swapping a number and counting.
 */
export const PERSONALITIES: Record<string, AiPersonality> = {
  orc: {
    // The Horde is supposed to be the numerous one. Expanding to only four
    // cities left it permanently behind on trade, and therefore permanently
    // stuck at the bottom of its own counting ladder.
    //
    // Then six stopped being enough, for a reason worth writing down rather
    // than just bumping past. Both sides cap their *own* founding at this
    // number, but only the Kingdom reliably exceeds its cap by conquest -- its
    // 8.4 cities were six founded plus two taken, where the Horde's 5.8 were
    // six founded minus losses. A symmetric target produces an asymmetric
    // result the moment the war stops being symmetric, so this number has to
    // track what the other side actually *achieves*, not what it is told to
    // aim at. Measured over two seed sets, thirty games, Horde wins:
    //
    //   6   7/30  (23%)  cities 5.8/8.4 and 6.2/7.8 -- beaten to the land
    //   7  18/30  (60%)  cities 7.9/8.2 and 7.7/7.6 -- level
    //   8  19/30  (63%)  cities 8.8/8.4 and 8.7/7.8 -- Horde ahead
    //  10   9/12  (75%)  one set only, plainly overcorrected
    //
    // Seven and eight are one game apart over thirty and cannot be told apart
    // at this sample size; seven is chosen because it levels the city counts
    // rather than tipping them, and because it is the smaller move.
    targetCities: 7,
    // See the note on the Kingdom's copy of this field: one defender per city
    // is right for both sides, for opposite reasons.
    garrisonPerCity: 1,
    /*
     * Roughly cost-ordered, and deliberately not all military. An earlier
     * version listed only weapons; once the list was actually being consulted
     * that left the Horde with no economy at all and it fell behind on every
     * measure. Cheap enablers first, then the counting ladder interleaved with
     * the things that pay for it.
     */
    techPriority: [
      'mapmaking',
      // Unlocks the outpost, which is the only answer to fighting out of
      // supply. Left off this list it was rarely researched at all, so half
      // the games had an AI that could not respond to the penalty.
      'bridge-building',
      'goblin-smarts',
      'orc-meaning',
      'orc-together',
      'not-you-again',
      'to-be-an-orc',
      'suicidal-goblins',
      'axes',
      'tree-hugging',
      'idiots-stick-together',
      'joy-making',
      'hammers-of-glory',
      'throwing-buddies',
      'wall-building',
      'next-level-stupid',
      'happiness',
      'axes-crazy',
      'beyond-stupid',
      'my-little-friend',
      'not-just-stupid',
      'dead-messed-up',
      'stupidity-for-all',
      'full-of-fire',
    ],
    caution: 0.25,
    stormingParty: 3,
  },
  human: {
    targetCities: 6,
    /*
     * Was 2, and that turned out to be the single biggest lever on faction
     * balance -- in the opposite direction to the obvious guess. Measured over
     * 12 seeds, as orc/human garrison:
     *
     *   1 / 2   orc c7.9  hum c12.0   wins 5-7
     *   2 / 2   orc c5.6  hum c11.3   wins 2-10
     *   1 / 1   orc c9.9  hum c 8.5   wins 7-5
     *
     * Garrisoning helps the Kingdom and cripples the Horde, because it
     * interacts with `caution`. A cautious AI was not going to attack with
     * those units anyway, so posting them on a wall is free defence. An
     * aggressive one is spending its whole army on the offensive, and every
     * unit told to stand still is one not taking a city.
     *
     * At 1/1 over 18 seeds the game comes out 9-9, with each faction leading
     * the columns it should: the Kingdom on cities and population, the Horde
     * on advances.
     */
    garrisonPerCity: 1,
    techPriority: [
      'mapmaking',
      // The Forward Depot, for the same reason as the Horde's outpost.
      'bridge-building',
      'brotherhood',
      'archery',
      'not-you-again',
      'join-army',
      'tree-hugging',
      'horses-sneeze',
      'joy-making',
      'hammers-of-glory',
      'bunches-footmen',
      'wall-building',
      'happiness',
      'pointed-ears',
      'ten-heads',
      'let-us-ride',
      'arrows-glory',
      'run-you-through',
      'rumbling-voice',
      'lordship',
    ],
    // The single most sensitive number in the file, and the only one that
    // moved faction balance at all. Measured over 18 seeds:
    //
    //   0.60   orc 14-4   at this setting the Kingdom declined fights it
    //                     would have won and was picked apart a unit at a time
    //   0.52   orc 12-6
    //   0.48   orc 10-8   populations 51.9 / 53.8 -- level
    //   0.45   orc  7-11  overcorrected
    //
    // Garrison size, by contrast, changed the win split not at all: 1 and 2
    // both gave 7-11 at caution 0.45.
    caution: 0.48,
    stormingParty: 3,
  },
};

// -------------------------------------------------------------- evaluation

function siteScore(state: GameState, x: number, y: number): number {
  let score = 0;
  let land = 0;
  for (const i of fatCrossIndices(x, y, state.width, state.height)) {
    const y2 = tileYield(state, i, false);
    if (!TERRAIN[state.terrain[i]].water) land++;
    score += y2.food * 3 + y2.shields * 2 + y2.trade;
  }
  if (land < 10) return -1;
  return score;
}

/** Rough odds the attacker wins, used to keep the AI from obvious suicide. */
function attackOdds(state: GameState, attacker: Unit, defender: Unit): number {
  const a = unitType(attacker.type);
  const d = unitType(defender.type);
  const terrain = TERRAIN[state.terrain[idx(defender.x, defender.y, state.width)]];
  const atk = a.attack * rankBonus(attacker) * (attacker.hp / a.hp);
  const def =
    d.defense *
    rankBonus(defender) *
    terrain.defense *
    (defender.order === 'fortified' ? 1.5 : 1);
  return atk / Math.max(0.0001, atk + def);
}

function nearestEnemyTarget(
  state: GameState,
  playerId: number,
  from: Unit,
): { x: number; y: number } | null {
  const player = state.players[playerId];
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  const consider = (x: number, y: number, weight: number) => {
    if (!player.explored[idx(x, y, state.width)]) return;
    const dist = distance(from.x, from.y, x, y) * weight;
    if (dist < bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  };

  for (const c of state.cities) if (c.owner !== playerId) consider(c.x, c.y, 1);
  for (const u of state.units) {
    if (u.owner !== playerId && player.visible[idx(u.x, u.y, state.width)]) {
      consider(u.x, u.y, 1.6);
    }
  }
  return best;
}

/**
 * Explored land tiles that still touch the unknown — the places worth walking
 * to in order to see more.
 *
 * Computed once per AI turn rather than per unit: scanning the whole map for
 * every soldier every turn was the AI's other hot spot.
 */
function frontierTiles(state: GameState, player: Player): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const i = idx(x, y, state.width);
      if (!player.explored[i]) continue;
      if (TERRAIN[state.terrain[i]].water) continue;
      let touchesUnknown = false;
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        if (!player.explored[idx(nx, ny, state.width)]) {
          touchesUnknown = true;
          break;
        }
      }
      if (touchesUnknown) out.push([x, y]);
    }
  }
  return out;
}

function nearestFrontier(
  frontier: Array<[number, number]>,
  from: Unit,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const [x, y] of frontier) {
    const dist = distance(from.x, from.y, x, y);
    if (dist > 0 && dist < bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  }
  return best;
}

// ------------------------------------------------------------- production

/**
 * What a fighting unit is worth, per shield spent.
 *
 * The chooser used to sort candidates by raw `attack` and take the dearest it
 * could afford, which was defensible only while health scaled with the group:
 * attack alone then stood in for everything. It no longer does. Ten Orcs have
 * attack 30 and twelve hit points for two hundred shields, and sorting on
 * attack puts that at the top of the list -- so the AI was not merely failing
 * to notice the dragons, it was actively buying the worst thing available.
 *
 * Strength multiplied by health is what a fight is actually decided on: how
 * hard the blows land and how many of them the unit stays up for. Divided by
 * price, it is what a shield buys. See DESIGN_QUEUE sections 31 to 34.
 */
function worth(u: UnitTypeDef, defending: boolean): number {
  const strength = defending ? u.defense : u.attack;
  return (strength * u.hp) / Math.max(1, u.cost);
}

/**
 * Ranks candidates by value, preferring the bigger of two equals.
 *
 * The counting ladder now scales every stat linearly, so a rung is worth
 * exactly what its members are worth and one orc ties with ten. The tie is
 * broken towards the group on purpose: upkeep is charged per *unit* rather
 * than per orc, and a group also holds one tile and spends one movement point.
 * That efficiency is the whole reason the ladder exists, and it is real even
 * though it does not show up in the value figure.
 */
function byWorth(defending: boolean) {
  return (a: UnitTypeDef, b: UnitTypeDef): number => {
    const wa = worth(a, defending);
    const wb = worth(b, defending);
    if (Math.abs(wa - wb) > Math.max(wa, wb) * 0.05) return wb - wa;
    return b.cost - a.cost;
  };
}

function chooseProduction(
  state: GameState,
  city: City,
  personality: AiPersonality,
): ProductionItem {
  const owner = state.players[city.owner];
  const options = buildOptions(state, city);
  if (options.units.length === 0) return { kind: 'coin' };

  // A garrison is whoever is standing on or beside the city. Counting only the
  // city tile would never reach two, because only one unit fits on a tile.
  const garrison = state.units.filter(
    (u) => u.owner === city.owner && distance(u.x, u.y, city.x, city.y) <= 1 && !unitType(u.type).settler,
  ).length;
  const cities = playerCities(state, city.owner).length;
  const settlers = playerUnits(state, city.owner).filter((u) => unitType(u.type).settler).length;

  // 1. Somebody has to hold the gate.
  if (garrison < personality.garrisonPerCity) {
    const defender = [...options.units]
      .filter((u) => u.attack > 0)
      .sort(byWorth(true))[0];
    if (defender) return { kind: 'unit', id: defender.id };
  }

  // 2. Expand while there is room to expand into.
  if (cities + settlers < personality.targetCities) {
    const settler = options.units.find((u) => u.settler);
    if (settler) return { kind: 'unit', id: settler.id };
  }

  // 3. Keep the lid on first. A city at its content limit stops growing and
  // produces nothing at all, so a happiness building is worth more than any
  // amount of economy sitting on top of a riot.
  if (city.size >= contentLimit(state, city) - 1) {
    const calming = options.buildings.find((b) => b.contentBonus);
    if (calming) return { kind: 'building', id: calming.id };
    // Only when it is actually rioting, and only when there is nothing left to
    // build that would help. Placating costs the city its whole production,
    // which is no loss at all while it is producing nothing anyway -- but a
    // city merely approaching its limit is still working, and should carry on.
    if (city.disorder) return { kind: 'calm' };
  }

  // 3b. If the enemy is turtling behind walls, build something that ignores
  // them. Without this the AI keeps making melee units that cannot get in.
  const enemyHasWalls = state.cities.some(
    (c) => c.owner !== city.owner && c.buildings.includes('walls'),
  );
  if (enemyHasWalls) {
    const siege = options.units.find((u) => u.siegeBonus > 1);
    const haveSiege = playerUnits(state, city.owner).some(
      (u) => unitType(u.type).siegeBonus > 1,
    );
    if (siege && !haveSiege) return { kind: 'unit', id: siege.id };
  }

  // 3c. A forward city with hungry troops around it wants a depot.
  //
  // Conditional on there actually being somebody out there in need of one.
  // An unconditional rule crowded out every economy building the moment the
  // advance was researched -- a city builds one depot and compounds forever
  // off a treasury, so the depot has to earn its place rather than take it.
  const seat = capitalOf(state, city.owner);
  const covered = seat !== null && distance(seat.x, seat.y, city.x, city.y) <= SUPPLY.range;
  if (!covered && !suppliesArmy(state, city)) {
    // Only where it would actually join the chain. Supply is carried hand to
    // hand from the capital, so a depot beyond the last link supplies nothing
    // at all -- and the further out it is the more it costs, which would make
    // a stranded one the most expensive way in the game to achieve nothing.
    const chain = supplyChain(state, city.owner);
    const linked = state.cities.some(
      (c) => chain.has(c.id) && distance(c.x, c.y, city.x, city.y) <= SUPPLY.linkRange,
    );
    const hungry = playerUnits(state, city.owner).some(
      (u) =>
        distance(u.x, u.y, city.x, city.y) <= SUPPLY.range && supplyQuality(state, u) < 1,
    );
    const supplyHouse =
      linked && hungry ? options.buildings.find((b) => b.suppliesArmy) : undefined;
    if (supplyHouse) return { kind: 'building', id: supplyHouse.id };
  }

  // 4. Then infrastructure. Economy buildings come before a second barracks:
  // a city that pays for its own research compounds, and a barracks does not.
  const wanted =
    options.buildings.find((b) => b.scienceBonus || b.goldBonus) ??
    options.buildings.find(
      (b) => b.id === 'barracks' || b.defenseMult !== undefined || b.sallyBonus !== undefined,
    );
  if (wanted && city.size >= 3 && withRng(state, (r) => r.chance(0.4))) {
    return { kind: 'building', id: wanted.id };
  }

  // 4. Otherwise: the biggest stick currently affordable in reasonable time.
  const attackers = [...options.units]
    .filter((u) => u.attack > 0 && !u.settler)
    .sort(byWorth(false));
  // Falls back to whatever is cheapest rather than to the bottom of the value
  // ranking, which after the re-sort is the worst unit on the list rather than
  // the one a small city can actually finish.
  const affordable =
    attackers.find((u) => u.cost <= 40 + city.size * 22) ??
    [...attackers].sort((a, b) => a.cost - b.cost)[0];
  if (affordable) return { kind: 'unit', id: affordable.id };
  void owner;
  return { kind: 'coin' };
}

// ------------------------------------------------------------------ turn

/**
 * Enemy attackers this player can *see* near a tile.
 *
 * Reads `visible` rather than the true board, the same rule the interface
 * follows: an AI that dodged a stack it had not found yet would be cheating,
 * and would also be impossible to play against convincingly.
 */
function threatNear(state: GameState, playerId: number, x: number, y: number, radius = 3): number {
  const seen = state.players[playerId].visible;
  const w = state.width;
  let count = 0;
  for (const u of state.units) {
    if (u.owner === playerId) continue;
    if (unitType(u.type).attack <= 0) continue;
    if (!seen[u.y * w + u.x]) continue;
    if (distance(u.x, u.y, x, y) <= radius) count++;
  }
  return count;
}

/** Something of ours next door that can fight for the new city. */
function guardedAt(state: GameState, playerId: number, x: number, y: number): boolean {
  return state.units.some(
    (u) =>
      u.owner === playerId &&
      unitType(u.type).attack > 0 &&
      distance(u.x, u.y, x, y) <= 1,
  );
}

/** What a visible attacker nearby takes off a site's score. */
const THREAT_PENALTY = 45;

function actSettler(state: GameState, unit: Unit, personality: AiPersonality): void {
  const cities = playerCities(state, unit.owner).length;
  if (cities >= personality.targetCities + 2) {
    // Enough cities; park it somewhere safe rather than wandering forever.
    unit.order = 'sentry';
    return;
  }

  // Founding on top of an enemy stack with nothing to defend the place is a
  // gift: the city is taken next turn and the settler is spent doing it. So a
  // site with attackers in sight is only acceptable if something of ours is
  // stood next to it.
  const here = canFoundCity(state, unit, unit.x, unit.y);
  const exposed =
    threatNear(state, unit.owner, unit.x, unit.y) > 0 &&
    !guardedAt(state, unit.owner, unit.x, unit.y);
  const hereScore = here.ok && !exposed ? siteScore(state, unit.x, unit.y) : -1;
  if (hereScore >= 90 || (cities === 0 && here.ok && !exposed)) {
    foundCity(state, unit);
    return;
  }

  // Look for somewhere better within a short walk.
  let best: { x: number; y: number; score: number } | null = null;
  const radius = 7;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 1 || y < 1 || x >= state.width - 1 || y >= state.height - 1) continue;
      if (!canFoundCity(state, unit, x, y).ok) continue;
      const score =
        siteScore(state, x, y) -
        distance(unit.x, unit.y, x, y) * 4 -
        threatNear(state, unit.owner, x, y) * THREAT_PENALTY;
      if (score > 0 && (!best || score > best.score)) best = { x, y, score };
    }
  }

  if (best && best.score > hereScore) {
    if (!routeTo(state, unit, best.x, best.y)) {
      if (here.ok && !exposed) foundCity(state, unit);
      return;
    }
    moveToward(state, unit, best.x, best.y);
    // Arrived this turn? Settle immediately rather than idling a turn.
    if (unit.x === best.x && unit.y === best.y && canFoundCity(state, unit, unit.x, unit.y).ok) {
      foundCity(state, unit);
    }
    return;
  }
  if (here.ok && !exposed) {
    foundCity(state, unit);
    return;
  }
  // Nowhere safe and nowhere better. A player with no cities at all founds
  // anyway, because having none is worse than having one that may be taken;
  // anybody else walks away and tries again next turn.
  if (here.ok && cities === 0) foundCity(state, unit);
}

function actSoldier(
  state: GameState,
  unit: Unit,
  personality: AiPersonality,
  frontier: Array<[number, number]>,
): void {
  // Attack anything adjacent that we can beat.
  const targets = attackTargets(state, unit);
  let bestTarget: { x: number; y: number; odds: number } | null = null;
  for (const i of targets) {
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const defender = state.units.find((u) => u.x === x && u.y === y);
    const odds = defender ? attackOdds(state, unit, defender) : 1; // empty city = free
    if (!bestTarget || odds > bestTarget.odds) bestTarget = { x, y, odds };
  }
  if (bestTarget && bestTarget.odds >= personality.caution) {
    tryStep(state, unit, bestTarget.x, bestTarget.y);
    return;
  }

  // Besieging: a city is worth far more than a field unit and is defended by
  // stacked multipliers, so single units thrown at it die one at a time and
  // the war never resolves. Gather next to it first, then everyone goes in.
  const targetCity = state.cities.find(
    (c) => c.owner !== unit.owner && distance(unit.x, unit.y, c.x, c.y) === 1,
  );
  if (targetCity) {
    const besiegers = state.units.filter(
      (u) => u.owner === unit.owner && distance(u.x, u.y, targetCity.x, targetCity.y) === 1,
    ).length;
    const defender = state.units.find((u) => u.x === targetCity.x && u.y === targetCity.y);
    const odds = defender ? attackOdds(state, unit, defender) : 1;
    if (besiegers >= personality.stormingParty || odds >= personality.caution) {
      if (tryStep(state, unit, targetCity.x, targetCity.y).kind !== 'blocked') return;
    }
    // Not enough of us yet. Dig in where we stand and wait for the rest.
    unit.order = 'fortified';
    return;
  }

  // Hold undefended home cities.
  const ownCities = playerCities(state, unit.owner);
  const bare = ownCities.find(
    (c) => !state.units.some((u) => u.owner === unit.owner && u.x === c.x && u.y === c.y),
  );
  if (bare) {
    if (unit.x === bare.x && unit.y === bare.y) {
      unit.order = 'fortified';
      return;
    }
    if (distance(unit.x, unit.y, bare.x, bare.y) <= 8 && routeTo(state, unit, bare.x, bare.y)) {
      moveToward(state, unit, bare.x, bare.y);
      return;
    }
  }

  // March on whatever we know about.
  const target = nearestEnemyTarget(state, unit.owner, unit);
  if (target && routeTo(state, unit, target.x, target.y)) {
    moveToward(state, unit, target.x, target.y);
    return;
  }

  // Nothing known: go and look.
  const edge = nearestFrontier(frontier, unit);
  if (edge && routeTo(state, unit, edge.x, edge.y)) {
    moveToward(state, unit, edge.x, edge.y);
    // Spent its movement, or queued behind someone: nothing more to do.
    if (unit.moves <= 0 || unit.goto) return;
  }

  // Still here: probably wedged in behind its own army. Shuffle to any open
  // neighbour so the tile frees up and the jam unwinds over a few turns.
  if (unit.moves > 0) {
    for (const [dx, dy] of DIRS8) {
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
      if (state.units.some((u) => u.x === x && u.y === y)) continue;
      if (state.cities.some((c) => c.x === x && c.y === y && c.owner !== unit.owner)) continue;
      if (tryStep(state, unit, x, y).kind === 'moved') return;
    }
  }
  unit.order = 'fortified';
}

function chooseResearch(state: GameState, player: Player, personality: AiPersonality): void {
  if (player.researching) return;
  const options = researchableTechs(player);
  if (options.length === 0) return;
  for (const wanted of personality.techPriority) {
    const match = options.find((t) => t.id === wanted);
    if (match) {
      setResearch(state, player, match.id);
      return;
    }
  }
  const cheapest = options.reduce((a, b) => (techCost(player, a) <= techCost(player, b) ? a : b));
  setResearch(state, player, cheapest.id);
}

/**
 * Gold kept back rather than spent, to cover upkeep and the bankruptcy path.
 *
 * Without a floor the AI would spend down to nothing every turn and then start
 * selling its own buildings off the moment upkeep exceeded income.
 */
export const AI_TUNING = {
  /**
   * Whether the AI spends gold on production at all. **Off, and measured.**
   *
   * Rush-buying scales with the number of cities you have to spend it in, so
   * it amplifies a city-count lead instead of closing one. Over eighteen seeds
   * the better the AI got at spending, the worse the Horde did: 6-12 not
   * spending, 5-13 with a thin reserve, 2-16 with a fat one, and 1-17 when
   * taught to prefer buildings. The Kingdom simply had twice as many queues to
   * accelerate.
   *
   * The mechanic stays -- a human player can still buy things, which is the
   * whole reason gold exists now -- but the AI does not use it. Flip this back
   * on to re-measure if the city gap ever closes.
   */
  rushBuying: false,
  goldReserve: 60,
  /**
   * Buy the thing that lasts, rather than the thing that is cheapest.
   *
   * Cheapest-first turned out to mean "a cheap unit, every single turn": with
   * a thin reserve the AI bought about thirty times a game and finished with
   * *fewer* standing buildings than when it could not spend at all.
   */
  preferBuildings: false,
};

/**
 * Turn banked gold into things that exist.
 *
 * Cheapest completion first, so a given pile of gold buys as many finished
 * items as it can rather than one expensive one. Measured before it was
 * believed: the Horde was ending games sitting on ~476 gold, which scored
 * exactly nothing, because there was previously no way to spend it at all.
 */
function spendGold(state: GameState, player: Player): void {
  // Bounded: each purchase is meant to be cheap, and an unbounded loop here
  // would be one rounding error away from hanging a turn.
  for (let bought = 0; bought < 12; bought++) {
    const rank = (c: City) =>
      AI_TUNING.preferBuildings && c.producing.kind === 'building' ? 0 : 1;
    const affordable = playerCities(state, player.id)
      .filter((c) => rushBlocked(state, c) === null)
      .sort((a, b) => rank(a) - rank(b) || rushCost(state, a) - rushCost(state, b))[0];
    if (!affordable) break;
    if (player.gold - rushCost(state, affordable) < AI_TUNING.goldReserve) break;
    if (!rushBuy(state, affordable)) break;
  }
}

/**
 * Take the promotions owed to this player's units.
 *
 * Ordered by taste rather than measured: the Horde reaches for the thing that
 * hits harder, the Kingdom for the thing that keeps an army standing. Neither
 * list has been swept, and both are one array away from being changed once
 * somebody has an opinion backed by numbers.
 */
const PERK_TASTE: Record<string, string[]> = {
  orc: ['bloodied', 'butcher', 'reputation', 'dug-in', 'field-repairs', 'quartermaster'],
  human: ['dug-in', 'quartermaster', 'field-repairs', 'bloodied', 'reputation', 'butcher'],
};

function takePromotions(state: GameState, player: Player): void {
  const taste = PERK_TASTE[player.faction] ?? PERK_TASTE.orc;
  for (const unit of playerUnits(state, player.id)) {
    while (owedPerks(unit) > 0) {
      const options = perkChoices(unit);
      if (options.length === 0) break;
      // First thing on the list that is still going.
      const pick = taste.map((id) => options.find((o) => o.id === id)).find(Boolean) ?? options[0];
      unit.perks = [...(unit.perks ?? []), pick.id];
    }
  }
}

export function runAiTurn(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player.alive) return;
  const personality = PERSONALITIES[player.faction] ?? PERSONALITIES.orc;

  chooseResearch(state, player, personality);
  takePromotions(state, player);

  for (const city of playerCities(state, playerId)) {
    city.producing = chooseProduction(state, city, personality);
  }
  if (AI_TUNING.rushBuying) spendGold(state, player);

  const frontier = frontierTiles(state, player);

  // Snapshot: units can die (or be consumed founding cities) mid-loop.
  for (const unit of [...playerUnits(state, playerId)]) {
    if (!state.units.includes(unit)) continue;
    if (unit.moves <= 0) continue;
    const type = unitType(unit.type);
    if (type.settler) actSettler(state, unit, personality);
    else actSoldier(state, unit, personality, frontier);
  }
}
