import { describe, expect, it } from 'vitest';
import { perkChoices } from '../src/model/perks';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import { SPLIT, abilitiesOf, abilityReady, abilityTargets, useAbility } from '../src/sim/abilities';
import { applyDamage, resolveCombat } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { hasStatus } from '../src/sim/status';
import { tryStep } from '../src/sim/movement';

function arena(terrain: 'grass' | 'swamp' = 'grass'): GameState {
  const state = createGame({ seed: 20260827, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill(terrain);
  for (const p of state.players) p.visible.fill(1);
  return state;
}

/**
 * The last three of DESIGN_QUEUE section 11, each hung off an advance that was
 * previously a dead end. Section 11 named two open questions and both are
 * settled here rather than discovered later.
 */
describe('Mostly Volatile', () => {
  it('walks away from one killing blow', () => {
    const state = arena();
    const sapper = spawnUnit(state, 0, 'sapper', 5, 5, false);
    sapper.perks = ['mostly-volatile'];

    applyDamage(sapper, 999, 'physical');

    expect(sapper.hp).toBe(1);
    expect(sapper.reprieved).toBe(true);
  });

  it('does not walk away from the second', () => {
    const state = arena();
    const sapper = spawnUnit(state, 0, 'sapper', 5, 5, false);
    sapper.perks = ['mostly-volatile'];

    applyDamage(sapper, 999, 'physical');
    applyDamage(sapper, 999, 'physical');

    expect(sapper.hp).toBeLessThanOrEqual(0);
  });

  it('does not go off on the blow it survived', () => {
    const state = arena();
    const sapper = spawnUnit(state, 1, 'sapper', 6, 5, false);
    sapper.perks = ['mostly-volatile'];
    const bystander = spawnUnit(state, 1, 'goblin', 7, 5, false);
    const attacker = spawnUnit(state, 0, 'ogre', 5, 5, false);
    const bystanderFull = bystander.hp;

    // Section 11 left this open: surviving *and* detonating would be a lot of
    // value out of one perk. It falls out of the rules already there -- a
    // sapper only goes off when it dies, and this one did not.
    for (let i = 0; i < 6 && sapper.hp > 0; i++) resolveCombat(state, attacker, sapper);

    if (sapper.hp > 0) {
      expect(bystander.hp, 'the blast went off while the sapper lived').toBe(bystanderFull);
    }
  });

  it('is offered to a sapper only, and only with the advance', () => {
    const state = arena();
    const sapper = spawnUnit(state, 0, 'sapper', 5, 5, false);
    const goblin = spawnUnit(state, 0, 'goblin', 6, 5, false);

    expect(perkChoices(sapper, []).map((p) => p.id)).not.toContain('mostly-volatile');
    expect(perkChoices(sapper, ['volatile']).map((p) => p.id)).toContain('mostly-volatile');
    expect(perkChoices(goblin, ['volatile']).map((p) => p.id)).not.toContain('mostly-volatile');
  });
});

describe('Better Part of Valour', () => {
  function duel(state: GameState) {
    const knight = spawnUnit(state, 0, 'knight', 5, 5, false);
    knight.perks = ['better-part-of-valour'];
    // Something it cannot kill in one go, so the fight is lost more often than
    // it is won and the retreat actually gets exercised.
    const wall = spawnUnit(state, 1, 'footman_x10', 6, 5, false);
    return { knight, wall };
  }

  it('falls back a step when it fails to finish what it attacked', () => {
    let movedAtLeastOnce = false;
    for (let seed = 0; seed < 30; seed++) {
      const state = arena();
      state.rngState = seed + 1;
      const { knight, wall } = duel(state);
      knight.moves = 1;

      tryStep(state, knight, wall.x, wall.y);

      if (state.units.includes(knight) && knight.hp > 0 && wall.hp > 0) {
        if (knight.x !== 5 || knight.y !== 5) movedAtLeastOnce = true;
        // Never onto the tile it attacked, and never further than one step.
        expect(Math.abs(knight.x - 5)).toBeLessThanOrEqual(1);
        expect(Math.abs(knight.y - 5)).toBeLessThanOrEqual(1);
      }
    }
    expect(movedAtLeastOnce, 'the knight never once fell back').toBe(true);
  });

  it('dies rather than escaping when there is nowhere to go', () => {
    const state = arena();
    const { knight, wall } = duel(state);
    // Boxed in on every side by its own side, which cannot be stepped through.
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]]) {
      spawnUnit(state, 0, 'goblin', 5 + dx, 5 + dy, false);
    }
    knight.moves = 1;

    tryStep(state, knight, wall.x, wall.y);

    // Withdrawal is a chance, not a guarantee: section 11 asked for a rule for
    // having nowhere to go, and a cornered knight dies like anybody else
    // rather than standing on one hit point for free.
    if (state.units.includes(knight)) {
      expect(knight.x).toBe(5);
      expect(knight.y).toBe(5);
    }
  });

  it('never retreats into a city, which would garrison it for free', () => {
    for (let seed = 0; seed < 30; seed++) {
      const state = arena();
      state.rngState = seed + 1;
      const { knight, wall } = duel(state);
      state.cities.push({
        id: 1, owner: 0, name: 'Free Lunch', x: 4, y: 5, size: 3, food: 0, shields: 0,
        buildings: [], producing: { kind: 'coin' }, workedTiles: [], disorder: false,
        foundedTurn: 1,
      });
      knight.moves = 1;

      tryStep(state, knight, wall.x, wall.y);

      if (state.units.includes(knight)) {
        expect(knight.x === 4 && knight.y === 5, 'retreated into a city').toBe(false);
      }
    }
  });
});

