import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/model/types';
import { destroyUnit } from '../src/sim/combat';
import { tryStep } from '../src/sim/movement';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function arena(): GameState {
  const state = createGame({ seed: 20260828, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(1);
  state.log.length = 0;
  return state;
}

/**
 * Reported from play: a sentried unit killed off-screen did not pull the camera
 * to it. The interface decides what to watch from the log, and a losing side's
 * death line carried no position at all -- so there was nothing to centre on.
 *
 * The attacker's own line does carry one, but it is addressed to the attacker.
 * The interface works out whether such a line concerns the viewer by looking
 * for one of their units beside the tile, and the only one that was there has
 * just been removed. A unit dying alone is precisely the case that fails.
 */
describe('a unit dying somewhere nobody was looking', () => {
  it('says where it happened', () => {
    const state = arena();
    const doomed = spawnUnit(state, 0, 'orc', 7, 9, false);

    destroyUnit(state, doomed, 'is cut down');

    const entry = state.log.find((e) => e.player === 0 && e.kind === 'bad');
    expect(entry, 'nothing was logged for the owner').toBeTruthy();
    expect(entry!.at, 'the death was logged with no position').toEqual([7, 9]);
  });

  it('says where every one of them died, for a group', () => {
    const state = arena();
    const many = spawnUnit(state, 0, 'orc_x10', 4, 4, false);

    destroyUnit(state, many, 'is wiped out');

    // Both lines, so whichever the interface reaches first can be acted on.
    const located = state.log.filter((e) => e.player === 0 && e.at);
    expect(located.length).toBeGreaterThanOrEqual(2);
    for (const e of located) expect(e.at).toEqual([4, 4]);
  });

  it('carries a position through a real fight', () => {
    const state = arena();
    // Through tryStep rather than resolveCombat: resolving a fight works out
    // the outcome but does not remove anybody, so the death -- and its log
    // line -- happens a level up, which is the path a player takes.
    const ours = spawnUnit(state, 0, 'goblin', 6, 6, false);
    ours.order = 'sentry';
    const theirs = spawnUnit(state, 1, 'knight_x3', 7, 6, false);
    theirs.moves = 2;

    tryStep(state, theirs, 6, 6);
    expect(state.units.includes(ours), 'the goblin somehow lived').toBe(false);

    // The line the loser is meant to see, with somewhere to look.
    const mine = state.log.filter((e) => e.player === 0 && e.kind === 'bad' && e.at);
    expect(mine.length, 'no locatable loss was logged for the owner').toBeGreaterThan(0);
    expect(mine[0].at![0]).toBe(6);
    expect(mine[0].at![1]).toBe(6);
  });
});
