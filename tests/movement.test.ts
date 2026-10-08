import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { awaitingDecision, idleUnits } from '../src/sim/turn';
import type { Unit } from '../src/model/types';


/**
 * Section 130: what stays selected when the moving is over.
 *
 * `idleUnits` answers "is there anything left to move". This answers "is there
 * anything left to decide", and they are different questions -- a unit that has
 * spent its last movement point can still be told to hold the ground it is
 * standing on. The interface used to conflate them and drop the unit, so a
 * freshly built one walked into a city could not be fortified.
 */
describe('a unit that has finished moving', () => {
  it('still owes a decision while it has no standing order', () => {
    const state = createGame({ seed: 7, width: 20, height: 14, barbarians: false });
    state.units.length = 0;
    const u = spawnUnit(state, 0, 'goblin', 5, 5);
    u.moves = 0;

    expect(idleUnits(state, 0).some((x) => x.id === u.id), 'nothing left to move').toBe(false);
    expect(awaitingDecision(state, 0, u), 'something left to decide').toBe(true);
  });

  it('owes nothing once it has one, or once it is somebody else', () => {
    const state = createGame({ seed: 7, width: 20, height: 14, barbarians: false });
    state.units.length = 0;
    const mine = spawnUnit(state, 0, 'goblin', 5, 5);
    const theirs = spawnUnit(state, 1, 'footman', 6, 6);

    mine.order = 'fortified';
    expect(awaitingDecision(state, 0, mine), 'told to hold').toBe(false);
    expect(awaitingDecision(state, 0, theirs), 'not ours').toBe(false);
    expect(awaitingDecision(state, 0, null), 'nothing selected').toBe(false);

    // And a unit that died while selected is not owed anything either.
    mine.order = 'none';
    state.units.splice(state.units.indexOf(mine), 1);
    expect(awaitingDecision(state, 0, mine), 'off the board').toBe(false);
  });
});

/**
 * Section 132: the two questions have to stay the same question.
 *
 * `idleUnits` is "anything left to move" and `awaitingDecision` is "anything
 * left to decide". The only difference between them is a movement point --
 * which is why the second is now written in terms of the first rather than
 * beside it. Written out twice, they drifted: a unit marching under a `goto`
 * was decided to one and undecided to the other, so after ordering the last
 * unit somewhere the selection stayed on it and the player had to press Next
 * for a turn that was already over.
 */
describe('a unit under a standing order', () => {
  const orders: Array<[string, (u: Unit) => void]> = [
    ['marching', (u) => (u.goto = { x: 9, y: 9 })],
    ['laying a road', (u) => (u.roadTo = { x: 9, y: 9 })],
    ['irrigating to', (u) => (u.irrigateTo = { x: 9, y: 9 })],
    ['on auto work', (u) => (u.autoWork = true)],
    ['exploring', (u) => (u.exploring = true)],
    ['fortified', (u) => (u.order = 'fortified')],
    ['on sentry', (u) => (u.order = 'sentry')],
    ['skipped', (u) => (u.order = 'skip')],
  ];

  for (const [what, give] of orders) {
    it(`owes nothing more while it is ${what}`, () => {
      const state = createGame({ seed: 11, width: 20, height: 14, barbarians: false });
      state.units.length = 0;
      const u = spawnUnit(state, 0, 'peon', 5, 5);
      expect(awaitingDecision(state, 0, u), 'undecided to begin with').toBe(true);

      give(u);

      expect(awaitingDecision(state, 0, u), `${what}: decided`).toBe(false);
      expect(idleUnits(state, 0).some((x) => x.id === u.id), `${what}: not waiting`).toBe(false);
    });
  }

  it('is the same question as idleUnits, give or take a movement point', () => {
    const state = createGame({ seed: 11, width: 20, height: 14, barbarians: false });
    state.units.length = 0;
    const u = spawnUnit(state, 0, 'peon', 5, 5);

    expect(idleUnits(state, 0).map((x) => x.id)).toEqual([u.id]);
    u.moves = 0;
    expect(idleUnits(state, 0), 'nothing left to move').toHaveLength(0);
    expect(awaitingDecision(state, 0, u), 'something left to decide').toBe(true);
  });
});
