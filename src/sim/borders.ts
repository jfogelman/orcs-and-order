import { fatCrossIndices, idx } from '../engine/grid';
import type { GameState } from '../model/types';

/**
 * Section 117: where one side's land stops and the other's begins.
 *
 * A city claims the twenty-one tiles it could put a citizen on -- its fat
 * cross, the same shape `assignWorkers` already works with. That is the whole
 * definition, and it was chosen because it is the one the rules already use:
 * the border means "past here, you are standing on ground they farm", rather
 * than being a decoration with no rule behind it.
 *
 * Where two cities claim the same tile the nearer one takes it, and a tie goes
 * to the older city, so a border never flickers between two owners from one
 * turn to the next.
 *
 * **Nothing is forbidden by it yet.** Section 116 settled that a peace stops
 * the fighting and only the fighting; this exists so that a later "keep out of
 * our land" could be asked for at all, and so that a player can see what they
 * are about to walk into.
 */

/** Tile owner by index, or -1 for nobody's. */
export type Claims = Int16Array;

let cache: { key: string; claims: Claims } | null = null;

/**
 * What the claim map depends on: who holds which town, where it is, and when
 * it was founded -- the last of those because founding order breaks ties, so
 * two boards alike in every other way can still claim differently. Left out of
 * the first version, and a test caught it at once.
 */
function signature(state: GameState): string {
  return `${state.width}x${state.height}|${state.cities
    .map((c) => `${c.id}:${c.owner}:${c.x},${c.y}:${c.foundedTurn}`)
    .join(';')}`;
}

/** Who claims each tile of the map. Worked out when the towns change, not per frame. */
export function claims(state: GameState): Claims {
  const key = signature(state);
  if (cache && cache.key === key) return cache.claims;
  const w = state.width;
  const owners = new Int16Array(w * state.height).fill(-1);
  const best = new Float32Array(w * state.height).fill(Infinity);
  // Oldest first, so a tie between two equally distant towns goes to the elder.
  const towns = [...state.cities].sort((a, b) => a.foundedTurn - b.foundedTurn || a.id - b.id);
  for (const c of towns) {
    for (const i of fatCrossIndices(c.x, c.y, w, state.height)) {
      const dx = (i % w) - c.x;
      const dy = Math.floor(i / w) - c.y;
      const d = dx * dx + dy * dy;
      if (d < best[i]) {
        best[i] = d;
        owners[i] = c.owner;
      }
    }
  }
  cache = { key, claims: owners };
  return owners;
}

/** Whose land this tile is, or -1 if nobody's. */
export function claimedBy(state: GameState, x: number, y: number): number {
  return claims(state)[idx(x, y, state.width)];
}
