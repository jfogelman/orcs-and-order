import type { GameState, Player, Unit, UnitTypeId } from '../model/types';
import { CREATURES_BY_ID, unitType } from '../model/units';
import { TECHS } from '../model/techs';
import { hasFlag } from './rules';

/**
 * Exorcism: the one answer to a thing that does not stay dead. Section 150.
 *
 * `UNBOUND_PLAN.md` builds a faction whose units **disperse** rather than die,
 * and come back where the infrastructure exists to bring them back. That rule
 * is only playable because there is a way to stop it: *"a defeated Unbound
 * unit (defeated by anything **other** than an exorcism-capable attacker)
 * disperses rather than dying outright."*
 *
 * **So this ships before the faction it is for.** Every side needs its answer
 * standing before the question is asked, and the bible says so in as many
 * words: *"every faction gets exactly one exorcism-capable unit against the
 * Unbound."* Building the Unbound first would mean a stretch of sections in
 * which one side cannot be permanently beaten by anybody.
 *
 * **Nothing disperses yet**, so nothing is exorcised yet either. What exists
 * now is the capability and the seam `sim/combat.ts` will ask. That is
 * deliberate rather than premature: the alternative is writing dispersal and
 * its counter in one go, and the counter is the half that touches every other
 * faction's tree.
 */

/**
 * Who can do it, and what each of them needs first.
 *
 * Keyed on the creature's **base**, so a group of two Paladins exorcises as
 * readily as one. `null` means the unit can do it by existing at all -- the
 * advance that unlocks the unit is already the gate -- and a flag means the
 * unit is ordinary until its side learns the trick.
 *
 * Four sides, four answers, and each is the one the bible names:
 *
 * - the **Paladin** was already the Kingdom's, *"needing no new unit"*;
 * - the **Warden-caste** was already the Hive's, grown for standing still in
 *   front of things;
 * - the **Bone-Speaker** is new, and is the Horde's whole reason for this
 *   section -- deliberately the Death Knight's opposite number, living rather
 *   than armoured-undead, and doing the unpopular job of sending them back
 *   rather than the popular one of commanding them;
 * - the **Mystic** is the Wandering Folk's, and the only one that has to be
 *   taught: self-taught, so it learns this the way it learned everything
 *   else, by watching and then trying it.
 *
 * The **Archon** is the Unbound's own, added in section 152 when the faction
 * arrived. A side that cannot exorcise cannot permanently beat them, and that
 * includes them: without this entry an Unbound civil war would be unwinnable
 * by either side, which is the one shape this whole section exists to prevent.
 * It needs no advance because the advance that unlocks it is already the
 * gate, and it is the only unit in the table that is also a thing the table
 * is written against.
 */
export const EXORCISTS: Record<string, string | null> = {
  paladin: null,
  warden: null,
  'orc-shaman': null,
  mystic: 'exorcism',
  archon: null,
};

export const EXORCISM = {
  /**
   * Armed exorcists a side keeps standing once there is an Unbound on the
   * map. Section 164, and the fifth instance of `src/ai/wants.ts`'s pattern.
   *
   * `chooseProduction` ranks a Paladin on attack, health and price and cannot
   * see the one property it is bought for, so by every number that function
   * reads it is an expensive soldier -- forever, in every city. Measured over
   * twelve games before this existed: the advance learned in 7 of 12 and a
   * Paladin standing in **3**, first on turn 231 of about 248.
   *
   * **One**, and small on purpose. The promise the bible makes is that the
   * answer *exists*, not that it is an army: *"there is always a hard
   * counter, so 'hard to kill' never quietly becomes 'impossible to kill.'"*
   * One is also what a side can afford while the Unbound are somebody else's
   * problem. **Unmeasured** against two.
   */
  aiWants: 1,
  /** The switch, for sweeps. Off is the game with no answer to the Unbound. */
  enabled: true,
};

/** Whether this creature could ever exorcise, for anybody. */
export function couldExorcise(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXORCISTS, unitType(type).base);
}

/**
 * Whether this unit, as it stands, sends them back rather than scattering them.
 *
 * Asked of the **attacker** at the moment a fight is resolved. A unit that
 * cannot is not doing anything wrong -- it is winning the fight in the
 * ordinary way, and the thing it beat is getting up again somewhere else.
 */
export function exorcises(state: GameState, unit: Unit): boolean {
  if (!EXORCISM.enabled) return false;
  const needs = EXORCISTS[unitType(unit.type).base];
  if (needs === undefined) return false;
  if (needs === null) return true;
  const owner = state.players[unit.owner];
  return !!owner && hasFlag(owner, needs as Parameters<typeof hasFlag>[1]);
}

/** Every exorcist this side could field right now, for the advisors and the AI. */
export function exorcistsOf(state: GameState, playerId: number): Unit[] {
  return state.units.filter((u) => u.owner === playerId && exorcises(state, u));
}

/**
 * The creature this side sends them back with, if it has one. Section 164.
 *
 * Derived from `EXORCISTS` and the creature table rather than tabulated
 * again. The bible's rule is *"every faction gets exactly one
 * exorcism-capable unit"*, so the first match is the only match, and a sixth
 * faction gets this for nothing the day it is given an exorcist.
 */
export function exorcistOf(faction: string): string | undefined {
  return Object.keys(EXORCISTS).find((id) => CREATURES_BY_ID[id]?.faction === faction);
}

/**
 * The advance this side still needs before it can field an **armed** exorcist.
 *
 * Two different gates and the Mystic is behind both: one advance unlocks the
 * creature, and `EXORCISTS` may name a flag that a *second* advance carries.
 * Section 164 measured the Wandering Folk learning the first in 6 games of 12
 * and the second in **2** -- so four of their games fielded a Mystic that
 * could not do the one thing a Mystic is for.
 *
 * Read off `TECHS` rather than listed here, for `exorcistOf`'s reason.
 * Returns null when they have what they need, or have no exorcist at all.
 */
export function missingExorcismTech(player: Player): string | null {
  const who = exorcistOf(player.faction);
  if (!who) return null;
  const unlock = TECHS.find((t) => t.units.includes(who as UnitTypeId));
  if (unlock && !player.techs.includes(unlock.id)) return unlock.id;
  const needs = EXORCISTS[who];
  if (needs === null || needs === undefined) return null;
  if (hasFlag(player, needs as Parameters<typeof hasFlag>[1])) return null;
  const arms = TECHS.find((t) => t.flags.includes(needs as never));
  return arms && !player.techs.includes(arms.id) ? arms.id : null;
}

/**
 * Whether this side should be thinking about exorcists at all. Section 164.
 *
 * **Only when there is something to exorcise.** The answer costs an advance
 * and a soldier, and in a game with no Unbound in it the whole rule is
 * flavour -- so a side that would otherwise research its exorcist ahead of a
 * granary, against nobody, is a balance change to four factions bought for
 * nothing.
 *
 * Their own Archon is excluded: it is an exorcist, but a faction is not its
 * own hard counter.
 *
 * **It self-limits before they arrive, and that is deliberate.** A faction
 * that has not turned up yet is not in `state.players` at all -- section
 * 139's stagger seats the first opponent and holds the rest back -- so this
 * is false until there is something on the map to be answered, which is the
 * turn the question starts mattering.
 */
export function faceAnUnbound(state: GameState, player: Player): boolean {
  if (!EXORCISM.enabled) return false;
  if (player.faction === 'unbound') return false;
  return state.players.some((p) => p.faction === 'unbound' && p.alive && !p.barbarian);
}
