import { afterEach, describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { AI_TUNING, runAiTurn } from '../src/ai/ai';
import { cityGoldBonus } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';

/**
 * Section 108: the AI keeps somebody standing in its cities.
 *
 * It never did. A unit walked to an empty city one turn and marched back out to
 * the war the next, so every building that pays nothing without a garrison --
 * the Goblin Treasury, the Simple Market -- earned nothing for whole games at a
 * time, and section 106's trade routes measured at nothing because of it.
 */

const saved = { ...AI_TUNING };
afterEach(() => {
  Object.assign(AI_TUNING, saved);
});

/** The Horde's cities on open grass, each with a treasury and nobody in it. */
function empire(count = 2, apart = 10): { state: GameState; cities: City[] } {
  const state = createGame({ seed: 20260915, width: 40, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.controller = 'ai';
  }
  const cities: City[] = [];
  for (let n = 0; n < count; n++) {
    const city: City = {
      id: n + 1,
      owner: 0,
      name: `Town ${n + 1}`,
      x: 3 + n * apart,
      y: 5,
      size: 4,
      food: 0,
      shields: 0,
      buildings: ['treasury'],
      producing: { kind: 'coin' },
      workedTiles: [],
      disorder: false,
      foundedTurn: 1 + n,
      foundedBy: 0,
    };
    state.cities.push(city);
    cities.push(city);
  }
  // Far away, so nobody is eliminated and nothing is worth attacking.
  spawnUnit(state, 1, 'footman', 38, 18, false);
  return { state, cities };
}

describe('somebody stays in the city', () => {
  it('keeps the only soldier in a city where it stands', () => {
    const { state, cities } = empire(1);
    const orc = spawnUnit(state, 0, 'orc', cities[0].x, cities[0].y, false);

    runAiTurn(state, 0);

    expect([orc.x, orc.y]).toEqual([cities[0].x, cities[0].y]);
    expect(orc.order).toBe('fortified');
  });

  it('is what makes the treasury pay at all', () => {
    const { state, cities } = empire(1);
    expect(cityGoldBonus(state, cities[0])).toBe(0);
    spawnUnit(state, 0, 'orc', cities[0].x, cities[0].y, false);
    runAiTurn(state, 0);
    expect(cityGoldBonus(state, cities[0])).toBeGreaterThan(0);
  });

  it('marched straight back out again before this, which is the defect', () => {
    AI_TUNING.holdCities = false;
    const { state, cities } = empire(1);
    const orc = spawnUnit(state, 0, 'orc', cities[0].x, cities[0].y, false);
    runAiTurn(state, 0);
    expect([orc.x, orc.y]).not.toEqual([cities[0].x, cities[0].y]);
  });

  it('walks to the nearest empty city, not the first one founded', () => {
    const { state, cities } = empire(2, 12);
    // Standing beside the second town, with the first one far off to the west.
    const orc = spawnUnit(state, 0, 'orc', cities[1].x + 1, cities[1].y, false);

    runAiTurn(state, 0);

    expect([orc.x, orc.y]).toEqual([cities[1].x, cities[1].y]);
  });

  it('does not count a Peon in the gate as a garrison', () => {
    const { state, cities } = empire(1);
    spawnUnit(state, 0, 'peon', cities[0].x, cities[0].y, false);
    const orc = spawnUnit(state, 0, 'orc', cities[0].x + 2, cities[0].y, false);

    runAiTurn(state, 0);

    // The Peon is standing in it and the treasury still pays nothing, so the
    // soldier is still wanted. It cannot share the tile, so it comes as close as
    // it can and the Peon moves on in its own time.
    expect(Math.max(Math.abs(orc.x - cities[0].x), Math.abs(orc.y - cities[0].y))).toBeLessThan(2);
  });

  it('lets a second soldier carry on to the war', () => {
    const { state, cities } = empire(1);
    spawnUnit(state, 0, 'orc', cities[0].x, cities[0].y, false).order = 'fortified';
    const spare = spawnUnit(state, 0, 'orc', cities[0].x + 1, cities[0].y, false);

    runAiTurn(state, 0);

    // Somebody is home, so this one is free: it goes looking for the Kingdom
    // rather than standing about at the gate.
    expect(spare.x).toBeGreaterThan(cities[0].x + 1);
  });
});
