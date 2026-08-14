/**
 * Square grid with 8-directional movement, Civ2 style.
 *
 * Tiles are addressed both as (x, y) and as a flat index `y * width + x`.
 * The flat index is what the terrain / fog arrays are keyed on.
 */

/** The eight neighbour offsets, ordered N, NE, E, SE, S, SW, W, NW. */
export const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** The four orthogonal offsets. */
export const DIRS4: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function idx(x: number, y: number, width: number): number {
  return y * width + x;
}

export function xOf(index: number, width: number): number {
  return index % width;
}

export function yOf(index: number, width: number): number {
  return Math.floor(index / width);
}

export function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/** Chebyshev distance — the true move distance on an 8-way grid. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Squared Euclidean, for "which of these is nearest" comparisons. */
export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  return distance(ax, ay, bx, by) === 1;
}

/** In-bounds 8-neighbours of a tile. */
export function neighbors8(
  x: number,
  y: number,
  width: number,
  height: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(nx, ny, width, height)) out.push([nx, ny]);
  }
  return out;
}

/**
 * Every tile within Chebyshev radius `r`, including the centre.
 * Used for unit sight and for city work radii.
 */
export function tilesInRadius(
  x: number,
  y: number,
  r: number,
  width: number,
  height: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny, width, height)) out.push([nx, ny]);
    }
  }
  return out;
}

/**
 * The Civ2 "fat cross": the 21 tiles a city can work — a 5x5 block with the
 * four corners removed. Offsets are relative to the city centre, centre first.
 */
export const FAT_CROSS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [[0, 0]];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue; // clip corners
      out.push([dx, dy]);
    }
  }
  return out;
})();

/** In-bounds fat-cross tiles around a city, as flat indices. */
export function fatCrossIndices(
  cx: number,
  cy: number,
  width: number,
  height: number,
): number[] {
  const out: number[] = [];
  for (const [dx, dy] of FAT_CROSS) {
    const x = cx + dx;
    const y = cy + dy;
    if (inBounds(x, y, width, height)) out.push(idx(x, y, width));
  }
  return out;
}
