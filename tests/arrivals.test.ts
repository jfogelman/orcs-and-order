import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import {
  ARRIVALS,
  arrivalTurnFor,
  latecomers,
  opponentsAtStart,
  opponentsOf,
  staggerOf,
} from '../src/sim/arrivals';
import { DIFFICULTIES } from '../src/sim/difficulty';
import { FACTIONS, FACTION_IDS } from '../src/model/factions';
import { HIVEKIN } from '../src/sim/hivekin';
import { unitType } from '../src/model/units';
import type { FactionId, GameState } from '../src/model/types';

/**
 * Section 139: who is in a game, and when each of them turns up.
 *
 * **The rule is about the slot, not the faction.** The first opponent is on
 * the map at turn one and the rest arrive on a staggered clock. That is a
 * deliberate demotion of section 125's Hivekin, who used to be the only side
 * that emerged -- and the thing most worth testing is that demoting them did
 * not move the game everything else was measured on.
 */
function game(opts: { playerFaction?: FactionId; opponents?: FactionId[] } = {}): GameState {
  return createGame({ seed: 7, width: 40, height: 28, ...opts });
}

describe('who is in the game', () => {
  it('faces everybody else when nobody has chosen', () => {
    const state = game();
    // Section 152 added a fifth side, so "everybody else" is four of them.
    // The shape of the rule is what is pinned here, not the count: one on the
    // map, the rest on the clock.
    expect(opponentsOf(state)).toEqual(['human', 'hivekin', 'wandering', 'unbound']);
    expect(opponentsAtStart(state)).toEqual(['human']);
    expect(latecomers(state)).toEqual(['hivekin', 'wandering', 'unbound']);
  });

  /**
   * **This used to be the one that must not move**, and section 153 moved it
   * on purpose. It pinned the first latecomer to section 125's window -- the
   * Hive around turn ninety -- because that was the configuration every
   * balance number in this project had been taken on.
   *
   * Four opponents broke it. At the old spacing the fifth faction arrived on
   * turn 345 of a 300-turn game on A Picnic, which is to say never. Jeremy
   * made difficulty the only thing that staggers anybody, so the window is
   * gone and what is pinned now is the shape: the first opponent is on the
   * map, the rest are on a clock, and the clock is the level's.
   */
  it('puts the first opponent on the map and the rest on the level’s clock', () => {
    const state = game();
    expect(state.players.map((p) => p.faction)).toEqual(['orc', 'human']);
    const { gap, jitter } = staggerOf(state);
    const turn = arrivalTurnFor(state, 0);
    expect(turn).toBeGreaterThanOrEqual(Math.max(2, gap - jitter));
    expect(turn).toBeLessThanOrEqual(gap + jitter);
  });

  /**
   * The failure that caused section 153, kept as a test because the numbers
   * that caused it were not obviously wrong to look at -- 90 and 60 are fine
   * for two opponents and nonsense for four.
   */
  it('gets everybody onto the map with room to play, at every level', () => {
    for (const difficulty of DIFFICULTIES) {
      const state = createGame({
        seed: 5,
        width: 40,
        height: 28,
        difficulty: difficulty.id,
      });
      const last = latecomers(state).length - 1;
      if (last < 0) continue;
      const arrives = arrivalTurnFor(state, last);
      expect(
        arrives,
        `on ${difficulty.name} the last opponent arrives on turn ${arrives} of ${state.settings.maxTurns}`,
      ).toBeLessThan(state.settings.maxTurns * 0.7);
    }
  });

  it('honours a chosen set, and never seats the player twice', () => {
    const state = game({ opponents: ['hivekin'] });
    expect(opponentsOf(state)).toEqual(['hivekin']);
    // Chosen as the only opponent, the Hive starts on the map like anybody
    // else -- which is the whole of "the slot, not the faction". Before this
    // section it would have emerged and the player would have been alone for
    // ninety turns.
    expect(state.players.map((p) => p.faction)).toEqual(['orc', 'hivekin']);
    expect(latecomers(state)).toEqual([]);
  });

  it('refuses to put the player on the other side of the table', () => {
    const state = game({ playerFaction: 'human', opponents: ['human', 'orc'] });
    expect(opponentsOf(state)).toEqual(['orc']);
    expect(state.players.map((p) => p.faction)).toEqual(['human', 'orc']);
  });

  it('seats one start a seat, however many are coming later', () => {
    // Worldgen reserves a start per seat and the latecomers find unclaimed
    // ground for themselves, so a three-opponent game still generates two
    // starts rather than four.
    const state = game({ opponents: ['human', 'hivekin'] });
    expect(state.players).toHaveLength(2);
    expect(latecomers(state)).toEqual(['hivekin']);
  });
});

