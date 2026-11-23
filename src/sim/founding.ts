import { UNIT_TYPES } from '../model/units';

/**
 * Section 188: what a settler costs, as a lever rather than a literal.
 *
 * **Why this file exists at all.** The arm sections 185-187 arrived at is
 * `wanderer` at 20 instead of 25, and a unit's cost is written in
 * `src/model/units.ts` as part of a creature definition. The sweep's identity
 * guard compares *settings*, and an arm that moves something the fingerprint
 * cannot see is refused as a duplicate -- which is how section 160's `no want`
 * and `no dispersal` turned out to be one arm run twice, and how section 180's
 * first smoke refused its own ladder. So the price becomes a registered lever
 * before the arm is written, not after it fails.
 *
 * **Nothing changes by default.** Every number here is what the creature table
 * already says, so applying this is a no-op on the shipped game and the arm is
 * the only thing that moves it.
 *
 * Only the Wandering Folk's settler is here because it is the only one with a
 * question attached. The others are listed so that the file reads as "what the
 * five settlers cost" rather than "the one we are suspicious of", and so a
 * later arm on any of them needs no new plumbing.
 */
export const SETTLERS = {
  /**
   * The Wandering Folk's settler, and the last candidate standing.
   *
   * 25 where every other faction's settler is 20. Section 186 dismissed that
   * as "it buys one fewer settler, not zero"; section 187 withdrew the
   * dismissal, because the measured situation is a town that never completes
   * the **first** one, and at a threshold a fifth off the price is the
   * difference between finishing before being overrun and not finishing.
   */
  wanderer: 25,
  peon: 20,
  peasant: 20,
  grub: 20,
  domovoi: 20,
};

/**
 * Write the prices onto the unit table.
 *
 * Called from `control()` so every probe and every sweep arm starts from the
 * shipped figures, and called again by an arm that has moved one. The table is
 * module state shared by every game in a run, so an arm that changed it and
 * did not pin it would leak into the next arm -- the same fault the pinning of
 * `BRIBE.floor` was added for in section 184.
 */
export function applySettlerCosts(): void {
  for (const [id, cost] of Object.entries(SETTLERS)) {
    const type = UNIT_TYPES[id];
    if (type) type.cost = cost;
  }
}
