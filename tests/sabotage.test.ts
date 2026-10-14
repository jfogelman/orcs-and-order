import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import {
  SABOTAGE,
  canSabotage,
  investedIn,
  isEndingWork,
  referenceWork,
  sabotage,
  sabotageBand,
  sabotageExposure,
  sabotagePhase,
} from '../src/sim/sabotage';
import { SPY } from '../src/sim/spying';
import { standing } from '../src/sim/diplomacy';
import { BUILDINGS, BUILDING_IDS } from '../src/model/buildings';
import { isEndingPiece } from '../src/sim/endings';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 136 slice 5: wrecking what somebody has been building.
 *
 * The first rung that *does* something. Everything below it is information --
 * nothing on the board changes and nobody is worse off -- and this is where a
 * spy stops being a pair of eyes.
 *
 * The thing being tested most carefully is the **price**: it is read off what
 * is in the town rather than off the agent, in coarse phases, with anything
 * that would win the game above all of them.
 */
function board(): { state: GameState; spy: Unit; city: City } {
  const state = createGame({ seed: 29, width: 30, height: 20, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const city = foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10))!;
  state.units = state.units.filter((u) => u.owner !== 1 || u.x !== city.x || u.y !== city.y);
  const spy = spawnUnit(state, 0, 'skulker', 11, 10);
  city.producing = { kind: 'building', id: 'barracks' };
  city.shields = 40;
  return { state, spy, city };
}

/** An ending work this side could actually be building. */
function anEndingWork(): string {
  return BUILDING_IDS.find((id) => isEndingPiece(BUILDINGS[id]))!;
}

describe('wrecking the works', () => {
  it('is offered beside somebody else’s town, and only with something in it', () => {
    const { state, spy, city } = board();
    expect(canSabotage(spy, city, state).ok).toBe(true);

    city.shields = 0;
    // Nothing banked is not a failure, it is a reason: the whole point of the
    // order is the shields, and a town with none is a town where there is
    // nothing to do but be seen trying.
    expect(canSabotage(spy, city, state).ok).toBe(false);
    expect(canSabotage(spy, city, state).reason).toMatch(/nothing in there/i);

    city.shields = 40;
    const mine = foundCity(state, spawnUnit(state, 0, 'peon', 20, 10))!;
    mine.shields = 40;
    expect(canSabotage(spy, mine, state).ok).toBe(false);
    expect(canSabotage(spy, mine, state).reason).toMatch(/your own/i);
  });

  it('is only for spies, and only from beside the town', () => {
    const { state, city } = board();
    const soldier = spawnUnit(state, 0, 'goblin', 11, 10);
    expect(canSabotage(soldier, city, state).ok).toBe(false);
    const spy = spawnUnit(state, 0, 'skulker', 2, 2);
    expect(canSabotage(spy, city, state).ok).toBe(false);
    expect(canSabotage(spy, city, state).reason).toMatch(/too far/i);
  });

  it('takes the shields and leaves the town standing', () => {
    const { state, spy, city } = board();
    const size = city.size;
    const buildings = [...city.buildings];
    // Forced safe, so this test is about the effect and not the dice.
    SABOTAGE.irreducible = 0;
    const weights = [...SABOTAGE.weights];
    SABOTAGE.weights = [0, 0, 0, 0];
    try {
      const out = sabotage(state, spy, city);
      expect(out.kind).toBe('wrecked');
      expect(city.shields).toBe(0);
      // A spy is one person with a bad idea, not an army.
      expect(city.size).toBe(size);
      expect(city.buildings).toEqual(buildings);
      expect(state.cities).toContain(city);
    } finally {
      SABOTAGE.irreducible = 0.1;
      SABOTAGE.weights = weights;
    }
  });

  it('empties the empire’s bank, not merely the city’s box', () => {
    const { state, spy, city } = board();
    // Follies and ending works bank at the empire. A sabotage that only
    // cleared `city.shields` would leave three hundred shields of Portal
    // untouched and report success.
    const work = anEndingWork();
    city.producing = { kind: 'building', id: work };
    city.shields = 10;
    state.players[1].worksBanked = { [work]: 300 };
    expect(investedIn(state, city)).toBe(310);

    SABOTAGE.irreducible = 0;
    const weights = SABOTAGE.endingWeight;
    SABOTAGE.endingWeight = 0;
    try {
      const out = sabotage(state, spy, city);
      expect(out.kind).toBe('wrecked');
      expect(state.players[1].worksBanked?.[work] ?? 0).toBe(0);
      expect(city.shields).toBe(0);
    } finally {
      SABOTAGE.irreducible = 0.1;
      SABOTAGE.endingWeight = weights;
    }
  });

  it('tells them it happened and never tells them whose it was', () => {
    const { state, spy, city } = board();
    SABOTAGE.irreducible = 0;
    const weights = [...SABOTAGE.weights];
    SABOTAGE.weights = [0, 0, 0, 0];
    try {
      sabotage(state, spy, city);
      const theirs = state.log.filter((e) => e.player === city.owner).map((e) => e.text);
      expect(theirs.join(' '), 'they were not told their works were wrecked').toMatch(
        /wrecked/i,
      );
      // Jeremy's rule from the start of this section. A name is the prize for
      // catching somebody, and nobody was caught.
      const us = state.players[0].name;
      expect(theirs.join(' '), 'the victim was handed a name').not.toContain(us);
    } finally {
      SABOTAGE.irreducible = 0.1;
      SABOTAGE.weights = weights;
    }
  });

  it('costs the agent when it is caught, which is what makes it a decision', () => {
    const { state, city } = board();
    const before = standing(state, 0, 1);
    // The floor is *per point of phase weight*, so setting `irreducible` alone
    // does not force a catch -- on a band-0 town it was 40%, and the first
    // draft of this test assumed certainty and failed on the roll that got
    // away. Both are raised, and it is run until it catches somebody.
    SABOTAGE.irreducible = 1;
    const weights = [...SABOTAGE.weights];
    SABOTAGE.weights = [3, 3, 3, 3];
    try {
      let caught: Unit | null = null;
      for (let i = 0; i < 40 && !caught; i++) {
        city.shields = 40;
        const agent = spawnUnit(state, 0, 'skulker', 11, 10);
        const out = sabotage(state, agent, city);
        if (out.kind === 'caught') caught = agent;
        else state.units = state.units.filter((u) => u !== agent);
      }
      expect(caught, 'forty attempts at the cap and never caught').not.toBeNull();
      expect(state.units, 'a caught saboteur came home').not.toContain(caught);
      expect(standing(state, 0, 1)).toBeLessThan(before);
      // And the works are untouched: it never got that far.
      expect(city.shields).toBe(40);
    } finally {
      SABOTAGE.irreducible = 0.1;
      SABOTAGE.weights = weights;
    }
  });
});

