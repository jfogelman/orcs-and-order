import { describe, expect, it } from 'vitest';
import { PERKS, perkChoices } from '../src/model/perks';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import { DRAIN, abilitiesOf, abilityReady, abilityTargets, useAbility } from '../src/sim/abilities';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function arena(): GameState {
  const state = createGame({ seed: 20260827, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(1);
  return state;
}

function knight(state: GameState, hp?: number) {
  const dk = spawnUnit(state, 0, 'deathknight', 5, 5, false);
  dk.perks = ['dark-bargain'];
  dk.hp = hp ?? Math.floor(unitType('deathknight').hp / 2);
  return dk;
}

/**
 * Section 13's death knight, built to the design in section 39: it takes half
 * of what somebody has left and gains twice that, and a donor already at or
 * below half does not survive the transaction.
 */
describe('the Dark Bargain', () => {
  it('is offered to a death knight, and only with the advance', () => {
    const state = arena();
    const dk = spawnUnit(state, 0, 'deathknight', 5, 5, false);
    const orc = spawnUnit(state, 0, 'orc', 6, 5, false);

    expect(perkChoices(dk, []).map((p) => p.id)).not.toContain('dark-bargain');
    expect(perkChoices(dk, ['bargain']).map((p) => p.id)).toContain('dark-bargain');
    expect(perkChoices(orc, ['bargain']).map((p) => p.id)).not.toContain('dark-bargain');
  });

  it('takes half of a healthy donor and gives back twice that', () => {
    const state = arena();
    const dk = knight(state);
    const donor = spawnUnit(state, 0, 'orc', 6, 5, false);
    const donorFull = donor.hp;
    const before = dk.hp;
    const taken = Math.round(donorFull * DRAIN.takesFraction);

    const out = useAbility(state, dk, 'drain', donor);

    expect(out.ok).toBe(true);
    // Healthy, so it lives -- lighter, and rather less pleased.
    expect(state.units).toContain(donor);
    expect(donor.hp).toBe(donorFull - taken);
    expect(dk.hp - before).toBe(Math.min(unitType(dk.type).hp - before, taken * DRAIN.returnsMultiple));
  });

  it('kills a donor that was already at or below half', () => {
    const state = arena();
    const dk = knight(state);
    const donor = spawnUnit(state, 0, 'orc', 6, 5, false);
    donor.hp = Math.floor(unitType(donor.type).hp * DRAIN.survivesAbove);

    useAbility(state, dk, 'drain', donor);

    // Buyer beware: the wounded are worth less and do not come back.
    expect(state.units).not.toContain(donor);
    expect(dk.hp).toBeGreaterThan(0);
  });

  it('is worth more from somebody healthy than somebody nearly dead', () => {
    const healthy = (() => {
      const state = arena();
      const dk = knight(state, 1);
      const donor = spawnUnit(state, 0, 'ogre', 6, 5, false);
      return useAbility(state, dk, 'drain', donor).amount ?? 0;
    })();
    const wounded = (() => {
      const state = arena();
      const dk = knight(state, 1);
      const donor = spawnUnit(state, 0, 'ogre', 6, 5, false);
      donor.hp = 2;
      return useAbility(state, dk, 'drain', donor).amount ?? 0;
    })();

    // Which is what stops anybody breeding cheap units as batteries.
    expect(healthy).toBeGreaterThan(wounded);
  });

  it('never heals past full, and refuses when there is nothing to mend', () => {
    const state = arena();
    const dk = knight(state, unitType('deathknight').hp);
    spawnUnit(state, 0, 'ogre', 6, 5, false);

    expect(abilityReady(dk, 'drain')).toMatch(/wants for nothing/i);

    dk.hp -= 1;
    const donor = state.units.find((u) => u.id !== dk.id)!;
    useAbility(state, dk, 'drain', donor);
    expect(dk.hp).toBe(unitType('deathknight').hp);
  });

  it('will not bargain with the enemy, or with itself', () => {
    const state = arena();
    const dk = knight(state);
    const theirs = spawnUnit(state, 1, 'footman', 6, 5, false);

    expect(abilityTargets(state, dk, 'drain').map((u) => u.id)).not.toContain(theirs.id);
    expect(abilityTargets(state, dk, 'drain').map((u) => u.id)).not.toContain(dk.id);

    const ours = spawnUnit(state, 0, 'orc', 4, 5, false);
    expect(abilityTargets(state, dk, 'drain').map((u) => u.id)).toContain(ours.id);
  });

  it('reaches only as far as it can touch', () => {
    const state = arena();
    const dk = knight(state);
    const near = spawnUnit(state, 0, 'orc', 6, 5, false);
    const far = spawnUnit(state, 0, 'orc', 9, 5, false);

    const ids = abilityTargets(state, dk, 'drain').map((u) => u.id);
    expect(ids).toContain(near.id);
    expect(ids).not.toContain(far.id);
  });

  it('is marked as needing a person, so the AI does not take it', () => {
    // Not because the AI could not be taught the ability, but because the
    // judgement is the whole mechanic. An AI that took it and never used it
    // would spend a promotion on nothing. See DESIGN_QUEUE section 13.
    const bargain = PERKS.find((p) => p.id === 'dark-bargain')!;
    expect(bargain.manual).toBe(true);
    expect(PERKS.filter((p) => p.manual)).toHaveLength(1);
  });

  it('gives the death knight something to swing at', () => {
    const state = arena();
    const dk = knight(state);
    expect(abilitiesOf(dk)).toContain('drain');

    const plain = spawnUnit(state, 0, 'deathknight', 8, 8, false);
    expect(abilitiesOf(plain)).not.toContain('drain');
  });
});
