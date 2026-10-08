import { talks } from '../model/factions';
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

/**
 * The two sides of this game that can make peace: never the wilds, and never
 * anybody who does not come to a table.
 *
 * **The `talks` clause is load-bearing, and was a bug waiting for a third
 * side.** The peace below is a *single global agreement*, not one per pair --
 * which was a fair simplification while there were exactly two empires and is
 * not one any more. Without this, a Horde-Kingdom treaty would have quietly
 * made the Hivekin peaceful toward both: `atPeace` would have seen two
 * contenders and a running peace and said yes, and `hostile` would have agreed
 * that nobody could attack them.
 *
 * Section 125's "fought, not talked to" is what makes the cheap fix the correct
 * one. If a later faction *does* negotiate, this is the line that has to become
 * a peace per pair rather than a flag.
 */
function empires(state: GameState, a: number, b: number): boolean {
  const pa = state.players[a];
  const pb = state.players[b];
  if (!pa || !pb || a === b) return false;
  if (pa.barbarian || pb.barbarian || !pa.alive || !pb.alive) return false;
  return talks(pa.faction) && talks(pb.faction);
}

/** The standing record between the sides, created on first use. */
function relations(state: GameState) {
  return (state.diplomacy ??= {});
}

/**
 * The two ids that make a pair, smaller first.
 *
 * One spelling per pair and no ordered relationships: "the Horde is at peace
 * with the Kingdom" and the reverse are the same sentence, and a record that
 * could hold both would eventually hold two different answers.
 */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** What stands between these two, created on first use. */
function between(state: GameState, a: number, b: number) {
  const pairs = (relations(state).pairs ??= {});
  return (pairs[pairKey(a, b)] ??= {});
}

/** Read-only: what stands between these two, or nothing if they have no history. */
function peek(state: GameState, a: number, b: number) {
  return state.diplomacy?.pairs?.[pairKey(a, b)];
}

/**
 * A save written before relations were per-pair.
 *
 * The old single peace belonged to whichever two sides could talk, which in
 * every such save is the two empires -- the Hivekin could not sign anything and
 * the wilds were never party to it. Moved to that pair rather than dropped, so
 * a game loaded mid-treaty is still mid-treaty.
 */
export function migrateRelations(state: GameState): void {
  const rel = state.diplomacy;
  if (!rel || (!rel.peace && rel.lastClash === undefined)) return;
  const talkers = state.players.filter((p) => !p.barbarian && talks(p.faction));
  if (talkers.length >= 2) {
    const pair = between(state, talkers[0].id, talkers[1].id);
    if (rel.peace) pair.peace = rel.peace;
    if (rel.lastClash !== undefined) pair.lastClash = rel.lastClash;
  }
  delete rel.peace;
  delete rel.lastClash;
}

/** Whether these two are at peace right now. */
export function atPeace(state: GameState, a: number, b: number): boolean {
  if (!PEACE.enabled || !empires(state, a, b)) return false;
  const peace = peek(state, a, b)?.peace;
  return !!peace && state.turn < peace.until;
}

/**
 * Whether these two may fight: anybody may fight the wilds, and the two
 * empires may fight each other unless they have agreed not to.
 */
export function hostile(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  // Section 125: a side that has only just come up out of the ground cannot be
  // attacked for a turn or two. It arrives as a Grub and two Fodder-caste on
  // open ground, and anything that happened to be standing nearby would end a
  // whole faction on the turn it appeared -- which is not an emergence, it is a
  // spawn kill. Short, and only ever set on the one side that emerges.
  if (underGrace(state, a) || underGrace(state, b)) return false;
  return !atPeace(state, a, b);
}

/** Whether this side is still inside the few turns it may not be attacked in. */
function underGrace(state: GameState, id: number): boolean {
  const p = state.players[id];
  return p?.safeUntil !== undefined && state.turn < p.safeUntil;
}

/**
 * Everybody this side could in principle sign something with.
 *
 * The one place "who are my rivals" and "who negotiates" are asked together,
 * so a caller that wants a pair does not have to rediscover the `talks()` rule
 * for itself.
 */
export function talksWith(state: GameState, playerId: number): number[] {
  return state.players
    .filter((p) => p.id !== playerId && empires(state, playerId, p.id))
    .map((p) => p.id);
}

/** When this pair's peace was made, or nothing if they have none. */
export function peaceSince(state: GameState, a: number, b: number): number | undefined {
  return peek(state, a, b)?.peace?.since;
}

/** Turns this pair's peace has left, or 0 at war. */
export function peaceLeft(state: GameState, a: number, b: number): number {
  const peace = peek(state, a, b)?.peace;
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
  const pair = between(state, terms.from, terms.to);
  pair.peace = {
    since: renewing ? (pair.peace?.since ?? state.turn) : state.turn,
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
export function breakPeace(state: GameState, breaker: number, other?: number): boolean {
  const rel = state.diplomacy;
  if (!rel) return false;
  // Named, or the only side it has a peace with. Picking "whoever else is
  // alive" was right while there were two empires and would tear up the wrong
  // treaty the moment there are two to choose from.
  const victim =
    other ??
    state.players.find((p) => p.id !== breaker && !p.barbarian && p.alive && atPeace(state, breaker, p.id))
      ?.id;
  if (victim === undefined || !atPeace(state, breaker, victim)) return false;
  delete between(state, breaker, victim).peace;
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
    victim,
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
  between(state, a, b).lastClash = state.turn;
}

/** Whether these two have fought in the last few turns. */
export function atWarLately(state: GameState, a: number, b: number): boolean {
  const last = peek(state, a, b)?.lastClash;
  return last !== undefined && state.turn - last <= PEACE.warMemory;
}

/** Marks the log line that says a peace was broken, for the alert. */
export const BROKEN = 'peace-broken';

/**
 * The end of a turn: a peace that has run its term lapses, and says so. Nobody
 * is to blame for a lapse, so it costs nothing.
 */
export function lapsePeace(state: GameState): void {
  const pairs = state.diplomacy?.pairs;
  if (!pairs) return;
  for (const [key, pair] of Object.entries(pairs)) {
    if (!pair.peace || state.turn < pair.peace.until) continue;
    delete pair.peace;
    // Told to the two it was between, and to nobody else: a treaty lapsing
    // across the map is not news to a side that was never party to it.
    for (const id of key.split(':').map(Number)) {
      const p = state.players[id];
      if (!p || p.barbarian || !p.alive) continue;
      const them = state.players[key.split(':').map(Number).find((x) => x !== id) ?? id];
      log(
        state,
        `The peace with ${them?.name ?? 'them'} has run its term and lapsed. Nobody renewed it.`,
        'bad',
        id,
      );
    }
  }
}
