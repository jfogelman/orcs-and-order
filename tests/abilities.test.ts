import { describe, expect, it } from 'vitest';
import { UNIT_TYPES } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';
import { canExecute, detonate, resolveCombat } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';
import { beginPlayerTurn, REGEN } from '../src/sim/turn';

function arena(): GameState {
  const state = createGame({ seed: 31337, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

/**
 * An arena with a capital in the middle of it.
 *
 * Regeneration is now gated on supply, and a bare arena has no cities at all,
 * so every unit in it is stranded and heals nothing. Without this the healing
 * tests below are really testing the supply rule -- and the troll test passed
 * *vacuously* for a while, comparing a gain of zero against a gain of zero.
 */
function suppliedArena(): GameState {
  const state = arena();
  state.cities.push({
    id: 1, owner: 0, name: 'Base', x: 6, y: 5, size: 3,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  });
  return state;
}

describe('regeneration', () => {
  const hurt = (u: Unit) => {
    u.hp = 1;
    return u;
  };

  it('heals a unit standing in the open', () => {
    const state = suppliedArena();
    const u = hurt(spawnUnit(state, 0, 'orc', 5, 5));
    beginPlayerTurn(state, 0);
    expect(u.hp).toBeGreaterThan(1);
  });

  it('rewards digging in over standing about', () => {
    const open = suppliedArena();
    const a = hurt(spawnUnit(open, 0, 'orc', 5, 5));
    const dug = suppliedArena();
    const b = hurt(spawnUnit(dug, 0, 'orc', 5, 5));
    b.order = 'fortified';
    beginPlayerTurn(open, 0);
    beginPlayerTurn(dug, 0);
    expect(b.hp).toBeGreaterThan(a.hp);
  });

  it('never exceeds maximum health', () => {
    const state = suppliedArena();
    const u = spawnUnit(state, 0, 'orc', 5, 5);
    u.hp = UNIT_TYPES.orc.hp - 1;
    for (let i = 0; i < 10; i++) beginPlayerTurn(state, 0);
    expect(u.hp).toBe(UNIT_TYPES.orc.hp);
  });

  it('puts trolls back together twice as fast', () => {
    const state = suppliedArena();
    const troll = hurt(spawnUnit(state, 0, 'troll', 5, 5));
    const orc = hurt(spawnUnit(state, 0, 'orc', 7, 5));
    beginPlayerTurn(state, 0);
    const trollGain = troll.hp - 1;
    const orcGain = orc.hp - 1;
    // Guard against the comparison below passing on nothing at all: when both
    // units were out of supply this read 0 against 0 and was perfectly happy.
    expect(trollGain, 'the troll healed nothing').toBeGreaterThan(0);
    expect(orcGain, 'the orc healed nothing').toBeGreaterThan(0);
    // Compare as a fraction of maximum, since the two have different pools.
    expect(trollGain / UNIT_TYPES.troll.hp).toBeCloseTo(
      (orcGain / UNIT_TYPES.orc.hp) * UNIT_TYPES.troll.regenMultiplier,
      1,
    );
  });

  it('does not heal a unit that is out of supply at all', () => {
    // The rule that broke the three tests above, stated on purpose so the
    // interaction is documented rather than merely survived.
    const state = arena();
    const stranded = hurt(spawnUnit(state, 0, 'orc', 5, 5));
    beginPlayerTurn(state, 0);
    expect(stranded.hp).toBe(1);
  });

  it('agrees with its own rate table', () => {
    expect(REGEN.barracks).toBeGreaterThan(REGEN.inCity);
    expect(REGEN.inCity).toBeGreaterThan(REGEN.fortified);
    expect(REGEN.fortified).toBeGreaterThan(REGEN.sentry);
    expect(REGEN.sentry).toBeGreaterThan(REGEN.afield);
  });
});

describe('the sapper', () => {
  it('is cheap, mobile and dangerous rather than merely weak', () => {
    // An earlier pass cut its attack to 1 on the grounds that it is not a
    // fighter. Measured, that changed nothing about faction balance and left
    // the Horde with no way through a wall, so the attack stayed and the
    // danger went into what happens around it instead.
    expect(UNIT_TYPES.sapper.explodes).toBeGreaterThan(0);
    expect(UNIT_TYPES.sapper.demolishes).toBe(true);
    expect(UNIT_TYPES.sapper.cost).toBeLessThan(UNIT_TYPES.troll.cost);
    expect(UNIT_TYPES.sapper.move).toBe(UNIT_TYPES.orc.move);
  });

  it('damages everything around it, friend and enemy alike', () => {
    const state = arena();
    const sapper = spawnUnit(state, 1, 'sapper', 5, 5);
    const enemy = spawnUnit(state, 0, 'orc', 6, 5);
    const friend = spawnUnit(state, 1, 'footman', 4, 5);
    const bystander = spawnUnit(state, 0, 'orc', 9, 9);

    detonate(state, sapper);
    expect(enemy.hp).toBeLessThan(UNIT_TYPES.orc.hp);
    expect(friend.hp).toBeLessThan(UNIT_TYPES.footman.hp);
    expect(bystander.hp, 'two tiles away is out of range').toBe(UNIT_TYPES.orc.hp);
  });

  it('does not chain', () => {
    const state = arena();
    const first = spawnUnit(state, 1, 'sapper', 5, 5);
    const second = spawnUnit(state, 1, 'sapper', 6, 5);
    second.hp = 1; // certain to die in the blast
    const killed = detonate(state, first);
    expect(killed.some((u) => u.id === second.id)).toBe(true);
    // The second sapper died, but a chain would have removed the bystander too.
    const survivor = spawnUnit(state, 0, 'orc', 7, 5);
    expect(survivor.hp).toBe(UNIT_TYPES.orc.hp);
  });

  it('goes up when killed defending, and can take its killer with it', () => {
    const state = arena();
    const sapper = spawnUnit(state, 1, 'sapper', 5, 5);
    sapper.hp = 1;
    const attacker = spawnUnit(state, 0, 'goblin', 4, 5);
    attacker.hp = 2; // fragile enough that 40% of a goblin finishes it

    const outcome = tryStep(state, attacker, 5, 5);
    expect(outcome.kind).toBe('combat');
    if (outcome.kind === 'combat') {
      expect(outcome.defenderDied).toBe(true);
      expect(outcome.attackerDied, 'the blast should have caught the attacker').toBe(true);
    }
    expect(state.units.some((u) => u.id === attacker.id)).toBe(false);
  });
});

describe('the Death Knight', () => {
  it('will only finish off something wounded and no larger than itself', () => {
    const state = arena();
    const dk = spawnUnit(state, 0, 'deathknight', 5, 5);
    const healthy = spawnUnit(state, 1, 'footman', 6, 5);
    expect(canExecute(dk, healthy)).toBe(false);

    healthy.hp = 1;
    expect(canExecute(dk, healthy)).toBe(true);

    // Ten Orcs are wounded but far too big to simply delete.
    const huge = spawnUnit(state, 1, 'orc_x10', 7, 5);
    huge.hp = 1;
    expect(canExecute(dk, huge)).toBe(false);
  });

  it('is a chance, not a certainty', () => {
    let executions = 0;
    const trials = 60;
    for (let seed = 0; seed < trials; seed++) {
      const state = arena();
      state.rngState = seed * 7919 + 3;
      const dk = spawnUnit(state, 0, 'deathknight', 5, 5);
      const prey = spawnUnit(state, 1, 'footman', 6, 5);
      prey.hp = 1;
      if (resolveCombat(state, dk, prey).executed) executions++;
    }
    expect(executions).toBeGreaterThan(0);
    expect(executions).toBeLessThan(trials);
  });

  it('nobody else can do it', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 5, 5);
    const prey = spawnUnit(state, 1, 'footman', 6, 5);
    prey.hp = 1;
    expect(canExecute(orc, prey)).toBe(false);
  });
});

describe('sappers against walls', () => {
  it('brings the walls down and is spent doing it', () => {
    const state = arena();
    state.cities.push({
      id: 1, owner: 1, name: 'Highmarch', x: 10, y: 10, size: 5,
      food: 0, shields: 0, buildings: ['walls', 'granary'],
      producing: { kind: 'coin' }, workedTiles: [], disorder: false, foundedTurn: 1,
    });
    const holder = spawnUnit(state, 1, 'footman', 10, 10);
    const sapper = spawnUnit(state, 0, 'sapper', 9, 10);

    tryStep(state, sapper, 10, 10);

    const city = state.cities[0];
    expect(city.buildings, 'walls should be gone').not.toContain('walls');
    expect(city.buildings, 'the rest of the city survives').toContain('granary');
    expect(city.owner, 'demolition is not capture').toBe(1);
    expect(state.units.some((u) => u.id === sapper.id), 'sapper is spent').toBe(false);
    expect(holder.hp, 'the garrison is caught in it').toBeLessThan(UNIT_TYPES.footman.hp);
  });

  it('leaves an unwalled city alone and attacks normally', () => {
    const state = arena();
    state.cities.push({
      id: 1, owner: 1, name: 'Open Town', x: 10, y: 10, size: 5,
      food: 0, shields: 0, buildings: ['granary'],
      producing: { kind: 'coin' }, workedTiles: [], disorder: false, foundedTurn: 1,
    });
    spawnUnit(state, 1, 'footman', 10, 10);
    const sapper = spawnUnit(state, 0, 'sapper', 9, 10);
    const outcome = tryStep(state, sapper, 10, 10);
    // Nothing to demolish, so this is an ordinary attack.
    expect(outcome.kind).toBe('combat');
  });
});
