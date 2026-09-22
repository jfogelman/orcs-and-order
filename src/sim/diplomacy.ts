import type { GameState } from '../model/types';
import { log } from './gamestate';

/**
 * Section 116: peace, tribute, and going back on it.
 *
 * With one other empire, a peace is an agreement to stop -- which is only a
 * decision because the game has endings that do not need a war. Peace is time
 * to build and favours whoever is ahead on works; war favours whoever is ahead
 * on army. It stops being a decision the moment breaking it is free, so it is
 * not: the side that breaks a peace has restless cities for a while, and the
 * other side remembers.
 *
 * **A peace stops the fighting and only the fighting.** Units still walk
 * through each other's land. Borders are not drawn in this game, and a rule
 * nobody can see is a rule nobody can plan around -- so while it holds, nobody
 * attacks anybody and no town changes hands, and that is all.
 *
 * **It runs a fixed term.** Two sides sitting still would otherwise turn every
 * game into a points win at the turn limit, which is the least satisfying
 * ending there is. A peace lapses unless it is renewed, and the renewing is the
 * decision.
 *
 * The raiders are never party to any of it. They refuse every conversation.
 */
export const PEACE = {
  /** The switch, for sweeps: off is the game before diplomacy existed. */
  enabled: true,
  /** Turns a peace runs before it lapses, unless renewed. */
  term: 20,
  /** Turns a peace must have held before the AI will think about breaking it. */
  settle: 6,
  /** Turns the breaker's cities are restless for, after going back on its word. */
  shameTurns: 5,
  /** How much less patient those cities are, in citizens, while they are. */
  shameContent: 1,
  /** Turns an AI waits after an offer of its own before making another. */
  offerCooldown: 12,
  /** Turns since the two empires last fought that still count as a war on. */
  warMemory: 15,
};

/** One offer of peace, with the gold that goes with it, if any. */
export interface PeaceTerms {
  /** Who is asking. */
  from: number;
  /** Who is being asked. */
  to: number;
  /**
   * Gold paid at signing. Positive: `from` pays `to` to accept. Negative: `from`
   * demands that much of `to` as the price of stopping.
   */
  gold: number;
}

/** The two sides of this game that can make peace: never the wilds. */
function empires(state: GameState, a: number, b: number): boolean {
  const pa = state.players[a];
  const pb = state.players[b];
  return !!pa && !!pb && a !== b && !pa.barbarian && !pb.barbarian && pa.alive && pb.alive;
}

/** The standing record between the sides, created on first use. */
function relations(state: GameState) {
  return (state.diplomacy ??= {});
}

/** Whether these two are at peace right now. */
export function atPeace(state: GameState, a: number, b: number): boolean {
  if (!PEACE.enabled || !empires(state, a, b)) return false;
  const peace = state.diplomacy?.peace;
  return !!peace && state.turn < peace.until;
}

/**
 * Whether these two may fight: anybody may fight the wilds, and the two
 * empires may fight each other unless they have agreed not to.
 */
export function hostile(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return !atPeace(state, a, b);
}

/** Turns the current peace has left, or 0 at war. */
export function peaceLeft(state: GameState): number {
  const peace = state.diplomacy?.peace;
  if (!PEACE.enabled || !peace) return 0;
  return Math.max(0, peace.until - state.turn);
}

/** How many times this side has gone back on its word. */
export function betrayals(state: GameState, playerId: number): number {
  return state.diplomacy?.distrust?.[playerId] ?? 0;
}

/** Whether this side's cities are still restless over a peace it broke. */
export function ashamed(state: GameState, playerId: number): boolean {
  return (state.diplomacy?.shameUntil?.[playerId] ?? 0) > state.turn;
}

/** How much the shame costs a city in patience, in citizens. */
export function shameContent(state: GameState, playerId: number): number {
  return PEACE.enabled && ashamed(state, playerId) ? PEACE.shameContent : 0;
}

