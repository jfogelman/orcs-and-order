import { afterEach, describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import type { City, GameState } from '../src/model/types';
import { AI_TUNING, PERSONALITIES, runAiTurn } from '../src/ai/ai';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { connectedByRoad } from '../src/sim/roads';

/**
 * Section 107: the AI lays roads. Until it did, roads were an advantage only a
 * person could take, and no sweep could see them.
 */

const saved = { ...AI_TUNING };
afterEach(() => {
  Object.assign(AI_TUNING, saved);
});

/**
 * A row of the Horde's cities on open grass, each already garrisoned, the
 * oldest -- the capital -- at (3,5). Somebody else stands far away so nobody is
 * eliminated.
 */
function empire(cityCount: number, knowsRoads = true): GameState {
  const state = createGame({ seed: 20260912, width: 40, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.controller = 'ai';
  }
  if (knowsRoads) state.players[0].techs.push('bridge-building');
  for (let n = 0; n < cityCount; n++) {
    const c: City = {
      id: n + 1, owner: 0, name: `Town ${n}`, x: 3 + n * 5, y: 5, size: 3,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1 + n, foundedBy: 0,
    };
    state.cities.push(c);
    spawnUnit(state, 0, 'orc', c.x, c.y, false).order = 'fortified';
  }
  spawnUnit(state, 1, 'footman', 38, 18, false);
  return state;
}

const lay = (state: GameState, ...tiles: Array<[number, number]>) => {
  state.roads ??= new Array(state.width * state.height).fill(0);
  for (const [x, y] of tiles) state.roads[idx(x, y, state.width)] = 1;
};

const target = PERSONALITIES.orc.targetCities;

describe('the AI laying roads', () => {
  it('sends a spare worker to join the nearest city to the capital, once expansion is done', () => {
    const state = empire(target);
    const peon = spawnUnit(state, 0, 'peon', 9, 6, false);

    runAiTurn(state, 0);

    // It walks the one tile to Town 1 and sets off for the capital from there.
    expect(peon.roadTo).toEqual({ x: 3, y: 5 });
  });

  it('starts beside the gate when a garrison is standing in it', () => {
    // Section 108 keeps a soldier in every city, and one unit to a tile means
    // the crew cannot walk into the gate any more. A road to the doorstep joins
    // the city all the same.
    const state = empire(target);
    const peon = spawnUnit(state, 0, 'peon', 10, 5, false);

    // A couple of turns, because the crew has to walk the last tile or two and
    // an escort may be shuffling about in front of it. Movement is handed back
    // by hand, since this drives the AI without the rest of the turn.
    for (let turn = 0; turn < 3; turn++) {
      runAiTurn(state, 0);
      for (const u of state.units) u.moves = 1;
    }

    expect(peon.roadTo).toEqual({ x: 3, y: 5 });
    expect(Math.max(Math.abs(peon.x - 8), Math.abs(peon.y - 5))).toBeLessThanOrEqual(1);
  });

  it('digs nothing while there are still cities to found', () => {
    const state = empire(3);
    const peon = spawnUnit(state, 0, 'peon', 9, 6, false);
    runAiTurn(state, 0);
    expect(peon.roadTo).toBeUndefined();
  });

  it('digs nothing without Bridge Building', () => {
    const state = empire(target, false);
    const peon = spawnUnit(state, 0, 'peon', 9, 6, false);
    runAiTurn(state, 0);
    expect(peon.roadTo).toBeUndefined();
  });

  it('digs nothing with the lever off, which is how it is measured', () => {
    AI_TUNING.buildRoads = false;
    const state = empire(target);
    const peon = spawnUnit(state, 0, 'peon', 9, 6, false);
    runAiTurn(state, 0);
    expect(peon.roadTo).toBeUndefined();
  });

  it('has one city build a worker when there is road to lay -- one, not one each', () => {
    const state = empire(target);
    runAiTurn(state, 0);
    const building = state.cities.filter(
      (c) => c.producing.kind === 'unit' && c.producing.id === 'peon',
    );
    expect(building).toHaveLength(1);
  });

  it('builds no worker once every city is joined to the capital', () => {
    const state = empire(target);
    lay(state, ...Array.from({ length: 26 }, (_, n) => [3 + n, 5] as [number, number]));
    runAiTurn(state, 0);
    const building = state.cities.filter(
      (c) => c.producing.kind === 'unit' && c.producing.id === 'peon',
    );
    expect(building).toHaveLength(0);
  });
});

describe('which cities are joined by road', () => {
  it('joins two cities along a road between them', () => {
    const state = empire(2);
    lay(state, [4, 5], [5, 5], [6, 5], [7, 5]);
    expect(connectedByRoad(state, 0, 3, 5).has(idx(8, 5, state.width))).toBe(true);
  });

  it('is broken by a gap in the road', () => {
    const state = empire(2);
    lay(state, [4, 5], [6, 5], [7, 5]);
    expect(connectedByRoad(state, 0, 3, 5).has(idx(8, 5, state.width))).toBe(false);
  });

  it('does not count road its side has never seen', () => {
    const state = empire(2);
    lay(state, [4, 5], [5, 5], [6, 5], [7, 5]);
    state.players[0].explored[idx(5, 5, state.width)] = 0;
    expect(connectedByRoad(state, 0, 3, 5).has(idx(8, 5, state.width))).toBe(false);
  });
});
