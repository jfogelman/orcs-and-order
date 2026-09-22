import type { GameState, Player } from '../model/types';
import { unitType } from '../model/units';
import { raidersAtTheGate } from '../sim/barbarians';
import {
  PEACE,
  atPeace,
  atWarLately,
  betrayals,
  breakPeace,
  peaceLeft,
  signPeace,
  type PeaceTerms,
} from '../sim/diplomacy';
import { playerCities } from '../sim/gamestate';

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
  // Weaker than them is a reason; stronger is a reason the other way. Clamped,
  // so an army of one against ten does not beg for peace at any price.
  let want = Math.max(-1.5, Math.min(1.5, theirs / mine - 1));
  if (me.endingBegunAt !== undefined) want += DIPLOMACY_AI.ownEnding;
  if (them.endingBegunAt !== undefined) want -= DIPLOMACY_AI.theirEnding;
  if (raidersAtTheGate(state, me.id)) want += DIPLOMACY_AI.raiders;
  want -= betrayals(state, them.id) * DIPLOMACY_AI.distrustCost;
  want += DIPLOMACY_AI.lean[me.faction] ?? 0;
  return want;
}

/**
 * Would this AI sign these terms? Gold coming its way sweetens it; gold going
 * out sours it, in proportion.
 */
export function aiAccepts(state: GameState, terms: PeaceTerms): boolean {
  const me = state.players[terms.to];
  const them = state.players[terms.from];
  if (!me || !them || me.controller !== 'ai') return false;
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

/** The other empire, if there is one. */
function rival(state: GameState, me: Player): Player | undefined {
  return state.players.find((p) => p.id !== me.id && !p.barbarian && p.alive);
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
  const them = rival(state, me);
  if (!them) return;
  const want = wantPeace(state, me, them);
  const rel = (state.diplomacy ??= {});

  if (atPeace(state, me.id, them.id)) {
    const held = state.turn - (rel.peace?.since ?? state.turn);
    if (held >= PEACE.settle && want <= (DIPLOMACY_AI.breaks[me.faction] ?? -0.6)) {
      breakPeace(state, me.id);
      return;
    }
    if (peaceLeft(state) <= 2 && want >= 0) propose(state, aiTerms(state, me, them));
    return;
  }

  // Peace ends a war, so there has to have been one lately. Asked of the fighting,
  // not of the calendar: two sides that have never met have nothing to settle.
  if (!atWarLately(state)) return;
  const last = rel.lastOffer?.[me.id] ?? -Infinity;
  if (want < DIPLOMACY_AI.asks || state.turn - last < PEACE.offerCooldown) return;
  (rel.lastOffer ??= {})[me.id] = state.turn;
  propose(state, aiTerms(state, me, them));
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
