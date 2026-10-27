import type { FactionId, GameState } from '../model/types';
import { FACTION_IDS, FACTIONS } from '../model/factions';
import { difficultyOf } from './difficulty';

/**
 * Section 139: who is in this game, and when each of them turns up.
 *
 * **The rule is about the slot, not the faction.** Jeremy, asked what decides
 * whether a chosen opponent starts on the map or arrives later: the first
 * opponent is there from turn one and every one after that arrives on its own
 * staggered clock, later on an easy game and earlier on a hard one.
 *
 * That is a deliberate demotion of section 125's Hivekin. They used to be the
 * only side that emerged, and `startsOnMap` was a fact about *them*; now it is
 * a fact about *where they sit in the list*. Pick the Hive as your only
 * opponent and it starts on the map like anybody else. The consequence Jeremy
 * named when he settled it: **the Hivekin pane stops describing when they
 * arrive**, because arrival is no longer theirs -- it belongs to the
 * difficulty section, which is where it is now written up.
 *
 * ## The default is the game as measured
 *
 * With no `opponents` chosen, an empire faces everybody else in
 * `FACTION_IDS` order -- so an Orc player gets the Kingdom from turn one and
 * the Hive around turn ninety, which is exactly the game a hundred sections
 * have been measured on. The arrival turn is drawn by the same hash off the
 * same seed, so that game is not merely equivalent, it is identical.
 *
 * **A Hive player's game does change**, and knowingly: it used to face both
 * empires from turn one, and now faces one from turn one and the other on the
 * clock. That is what "the slot, not the faction" means, and the alternative
 * was keeping exactly the special case this section exists to remove.
 */
export const ARRIVALS = {
  /** Whether anybody arrives late at all. Off, every opponent starts. */
  enabled: true,
  /**
   * How far either side of the due turn an arrival may actually land.
   *
   * A window rather than a fixed turn so the arrival cannot be diarised, and
   * a narrow one so it can still be planned against -- which is what Jeremy
   * asked of the original. Scaled to the stagger rather than fixed, because a
   * ten-turn gap with an eight-turn jitter is not a stagger at all, it is a
   * coin toss about who comes first.
   */
  jitter: 8,
};

/** Turns between arrivals at this game's level, and the jitter around each. */
export function staggerOf(state: GameState): { gap: number; jitter: number } {
  const gap = difficultyOf(state.settings).stagger;
  return { gap, jitter: Math.min(ARRIVALS.jitter, Math.floor(gap / 3)) };
}

/**
 * Everybody in this game but the player, in the order they turn up.
 *
 * Absent from the settings means everybody else, which is what every game
 * before this section was.
 */
export function opponentsOf(state: GameState): FactionId[] {
  const player = state.players[0]?.faction ?? 'orc';
  const chosen = state.settings.opponents;
  const list = chosen && chosen.length > 0 ? chosen : FACTION_IDS.filter((f) => f !== player);
  // Never the player's own side, and never a name no longer in the table: a
  // save written when a faction existed should load rather than seat a ghost.
  return list.filter((f) => f !== player && FACTIONS[f] !== undefined);
}

/**
 * The opponents standing on the map at turn one: the first, and only it --
 * unless the level staggers nobody, in which case all of them.
 *
 * **Doom is everybody at once**, which is section 153's rule and the reason a
 * stagger of zero is not simply a very small stagger: the hardest game is the
 * one where the whole world is already there.
 */
export function opponentsAtStart(state: GameState): FactionId[] {
  const all = opponentsOf(state);
  if (!ARRIVALS.enabled || staggerOf(state).gap <= 0) return all;
  return all.slice(0, 1);
}

/** The opponents who arrive later, in order. */
export function latecomers(state: GameState): FactionId[] {
  if (!ARRIVALS.enabled || staggerOf(state).gap <= 0) return [];
  return opponentsOf(state).slice(1);
}

/**
 * The turn the `n`th latecomer arrives, drawn once and remembered.
 *
 * **Hashed off the map's seed rather than drawn from the shared stream**, for
 * two reasons, and the second is the important one. The first: `state.rngState`
 * starts life as `seed ^ 0x1d872b41`, so two small seeds differ only in the low
 * byte and the first draw of a fresh game is very nearly seed-independent --
 * six seeds in a row all emerged on turn 117 before that was understood. The
 * second: taking nothing from the shared stream means switching this off does
 * not shift every roll that comes after it, so a sweep arm with `enabled:
 * false` is the same game as before this section rather than a differently
 * shuffled one. Section 59's rule about emulating a control.
 *
 * `n` is folded into the hash as well as into the offset, so two latecomers in
 * one game do not land the same number of turns into their own windows.
 */
export function arrivalTurnFor(state: GameState, n: number): number {
  const seen = (state.arrivals ??= {});
  const known = seen[n];
  if (known !== undefined) return known;
  const { gap, jitter } = staggerOf(state);
  // Nobody is late at this level. Answered rather than computed, so a caller
  // that asks anyway gets turn one rather than a negative turn.
  if (gap <= 0) return (seen[n] = 1);
  const span = Math.max(1, jitter * 2 + 1);
  let h = (state.seed ^ 0x9e3779b9) >>> 0;
  // The nth latecomer mixes `n` in *after* the first round, so that n = 0 --
  // the only case any existing measurement has -- hashes to exactly what
  // section 125 drew. A game that was identical before this section stays
  // identical through it.
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    if (i === 0 && n > 0) h = (h ^ Math.imul(n, 0x27d4eb2f)) >>> 0;
  }
  // Section 153: the due turn is the stagger, counted out. The first
  // latecomer is one gap in, the second two, and the jitter moves each a few
  // turns either way so the date cannot be written down in advance.
  //
  // Floored at two rather than one, because turn one is where the sides that
  // *start* on the map are: an arrival on turn one is indistinguishable from
  // not having been staggered at all, which is the one thing Doom is for.
  const turn = Math.max(2, (n + 1) * gap + (h % span) - jitter);
  seen[n] = turn;
  return turn;
}

/** Whether this side is on the board yet. */
export function hasArrived(state: GameState, faction: FactionId): boolean {
  return state.players.some((p) => p.faction === faction && !p.barbarian);
}

/**
 * The next latecomer due, if this is the turn for one.
 *
 * One a turn at most. Two sides appearing on the same turn is a thing the
 * spacing is meant to prevent, and if a crowded map has delayed one of them
 * into another's window it is still better read as two events.
 */
export function dueNow(state: GameState): { faction: FactionId; index: number } | null {
  const waiting = latecomers(state);
  for (let n = 0; n < waiting.length; n++) {
    const faction = waiting[n];
    if (hasArrived(state, faction)) continue;
    if (state.turn < arrivalTurnFor(state, n)) continue;
    return { faction, index: n };
  }
  return null;
}
