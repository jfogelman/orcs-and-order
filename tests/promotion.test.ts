import { describe, expect, it } from 'vitest';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import {
  attackStrength,
  awardXp,
  defenseStrength,
  MAX_RANK,
  PERK_BONUS,
  rankBonus,
  RANK_BONUS,
  stormEmptyCity,
  VETERAN_BONUS,
  XP,
} from '../src/sim/combat';
import { owedPerks, perkChoices, perkName, PERKS } from '../src/model/perks';
import { sackSeverity } from '../src/sim/movement';
import { supplyQuality, SUPPLY } from '../src/sim/city';
import { beginPlayerTurn } from '../src/sim/turn';
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

describe('what a promotion buys', () => {
  it('owes exactly one choice per rank, and forgets nothing', () => {
    const state = board();
    const orc = spawnUnit(state, 0, 'orc', 5, 5);
    expect(owedPerks(orc)).toBe(0);
    orc.rank = 2;
    expect(owedPerks(orc)).toBe(2);
    orc.perks = ['bloodied'];
    expect(owedPerks(orc)).toBe(1);
    orc.perks = ['bloodied', 'dug-in'];
    expect(owedPerks(orc)).toBe(0);
  });

  it('never offers the same thing twice', () => {
    const state = board();
    const orc = spawnUnit(state, 0, 'orc', 5, 5);
    orc.perks = ['bloodied'];
    expect(perkChoices(orc).map((p) => p.id)).not.toContain('bloodied');
  });

  it('names the same perk differently for each side', () => {
    // Same numbers, different story: the Horde's are things that happened to
    // it, the Kingdom's are things somebody arranged.
    for (const perk of PERKS) {
      // Skipping the ones only one side can ever hold. An ogre's club has no
      // Kingdom name to differ from, because the Kingdom has no ogres -- the
      // rule is about the *shared* perks reading differently, and inventing a
      // second name nobody will see would be worse than having one.
      if (perk.only) continue;
      expect(perkName(perk, 'orc')).not.toBe(perkName(perk, 'human'));
    }
  });

  it('makes a bloodied unit hit harder and a dug-in one harder to shift', () => {
    const state = board();
    const plain = spawnUnit(state, 0, 'orc', 5, 5);
    const keen = spawnUnit(state, 0, 'orc', 6, 5);
    const target = spawnUnit(state, 1, 'footman', 9, 9);
    keen.perks = ['bloodied'];
    expect(attackStrength(state, keen, target).total).toBeCloseTo(
      attackStrength(state, plain, target).total * PERK_BONUS,
    );

    const soft = spawnUnit(state, 1, 'footman', 12, 12);
    const stubborn = spawnUnit(state, 1, 'footman', 13, 12);
    stubborn.perks = ['dug-in'];
    expect(defenseStrength(state, stubborn).total).toBeCloseTo(
      defenseStrength(state, soft).total * PERK_BONUS,
    );
  });

  it('lets a butcher take more of a city', () => {
    const state = board();
    const plain = spawnUnit(state, 0, 'orc', 5, 5);
    const thorough = spawnUnit(state, 0, 'orc', 6, 5);
    thorough.perks = ['butcher'];
    expect(sackSeverity(thorough, 6)).toBeGreaterThan(sackSeverity(plain, 6));
  });

  it('lets a reputation walk past the townsfolk', () => {
    const state = board();
    const city = {
      id: 1, owner: 1, name: 'Nervous', x: 10, y: 10, size: 10, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' as const }, workedTiles: [],
      disorder: false, foundedTurn: 1,
    };
    state.cities.push(city);
    const feared = spawnUnit(state, 0, 'goblin', 11, 10);
    feared.perks = ['reputation'];
    feared.hp = 1;
    for (let i = 0; i < 20; i++) {
      const stand = stormEmptyCity(state, feared, city);
      expect(stand.damage, 'somebody threw something at a legend').toBe(0);
      expect(stand.taken).toBe(true);
    }
  });

  it('keeps a field surgeon healing beyond the supply line', () => {
    const state = board();
    state.cities.push({
      id: 2, owner: 0, name: 'Home', x: 2, y: 2, size: 3, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' as const }, workedTiles: [],
      disorder: false, foundedTurn: 1,
    });
    const stranded = spawnUnit(state, 0, 'orc', 25, 15);
    const patched = spawnUnit(state, 0, 'orc', 26, 15);
    patched.perks = ['field-repairs'];
    stranded.hp = 3;
    patched.hp = 3;
    beginPlayerTurn(state, 0);
    expect(stranded.hp, 'an ordinary stranded unit healed').toBe(3);
    expect(patched.hp, 'a field surgeon did not').toBeGreaterThan(3);
  });

  it('extends supply for a quartermaster', () => {
    const state = board();
    state.cities.push({
      id: 3, owner: 0, name: 'Depot', x: 10, y: 10, size: 3, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' as const }, workedTiles: [],
      disorder: false, foundedTurn: 1,
    });
    const ordinary = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range + 1, 10);
    const resourceful = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range + 2, 10);
    resourceful.perks = ['quartermaster'];
    expect(supplyQuality(state, ordinary)).toBeLessThan(1);
    expect(supplyQuality(state, resourceful), 'the quartermaster went short').toBe(1);
  });
});
