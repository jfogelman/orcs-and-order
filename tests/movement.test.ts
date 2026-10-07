import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { awaitingDecision, idleUnits } from '../src/sim/turn';


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
