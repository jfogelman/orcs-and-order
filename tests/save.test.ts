import { describe, expect, it } from 'vitest';
import { SaveError, deserialize, serialize, unpackBits } from '../src/persist/save';
import { createGame } from '../src/sim/gamestate';

/**
 * Loading a file somebody else made.
 *
 * Every other test in this project loads a save it has just written, which is
 * the happy path and the only path that was covered. An outside review of the
 * codebase in October 2026 pointed at the other one: a save is the one input
 * this game takes from outside itself, and it was being trusted completely.
 *
 * Two of the holes it found were hangs rather than wrong answers, which is the
 * worst way for this to fail -- a thrown error is a message, and a loop that
 * never ends is a tab somebody has to kill.
 */
describe('a save file from somewhere else', () => {
  const good = () => serialize(createGame({ seed: 5, width: 20, height: 12 }));

  it('still round-trips an ordinary game', () => {
    const state = deserialize(good());
    expect(state.width).toBe(20);
    expect(state.players.length).toBeGreaterThan(1);
    expect(state.players[0].explored).toHaveLength(20 * 12);
  });

  describe('unpackBits', () => {
    it('expands a run and pads to the length asked for', () => {
      expect(unpackBits('1,3', 5)).toEqual([1, 1, 1, 0, 0]);
      expect(unpackBits('', 3)).toEqual([0, 0, 0]);
    });

    it('trims a payload longer than the map', () => {
      expect(unpackBits('1,9', 4)).toEqual([1, 1, 1, 1]);
    });

    /**
     * The one that mattered. `Number('Infinity')` is `Infinity`, so this loop
     * ran for ever and took the tab with it -- and a merely enormous run was
     * barely better, measured at 573ms to push fifty million entries into an
     * array in order to keep a hundred.
     */
    it('does not expand a run beyond what the map can hold', () => {
      const started = Date.now();
      // A big *number* is data: fifty million ones, of which this map wants
      // four, so it takes four and stops.
      expect(unpackBits('1,50000000', 4)).toEqual([1, 1, 1, 1]);
      // `Infinity` is not a number of anything. It is treated as a corrupt
      // entry and skipped, which leaves the pad behind it -- deliberately not
      // clamped to "fill the rest", because a file that cannot say how many
      // has not said what to write either.
      expect(unpackBits('1,Infinity', 4)).toEqual([0, 0, 0, 0]);
      // Generous, because what is being asserted is "not proportional to the
      // number in the file" rather than any particular speed.
      expect(Date.now() - started, 'it expanded the run before trimming it').toBeLessThan(250);
    });

    it('skips a run that is not a count at all', () => {
      // NaN, a negative and a fraction are all corrupt rather than long.
      expect(unpackBits('1,nonsense;2,3', 4)).toEqual([2, 2, 2, 0]);
      expect(unpackBits('1,-5;2,2', 3)).toEqual([2, 2, 0]);
      expect(unpackBits('1,2.5;2,2', 3)).toEqual([2, 2, 0]);
    });
  });

  describe('deserialize', () => {
    it('refuses something that is not a save at all', () => {
      expect(() => deserialize('not json')).toThrow(SaveError);
      expect(() => deserialize('{"version":4}')).toThrow(SaveError);
    });

    /**
     * The second hang, and the one the review did not reach: the dimensions
     * were taken on trust and multiplied, so a save claiming a million tiles a
     * side sent every `unpackBits` call into a `while` loop padding to a length
     * no machine will arrive at.
     */
    it('refuses a map no game could have made, rather than trying to build it', () => {
      const file = JSON.parse(good()) as Record<string, unknown>;
      for (const bad of [1e9, -1, 0, 2.5, Number.NaN, 'wide']) {
        const started = Date.now();
        expect(() => deserialize(JSON.stringify({ ...file, width: bad })), `width ${bad}`).toThrow(
          SaveError,
        );
        expect(Date.now() - started, `width ${bad} took its time about it`).toBeLessThan(250);
      }
    });

    it('keeps tolerating the saves it was always meant to tolerate', () => {
      // A short fog payload is an older or trimmed save, not a hostile one, and
      // has always loaded as "the rest is unexplored".
      const file = JSON.parse(good()) as { players: { explored: string }[] };
      file.players[0].explored = '1,2';
      const state = deserialize(JSON.stringify(file));
      expect(state.players[0].explored).toHaveLength(20 * 12);
      expect(state.players[0].explored.slice(0, 2)).toEqual([1, 1]);
    });
  });
});
