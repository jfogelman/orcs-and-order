import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import {
  DISBAND_REFUND,
  disband,
  disbandBlocked,
  disbandRefund,
  refundWouldStick,
} from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function arena(): GameState {
  const state = createGame({ seed: 20260827, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  state.activePlayer = 0;
  return state;
}

function city(state: GameState, owner: number, x: number, y: number): City {
  const c: City = {
    id: state.cities.length + 1, owner, name: 'Hold', x, y, size: 3,
    food: 0, shields: 0, buildings: [], producing: { kind: 'unit', id: 'goblin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  return c;
}

/**
 * There was previously no way to get rid of a unit at all. A Peon that had
 * founded everything worth founding cost upkeep for ever and could only be
 * disposed of by walking it into something. See DESIGN_QUEUE section 13.
 */
describe('disbanding', () => {
  it('gives back half the shields, in a city of yours', () => {
    const state = arena();
    const hold = city(state, 0, 5, 5);
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);
    const expected = Math.floor(unitType('ogre').cost * DISBAND_REFUND);

    expect(disbandRefund(state, ogre)).toBe(expected);
    expect(disband(state, ogre)).toBe(expected);

    expect(hold.shields).toBe(expected);
    expect(state.units).not.toContain(ogre);
  });

  it('gives back nothing out in the open', () => {
    const state = arena();
    city(state, 0, 5, 5);
    const ogre = spawnUnit(state, 0, 'ogre', 12, 12, false);

    expect(disbandRefund(state, ogre)).toBe(0);
    expect(disband(state, ogre)).toBe(0);
    // Still gone: dismissing a unit works anywhere, it just pays nothing.
    expect(state.units).not.toContain(ogre);
  });

  it('gives back nothing in somebody else city', () => {
    const state = arena();
    const theirs = city(state, 1, 5, 5);
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);

    expect(disbandRefund(state, ogre)).toBe(0);
    disband(state, ogre);
    expect(theirs.shields).toBe(0);
  });

  it('refuses to dismiss somebody else unit', () => {
    const state = arena();
    city(state, 1, 5, 5);
    const theirs = spawnUnit(state, 1, 'ogre', 5, 5, false);

    expect(disbandBlocked(state, theirs)).toMatch(/yours/i);
    expect(disband(state, theirs)).toBe(0);
    expect(state.units).toContain(theirs);
  });

  it('is never worth more than the unit cost to build', () => {
    const state = arena();
    city(state, 0, 5, 5);
    // Any higher a rate and a unit is a better shield store than a shield is,
    // and people would build them in order to melt them.
    for (const id of ['goblin', 'orc', 'ogre', 'dragon', 'orc_x10'] as const) {
      const u = spawnUnit(state, 0, id, 5, 5, false);
      expect(disbandRefund(state, u)).toBeLessThan(unitType(id).cost);
      state.units.length = 0;
    }
  });

  it('counts a group at the group price, not one creature', () => {
    const state = arena();
    city(state, 0, 5, 5);
    const one = spawnUnit(state, 0, 'orc', 5, 5, false);
    const oneRefund = disbandRefund(state, one);
    state.units.length = 0;

    const many = spawnUnit(state, 0, 'orc_x10', 5, 5, false);
    // Ten Orcs cost ten orcs' shields, so breaking them up returns ten orcs'
    // worth. Anything else would make the ladder a shield laundering scheme.
    expect(disbandRefund(state, many)).toBeGreaterThan(oneRefund * 5);
  });
});

/**
 * The standing orders empty the shield box every turn, so paying a refund into
 * a city set to one of them is the rules working correctly and looking exactly
 * like a bug. The interface says so; these pin down what it says it about.
 */
describe('whether a refund would actually be kept', () => {
  it('sticks when the city is building something', () => {
    const state = arena();
    const hold = city(state, 0, 5, 5);
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);

    hold.producing = { kind: 'unit', id: 'goblin' };
    expect(refundWouldStick(state, ogre)).toBe(true);

    hold.producing = { kind: 'building', id: 'barracks' };
    expect(refundWouldStick(state, ogre)).toBe(true);
  });

  it('does not stick on any of the standing orders', () => {
    const state = arena();
    const hold = city(state, 0, 5, 5);
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);

    for (const kind of ['coin', 'beakers', 'calm'] as const) {
      hold.producing = { kind };
      expect(refundWouldStick(state, ogre), kind).toBe(false);
      // The shields are still paid in -- it is the city that spends them.
      expect(disbandRefund(state, ogre)).toBeGreaterThan(0);
    }
  });

  it('does not stick out in the open, where there is nothing to keep', () => {
    const state = arena();
    city(state, 0, 5, 5);
    const ogre = spawnUnit(state, 0, 'ogre', 12, 12, false);
    expect(refundWouldStick(state, ogre)).toBe(false);
  });
});
