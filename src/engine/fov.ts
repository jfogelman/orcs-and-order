import { idx, inBounds } from './grid';
import { TERRAIN } from '../model/terrain';
import type { TerrainId } from '../model/types';

/**
 * Line of sight over the square grid.
 *
 * Adjacent tiles are always visible. Beyond that, a Bresenham walk from the
 * viewer to the target is blocked by forest and mountains, so a unit in the
 * open cannot see past a treeline — which is what makes the Outrider's three
 * tiles of sight worth paying for.
 */
export function losClear(
  terrain: TerrainId[],
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    // The destination itself is always seen; only tiles strictly between the
    // viewer and the target can block.
    if (x === x1 && y === y1) return true;
    if (TERRAIN[terrain[idx(x, y, width)]].blocksSight) return false;
  }
}

/**
 * Mark every tile a viewer at (cx, cy) with the given radius can see.
 * Writes 1 into both `visible` and `explored`.
 */
export function revealAround(
  terrain: TerrainId[],
  width: number,
  height: number,
  visible: number[],
  explored: number[],
  cx: number,
  cy: number,
  radius: number,
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(x, y, width, height)) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist > radius) continue;
      if (dist > 1 && !losClear(terrain, width, cx, cy, x, y)) continue;
      const i = idx(x, y, width);
      visible[i] = 1;
      explored[i] = 1;
    }
  }
}