describe('what it costs, and why', () => {
  it('climbs in phases rather than smoothly', () => {
    const { state, spy, city } = board();
    const ref = referenceWork();
    const bands = [0.1, 0.3, 0.6, 0.9].map((share) => {
      city.shields = Math.round(ref * share);
      return sabotagePhase(state, city).band;
    });
    expect(bands).toEqual([0, 1, 2, 3]);

    // Coarse on purpose: a granular curve would make the displayed risk twitch
    // every turn as a city banks another six shields, which is a number
    // nobody can plan against. Two readings inside one band agree exactly.
    city.shields = Math.round(ref * 0.05);
    const low = sabotageExposure(state, spy, city);
    city.shields = Math.round(ref * 0.2);
    expect(sabotageExposure(state, spy, city)).toBe(low);
  });

  it('gets dearer the more they have put in', () => {
    const { state, spy, city } = board();
    const ref = referenceWork();
    let last = -1;
    for (const share of [0.1, 0.3, 0.6, 0.9]) {
      city.shields = Math.round(ref * share);
      const odds = sabotageExposure(state, spy, city);
      expect(odds, 'risk should not fall as the works grow').toBeGreaterThan(last);
      last = odds;
    }
  });

  it('puts anything that would win the game above every phase', () => {
    const { state, spy, city } = board();
    const ref = referenceWork();
    city.shields = Math.round(ref * 2);
    const dearestOrdinary = sabotageExposure(state, spy, city);

    // Twenty shields into a Portal, against eight times that in a granary.
    city.producing = { kind: 'building', id: anEndingWork() };
    city.shields = 20;
    expect(isEndingWork(city)).toBe(true);
    expect(
      sabotageExposure(state, spy, city),
      'a thing that ends the world should be watched harder than a full granary',
    ).toBeGreaterThan(dearestOrdinary);
    expect(sabotageBand(state, spy, city)).toBe('all but certain');
  });

  it('never lets a veteran make the biggest prize safe', () => {
    const { state, spy, city } = board();
    city.producing = { kind: 'building', id: anEndingWork() };
    city.shields = 20;
    spy.rank = 3;
    // Found with your hands in somebody's half-built Portal is not a thing
    // skill explains away. Without this floor a rank-3 agent came out at 4%
    // -- "barely any risk" for deleting four hundred shields.
    expect(sabotageExposure(state, spy, city)).toBeGreaterThanOrEqual(
      SABOTAGE.endingWeight * SABOTAGE.irreducible,
    );
    expect(sabotageBand(state, spy, city)).not.toBe('barely any risk');
    // Rank still buys something, or there would be no reason to promote.
    const veteran = sabotageExposure(state, spy, city);
    spy.rank = 0;
    expect(sabotageExposure(state, spy, city)).toBeGreaterThan(veteran);
  });

  it('measures the phases against a folly, not against an ending', () => {
    // The endings are the thing sitting *above* the scale. Using one as the
    // yardstick would squash every ordinary building into the bottom band.
    const dearestFolly = BUILDING_IDS.filter((id) => BUILDINGS[id].folly !== undefined).reduce(
      (n, id) => Math.max(n, BUILDINGS[id].cost),
      0,
    );
    expect(referenceWork()).toBe(dearestFolly);
  });

  it('does nothing at all with the lever off', () => {
    const { state, spy, city } = board();
    SABOTAGE.enabled = false;
    try {
      expect(canSabotage(spy, city, state).ok).toBe(false);
      const moves = spy.moves;
      expect(sabotage(state, spy, city).kind).toBe('failed');
      expect(spy.moves, 'it should not even have spent the turn').toBe(moves);
      expect(city.shields).toBe(40);
    } finally {
      SABOTAGE.enabled = true;
    }
  });

  it('is off with the whole of espionage, too', () => {
    const { state, spy, city } = board();
    SPY.enabled = false;
    try {
      expect(canSabotage(spy, city, state).ok).toBe(false);
    } finally {
      SPY.enabled = true;
    }
  });
});
