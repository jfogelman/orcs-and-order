import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import type { City, GameState, TerrainId } from '../src/model/types';
import { deserialize, serialize } from '../src/persist/save';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import {
  estimateRoadTurns,
  roadRouteTo,
  routeTo,
  startRoadTo,
  stepsThisTurn,
  tryStep,
} from '../src/sim/movement';
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
import { beginPlayerTurn, idleUnits } from '../src/sim/turn';

/** A flat, fully explored map with nothing on it but what a test puts there. */
function flatWorld(ground: TerrainId = 'grass'): GameState {
  const state = createGame({ seed: 20260911, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill(ground);
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    // Roads are taught by Bridge Building; every test here but the ones about
    // that gate wants a worker who already knows how.
    p.techs.push('bridge-building');
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

describe('a road-to that has nowhere left to dig', () => {
  it('ends at your own city instead of waiting at the gate for ever', () => {
    // Reported from a real game (turn 69): both Peons stood on a road with a
    // standing Road To pointed at one of the player's own cities, and did
    // nothing for the rest of the game. A city can never take a road and always
    // has somebody standing in it, so the step was refused as a traffic jam,
    // the worker waited, and there was nothing to dig where it stood.
    const state = flatWorld();
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    const home = city(state, 6, 5);
    spawnUnit(state, 0, 'goblin', home.x, home.y, false);
    lay(state, [5, 5]);

    expect(startRoadTo(state, peon, home.x, home.y).ok).toBe(true);
    for (let t = 0; t < 4; t++) beginPlayerTurn(state, 0);

    expect(peon.roadTo).toBeUndefined();
    expect(peon.order).not.toBe('road');
    expect([peon.x, peon.y]).toEqual([5, 5]);
    expect(state.log.some((e) => /nothing left to lay/.test(e.text))).toBe(true);
  });

  it('still digs its way there when the ground wants a road', () => {
    const state = flatWorld();
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    lay(state, [5, 5]);
    const home = city(state, 9, 5);

    expect(startRoadTo(state, peon, home.x, home.y).ok).toBe(true);
    for (let t = 0; t < 12; t++) beginPlayerTurn(state, 0);

    // The three tiles between the road it started on and the city gate.
    for (const [x, y] of [[6, 5], [7, 5], [8, 5]] as const) {
      expect(hasRoad(state, x, y), `${x},${y}`).toBe(true);
    }
    expect(peon.roadTo).toBeUndefined();
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

describe('the advance that teaches roads', () => {
  const forget = (state: GameState, id: number) => {
    state.players[id].techs = state.players[id].techs.filter((t) => t !== 'bridge-building');
  };

  it('is Bridge Building: a worker without it cannot start one, and is told why', () => {
    const state = flatWorld('grass');
    forget(state, 0);
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    const check = canBuildRoad(state, peon);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Bridge Building/);
    expect(startRoad(state, peon)).toBe(false);
  });

  it('lets the same worker start once the advance is known', () => {
    const state = flatWorld('grass');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    expect(canBuildRoad(state, peon).ok).toBe(true);
  });

  it('is not needed to walk on a road somebody else laid', () => {
    // A road does not know whose it is, and the gate is on building one.
    const state = flatWorld('forest');
    forget(state, 0);
    lay(state, [5, 5], [6, 5]);
    expect(stepCost(state, state.players[0], 5, 5, 6, 5)).toBeCloseTo(ROADS.moveCost);
  });
});

/**
 * Build Road To: asked for the moment roads existed, because laying one tile and
 * one order at a time is not how anybody wants to join two cities.
 */
describe('laying a road all the way to a tile', () => {
  /** A worker at (5,5), and somebody on the other side so nobody is eliminated. */
  function crew(ground: TerrainId = 'grass') {
    const state = flatWorld(ground);
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    spawnUnit(state, 1, 'footman', 25, 15, false);
    return { state, peon };
  }
  /** Turns until the order finishes, or -1 if it has not after `limit`. */
  const turnsUntilDone = (state: GameState, peon: { roadTo?: unknown }, limit = 20) => {
    for (let t = 1; t <= limit; t++) {
      beginPlayerTurn(state, 0);
      if (!peon.roadTo) return t;
    }
    return -1;
  };

  it('lays road on every tile of the route, both ends included, then stops', () => {
    const { state, peon } = crew();
    expect(startRoadTo(state, peon, 8, 5).ok).toBe(true);

    expect(turnsUntilDone(state, peon)).toBeGreaterThan(0);

    for (let x = 5; x <= 8; x++) expect(hasRoad(state, x, 5)).toBe(true);
    expect([peon.x, peon.y]).toEqual([8, 5]);
    expect(peon.order).toBe('none');
  });

  it('walks over road that is already there instead of stopping on it', () => {
    const plain = crew();
    startRoadTo(plain.state, plain.peon, 8, 5);
    const fresh = turnsUntilDone(plain.state, plain.peon);

    const joined = crew();
    lay(joined.state, [6, 5], [7, 5]);
    startRoadTo(joined.state, joined.peon, 8, 5);
    const across = turnsUntilDone(joined.state, joined.peon);

    expect(across).toBeGreaterThan(0);
    expect(across).toBeLessThan(fresh);
  });

  it('refuses a worker whose side does not know Bridge Building', () => {
    const { state, peon } = crew();
    state.players[0].techs = state.players[0].techs.filter((t) => t !== 'bridge-building');
    const check = startRoadTo(state, peon, 8, 5);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Bridge Building/);
    expect(peon.roadTo).toBeUndefined();
  });

  it('waits for a friendly in the way rather than giving up', () => {
    const { state, peon } = crew();
    const blocker = spawnUnit(state, 0, 'goblin', 6, 5, false);
    blocker.order = 'fortified';
    startRoadTo(state, peon, 6, 5);
    for (let t = 0; t < 4; t++) beginPlayerTurn(state, 0);
    expect(peon.roadTo).toBeDefined();

    state.units = state.units.filter((u) => u.id !== blocker.id);
    expect(turnsUntilDone(state, peon)).toBeGreaterThan(0);
    expect(hasRoad(state, 6, 5)).toBe(true);
  });

  it('is not left on the list of units with nothing to do', () => {
    const { state, peon } = crew();
    startRoadTo(state, peon, 8, 5);
    expect(idleUnits(state, 0).some((u) => u.id === peon.id)).toBe(false);
  });

  it('carries on after a save and a load', () => {
    const { state, peon } = crew();
    startRoadTo(state, peon, 8, 5);
    const restored = deserialize(serialize(state));
    const back = restored.units.find((u) => u.id === peon.id)!;
    expect(back.roadTo).toEqual({ x: 8, y: 5 });
    expect(turnsUntilDone(restored, back)).toBeGreaterThan(0);
    expect(hasRoad(restored, 8, 5)).toBe(true);
  });
});

/**
 * The number on the route preview. It first showed the march estimate -- "4" for
 * a road that took eight turns to lay -- which is wrong exactly when somebody is
 * deciding whether a road is worth the Peon.
 */
describe('how long a road-to will take', () => {
  function crew() {
    const state = flatWorld('grass');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    spawnUnit(state, 1, 'footman', 25, 15, false);
    return { state, peon };
  }
  const actualTurns = (state: GameState, peon: { roadTo?: unknown }) => {
    for (let t = 1; t <= 30; t++) {
      beginPlayerTurn(state, 0);
      if (!peon.roadTo) return t;
    }
    return -1;
  };

  it('matches the time it really takes on open ground', () => {
    const { state, peon } = crew();
    const estimate = estimateRoadTurns(state, peon, roadRouteTo(state, peon, 8, 5)!);
    startRoadTo(state, peon, 8, 5);
    expect(estimate).toBe(8);
    expect(actualTurns(state, peon)).toBe(estimate);
  });

  it('matches it when part of the way is road already', () => {
    const { state, peon } = crew();
    lay(state, [6, 5], [7, 5]);
    const estimate = estimateRoadTurns(state, peon, roadRouteTo(state, peon, 8, 5)!);
    startRoadTo(state, peon, 8, 5);
    expect(estimate).toBe(4);
    expect(actualTurns(state, peon)).toBe(estimate);
  });

  it('is longer than simply walking there', () => {
    const { state, peon } = crew();
    peon.moves = 1;
    const route = roadRouteTo(state, peon, 8, 5)!;
    expect(estimateRoadTurns(state, peon, route)).toBeGreaterThan(route.length - 1);
  });
});
