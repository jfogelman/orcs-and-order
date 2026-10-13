import { distance } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import { awardXp, XP } from './combat';
import { STANDING, adjustStanding } from './diplomacy';
import { uncover } from './disguise';
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
};

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
  /** Whether this side has an ending under way, and how much of it is built. */
  ending: { begun: boolean; parts: number } | null;
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
  const parts = city.buildings.filter((b) => BUILDINGS[b]?.endingPart !== undefined).length;
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
    ending:
      owner === undefined
        ? null
        : { begun: owner.endingBegunAt !== undefined, parts },
  };
}
