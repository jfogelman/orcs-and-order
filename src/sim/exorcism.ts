import type { GameState, Unit } from '../model/types';
import { exorcismStrength } from './upgradeEffects';
import { withRng } from './gamestate';
import { unitType } from '../model/units';
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
  /** The switch, for sweeps. Off is the game with no answer to the Unbound. */
  enabled: true,
  /**
   * How often an exorcist actually sends one back. Section 155 slice 6.
   *
   * **This used to be a certainty**, and section 155's two Warden upgrades
   * are both priced in "exorcism strength" -- a scale the game did not have.
   * Jeremy's ruling of 2026-11-02 gave it one: an ordinary exorcist sends
   * most of them back, a Tempered Warden more, a Purging Warden nearly
   * always.
   *
   * It is a real change to section 150's shipped behaviour and not a
   * reading, which is why it is a lever: **at 1 this is exactly the game
   * before it**, and that is the arm to measure against.
   */
  chance: 0.75,
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
  if (!isExorcist(state, unit)) return false;
  // Section 155 slice 6: and then it has to land. Rolled through the game's
  // own stream so a save and a reload see the same answer.
  const odds = Math.min(1, EXORCISM.chance + exorcismStrength(unit));
  return odds >= 1 || withRng(state, (rng) => rng.chance(odds));
}

/**
 * Whether this unit is an exorcist at all, before the roll.
 *
 * The pair to `couldExorcise` above and not the same question: that one asks
 * whether a *creature* is ever one, from the table alone, and this one asks
 * whether **this unit, owned by this player, right now** is -- which for the
 * Mystic depends on an advance its side may not have. Split out in slice 6,
 * when `exorcises` started rolling, so that everything merely *counting*
 * exorcists has something to call that does not touch the random stream.
 */
export function isExorcist(state: GameState, unit: Unit): boolean {
  if (!EXORCISM.enabled) return false;
  const needs = EXORCISTS[unitType(unit.type).base];
  if (needs === undefined) return false;
  if (needs === null) return true;
  const owner = state.players[unit.owner];
  return !!owner && hasFlag(owner, needs as Parameters<typeof hasFlag>[1]);
}

/**
 * Every exorcist this side could field right now, for the advisors and the AI.
 *
 * `isExorcist` rather than `exorcises`, and the difference is not
 * cosmetic since slice 6: `exorcises` **rolls**, and a question the advisor
 * panel asks every repaint must not move the game's random stream. It is also
 * the right question -- an advisor counting exorcists is counting units, not
 * guessing how their next fight goes.
 */
export function exorcistsOf(state: GameState, playerId: number): Unit[] {
  return state.units.filter((u) => u.owner === playerId && isExorcist(state, u));
}
