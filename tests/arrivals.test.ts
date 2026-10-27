import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import {
  ARRIVALS,
  arrivalTurnFor,
  latecomers,
  opponentsAtStart,
  opponentsOf,
} from '../src/sim/arrivals';
import { FACTION_IDS } from '../src/model/factions';
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

  it('is the game a hundred sections were measured on, identically', () => {
    // **The one that must not move.** An Orc player facing the Kingdom from
    // turn one and the Hive around ninety is the configuration every balance
    // number in this project was taken on. The arrival turn is hashed so the
    // *first* latecomer draws exactly what section 125 drew -- not merely an
    // equivalent window, the same number.
    const state = game();
    expect(state.players.map((p) => p.faction)).toEqual(['orc', 'human']);
    const turn = arrivalTurnFor(state, 0);
    expect(turn).toBeGreaterThanOrEqual(ARRIVALS.from);
    expect(turn).toBeLessThanOrEqual(ARRIVALS.until);
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
    const first = arrivalTurnFor(state, 0);
    const second = arrivalTurnFor(state, 1);
    expect(second - first).toBeGreaterThanOrEqual(ARRIVALS.spacing - (ARRIVALS.until - ARRIVALS.from));
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
      offsets.add(arrivalTurnFor(state, 1) - ARRIVALS.spacing - arrivalTurnFor(state, 0));
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
