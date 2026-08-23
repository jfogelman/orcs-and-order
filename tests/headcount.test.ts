import { describe, expect, it } from 'vitest';
import { aliveCount, headcount, unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import { attackStrength, defenseStrength } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function arena(): GameState {
  const state = createGame({ seed: 20260822, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

/**
 * DESIGN_QUEUE section 31 measured the problem: the counting ladder buys damage
 * and health together for a linear price, so its effectiveness is quadratic in
 * cost and nothing priced linearly can ever compete. Every special unit in the
 * game was strictly dominated, and the AI -- correctly -- never built one.
 *
 * Losses are the answer. A count unit that has taken damage has lost members,
 * and swings with the ones it has left.
 */
describe('a count unit fights with what it has left', () => {
  it('loses members as it loses health', () => {
    const state = arena();
    const ten = spawnUnit(state, 0, 'orc_x10', 6, 6, false);
    const full = unitType(ten.type).hp;

    expect(aliveCount(ten)).toBe(10);
    ten.hp = full / 2;
    expect(aliveCount(ten)).toBe(5);
    ten.hp = full / 10;
    expect(aliveCount(ten)).toBe(1);
  });

  it('never drops below one while it is still alive', () => {
    const state = arena();
    const ten = spawnUnit(state, 0, 'orc_x10', 6, 6, false);
    ten.hp = 0.0001;
    // Rounding a survivor away would delete a unit the rules still consider
    // alive, and it would fight at zero strength until something killed it.
    expect(aliveCount(ten)).toBe(1);
    expect(headcount(ten)).toBeGreaterThan(0);

    ten.hp = 0;
    expect(aliveCount(ten)).toBe(0);
  });

  it('leaves a singleton at full strength however hurt it is', () => {
    const state = arena();
    const dragon = spawnUnit(state, 0, 'dragon', 6, 6, false);
    dragon.hp = 1;

    // The asymmetry is the whole point: there is only ever one dragon, and a
    // wounded one breathes the same fire. This is what buys the special units
    // a reason to exist next to the ladder.
    expect(aliveCount(dragon)).toBe(1);
    expect(headcount(dragon)).toBe(1);
  });

  it('swings and holds in proportion to the survivors', () => {
    const state = arena();
    const ten = spawnUnit(state, 0, 'orc_x10', 6, 6, false);
    const target = spawnUnit(state, 1, 'footman', 7, 6, false);
    const fullAttack = attackStrength(state, ten, target).total;
    const fullDefense = defenseStrength(state, ten, target).total;

    ten.hp = unitType(ten.type).hp / 2;

    expect(attackStrength(state, ten, target).total).toBeCloseTo(fullAttack / 2, 5);
    expect(defenseStrength(state, ten, target).total).toBeCloseTo(fullDefense / 2, 5);
  });

  it('does not weaken a hurt singleton', () => {
    const state = arena();
    const dragon = spawnUnit(state, 0, 'dragon', 6, 6, false);
    const target = spawnUnit(state, 1, 'footman', 7, 6, false);
    const full = attackStrength(state, dragon, target).total;

    dragon.hp = 1;
    expect(attackStrength(state, dragon, target).total).toBeCloseTo(full, 5);
  });
});
