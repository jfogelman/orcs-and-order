import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { runAiTurn } from '../src/ai/ai';
import { landmasses, stranded } from '../src/ai/naval';
import { createGame, recomputeAllVisibility, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { beginPlayerTurn } from '../src/sim/turn';
import type { GameState } from '../src/model/types';

/** Land in columns 0-9 and 20-29, sea between. Both sides AI, all of it seen. */
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
    p.controller = 'ai';
    p.explored.fill(1);
    if (!p.techs.includes('mapmaking')) p.techs.push('mapmaking');
  }
  recomputeAllVisibility(state);
  return state;
}

describe('the AI at sea', () => {
  it('tells islands apart', () => {
    const state = strait();
    const labels = landmasses(state);
    expect(labels[idx(2, 2, state.width)]).toBe(labels[idx(8, 9, state.width)]);
    expect(labels[idx(2, 2, state.width)]).not.toBe(labels[idx(25, 2, state.width)]);
    expect(labels[idx(15, 2, state.width)]).toBe(-1);
  });

  it('ferries an army across to a town it cannot walk to', () => {
    const state = strait();
    foundCity(state, spawnUnit(state, 0, 'peon', 3, 5));
    foundCity(state, spawnUnit(state, 1, 'peasant', 26, 5));
    // A garrison each, so the soldiers below are free to go.
    spawnUnit(state, 0, 'orc', 3, 5);
    spawnUnit(state, 1, 'footman', 26, 5);
    for (const y of [4, 5, 6]) spawnUnit(state, 0, 'orc_x2', 8, y);
    spawnUnit(state, 0, 'raft', 10, 5);
    recomputeAllVisibility(state);

    for (let turn = 0; turn < 40; turn++) {
      state.activePlayer = 0;
      beginPlayerTurn(state, 0);
      runAiTurn(state, 0);
    }
    const landed = state.units.filter((u) => u.owner === 0 && !u.cargo && u.x >= 20);
    expect(state.log.some((l) => l.text.includes('wades ashore')), 'nobody was put ashore').toBe(true);
    expect(landed.length, 'nobody of ours is on the far island').toBeGreaterThan(0);
  });

  it('knows when it is stranded, and asks for a boat', () => {
    const state = strait();
    foundCity(state, spawnUnit(state, 0, 'peon', 3, 5));
    // The enemy is somewhere nobody has looked.
    const theirs = foundCity(state, spawnUnit(state, 1, 'peasant', 26, 5))!;
    state.players[0].explored[idx(theirs.x, theirs.y, state.width)] = 0;
    expect(stranded(state, 0)).toBe(true);
    // Once they are found, it is a war, not a mystery.
    state.players[0].explored[idx(theirs.x, theirs.y, state.width)] = 1;
    expect(stranded(state, 0)).toBe(false);
  });
});
