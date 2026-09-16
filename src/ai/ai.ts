import { flagsOf, hasFlag } from '../sim/rules';
import { DIRS8, distance, fatCrossIndices, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import { BUILDINGS } from '../model/buildings';
import type { UnitTypeDef } from '../model/units';
import { ammoLeft, headcount, unitType } from '../model/units';
import type { City, GameState, Player, ProductionItem, Unit } from '../model/types';
import { owedPerks, perkChoices } from '../model/perks';
import {
  SETTLER,
  SUPPLY,
  buildOptions,
  canFoundCity,
  capitalOf,
  cityYield,
  POSTING,
  contentLimit,
  garrisonNeededBy,
  garrisonSize,
  soldiersFor,
  workingBuildings,
  foundCity,
  rushBlocked,
  rushBuy,
  rushCost,
  suppliesArmy,
  supplyChain,
  supplyQuality,
  tileYield,
} from '../sim/city';
import { rankBonus } from '../sim/combat';
import { endingOpen, hasEndingPiece, isEndingPiece } from '../sim/endings';
import { playerCities, playerUnits, withRng } from '../sim/gamestate';
import { abilityReady, abilityTargets, useAbility } from '../sim/abilities';
import { resupply, resupplyBlocked } from '../sim/combat';
import {
  attackTargets,
  moveToward,
  reachableTiles,
  routeTo,
  startRoadTo,
  tryStep,
} from '../sim/movement';
import { canLayRoads, connectedByRoad, pillage } from '../sim/roads';
import { POSTS, startPost } from '../sim/posts';
import { TRADE_STEPS, researchableTechs, setResearch, techCost } from '../sim/research';
import { isFolly } from '../sim/follyEffects';

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
    //
    // **Back to six**, and everything above is the record of a game that no
    // longer exists. That measurement was taken when a stack bought damage and
    // health together and the AI reached for the biggest one it could afford;
    // six then meant being beaten to the land and losing 77% of the time.
    // Since sections 33 and 34 the Horde fields dragons and ogres instead of
    // fifty goblins, and seven cities became an advantage rather than a
    // rescue. Re-measured over three seed sets, 54 games:
    //
    //   6   25-24  cities 7.5/8.1   148 turns   -- level
    //   7   32-16  cities 9.4/7.7   157 turns   -- Horde ahead
    //
    // Worth noting how far the individual sets swing: six returns 7-11, 11-5
    // and 7-8 on the three sets. Any one of them alone would have argued
    // something different, which is the argument for all three.
    //
    // **Five since section 109**, and it is the only balance change in the whole
    // roads arc. Six changes between sections 101 and 102 each measured as "not
    // established" and all leaned the same way; together they moved the game from
    // 54% to 65% for the Horde, 24 seeds flipping its way against 11 at
    // p = 0.04. Nearly three quarters of games now end on points, points are
    // mostly size, and size is mostly cities -- so this takes score off the Horde
    // where it was winning rather than taking calm off everybody, which is what
    // `CALM.base` at five did: that corrected eleven points with eighteen and
    // cost an advance and a half at p = 0.0000002, in a game whose joke is the
    // counting ladder.
    //
    // At five, over 216 games: 19 seeds to the Kingdom against 5 (p = 0.007),
    // pooled 65% to 52%, advances down 0.66 and **not** significant (p = 0.09),
    // and fights up four and a half a game -- a Horde with one fewer city sends
    // more of it out. Even, and still the louder side.
    targetCities: 5,
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
      // Section 111: straight after its own prerequisite, because three things hang
      // off Insanity -- the Long Peace rides on it, and both magics sit under it --
      // and the list asked for none of them. Left off entirely, the Horde reached
      // the branch only when the cheapest-thing fallback found it, around turn 190
      // against the Kingdom's 110, and the Kingdom took every late shared folly it
      // raced for. Asked for at the same depth as the Kingdom's own it still
      // arrived forty turns late, because what stands in front of it here is the
      // Horde's own long line rather than a handful of cheap advances.
      'insanity',
      'axes-crazy',
      'beyond-stupid',
      'my-little-friend',
      // The clubs sit behind this, and without it here the advance is only ever
      // picked up by the cheapest-thing fallback -- so the whole of section 11's
      // ogre line was reachable in principle and researched almost never. Clubs
      // were taken 0.2 times a game on one seed set. See DESIGN_QUEUE 44.
      'club-improvement',
      'not-just-stupid',
      'dead-messed-up',
      // Section 110: the ending, straight after its own line's prerequisite -- the
      // same place the Kingdom's list puts it, right after Lordship. Placed after
      // Full of Fire instead, the Horde learned it in ten games in thirty-one to the
      // Kingdom's twenty-six: the two dearest advances in its tree stood in front of
      // it, and nothing in the Kingdom's list does. It no longer needs Insanity.
      'somebody-knocked',
      'stupidity-for-all',
      'full-of-fire',
      // Section 111: the one folly with an advance of its own needs both elements.
      // Left off every list, no AI ever built it in eight probed games.
      'pyromancy',
      'cryomancy',
      'sky-argument',
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
      // Section 110, as for the Horde.
      'insanity',
      'do-not-touch',
      // Section 111, as for the Horde.
      'pyromancy',
      'cryomancy',
      'sky-argument',
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

/**
 * How much a well-held city adds to how far away it feels.
 *
 * At 0.6 a city nobody is standing in is worth walking up to sixty per cent
 * further for. Deliberately a preference rather than a rule: a strong city that
 * is right there is still a better idea than a weak one across the map.
 */
const HARD_TARGET = 0.6;

/**
 * How much nearer a city with an ending counting down counts, as a multiple of
 * its real distance.
 *
 * Everybody is told when a Portal opens or an Object appears, and exactly where,
 * so marching on it is using something the AI was told rather than something the
 * fog should hide. Without this each side would go on attacking whatever sat on
 * its border while the count ran out behind the front. Section 110.
 */
const ENDING_PULL = 0.35;

/**
 * The same pull, gentler, once the other side has begun work towards its ending:
 * its capital, where the final work will stand, and any city holding a work
 * already finished. Everybody was told when the work began.
 */
const BEGUN_PULL = 0.6;

/** Defence at which a city counts as thoroughly held. */
const GUARD_REFERENCE = 12;

/**
 * Where to march.
 *
 * Used to be the nearest enemy thing, full stop, and that turned out to be the
 * reason wars never went anywhere. An army always engaged whatever sat on its
 * own border; take that city and the next-nearest target is the next border
 * city, while the defender retakes the first. The front oscillated instead of
 * advancing, and eighty-five per cent of attacks on cities happened within four
 * tiles of home -- not because supply stopped there, which was the theory, but
 * because that is where the AI was choosing to go. See DESIGN_QUEUE 53.
 *
 * So weakness counts as well as distance. What it does *not* do is read a
 * garrison it cannot see: a city whose tile is not currently visible is scored
 * at the midpoint, so the AI is neither drawn to nor warned off a defence it
 * has no business knowing about.
 */
function nearestEnemyTarget(
  state: GameState,
  playerId: number,
  from: Unit,
): { x: number; y: number } | null {
  const player = state.players[playerId];
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  const consider = (x: number, y: number, weight: number, hardness: number) => {
    if (!player.explored[idx(x, y, state.width)]) return;
    const dist = distance(from.x, from.y, x, y) * weight * (1 + hardness * HARD_TARGET);
    if (dist < bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  };

  for (const c of state.cities) {
    if (c.owner === playerId) continue;
    const i = idx(c.x, c.y, state.width);
    let hardness = 0.5;
    if (player.visible[i]) {
      const guard = state.units.find((u) => u.x === c.x && u.y === c.y);
      const held = guard ? unitType(guard.type).defense * headcount(guard) : 0;
      hardness = Math.min(1, held / GUARD_REFERENCE);
    }
    const begun =
      state.players[c.owner]?.endingBegunAt !== undefined &&
      (hasEndingPiece(c) || capitalOf(state, c.owner)?.id === c.id);
    consider(c.x, c.y, endingOpen(c) ? ENDING_PULL : begun ? BEGUN_PULL : 1, hardness);
  }
  for (const u of state.units) {
    if (u.owner !== playerId && player.visible[idx(u.x, u.y, state.width)]) {
      consider(u.x, u.y, 1.6, 0);
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
/**
 * What reach is worth, on top of the raw numbers.
 *
 * A ranged attacker strikes without being struck back, which no figure built
 * out of attack, health and price can see. Leaving it out had a precise cost:
 * the Horde's only ranged unit is its *worst* combat buy at 1.60 against an
 * ogre's 2.26, so it was never built once in eighteen games, while the
 * Kingdom's ballista tops its list and gets built ten times a game. Teaching
 * the AI to shoot therefore handed the Kingdom eighty-seven free attacks a game
 * and the Horde nothing at all. See DESIGN_QUEUE section 38.
 *
 * Switched off once, and back on now, for a reason worth recording. On its own
 * it was poison: it never produced the axethrower it was added for -- zero at
 * 1.05, 1.15 and 1.4 alike -- and it took the Kingdom from ten ballistas a game
 * to a hundred and eleven, because nothing in the formula pushed back against a
 * unit that could hit without being hit and keep doing it forever.
 *
 * Ammunition is that push-back. Reach is worth something real, and now that a
 * ballista runs dry after three shots the two can be priced against each other
 * rather than one of them being left out. See DESIGN_QUEUE section 40.
 */

/**
 * What a free opening blow is worth, per strike.
 *
 * Shipped in the same commit as the mechanic on purpose. A mechanic the chooser
 * cannot see is a mechanic that never happens -- sections 30, 31, 34, 37 and 38
 * are all the same finding in different clothes.
 *
 * A fight runs a handful of rounds, so one free round is worth something like a
 * sixth of it. Deliberately modest, for the reason directly above.
 */
const FIRST_STRIKE_EDGE = 0.16;

/**
 * Turns a reload costs somebody, for pricing a magazine.
 *
 * A piece fires its whole magazine, then a neighbour spends a turn handing over
 * one missile -- or it walks back to a city. So what a shooter is worth is the
 * share of its turns it spends shooting: `ammo / (ammo + this)`. A ballista
 * with three bolts is therefore three quarters of an unlimited one, which is
 * roughly what turned a hundred and eleven of them into a sane number.
 */
const RELOAD_COST = 1;
const RANGED_EDGE = 1.15;

function worth(u: UnitTypeDef, defending: boolean): number {
  const strength = defending ? u.defense : u.attack;
  // Only on the attack: reach does nothing for you when something has already
  // closed and is swinging at you, which is exactly a ranged unit's problem.
  const reach = !defending && u.range > 1 ? RANGED_EDGE : 1;
  // First strikes count on both attack and defence: the free blow lands
  // whichever side of the fight this unit is standing on.
  const opener = 1 + u.firstStrikes * FIRST_STRIKE_EDGE;
  // A magazine is a duty cycle. Without this the chooser sees only that a
  // ballista hits hard and cannot be hit back, which is how it came to build a
  // hundred and eleven of them and keep none of them loaded.
  const supply = u.ammo > 0 ? u.ammo / (u.ammo + RELOAD_COST) : 1;
  return (strength * reach * opener * supply * u.hp) / Math.max(1, u.cost);
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

/**
 * How sharply the chooser prefers the better unit.
 *
 * Weights are `worth ** this`, so 1 buys almost at random and a large number
 * reproduces the old behaviour of always taking the best. Four keeps a good
 * unit several times likelier than a mediocre one -- on the Kingdom's list a
 * paladin comes out about eight times as often as a footman -- while still
 * fielding a mixture.
 */
const MIX_SHARPNESS = 4;

/**
 * Buy in proportion to worth rather than always buying the best.
 *
 * Step 4 used to sort by value and take the single best affordable unit, which
 * meant a unit's value never mattered -- only whether it *crossed* another unit
 * in the ranking. Measured: moving a ballista's value by 17% moved production
 * from half a ballista a game to ninety-three, because it stepped over a knight
 * and then a paladin. Every constant in DESIGN_QUEUE was a cliff edge rather
 * than a dial, and much of the tuning recorded there was really an attempt to
 * land a number in the gap between two other numbers. See section 40.
 *
 * It also produces an army worth having. A hundred ballistas and nothing to
 * storm a city with is not a strategy, and section 38 measured exactly that.
 *
 * Uses the seeded RNG, so a game stays reproducible from its seed.
 */
function pickWeighted(
  state: GameState,
  candidates: UnitTypeDef[],
  defending: boolean,
): UnitTypeDef {
  if (candidates.length <= 1) return candidates[0];
  const weights = candidates.map((u) =>
    Math.pow(Math.max(0.01, worth(u, defending)), MIX_SHARPNESS),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  return withRng(state, (rng) => {
    let roll = rng.float() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  });
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
  if (city.size >= contentLimit(state, city) - AI_TUNING.calmBuildAhead) {
    // Only one it would actually get the benefit of. A Posting calms a city
    // while two soldiers stand around it, and this AI keeps one -- so without
    // this check it would spend thirty shields and an upkeep on a building
    // that does nothing, and go on rioting. Asked through `soldiersFor`, the
    // same question the rule asks: this used to count the city tile, which can
    // only ever hold one, so the answer was always no (section 101).
    const calming = options.buildings.find(
      (b) =>
        b.contentBonus &&
        !(!POSTING.enabled && b.garrisonNeeded) &&
        garrisonNeededBy(b) <= soldiersFor(state, city, b),
    );
    if (calming) return { kind: 'building', id: calming.id };
    // Only when it is actually rioting, and only when there is nothing left to
    // build that would help. Placating costs the city its whole production,
    // which is no loss at all while it is producing nothing anyway -- but a
    // city merely approaching its limit is still working, and should carry on.
    if (city.disorder) return { kind: 'calm' };
  }

  // 3a. A work towards an ending, where one can be built. Behind the garrison,
  // because a work in an empty city is a work the other side walks in and tears
  // down; and behind the lid on the riots, because a rioting city builds nothing.
  // This first sat ahead of both, and the Horde's Portal stood at 134 shields of
  // 240 for sixty-four turns in a capital that rioted the whole time and was
  // never once told to build a Totem. After expanding, which rarely applies this
  // late, and ahead of everything else. `buildOptions` already keeps each work to
  // one city at a time and the final one to the capital. Section 110.
  // A lesser work only in one of the empire's two busiest cities: the first come
  // took it before, and a Knocking Stones begun in a town of size one needed forty
  // turns while nobody else was allowed to start one. The final work is the
  // capital's anyway.
  const ending = options.buildings.find(
    (b) => isEndingPiece(b) && (!!b.victory || amongBusiest(state, city, 2)),
  );
  if (ending) return { kind: 'building', id: ending.id };

  // 3a'. A folly (section 111), in one of the empire's two busiest cities, and only
  // one under way at a time. After the endings, which win the game; ahead of the
  // rest, because there is only one of each and somebody else may get there first.
  // One at a time so twelve of them cannot crowd out an army.
  const follyUnderWay = playerCities(state, city.owner).some(
    (c) => c.id !== city.id && c.producing.kind === 'building' && isFolly(BUILDINGS[c.producing.id]),
  );
  // A shared one first, always: it is the only kind that can be lost to somebody
  // else, and an empire that spends its one folly slot on a building nobody is
  // racing it for hands over every contested one. The Kingdom took the Long Peace
  // five times of five and the Spire six of six while both sides built in the
  // order the list happened to offer.
  const offered = options.buildings.filter((b) => isFolly(b) && amongBusiest(state, city, 2));
  const folly = follyUnderWay
    ? undefined
    : ((AI_TUNING.sharedFollyFirst ? offered.find((b) => b.folly === 'world') : undefined) ?? offered[0]);
  if (folly) return { kind: 'building', id: folly.id };

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

  // 3d. Roads, once there is nothing left to found.
  //
  // Only after expansion is done, so a Peon built to dig can never be counted
  // against a city that still wants founding -- the entanglement section 28
  // warned about. Counted with the workers already being built elsewhere,
  // because every city chooses in turn and would otherwise all pick one at once.
  if (
    AI_TUNING.buildRoads &&
    cities >= personality.targetCities &&
    city.size >= SETTLER.minCitySize &&
    hasFlag(owner, 'bridges')
  ) {
    const workers =
      settlers +
      playerCities(state, city.owner).filter(
        (c) => c.id !== city.id && c.producing.kind === 'unit' && unitType(c.producing.id).settler,
      ).length;
    const wanted = Math.max(1, Math.floor(cities / AI_TUNING.citiesPerRoadWorker));
    const worker = options.units.find((u) => u.settler);
    if (
      worker &&
      workers < wanted &&
      (roadWorkToDo(state, city.owner) ||
        (AI_TUNING.buildPosts && postWorkToDo(state, city.owner)))
    ) {
      return { kind: 'unit', id: worker.id };
    }
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
  const budget = 40 + city.size * 22;
  const affordable = attackers.filter((u) => u.cost <= budget);
  // Weighted among everything this city could actually finish, rather than
  // always the single best -- see pickWeighted. Falls back to whatever is
  // cheapest when nothing is affordable, rather than to the bottom of the value
  // ranking, which is the worst unit on the list and not the one a small city
  // can finish.
  const pick =
    affordable.length > 0
      ? pickWeighted(state, affordable, false)
      : [...attackers].sort((a, b) => a.cost - b.cost)[0];
  if (pick) return { kind: 'unit', id: pick.id };
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

/** Whether any city of this player's is not yet joined to its capital by road. */
/**
 * Cities of ours that want a garrison post and have not got enough.
 *
 * Only cities that are actually unhappy -- at their content limit or one short
 * of it. Section 108's lesson applied before it had to be learned twice: a rule
 * that spends workers and pins soldiers everywhere costs more than it can
 * possibly pay, so this only fires where there is a riot to stop.
 */
function cityWantsPost(state: GameState, city: City): boolean {
  if (!POSTS.enabled) return false;
  if (city.size < contentLimit(state, city) - 1) return false;
  return postsAround(state, city) < POSTS.maxPerCity;
}

/** Garrison posts standing on this city's own land, manned or not. */
function postsAround(state: GameState, city: City): number {
  if (!state.posts) return 0;
  let n = 0;
  for (const i of fatCrossIndices(city.x, city.y, state.width, state.height)) {
    if (state.posts[i] === 1) n++;
  }
  return n;
}

/** Whether any city of ours is short of a post, which is what a worker is for. */
function postWorkToDo(state: GameState, playerId: number): boolean {
  return playerCities(state, playerId).some((c) => cityWantsPost(state, c));
}

/**
 * Give a worker a post to build: the nearest unhappy city of ours that wants
 * one, on the free tile beside it.
 *
 * Beside it rather than out at the edge of its land, because a soldier has to
 * walk there too and every tile further out is another turn of somebody not
 * fighting. A city another worker is already walking to is left to that one.
 */
function takePostJob(state: GameState, unit: Unit): boolean {
  if (!POSTS.enabled || !unitType(unit.type).settler) return false;
  const claimed = playerUnits(state, unit.owner)
    .filter((u) => u.id !== unit.id && u.goto && unitType(u.type).settler)
    .map((u) => u.goto!);
  const wanting = playerCities(state, unit.owner)
    .filter((c) => cityWantsPost(state, c))
    .filter((c) => !claimed.some((g) => distance(g.x, g.y, c.x, c.y) <= 1))
    .sort(
      (a, b) =>
        distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y) || a.id - b.id,
    )[0];
  if (!wanting) return false;

  const spot = DIRS8.map(([dx, dy]) => ({ x: wanting.x + dx, y: wanting.y + dy }))
    .filter((t) => {
      if (t.x < 0 || t.y < 0 || t.x >= state.width || t.y >= state.height) return false;
      const i = idx(t.x, t.y, state.width);
      if (TERRAIN[state.terrain[i]].water || state.posts?.[i] === 1) return false;
      if (state.cities.some((c) => c.x === t.x && c.y === t.y)) return false;
      return !state.units.some((u) => u.x === t.x && u.y === t.y && u.id !== unit.id);
    })
    .sort(
      (a, b) =>
        distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y) ||
        a.y - b.y ||
        a.x - b.x,
    )[0];
  if (!spot) return false;
  if (unit.x !== spot.x || unit.y !== spot.y) {
    if (!routeTo(state, unit, spot.x, spot.y)) return false;
    moveToward(state, unit, spot.x, spot.y);
    if (unit.x !== spot.x || unit.y !== spot.y) return true;
  }
  return startPost(state, unit);
}

function roadWorkToDo(state: GameState, playerId: number): boolean {
  const seat = capitalOf(state, playerId);
  if (!seat) return false;
  const joined = connectedByRoad(state, playerId, seat.x, seat.y);
  return playerCities(state, playerId).some((c) => !joined.has(idx(c.x, c.y, state.width)));
}

/**
 * Give a worker a road to lay: join the nearest city of ours to the capital.
 *
 * The capital because that is the shape of the supply chain, and joining every
 * city to one place joins every city to every other. The nearest unjoined city
 * because a worker walking across the empire before it starts is a worker not
 * digging. A city another worker is already marching to is left to that one.
 *
 * The road itself is Road To, the same order a person gives: dig where the
 * ground wants it, walk over road already down, stop at the capital.
 */
function takeRoadJob(state: GameState, unit: Unit): boolean {
  if (!canLayRoads(state, unit).ok) return false;
  const seat = capitalOf(state, unit.owner);
  if (!seat) return false;
  const joined = connectedByRoad(state, unit.owner, seat.x, seat.y);
  // Other road crews only. This used to be every unit of ours with a goto, which
  // quietly included a soldier marching to hold that same city -- and since
  // section 108 a claim covers the doorstep too, so counting soldiers would have
  // made half the empire look taken.
  const claimed = playerUnits(state, unit.owner)
    .filter((u) => u.id !== unit.id && u.goto && unitType(u.type).settler)
    .map((u) => u.goto!);
  const open = playerCities(state, unit.owner).filter((c) => {
    if (joined.has(idx(c.x, c.y, state.width))) return false;
    // Claimed by somebody walking to the city or to a tile beside it: since
    // section 108 a crew often cannot stand in the gate, so a claim is a claim
    // on the neighbourhood.
    return !claimed.some((g) => distance(g.x, g.y, c.x, c.y) <= 1);
  });
  if (open.length === 0) return false;
  const target = open.reduce((a, b) =>
    distance(unit.x, unit.y, a.x, a.y) <= distance(unit.x, unit.y, b.x, b.y) ? a : b,
  );
  const spot = roadStart(state, unit, target);
  if (!spot) return false;
  if (!(unit.x === spot.x && unit.y === spot.y)) {
    if (!routeTo(state, unit, spot.x, spot.y)) return false;
    moveToward(state, unit, spot.x, spot.y);
    if (!(unit.x === spot.x && unit.y === spot.y)) return true;
  }
  return startRoadTo(state, unit, seat.x, seat.y).ok;
}

/**
 * Where a road crew stands to start a job at this city.
 *
 * The gate itself when it is free, and otherwise the nearest open tile beside
 * it. Since section 108 a soldier stands in every city and one unit to a tile
 * means the crew can no longer walk in -- and it does not need to. A road that
 * ends beside a city is joined to it: `connectedByRoad` counts a city tile as
 * road and walks diagonals, so a road to the doorstep is a road to the door.
 */
function roadStart(state: GameState, unit: Unit, city: City): { x: number; y: number } | null {
  const free = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < state.width &&
    y < state.height &&
    !TERRAIN[state.terrain[idx(x, y, state.width)]].water &&
    !state.units.some((u) => u.x === x && u.y === y && u.id !== unit.id);
  if (free(city.x, city.y)) return { x: city.x, y: city.y };
  const around = DIRS8.map(([dx, dy]) => ({ x: city.x + dx, y: city.y + dy }))
    .filter((t) => free(t.x, t.y))
    .sort(
      (a, b) =>
        distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y) ||
        a.y - b.y ||
        a.x - b.x,
    );
  return around[0] ?? null;
}

/**
 * Whether this city would be over its limit if this soldier walked off the post
 * it is standing on.
 *
 * Asked that way round because the calm the post pays is already inside the
 * limit: "is the city unhappy" is false precisely because the soldier is doing
 * its job, so it would walk off and the riot would start.
 */
function needsUsHere(state: GameState, city: City, unit: Unit): boolean {
  const onIts = fatCrossIndices(city.x, city.y, state.width, state.height).includes(
    idx(unit.x, unit.y, state.width),
  );
  return onIts && city.size >= contentLimit(state, city) - POSTS.contentBonus;
}

/** The nearest empty post on the land of a city of ours that is close to rioting. */
function emptyPostFor(
  state: GameState,
  unit: Unit,
  mine: City[],
): { x: number; y: number } | null {
  if (!state.posts) return null;
  let best: { x: number; y: number } | null = null;
  let away = Infinity;
  for (const city of mine) {
    if (city.size < contentLimit(state, city)) continue;
    for (const i of fatCrossIndices(city.x, city.y, state.width, state.height)) {
      if (state.posts[i] !== 1) continue;
      const x = i % state.width;
      const y = Math.floor(i / state.width);
      if (state.units.some((u) => u.x === x && u.y === y)) continue;
      const d = distance(unit.x, unit.y, x, y);
      if (d < away) {
        away = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/**
 * Whether the ground here is somebody else's.
 *
 * The nearest city decides it, which is the same rough answer a player would
 * give looking at the map and costs nothing to work out. Roads have no owner --
 * a road does not know whose it is -- so "their road" can only ever mean a road
 * in their part of the world.
 */
function onEnemyGround(state: GameState, unit: Unit): boolean {
  let best: City | null = null;
  let away = Infinity;
  for (const c of state.cities) {
    const d = distance(unit.x, unit.y, c.x, c.y);
    if (d < away) {
      away = d;
      best = c;
    }
  }
  return !!best && best.owner !== unit.owner;
}

/**
 * Whether this city has something in it that pays nothing without a soldier
 * standing in the city itself.
 *
 * The treasury's question, not the Posting's: `garrisonNeeded` counts the ring
 * around the city and is somebody else's problem, while `needsGarrison` means
 * one body in the gate, which is a job a single soldier can finish.
 */
/** Whether this city is among its owner's `n` most productive, by shields a turn. */
function amongBusiest(state: GameState, city: City, n: number): boolean {
  return playerCities(state, city.owner)
    .map((c) => ({ id: c.id, shields: cityYield(state, c).shields }))
    .sort((a, b) => b.shields - a.shields)
    .slice(0, n)
    .some((r) => r.id === city.id);
}

function wantsKeeper(state: GameState, city: City): boolean {
  // Section 110: a city building or holding a work towards an ending. The first
  // production rule refills an empty city, and the shields saved for the work pay
  // for the new defender -- the Horde's Portal fell from 168 of 240 to 24 in eight
  // turns that way. Somebody stays home instead, and the work keeps its shields.
  const item = city.producing;
  if (hasEndingPiece(city) || (item.kind === 'building' && isEndingPiece(BUILDINGS[item.id]))) {
    return true;
  }
  return workingBuildings(state, city).some((b) => {
    const def = BUILDINGS[b];
    return !!def && def.needsGarrison && def.garrisonNeeded === undefined;
  });
}

function actSettler(state: GameState, unit: Unit, personality: AiPersonality): void {
  const cities = playerCities(state, unit.owner).length;

  // Once there is nothing left to found, a worker digs. Below the target it is a
  // settler exactly as before.
  if (AI_TUNING.buildRoads && cities >= personality.targetCities) {
    if (unit.roadTo || unit.order === 'road') return;
    if (takeRoadJob(state, unit)) return;
  }
  // Section 102: a post for a city that is about to riot. After roads, which are
  // worth more and are wanted by every city rather than only the unhappy ones.
  if (AI_TUNING.buildPosts && cities >= personality.targetCities) {
    if (unit.order === 'post') return;
    if (takePostJob(state, unit)) return;
  }
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

/**
 * Go and get another axe.
 *
 * A thrower that has thrown its axe fights at a quarter strength until it
 * restocks, and `resupply` was called from the interface and nowhere else --
 * so the moment the AI learned to shoot, the Horde's only ranged unit became a
 * quarter of a unit permanently. The Kingdom's three ranged units all keep
 * their weapons, so this asymmetry cost the Horde the war rather than a fight:
 * 18-16 became 12-20 on the same seeds. See DESIGN_QUEUE section 38.
 *
 * Capped on distance. Walking eight tiles home is a fair price for getting a
 * unit back; walking twenty is worse than fighting on with a rock.
 */
const RESTOCK_RANGE = 8;

function restockIfNeeded(state: GameState, unit: Unit): boolean {
  const type = unitType(unit.type);
  const wantsAxe = unit.disarmed && type.throwsWeapon;
  // Only when it is completely dry. A piece with one bolt left should spend it,
  // not walk across the map to make the number tidy.
  const wantsMissiles = type.ammo > 0 && ammoLeft(unit) <= 0;
  if (!wantsAxe && !wantsMissiles) return false;
  if (resupplyBlocked(state, unit) === null) return resupply(state, unit);

  const cities = playerCities(state, unit.owner);
  if (cities.length === 0) return false;
  const nearest = cities.reduce((a, b) =>
    distance(unit.x, unit.y, b.x, b.y) < distance(unit.x, unit.y, a.x, a.y) ? b : a,
  );
  if (distance(unit.x, unit.y, nearest.x, nearest.y) > RESTOCK_RANGE) return false;
  return moveToward(state, unit, nearest.x, nearest.y).kind !== 'blocked';
}

/**
 * Shoot something, if anything is standing at exactly the right distance.
 *
 * The AI has never once used an ability -- `useAbility` was called from the
 * interface and nowhere else -- so every archer, axethrower, ballista and mage
 * it has ever built walked into melee and swung. That is the worst possible use
 * of them: a ballista has a defence of one and twelve hit points, and the
 * production chooser rates it the Kingdom's best buy off an attack of eight.
 * See DESIGN_QUEUE section 38.
 *
 * Targets are ranked by worth over remaining health, which prefers finishing
 * something valuable and wounded to scratching something fresh.
 */
function fireIfPossible(state: GameState, unit: Unit): boolean {
  if (abilityReady(unit, 'ranged') !== null) return false;
  const targets = abilityTargets(state, unit, 'ranged');
  if (targets.length === 0) return false;
  const rank = (t: Unit) => worth(unitType(t.type), false) / Math.max(1, t.hp);
  const best = targets.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  useAbility(state, unit, 'ranged', best);
  return true;
}

/**
 * Step to somewhere a shot is actually possible.
 *
 * Reach is *exactly* one distance -- a ranged unit cannot lob one at somebody
 * standing next to it -- so a unit that simply marches at the enemy walks
 * straight through its own firing position and ends up in a brawl. This looks
 * for a reachable tile at exactly that distance from something, and with
 * nothing closer, which also walks a unit that is already in a brawl back out
 * of one.
 */
function takeAim(state: GameState, unit: Unit): boolean {
  const reach = unitType(unit.type).range;
  if (reach <= 1) return false;
  const seen = state.players[unit.owner].visible;
  const w = state.width;
  const enemies = state.units.filter(
    (u) => u.owner !== unit.owner && seen[u.y * w + u.x],
  );
  if (enemies.length === 0) return false;

  let bestIdx: number | null = null;
  let bestCost = Infinity;
  for (const [idx, cost] of reachableTiles(state, unit)) {
    const x = idx % w;
    const y = Math.floor(idx / w);
    const nearest = Math.min(...enemies.map((e) => distance(x, y, e.x, e.y)));
    // Exactly at reach, and nothing has closed inside it.
    if (nearest !== reach) continue;
    if (cost < bestCost) {
      bestCost = cost;
      bestIdx = idx;
    }
  }
  if (bestIdx === null) return false;
  const outcome = moveToward(state, unit, bestIdx % w, Math.floor(bestIdx / w));
  return outcome.kind !== 'blocked';
}

/**
 * A tile beside the target that can actually be walked to.
 *
 * The pathfinder refuses to enter enemy ground -- "entered by attacking or
 * capturing, never by pathing" -- and `nearestEnemyTarget` returns exactly
 * that: an enemy city or an enemy unit. So asking for a route *to* the target
 * returned null every single time, and the march on the enemy has never once
 * moved a unit. Instrumented over six games: the branch was reached 31,826
 * times, found a target 31,576 times, and moved somebody on none of them.
 *
 * That is why wars stayed on the border. Units only ever travelled by the
 * explore branch or the jam-breaking shuffle below, so they drifted rather than
 * marched, and fought whatever they happened to bump into. See DESIGN_QUEUE 55.
 *
 * Neighbours are tried nearest-first and the first reachable one wins, so this
 * is usually a single path search rather than eight.
 */
function approachTile(
  state: GameState,
  unit: Unit,
  tx: number,
  ty: number,
): { x: number; y: number } | null {
  const spots = DIRS8.map(([dx, dy]) => ({ x: tx + dx, y: ty + dy }))
    .filter((p) => p.x >= 0 && p.y >= 0 && p.x < state.width && p.y < state.height)
    .sort(
      (a, b) =>
        distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y),
    );
  for (const spot of spots) {
    if (unit.x === spot.x && unit.y === spot.y) return spot;
    if (routeTo(state, unit, spot.x, spot.y)) return spot;
  }
  return null;
}

/** How far a soldier will go out of its way to walk beside a settler. */
const ESCORT_RANGE = 6;

/**
 * Walk with a settler that has nobody with it.
 *
 * `guardedAt` was the only escort-shaped code here, and all it asked was
 * whether something of ours *happened* to be next to a settler at the moment of
 * founding. Nothing arranged a guard and nothing walked one alongside; settlers
 * travelled alone, every time. See DESIGN_QUEUE section 18.
 *
 * Deliberately placed after fighting and after holding a bare city, so this is
 * what a soldier does when it has nothing more urgent on -- an army that
 * abandoned a siege to chaperone a peon would be a worse bug than the one being
 * fixed. Bounded by `ESCORT_RANGE` for the same reason: a soldier on the far
 * side of the map is not the right escort even if it is the only volunteer.
 *
 * A settler counts as escorted the moment anything of ours that can fight is
 * beside it, so once one soldier arrives the rest stop volunteering.
 */
function escortDuty(state: GameState, unit: Unit): boolean {
  if (unitType(unit.type).settler || unitType(unit.type).attack <= 0) return false;

  let best: Unit | null = null;
  let bestDist = ESCORT_RANGE + 1;
  for (const settler of playerUnits(state, unit.owner)) {
    if (!unitType(settler.type).settler) continue;
    // Only ones actually going somewhere. A settler parked on sentry once the
    // empire has enough cities would otherwise hold a guard beside it for the
    // rest of the game, and an army slowly evaporates into chaperones.
    if (settler.order === 'sentry' || settler.order === 'fortified') continue;
    // Nor ones digging a road. A road crew works at home, between cities that
    // are already ours, and pulling a soldier off the front to stand beside it
    // is the chaperone problem above in a new coat.
    if (settler.order === 'road' || settler.roadTo) continue;
    const guarded = state.units.some(
      (u) =>
        u.owner === unit.owner &&
        u.id !== settler.id &&
        !unitType(u.type).settler &&
        unitType(u.type).attack > 0 &&
        distance(u.x, u.y, settler.x, settler.y) <= 1,
    );
    if (guarded) continue;
    const d = distance(unit.x, unit.y, settler.x, settler.y);
    if (d < bestDist) {
      bestDist = d;
      best = settler;
    }
  }
  if (!best) return false;

  // Already alongside: hold, rather than shuffling, so the pair travels together
  // instead of the guard orbiting it. Movement is left unspent so the escort
  // can still be pulled into a fight next to it -- burning the turn here froze
  // guards in place and thinned the army enough to show up in the variety test.
  if (bestDist <= 1) return true;
  return moveToward(state, unit, best.x, best.y).kind !== 'blocked';
}

function actSoldier(
  state: GameState,
  unit: Unit,
  personality: AiPersonality,
  frontier: Array<[number, number]>,
): void {
  // An empty-handed thrower is a quarter of a unit; getting it an axe back is
  // worth more than anything else it could do with the turn.
  if (restockIfNeeded(state, unit)) return;

  // Reach first. A unit that can shoot should shoot, and one that cannot shoot
  // from where it stands should go and stand somewhere it can.
  if (fireIfPossible(state, unit)) return;
  if (unitType(unit.type).range > 1 && takeAim(state, unit)) {
    fireIfPossible(state, unit);
    return;
  }

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

  // Section 96: tear up the enemy's road while standing on it. Only on their
  // ground -- ours is ours, and a road we wrecked at home is a road we dug at
  // home -- and only now, after the attacking branches above, because a turn
  // spent wrecking is a turn not spent fighting.
  if (AI_TUNING.pillage && onEnemyGround(state, unit) && pillage(state, unit)) return;

  // A lone troll standing in a swamp, with a friend to make and the health to
  // spare. Before feeding the guns, because it is the rarer opportunity and it
  // costs the same turn.
  if (abilityReady(unit, 'split') === null) {
    const self = abilityTargets(state, unit, 'split');
    if (self.length > 0 && useAbility(state, unit, 'split', self[0]).ok) return;
  }

  // Nothing better to do? Feed the gun next door. Deliberately this late: it
  // costs the helper its whole turn, so it should be what a unit does when it
  // was not going to fight anyway.
  if (abilityReady(unit, 'reload') === null) {
    const dry = abilityTargets(state, unit, 'reload').filter((t) => ammoLeft(t) <= 0);
    if (dry.length > 0) {
      useAbility(state, unit, 'reload', dry[0]);
      return;
    }
  }

  // Somebody has to walk with the settlers.
  if (escortDuty(state, unit)) return;

  // Somebody has to mind the gold.
  //
  // Section 108: a Goblin Treasury or a Simple Market pays nothing at all
  // unless a soldier is standing in the city, and the AI's cities were empty
  // most of the time -- the rule below could walk a unit to a city, but nothing
  // ever kept it there, so a garrison walked in one turn and marched out to the
  // war the next.
  //
  // Deliberately narrow, and the narrowness is the whole design. Keeping a
  // soldier in *every* city was tried and measured: 36 of 108 games flipped to
  // the Kingdom, the Horde lost two cities and twenty citizens a game, fights
  // rose by twenty and road building collapsed, because the side that wins by
  // attacking had its army standing at home. So this is only the cities that
  // have something in them waiting on a body, which is a handful of them and
  // only once the building has been paid for.
  const ownCities = playerCities(state, unit.owner);
  if (AI_TUNING.guardTheGold) {
    const here = ownCities.find((c) => c.x === unit.x && c.y === unit.y);
    // The only soldier in a city whose building is waiting on one stays. A
    // second one passing through is free to carry on.
    if (here && wantsKeeper(state, here) && garrisonSize(state, here) <= 1) {
      unit.order = 'fortified';
      return;
    }
    const wanting = ownCities
      .filter((c) => garrisonSize(state, c) === 0 && wantsKeeper(state, c))
      .sort(
        (a, b) =>
          distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y) || a.id - b.id,
      )[0];
    if (wanting && distance(unit.x, unit.y, wanting.x, wanting.y) <= 8) {
      if (routeTo(state, unit, wanting.x, wanting.y)) {
        moveToward(state, unit, wanting.x, wanting.y);
        return;
      }
    }
  }

  // Section 102: stand on a post, which is what a post is for. The same shape as
  // the gold above and the same narrowness -- only where a city is about to
  // riot, and one soldier a post, since one is all a tile holds.
  if (AI_TUNING.buildPosts && POSTS.enabled && state.posts) {
    const onPost = state.posts[idx(unit.x, unit.y, state.width)] === 1;
    const mine = playerCities(state, unit.owner);
    if (onPost && mine.some((c) => needsUsHere(state, c, unit))) {
      unit.order = 'fortified';
      return;
    }
    const empty = emptyPostFor(state, unit, mine);
    if (empty && distance(unit.x, unit.y, empty.x, empty.y) <= 8) {
      if (routeTo(state, unit, empty.x, empty.y)) {
        moveToward(state, unit, empty.x, empty.y);
        return;
      }
    }
  }

  // Hold undefended home cities.
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
  if (target) {
    // The doorstep, not the door. Routing to the target itself asks the
    // pathfinder for a tile it treats as impassable, which is why this never
    // worked; arriving next door is enough, because the attack branch at the
    // top of this function takes it from there next turn.
    const spot = approachTile(state, unit, target.x, target.y);
    if (spot && (spot.x !== unit.x || spot.y !== unit.y)) {
      moveToward(state, unit, spot.x, spot.y);
      return;
    }
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
   * Whether a shared folly is preferred over one of its own. Section 111.
   *
   * A shared folly is the only building in the game somebody else can take from
   * you. Spending the one folly a city builds at a time on something nobody is
   * racing for hands over every contested one, which is what happened: the
   * Kingdom took the Long Peace five times of five and the Spire six of six.
   */
  sharedFollyFirst: true,
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
   * whole reason gold exists now -- but the AI does not use it.
   *
   * **Re-measured once the city gap closed, and the trigger was wrong.** That
   * condition is now met -- section 61 has mean cities held at 5.81 against
   * 5.87 -- and switching this on still costs the Horde ten games in a hundred
   * and eight, 60-48 becoming 50-58 across two seed sets. In one of them the
   * Horde held *more* cities than the Kingdom and lost ground anyway.
   *
   * The driver is not city count and never was. It is that the Kingdom banks
   * 55 to 70 per cent more gold -- 836 and 930 against 533 and 553 in the
   * control arms -- so allowing anybody to spend hands it proportionally more
   * to spend. The condition for re-opening this is therefore **the gold gap
   * closing, not the city gap**, and nothing has closed it.
   *
   * See DESIGN_QUEUE section 65.
   */
  rushBuying: false,

  /**
   * How far below the content limit a city starts building something calming.
   *
   * One means "the turn before it riots", which is one turn of warning for a
   * city that grows every twelve and needs forty shields. Section 85 named this
   * as a lever and did not pull it.
   */
  calmBuildAhead: 1,

  /**
   * What a city merely *at* the limit is worth when the empire decides how much
   * trade to spend on keeping people calm.
   *
   * A city already rioting counts two. This one counts a city that is one
   * citizen from rioting, so raising it buys calm before the production is
   * lost rather than after. Section 85.
   */
  calmRateAtLimit: 1,
  goldReserve: 60,
  /**
   * Buy the thing that lasts, rather than the thing that is cheapest.
   *
   * Cheapest-first turned out to mean "a cheap unit, every single turn": with
   * a thin reserve the AI bought about thirty times a game and finished with
   * *fewer* standing buildings than when it could not spend at all.
   */
  preferBuildings: false,

  /**
   * Whether the AI lays roads.
   *
   * Once it holds its target number of cities and knows Bridge Building, a
   * spare worker joins the nearest city not yet on the road network to the
   * capital, and a city builds a worker while there is still road to lay. Below
   * the target a Peon is a settler exactly as it always was, so nothing about
   * expansion changes. A lever so roads can be measured as an arm, which they
   * could not be while only a person could build one. Section 107.
   */
  buildRoads: true,
  /** Cities per road worker the AI keeps once expansion is done. */
  citiesPerRoadWorker: 4,
  /**
   * Whether a soldier stays in a city whose buildings are waiting on one.
   *
   * Section 108: with this off, the AI's treasuries and markets -- which pay
   * nothing without somebody standing in the city -- earn nothing for the whole
   * game, because a garrison walks in one turn and marches out the next. Narrow
   * on purpose: holding *every* city was measured and cost the Horde 36 games
   * in 108.
   */
  guardTheGold: true,
  /**
   * Whether the AI tears up roads it finds in enemy country.
   *
   * Section 96. A lever because it trades a turn of fighting for a turn of
   * wrecking, and which of those is worth more is exactly the question.
   */
  pillage: true,
  /**
   * Whether the AI builds garrison posts and stands soldiers on them.
   *
   * Section 102. Both halves behind one lever, because half of it is useless: a
   * post nobody stands on calms nothing, and a soldier standing in a field is a
   * soldier standing in a field.
   */
  buildPosts: true,
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

/**
 * Set the empire's trade split the way a player would.
 *
 * The three-way split arrives with an even default, which is the right place
 * for a *human* to start from because they can move off it. The AI never moved
 * off it, and an even split is a poor permanent setting: measured against the
 * old fixed rate it cost the AI a fifth of its research and took the Horde from
 * 10-19 to 4-29. A default nobody adjusts is not a default, it is a rule. See
 * DESIGN_QUEUE section 47.
 *
 * The policy is deliberately dull: buy exactly as much calm as the cities are
 * actually asking for, and put the rest into study, which is what wins games
 * that are not already won.
 */
function manageRates(state: GameState, player: Player): void {
  const cities = playerCities(state, player.id);
  if (cities.length === 0) return;

  let wanted = 0;
  for (const city of cities) {
    // A riot is worth more than a city merely getting close to one, and a
    // riot is also the thing no building can reach in time.
    if (city.disorder) wanted += 2;
    else if (city.size >= contentLimit(state, city)) wanted += AI_TUNING.calmRateAtLimit;
  }
  const calm = Math.min(TRADE_STEPS - 2, wanted);
  const rest = TRADE_STEPS - calm;
  // Roughly the split the game shipped with before there was a third heading:
  // two parts study to one part coin.
  const coin = Math.max(1, Math.round(rest / 3));
  player.rates = { coin, beakers: rest - coin, calm };
}

function takePromotions(state: GameState, player: Player): void {
  const taste = PERK_TASTE[player.faction] ?? PERK_TASTE.orc;
  for (const unit of playerUnits(state, player.id)) {
    while (owedPerks(unit) > 0) {
      const options = perkChoices(unit, flagsOf(player));
      if (options.length === 0) break;
      // A unit-specific perk first, whenever one is going.
      //
      // Without this the clubs would never be taken at all: the taste list
      // holds all six general perks and rank stops at three, so the fallback
      // below is never reached. That is the same trap as sections 37 and 38 --
      // a mechanic the AI has no route to is a mechanic that does not happen --
      // and this time it was spotted before it was measured rather than after.
      //
      // Chosen at random among whatever is on offer rather than in a fixed
      // order, so an army has some of each. A list would give every ogre in the
      // game the same club, which is the promotion equivalent of buying a
      // hundred ballistas.
      //
      // `only` rather than a list of ids, so a perk added for some future
      // creature is picked up here without anybody remembering to come back.
      // Skipping anything marked `manual`: the AI has no route to using it, and
      // taking a perk it will never use spends a promotion on nothing.
      const special = options.filter((o) => o.only && !o.manual);
      const usable = options.filter((o) => !o.manual);
      const pick =
        special.length > 0
          ? withRng(state, (rng) => special[Math.floor(rng.float() * special.length)])
          : taste.map((id) => usable.find((o) => o.id === id)).find(Boolean) ?? usable[0];
      if (!pick) break;
      unit.perks = [...(unit.perks ?? []), pick.id];
    }
  }
}

export function runAiTurn(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player.alive) return;
  // Raiders are not an empire and do not get an empire's brain.
  //
  // They have their own, deliberately stupid one in `runRaiders`, which has
  // already run by the time anybody calls this -- the band's turn begins with
  // it. Until this line, the empire AI then picked up whatever movement they had
  // left and spent it for them, because `addRaiders` marks the band `ai` and both
  // the game loop and the sweep hand every `ai` player to this function.
  //
  // Measured over four games: their own brain moved them 1,278 times, and this
  // one moved them 3,864 times more -- and chose research, on 777 turns, for a
  // band that cannot study. Section 69 names a raiding band that manoeuvres as
  // the thing it must not be, and the Orcpedia tells players they walk at the
  // nearest thing. For most of their movement, they did not.
  if (player.barbarian) return;
  manageRates(state, player);
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
