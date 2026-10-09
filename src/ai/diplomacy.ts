import type { GameState, Player } from '../model/types';
import { unitType } from '../model/units';
import { raidersAtTheGate } from '../sim/barbarians';
import {
  PEACE,
  lossesIn,
  pairKey,
  standing,
  talksWith,
  warLength,
  atPeace,
  atWarLately,
  betrayals,
  breakPeace,
  peaceLeft,
  peaceSince,
  signPeace,
  type PeaceTerms,
} from '../sim/diplomacy';
import { playerCities } from '../sim/gamestate';
import { PERSONALITIES } from './ai';

/**
 * Section 116: the AI at the table.
 *
 * One number decides nearly everything: **how much it wants peace**, from how
 * the war is going. Weaker than the other side, it wants peace; stronger, it
 * wants to press on. Its own ending under way, it wants time; the other side's
 * ending under way, it wants that stopped. Raiders at its gates make a truce
 * elsewhere worth having. And every time the other side has broken its word,
 * the next word is worth less.
 *
 * The two sides lean differently, which is where the joke lives. The Horde is
 * cheaper to buy and quicker to go back on it; the Kingdom is slower to agree
 * and slower to renege, because it has to form a committee about it either way.
 *
 * It does not only answer. When it wants peace badly enough it asks, and when
 * a peace it holds is about to lapse it asks to renew -- an AI that never opens
 * talks makes diplomacy a vending machine.
 */
export const DIPLOMACY_AI = {
  /** Gold worth one whole point of wanting, when weighing an offer. */
  goldScale: 100,
  /** Each betrayal by the other side knocks this much off wanting a peace. */
  distrustCost: 0.45,
  /** How much its own ending under way adds to wanting time to finish it. */
  ownEnding: 0.8,
  /** How much the other side's ending under way takes away. */
  theirEnding: 1.2,
  /** How much raiders at its gates add. */
  raiders: 0.3,
  /** Wanting at least this much, it asks. */
  asks: 0.35,
  /** Leaning, by side: added to wanting peace, and to the bar for breaking it. */
  lean: { orc: -0.2, human: 0.2 } as Record<string, number>,
  /** Wanting this little -- much stronger, or stopping an ending -- it breaks. */
  breaks: { orc: -0.5, human: -0.8 } as Record<string, number>,

  // ------------------------------------------------- section 135 slice 4

  /**
   * Whether the AI weighs how the war has *gone* as well as how it stands.
   *
   * The switch, for sweeps. Off is the game before slice 4: strength, endings,
   * raiders and distrust, and nothing about how long this has dragged on or
   * what it has cost.
   */
  weighsTheWar: true,
  /**
   * What a war of `PEACE.longWar` turns adds to wanting it over.
   *
   * Jeremy's second answer, the first of its three terms: a peace should scale
   * on *"how long the war has been, losses, and power differentials"*. The
   * last of those was already here as the strength ratio; these two were not.
   * Scaled linearly and uncapped-but-gentle, so a very long war keeps tiring
   * both sides rather than reaching a ceiling and stopping.
   */
  tiring: 0.5,
  /**
   * The most a war's *length* can add, however long it drags on.
   *
   * Uncapped, this was a term with no ceiling in a sum whose whole useful
   * range is about three points wide: a hundred-turn war scored 2.0 on its own,
   * which swamps the strength ratio, both endings and every lean at once. The
   * strength ratio is clamped to 1.5 for exactly this reason and says so --
   * *"so an army of one against ten does not beg for peace at any price"* --
   * and a term that can exceed the entire decision on its own is the same
   * mistake with a different number.
   */
  tiringCap: 0.6,
  /** What each unit lost in this war adds to wanting it over. */
  bleeding: 0.04,
  /** The most the dead can add, so a rout does not beg at any price. */
  bleedingCap: 0.5,
  /**
   * Whether the AI reads `standing` at all. The switch, for sweeps.
   *
   * Off is every game measured before slice 4: `standing` accrues, the Talks
   * screen shows it, and not one rule consults it.
   */
  readsStanding: true,
  /**
   * Standing at or below which nobody comes to the table.
   *
   * The Angered band, which is the bottom rung of the ladder in
   * `sim/diplomacy.ts`. The plan asked for a floor -- *"below Angered, nobody
   * is asking"* -- and this is it: a side that hates you this much will not
   * open talks, will not accept, and cannot be bought.
   */
  refuses: -30,
  /**
   * How much a hated side is preferred as a target, at the worst standing.
   *
   * A multiplier on the effective distance in `nearestEnemyTarget`, so below
   * one is *more* attractive. The plan: a side it merely dislikes should be
   * weighed less than one it hates.
   */
  grudgePull: 0.7,
};

