import { describe, expect, it } from 'vitest';
import {
  CITIZEN_MOODS,
  CITIZEN_RACES,
  MOOD_LADDER,
  availableRaces,
  moodAt,
  moodTally,
} from '../src/model/citizens';
import { FACTION_IDS, FACTIONS } from '../src/model/factions';
import { TECHS } from '../src/model/techs';
import { createGame } from '../src/sim/gamestate';
import { rollCitizen } from '../src/sim/city';
import type { Player } from '../src/model/types';

/**
 * Section 143. How a single citizen feels, rather than how a town does.
 *
 * The mood shown on a face used to be the city's, so a town of eight drew
 * eight identical ones and the only thing the number really says -- *which* of
 * these people the limit does not cover -- was thrown away before it reached
 * the screen.
 */
describe('the mood ladder', () => {
  it('has a name and a colour for every rung the sheets hold', () => {
    expect(MOOD_LADDER).toHaveLength(CITIZEN_MOODS);
    for (const mood of MOOD_LADDER) {
      expect(mood.name).toMatch(/^[a-z]+$/);
      expect(mood.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  /**
   * The load-bearing property of the change, and the reason it is a drawing
   * decision rather than a rules one: the **last** citizen keeps exactly the
   * mood the whole town used to show. Nothing reads worse than it did.
   */
  it('leaves the last citizen on the mood the whole town used to show', () => {
    /** The ladder exactly as section 125 wrote it, off the whole town's size. */
    const before = (limit: number, size: number): number => {
      const headroom = limit - size;
      if (headroom >= 3) return 0;
      if (headroom >= 2) return 1;
      if (headroom >= 1) return 2;
      return CITIZEN_MOODS - 1;
    };
    for (let limit = 1; limit <= 12; limit++) {
      for (let size = 1; size <= 12; size++) {
        const was = before(limit, size);
        expect(moodAt(false, limit, size), `limit ${limit}, size ${size}`).toBe(was);
        // And everybody standing in front of them is no unhappier than that,
        // which is the other half of "no city reads worse than it did".
        for (let n = 1; n < size; n++) {
          expect(moodAt(false, limit, n)).toBeLessThanOrEqual(was);
        }
      }
    }
  });

  it('never gets happier further back in the queue', () => {
    for (let n = 2; n <= 20; n++) {
      expect(moodAt(false, 8, n)).toBeGreaterThanOrEqual(moodAt(false, 8, n - 1));
    }
  });

  it('puts everybody past the limit on the bottom rung', () => {
    const limit = 5;
    for (let n = limit; n <= limit + 4; n++) {
      expect(moodAt(false, limit, n), `citizen ${n}`).toBe(CITIZEN_MOODS - 1);
    }
    expect(moodAt(false, limit, limit - 1)).toBeLessThan(CITIZEN_MOODS - 1);
  });

  it('makes a riot everybody at once', () => {
    for (let n = 1; n <= 8; n++) expect(moodAt(true, 20, n)).toBe(CITIZEN_MOODS - 1);
    expect(moodTally(true, 20, 6)).toEqual([0, 0, 0, 6]);
  });

  it('tallies one entry per citizen and no more', () => {
    for (const [limit, size] of [[6, 3], [6, 9], [1, 4], [12, 12]]) {
      const tally = moodTally(false, limit, size);
      expect(tally).toHaveLength(CITIZEN_MOODS);
      expect(tally.reduce((a, b) => a + b, 0), `limit ${limit}, size ${size}`).toBe(size);
    }
  });

  it('shows a town with room to spare as entirely content', () => {
    // Nine people in a town content up to twenty: nobody is anywhere near it.
    expect(moodTally(false, 20, 9)).toEqual([9, 0, 0, 0]);
  });
});

/**
 * Who lives in the towns, per side.
 *
 * Section 142 shipped the Wandering Folk with no entry in `CITIZEN_RACES`, so
 * `rollCitizen` fell through to its `'goblin'` guard and every one of their
 * cities was full of goblins -- while ten processed sheets of the right people
 * sat unused in `public/citizens/`. Nothing threw and nothing drew wrong; the
 * pictures were valid and simply of somebody else.
 *
 * Swept across `FACTION_IDS` rather than listed, for the reason section 142
 * had to learn twice: a hand-maintained list is what lets a faction be added
 * and then not be there.
 */
describe('every side has its own people', () => {
  it('offers somebody to a faction that has just started', () => {
    const state = createGame({ seed: 5, width: 30, height: 20 });
    for (const faction of FACTION_IDS) {
      const player = { faction, techs: [FACTIONS[faction].startTech] } as unknown as Player;
      const open = availableRaces(player);
      expect(open.length, `${faction} has nobody who will live there`).toBeGreaterThan(0);
      // And the roll lands on one of them rather than on the goblin guard.
      const city = { owner: 0 } as never;
      state.players[0] = player;
      const rolled = rollCitizen(state, city);
      expect(
        open.map((r) => r.id),
        `${faction} rolled ${rolled}`,
      ).toContain(rolled);
    }
  });

  it('gates every sort behind an advance that exists', () => {
    const known = new Set(TECHS.map((t) => t.id));
    const bad = CITIZEN_RACES.filter((r) => r.needs && !known.has(r.needs));
    expect(bad.map((r) => `${r.id} needs ${r.needs}`)).toEqual([]);
  });

  it('files every sort under a faction the game has', () => {
    const bad = CITIZEN_RACES.filter((r) => !FACTION_IDS.includes(r.faction));
    expect(bad.map((r) => r.id)).toEqual([]);
  });
});
