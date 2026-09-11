import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import type { City, GameState, TerrainId } from '../src/model/types';
import { deserialize, serialize } from '../src/persist/save';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { routeTo, stepsThisTurn, tryStep } from '../src/sim/movement';
import {
  ROADS,
  advanceRoadWork,
  canBuildRoad,
  formatMoves,
  hasRoad,
  snapMoves,
  startRoad,
  stepCost,
} from '../src/sim/roads';
import { terrainMoveCost } from '../src/sim/rules';
import { beginPlayerTurn } from '../src/sim/turn';

/** A flat, fully explored map with nothing on it but what a test puts there. */
function flatWorld(ground: TerrainId = 'grass'): GameState {
  const state = createGame({ seed: 20260911, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill(ground);
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  return state;
}

const lay = (state: GameState, ...tiles: Array<[number, number]>) => {
  state.roads ??= new Array(state.width * state.height).fill(0);
  for (const [x, y] of tiles) state.roads[idx(x, y, state.width)] = 1;
};

const city = (state: GameState, x: number, y: number): City => {
  const c: City = {
    id: state.cities.length + 1, owner: 0, name: 'Crossroads', x, y, size: 1,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  return c;
};

/**
 * Section 27's first two steps, in Civ2's terms: a step from road to road costs
 * a third of a point, a city is a road, and workers lay them.
 */
describe('walking on a road', () => {
  it('costs a third of a point from one road tile to the next', () => {
    const state = flatWorld('forest');
    lay(state, [5, 5], [6, 5]);
    const p = state.players[0];
    expect(stepCost(state, p, 5, 5, 6, 5)).toBeCloseTo(ROADS.moveCost);
  });

  it('charges the ground for stepping onto a road, or off one', () => {
    const state = flatWorld('forest');
    lay(state, [5, 5]);
    const p = state.players[0];
    expect(stepCost(state, p, 4, 5, 5, 5)).toBe(terrainMoveCost(p, 'forest'));
    expect(stepCost(state, p, 5, 5, 6, 5)).toBe(terrainMoveCost(p, 'forest'));
  });

  it('counts a city as a road', () => {
    const state = flatWorld('hills');
    city(state, 5, 5);
    lay(state, [6, 5]);
    const p = state.players[0];
    expect(hasRoad(state, 5, 5)).toBe(true);
    expect(stepCost(state, p, 5, 5, 6, 5)).toBeCloseTo(ROADS.moveCost);
  });

  it('changes nothing at all on a map where nobody has laid one', () => {
    // Every AI game. Cities count as roads but are never adjacent, so without a
    // single road laid every step costs exactly what it always did.
    const state = flatWorld();
    const p = state.players[0];
    for (const ground of ['grass', 'forest', 'hills', 'mountains', 'swamp', 'desert'] as TerrainId[]) {
      state.terrain.fill(ground);
      expect(stepCost(state, p, 5, 5, 6, 5)).toBe(terrainMoveCost(p, ground));
    }
    expect(state.roads).toBeUndefined();
  });

  it('carries a one-move unit three tiles for one point, and leaves exactly nothing', () => {
    const state = flatWorld('forest');
    lay(state, [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]);
    const walker = spawnUnit(state, 0, 'goblin', 5, 5, false);
    walker.moves = 1;

    tryStep(state, walker, 6, 5);
    tryStep(state, walker, 7, 5);
    tryStep(state, walker, 8, 5);

    expect([walker.x, walker.y]).toEqual([8, 5]);
    // Not 1e-16. A unit left with a sliver of movement reads as idle forever.
    expect(walker.moves).toBe(0);
    expect(tryStep(state, walker, 9, 5).kind).toBe('blocked');
  });

  it('routes along the road rather than beside it', () => {
    const state = flatWorld('forest');
    // A road that bends away from the straight line and comes back.
    lay(state, [2, 5], [2, 4], ...Array.from({ length: 11 }, (_, n) => [2 + n, 3] as [number, number]), [12, 4], [12, 5]);
    const walker = spawnUnit(state, 0, 'goblin', 2, 5, false);

    const route = routeTo(state, walker, 12, 5)!;

    expect(route.some(([x, y]) => x === 7 && y === 3)).toBe(true);
  });

  it('counts road steps when working out how far a march gets this turn', () => {
    const state = flatWorld('forest');
    lay(state, [5, 5], [6, 5], [7, 5], [8, 5]);
    const walker = spawnUnit(state, 0, 'goblin', 5, 5, false);
    walker.moves = 1;
    const route: Array<[number, number]> = [[5, 5], [6, 5], [7, 5], [8, 5]];
    expect(stepsThisTurn(state, walker, route)).toBe(4);
  });

  it('snaps leftover movement to whole thirds and prints it as thirds', () => {
    expect(snapMoves(1 - 1 / 3 - 1 / 3 - 1 / 3)).toBe(0);
    expect(snapMoves(2)).toBe(2);
    expect(formatMoves(1)).toBe('1');
    expect(formatMoves(2 / 3)).toBe('⅔');
    expect(formatMoves(4 / 3)).toBe('1⅓');
    expect(formatMoves(0)).toBe('0');
  });
});

describe('laying a road', () => {
  it('takes a Peon two turns on open ground', () => {
    const state = flatWorld('grass');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);

    expect(startRoad(state, peon)).toBe(true);
    expect(peon.order).toBe('road');
    expect(advanceRoadWork(state, peon)).toBe('working');
    expect(hasRoad(state, 5, 5)).toBe(false);
    expect(advanceRoadWork(state, peon)).toBe('done');

    expect(hasRoad(state, 5, 5)).toBe(true);
    expect(peon.order).toBe('none');
    expect(peon.work).toBeUndefined();
  });

  it('takes a Peasant six turns up a mountain', () => {
    const state = flatWorld('mountains');
    const peasant = spawnUnit(state, 1, 'peasant', 5, 5, false);
    startRoad(state, peasant);
    for (let turn = 1; turn < 6; turn++) expect(advanceRoadWork(state, peasant)).toBe('working');
    expect(advanceRoadWork(state, peasant)).toBe('done');
  });

  it('refuses non-workers, water, cities and a road that is already there', () => {
    const state = flatWorld('grass');
    const soldier = spawnUnit(state, 0, 'goblin', 3, 3, false);
    expect(canBuildRoad(state, soldier).ok).toBe(false);

    const onCity = spawnUnit(state, 0, 'peon', 6, 6, false);
    city(state, 6, 6);
    expect(canBuildRoad(state, onCity).ok).toBe(false);

    const onRoad = spawnUnit(state, 0, 'peon', 9, 9, false);
    lay(state, [9, 9]);
    expect(canBuildRoad(state, onRoad).ok).toBe(false);

    state.terrain[idx(12, 12, state.width)] = 'water';
    const swimmer = spawnUnit(state, 0, 'peon', 12, 12, false);
    expect(canBuildRoad(state, swimmer).ok).toBe(false);
  });

  it('stops digging when somebody else finishes the road first', () => {
    const state = flatWorld('grass');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    startRoad(state, peon);
    lay(state, [5, 5]);
    expect(advanceRoadWork(state, peon)).toBe('stopped');
    expect(peon.order).toBe('none');
  });

  it('abandons the job when the worker walks off', () => {
    const state = flatWorld('grass');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    startRoad(state, peon);
    tryStep(state, peon, 6, 5);
    expect(peon.order).toBe('none');
    expect(peon.work).toBeUndefined();
    expect(hasRoad(state, 5, 5)).toBe(false);
  });

  it('digs at the top of the owner\'s turn, and says so when it is done', () => {
    const state = flatWorld('grass');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    spawnUnit(state, 1, 'footman', 20, 15, false);
    startRoad(state, peon);

    beginPlayerTurn(state, 0);
    expect(hasRoad(state, 5, 5)).toBe(false);
    beginPlayerTurn(state, 0);

    expect(hasRoad(state, 5, 5)).toBe(true);
    expect(state.log.some((e) => /finishes a road/.test(e.text))).toBe(true);
  });
});

describe('roads in a save', () => {
  it('keeps every road through a save and a load', () => {
    const state = flatWorld('grass');
    lay(state, [1, 1], [2, 1], [15, 10]);
    const restored = deserialize(serialize(state));
    expect(restored.roads).toEqual(state.roads);
    expect(hasRoad(restored, 15, 10)).toBe(true);
  });

  it('loads a save from before roads as a map without any', () => {
    const state = flatWorld('grass');
    const restored = deserialize(serialize(state));
    expect(restored.roads).toBeUndefined();
    expect(hasRoad(restored, 1, 1)).toBe(false);
  });

  it('keeps a job half dug through a save', () => {
    const state = flatWorld('grass');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    startRoad(state, peon);
    advanceRoadWork(state, peon);
    const restored = deserialize(serialize(state));
    const back = restored.units.find((u) => u.id === peon.id)!;
    expect(back.order).toBe('road');
    expect(back.work).toBe(1);
  });
});
