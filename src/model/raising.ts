import { CREATURES, unitType } from './units';
import type { CreatureDef, UnitTypeDef } from './units';
import type { UnitTypeId } from './types';

/**
 * What the Grave Knight can raise, and what it cannot. Section 155.
 *
 * `deathknight-grave` is *"killing a unit has a chance to raise a weak
 * skeletal copy for a few turns"*, and the obvious reading -- anything it
 * kills -- is wrong in six separate ways. Jeremy settled all of them on
 * 2026-10-29, and they are here as **rules rather than a list of ids**,
 * because the roster is eighty creatures and will grow.
 *
 * The rule itself is not built yet; this is the half that decides which art
 * is worth drawing, which is the question that came first.
 */

/**
 * Why a creature cannot be raised, or null if it can.
 *
 * Returns the reason rather than a boolean so a test can print it, and so the
 * sentence a player eventually reads in the Orcpedia is written once.
 */
export function cannotBeRaised(def: UnitTypeDef): string | null {
  // **The Unbound are banished instead**, which is the one of these that is a
  // different rule rather than an exclusion: a Grave Knight that kills one
  // ends it for good -- no dispersal, no reform -- and digs up something that
  // was already in the ground. See `ancient skeleton.jpg` in ART_PROMPTS.md.
  // It cannot make a skeleton out of a ghost, so it does not try.
  if (def.faction === 'unbound') return 'banished outright, and something older comes up instead';

  if (def.sails) return 'a boat, and a skeleton of a boat is a boat';
  if (def.spy) return 'a spy; there is nothing to raise that anybody would recognise';
  // Named before the siege rule below, which would also catch the sapper.
  // Both reasons are true and this is the one Jeremy gave: there is no body.
  if (def.explodes > 0) return 'it went off when it died, and there is nothing left';

  if (def.role === 'siege' && !LIVING_ENGINES.has(def.base)) {
    return 'machinery, which was never alive to begin with';
  }

  const hive = HIVE_EXEMPT[def.base];
  if (hive) return hive;

  return null;
}

/** The same question, asked of a unit type id. */
export function canBeRaised(typeId: UnitTypeId): boolean {
  return cannotBeRaised(unitType(typeId)) === null;
}

/**
 * Siege-role creatures that are nevertheless alive.
 *
 * All six of the game's siege units share `silhouette: 'engine'`, which is a
 * drawing hint and not a statement about biology -- the Bloat-caste is a
 * bloated insect that walks up and bursts, and it is as raisable as any other
 * caste. There is no flag that separates it, so it is named, and the test
 * beside this file makes anybody adding a seventh siege creature decide which
 * kind it is rather than inherit an answer.
 */
export const LIVING_ENGINES = new Set<string>(['bloatcaste']);

/** The three castes the Hive does not leave a usable body of, with Jeremy's reasons. */
const HIVE_EXEMPT: Record<string, string> = {
  grub: 'a grub has no skeleton worth the name yet',
  princess: 'a Princess-caste is not something the Hive leaves lying about',
  queen: 'the Queen does not die in a field, and never leaves her Hive',
};

/**
 * Every *creature* a Grave Knight could raise, for the art list and the tests.
 *
 * Creatures, not unit types: the counting ladder means one orc sprite serves
 * Two Orcs and Ten Orcs, and a raised skeleton wants one sheet per kind of
 * thing rather than one per size of group.
 */
export function raisableCreatures(): CreatureDef[] {
  return CREATURES.filter((c) => cannotBeRaised(unitType(c.id)) === null);
}