/** Roughly how strong an army is: what it hits with and what it holds with. */
function strength(state: GameState, playerId: number): number {
  let total = 0;
  for (const u of state.units) {
    if (u.owner !== playerId) continue;
    const t = unitType(u.type);
    if (t.settler) continue;
    total += t.attack + t.defense;
  }
  // A town is worth something standing even with nobody in it.
  return total + playerCities(state, playerId).length * 2;
}

/**
 * How much this AI wants peace with the other side, right now. Positive wants
 * it; negative wants the war to go on; around zero it is indifferent.
 */
export function wantPeace(state: GameState, me: Player, them: Player): number {
  const mine = Math.max(1, strength(state, me.id));
  const theirs = Math.max(1, strength(state, them.id));
  if (me.faction === 'hivekin') return hiveWants(state, me, them, mine, theirs);
  // Weaker than them is a reason; stronger is a reason the other way. Clamped,
  // so an army of one against ten does not beg for peace at any price.
  let want = Math.max(-1.5, Math.min(1.5, theirs / mine - 1));
  if (me.endingBegunAt !== undefined) want += DIPLOMACY_AI.ownEnding;
  if (them.endingBegunAt !== undefined) want -= DIPLOMACY_AI.theirEnding;
  if (raidersAtTheGate(state, me.id)) want += DIPLOMACY_AI.raiders;
  want -= betrayals(state, them.id) * DIPLOMACY_AI.distrustCost;
  want += DIPLOMACY_AI.lean[me.faction] ?? 0;
  want += howItHasGone(state, me, them);
  return want;
}

/**
 * How the war has *gone*, as opposed to how it stands. Section 135 slice 4.
 *
 * Both terms make a long bad war easier to end than a short winning one, which
 * is the whole of what Jeremy asked for: the loser asks sooner and the winner
 * holds out, and a war that has dragged on tires everybody in it whatever the
 * scoreboard says.
 *
 * Deliberately **not** weighted by who is ahead -- that is the strength ratio's
 * job, and doubling it here would make a losing side beg twice.
 */
function howItHasGone(state: GameState, me: Player, them: Player): number {
  if (!DIPLOMACY_AI.weighsTheWar) return 0;
  const run = warLength(state, me.id, them.id);
  let want = Math.min(DIPLOMACY_AI.tiringCap, (run / PEACE.longWar) * DIPLOMACY_AI.tiring);
  // What it has cost *us*. Theirs is their problem and shows up in this sum
  // from their chair, which is the symmetry that makes a one-sided war end.
  const dead = lossesIn(state, me.id, them.id, me.id);
  want += Math.min(DIPLOMACY_AI.bleedingCap, dead * DIPLOMACY_AI.bleeding);
  return want;
}

/**
 * Whether this side will come to the table with that one at all.
 *
 * The floor the plan asked for. A side in the Angered band is not negotiating:
 * it will not open talks, will not accept, and no amount of gold moves it.
 * Everything above that band is still an ordinary calculation.
 */
export function willTalkTo(state: GameState, a: number, b: number): boolean {
  if (!DIPLOMACY_AI.readsStanding) return true;
  return standing(state, a, b) > DIPLOMACY_AI.refuses;
}

/**
 * What the Hive is doing at a table, which is not what anybody else is doing.
 *
 * Jeremy, on whether its own standing means anything to it: *"mechanically, in
 * that survival trumps all else, and expansion means survival too (they don't
 * have the capacity to understand running out of resources exactly in a
 * holistic sense, but they can grasp things like farming and so on to avoid
 * starvation). The Voice mimics emotion in an alien manner."*
 *
 * So the sum is deliberately shorter than the empires'. Three things are
 * **absent**, and their absence is the characterisation:
 *
 * - **No lean.** A lean is a disposition, and the Hive has none. It is neither
 *   quick to agree nor slow to; it is whatever this turn's arithmetic says.
 * - **No distrust.** The empires knock a peace's worth down for every time the
 *   other side has gone back on its word. The Hive does not take that
 *   personally and gains nothing by remembering it: a side that broke a treaty
 *   last century is still exactly as strong as it is now, and strength is the
 *   question.
 * - **No raiders term.** Raiders at the gate are a nuisance to an empire and a
 *   food source to a Hive.
 *
 * What is left is the balance of power, weighted far harder than anybody
 * else's -- *"they won't attack if they know they will be destroyed as that
 * counters survival"* -- and room to grow, because expansion is survival to a
 * thing that cannot reason about running out of anything else.
 */