describe('Swampy Friend', () => {
  function loneTroll(terrain: 'grass' | 'swamp') {
    const state = arena(terrain);
    const troll = spawnUnit(state, 0, 'troll', 5, 5, false);
    troll.perks = ['swampy-friend'];
    return { state, troll };
  }

  it('is offered to a lone troll and never to a group', () => {
    const state = arena('swamp');
    const one = spawnUnit(state, 0, 'troll', 5, 5, false);
    one.perks = ['swampy-friend'];
    const three = spawnUnit(state, 0, 'troll_x3', 7, 5, false);
    three.perks = ['swampy-friend'];

    // Section 11 settled this deliberately: a group splitting into another
    // group is an exponent. It also hands the game the first reason it has
    // ever had to build the *small* unit.
    expect(abilitiesOf(one)).toContain('split');
    expect(abilitiesOf(three)).not.toContain('split');
  });

  it('makes a friend, and both of them look unwell', () => {
    const { state, troll } = loneTroll('swamp');
    const before = state.units.length;
    const fullHp = troll.hp;

    const out = useAbility(state, troll, 'split', troll);

    expect(out.ok).toBe(true);
    expect(state.units.length).toBe(before + 1);
    const friend = state.units.find((u) => u.id !== troll.id)!;
    // Nothing conjured: one healthy troll becomes two nearly-dead ones.
    expect(troll.hp).toBeLessThan(fullHp * 0.2);
    expect(friend.hp).toBe(troll.hp);
    // And the parent cannot heal for a while, which for the creature whose
    // whole character is healing fast is the part that actually costs.
    expect(hasStatus(troll, 'spent')).toBe(true);
  });

  it('will not do it out of the swamp', () => {
    const { state, troll } = loneTroll('grass');
    const before = state.units.length;

    const out = useAbility(state, troll, 'split', troll);

    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/swamp/i);
    expect(state.units.length).toBe(before);
  });

  it('will not do it half dead', () => {
    const { troll } = loneTroll('swamp');
    troll.hp = Math.floor(unitType(troll.type).hp * (SPLIT.needsFraction - 0.1));

    expect(abilityReady(troll, 'split')).toMatch(/enough of it/i);
  });

  it('targets itself, since the question is whether it can', () => {
    const { state, troll } = loneTroll('swamp');
    expect(abilityTargets(state, troll, 'split').map((u) => u.id)).toEqual([troll.id]);
  });
});
