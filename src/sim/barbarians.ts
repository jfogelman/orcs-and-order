import { DIRS8, distance, idx, inBounds } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { City, GameState, Player, Unit } from '../model/types';
import { barbarianOf, contenders, log, playerUnits, spawnUnit, withRng } from './gamestate';
import { assignWorkers, markDamaged, syncCitizens } from './city';
import { tryStep } from './movement';
import { pillage } from './roads';
import { RAIDER_GRUNT, summonDue, trySummon, waveRoster, watchedFromATown } from './wilds';
import { difficultyOf } from './difficulty';

/**
 * Raiding parties out of the unclaimed wilds.
 *
 * Section 69 is emphatic about what this is: a third actor is not a new unit
 * type, it is a change to what a game *is*, and every measurement in this
 * project counts wins as orc-against-human across exactly two sides. So it is
 * **off unless a game asks for it**, and a barbarian is a `Player` that is
 * deliberately not a contender -- skipped by victory, elimination, score and
 * the dominance clock. A game with raiders in it is still won between the two
 * empires.
 *
 * The cheapest honest version, which is what that section asked for: one band,
 * grunts only, spawning in unowned ground, taking no cities.
 */

export const BARBARIANS = {
  /**
   * The code-side switch, for sweeps. The *game* asks
   * `settings.barbarians`, and this can hold every arm at bay regardless --
   * so the existing arms stay runnable and raiders can be measured as an arm
   * rather than becoming the new floor under every earlier number.
   */
  enabled: true,

  /** Turns between waves. */
  every: 15,

  /**
   * Nothing before this. A wave at turn three is a coin flip about who happened
   * to start near it, not a thing anybody can prepare for.
   */
  notBefore: 25,

  /** Raiders in the first wave, before anybody has learned anything. */
  base: 1,

  /**
   * How much a wave grows per advance the two empires know **on average**.
   *
   * Scaled off the players rather than the turn so that it tracks how strong
   * they actually are: a slow game does not get punished for being slow, and a
   * runaway one still has to keep looking over its shoulder. Averaged across
   * both, so beating the other side does not summon a bigger horde onto you
   * alone.
   */
  perAdvance: 0.12,

  /** However well the game goes, a wave stays something you can meet. */
  cap: 5,

  /** How far from any city a raiding party will appear. */
  clearOfCities: 4,

  /**
   * Citizens taken when a raiding band reaches a city nobody is defending.
   *
   * They cannot hold a city -- section 69's cheapest version, and what keeps
   * the win conditions untouched -- but walking up to an open gate and doing
   * nothing is not a raid. So they take something and leave: a building if
   * there is one, and people if there is not.
   *
   * Never the last citizen. A band that could erase a city outright would be
   * deciding the game, which is precisely what a thing with no plan should not
   * be able to do.
   */
  takesCitizens: 1,
};

/**
 * What a raiding band is actually out here for. Section 120.
 *
 * They used to walk at **the nearest thing that was not theirs**, and a unit
 * standing in a field counted the same as a town. That is a rule with a side to
 * it, which took three sweeps and a probe to see: the Horde's army is the one
 * out walking, so the Horde lost **eleven soldiers a game** to the wilds
 * against the Kingdom's four, while towns were sacked about four tenths of a
 * game each and the two sides' *garrisons* turned out to be the wrong suspect
 * entirely -- the Horde keeps a body in its towns rather more often than the
 * Kingdom does. Adding raiders therefore taxed whoever marched, which is why
 * the chieftain's summons could never be switched on.
 *
 * So a band now goes for **what somebody built**: a town first, and after that
 * a road, a ditch, a mine or a post -- each weighed several times over a body
 * in a field. Somebody in the way is still hit, because the step into them is
 * an attack, and two things still make a band turn on a unit on purpose:
 *
 * - **a mob**, `mob` of them or more within sight of each other, which will
 *   have a go at anything however badly it ends;
 * - **one of them, cornered**, with somebody adjacent and nowhere to back off
 *   to, which fights because the alternative is being cut down walking away.
 *
 * Weights rather than a flat rule, so that a ditch three steps off still beats
 * a town across the map and each of them is one number to move in a sweep. What
 * is *underfoot* is not a target at all -- nothing is nearer than where you are
 * already standing, so it won every contest it entered -- and tearing that up
 * is left to the pillage rule it always belonged to.
 */
