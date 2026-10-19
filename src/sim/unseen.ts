import type { GameState, Unit } from '../model/types';
import { unitType } from '../model/units';

/**
 * Section 138: the high tier of spies, and the one question the low tier
 * never asked.
 *
 * Everything in section 136 was an answer to **what am I looking at**. A
 * Skulker is seen -- it stands on the map like anything else -- and what it
 * changes is whose people think it is. `appearsTo` in `sim/disguise.ts` is
 * that question, and a fight is what breaks the answer.
 *
 * Nobody, the Intelligencer and the Hollow-caste answer **can I see it at
 * all**, which is `seenBy` in `sim/burrow.ts`. Until now exactly one thing in
 * this game had ever made that question interesting, and it was a Burrower
 * under the ground.
 *
 * ## Why this is a module and not four lines in `disguise.ts`
 *
 * Because they are not the same mechanic and putting them together would have
 * made them look like one. A disguised unit is *seen and misread*; a hidden
 * one is *not seen*. They are found by different rolls, broken by different
 * events, and a side that owns a counter to one does not own a counter to the
 * other. The one thing they genuinely share is `uncoveredBy` -- "this side has
 * seen through it" -- which means the same thing for both and is deliberately
 * the same field, so a search can go on being one loop over both tiers.
 *
 * ## It is a unit, not a stance
 *
 * There is no order to go quiet. A Nobody is simply never drawn, from the turn
 * it is built. The Burrower pays a whole turn to sink because sinking is a
 * choice it makes in the middle of a fight; this is what the unit *is*, and
 * charging a turn for it would only mean every one of them spent its first
 * turn doing the one thing it was built to do.
 *
 * ## This module is a leaf
 *
 * It imports the unit table and nothing else from `sim/`. `burrow.ts` asks it
 * whether a unit is hidden, and `burrow.ts` is imported by half the simulation
 * -- section 136 slice 8 lost twenty test files to a cycle that ran through
 * exactly this kind of convenience, and the lesson was to keep the leaf a
 * leaf.
 */
export const UNSEEN = {
  /** The switch, for sweeps. Off is the game with only the low tier in it. */
  enabled: true,
  /**
   * The chance a searching agent sees through a hidden one, before rank.
   *
   * Well below `SPY.finds`, which is the chance of seeing through a *disguise*.
   * A disguise is a wrong answer you are being given and can catch; this is no
   * answer at all. The plan asked for roughly half, and half is what this is.
   */
  finds: 0.2,
  /** What a rank of difference between searcher and hidden is worth. */
  findPerRank: 0.08,
  /** Never certain, however green the hider. */
  findCap: 0.6,
  /** Never hopeless, however green the searcher. */
  findFloor: 0.05,
  /**
   * The chance a town notices a stranger standing in its fields, per turn.
   *
   * **The passive defence, and the only one a side with no agents of its own
   * has.** Jeremy, asked whether that side is simply helpless: *"You can
   * potentially notice an extra unit you own"* for the low tier, and *"more
   * joyful cities are more likely to notice spies, including ones with
   * barracks"* for this.
   *
   * It is deliberately small. A town rolling once a turn against one agent is
   * already a clock, and a clock that runs fast turns the expensive unit into
   * a unit nobody builds.
   */
  notice: 0.04,
  /** Added to `notice` for a town that is celebrating: happy, fed and growing. */
  noticeCelebrating: 0.08,
  /** Added to `notice` for each soldier standing in the town, up to two. */
  noticePerGuard: 0.03,
  /** The most a town's own eyes are ever worth in one turn. */
  noticeCap: 0.2,
  /**
   * How far from the town's gate a stranger has to be before it is somebody
   * else's problem. The town's own land, roughly.
   */
  noticeReach: 2,
  /** Whether the AI knows any of this exists. Off is this slice unmeasured. */
  ai: true,
  /** How many of these a side wants about the place, once it can grow one. */
  aiWants: 1,
};

/** Whether this creature is one of the three that is never drawn. */
export function goesUnseen(unit: { type: string }): boolean {
  return UNSEEN.enabled && unitType(unit.type).hidden === true;
}

/**
 * Whether `viewer` is currently unable to see this unit at all.
 *
 * The owner always sees its own, and a side that has found one keeps it found
 * -- permanently, and for that side alone, which is the same bargain a
 * disguise is uncovered under. The asymmetry is the prize in both cases: the
 * other side goes on walking the agent about believing it is invisible.
 */
