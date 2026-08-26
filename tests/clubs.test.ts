import { describe, expect, it } from 'vitest';
import { PERKS, perkChoices } from '../src/model/perks';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import { CLUB_BLAST, CLUB_QUAKE, resolveCombat } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { hasStatus } from '../src/sim/status';

function arena(): GameState {
  const state = createGame({ seed: 20260825, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

/**
 * DESIGN_QUEUE section 11's three clubs. They differ in *who* they catch rather
 * than in how hard they hit, which is what makes choosing between them a
 * decision rather than a ranking.
 */
describe('the three clubs', () => {
  it('is offered to an ogre, and only once the advance is in', () => {
    const state = arena();
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);
    ogre.rank = 1;

    const withoutAdvance = perkChoices(ogre, []).map((p) => p.id);
    expect(withoutAdvance).not.toContain('fiery-club');

    const withAdvance = perkChoices(ogre, ['clubs']).map((p) => p.id);
    expect(withAdvance).toEqual(expect.arrayContaining(['fiery-club', 'exploding-club', 'quake-club']));
  });

  it('is never offered to anything that is not an ogre', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 5, 5, false);
    orc.rank = 1;
    const ids = perkChoices(orc, ['clubs']).map((p) => p.id);
    for (const club of ['fiery-club', 'exploding-club', 'quake-club']) {
      expect(ids, `${club} went to an orc`).not.toContain(club);
    }
  });

  it('is offered to a group of ogres too, not only a single one', () => {
    const state = arena();
    const two = spawnUnit(state, 0, 'ogre_x2', 5, 5, false);
    two.rank = 1;
    // Keyed on the base creature, so the counting ladder does not lose the club.
    expect(perkChoices(two, ['clubs']).map((p) => p.id)).toContain('fiery-club');
  });

  it('sets the target alight, with the fiery one', () => {
    const state = arena();
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);
    ogre.perks = ['fiery-club'];
    const foe = spawnUnit(state, 1, 'footman_x5', 6, 5, false);

    resolveCombat(state, ogre, foe);

    if (foe.hp > 0) expect(hasStatus(foe, 'burning')).toBe(true);
  });

  it('catches bystanders with the exploding one, its own side included', () => {
    const state = arena();
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);
    ogre.perks = ['exploding-club'];
    const foe = spawnUnit(state, 1, 'footman_x5', 6, 5, false);
    // Standing next to the target, on the ogre's own side.
    const friend = spawnUnit(state, 0, 'orc', 7, 5, false);
    const bystander = spawnUnit(state, 1, 'footman', 6, 6, false);
    const friendFull = friend.hp;
    const ogreFull = ogre.hp;

    resolveCombat(state, ogre, foe);

    expect(friend.hp, 'a blast does not check whose side you are on').toBeLessThan(friendFull);
    expect(bystander.hp).toBeLessThan(unitType(bystander.type).hp);
    // And it takes a share of its own, at a discount, but never enough to
    // kill it -- a perk that can kill its owner on a win is a perk nobody takes.
    expect(ogre.hp).toBeLessThan(ogreFull);
    expect(ogre.hp).toBeGreaterThan(0);
  });

  it('shakes the ground around itself with the quake one, sparing its own', () => {
    const state = arena();
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);
    ogre.perks = ['quake-club'];
    const foe = spawnUnit(state, 1, 'footman_x5', 6, 5, false);
    const friend = spawnUnit(state, 0, 'orc', 4, 5, false);
    const enemyNearby = spawnUnit(state, 1, 'footman', 5, 6, false);
    const friendFull = friend.hp;

    resolveCombat(state, ogre, foe);

    // A different shape from the exploding club: it is a way out of being
    // surrounded, so it must not hurt the line it is standing in.
    expect(friend.hp, 'the quake club hit its own side').toBe(friendFull);
    expect(enemyNearby.hp).toBeLessThan(unitType(enemyNearby.type).hp);
  });

  it('does nothing at all for an ogre that lost', () => {
    const state = arena();
    const ogre = spawnUnit(state, 0, 'ogre', 5, 5, false);
    ogre.perks = ['quake-club'];
    ogre.hp = 0;
    const bystander = spawnUnit(state, 1, 'footman', 5, 6, false);
    const foe = spawnUnit(state, 1, 'footman', 6, 5, false);

    // A dead ogre swings no club.
    resolveCombat(state, ogre, foe);
    expect(bystander.hp).toBe(unitType(bystander.type).hp);
  });

  it('keeps the blast smaller than a fight', () => {
    // Both are shares of maximum health rather than flat numbers, so a club is
    // frightening to a goblin and survivable to a dragon, like burning.
    expect(CLUB_BLAST).toBeLessThan(0.5);
    expect(CLUB_QUAKE).toBeLessThan(CLUB_BLAST);
    expect(PERKS.filter((p) => p.only?.includes('ogre'))).toHaveLength(3);
  });
});
