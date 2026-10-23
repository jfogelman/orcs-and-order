import type { GameState, LogEntry } from '../model/types';
import { SIGHTING } from '../sim/barbarians';

/**
 * Which of a turn's events the camera should turn to look at.
 *
 * A whole AI turn drains at once, so a busy turn offers several things worth
 * watching and the camera can only show one. It used to take **the first**,
 * which is how an ogre consumed at the top of your turn went unseen behind
 * trolls dying at the end of the last one -- both in the same batch, the trolls
 * logged first, and the ogre never reached the camera.
 *
 * Ranked instead. Losing something of yours outranks a fight you merely have a
 * unit standing beside, because the fight is still there to look at afterwards
 * and the unit is not. Among equals the **most recent** wins: the earlier one
 * is in the log, and what you want to be looking at is where things ended up.
 *
 * Section 149 moved one rung and renamed it. **A fight one of yours is in now
 * outranks a sighting**, on Jeremy's ruling from a played game: any attack
 * should get the camera, because a near miss is exactly the thing you will
 * never know happened if you did not see it.
 */

export const WATCH: {
  yourLoss: number;
  yourFight: number;
  sighting: number;
  beside: number;
  no: number;
} = {
  /** Something of yours was destroyed, burned, drained, or starved. */
  yourLoss: 4,
  /**
   * **One of yours was in a fight and came out of it.** Section 149.
   *
   * This used to be called `yours` and sat *below* a sighting, which is how a
   * Goblin attacking a Wanderer lost the camera to a raiding band somebody had
   * spotted on the other side of the map. Reported from a played game, and
   * Jeremy's ruling on it is the reason this moved: **any attack should get
   * focus, and a near miss is still missable if you did not see it.**
   *
   * He is right, and the old name was carrying the mistake. Nothing but combat
   * ever reached this rung -- `watchRank` returns `no` for every kind except
   * `combat` and `bad`, and `bad` goes to `yourLoss` above -- so "something
   * else of yours, addressed to you" was never what it meant. It has always
   * been a fight one of your units was standing in.
   *
   * Below an outright loss, because a unit that survived is still there to
   * look at and a unit that did not is not.
   */
  yourFight: 3,
  /**
   * You have just laid eyes on something that belongs to nobody.
   *
   * Above a fight merely happening nearby, because you cannot answer what you
   * have not seen. Below one of yours being swung at: a band on the horizon
   * is a thing that might happen, and a spear in your settler already has.
   */
  sighting: 2,
  /** Somebody else's fight, close enough to one of your things to matter. */
  beside: 1,
  /** Not worth moving the camera for. */
  no: 0,
};

export function watchRank(state: GameState, viewerId: number, entry: LogEntry): number {
  if (!entry.at) return WATCH.no;
  if (entry.kind !== 'combat' && entry.kind !== 'bad') return WATCH.no;

  if (entry.player === viewerId) {
    if (entry.subject === SIGHTING) return WATCH.sighting;
    // Only `combat` and `bad` get this far, so the second of these is always
    // a fight one of yours was standing in rather than general news.
    return entry.kind === 'bad' ? WATCH.yourLoss : WATCH.yourFight;
  }

  // A message addressed to somebody else can still be about us: an enemy
  // killing one of our units is written for them. So ask the map instead.
  //
  // Note this cannot see the unit that just died -- it has already been spliced
  // out of the list -- which is why `destroyUnit` logs a position and why a
  // death is ranked off `player` above rather than off what is standing nearby.
  const [x, y] = entry.at;
  const near = (ux: number, uy: number) => Math.abs(ux - x) <= 1 && Math.abs(uy - y) <= 1;
  const beside =
    state.units.some((u) => u.owner === viewerId && near(u.x, u.y)) ||
    state.cities.some((c) => c.owner === viewerId && near(c.x, c.y));
  return beside ? WATCH.beside : WATCH.no;
}

/**
 * The tile to centre on, out of everything that happened, or null to stay put.
 *
 * `visible` and `onScreen` are asked rather than worked out here: what the
 * viewer can see and where the camera is pointing both belong to the caller.
 * An event already on screen is not a reason to move, but it must not stop a
 * later one from being chosen either -- which is the other half of the bug, and
 * the reason this returns a choice rather than the first thing it likes.
 */
export function chooseFocus(
  state: GameState,
  viewerId: number,
  entries: readonly LogEntry[],
  visible: (x: number, y: number) => boolean,
  onScreen: (x: number, y: number) => boolean,
  /**
   * Ground the viewer has seen at some point. Only a loss of their own is
   * allowed to use it; see below.
   */
  explored: (x: number, y: number) => boolean = visible,
): [number, number] | null {
  let best = WATCH.no;
  let look: [number, number] | null = null;
  for (const entry of entries) {
    if (!entry.at) continue;
    const [x, y] = entry.at;
    const rank = watchRank(state, viewerId, entry);
    if (rank === WATCH.no || rank < best) continue;
    // Never look at something the viewer cannot see: the camera would swing to
    // a patch of fog and say plainly that something is there.
    //
    // **Except a loss of their own.** A scout dying alone puts out the only
    // light on that tile, so by the time the message is read the ground is
    // dark again -- and the one death most worth turning to look at was the one
    // the camera refused to move for. Nothing is given away: it was our unit,
    // we knew where it was, and it is the news itself that says it is gone.
    const reachable = rank === WATCH.yourLoss ? explored(x, y) : visible(x, y);
    if (!reachable) continue;
    if (onScreen(x, y)) continue;
    best = rank;
    look = [x, y];
  }
  return look;
}
