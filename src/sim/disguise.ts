import type { GameState, Unit } from '../model/types';
import { CREATURES, unitType } from '../model/units';
import { goesUnseen } from './unseen';

/**
 * Section 136: a unit that is not what it appears to be.
 *
 * This is the twin of `seenBy` in `sim/burrow.ts`, and the two answer the only
 * questions anybody asks about somebody else's unit. `seenBy` answers *can I
 * see it*; this answers *what am I looking at*. Keeping them apart is
 * deliberate -- the high tier hides and the low tier lies, and a spy that did
 * both would be two mechanics wearing one name.
 *
 * **The unit's `owner` and `type` stay honest.** Half the rules in this game
 * are keyed off them -- upkeep, supply, elimination, who may be attacked -- and
 * a lie stored on the unit would have to be unpicked by every one of them. What
 * is stored instead is `disguise`: what everybody *else* is shown. The owner
 * always sees the truth, because the owner is the one person who knows.
 *
 * Resolved when the order is given rather than per viewer per frame. A disguise
 * is a decision a unit carries about, not a trick of the light, and storing the
 * answer means a save carries it, the renderer need not recompute it, and two
 * enemies never disagree about what they are looking at.
 */

/** What this unit is shown as, to somebody who is not its owner. */
export interface Disguise {
  /** The side it appears to belong to. */
  owner: number;
  /** The unit type it appears to be. */
  type: string;
}

/** What `viewer` sees when it looks at `unit`. */
export function appearsTo(unit: Unit, viewerId: number): { owner: number; type: string } {
  const honest = { owner: unit.owner, type: unit.type };
  if (!DISGUISE.enabled) return honest;
  // Its own side is never fooled, and neither is anybody who has seen through
  // it: being uncovered is permanent, and permanent for that side alone.
  if (unit.owner === viewerId) return honest;
  if (unit.uncoveredBy?.includes(viewerId)) return honest;
  return unit.disguise ?? honest;
}

/** Whether this unit is pretending to be something, to anybody. */
export function isDisguised(unit: Unit): boolean {
  return DISGUISE.enabled && unit.disguise !== undefined;
}

/**
 * Record that this side has seen through whatever this unit was doing.
 *
 * Per side rather than globally, so finding a spy is worth something to the
 * side that found it and is not an announcement to the whole map. The owner is
 * never added, having never been fooled.
 *
 * **One field, two tiers.** Section 138 added agents that are not disguised at
 * all and simply cannot be seen, and "this side has seen through it" means
 * exactly the same thing for both -- so the guard asks whether the unit was
 * concealed *in any way* rather than whether it was wearing colours. The first
 * version asked for `unit.disguise` and silently refused to uncover anything
 * from the high tier, which is a function that returns false and breaks a
 * feature without failing anywhere.
 */
export function uncover(unit: Unit, viewerId: number): boolean {
  if (unit.owner === viewerId) return false;
  if (!unit.disguise && !goesUnseen(unit)) return false;
  const seen = (unit.uncoveredBy ??= []);
  if (seen.includes(viewerId)) return false;
  seen.push(viewerId);
  return true;
}

/**
 * What a unit of this side would plausibly be mistaken for.
 *
 * The commonest fighting unit that side can build: a disguise has to be
 * something the viewer would not look at twice, and the rarest unit in the
 * game is the one that gets looked at. Deliberately not the *best* unit --
 * a Dragon standing in a border town is not camouflage.
 */
export function plausibleAs(state: GameState, ownerId: number): string | null {
  const side = state.players[ownerId];
  if (!side || side.barbarian) return null;
  const candidates = CREATURES.filter(
    (c) =>
      c.faction === side.faction &&
      // **Not a wild creature.** They carry a faction for their art and are not
      // anybody's army: the first draft of this picked a Drowned Sailor as a
      // plausible Kingdom soldier, on the grounds that it was the cheapest
      // thing with the right faction on it.
      !c.wild &&
      c.attack > 0 &&
      !c.sails &&
      !c.spy,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.cost <= b.cost ? a : b)).id;
}

/**
 * Whether this unit could be told to put a disguise on at all.
 *
 * The low tier only. Section 138's agents are not seen in the first place, and
 * an invisible unit wearing somebody's colours is a contradiction with a
 * button -- there is nobody to show the colours to. It is also the line that
 * keeps the two tiers legible: one lies, the other is not there.
 */
export function canDisguise(unit: Unit): boolean {
  const type = unitType(unit.type);
  return DISGUISE.enabled && type.spy === true && !goesUnseen(unit);
}

export const DISGUISE = {
  /** The switch, for sweeps. Off is the game before anybody lied about anything. */
  enabled: true,
};

/**
 * Put a disguise on, or take it off.
 *
 * `as` is whose colours to wear: your own, or a named side's. Wearing your own
 * buys nothing abroad and everything at home -- nobody can tell which of your
 * six goblins is the one doing the counter-spy work. Wearing theirs is the walk
 * in, and is a lie that breaks the moment anything touches it.
 *
 * **Uncovering is forgotten when the disguise changes.** A side that saw
 * through the last one has not seen through this one; what they learned was
 * that *that* goblin was a fake, and it is not a goblin any more.
 */
export function wearDisguise(state: GameState, unit: Unit, as: number | null): boolean {
  if (!canDisguise(unit)) return false;
  if (as === null) {
    delete unit.disguise;
    delete unit.uncoveredBy;
    return true;
  }
  const type = plausibleAs(state, as);
  if (type === null) return false;
  unit.disguise = { owner: as, type };
  delete unit.uncoveredBy;
  return true;
}

/** Everybody this spy could pass for: its own side, and anybody it has met. */
export function couldWear(state: GameState, unit: Unit): number[] {
  if (!canDisguise(unit)) return [];
  return state.players
    .filter((p) => !p.barbarian && p.alive && plausibleAs(state, p.id) !== null)
    .map((p) => p.id);
}
