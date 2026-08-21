import { describe, expect, it } from 'vitest';
import { UNIT_TYPES } from '../src/model/units';
import {
  attackStrength,
  damagePerRound,
  defenseStrength,
  resolveCombat,
  VETERAN_BONUS,
  FORTIFY_BONUS,
} from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import type { GameState, TerrainId, Unit } from '../src/model/types';
import { idx } from '../src/engine/grid';

/** A tiny fixed world so combat tests do not depend on what worldgen produced. */
function arena(terrain: TerrainId = 'grass'): GameState {
  const state = createGame({ seed: 4242, width: 20, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill(terrain);
  return state;
}

function place(state: GameState, owner: number, type: string, x: number, y: number): Unit {
  return spawnUnit(state, owner, type, x, y);
}

describe('strength modifiers', () => {
  it('scales attack with the size of the group', () => {
    const state = arena();
    const one = place(state, 0, 'orc', 1, 1);
    const ten = place(state, 0, 'orc_x10', 3, 3);
    const target = place(state, 1, 'footman', 5, 5);
    expect(attackStrength(state, ten, target).total).toBe(
      attackStrength(state, one, target).total * 10,
    );
  });

  it('applies the veteran bonus to both attack and defence', () => {
    const state = arena();
    const plain = place(state, 0, 'orc', 1, 1);
    const vet = place(state, 0, 'orc', 3, 3);
    vet.rank = 1;
    const target = place(state, 1, 'footman', 5, 5);
    expect(attackStrength(state, vet, target).total).toBeCloseTo(
      attackStrength(state, plain, target).total * VETERAN_BONUS,
    );
    expect(defenseStrength(state, vet).total).toBeCloseTo(
      defenseStrength(state, plain).total * VETERAN_BONUS,
    );
  });

  it('multiplies defence by the terrain', () => {
    const flat = arena('grass');
    const rough = arena('mountains');
    const onGrass = place(flat, 0, 'footman', 5, 5);
    const onPeak = place(rough, 0, 'footman', 5, 5);
    // Mountains are a x3 defensive multiplier.
    expect(defenseStrength(rough, onPeak).total).toBeCloseTo(
      defenseStrength(flat, onGrass).total * 3,
    );
  });

  it('rewards fortifying', () => {
    const state = arena();
    const loose = place(state, 0, 'footman', 1, 1);
    const dug = place(state, 0, 'footman', 3, 3);
    dug.order = 'fortified';
    expect(defenseStrength(state, dug).total).toBeCloseTo(
      defenseStrength(state, loose).total * FORTIFY_BONUS,
    );
  });

  it('gives siege units their bonus only against cities', () => {
    const state = arena();
    const ram = place(state, 0, 'ballista', 1, 1);
    const openField = place(state, 1, 'orc', 3, 3);
    expect(attackStrength(state, ram, openField).siegeMult).toBe(1);

    state.cities.push({
      id: 99,
      owner: 1,
      name: 'Target',
      x: 3,
      y: 3,
      size: 1,
      food: 0,
      shields: 0,
      buildings: [],
      producing: { kind: 'coin' },
      workedTiles: [],
      disorder: false,
      foundedTurn: 1,
    });
    expect(attackStrength(state, ram, openField).siegeMult).toBe(UNIT_TYPES.ballista.siegeBonus);
  });
});

describe('damage pacing', () => {
  it('keeps fights bounded regardless of how large the units are', () => {
    // A ten-orc brawl should not take ten times as many rounds as a one-orc one.
    const small = damagePerRound(UNIT_TYPES.orc.hp, UNIT_TYPES.orc.hp);
    const large = damagePerRound(UNIT_TYPES.orc_x10.hp, UNIT_TYPES.orc_x10.hp);
    expect(UNIT_TYPES.orc.hp / small).toBeLessThan(20);
    expect(UNIT_TYPES.orc_x10.hp / large).toBeLessThan(20);
  });

  it('preserves the health advantage as a ratio of hits survived', () => {
    const dmg = damagePerRound(UNIT_TYPES.orc_x10.hp, UNIT_TYPES.orc.hp);
    const bigHits = Math.ceil(UNIT_TYPES.orc_x10.hp / dmg);
    const smallHits = Math.ceil(UNIT_TYPES.orc.hp / dmg);
    expect(bigHits).toBeGreaterThan(smallHits * 4);
  });

  it('never deals zero damage', () => {
    expect(damagePerRound(1, 1)).toBeGreaterThanOrEqual(1);
  });
});

describe('resolveCombat', () => {
  it('always leaves exactly one side standing', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = arena();
      state.rngState = seed + 1;
      const a = place(state, 0, 'orc_x3', 1, 1);
      const d = place(state, 1, 'footman_x2', 2, 1);
      const result = resolveCombat(state, a, d);
      expect(result.attackerWon ? d.hp : a.hp).toBe(0);
      expect(result.attackerWon ? a.hp : d.hp).toBeGreaterThan(0);
      expect(result.rounds).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a given random state', () => {
    const run = () => {
      const state = arena();
      state.rngState = 987654;
      const a = place(state, 0, 'orc_x2', 1, 1);
      const d = place(state, 1, 'footman', 2, 1);
      const r = resolveCombat(state, a, d);
      return `${r.attackerWon}:${r.rounds}:${r.attackerHp}:${r.defenderHp}`;
    };
    expect(run()).toBe(run());
  });

  it('lets ten orcs beat one orc essentially every time', () => {
    let wins = 0;
    const trials = 60;
    for (let seed = 0; seed < trials; seed++) {
      const state = arena();
      state.rngState = seed * 7919 + 13;
      const a = place(state, 0, 'orc_x10', 1, 1);
      const d = place(state, 1, 'orc', 2, 1);
      if (resolveCombat(state, a, d).attackerWon) wins++;
    }
    expect(wins).toBeGreaterThan(trials * 0.9);
  });

  it('lets one orc essentially never beat ten fortified orcs', () => {
    let wins = 0;
    const trials = 60;
    for (let seed = 0; seed < trials; seed++) {
      const state = arena();
      state.rngState = seed * 104729 + 5;
      const a = place(state, 0, 'orc', 1, 1);
      const d = place(state, 1, 'orc_x10', 2, 1);
      d.order = 'fortified';
      if (resolveCombat(state, a, d).attackerWon) wins++;
    }
    expect(wins).toBeLessThan(trials * 0.1);
  });

  it('advances the shared random stream so repeated fights differ', () => {
    const state = arena();
    state.rngState = 555;
    const before = state.rngState;
    const a = place(state, 0, 'orc_x3', 1, 1);
    const d = place(state, 1, 'orc_x3', 2, 1);
    resolveCombat(state, a, d);
    expect(state.rngState).not.toBe(before);
  });
});

describe('terrain lookup sanity', () => {
  it('indexes tiles the same way the renderer does', () => {
    const state = arena();
    expect(idx(3, 2, state.width)).toBe(2 * state.width + 3);
  });
});
