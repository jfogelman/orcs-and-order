import { describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { idx } from '../src/engine/grid';
import { TERRAIN } from '../src/model/terrain';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';
import { deserialize, packBits, serialize, unpackBits } from '../src/persist/save';
import { generateWorld } from '../src/sim/worldgen';
import type { GameState } from '../src/model/types';

/** Play a whole game out with both sides on autopilot. */
function playOut(seed: number, halfTurns: number): GameState {
  const state = createGame({ seed });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);
  for (let i = 0; i < halfTurns && state.winner === null; i++) {
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
  }
  return state;
}

describe('worldgen', () => {
  const settings = {
    width: 64,
    height: 48,
    landRatio: 0.34,
    difficulty: 'normal' as const,
    maxTurns: 300,
  };

  it('hits the requested land ratio', () => {
    for (const seed of [1, 2, 3, 999]) {
      const world = generateWorld(seed, settings, 2);
      const land = world.terrain.filter((t) => !TERRAIN[t].water).length;
      const ratio = land / world.terrain.length;
      expect(ratio).toBeGreaterThan(0.28);
      expect(ratio).toBeLessThan(0.4);
    }
  });

  it('produces every terrain type on a typical map', () => {
    const world = generateWorld(20250813, settings, 2);
    const present = new Set(world.terrain);
    for (const t of ['grass', 'forest', 'hills', 'mountains', 'water', 'deep'] as const) {
      expect(present.has(t), `missing ${t}`).toBe(true);
    }
  });

  it('places both civilisations on the same landmass', () => {
    // Land units cannot cross water, so separate islands would mean the two
    // sides could never meet and the game could never end.
    for (const seed of [1, 7, 42, 12345, 999999]) {
      const world = generateWorld(seed, settings, 2);
      expect(world.starts.length).toBe(2);

      const [a, b] = world.starts;
      const seen = new Set<number>();
      const stack = [idx(a.x, a.y, settings.width)];
      seen.add(stack[0]);
      while (stack.length > 0) {
        const i = stack.pop()!;
        const x = i % settings.width;
        const y = Math.floor(i / settings.width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= settings.width || ny >= settings.height) continue;
            const ni = idx(nx, ny, settings.width);
            if (seen.has(ni) || TERRAIN[world.terrain[ni]].water) continue;
            seen.add(ni);
            stack.push(ni);
          }
        }
      }
      expect(seen.has(idx(b.x, b.y, settings.width)), `seed ${seed} split the players`).toBe(true);
    }
  });

  it('keeps the two starts well apart', () => {
    for (const seed of [1, 7, 42]) {
      const world = generateWorld(seed, settings, 2);
      const [a, b] = world.starts;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(12);
    }
  });

  it('is reproducible from its seed', () => {
    const a = generateWorld(31337, settings, 2);
    const b = generateWorld(31337, settings, 2);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.starts).toEqual(b.starts);
  });
});

describe('a full game', () => {
  it('runs 200 half-turns without throwing', () => {
    expect(() => playOut(12345, 200)).not.toThrow();
  });

  it('is deterministic for a given seed', () => {
    const fingerprint = (s: GameState) =>
      [
        s.turn,
        s.winner,
        s.units.map((u) => `${u.owner}:${u.type}:${u.x},${u.y}:${u.hp}`).join('|'),
        s.cities.map((c) => `${c.owner}:${c.name}:${c.size}`).join('|'),
        s.players.map((p) => p.techs.join(',')).join('||'),
      ].join('#');
    expect(fingerprint(playOut(777, 120))).toBe(fingerprint(playOut(777, 120)));
  });

  it('grows both empires past their starting position', () => {
    const state = playOut(20250813, 200);
    for (const p of state.players) {
      if (!p.alive) continue;
      expect(playerCities(state, p.id).length).toBeGreaterThan(0);
      expect(p.techs.length).toBeGreaterThan(1);
    }
  });

  it('gets somebody up the counting ladder', () => {
    // If nobody ever fields a group unit, the entire premise has failed.
    const state = playOut(20250813, 300);
    const groupUnitsSeen = state.units.some((u) => u.type.includes('_x'));
    const groupTechsSeen = state.players.some((p) =>
      p.techs.some((t) =>
        ['orc-together', 'brotherhood', 'goblin-smarts', 'idiots-stick-together'].includes(t),
      ),
    );
    expect(groupUnitsSeen || groupTechsSeen).toBe(true);
  });

  it('brings the two sides into contact', () => {
    const state = playOut(12345, 300);
    expect(state.log.some((e) => e.kind === 'combat')).toBe(true);
  });

  it('never puts two units on one tile', () => {
    const state = playOut(4242, 200);
    const seen = new Set<number>();
    for (const u of state.units) {
      const i = idx(u.x, u.y, state.width);
      expect(seen.has(i), `two units stacked at ${u.x},${u.y}`).toBe(false);
      seen.add(i);
    }
  });

  it('never leaves a land unit standing in the sea', () => {
    const state = playOut(999, 200);
    for (const u of state.units) {
      expect(TERRAIN[state.terrain[idx(u.x, u.y, state.width)]].water).toBe(false);
    }
  });

  it('keeps unit counts in check through upkeep', () => {
    const state = playOut(12345, 300);
    for (const p of state.players) {
      const cities = playerCities(state, p.id).length;
      const units = playerUnits(state, p.id).length;
      if (cities === 0) continue;
      // Roughly bounded by what the cities can feed, with room to spare.
      expect(units).toBeLessThan(cities * 14 + 10);
    }
  });
});

describe('saves', () => {
  it('round-trips a run-length encoded bitmap', () => {
    const bits = [0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0];
    expect(unpackBits(packBits(bits), bits.length)).toEqual(bits);
  });

  it('round-trips an empty bitmap', () => {
    expect(unpackBits(packBits([]), 0)).toEqual([]);
  });

  it('pads a short payload rather than corrupting the map', () => {
    expect(unpackBits('1,3', 6)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it('round-trips a played game exactly', () => {
    const original = playOut(31337, 80);
    const restored = deserialize(serialize(original));
    expect(restored.turn).toBe(original.turn);
    expect(restored.seed).toBe(original.seed);
    expect(restored.rngState).toBe(original.rngState);
    expect(restored.terrain).toEqual(original.terrain);
    expect(restored.units).toEqual(original.units);
    expect(restored.cities).toEqual(original.cities);
    for (let i = 0; i < original.players.length; i++) {
      expect(restored.players[i].explored).toEqual(original.players[i].explored);
      expect(restored.players[i].visible).toEqual(original.players[i].visible);
      expect(restored.players[i].techs).toEqual(original.players[i].techs);
    }
  });

  it('resumes identically after a save and load', () => {
    const a = playOut(2024, 60);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 40; i++) {
      runAiTurn(a, a.activePlayer);
      endPlayerTurn(a);
      runAiTurn(b, b.activePlayer);
      endPlayerTurn(b);
    }
    expect(b.units.map((u) => `${u.type}${u.x},${u.y}`)).toEqual(
      a.units.map((u) => `${u.type}${u.x},${u.y}`),
    );
  });

  it('rejects nonsense', () => {
    expect(() => deserialize('not json at all')).toThrow();
    expect(() => deserialize('{"version":999,"players":[]}')).toThrow();
  });
});
