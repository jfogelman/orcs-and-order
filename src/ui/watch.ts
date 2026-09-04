import type { GameState, LogEntry } from '../model/types';

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
 */

export const WATCH: { yourLoss: number; yours: number; beside: number; no: number } = {
  /** Something of yours was destroyed, burned, drained, or starved. */
  yourLoss: 3,
  /** Something else of yours, addressed to you. */
  yours: 2,
  /** Somebody else's fight, close enough to one of your things to matter. */
  beside: 1,
  /** Not worth moving the camera for. */
  no: 0,
};

export function watchRank(state: GameState, viewerId: number, entry: LogEntry): number {
  if (!entry.at) return WATCH.no;
  if (entry.kind !== 'combat' && entry.kind !== 'bad') return WATCH.no;

  if (entry.player === viewerId) {
    return entry.kind === 'bad' ? WATCH.yourLoss : WATCH.yours;
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
): [number, number] | null {
  let best = WATCH.no;
  let look: [number, number] | null = null;
  for (const entry of entries) {
    if (!entry.at) continue;
    const [x, y] = entry.at;
    // Never look at something the viewer cannot see: the camera would swing to
    // a patch of fog and say plainly that something is there.
    if (!visible(x, y)) continue;
    const rank = watchRank(state, viewerId, entry);
    if (rank === WATCH.no || rank < best) continue;
    if (onScreen(x, y)) continue;
    best = rank;
    look = [x, y];
  }
  return look;
}