export const PREY = {
  /** Off is section 69's original rule: the nearest thing, whatever it is. */
  enabled: true,
  /** How much further a band will walk for a town than for somebody wandering. */
  town: 4,
  /** ...and for a road, a ditch, a mine or a post: something somebody dug. */
  works: 3,
  /** Raiders within sight of each other before the band will take on anything it meets. */
  mob: 3,
  /** How near they have to be to count as one band for that. */
  together: 3,
  /** How far around itself a band looks for somebody's diggings. */
  worksRange: 8,
};

/**
 * Marks a log entry as a city of somebody's being raided.
 *
 * So it can be counted by something that is not reading the wording: the sweep
 * harness counts sacks as they happen, and a count that matched on "Raiders are
 * in" would silently fall to zero the first time somebody rewrote the sentence.
 */
export const RAIDED = 'raided';

/** The grunt. One band, one unit, per section 69's cheapest version. */
export const RAIDER = RAIDER_GRUNT;

// Section 115's tiers. They live in `wilds.ts` so that the fighting code can
// pay a bounty without importing this file, which imports movement in turn.
export {
  RAIDER_TIERS,
  bandSize,
  bountyFor,
  claimBounty,
  summonDue,
  trySummon,
  waveRoster,
  watchedFromATown,
} from './wilds';

/** Whether this game has raiders at all. */
export function raidersActive(state: GameState): boolean {
  return BARBARIANS.enabled && state.settings.barbarians === true;
}

/**
 * How many raiders a wave brings, from how far along the two empires are.
 *
 * Rounded rather than floored so the growth is felt gradually rather than in
 * jumps of a whole advance-per-raider.
 */
export function waveSize(state: GameState): number {
  const empires = contenders(state);
  if (empires.length === 0) return 0;
  const advances = empires.reduce((n, p) => n + p.techs.length, 0) / empires.length;
  return Math.min(BARBARIANS.cap, Math.round(BARBARIANS.base + advances * BARBARIANS.perAdvance));
}

/**
 * When raiding starts and how often it comes, at this game's level. Normal
 * reads BARBARIANS unchanged, so a sweep moving those levers still moves them.
 */
export function raidPace(state: GameState): { notBefore: number; every: number } {
  const level = difficultyOf(state.settings);
  if (level.id === 'normal') return { notBefore: BARBARIANS.notBefore, every: BARBARIANS.every };
  return { notBefore: level.raidNotBefore, every: level.raidEvery };
}

/** Turns since the last wave, or since raiding could have started. */
export function waveDue(state: GameState): boolean {
  if (!raidersActive(state)) return false;
  // Section 113: the level sets the pace. At Normal these are BARBARIANS' own.
  const { notBefore, every } = raidPace(state);
  if (state.turn < notBefore) return false;
  return (state.turn - notBefore) % every === 0;
}

/**
 * Somewhere nobody has claimed: dry, empty, and well clear of anybody's city.
 *
 * Clear of cities because a raiding party that materialises next door is not a
 * border to garrison, it is a dice roll -- and because the whole point of the
 * band is pressure on the edges rather than an ambush at the middle.
 */
function landingSpots(state: GameState): number[] {
  const out: number[] = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const i = idx(x, y, state.width);
      const def = TERRAIN[state.terrain[i]];
      if (def.water || def.noCity) continue;
      if (state.units.some((u) => u.x === x && u.y === y)) continue;
      if (
        state.cities.some((c) => distance(c.x, c.y, x, y) < BARBARIANS.clearOfCities)
      ) {
        continue;
      }
      out.push(i);
    }
  }
  return out;
}

