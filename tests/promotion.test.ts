import { describe, expect, it } from 'vitest';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import { awardXp, MAX_RANK, rankBonus, RANK_BONUS, VETERAN_BONUS, XP } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';

/**
 * Experience and rank.
 *
 * Replaces a single veteran flag earned on a coin toss. The rules that matter
 * are where experience comes from and how a group shares it.
 */

function board(): GameState {
  const state = createGame({ seed: 4141, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  state.players[0].visible.fill(1);
  state.players[1].visible.fill(1);
  return state;
}

describe('rank', () => {
  it('starts at nothing and is worth nothing', () => {
    const state = board();
    const orc = spawnUnit(state, 0, 'orc', 5, 5);
    expect(orc.rank).toBe(0);
    expect(orc.xp).toBe(0);
    expect(rankBonus(orc)).toBe(1);
  });

  it('is worth exactly the old veteran bonus at the first rank', () => {
    // So everything measured against the previous rule still holds.
    expect(RANK_BONUS[1]).toBe(VETERAN_BONUS);
  });

  it('climbs but stops at the top', () => {
    const state = board();
    const orc = spawnUnit(state, 0, 'orc', 5, 5);
    for (let i = 0; i < 200; i++) awardXp(state, orc, XP.kill);
    expect(orc.rank).toBe(MAX_RANK);
    expect(rankBonus(orc)).toBe(RANK_BONUS[MAX_RANK]);
  });

  it('a barracks unit starts already promoted once', () => {
    const state = board();
    const drilled = spawnUnit(state, 0, 'orc', 5, 5, true);
    expect(drilled.rank).toBe(1);
  });
});

describe('where experience comes from', () => {
  it('pays more for a kill than for merely surviving', () => {
    expect(XP.kill).toBeGreaterThan(XP.survive);
  });

  it('divides among a group, so ten orcs each learn a tenth', () => {
    const state = board();
    const single = spawnUnit(state, 0, 'orc', 5, 5);
    const many = spawnUnit(state, 0, 'orc_x10', 7, 5);
    awardXp(state, single, XP.kill);
    awardXp(state, many, XP.kill);
    expect(many.xp).toBeCloseTo(single.xp / unitType('orc_x10').count);
  });

  it('takes far longer for a group to reach a rank than a single', () => {
    // The point of dividing: the counting ladder must not double as an
    // experience ladder, with the biggest unit improving fastest too.
    const climb = (type: string): number => {
      const state = board();
      const u = spawnUnit(state, 0, type, 5, 5);
      let fights = 0;
      while (u.rank < 1 && fights < 500) {
        awardXp(state, u, XP.kill);
        fights++;
      }
      return fights;
    };
    expect(climb('orc_x10')).toBeGreaterThan(climb('orc') * 5);
  });

  it('gives nothing for damage the unit did not choose', () => {
    // A sapper going up hits both sides. Counting it would have the sapper
    // promoting the very survivors it was aimed at.
    const state = board();
    const sapper = spawnUnit(state, 0, 'sapper', 5, 5);
    const bystander = spawnUnit(state, 0, 'orc', 6, 5);
    const attacker = spawnUnit(state, 1, 'footman', 5, 4);
    attacker.moves = 2;
    const before = bystander.xp;
    tryStep(state, attacker, 5, 5);
    expect(bystander.xp, 'a bystander learned something from an explosion').toBe(before);
    void sapper;
  });

  it('pays the winner of a real fight', () => {
    const state = board();
    const orc = spawnUnit(state, 0, 'orc', 5, 5);
    const victim = spawnUnit(state, 1, 'peasant', 6, 5);
    victim.hp = 1;
    orc.moves = 2;
    tryStep(state, orc, 6, 5);
    if (!state.units.includes(victim)) {
      expect(orc.xp, 'the winner learned nothing').toBeGreaterThan(0);
    }
  });
});
