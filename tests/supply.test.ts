import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { inSupply, SUPPLY } from '../src/sim/city';
import { attackStrength } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { beginPlayerTurn } from '../src/sim/turn';

/**
 * Supply.
 *
 * The rule that punishes wandering off. Its most interesting property is that
 * a captured city supplies its captor, so an advance that actually takes
 * ground pays for itself while a raid that takes nothing does not.
 */

function board(): GameState {
  const state = createGame({ seed: 909, width: 40, height: 30 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

function place(state: GameState, owner: number, x: number, y: number): City {
  const city: City = {
    id: state.cities.length + 1, owner, name: `C${state.cities.length}`, x, y, size: 4,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(city);
  return city;
}

describe('who is in supply', () => {
  it('counts anyone within range of a city they own', () => {
    const state = board();
    place(state, 0, 10, 10);
    const near = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range, 10);
    const far = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range + 1, 10);
    expect(inSupply(state, near)).toBe(true);
    expect(inSupply(state, far)).toBe(false);
  });

  it('does not accept the enemy\u2019s cities as supply', () => {
    const state = board();
    place(state, 1, 10, 10);
    const orc = spawnUnit(state, 0, 'orc', 10, 10);
    expect(inSupply(state, orc)).toBe(false);
  });

  it('measures to the nearest of several cities', () => {
    const state = board();
    place(state, 0, 5, 5);
    place(state, 0, 30, 20);
    const unit = spawnUnit(state, 0, 'orc', 30, 20 + SUPPLY.range);
    expect(inSupply(state, unit)).toBe(true);
  });

  it('supplies a captor from the city it just took', () => {
    // The point of the rule: an advance that takes ground pays for itself,
    // a raid that takes nothing does not.
    const state = board();
    place(state, 0, 2, 2);
    const deep = place(state, 1, 30, 20);
    const orc = spawnUnit(state, 0, 'orc', 30, 20);
    expect(inSupply(state, orc)).toBe(false);
    deep.owner = 0;
    expect(inSupply(state, orc)).toBe(true);
  });
});

describe('what being out of supply costs', () => {
  it('weakens an attack', () => {
    const state = board();
    place(state, 0, 10, 10);
    const supplied = spawnUnit(state, 0, 'orc', 10, 10);
    const stranded = spawnUnit(state, 0, 'orc', 35, 25);
    const target = spawnUnit(state, 1, 'footman', 20, 15);
    const strong = attackStrength(state, supplied, target).total;
    const weak = attackStrength(state, stranded, target).total;
    expect(weak).toBeCloseTo(strong * SUPPLY.attackPenalty);
  });

  it('stops healing entirely, rather than slowing it', () => {
    // healUnits floors recovery at a point a turn, so "no healing" has to be
    // handled deliberately or it silently becomes "heals slowly".
    const state = board();
    place(state, 0, 2, 2);
    const stranded = spawnUnit(state, 0, 'orc', 35, 25);
    stranded.hp = 3;
    beginPlayerTurn(state, 0);
    expect(stranded.hp, 'a stranded unit healed anyway').toBe(3);
  });

  it('still heals a unit that is inside supply', () => {
    const state = board();
    place(state, 0, 10, 10);
    const home = spawnUnit(state, 0, 'orc', 12, 10);
    home.hp = 3;
    beginPlayerTurn(state, 0);
    expect(home.hp).toBeGreaterThan(3);
  });

  it('can be switched off entirely', () => {
    const state = board();
    place(state, 0, 2, 2);
    const stranded = spawnUnit(state, 0, 'orc', 35, 25);
    const before = SUPPLY.range;
    SUPPLY.range = 99;
    expect(inSupply(state, stranded)).toBe(true);
    const target = spawnUnit(state, 1, 'footman', 34, 25);
    expect(attackStrength(state, stranded, target).total).toBeCloseTo(
      unitType('orc').attack,
    );
    SUPPLY.range = before;
  });
});
