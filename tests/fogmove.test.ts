import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { createGame, recomputeAllVisibility, spawnUnit } from '../src/sim/gamestate';
import { moveToward, routeTo, tryStep } from '../src/sim/movement';
import type { GameState } from '../src/model/types';

/** A flat map with nothing on it but what a test puts there. */
function flatWorld(): GameState {
  const state = createGame({ seed: 7, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

describe('moving into fog', () => {
  it('routes across unexplored ground', () => {
    const state = flatWorld();
    const unit = spawnUnit(state, 0, 'goblin', 2, 10);
    state.players[0].explored.fill(0);
    state.players[0].visible.fill(0);
    recomputeAllVisibility(state);

    // The destination has never been seen. It should still be reachable.
    expect(state.players[0].explored[idx(20, 10, state.width)]).toBe(0);
    expect(routeTo(state, unit, 20, 10)).not.toBeNull();
  });

  it('is not blocked by an enemy it cannot see', () => {
    const state = flatWorld();
    const unit = spawnUnit(state, 0, 'goblin', 2, 10);
    // A wall of enemies across the corridor, all of them in the dark.
    for (let y = 0; y < state.height; y++) spawnUnit(state, 1, 'footman', 10, y);
    state.players[0].explored.fill(0);
    state.players[0].visible.fill(0);
    recomputeAllVisibility(state);

    // Previously this returned null -- the unseen line blocked every route,
    // so the move silently failed and leaked where the enemy was.
    expect(routeTo(state, unit, 20, 10)).not.toBeNull();
  });

  it('halts the march when an enemy comes into view', () => {
    const state = flatWorld();
    const unit = spawnUnit(state, 0, 'outrider', 2, 10);
    spawnUnit(state, 1, 'footman', 12, 10);
    state.players[0].explored.fill(1);
    recomputeAllVisibility(state);

    unit.moves = 40;
    moveToward(state, unit, 25, 10);
    // It should stop on sighting rather than walking to the far side.
    expect(unit.x).toBeLessThan(20);
    expect(unit.goto).toBeNull();
  });
});

describe('captured cities', () => {
  it('keeps its walls when it changes hands', () => {
    const state = flatWorld();
    state.cities.push({
      id: 1, owner: 1, name: 'Target', x: 10, y: 10, size: 4,
      food: 0, shields: 0, buildings: ['walls', 'granary'],
      producing: { kind: 'coin' }, workedTiles: [], disorder: false, foundedTurn: 1,
    });
    const taker = spawnUnit(state, 0, 'orc', 9, 10);
    recomputeAllVisibility(state);

    // Capture is an explicit step onto an adjacent city, not something a
    // route walks into: pathing deliberately refuses to enter enemy ground.
    const outcome = tryStep(state, taker, 10, 10);
    expect(outcome.kind).toBe('captured');
    const city = state.cities[0];
    expect(city.owner).toBe(0);
    // Levelling the walls on capture made a taken city easier to retake than
    // it was to take, which drove an endless see-saw.
    expect(city.buildings).toContain('walls');
    // Something is still lost to the sack.
    expect(city.buildings).not.toContain('granary');
    expect(taker.order).toBe('fortified');
  });
});