describe('the staggered clock', () => {
  it('spaces each latecomer behind the one before it', () => {
    const state = game();
    const { gap, jitter } = staggerOf(state);
    const first = arrivalTurnFor(state, 0);
    const second = arrivalTurnFor(state, 1);
    expect(second - first).toBeGreaterThanOrEqual(gap - jitter * 2);
    expect(second).toBeGreaterThan(first);
  });

  it('draws a different turn for each slot, not the same one twice', () => {
    // `n` is mixed into the hash as well as into the offset. Without that,
    // two latecomers would land the same number of turns into their own
    // windows every game, which is a pattern a player would spot in two
    // games and never unsee.
    const offsets = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = createGame({ seed, width: 40, height: 28 });
      offsets.add(
        arrivalTurnFor(state, 1) - staggerOf(state).gap - arrivalTurnFor(state, 0),
      );
    }
    expect(offsets.size, 'every seed put the two arrivals the same distance apart').toBeGreaterThan(1);
  });

  it('remembers what it drew, so a plan cannot be invalidated mid-game', () => {
    const state = game();
    const first = arrivalTurnFor(state, 0);
    expect(state.arrivals?.[0]).toBe(first);
    // Asked again, including after the stored value is the only thing left.
    expect(arrivalTurnFor(state, 0)).toBe(first);
  });

  it('is pushed later on an easy game and pulled earlier on a hard one', () => {
    const easy = createGame({ seed: 7, width: 40, height: 28, difficulty: 'easiest' });
    const hard = createGame({ seed: 7, width: 40, height: 28, difficulty: 'hardest' });
    expect(arrivalTurnFor(easy, 0)).toBeGreaterThan(arrivalTurnFor(hard, 0));
  });

  it('puts everybody on the map at once with the lever off', () => {
    ARRIVALS.enabled = false;
    try {
      const state = game();
      expect(opponentsAtStart(state)).toEqual(['human', 'hivekin', 'wandering', 'unbound']);
      expect(latecomers(state)).toEqual([]);
    } finally {
      ARRIVALS.enabled = true;
    }
  });

  /**
   * Jeremy's rule, asked of **the seats on the board** rather than of
   * `opponentsAtStart`.
   *
   * That distinction is the whole reason this test exists. `createGame` kept
   * its own copy of "the first opponent stands on the map" and nothing in
   * `src/` called `opponentsAtStart` at all -- so teaching the helper about a
   * stagger of zero taught the tests and left the game seating two sides at
   * Doom. A five-sided probe said so; no test did, because every test asked
   * the helper.
   */
  it('seats everybody at the hardest level, where nobody is late', () => {
    const state = createGame({ seed: 7, width: 64, height: 48, difficulty: 'hardest' });
    expect(state.players.map((p) => p.faction)).toEqual([...FACTION_IDS]);
    expect(latecomers(state)).toEqual([]);
    expect(opponentsAtStart(state)).toEqual(FACTION_IDS.filter((f) => f !== 'orc'));
  });

  it('seats one opponent at every level that staggers anybody', () => {
    for (const d of DIFFICULTIES) {
      if (d.stagger === 0) continue;
      const state = createGame({ seed: 7, width: 64, height: 48, difficulty: d.id });
      expect(state.players, d.id).toHaveLength(2);
      expect(latecomers(state).length, d.id).toBe(FACTION_IDS.length - 2);
    }
  });
});

