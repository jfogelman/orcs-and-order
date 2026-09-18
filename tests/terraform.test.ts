import { afterEach, describe, expect, it } from 'vitest';
import { PERSONALITIES, runAiTurn } from '../src/ai/ai';
import { idx } from '../src/engine/grid';
import type { City, GameState, TerrainId } from '../src/model/types';
import { deserialize, serialize } from '../src/persist/save';
import { assignWorkers, tileYield } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { canPillage, pillage } from '../src/sim/roads';
import { TERRAFORM, canImprove, jobName, startImprove } from '../src/sim/terraform';
import { beginPlayerTurn } from '../src/sim/turn';

/**
 * Section 112: workers improving the land.
 *
 * A flat, fully explored grassland with nothing on it, both sides knowing
 * Tree-Hugging, which is what teaches it.
 */
function world(ground: TerrainId = 'grass'): GameState {
  const state = createGame({ seed: 20260918, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill(ground);
  state.specials.fill(0);
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.techs.push('tree-hugging');
  }
  return state;
}

const at = (state: GameState, x: number, y: number) => idx(x, y, state.width);

/** Let the worker's owner take enough turns for the job to finish. */
function work(state: GameState, turns: number): void {
  for (let t = 0; t < turns; t++) beginPlayerTurn(state, 0);
}

afterEach(() => {
  TERRAFORM.enabled = true;
});

describe('irrigation', () => {
  it('needs water beside it, and then adds a food', () => {
    const state = world();
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    expect(canImprove(state, peon, 'irrigate').reason).toMatch(/water/i);

    state.terrain[at(state, 6, 5)] = 'water';
    const before = tileYield(state, at(state, 5, 5), false).food;
    expect(startImprove(state, peon, 'irrigate')).toBe(true);
    work(state, 3);

    expect(state.irrigation?.[at(state, 5, 5)]).toBe(1);
    expect(tileYield(state, at(state, 5, 5), false).food).toBe(before + TERRAFORM.food);
    expect(peon.order).toBe('none');
  });

  it('carries on from a ditch already dug, so a field can spread inland', () => {
    const state = world();
    state.terrain[at(state, 3, 5)] = 'water';
    state.irrigation = new Array(state.width * state.height).fill(0);
    state.irrigation[at(state, 4, 5)] = 1;
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    expect(canImprove(state, peon, 'irrigate').ok).toBe(true);
  });

  it('is not for ground that water would not help', () => {
    const state = world('hills');
    state.terrain[at(state, 6, 5)] = 'water';
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    expect(canImprove(state, peon, 'irrigate').ok).toBe(false);
  });
});

describe('mines', () => {
  it('add a shield on hills and two on mountains', () => {
    for (const [ground, extra] of [['hills', 1], ['mountains', 2]] as const) {
      const state = world(ground);
      const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
      const before = tileYield(state, at(state, 5, 5), false).shields;
      expect(startImprove(state, peon, 'mine')).toBe(true);
      work(state, 8);
      expect(state.mines?.[at(state, 5, 5)], ground).toBe(1);
      expect(tileYield(state, at(state, 5, 5), false).shields, ground).toBe(before + extra);
    }
  });
});

describe('clearing', () => {
  it('turns a swamp into grassland, drops its special, and tells the map', () => {
    const state = world('swamp');
    state.specials[at(state, 5, 5)] = 1;
    const peasant = spawnUnit(state, 1, 'peasant', 5, 5, false);
    expect(startImprove(state, peasant, 'clear')).toBe(true);
    for (let t = 0; t < 6; t++) beginPlayerTurn(state, 1);

    expect(state.terrain[at(state, 5, 5)]).toBe('grass');
    expect(state.specials[at(state, 5, 5)]).toBe(0);
    expect(state.terrainEdits).toBe(1);
  });

  it('has nothing to clear on open grass', () => {
    const state = world();
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    expect(canImprove(state, peon, 'clear').ok).toBe(false);
  });
});

describe('who may', () => {
  it('needs Tree-Hugging, and says so by name', () => {
    const state = world('hills');
    state.players[0].techs = state.players[0].techs.filter((t) => t !== 'tree-hugging');
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    expect(canImprove(state, peon, 'mine').reason).toMatch(/Tree-Hugging/);
  });

  it('is workers only', () => {
    const state = world('hills');
    const goblin = spawnUnit(state, 0, 'goblin', 5, 5, false);
    expect(canImprove(state, goblin, 'mine').ok).toBe(false);
  });

  it('is nobody at all while switched off', () => {
    const state = world('hills');
    TERRAFORM.enabled = false;
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    expect(canImprove(state, peon, 'mine').ok).toBe(false);
  });

  it('calls the same job something different on each side', () => {
    expect(jobName('irrigate', 'orc')).not.toBe(jobName('irrigate', 'human'));
    expect(jobName('clear', 'orc', 'swamp')).not.toBe(jobName('clear', 'orc', 'forest'));
  });
});

describe('what happens to it', () => {
  it('is torn up by a soldier standing on it', () => {
    const state = world('hills');
    state.mines = new Array(state.width * state.height).fill(0);
    state.mines[at(state, 5, 5)] = 1;
    const raider = spawnUnit(state, 1, 'footman', 5, 5, false);
    expect(canPillage(state, raider).ok).toBe(true);
    expect(pillage(state, raider)).toBe(true);
    expect(state.mines[at(state, 5, 5)]).toBe(0);
    expect(state.log.some((e) => /the mine/.test(e.text))).toBe(true);
  });

  it('survives a save', () => {
    const state = world();
    state.irrigation = new Array(state.width * state.height).fill(0);
    state.mines = new Array(state.width * state.height).fill(0);
    state.irrigation[at(state, 2, 2)] = 1;
    state.mines[at(state, 7, 7)] = 1;
    state.terrainEdits = 3;
    const back = deserialize(serialize(state))!;
    expect(back.irrigation?.[at(state, 2, 2)]).toBe(1);
    expect(back.mines?.[at(state, 7, 7)]).toBe(1);
    expect(back.terrainEdits).toBe(3);
  });
});

describe('the AI', () => {
  it('sends an idle worker to improve land a city is working', () => {
    const state = world();
    state.players[0].controller = 'ai';
    state.players[0].techs.push('bridge-building');
    // Beside the coast, so the fields can be watered.
    for (let y = 0; y < state.height; y++) state.terrain[at(state, 0, y)] = 'water';
    const city: City = {
      id: 1, owner: 0, name: 'Muddy Field', x: 3, y: 5, size: 4,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1,
    };
    state.cities.push(city);
    assignWorkers(state, city);
    const peon = spawnUnit(state, 0, 'peon', 3, 5, false);
    const target = PERSONALITIES.orc.targetCities;
    PERSONALITIES.orc.targetCities = 1;
    try {
      runAiTurn(state, 0);
    } finally {
      PERSONALITIES.orc.targetCities = target;
    }
    expect(peon.order === 'improve' || peon.goto !== null || (peon.x !== 3 || peon.y !== 5)).toBe(true);
  });
});