/**
 * Put a wave on the map, if one is due.
 *
 * Everything it draws comes off the game's own seeded stream, so a game with
 * raiders is as reproducible as one without -- which is what lets them be
 * measured at all.
 */
export function spawnWave(state: GameState): Unit[] {
  const wild = barbarianOf(state);
  if (!wild || !waveDue(state)) return [];

  const spots = landingSpots(state);
  if (spots.length === 0) return [];

  const size = waveSize(state);
  // Section 115: what the wave is made of, which grows with the empires.
  const roster = waveRoster(state, size);
  const born: Unit[] = [];
  withRng(state, (rng) => {
    // One landing place per wave, and the party arrives together. Scattering
    // them individually reads as bad luck; a band arriving somewhere reads as a
    // thing that has happened and can be answered.
    const at = spots[rng.int(spots.length)];
    const x = at % state.width;
    const y = Math.floor(at / state.width);
    for (let n = 0; n < size; n++) {
      const spot =
        n === 0
          ? [x, y]
          : (DIRS8.map(([dx, dy]) => [x + dx, y + dy]).find(
              ([nx, ny]) =>
                inBounds(nx, ny, state.width, state.height) &&
                !TERRAIN[state.terrain[idx(nx, ny, state.width)]].water &&
                !state.units.some((u) => u.x === nx && u.y === ny),
            ) ?? null);
      if (!spot) continue;
      born.push(spawnUnit(state, wild.id, roster[n] ?? RAIDER, spot[0], spot[1], false));
    }
  });

  if (born.length > 0) {
    for (const p of contenders(state)) {
      // Deliberately without a position, and deliberately not phrased as a
      // sighting.
      //
      // A wave lands in open ground four tiles clear of every city, which is
      // almost always inside somebody's fog. The old message said "Raiders out
      // of the wilds" and carried the spawn tile, so the camera was asked to
      // look at a patch of nothing -- and `chooseFocus` rightly refused, which
      // left a warning pointing at a place the player could not see and had not
      // seen. If we are telling you where they are, we saw them; if we did not
      // see them, this is a rumour and reads like one. The sighting is a
      // separate event, below.
      log(
        state,
        `Something has come out of the wilds. ${born.length === 1 ? 'One of them' : `${born.length} of them`}, by the sound of it, and they are not from here.`,
        'bad',
        p.id,
      );
    }
  }
  return born;
}

/**
 * Tell a player about raiders they can now see, and only those.
 *
 * Called after visibility is recomputed, so "can see" means what the map says
 * rather than what happened. The ids seen last turn are kept on the player so a
 * band walking your border is announced once rather than every turn -- and so a
 * band that goes back into the trees and comes out again is announced again,
 * which is right, because that is a second sighting.
 *
 * One line per sighting rather than one per raider: a wave of four arriving at
 * your fence is one thing that has happened, and four identical messages is how
 * a log stops being read.
 */
export function reportSightings(state: GameState, viewerId: number): void {
  const viewer = state.players[viewerId];
  if (!viewer || viewer.barbarian) return;
  const wild = barbarianOf(state);
  if (!wild) {
    viewer.sightedRaiders = undefined;
    return;
  }

  const visible = state.units.filter(
    (u) => u.owner === wild.id && viewer.visible[idx(u.x, u.y, state.width)] > 0,
  );
  const known = new Set(viewer.sightedRaiders ?? []);
  const fresh = visible.filter((u) => !known.has(u.id));

  // Rewritten from what is visible now rather than added to, so the list stays
  // the size of a war band instead of growing for the length of the game.
  viewer.sightedRaiders = visible.map((u) => u.id);
  if (fresh.length === 0) return;

  // The nearest one to something of ours, because that is the one that matters
  // and the one the camera should be looking at.
  const mine: Array<{ x: number; y: number }> = [
    ...state.cities.filter((c) => c.owner === viewerId),
    ...playerUnits(state, viewerId),
  ];
  const closeness = (u: Unit) =>
    mine.reduce((best, m) => Math.min(best, distance(m.x, m.y, u.x, u.y)), Infinity);
  const nearest = fresh.reduce((a, b) => (closeness(a) <= closeness(b) ? a : b));

  log(
    state,
    fresh.length === 1
      ? 'Raiders spotted. We do not trust them, on account of them not being us.'
      : `Raiders spotted, ${fresh.length} of them. We do not trust them, on account of them not being us.`,
    'bad',
    viewerId,
    undefined,
    [nearest.x, nearest.y],
    undefined,
    SIGHTING,
  );
}