function hiveWants(
  state: GameState,
  me: Player,
  them: Player,
  mine: number,
  theirs: number,
): number {
  // The asymmetry is the point. Much the weaker, it will take nearly any peace
  // and the clamp is generous; much the stronger, it is only mildly interested
  // in continuing, because a war it is winning is still a war it is spending
  // itself on. Survival is not the same instinct as appetite.
  const edge = theirs / mine - 1;
  let want =
    edge >= 0
      ? Math.min(HIVE_TABLE.desperate, edge * HIVE_TABLE.powerWeight)
      : Math.max(-HIVE_TABLE.sated, edge * HIVE_TABLE.powerWeight);
  if (me.endingBegunAt !== undefined) want += DIPLOMACY_AI.ownEnding;
  if (them.endingBegunAt !== undefined) want -= DIPLOMACY_AI.theirEnding;
  // Room to grow. Below its own target it needs ground, and ground is held by
  // somebody, so a peace is worth less while it is short of Hives. `roomFor`
  // is the only "resource" reasoning it has, and it is deliberately crude:
  // this is a thing that grasps farming, not economics.
  const hives = playerCities(state, me.id).length;
  const target = PERSONALITIES.hivekin?.targetCities ?? 5;
  if (hives < target) want -= HIVE_TABLE.cramped * ((target - hives) / target);
  // Section 135 slice 4: a war that has run a long time is attrition, and
  // attrition is a survival question even to something that does not mind
  // losing units. **The tiring term and not the bleeding one** -- the dead
  // cost the Hive about nothing, which is the same judgement `hiveFight` makes
  // at -1 against the empires' -12.
  if (DIPLOMACY_AI.weighsTheWar) {
    want += Math.min(
      DIPLOMACY_AI.tiringCap,
      (warLength(state, me.id, them.id) / PEACE.longWar) * DIPLOMACY_AI.tiring,
    );
  }
  return want;
}

/**
 * The Hive's own numbers at the table. Section 135 slice 3b.
 *
 * Separate from `DIPLOMACY_AI` rather than folded into it, because every entry
 * there is a disposition and none of these are: they are the weights on a
 * survival calculation, and a later section rebalancing the empires' manners
 * should not quietly move them.
 */
export const HIVE_TABLE = {
  /** How much harder than an empire the Hive reads the balance of power. */
  powerWeight: 1.6,
  /** The most it will want peace, however badly it is losing. */
  desperate: 2.2,
  /** The most it will want the war to go on, however well it is going. */
  sated: 0.8,
  /** Wanting ground, at nothing of its target held. Scaled by how short it is. */
  cramped: 0.6,
  /**
   * Wanting the war this much tears up a treaty. Harder than either empire's,
   * because the Hive has no reason of its own not to and would otherwise
   * renege the moment a number moved.
   */
  breaks: -0.9,
};

/**
 * Would this AI sign these terms? Gold coming its way sweetens it; gold going
 * out sours it, in proportion.
 */
export function aiAccepts(state: GameState, terms: PeaceTerms): boolean {
  const me = state.players[terms.to];
  const them = state.players[terms.from];
  if (!me || !them || me.controller !== 'ai') return false;
  // Section 135 slice 4: hating them enough is a refusal before it is a sum.
  if (!willTalkTo(state, me.id, them.id)) return false;
  // `gold` positive means the asker pays us.
  const want = wantPeace(state, me, them) + terms.gold / DIPLOMACY_AI.goldScale;
  return want >= 0;
}

/**
 * The terms this AI would open with. Much stronger, it demands a little for its
 * trouble; much weaker, it offers a little; otherwise it asks for nothing.
 */
export function aiTerms(state: GameState, me: Player, them: Player): PeaceTerms {
  const mine = Math.max(1, strength(state, me.id));
  const theirs = Math.max(1, strength(state, them.id));
  let gold = 0;
  if (theirs / mine > 1.3) gold = Math.min(me.gold, 25);
  else if (theirs / mine < 0.8) gold = -Math.min(them.gold, 30);
  return { from: me.id, to: them.id, gold };
}

