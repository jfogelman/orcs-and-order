import { describe, expect, it } from 'vitest';
import { findPath, reachableWithin } from '../src/engine/pathfind';
import type { CostFn } from '../src/engine/pathfind';
import { distance, FAT_CROSS, fatCrossIndices, tilesInRadius } from '../src/engine/grid';

/**
 * Pathfinding is tested against hand-drawn maps rather than the game, so a
 * failure points at the algorithm and not at some rules interaction.
 *
 * `.` costs 1, `#` is impassable, `~` costs 3.
 */
function mapFrom(rows: string[]): { width: number; height: number; cost: CostFn } {
  const width = rows[0].length;
  const height = rows.length;
  const cost: CostFn = (x, y) => {
    const c = rows[y][x];
    if (c === '#') return null;
    if (c === '~') return 3;
    return 1;
  };
  return { width, height, cost };
}

describe('findPath', () => {
  it('walks a straight line across open ground', () => {
    const { width, height, cost } = mapFrom(['.....', '.....', '.....']);
    const path = findPath(width, height, [0, 1], [4, 1], cost);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual([0, 1]);
    expect(path!.at(-1)).toEqual([4, 1]);
    expect(path!.length).toBe(5);
  });

  it('uses diagonals, so a diagonal run is as long as a straight one', () => {
    const { width, height, cost } = mapFrom(['.....', '.....', '.....', '.....', '.....']);
    const path = findPath(width, height, [0, 0], [4, 4], cost);
    expect(path!.length).toBe(5);
  });

  it('routes around a wall', () => {
    const { width, height, cost } = mapFrom([
      '..#..',
      '..#..',
      '..#..',
      '.....',
    ]);
    const path = findPath(width, height, [0, 0], [4, 0], cost);
    expect(path).not.toBeNull();
    // It must dip down to row 3 to get past the barrier.
    expect(Math.max(...path!.map(([, y]) => y))).toBe(3);
    for (const [x, y] of path!) expect(x !== 2 || y === 3).toBe(true);
  });

  it('returns null when the goal is walled off', () => {
    const { width, height, cost } = mapFrom(['..#..', '..#..', '..#..']);
    expect(findPath(width, height, [0, 0], [4, 0], cost)).toBeNull();
  });

  it('prefers the cheap long way over the expensive short way', () => {
    const { width, height, cost } = mapFrom([
      '.~~~.',
      '.~~~.',
      '.....',
    ]);
    const path = findPath(width, height, [0, 0], [4, 0], cost);
    // Going through three rough tiles costs 9; going round the bottom costs 4.
    const roughCount = path!.filter(([x, y]) => y < 2 && x > 0 && x < 4).length;
    expect(roughCount).toBe(0);
  });

  it('returns just the start tile when already at the goal', () => {
    const { width, height, cost } = mapFrom(['...', '...']);
    expect(findPath(width, height, [1, 1], [1, 1], cost)).toEqual([[1, 1]]);
  });
});

describe('reachableWithin', () => {
  it('covers exactly the ring a single movement point buys', () => {
    const { width, height, cost } = mapFrom(['.....', '.....', '.....', '.....', '.....']);
    const reached = reachableWithin(width, height, [2, 2], 1, cost);
    expect(reached.size).toBe(8);
    for (const i of reached.keys()) {
      expect(distance(i % width, Math.floor(i / width), 2, 2)).toBe(1);
    }
  });

  it('never includes the tile it started on', () => {
    const { width, height, cost } = mapFrom(['...', '...', '...']);
    const reached = reachableWithin(width, height, [1, 1], 3, cost);
    expect(reached.has(1 * 3 + 1)).toBe(false);
  });

  it('lets a unit with any movement left take one expensive step', () => {
    // Rough ground costs 3, but a unit with 1 point may still enter it.
    const { width, height, cost } = mapFrom(['~~~', '~.~', '~~~']);
    const reached = reachableWithin(width, height, [1, 1], 1, cost);
    expect(reached.size).toBe(8);
    // That step consumes everything it had.
    for (const spent of reached.values()) expect(spent).toBe(1);
  });

  it('stops dead at zero movement', () => {
    const { width, height, cost } = mapFrom(['...', '...', '...']);
    expect(reachableWithin(width, height, [1, 1], 0, cost).size).toBe(0);
  });

  it('does not leak through impassable tiles', () => {
    const { width, height, cost } = mapFrom([
      '#####',
      '#...#',
      '#.@.#'.replace('@', '.'),
      '#...#',
      '#####',
    ]);
    const reached = reachableWithin(width, height, [2, 2], 5, cost);
    for (const i of reached.keys()) {
      const x = i % width;
      const y = Math.floor(i / width);
      expect(x > 0 && x < 4 && y > 0 && y < 4).toBe(true);
    }
  });
});

describe('grid helpers', () => {
  it('builds a 21-tile fat cross with the corners clipped', () => {
    expect(FAT_CROSS.length).toBe(21);
    expect(FAT_CROSS.some(([dx, dy]) => Math.abs(dx) === 2 && Math.abs(dy) === 2)).toBe(false);
  });

  it('clips the fat cross at the map edge', () => {
    expect(fatCrossIndices(0, 0, 10, 10).length).toBeLessThan(21);
    expect(fatCrossIndices(5, 5, 20, 20).length).toBe(21);
  });

  it('counts a radius as a square ring, matching 8-way movement', () => {
    expect(tilesInRadius(5, 5, 1, 20, 20).length).toBe(9);
    expect(tilesInRadius(5, 5, 2, 20, 20).length).toBe(25);
  });
});
