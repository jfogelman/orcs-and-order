import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/model/buildings';
import {
  PALACE_MODULES,
  isPalace,
  palaceArt,
  palaceId,
  palacePart,
} from '../src/model/palace';
import type { City, GameState } from '../src/model/types';
import { runAiTurn } from '../src/ai/ai';
import {
  CIVIC_PRIDE,
  assignWorkers,
  buildOptions,
  civicPride,
  contentLimit,
} from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { defenseStrength } from '../src/sim/combat';

/**
 * Section 67: Civic Pride. The capital is a chassis with five modules hung on
 * it, three tiers each, and every one of them does absolutely nothing -- which
 * is the design and not an omission.
 */

/** An empire doing well enough to be pleased with itself. */
function proud(cities = 3): { state: GameState; capital: City } {
  const state = createGame({ seed: 20260919, width: 40, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.gold = 200;
  }
  for (let n = 0; n < cities; n++) {
    state.cities.push({
      id: n + 1,
      owner: 0,
      name: `Town ${n + 1}`,
      x: 4 + n * 6,
      y: 6,
      size: 4,
      food: 0,
      shields: 0,
      buildings: [],
      producing: { kind: 'coin' },
      workedTiles: [],
      disorder: false,
      foundedTurn: 1 + n,
      foundedBy: 0,
    });
  }
  // Worked tiles assigned, or every city is starving and nobody is proud of
  // anything.
  for (const c of state.cities) assignWorkers(state, c);
  spawnUnit(state, 1, 'footman', 38, 18, false);
  return { state, capital: state.cities[0] };
}

const idsIn = (state: GameState, city: City) =>
  buildOptions(state, city).buildings.map((b) => b.id);

describe('the capital in pieces', () => {
  it('has five modules of three tiers for both sides, and art for each', () => {
    expect(PALACE_MODULES).toHaveLength(5);
    for (const module of PALACE_MODULES) {
      for (const faction of ['orc', 'human'] as const) {
        for (let tier = 1; tier <= 3; tier++) {
          const id = palaceId(faction, module.id, tier);
          const def = BUILDINGS[id];
          expect(def, `${id} is not a building`).toBeDefined();
          expect(def.name).toBe(module.tiers[faction][tier - 1]);
          expect(def.faction).toBe(faction);
          expect(def.civic).toBe(true);
          expect(def.upkeep).toBe(0);
          // The art file is the id with the prefix taken off, which is the one
          // thing keeping thirty ids and thirty pictures in step.
          expect(palaceArt(id)).toBe(`${faction}-${module.id}-${tier}`);
        }
      }
    }
  });

  it('makes each tier need the one under it', () => {
    for (const module of PALACE_MODULES) {
      expect(BUILDINGS[palaceId('orc', module.id, 1)].needs).toBeUndefined();
      expect(BUILDINGS[palaceId('orc', module.id, 2)].needs).toBe(palaceId('orc', module.id, 1));
      expect(BUILDINGS[palaceId('orc', module.id, 3)].needs).toBe(palaceId('orc', module.id, 2));
    }
  });

  it('knows a palace id from a building id, and back', () => {
    const id = palaceId('human', 'gate', 2);
    expect(isPalace(id)).toBe(true);
    expect(isPalace('barracks')).toBe(false);
    expect(palacePart(id)).toMatchObject({ faction: 'human', tier: 2 });
    expect(palacePart(id)?.module.id).toBe('gate');
    expect(palacePart('barracks')).toBeNull();
  });
});

describe('who may build one', () => {
  it('offers them in the capital of an empire that is doing well', () => {
    const { state, capital } = proud();
    expect(civicPride(state, 0)).toBe(true);
    expect(idsIn(state, capital)).toContain(palaceId('orc', 'wing', 1));
    // The second tier only once the first stands, like every other tier.
    expect(idsIn(state, capital)).not.toContain(palaceId('orc', 'wing', 2));
    capital.buildings.push(palaceId('orc', 'wing', 1));
    expect(idsIn(state, capital)).toContain(palaceId('orc', 'wing', 2));
  });

  it('offers them nowhere else, however well it is going', () => {
    const { state } = proud();
    const other = state.cities[1];
    expect(idsIn(state, other).some(isPalace)).toBe(false);
  });

  it('stops offering them the moment anything is wrong', () => {
    const { state, capital } = proud();

    capital.disorder = true;
    expect(civicPride(state, 0)).toBe(false);
    expect(idsIn(state, capital).some(isPalace)).toBe(false);
    capital.disorder = false;

    state.players[0].gold = CIVIC_PRIDE.gold - 1;
    expect(civicPride(state, 0)).toBe(false);
    state.players[0].gold = 200;

    // A town short of the count, and it is not an empire yet.
    state.cities.pop();
    expect(civicPride(state, 0)).toBe(false);
  });

  it('is not offered to an empire with a city going hungry', () => {
    const { state, capital } = proud();
    // Working nothing but the city tile, with more mouths than it feeds.
    const hungry = state.cities[1];
    hungry.size = 12;
    hungry.chosenTiles = [];
    hungry.workedTiles = [];
    hungry.food = 0;
    expect(civicPride(state, 0)).toBe(false);
    expect(idsIn(state, capital).some(isPalace)).toBe(false);
  });
});

describe('what a piece of it is worth', () => {
  it('is nothing, which is the point of it', () => {
    const { state, capital } = proud();
    const orc = spawnUnit(state, 0, 'orc', capital.x, capital.y, false);
    const limit = contentLimit(state, capital);
    const defence = defenseStrength(state, orc).total;

    for (const module of PALACE_MODULES) {
      capital.buildings.push(palaceId('orc', module.id, 1));
    }

    expect(contentLimit(state, capital)).toBe(limit);
    expect(defenseStrength(state, orc).total).toBe(defence);
  });

  it('is never built by the AI, which would be shields spent on a view', () => {
    const { state } = proud(5);
    for (const p of state.players) p.controller = 'ai';
    for (const city of state.cities) {
      city.size = 6;
      city.producing = { kind: 'coin' };
    }

    for (let turn = 0; turn < 3; turn++) runAiTurn(state, 0);

    const queued = state.cities.filter(
      (c) => c.producing.kind === 'building' && isPalace(c.producing.id),
    );
    expect(queued).toHaveLength(0);
  });
});