export function hiddenFrom(unit: Unit, viewerId: number): boolean {
  if (!goesUnseen(unit)) return false;
  if (unit.owner === viewerId) return false;
  if (unit.uncoveredBy?.includes(viewerId)) return false;
  // And somebody who has just walked into it can see it for the moment. No
  // turn number is stored: the mark is cleared at the start of the agent's
  // own side's turn by `forgetSpotted`, which is a better definition of "for
  // now" than any arithmetic on `state.turn` would be -- it is exactly as
  // long as it takes the agent to get a chance to move.
  return !unit.spottedBy?.includes(viewerId);
}

/**
 * Somebody has walked into this agent and can see it for the moment.
 *
 * Deliberately not `uncover`. Being trodden on in the dark is an accident, and
 * an accident should not end a career -- see the note on `Unit.spottedBy` for
 * what the probe measured when it did.
 */
export function spot(unit: Unit, viewerId: number): boolean {
  if (!goesUnseen(unit) || unit.owner === viewerId) return false;
  const seen = (unit.spottedBy ??= []);
  if (seen.includes(viewerId)) return false;
  seen.push(viewerId);
  return true;
}

/**
 * This side's agents slip out of sight again, at the start of its own turn.
 *
 * Run for the *owner*, not the finder, and that is the point: whoever trod on
 * one has had the rest of their turn, and everybody else's turn in between, to
 * do something about it. Then the agent gets to move, and is a secret again.
 */
export function forgetSpotted(state: GameState, playerId: number): void {
  for (const u of state.units) {
    if (u.owner === playerId && u.spottedBy !== undefined) delete u.spottedBy;
  }
}

/** The chance this searcher finds this hidden one, by the ranks of both. */
export function unseenOdds(searcher: Unit, hider: Unit): number {
  const edge = (searcher.rank - hider.rank) * UNSEEN.findPerRank;
  return Math.max(UNSEEN.findFloor, Math.min(UNSEEN.findCap, UNSEEN.finds + edge));
}

/**
 * What a town's own eyes are worth against a stranger in its fields.
 *
 * Read off contentment and the garrison rather than off a building, because
 * there is no building for this and there should not be: the fiction is that
 * a happy, well-watched town is one where everybody knows everybody and the
 * stranger is conspicuous, and the mechanical payoff is that keeping towns
 * content is worth something in a currency that is not score.
 *
 * A rioting town is not merely no better at this -- it is at the floor, and
 * the floor is what an unhappy town with nobody in it gets.
 */
export function townNotice(opts: {
  celebrating: boolean;
  disorder: boolean;
  guards: number;
}): number {
  if (!UNSEEN.enabled) return 0;
  if (opts.disorder) return UNSEEN.notice;
  const guards = Math.min(2, Math.max(0, opts.guards));
  const sum =
    UNSEEN.notice +
    (opts.celebrating ? UNSEEN.noticeCelebrating : 0) +
    guards * UNSEEN.noticePerGuard;
  return Math.min(UNSEEN.noticeCap, sum);
}

/** A tally of what the high tier actually did, for probes. Section 138. */
export const UNSEEN_TRACE = {
  /** Hidden agents built. */
  built: 0,
  /** Turns a hidden agent spent standing on somebody else's land. */
  abroad: 0,
  /** Hidden agents found by a searching agent. */
  foundBySearch: 0,
  /** Hidden agents found by a town that was paying attention. */
  foundByTown: 0,
  /** Times somebody walked into one, which no longer ends it. */
  foundByFoot: 0,
  /** Hidden agents that were walked into and still alive on their next turn. */
  walkedAway: 0,
  /** Low-tier agents found by a town, which this slice also turned on. */
  disguisedFoundByTown: 0,
  /** Towns that rolled and found nothing, which is most of them. */
  townRolls: 0,
};

export function resetUnseenTrace(): void {
  for (const k of Object.keys(UNSEEN_TRACE) as (keyof typeof UNSEEN_TRACE)[]) {
    UNSEEN_TRACE[k] = 0;
  }
}

/** Whether this state has anybody hidden in it at all, for cheap early exits. */
export function anybodyUnseen(state: GameState): boolean {
  return UNSEEN.enabled && state.units.some((u) => goesUnseen(u));
}