/**
 * Marks a log entry as "we have just laid eyes on this".
 *
 * Read by the camera, which ranks a first sighting above ordinary news but
 * below losing something of your own -- see `ui/watch.ts`. A string on the
 * entry rather than a new `kind`, because it is not a new *sort* of message,
 * it is the same bad news with a claim attached: we can see this.
 */
export const SIGHTING = 'raiders-sighted';

/**
 * What a raiding party does with its turn.
 *
 * Deliberately simple, and deliberately not an AI: they walk at the nearest
 * thing that is not theirs and hit it. No supply, no orders, no plan. A band
 * that manoeuvred would be a third empire, which is the thing section 69 warns
 * about.
 */
export function runRaiders(state: GameState, playerId: number): void {
  const wild = state.players[playerId];
  if (!wild?.barbarian) return;

  for (const raider of [...playerUnits(state, playerId)]) {
    if (raider.moves <= 0) continue;

    // Section 115: a chieftain with somebody due goes and gets them, which
    // means giving ground first. It cannot call anybody up where a town can see
    // it, so the one turn in three that it wants a body, it walks away from the
    // nearest town rather than at it -- and a band grows out in the wilds,
    // where nobody is looking, which is exactly where a band should grow.
    if (summonDue(state, raider)) {
      const called = trySummon(state, raider);
      if (called) {
        log(
          state,
          `Somebody answers ${unitType(raider.type).name}. There are more of them than there were.`,
          'bad',
          null,
          undefined,
          [called.x, called.y],
        );
        continue;
      }
      if (retreatToSummon(state, raider)) continue;
    }

    // Cornered, and on its own: swing rather than be cut down walking away.
    const pinned = PREY.enabled ? cornered(state, raider) : null;
    if (pinned) {
      tryStep(state, raider, pinned.x, pinned.y);
      continue;
    }

    const target = nearestPrey(state, raider);
    // Nothing anywhere worth walking at -- no towns standing, nobody's diggings
    // within reach. Wreck whatever is underfoot rather than stand in a field
    // looking at it. Only reachable on a board with no cities at all, which is
    // to say almost never, but "does nothing for ever" is not a good default.
    if (!target) {
      pillage(state, raider);
      continue;
    }
    // Section 96: the road underfoot, when there is nothing within reach worth
    // hitting. Raiders who stopped to dig with a city next door would be doing
    // the empire a favour, and a band that tore up every tile it crossed would
    // never arrive anywhere -- so this is what they do instead of a step they
    // were not going to profit from.
    //
    // Section 120 turns this on what is *adjacent* rather than on distance
    // alone, because diggings are now something they walk towards. A town or a
    // body one step away is dealt with first; more road one step away is not,
    // or a band on a long road would walk the length of it for ever, each tile
    // promising the next. So: nothing urgent next door, wreck what is underfoot.
    const urgent =
      distance(raider.x, raider.y, target.x, target.y) <= 1 &&
      (!PREY.enabled || target.kind !== 'works');
    if (!urgent && pillage(state, raider)) continue;
    stepToward(state, raider, target.x, target.y);
  }
}

/**
 * Back away from the nearest town, so that somebody can be called up next turn.
 *
 * Only when there is a reason to: a chieftain standing where no town can see it
 * and simply penned in by its own band does better to carry on raiding than to
 * wander looking for elbow room.
 */
