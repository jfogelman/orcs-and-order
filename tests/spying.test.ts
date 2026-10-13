import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { SPY, canRead, noticeOdds, readCity, readOdds } from '../src/sim/spying';
import { appearsTo, wearDisguise } from '../src/sim/disguise';
import { standing } from '../src/sim/diplomacy';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 136 slice 2: reading a town.
 *
 * The first thing on the spy's ladder and the one that makes the unit worth
 * its thirty shields. Everything about it is information -- it takes nothing
 * and breaks nothing -- and the side being read is not told it happened
 * **unless the spy is caught**, which is the only moment anybody learns whose
 * it was.
 */
function board(): { state: GameState; spy: Unit; city: City } {
  const state = createGame({ seed: 17, width: 30, height: 20 });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const city = foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10))!;
  state.units = state.units.filter((u) => u.owner !== 1 || u.x !== city.x || u.y !== city.y);
  const spy = spawnUnit(state, 0, 'skulker', 11, 10);
  return { state, spy, city };
}

describe('reading a town', () => {
  it('is offered beside somebody else’s town and nowhere else', () => {
    const { state, spy, city } = board();
    expect(canRead(spy, city).ok).toBe(true);

    // Not your own.
    const mine = foundCity(state, spawnUnit(state, 0, 'peon', 20, 10))!;
    expect(canRead(spy, mine).ok).toBe(false);
    expect(canRead(spy, mine).reason).toMatch(/your own/i);

    // Not from across the map.
    spy.x = 2;
    expect(canRead(spy, city).ok).toBe(false);
    expect(canRead(spy, city).reason).toMatch(/far away/i);
  });

  it('is only for spies', () => {
    const { state, city } = board();
    const soldier = spawnUnit(state, 0, 'goblin', 11, 10);
    expect(canRead(soldier, city).ok).toBe(false);
    expect(canRead(soldier, city).reason).toMatch(/only a spy/i);
  });

  it('spends the turn whatever comes of it', () => {
    const { state, spy, city } = board();
    readCity(state, spy, city);
    expect(spy.moves).toBe(0);
  });

  it('reports what is actually in the town', () => {
    const { state, spy, city } = board();
    city.size = 4;
    city.producing = { kind: 'unit', id: 'footman' };
    city.buildings = ['barracks'];
    spawnUnit(state, 1, 'footman', city.x, city.y);

    // Rank it up so the reading is near-certain; the dice are tested below.
    spy.rank = 3;
    let reading = null;
    for (let i = 0; i < 40 && !reading; i++) {
      spy.moves = 1;
      const out = readCity(state, spy, city);
      if (out.kind === 'read') reading = out.reading;
    }
    expect(reading, 'a rank-3 spy should get a reading inside forty tries').not.toBeNull();
    expect(reading!.size).toBe(4);
    expect(reading!.building).toBe('Footman');
    expect(reading!.garrison).toBe(1);
    expect(reading!.standing).toContain('Barracks');
  });

  it('pays experience, because a spy can earn it no other way', () => {
    const { state, spy, city } = board();
    // It never fights -- `attack: 0` sees to that -- so without this a spy
    // could never be promoted and the whole rank half of the feature would be
    // unreachable.
    const before = spy.xp;
    for (let i = 0; i < 10; i++) {
      spy.moves = 1;
      readCity(state, spy, city);
    }
    expect(spy.xp).toBeGreaterThan(before);
  });

  it('gets better at reading and quieter about failing, with rank', () => {
    const { spy } = board();
    const green = { read: readOdds(spy), seen: noticeOdds(spy) };
    spy.rank = 3;
    const veteran = { read: readOdds(spy), seen: noticeOdds(spy) };
    expect(veteran.read).toBeGreaterThan(green.read);
    // The one a promotion is really buying: being noticed less. Failure and
    // exposure are two different rolls, which is what lets a promotion make a
    // spy *safe* rather than merely effective.
    expect(veteran.seen).toBeLessThan(green.seen);
  });

  it('is anonymous until it is caught, and then it is not', () => {
    const { state, spy, city } = board();
    wearDisguise(state, spy, 1);
    expect(appearsTo(spy, 1).owner).toBe(1);
    const before = standing(state, 0, 1);

    // Run it until it is caught: the point is what being caught does, not how
    // often it happens.
    let caught = false;
    for (let i = 0; i < 200 && !caught; i++) {
      spy.moves = 1;
      caught = readCity(state, spy, city).kind === 'caught';
    }
    expect(caught, 'two hundred readings without once being noticed').toBe(true);

    // The only moment the other side learns whose it was.
    expect(appearsTo(spy, 1)).toEqual({ owner: 0, type: 'skulker' });
    expect(standing(state, 0, 1)).toBeLessThan(before);
  });

  it('tells nobody anything when it merely fails', () => {
    const { state, spy, city } = board();
    wearDisguise(state, spy, 1);

    // Checked per attempt rather than over the run. The first draft ran until
    // it saw a quiet failure and broke when caught -- and a miss and a catch
    // are equally likely as the first non-reading, so it was a coin flip
    // whether the test ever reached its assertion.
    let missed = 0;
    for (let i = 0; i < 60; i++) {
      spy.moves = 1;
      const theirsBefore = state.log.filter((e) => e.player === city.owner).length;
      const out = readCity(state, spy, city);
      if (out.kind !== 'missed') continue;
      missed++;
      // **Nothing reaches the side being read.** Counted on their log rather
      // than on the whole of it: a quiet failure can still promote the spy,
      // and a promotion is our own news. Anonymity is a claim about what
      // *they* learn.
      expect(
        state.log.filter((e) => e.player === city.owner).length,
        'a quiet failure told the other side something',
      ).toBe(theirsBefore);
    }
    expect(missed, 'sixty readings and never a quiet failure').toBeGreaterThan(0);
  });

  it('does nothing at all with the lever off', () => {
    const { state, spy, city } = board();
    SPY.enabled = false;
    try {
      expect(canRead(spy, city).ok).toBe(false);
      const moves = spy.moves;
      expect(readCity(state, spy, city).kind).toBe('missed');
      expect(spy.moves, 'it should not even have spent the turn').toBe(moves);
    } finally {
      SPY.enabled = true;
    }
  });
});
