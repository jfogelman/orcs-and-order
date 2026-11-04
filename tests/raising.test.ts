import { describe, expect, it } from 'vitest';
import { CREATURES, unitType } from '../src/model/units';
import { LIVING_ENGINES, canBeRaised, cannotBeRaised, raisableCreatures } from '../src/model/raising';

/**
 * Section 155: what the Grave Knight can raise.
 *
 * Jeremy settled this on 2026-10-29, before the rule exists, because it is
 * the question that decides which art is worth drawing. Written as rules
 * rather than a list of ids: the roster is eighty creatures and growing, and
 * a hand-maintained copy of it is the failure this project keeps finding.
 */
describe('what a Grave Knight can raise', () => {
  it('raises the ordinary fighting creatures of a side', () => {
    for (const id of ['orc', 'footman', 'troll', 'ogre', 'knight', 'archer', 'dragon', 'peon']) {
      expect(canBeRaised(id), id).toBe(true);
    }
  });

  it('banishes the Unbound instead, every one of them', () => {
    const unbound = CREATURES.filter((c) => c.faction === 'unbound');
    expect(unbound.length).toBeGreaterThan(0);
    for (const c of unbound) {
      expect(cannotBeRaised(unitType(c.id)), c.id).toMatch(/banished/);
    }
  });

  it('leaves boats, spies, sappers and machinery alone', () => {
    expect(cannotBeRaised(unitType('warboat'))).toMatch(/boat/);
    expect(cannotBeRaised(unitType('skulker'))).toMatch(/spy/);
    expect(cannotBeRaised(unitType('sapper'))).toMatch(/nothing left/);
    expect(cannotBeRaised(unitType('goblincatapult'))).toMatch(/machinery/);
    expect(cannotBeRaised(unitType('ballista'))).toMatch(/machinery/);
    expect(cannotBeRaised(unitType('collector'))).toMatch(/machinery/);
  });

  it('makes an exception of the Bloat-caste, which is alive', () => {
    // Every siege creature in the game shares `silhouette: 'engine'`, which is
    // a drawing hint. This one is a bloated insect that walks up and bursts.
    expect(unitType('bloatcaste').role).toBe('siege');
    expect(canBeRaised('bloatcaste')).toBe(true);
  });

  it('spares the Hive its Grub, its Princess and its Queen', () => {
    expect(cannotBeRaised(unitType('grub'))).toMatch(/grub/i);
    expect(cannotBeRaised(unitType('princess'))).toMatch(/Princess/);
    expect(cannotBeRaised(unitType('queen'))).toMatch(/Queen/);
    // And not the castes that do fight, which is most of them.
    for (const id of ['fodder', 'soldier', 'elite', 'burrower', 'broodlord', 'warden']) {
      expect(canBeRaised(id), id).toBe(true);
    }
  });

  /**
   * The exception list is the one hand-maintained thing here, so it gets the
   * same treatment `NOT_DRAWN_YET` gets: an entry for a creature that does not
   * exist is a rule about nothing, and somebody adding a seventh siege unit
   * should have to decide which kind it is rather than inherit an answer.
   */
  it('keeps the living-engine list honest', () => {
    const bases = new Set(CREATURES.map((c) => c.id));
    expect([...LIVING_ENGINES].filter((id) => !bases.has(id))).toEqual([]);
    for (const id of LIVING_ENGINES) expect(unitType(id).role, id).toBe('siege');
  });

  it('says how many sheets the rule will want, out loud', () => {
    // Not a bar. A number somebody has to come and change when the roster
    // grows, which is the point of writing it down.
    const raisable = raisableCreatures();
    expect(raisable.length).toBe(45);
    expect(raisable.some((c) => c.faction === 'unbound')).toBe(false);
  });
});