function retreatToSummon(state: GameState, chief: Unit): boolean {
  if (!watchedFromATown(state, chief.x, chief.y)) return false;
  const town = state.cities
    .filter((c) => !state.players[c.owner]?.barbarian)
    .sort((a, b) => distance(a.x, a.y, chief.x, chief.y) - distance(b.x, b.y, chief.x, chief.y))[0];
  if (!town) return false;
  let best: [number, number] | null = null;
  let furthest = distance(chief.x, chief.y, town.x, town.y);
  for (const [dx, dy] of DIRS8) {
    const x = chief.x + dx;
    const y = chief.y + dy;
    if (!inBounds(x, y, state.width, state.height)) continue;
    if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
    if (state.units.some((u) => u.x === x && u.y === y)) continue;
    if (state.cities.some((c) => c.x === x && c.y === y)) continue;
    const away = distance(x, y, town.x, town.y);
    if (away > furthest) {
      furthest = away;
      best = [x, y];
    }
  }
  if (!best) return false;
  return tryStep(state, chief, best[0], best[1]).kind === 'moved';
}

/** Raiders close enough to this one to be the same band. */
function bandAround(state: GameState, raider: Unit): number {
  return state.units.filter(
    (u) =>
      u.owner === raider.owner && distance(u.x, u.y, raider.x, raider.y) <= PREY.together,
  ).length;
}

/** Whether somebody has dug, built or laid anything on this tile. */
function somebodysWork(state: GameState, x: number, y: number): boolean {
  const i = idx(x, y, state.width);
  return (
    state.roads?.[i] === 1 ||
    state.posts?.[i] === 1 ||
    state.irrigation?.[i] === 1 ||
    state.mines?.[i] === 1
  );
}

/**
 * The one of them on its own, with somebody on top of it and nowhere to back
 * off to. Returns who to swing at, or null.
 *
 * "Cannot easily escape" is meant literally: every neighbouring tile it could
 * stand on leaves it just as close to whoever is adjacent. A band with room to
 * walk away walks away -- it is not out here to fight soldiers -- and one with
 * its back to the water or its own friends does not get to.
 */
function cornered(state: GameState, raider: Unit): Unit | null {
  if (bandAround(state, raider) > 1) return null;
  const foes = state.units.filter(
    (u) => u.owner !== raider.owner && distance(u.x, u.y, raider.x, raider.y) <= 1,
  );
  if (foes.length === 0) return null;
  const clearOf = (x: number, y: number) =>
    foes.reduce((near, f) => Math.min(near, distance(f.x, f.y, x, y)), Infinity);
  for (const [dx, dy] of DIRS8) {
    const x = raider.x + dx;
    const y = raider.y + dy;
    if (!inBounds(x, y, state.width, state.height)) continue;
    if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
    if (state.units.some((u) => u.x === x && u.y === y)) continue;
    if (state.cities.some((c) => c.x === x && c.y === y)) continue;
    if (clearOf(x, y) > 1) return null;
  }
  // Nowhere to go: the one it is likeliest to survive, which is the weakest.
  return [...foes].sort(
    (a, b) => unitType(a.type).defense - unitType(b.type).defense || a.id - b.id,
  )[0];
}

/** What a band is walking at, and which sort of thing it is. */
interface Prey {
  x: number;
  y: number;
  /** Diggings are the one kind that waits: see the pillage rule in `runRaiders`. */
  kind: 'town' | 'works' | 'body';
}

/**
 * What this band walks at: the best of what is worth having, by ground covered.
 *
 * Scored as distance over weight, so a town four times a unit's weight is worth
 * walking four times as far for. Section 120; see `PREY`.
 */
