import type { BuildingId, City, GameState, TurnRecord } from '../model/types';

/**
 * The replay record -- section 15's post-game summary, the part that has to
 * start early.
 *
 * One small entry at the end of every turn: each side's score, cities,
 * citizens, units and advances, and who holds each city at what size. Where a
 * city stands is kept once, in `state.sites`, the first time it is seen, so a
 * city razed on turn 90 is still somewhere to draw on turn 60.
 *
 * It lives in the save. A game saved before this existed has no record of its
 * early turns and never will; it replays from the turn it was first loaded
 * into a build that keeps one. That is the reason this went in before anything
 * that shows it off.
 *
 * Small: measured at 135 bytes a turn with a dozen cities, 27 KB of a 116 KB
 * save at turn 200.
 */

/** Indices into a `TurnRecord` player row. */
export const ROW = { score: 0, cities: 1, citizens: 2, units: 3, advances: 4 } as const;

/** What the game looks like right now, as a record. Stored or not. */
export function snapshotTurn(state: GameState, score: (playerId: number) => number): TurnRecord {
  const players = state.players.map((p) => {
    const cities = state.cities.filter((c) => c.owner === p.id);
    return [
      score(p.id),
      cities.length,
      cities.reduce((n, c) => n + c.size, 0),
      state.units.filter((u) => u.owner === p.id).length,
      p.techs.length,
    ];
  });
  const cities: number[] = [];
  for (const c of state.cities) cities.push(c.id, c.owner, c.size);
  return { turn: state.turn, players, cities };
}

/**
 * Note a folly or an ending work, the turn it was finished. There is one of
 * each in the world, so these are the landmarks of a game -- the replay is
 * thin without them, and a player who has just won by Portal wants to see the
 * turn it went up.
 */
export function recordLandmark(state: GameState, city: City, id: BuildingId): void {
  (state.landmarks ??= []).push({ turn: state.turn, city: city.id, owner: city.owner, id });
}

/** Keep this turn, and remember where any new city stands. */
export function recordTurn(state: GameState, score: (playerId: number) => number): void {
  const sites = (state.sites ??= {});
  for (const c of state.cities) {
    if (!sites[c.id]) sites[c.id] = [c.x, c.y, c.name];
  }
  const history = (state.history ??= []);
  const entry = snapshotTurn(state, score);
  // Once a turn, even if something calls this twice at the same boundary.
  if (history.length > 0 && history[history.length - 1].turn === entry.turn) {
    history[history.length - 1] = entry;
  } else {
    history.push(entry);
  }
}

/**
 * The record to replay: everything kept, plus the moment the game ended if the
 * last turn was not over yet. A conquest usually lands mid-turn, and a replay
 * that stopped one turn short of the capture would miss the point of it.
 */
export function replayFrames(state: GameState, score: (playerId: number) => number): TurnRecord[] {
  const kept = state.history ?? [];
  const sites = (state.sites ??= {});
  for (const c of state.cities) {
    if (!sites[c.id]) sites[c.id] = [c.x, c.y, c.name];
  }
  const now = snapshotTurn(state, score);
  const last = kept[kept.length - 1];
  if (last && last.turn === now.turn) return [...kept.slice(0, -1), now];
  return [...kept, now];
}
