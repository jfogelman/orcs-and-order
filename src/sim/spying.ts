import { distance } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import { awardXp, XP } from './combat';
import { STANDING, adjustStanding } from './diplomacy';
import { uncover } from './disguise';
import { endingFor, endingWorks, isEndingPiece } from './endings';
import { log, withRng } from './gamestate';

/**
 * Section 136 slice 2: what a spy is actually for.
 *
 * Reading a city is the first thing on the ladder and the one that makes the
 * unit worth its thirty shields. Everything about it is information: it takes
 * nothing, breaks nothing, and the side being read is not told it happened
 * unless the spy is *caught*.
 *
 * **Failure and exposure are two different rolls**, which is the shape the
 * whole feature hangs off. A spy that fails has wasted a turn. A spy that is
 * *noticed* has caused a diplomatic incident, and it is the only moment the
 * other side learns whose spy it was -- everything a spy does is anonymous
 * until then. That separation is what lets a promotion make a spy **safe**
 * rather than merely effective, which is the more interesting thing to promote
 * toward.
 */
export const SPY = {
  /** The switch, for sweeps. Off, a spy is a thirty-shield unit that walks. */
  enabled: true,
  /** How far a spy can read from: its own tile, or the one beside it. */
  reach: 1,
  /** Chance of getting a reading at all, at rank 0. */
  reads: 0.75,
  /** Added to that per rank. */
  readsPerRank: 0.07,
  /**
   * Chance that a *failed* reading is noticed, at rank 0.
   *
   * The number a promotion is really buying down. A spy that fails quietly can
   * try again next turn; one that is noticed is uncovered, and the side it was
   * reading now knows whose it was.
   */
  noticed: 0.5,
  /** Taken off that per rank, so rank 3 is noticed one time in five. */
  noticedPerRank: 0.1,
  /**
   * What a reading is worth in experience, and what a quiet failure is worth.
   *
   * **A spy cannot earn experience any other way.** `XP` is awarded for
   * fighting, and a spy never fights -- `attack: 0` sees to that -- so without
   * this the promotion half of the feature does not exist at all. The quiet
   * failure pays something because it learned where not to stand.
   */
  xpRead: XP.survive * 2,
  xpQuietFailure: XP.survive / 2,
  /** What being caught costs between the two sides. */
  caught: STANDING.fight,
  /**
   * A thumb on the scale for every risk on the ladder at once.
   *
   * Nothing moves it today. It is here because the interesting lever on a spy
   * programme is not any one action's odds but *the weather* -- a folly, a
   * building or an advance that makes the whole country harder or easier to
   * work in. One multiplier that everything goes through means such a thing
   * lands in one place rather than in five action tables.
   */
  weather: 1,
  /**
   * The part of being seen that no amount of experience drills away.
   *
   * Scaled by how far up the ladder the action sits, so spying on a town has
   * none of it and turning somebody's soldier has the most.
   *
   * **Without this the top of the ladder collapses.** Exposure is the product
   * of two rolls that *both* improve with rank, so a rank-3 spy came out at
   * under one percent on every action in the table -- turning an enemy unit
   * included -- and the risk words all read "barely any risk" at once. A
   * promotion should make an agent good, not make the act invisible: a
   * sabotaged building is a sabotaged building whoever did it, and somebody
   * whose soldier has changed sides knows that much happened.
   */
  irreducible: 0.03,
};

/**
 * What a spy can be told to do, and how exposed each one leaves it.
 *
 * `risk` is **relative to spying on a town, which is 1**. Walking up to a gate
 * and taking an interest is the cheapest thing on the ladder; everything else
 * involves doing something to somebody, and a thing that is done is a thing
 * that can be traced.
 *
 * **The unbuilt ones are listed deliberately.** A risk band means nothing in
 * isolation -- "slight" is only slight next to something that is not -- so the
 * scale has to be calibrated against the whole ladder, or every slice would
 * recalibrate it and the word printed on the button would change meaning under
 * a player who had learned it. They are marked `ready: false` and are not
 * offered anywhere.
 */
