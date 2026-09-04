import { describe, expect, it } from 'vitest';
import type { GameState, LogEntry } from '../src/model/types';
import { WATCH, chooseFocus, watchRank } from '../src/ui/watch';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function board(): GameState {
  const state = createGame({ seed: 20260906, width: 40, height: 30 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(2);
  return state;
}

const entry = (over: Partial<LogEntry>): LogEntry =>
  ({ text: '', kind: 'bad', turn: 1, ...over }) as LogEntry;

const everywhere = () => true;
const nowhere = () => false;

/**
 * Reported from play: an ogre consumed at the top of turn 259 never got the
 * camera, because trolls had died at the end of 258 and both drained in the
 * same batch. The rule was "the first thing worth watching", so nothing logged
 * later could take the camera off the earlier one.
 *
 * This is the third fix to that decision. The first gave deaths a position they
 * did not have; the second stopped the effect layer `continue`-ing past the
 * camera entirely. Both were right and neither was enough, so the policy lives
 * here now, where it can be tested without a browser.
 */
describe('what the camera turns to look at', () => {
  it('ranks losing something of yours above a fight you are standing beside', () => {
    const state = board();
    spawnUnit(state, 0, 'goblin', 10, 10, false);
    const mine = entry({ kind: 'bad', player: 0, at: [30, 20] });
    const nextDoor = entry({ kind: 'combat', player: 1, at: [10, 11] });

    expect(watchRank(state, 0, mine)).toBe(WATCH.yourLoss);
    expect(watchRank(state, 0, nextDoor)).toBe(WATCH.beside);
    expect(watchRank(state, 0, mine)).toBeGreaterThan(watchRank(state, 0, nextDoor));
  });

  it('ignores a distant fight between two other people', () => {
    const state = board();
    spawnUnit(state, 0, 'goblin', 2, 2, false);
    expect(watchRank(state, 0, entry({ kind: 'combat', player: 1, at: [30, 20] }))).toBe(WATCH.no);
  });

  it('ignores anything that is not a fight or a loss', () => {
    const state = board();
    expect(watchRank(state, 0, entry({ kind: 'good', player: 0, at: [5, 5] }))).toBe(WATCH.no);
    expect(watchRank(state, 0, entry({ kind: 'research', player: 0, at: [5, 5] }))).toBe(WATCH.no);
  });

  it('ignores an entry with nowhere to look', () => {
    const state = board();
    expect(watchRank(state, 0, entry({ kind: 'bad', player: 0 }))).toBe(WATCH.no);
  });

  it('shows the later of two losses in one batch', () => {
    const state = board();
    // The reported case exactly: trolls at the end of one turn, an ogre at the
    // top of the next, both drained together.
    const trolls = entry({ kind: 'bad', player: 0, at: [12, 12], text: 'Three Trolls is wiped out.' });
    const ogre = entry({ kind: 'bad', player: 0, at: [31, 19], text: 'Ogre is consumed.' });

    expect(chooseFocus(state, 0, [trolls, ogre], everywhere, nowhere)).toEqual([31, 19]);
  });

  it('still prefers a loss that comes after a lesser event', () => {
    const state = board();
    spawnUnit(state, 0, 'goblin', 10, 10, false);
    const nextDoor = entry({ kind: 'combat', player: 1, at: [10, 11] });
    const loss = entry({ kind: 'bad', player: 0, at: [31, 19] });

    expect(chooseFocus(state, 0, [nextDoor, loss], everywhere, nowhere)).toEqual([31, 19]);
  });

  it('does not let a lesser event afterwards steal the camera from a loss', () => {
    const state = board();
    spawnUnit(state, 0, 'goblin', 10, 10, false);
    const loss = entry({ kind: 'bad', player: 0, at: [31, 19] });
    const nextDoor = entry({ kind: 'combat', player: 1, at: [10, 11] });

    expect(chooseFocus(state, 0, [loss, nextDoor], everywhere, nowhere)).toEqual([31, 19]);
  });

  it('does not move for something already on screen', () => {
    const state = board();
    const loss = entry({ kind: 'bad', player: 0, at: [31, 19] });
    expect(chooseFocus(state, 0, [loss], everywhere, everywhere)).toBeNull();
  });

  it('lets a later off-screen event be chosen even when an earlier one was on screen', () => {
    const state = board();
    const watched = entry({ kind: 'bad', player: 0, at: [5, 5] });
    const away = entry({ kind: 'bad', player: 0, at: [31, 19] });
    // The other half of the old rule: an on-screen event must not stop a later
    // one from being chosen, only from being chosen itself.
    const onScreen = (x: number, y: number) => x === 5 && y === 5;

    expect(chooseFocus(state, 0, [watched, away], everywhere, onScreen)).toEqual([31, 19]);
  });

  it('never looks at something in the fog', () => {
    const state = board();
    const hidden = entry({ kind: 'bad', player: 0, at: [31, 19] });
    // An explosion in unexplored black says plainly that somebody is there.
    expect(chooseFocus(state, 0, [hidden], nowhere, nowhere)).toBeNull();
  });

  it('stays put when nothing happened worth watching', () => {
    const state = board();
    expect(chooseFocus(state, 0, [], everywhere, nowhere)).toBeNull();
    expect(chooseFocus(state, 0, [entry({ kind: 'good', player: 0, at: [1, 1] })], everywhere, nowhere)).toBeNull();
  });
});
