import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { createGame, recomputeAllVisibility, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';
import { buildOptions, foundCity } from '../src/sim/city';
import { beginPlayerTurn } from '../src/sim/turn';
import { landingTiles, roomAboard, unload, unloadAll } from '../src/sim/ships';
import { deserialize, serialize } from '../src/persist/save';
import type { GameState } from '../src/model/types';

/** Land in columns 0-9 and 20-29, sea from 10 to 19. */
function strait(): GameState {
  const state = createGame({ seed: 7, width: 30, height: 12 });
  state.units.length = 0;
  state.cities.length = 0;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      state.terrain[idx(x, y, state.width)] = x >= 10 && x <= 19 ? 'water' : 'grass';
    }
  }
  for (const p of state.players) {
    p.explored.fill(1);
    if (!p.techs.includes('mapmaking')) p.techs.push('mapmaking');
  }
  recomputeAllVisibility(state);
  return state;
}

describe('ships', () => {
  it('keep to the water, and land units keep off it', () => {
    const state = strait();
    const raft = spawnUnit(state, 0, 'raft', 10, 5);
    expect(tryStep(state, raft, 9, 5).kind).toBe('blocked');
    expect(tryStep(state, raft, 11, 5).kind).toBe('moved');
    const orc = spawnUnit(state, 0, 'orc', 9, 3);
    expect(tryStep(state, orc, 10, 3).kind).toBe('blocked');
  });

  it('are built only where there is sea, and launched onto it', () => {
    const state = strait();
    const coast = foundCity(state, spawnUnit(state, 0, 'peon', 9, 5))!;
    const inland = foundCity(state, spawnUnit(state, 0, 'peon', 3, 5))!;
    expect(buildOptions(state, coast).units.some((u) => u.id === 'raft')).toBe(true);
    expect(buildOptions(state, inland).units.some((u) => u.id === 'raft')).toBe(false);
    // The Kingdom's barge never turns up in a Horde yard.
    expect(buildOptions(state, coast).units.some((u) => u.id === 'barge')).toBe(false);
  });

  it('take passengers aboard, three at most, off the map', () => {
    const state = strait();
    const raft = spawnUnit(state, 0, 'raft', 10, 5);
    const riders = [4, 5, 6].map((y) => spawnUnit(state, 0, 'orc', 9, y));
    for (const r of riders) expect(tryStep(state, r, 10, 5).kind).toBe('moved');
    expect(raft.cargo).toHaveLength(3);
    expect(roomAboard(raft)).toBe(0);
    for (const r of riders) {
      expect(state.units.includes(r)).toBe(false);
      expect(r.moves).toBe(0);
    }
    // A fourth has nowhere to sit, and the ship is still a unit in the way.
    const fourth = spawnUnit(state, 0, 'orc', 9, 6);
    expect(tryStep(state, fourth, 10, 5).kind).toBe('blocked');
  });

  it('carry them across and put them ashore next turn', () => {
    const state = strait();
    const raft = spawnUnit(state, 0, 'raft', 10, 5);
    const orc = spawnUnit(state, 0, 'orc', 9, 5);
    tryStep(state, orc, 10, 5);
    raft.moves = 20;
    for (let x = 11; x <= 19; x++) expect(tryStep(state, raft, x, 5).kind).toBe('moved');
    // Nobody can step off without legs: boarding spent them.
    expect(unload(state, raft, orc.id, 20, 5)).toBe(false);
    state.activePlayer = 0;
    beginPlayerTurn(state, 0);
    expect(landingTiles(state, raft).some(([x, y]) => x === 20 && y === 5)).toBe(true);
    expect(unload(state, raft, orc.id, 20, 5)).toBe(true);
    expect(state.units.includes(orc)).toBe(true);
    expect([orc.x, orc.y]).toEqual([20, 5]);
    expect(raft.cargo).toBeUndefined();
  });

  it('do not land anybody straight into a foreign town', () => {
    const state = strait();
    foundCity(state, spawnUnit(state, 1, 'peasant', 20, 5));
    const raft = spawnUnit(state, 0, 'raft', 19, 5);
    raft.cargo = [{ ...spawnUnit(state, 0, 'orc', 0, 0) }];
    state.units.splice(state.units.findIndex((u) => u.id === raft.cargo![0].id), 1);
    expect(landingTiles(state, raft).some(([x, y]) => x === 20 && y === 5)).toBe(false);
    expect(unloadAll(state, raft, 20, 5)).toBe(1);
  });

  it('go down with everybody aboard', () => {
    const state = strait();
    const raft = spawnUnit(state, 0, 'raft', 14, 5);
    const orc = spawnUnit(state, 0, 'orc', 13, 5);
    orc.x = 13;
    state.terrain[idx(13, 5, state.width)] = 'grass';
    tryStep(state, orc, 14, 5);
    raft.hp = 1;
    const frigate = spawnUnit(state, 1, 'frigate', 15, 5);
    for (let i = 0; i < 20 && state.units.includes(raft); i++) {
      frigate.moves = 3;
      tryStep(state, frigate, 14, 5);
      frigate.hp = 12;
    }
    expect(state.units.includes(raft)).toBe(false);
    expect(state.log.some((l) => l.text.includes('goes down with the ship'))).toBe(true);
  });

  it('cannot be fought from the shore, but can shell it', () => {
    const state = strait();
    const warboat = spawnUnit(state, 0, 'warboat', 10, 5);
    const footman = spawnUnit(state, 1, 'footman', 9, 5);
    expect(tryStep(state, footman, 10, 5)).toMatchObject({ kind: 'blocked' });
    const outcome = tryStep(state, warboat, 9, 5);
    expect(outcome.kind).toBe('combat');
    // Whatever happened, the boat is still at sea.
    if (state.units.includes(warboat)) expect([warboat.x, warboat.y]).toEqual([10, 5]);
  });

  it('keep their passengers through a save', () => {
    const state = strait();
    const raft = spawnUnit(state, 0, 'raft', 10, 5);
    const orc = spawnUnit(state, 0, 'orc', 9, 5);
    tryStep(state, orc, 10, 5);
    const loaded = deserialize(serialize(state));
    const again = loaded.units.find((u) => u.id === raft.id)!;
    expect(again.cargo?.map((u) => u.id)).toEqual([orc.id]);
  });
});