/** Whether these terms can be paid: nobody signs away gold they do not have. */
export function affordable(state: GameState, terms: PeaceTerms): boolean {
  const payer = terms.gold >= 0 ? terms.from : terms.to;
  return state.players[payer].gold >= Math.abs(terms.gold);
}

/**
 * Sign. Makes a new peace, or renews the one that holds, for a full term from
 * now; and pays the gold in whichever direction the terms say.
 */
export function signPeace(state: GameState, terms: PeaceTerms): boolean {
  if (!PEACE.enabled || !empires(state, terms.from, terms.to)) return false;
  if (!affordable(state, terms)) return false;
  const payer = terms.gold >= 0 ? terms.from : terms.to;
  const payee = terms.gold >= 0 ? terms.to : terms.from;
  const gold = Math.abs(terms.gold);
  state.players[payer].gold -= gold;
  state.players[payee].gold += gold;

  const renewing = atPeace(state, terms.from, terms.to);
  const rel = relations(state);
  rel.peace = {
    since: renewing ? (rel.peace?.since ?? state.turn) : state.turn,
    until: state.turn + PEACE.term,
  };
  const a = state.players[terms.from].name;
  const b = state.players[terms.to].name;
  const paid =
    gold === 0 ? '' : ` ${state.players[payer].name} pays ${gold} gold for the privilege.`;
  const said = renewing
    ? `${a} and ${b} renew their peace for another ${PEACE.term} turns.${paid}`
    : `${a} and ${b} make peace, for ${PEACE.term} turns.${paid}`;
  for (const id of [terms.from, terms.to]) log(state, said, 'good', id, 'discovery');
  return true;
}

/**
 * Go back on it. The peace ends at once, the breaker's cities are restless for
 * a few turns, and the other side remembers -- a second offer will cost more.
 */
export function breakPeace(state: GameState, breaker: number): boolean {
  const rel = state.diplomacy;
  if (!rel?.peace) return false;
  const other = state.players.find((p) => p.id !== breaker && !p.barbarian && p.alive);
  if (!other || !atPeace(state, breaker, other.id)) return false;
  delete rel.peace;
  (rel.distrust ??= {})[breaker] = betrayals(state, breaker) + 1;
  (rel.shameUntil ??= {})[breaker] = state.turn + PEACE.shameTurns;
  const who = state.players[breaker].name;
  log(
    state,
    `${who} tears up the peace. Its own people are not sure what to make of that, and say so.`,
    'bad',
    breaker,
    'city-lost',
    undefined,
    undefined,
    BROKEN,
  );
  log(
    state,
    `${who} tears up the peace. They will want watching, and they will not be believed twice.`,
    'bad',
    other.id,
    'city-lost',
    undefined,
    undefined,
    BROKEN,
  );
  return true;
}

/**
 * The two empires just fought. A peace is a way to end a war, so nobody is
 * offered one until there has been something to end -- without this the AIs
 * made peace at turn ten and renewed it for the rest of the game, and a game
 * with no fighting in it at all is not what anybody sat down to play.
 */
export function noteClash(state: GameState, a: number, b: number): void {
  if (!empires(state, a, b)) return;
  relations(state).lastClash = state.turn;
}

/** Whether the two empires have fought in the last few turns. */
export function atWarLately(state: GameState): boolean {
  const last = state.diplomacy?.lastClash;
  return last !== undefined && state.turn - last <= PEACE.warMemory;
}

/** Marks the log line that says a peace was broken, for the alert. */
export const BROKEN = 'peace-broken';

/**
 * The end of a turn: a peace that has run its term lapses, and says so. Nobody
 * is to blame for a lapse, so it costs nothing.
 */
export function lapsePeace(state: GameState): void {
  const peace = state.diplomacy?.peace;
  if (!peace || state.turn < peace.until) return;
  delete state.diplomacy!.peace;
  for (const p of state.players) {
    if (p.barbarian || !p.alive) continue;
    log(state, `The peace has run its term and lapsed. Nobody renewed it.`, 'bad', p.id);
  }
}
