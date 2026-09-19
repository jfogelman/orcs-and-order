import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { TERRAIN } from '../src/model/terrain';
import { createGame } from '../src/sim/gamestate';
import type { GameState } from '../src/model/types';

/** Every land tile reachable on foot from here. */
function landmass(state: GameState, x: number, y: number): Set<number> {
  const seen = new Set<number>([idx(x, y, state.width)]);
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        const i = idx(nx, ny, state.width);
        if (seen.has(i) || TERRAIN[state.terrain[i]].water) continue;
        seen.add(i);
        stack.push([nx, ny]);
      }
    }
  }
  return seen;
}

function settlerOf(state: GameState, owner: number) {
  return state.units.find((u) => u.owner === owner)!;
}

describe('the archipelago', () => {
  it('starts the two sides on islands of their own', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const state = createGame({ seed, world: 'archipelago' });
      const a = settlerOf(state, 0);
      const b = settlerOf(state, 1);
      const home = landmass(state, a.x, a.y);
      expect(home.has(idx(b.x, b.y, state.width)), `seed ${seed}: same island`).toBe(false);
      // Room to found an empire on, not a sandbar.
      expect(home.size, `seed ${seed}`).toBeGreaterThan(40);
      expect(landmass(state, b.x, b.y).size, `seed ${seed}`).toBeGreaterThan(40);
    }
  });

  it('is saved as what it is', () => {
    expect(createGame({ seed: 3, world: 'archipelago' }).settings.world).toBe('archipelago');
  });

  it('leaves the ordinary world exactly as it was', () => {
    const plain = createGame({ seed: 3 });
    const named = createGame({ seed: 3, world: 'continent' });
    expect(plain.settings.world).toBeUndefined();
    expect(named.terrain).toEqual(plain.terrain);
    // Everybody can still walk to everybody.
    const a = settlerOf(plain, 0);
    const b = settlerOf(plain, 1);
    expect(landmass(plain, a.x, a.y).has(idx(b.x, b.y, plain.width))).toBe(true);
  });
});