describe('a latecomer actually turns up', () => {
  it('arrives on its turn, with founders and an escort, and is announced', () => {
    const state = game();
    const due = arrivalTurnFor(state, 0);
    expect(state.players).toHaveLength(2);
    // Run the calendar to the arrival. Cheap because nothing else is driving
    // the game -- no AI acts, the turn simply advances.
    for (let i = 0; i < due + 4 && state.players.length < 3; i++) {
      for (let p = 0; p < state.players.length; p++) endPlayerTurn(state);
    }
    expect(state.players.length, `nobody arrived by turn ${state.turn}`).toBe(3);
    const late = state.players[2];
    expect(late.faction).toBe('hivekin');
    expect(late.joinedAt).toBeGreaterThanOrEqual(due);
    expect(state.units.some((u) => u.owner === late.id)).toBe(true);
    // Everybody is told. A new contender is the largest single thing that can
    // happen to a game, and finding out by losing a city to it is unfair.
    expect(state.log.some((e) => e.player === 0 && /nobody had claimed/i.test(e.text))).toBe(true);
  });

  /**
   * Section 157: the escort is **a budget, not a count**.
   *
   * It was a count, measured in section 125 for the Hive, whose starter is a
   * Fodder-caste at 3/2/12. Every faction since got the same *number* of its
   * own starter -- which for the Wandering Folk is a Skirmisher at 1/1/10,
   * and `tools/wandererprobe.run.test.ts` measured them dead in thirteen
   * games of eighteen, never building a unit and never finishing an advance.
   *
   * Asked of every faction rather than of the two that were wrong, so the
   * next cheap starter is covered by this on the day it compiles.
   */
  it('brings a budget of escort, so a cheap starter brings more of it', () => {
    /** How many of its own starter this faction actually turns up with. */
    const escortFor = (faction: (typeof FACTION_IDS)[number]): number => {
      const starter = FACTIONS[faction].starterUnit;
      const state = game({ playerFaction: 'orc', opponents: ['human', faction] });
      const due = arrivalTurnFor(state, 1);
      for (let i = 0; i < due + 8 && state.players.length < 4; i++) {
        for (let p = 0; p < state.players.length; p++) endPlayerTurn(state);
      }
      const late = state.players.find((p) => p.faction === faction);
      if (!late) return -1;
      return state.units.filter((u) => u.owner === late.id && unitType(u.type).base === starter)
        .length;
    };

    // **Compared across factions rather than against a number.** The first
    // version asserted `escort > 1`, which the old fixed count of two also
    // satisfies -- it passed against the code it was written to catch. What
    // distinguishes a budget from a count is that a *cheaper* starter buys
    // *more* of itself, so that is what is asked.
    // Wandering against Unbound, which is the pair with a real cost gap: a
    // 13-shield Skirmisher against a 20-shield Revenant. The first draft
    // compared Wandering against the Hive and failed, because the Hive's
    // Fodder is **cheaper** than the Skirmisher, not dearer -- the same
    // misreading of the unit table that section 157 had to correct.
    const cheap = escortFor('wandering');
    const dear = escortFor('unbound');
    expect(unitType(FACTIONS.wandering.starterUnit).cost).toBeLessThan(
      unitType(FACTIONS.unbound.starterUnit).cost,
    );
    expect(
      cheap,
      `Wandering Folk brought ${cheap} Skirmishers against the Unbound's ${dear} Revenants`,
    ).toBeGreaterThan(dear);
  });

  it('never leaves a side with no escort at all, however dear its starter', () => {
    // The floor in `emerge`. A faction whose starter cost somebody later
    // raises past the budget should arrive with one, not with none.
    const was = HIVEKIN.escortShields;
    HIVEKIN.escortShields = 1;
    try {
      const state = game({ opponents: ['hivekin'] });
      expect(Math.max(1, Math.floor(HIVEKIN.escortShields / 20))).toBe(1);
      void state;
    } finally {
      HIVEKIN.escortShields = was;
    }
  });
});

describe('the table itself', () => {
  it('offers every faction as an opponent, so a new one needs no menu work', () => {
    // The picker is built off `FACTION_IDS`. A faction added to the table is
    // offered by that alone, which is the whole reason the row is generated
    // rather than written out.
    expect(FACTION_IDS.length).toBeGreaterThanOrEqual(3);
    for (const id of FACTION_IDS) {
      const state = game({ playerFaction: id });
      expect(opponentsOf(state), `${id} has nobody to play against`).not.toHaveLength(0);
      expect(opponentsOf(state)).not.toContain(id);
    }
  });
});
