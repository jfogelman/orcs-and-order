import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { claimedBy, claims } from '../src/sim/borders';
import type { City, GameState } from '../src/model/types';

function board(): GameState {
  const state = createGame({ seed: 30, width: 30, height: 20 });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  return state;
}

function town(state: GameState, owner: number, x: number, y: number, founded = 1): City {
  const c = foundCity(state, spawnUnit(state, owner, owner === 0 ? 'peon' : 'peasant', x, y))!;
  c.foundedTurn = founded;
  return c;
}

describe('whose land is whose (section 117)', () => {
  it('claims what a city could work, and no more', () => {
    const state = board();
    town(state, 0, 10, 10);
    const owners = claims(state);
    expect(owners.filter((o) => o === 0)).toHaveLength(21);
    // The fat cross: two out straight, but not the far corners.
    expect(claimedBy(state, 12, 10)).toBe(0);
    expect(claimedBy(state, 10, 12)).toBe(0);
    expect(claimedBy(state, 11, 11)).toBe(0);
    expect(claimedBy(state, 12, 12)).toBe(-1);
    expect(claimedBy(state, 13, 10)).toBe(-1);
  });

  it('gives a contested tile to the nearer town', () => {
    const state = board();
    town(state, 0, 10, 10);
    town(state, 1, 13, 10);
    // Between them: nearer the Horde at 11, nearer the Kingdom at 12.
    expect(claimedBy(state, 11, 10)).toBe(0);
    expect(claimedBy(state, 12, 10)).toBe(1);
  });

  it('gives an equally distant tile to the older town', () => {
    const state = board();
    town(state, 0, 10, 10, 5);
    town(state, 1, 14, 10, 30);
    expect(claimedBy(state, 12, 10)).toBe(0);
    // Founded the other way round, the same tile goes the other way.
    const other = board();
    town(other, 0, 10, 10, 30);
    town(other, 1, 14, 10, 5);
    expect(claimedBy(other, 12, 10)).toBe(1);
  });

  it('follows a town when it changes hands', () => {
    const state = board();
    const c = town(state, 0, 10, 10);
    expect(claimedBy(state, 10, 10)).toBe(0);
    c.owner = 1;
    expect(claimedBy(state, 10, 10)).toBe(1);
  });

  it('claims nothing for a side with no towns', () => {
    const state = board();
    expect(claims(state).every((o) => o === -1)).toBe(true);
    expect(claimedBy(state, idx(5, 5, state.width) % state.width, 5)).toBe(-1);
  });
});