function nearestPrey(state: GameState, raider: Unit): Prey | null {
  let best: Prey | null = null;
  let bestScore = Infinity;
  const weigh = (x: number, y: number, weight: number, kind: Prey['kind']) => {
    const score = distance(raider.x, raider.y, x, y) / weight;
    if (score < bestScore) {
      bestScore = score;
      best = { x, y, kind };
    }
  };

  if (!PREY.enabled) {
    for (const u of state.units) if (u.owner !== raider.owner) weigh(u.x, u.y, 1, 'body');
    for (const c of state.cities) weigh(c.x, c.y, 1, 'town');
    return best;
  }

  for (const c of state.cities) {
    if (state.players[c.owner]?.barbarian) continue;
    weigh(c.x, c.y, PREY.town, 'town');
  }
  // Somebody's diggings, within a walk. Bounded rather than whole-map because
  // this runs for every raider every turn, and because a ditch on the far side
  // of the world is not what a band standing here is going to go and ruin.
  const r = PREY.worksRange;
  for (let y = raider.y - r; y <= raider.y + r; y++) {
    for (let x = raider.x - r; x <= raider.x + r; x++) {
      if (!inBounds(x, y, state.width, state.height)) continue;
      // Never the tile underfoot. Nothing is nearer than where you are already
      // standing, so a ditch there scored zero and beat a town one step away --
      // and a band that tears up a road beside an open gate has missed the
      // point of a raid. What is underfoot is the pillage rule's business,
      // below, and it fires when there is nothing adjacent worth doing first.
      if (x === raider.x && y === raider.y) continue;
      if (!somebodysWork(state, x, y)) continue;
      weigh(x, y, PREY.works, 'works');
    }
  }
  // Bodies, only when there are enough of them to fancy it. One raider walking
  // past a soldier is a raider with something better to do.
  if (bandAround(state, raider) >= PREY.mob) {
    for (const u of state.units) {
      if (u.owner === raider.owner) continue;
      weigh(u.x, u.y, 1, 'body');
    }
  }
  return best;
}

/** One step, and a swing if the step lands on somebody. */
function stepToward(state: GameState, raider: Unit, tx: number, ty: number): void {
  let pick: [number, number] | null = null;
  let closest = distance(raider.x, raider.y, tx, ty);
  for (const [dx, dy] of DIRS8) {
    const nx = raider.x + dx;
    const ny = raider.y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    const away = distance(nx, ny, tx, ty);
    if (away < closest) {
      closest = away;
      pick = [nx, ny];
    }
  }
  // Through `tryStep`, which owns terrain, occupancy and combat. A raid that
  // resolved its own fights would be a second combat model, and two of those
  // drift apart -- which is the lesson from `cityIncome` being written twice.
  //
  // They do not take cities, so a step onto an empty one is refused here rather
  // than in the movement rules: section 69's cheapest version says raiders
  // pressure the edges and change no win condition.
  if (!pick) return;
  const city = state.cities.find((c) => c.x === pick![0] && c.y === pick![1]);
  const held = state.units.some((u) => u.x === pick![0] && u.y === pick![1]);
  if (city && !held) {
    sack(state, city);
    return;
  }
  tryStep(state, raider, pick[0], pick[1]);
}

/**
 * What a raiding band does to a city with nobody in it.
 *
 * Not a capture. The city keeps its owner, its name and its place on the map,
 * and loses something it will have to replace -- which is the whole difference
 * between pressure on the edges and a third empire taking territory.
 *
 * A building first, because that is a thing somebody chose to build and will
 * notice going. Citizens only when there is nothing left to break, and never
 * the last one: erasing a city outright would be a thing with no plan deciding
 * the game.
 *
 * The walls stay, as they do on a capture. A band with hand-sharpened spears
 * does not level a wall.
 */