/**
 * Everybody at the table with this side. Section 135 slice 3b.
 *
 * **This returned one side, and that was the last two-empire assumption in
 * here.** Before section 125 it was the first other living non-barbarian,
 * which was the only possible answer with two on the map. Section 125 added
 * `talks()` so it would not negotiate with the Hive. Slice 3b gives the Hive a
 * table, so "the first other talker" is now a coin flip between two real
 * rivals -- and the one it did not pick would never be spoken to at all.
 *
 * `talksWith` already answers exactly this and is the one place the rule
 * lives, so this is a re-export with a name the callers here want.
 */
function rivals(state: GameState, me: Player): Player[] {
  return talksWith(state, me.id).map((id) => state.players[id]);
}

/**
 * The AI's turn at the table, before it moves anything.
 *
 * At peace: break it, if it now wants the war badly enough and the peace has
 * held long enough for that to look like a decision rather than a trick; or ask
 * to renew it, if it still wants it and it is about to lapse. At war: ask for
 * one, if it wants it enough and has not asked too recently.
 *
 * Offers to another AI are answered at once. Offers to the human wait for them,
 * as `pending`, and are put to them at the top of their turn.
 */
export function aiDiplomacy(state: GameState, playerId: number): void {
  if (!PEACE.enabled) return;
  const me = state.players[playerId];
  if (!me || me.barbarian || !me.alive || me.controller !== 'ai') return;
  // Each side it could sign with, in turn. It may break one treaty and renew
  // another in the same morning, which is correct: they are separate
  // relationships and always were, the code just could not say so.
  for (const them of rivals(state, me)) withOne(state, me, them);
}

/** This side's turn at the table with one other side. */
function withOne(state: GameState, me: Player, them: Player): void {
  const want = wantPeace(state, me, them);
  // A side it is this angry with gets no offers. Breaking an existing treaty
  // is still allowed -- refusing to talk is not the same as refusing to act,
  // and a side that hates you is exactly the side that tears one up.
  const willTalk = willTalkTo(state, me.id, them.id);
  const rel = (state.diplomacy ??= {});

  if (atPeace(state, me.id, them.id)) {
    const held = state.turn - (peaceSince(state, me.id, them.id) ?? state.turn);
    if (held >= PEACE.settle && want <= breaksAt(me)) {
      breakPeace(state, me.id, them.id);
      return;
    }
    if (willTalk && peaceLeft(state, me.id, them.id) <= 2 && want >= 0) {
      propose(state, aiTerms(state, me, them));
    }
    return;
  }
  if (!willTalk) return;

  // Peace ends a war, so there has to have been one lately. Asked of the fighting,
  // not of the calendar: two sides that have never met have nothing to settle.
  if (!atWarLately(state, me.id, them.id)) return;
  // Per pair, not per side: one cooldown meant asking the Horde silenced this
  // AI toward the Hive for a dozen turns.
  const key = pairKey(me.id, them.id);
  const last = rel.lastOffer?.[key] ?? -Infinity;
  if (want < DIPLOMACY_AI.asks || state.turn - last < PEACE.offerCooldown) return;
  (rel.lastOffer ??= {})[key] = state.turn;
  propose(state, aiTerms(state, me, them));
}

/**
 * How badly this side has to want the war before it tears a treaty up.
 *
 * The Hive is on its own number, and a harder one. Going back on a deal is not
 * a moral act to it and not a reputational one either -- it is a calculation
 * it will make the instant the calculation changes -- so the bar cannot be the
 * Horde's or it would renege constantly. Jeremy: survival trumps everything,
 * and a side that cannot be trusted at all is a side everybody comes for.
 */
function breaksAt(me: Player): number {
  if (me.faction === 'hivekin') return HIVE_TABLE.breaks;
  return DIPLOMACY_AI.breaks[me.faction] ?? -0.6;
}

/** Put an AI's offer to the other side: answered now by an AI, later by a human. */
function propose(state: GameState, terms: PeaceTerms): void {
  const them = state.players[terms.to];
  if (them.controller === 'ai') {
    if (aiAccepts(state, terms)) signPeace(state, terms);
    return;
  }
  // Only one offer waiting at a time, and never one that could not be paid.
  const payer = terms.gold >= 0 ? terms.from : terms.to;
  if (state.players[payer].gold < Math.abs(terms.gold)) terms = { ...terms, gold: 0 };
  (state.diplomacy ??= {}).pending = terms;
}
