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
  /**
   * Section 160: **the slot is worth more than the faction, and nobody chose
   * the slots.**
   *
   * Section 159 went looking for why the two late factions are weak and found
   * that `opponentsOf` returns the faction table's own declaration order,
   * never shuffled, and `arrivalTurnFor` is `(n + 1) * gap`. So on Normal the
   * Hive had always arrived about turn 20, the Wandering Folk about turn 40
   * and the Unbound about turn 60, **in every game this project had ever
   * measured** -- because of where somebody typed them into `FACTIONS`. The
   * Hive was first because it was the first latecomer there was, in section
   * 125; the Unbound last because they were written last, in section 152.
   *
   * ## What 324 games said
   *
   * Mean cities by the slot a side drew, over both seed sets, every faction
   * in every slot (`all`):
   *
   * | | turn 1 | ~20 | ~40 | ~60 |
   * |---|---|---|---|---|
   * | Kingdom | 7.37 | 6.00 | 3.76 | 2.77 |
   * | Hivekin | 3.78 | 3.09 | 3.94 | 2.72 |
   * | Wandering Folk | **7.50** | 5.30 | 3.82 | 2.81 |
   * | Unbound | 5.96 | 4.50 | 3.23 | 2.35 |
   *
   * Three of the four lose about sixty per cent of their cities between the
   * first slot and the last, in **both** seed sets and past two standard
   * errors. **The Hivekin alone have no gradient at all** -- 0.87 one way on
   * tuned, 0.44 the other on held-out, which is the shape of nothing.
   *
   * So the unchosen order was handing the one slot that matters most to the
   * one side that cannot use it, and queueing the other two behind it. That
   * is why the totals do not merely redistribute when this is switched on:
   * the three latecomers between them held 5.9 cities under `none` and 12.3
   * under `all`. A wasted slot was being wasted on purpose by accident.
   *
   * **The Wandering Folk were never weak.** Given turn one they are the
   * largest empire in the game, above the Kingdom. Sections 156, 157 and 159
   * each asked what ailed them; the answer is that they were third.
   *
   * ## Why `latecomers` ships and `all` does not
   *
   * - **`none`** -- the table's order. Every measurement before this section.
   * - **`latecomers`** -- **the default.** Slot 0 keeps its occupant, so the
   *   side standing beside you at turn one is unchanged and only the queue
   *   behind it is drawn. Both late sides roughly double on every column, in
   *   both sets, and the player's own game does not move: Orc cities 5.56 /
   *   5.26 against 5.26 / 5.33.
   * - **`all`** -- slot 0 drawn too. Measured, kept, and *not* shipped: it
   *   seats the Hivekin beside you a quarter of the time, and a
   *   non-expansionist neighbour with the real rival forty turns away leaves
   *   **36 of 108 games unfinished at the turn limit** against 13 under
   *   `latecomers`. A game that cannot resolve is a worse fault than an
   *   arbitrary neighbour.
   *
   * What `latecomers` does *not* fix: slot 0 of the default roster is still
   * the Kingdom by declaration order. That one is defensible -- they are the
   * designed rival and every measurement rests on them being there -- but it
   * is defensible, not chosen, and it is written down here rather than left
   * to be rediscovered a third time.
   *
   * **Drawn from the seed, never from the shared stream**, which is section
   * 59's rule and the reason `none` is not merely equivalent to the old game
   * but byte-identical to it: nothing here moves a roll that comes after it.
   */
  shuffle: 'latecomers' as 'none' | 'latecomers' | 'all',
};

/**
 * A deterministic shuffle of a short list, off the map's seed.
 *
 * Its own salt rather than `arrivalTurnFor`'s, so the order drawn and the
 * turns drawn are independent: two games that happen to seat the same order
 * should not thereby agree about when.
 */
function drawOrder<T>(list: T[], seed: number): T[] {
  const out = list.slice();
  let h = (seed ^ 0x85ebca6b) >>> 0;
  const next = (): number => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

/**
 * **The one definition of who is in a game and in what order they turn up.**
 *
 * Takes the seed and the player's side rather than a `GameState`, because
 * `createGame` needs the answer *before* there is a state to ask about -- and
 * that is exactly why this function exists. Section 153 found `createGame`
 * keeping its own copy of "the first opponent stands on the map", fixed the
 * symptom, and left the copy: the line still sliced the list itself. A
 * shuffle would have made the two copies disagree about who was even in the
 * game, which is a worse failure than the one section 153 found.
 *
 * Resolved **once**, by `createGame`, and written into `settings.opponents`.
 * Everything afterwards reads that order back rather than re-drawing it, so
 * the order survives a save and cannot be re-rolled by a later caller.
 */
export function rosterOrder(seed: number, player: FactionId, chosen?: FactionId[]): FactionId[] {
  const list = (chosen && chosen.length > 0 ? chosen : FACTION_IDS).filter(
    (f) => f !== player && FACTIONS[f] !== undefined,
  );
  if (ARRIVALS.shuffle === 'none' || list.length < 2) return list;
  if (ARRIVALS.shuffle === 'all') return drawOrder(list, seed);
  // Slot 0 stands still and the queue behind it is re-drawn.
  return [list[0], ...drawOrder(list.slice(1), seed)];
}

/** Who starts on the map, given an order that has already been drawn. */
export function atStartOf(order: FactionId[], settings: GameState['settings']): FactionId[] {
  if (!ARRIVALS.enabled || difficultyOf(settings).stagger <= 0) return order;
  return order.slice(0, 1);
}

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
  // **An order already in the settings is read back, not re-drawn.**
  // `createGame` resolves it once and writes it here, so this is the recorded
  // order of this game; re-drawing it would shuffle an already-shuffled list
  // and the board would disagree with the queue about who comes next.
  //
  // Never the player's own side, and never a name no longer in the table: a
  // save written when a faction existed should load rather than seat a ghost.
  if (chosen && chosen.length > 0) {
    return chosen.filter((f) => f !== player && FACTIONS[f] !== undefined);
  }
  // No recorded order: a hand-built state in a test, or a save from before
  // the roster was written down. Drawn here, from the same seed, so it is the
  // same answer `createGame` would have given.
  return rosterOrder(state.seed, player, undefined);
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
  return atStartOf(opponentsOf(state), state.settings);
}

/** The opponents who arrive later, in order. */
export function latecomers(state: GameState): FactionId[] {
  const all = opponentsOf(state);
  // Whoever is not standing on the map is late, read off the same answer
  // rather than re-deriving the condition -- so a level that staggers nobody
  // has no latecomers because everybody is already at the start.
  const started = atStartOf(all, state.settings);
  return all.slice(started.length);
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
