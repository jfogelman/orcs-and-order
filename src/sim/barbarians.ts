import { DIRS8, distance, idx, inBounds } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import { TERRAIN } from '../model/terrain';
import type { City, GameState, Player, Unit } from '../model/types';
import { barbarianOf, contenders, log, playerUnits, spawnUnit, withRng } from './gamestate';
import { assignWorkers, syncCitizens } from './city';
import { tryStep } from './movement';
import { pillage } from './roads';
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
 * Marks a log entry as a city of somebody's being raided.
 *
 * So it can be counted by something that is not reading the wording: the sweep
 * harness counts sacks as they happen, and a count that matched on "Raiders are
 * in" would silently fall to zero the first time somebody rewrote the sentence.
 */
export const RAIDED = 'raided';

/** The grunt. One band, one unit, per section 69's cheapest version. */
export const RAIDER = 'skirmisher';

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
      born.push(spawnUnit(state, wild.id, RAIDER, spot[0], spot[1], false));
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

  for (const raider of playerUnits(state, playerId)) {
    if (raider.moves <= 0) continue;
    const target = nearestPrey(state, raider);
    if (!target) continue;
    // Section 96: the road underfoot, when there is nothing within reach worth
    // hitting. Raiders who stopped to dig with a city next door would be doing
    // the empire a favour, and a band that tore up every tile it crossed would
    // never arrive anywhere -- so this is what they do instead of a step they
    // were not going to profit from.
    if (distance(raider.x, raider.y, target.x, target.y) > 1 && pillage(state, raider)) continue;
    stepToward(state, raider, target.x, target.y);
  }
}

function nearestPrey(state: GameState, raider: Unit): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestAway = Infinity;
  const consider = (x: number, y: number) => {
    const away = distance(raider.x, raider.y, x, y);
    if (away < bestAway) {
      bestAway = away;
      best = { x, y };
    }
  };
  for (const u of state.units) {
    if (u.owner === raider.owner) continue;
    consider(u.x, u.y);
  }
  for (const c of state.cities) consider(c.x, c.y);
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