function sack(state: GameState, city: City): void {
  markDamaged(state, city);
  const breakable = city.buildings.filter((b) => b !== 'walls');
  if (breakable.length > 0) {
    const lost = withRng(state, (rng) => rng.pick(breakable));
    city.buildings = city.buildings.filter((b) => b !== lost);
    log(
      state,
      `Raiders are in ${city.name}. The ${BUILDINGS[lost]?.name ?? lost} is a loss.`,
      'bad',
      city.owner,
      undefined,
      [city.x, city.y],
      undefined,
      RAIDED,
    );
    return;
  }
  if (city.size <= 1) return;
  city.size = Math.max(1, city.size - BARBARIANS.takesCitizens);
  syncCitizens(state, city);
  assignWorkers(state, city);
  log(
    state,
    `Raiders are in ${city.name} and there was nothing left to break, so they took people.`,
    'bad',
    city.owner,
    undefined,
    [city.x, city.y],
    undefined,
    RAIDED,
  );
}

/** Cities a raider is currently standing next to, for the advisors. */
export function raidersSeen(state: GameState, viewerId: number): number {
  const wild = barbarianOf(state);
  if (!wild) return 0;
  return state.units.filter(
    (u) => u.owner === wild.id && state.players[viewerId].visible[idx(u.x, u.y, state.width)] > 0,
  ).length;
}

/** Whether any raider is standing beside something of this player's. */
export function raidersAtTheGate(state: GameState, viewerId: number): boolean {
  const wild = barbarianOf(state);
  if (!wild) return false;
  const mine: Array<City | Unit> = [
    ...state.cities.filter((c) => c.owner === viewerId),
    ...playerUnits(state, viewerId),
  ];
  return state.units.some(
    (u) => u.owner === wild.id && mine.some((m) => distance(m.x, m.y, u.x, u.y) <= 1),
  );
}

/**
 * Hand back any city a raiding band is holding, for games saved before they
 * could not.
 *
 * Raiders were never meant to hold a city and their own brain never took one.
 * But until the empire AI stopped driving them it walked them onto empty cities
 * like any other unit, and the capture went through. Those cities are still
 * sitting in saves, and frozen: a band has no economy, so a city it holds grows
 * nothing, builds nothing, and can only be got back by force.
 *
 * Back to whoever founded it, if they are still in the game. Otherwise there is
 * nobody for it to belong to, and it is not left standing as a raider camp -- it
 * is abandoned, which is about what a band with no plan does with a town it has
 * no use for.
 */
export function returnRaiderHeldCities(state: GameState): void {
  const empires = contenders(state).filter((p) => p.alive);
  for (const city of [...state.cities]) {
    if (!state.players[city.owner]?.barbarian) continue;
    const home = empires.find((p) => p.id === city.foundedBy);
    if (home) {
      city.owner = home.id;
      city.disorder = false;
      syncCitizens(state, city);
      assignWorkers(state, city);
      log(
        state,
        `The raiders have wandered off from ${city.name}, and it is ours again.`,
        'good',
        home.id,
        undefined,
        [city.x, city.y],
      );
      continue;
    }
    state.cities.splice(state.cities.indexOf(city), 1);
    for (const u of state.units) {
      if (u.homeCity === city.id) u.homeCity = null;
    }
  }
}

/** Make the raiding band, once, when a game is set up with them. */
export function addRaiders(state: GameState, tileCount: number, make: (id: number) => Player): void {
  if (!state.settings.barbarians || barbarianOf(state)) return;
  const wild = make(state.players.length);
  wild.barbarian = true;
  wild.controller = 'ai';
  wild.name = 'The Wildland Raiders';
  wild.leader = 'Nobody In Particular';
  wild.color = '#a8894e';
  // They know nothing and are owed nothing. `makePlayer` hands out the advances
  // every empire starts with, and a band holding those would have been scored
  // for them -- which is the kind of thing that makes a third party quietly
  // become a third contender.
  wild.techs = [];
  wild.researching = null;
  wild.beakers = 0;
  wild.gold = 0;
  // They see the whole map. There is nothing to hide from a thing with no plan,
  // and giving them fog would mean giving them scouting, which is a second AI.
  wild.explored = new Array(tileCount).fill(1);
  wild.visible = new Array(tileCount).fill(1);
  state.players.push(wild);
}
