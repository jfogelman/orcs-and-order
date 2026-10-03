import { describe, expect, it } from 'vitest';
import { abilityNotes } from '../src/ui/pedia';
import { UNIT_TYPES, unitType } from '../src/model/units';

/**
 * Section 125, slice 0: the Orcpedia had never once mentioned ammunition.
 *
 * Reported by Jeremy (2026-10-01). A player reading the Ballista's card learned
 * that it strikes from two tiles and hits cities twice as hard, and nothing
 * else -- not that it holds five missiles, not that it runs dry, and above all
 * not **who is allowed to refill it**. That last part is the one that reads as
 * a bug rather than a rule: a ballista parked behind a line of footmen cannot
 * be reloaded by any of them, and the only thing the game said was "Reload it,
 * or take it back to a city."
 *
 * These tests pin the notes to the data they are read from, so the card cannot
 * drift away from `targetsFor`'s two predicates in `sim/abilities.ts`.
 */

/** Every note the Orcpedia prints for a unit, as one lowercase haystack. */
function card(id: string): string {
  return abilityNotes(unitType(id)).join(' | ').toLowerCase();
}

describe('a piece of artillery', () => {
  it('says how many missiles it holds', () => {
    for (const id of ['ballista', 'goblincatapult']) {
      const def = unitType(id);
      expect(def.ammo, `${id} is the sort of unit this is about`).toBeGreaterThan(0);
      expect(card(id)).toContain(`carries ${def.ammo} missiles`);
    }
  });

  it('says that an empty one cannot shoot, which is the part that reads as broken', () => {
    expect(card('ballista')).toContain('cannot strike at range');
  });

  it('says a city fills the whole magazine', () => {
    for (const id of ['ballista', 'goblincatapult']) {
      expect(card(id)).toContain('resupply');
      expect(card(id)).toContain('whole magazine');
    }
  });
});

describe('who is allowed to reload it', () => {
  it('names the archery line for a piece reloaded by labour, and nobody else', () => {
    const def = unitType('ballista');
    expect(def.reloadsBy).toBe('labour');
    const note = card('ballista');

    // The Kingdom's only unit with `firstStrikes` is the Archer.
    expect(note).toContain('an archer');
    expect(note).toContain('nobody else can do it');
    // And the thing a player would wrongly assume: a line soldier cannot.
    expect(note).not.toContain('footman');
  });

  it('says a catapult eats whoever loads it, and that a group loads more', () => {
    const def = unitType('goblincatapult');
    expect(def.reloadsBy).toBe('sacrifice');
    const note = card('goblincatapult');

    // The Horde's two `expendable` creatures, and no others.
    expect(note).toContain('a goblin');
    expect(note).toContain('an orc');
    expect(note).toContain('eaten');
    expect(note).toContain('one missile for each of them');
    expect(note).not.toContain('troll');
  });

  it('costs the helper its whole turn when nothing is eaten', () => {
    expect(card('ballista')).toContain('whole turn');
  });
});

describe('everything that is not artillery', () => {
  it('never claims to carry a magazine', () => {
    // Note what this does *not* say. A Goblin and an Orc both mention missiles,
    // because they are one -- what none of these may claim is a magazine of
    // their own.
    for (const id of ['footman', 'knight', 'orc', 'peasant', 'dragon', 'goblin']) {
      expect(unitType(id).ammo, `${id} has no magazine in the table`).toBe(0);
      // Matched as a phrase, not a word: the dragon's breath "carries" into
      // the tile behind it, which is a different sentence entirely.
      expect(card(id), `${id} does not claim one on its card`).not.toMatch(/carries \d+ missiles/);
      expect(card(id)).not.toContain('magazine');
      expect(card(id)).not.toContain('resupply');
    }
  });

  it('includes the axethrower, whose one axe is a different rule entirely', () => {
    const def = unitType('axethrower');
    expect(def.ammo).toBe(0);
    expect(def.throwsWeapon).toBe(true);
    const note = card('axethrower');
    expect(note).not.toContain('missile');
    // The rule it does have, unchanged.
    expect(note).toContain('only the one axe');
  });
});

describe('the other half of the rule, on the card of whoever does the loading', () => {
  it('tells an archer it is the only thing that can reload a ballista', () => {
    // Before this, the Archer's card was completely empty -- which is the worst
    // place for the information to be missing, because the player choosing what
    // to escort a ballista with is reading the escort.
    const note = card('archer');
    expect(note).toContain('hand a missile to a ballista');
    expect(note).toContain('its own whole turn');
  });

  it('tells a goblin, and an orc, that they are ammunition', () => {
    for (const id of ['goblin', 'orc']) {
      const note = card(id);
      expect(note, `${id} is told where it ends up`).toContain('loaded into a goblin catapult');
      expect(note).toContain('the end of it');
      expect(note).toContain('one missile each');
    }
  });

  it('keeps it within a faction: the axethrower feeds nothing, having no ballista', () => {
    // The Axethrower has firstStrikes, so it *could* feed a labour loader -- but
    // the Horde has none, and the Kingdom's ballista is not theirs to load.
    expect(unitType('axethrower').firstStrikes).toBeGreaterThan(0);
    expect(card('axethrower')).not.toContain('missile to');
  });

  it('says nothing to anybody who cannot load anything', () => {
    for (const id of ['footman', 'knight', 'peasant', 'troll']) {
      expect(card(id), `${id} loads nothing`).not.toContain('hand a missile');
      expect(card(id)).not.toContain('loaded into');
    }
  });

  it('never tells a piece of artillery it can load itself', () => {
    for (const id of ['ballista', 'goblincatapult']) {
      expect(card(id)).not.toContain('hand a missile');
      expect(card(id)).not.toContain('can be loaded into');
    }
  });
});

describe('the notes are read off the data, not written out by hand', () => {
  it('covers every unit in the game that carries a magazine', () => {
    const withAmmo = Object.values(UNIT_TYPES).filter((u) => u.ammo > 0);
    expect(withAmmo.length, 'there is at least one').toBeGreaterThan(0);
    for (const def of withAmmo) {
      const note = abilityNotes(def).join(' | ').toLowerCase();
      expect(note, `${def.id} says how many it carries`).toContain('missiles');
      expect(note, `${def.id} says how it is reloaded`).toContain('reloaded in the field');
      expect(note, `${def.id} says a city refills it`).toContain('resupply');
      // The number is whatever the table says, not a literal five, so a
      // retune or a group variant carries its own figure onto the card.
      expect(abilityNotes(def).join(' | ')).toContain(`carries ${def.ammo} missiles`);
    }
  });

  it('names feeders from the same two predicates the rules use', () => {
    // sim/abilities.ts gates a sacrifice loader on `expendable` and a labour
    // loader on `firstStrikes`. If either moves, these cards must move with it.
    for (const def of Object.values(UNIT_TYPES)) {
      const feeds = card(def.id).includes('hand a missile') || card(def.id).includes('loaded into a');
      if (!feeds) continue;
      expect(
        def.expendable || def.firstStrikes > 0,
        `${def.id} is offered as a loader, so it must satisfy one of the two predicates`,
      ).toBe(true);
    }
  });
});