export interface SpyAction {
  /** What it is called where it is offered. */
  verb: string;
  /** Exposure relative to spying on a town. */
  risk: number;
  /** Whether it can be ordered yet. */
  ready: boolean;
}

export const SPY_ACTIONS: Record<string, SpyAction> = {
  read: { verb: 'Spy on', risk: 1, ready: true },
  incite: { verb: 'Foment discontent in', risk: 2.2, ready: false },
  sabotage: { verb: 'Sabotage the works at', risk: 2.8, ready: false },
  turn: { verb: 'Turn', risk: 3.6, ready: false },
  double: { verb: 'Turn their agent in', risk: 4.5, ready: false },
};

/**
 * The chance an action ends with this spy uncovered.
 *
 * **Not the notice roll.** Being noticed is conditional on having failed, so
 * the number a player actually wants is the compound one: a rank-0 spy fails a
 * quarter of the time and is noticed half of those, which is one in eight, not
 * one in two. Quoting the notice roll would have told them the truth about a
 * number they never face.
 */
export function exposureOdds(unit: Unit, action = 'read'): number {
  const act = SPY_ACTIONS[action];
  if (!act) return 0;
  const bare = (1 - readOdds(unit)) * noticeOdds(unit);
  const floor = (act.risk - 1) * SPY.irreducible;
  return Math.max(floor, Math.min(0.95, bare * act.risk * SPY.weather));
}

/** The bands a risk is reported in, loosest first. */
export const RISK_BANDS: { under: number; label: string }[] = [
  { under: 0.05, label: 'barely any risk' },
  // A green spy reading a town is exposed one time in eight, and the first cut
  // of this put that a hair the wrong side of the line and called it "fair".
  // The mildest thing on the ladder should read as mild, or the scale has
  // nowhere left to go when the ladder gets longer.
  { under: 0.15, label: 'slight risk' },
  { under: 0.25, label: 'fair risk' },
  { under: 0.45, label: 'real risk' },
  { under: 1.01, label: 'reckless' },
];

/**
 * What to call a risk where a player can see it.
 *
 * Words rather than a percentage, and on purpose. A spy programme is a thing
 * you are meant to have a *feeling* about; a number invites arithmetic, and
 * arithmetic on a figure the game could change next patch is a false promise.
 * The bands are read off the real odds, so they cannot drift from the rules.
 */
export function riskBand(unit: Unit, action = 'read'): string {
  const odds = exposureOdds(unit, action);
  return (RISK_BANDS.find((b) => odds < b.under) ?? RISK_BANDS[RISK_BANDS.length - 1]).label;
}

/** What a reading tells you about a city. */
export interface CityReading {
  city: string;
  size: number;
  /** What it is building, by name, or null for a standing choice. */
  building: string | null;
  /** How many units are standing in it. */
  garrison: number;
  /** The strongest thing in it, by name, or null for an empty town. */
  strongest: string | null;
  /** Buildings already up, by name. */
  standing: string[];
  /**
   * The thing this side wins with, named, and how far along it is here.
   *
   * **Named rather than called "their ending".** That label told a player
   * nothing: it is a word this game uses about itself, not about anything on
   * the board. The Demonic Portal is a thing you can picture, worry about and
   * march on, which is the entire reason to have sent a spy.
   */
  greatWork: { name: string; begun: boolean; parts: number } | null;
}

/** Whether this unit could read this city, and why not. */
export function canRead(unit: Unit, city: City): { ok: boolean; reason?: string } {
  if (!SPY.enabled || !unitType(unit.type).spy) {
    return { ok: false, reason: 'Only a spy reads a town.' };
  }
  if (city.owner === unit.owner) {
    return { ok: false, reason: 'You may simply look at your own towns.' };
  }
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  if (distance(unit.x, unit.y, city.x, city.y) > SPY.reach) {
    return { ok: false, reason: 'Too far away to see anything worth reporting.' };
  }
  return { ok: true };
}

