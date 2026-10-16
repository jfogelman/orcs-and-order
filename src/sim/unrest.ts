import type { City, GameState } from '../model/types';

/**
 * Section 136 slice 8's lever and its two pure questions, kept apart from the
 * action that causes it.
 *
 * **A leaf module on purpose.** `contentLimit` has to subtract this, so
 * `city.ts` must be able to ask -- and the first version put these in
 * `incite.ts` beside the order, which imports `spying.ts`, which imports
 * `combat.ts`, which imports `city.ts`. That closed a cycle, and twenty test
 * files died at load with `XP` undefined before anything ran.
 *
 * So: nothing here imports anything but types. The *doing* lives in
 * `incite.ts` and may import whatever it likes.
 */
export const INCITE = {
  /** The switch, for sweeps. */
  enabled: true,
  /**
   * How many citizens' worth of patience it takes away.
   *
   * Two, which is a Totem or a Chapel undone. Enough to matter to a town
   * living close to its limit and not enough to flatten a comfortable one,
   * which is the shape the whole rung wants.
   */
  bite: 2,
  /** How long the talk goes round before it is forgotten. */
  lasts: 8,
  /** Whether the other side does this too. */
  ai: true,
  /** The odds it insists on first. */
  aiOdds: 0.5,
  /** The smallest town it thinks worth the trouble. */
  aiSize: 4,
};

/** Whether a town is still chewing over what somebody said. */
export function talkingAlready(state: GameState, city: City): boolean {
  return INCITE.enabled && city.unrest !== undefined && state.turn <= city.unrest.until;
}

/** What this takes off a town's patience, for `contentLimit` to subtract. */
export function unrestBite(state: GameState, city: City): number {
  return talkingAlready(state, city) ? INCITE.bite : 0;
}