/** The chance this unit gets a reading, by rank. */
export function readOdds(unit: Unit): number {
  return Math.min(0.98, SPY.reads + unit.rank * SPY.readsPerRank);
}

/** The chance a failure by this unit is noticed, by rank. */
export function noticeOdds(unit: Unit): number {
  return Math.max(0.05, SPY.noticed - unit.rank * SPY.noticedPerRank);
}

export type ReadOutcome =
  | { kind: 'read'; reading: CityReading }
  | { kind: 'missed' }
  /** `wore` is whether it was in a disguise at the moment it was noticed. */
  | { kind: 'caught'; wore: boolean };

/**
 * Read a town, and spend the turn doing it.
 *
 * The turn goes whatever happens: standing about a rival's gate looking
 * interested is the whole of the action, and it is not something that can be
 * half done and walked away from.
 */
export function readCity(state: GameState, unit: Unit, city: City): ReadOutcome {
  if (!canRead(unit, city).ok) return { kind: 'missed' };
  unit.moves = 0;
  unit.order = 'none';

  if (withRng(state, (rng) => rng.chance(readOdds(unit)))) {
    awardXp(state, unit, SPY.xpRead);
    return { kind: 'read', reading: readingOf(state, city) };
  }

  // Failed. Whether anybody noticed is a second roll, and it is the one that
  // matters: a quiet failure is a wasted turn, and a noticed one is the only
  // way the other side ever learns whose spy this was.
  if (!withRng(state, (rng) => rng.chance(noticeOdds(unit)))) {
    awardXp(state, unit, SPY.xpQuietFailure);
    return { kind: 'missed' };
  }

  const wore = uncover(unit, city.owner);
  adjustStanding(state, unit.owner, city.owner, SPY.caught);
  const them = state.players[unit.owner]?.name ?? 'Somebody';
  log(
    state,
    `Somebody was caught taking an interest in ${city.name}. They were ${them}'s.`,
    'bad',
    city.owner,
    undefined,
    [city.x, city.y],
  );
  log(
    state,
    `Our agent at ${city.name} was noticed. They know whose it was.`,
    'bad',
    unit.owner,
    undefined,
    [city.x, city.y],
  );
  return { kind: 'caught', wore };
}

/** Everything a reading reports, gathered off the city as it stands. */
function readingOf(state: GameState, city: City): CityReading {
  const garrison = state.units.filter((u) => u.x === city.x && u.y === city.y);
  const strongest = garrison.reduce<Unit | null>((best, u) => {
    if (!best) return u;
    return unitType(u.type).defense >= unitType(best.type).defense ? u : best;
  }, null);
  const owner = state.players[city.owner];
  // `isEndingPiece`, not `endingPart`. The first version counted only the
  // lesser works, so a town with the Portal itself standing in it reported
  // nothing of the sort under way -- the one reading worth the whole feature.
  const parts = city.buildings.filter((b) => isEndingPiece(BUILDINGS[b])).length;
  const kind = owner ? endingFor(owner.faction) : null;
  const works = kind ? endingWorks(kind) : [];
  return {
    city: city.name,
    size: city.size,
    building: city.producing.kind === 'unit'
      ? unitType(city.producing.id).name
      : city.producing.kind === 'building'
        ? (BUILDINGS[city.producing.id]?.name ?? null)
        : null,
    garrison: garrison.length,
    strongest: strongest ? unitType(strongest.type).name : null,
    standing: city.buildings.map((b) => BUILDINGS[b]?.name ?? b),
    greatWork:
      owner === undefined || works.length === 0
        ? null
        : {
            name: works[works.length - 1].name,
            begun: owner.endingBegunAt !== undefined,
            parts,
          },
  };
}
