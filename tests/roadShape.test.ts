import { describe, expect, it } from 'vitest';
import { roadLinks } from '../src/render/roadShape';

/** A road network from a list of tiles. */
const net = (...tiles: Array<[number, number]>) => {
  const set = new Set(tiles.map(([x, y]) => `${x},${y}`));
  return (x: number, y: number) => set.has(`${x},${y}`);
};

// DIRS8: 0 up, 1 up-right, 2 right, 3 down-right, 4 down, 5 down-left, 6 left, 7 up-left.
describe('which spokes a road tile draws', () => {
  it('joins a straight road end to end', () => {
    expect(roadLinks(net([0, 0], [1, 0], [2, 0]), 1, 0)).toEqual([2, 6]);
  });

  it('draws a bend as a bend, with no brace across the corner', () => {
    const isRoad = net([0, 1], [1, 1], [1, 0]);
    // (0,1) and (1,0) are diagonal neighbours, but (1,1) already joins them.
    expect(roadLinks(isRoad, 0, 1)).toEqual([2]);
    expect(roadLinks(isRoad, 1, 0)).toEqual([4]);
  });

  it('draws a crossroads as a cross, not a diamond', () => {
    const isRoad = net([1, 0], [0, 1], [1, 1], [2, 1], [1, 2]);
    expect(roadLinks(isRoad, 1, 1)).toEqual([0, 2, 4, 6]);
    expect(roadLinks(isRoad, 1, 0)).toEqual([4]);
  });

  it('still draws a road that really does run diagonally', () => {
    const isRoad = net([0, 2], [1, 1], [2, 0]);
    expect(roadLinks(isRoad, 1, 1)).toEqual([1, 5]);
  });

  it('draws no spokes for a road on its own', () => {
    expect(roadLinks(net([5, 5]), 5, 5)).toEqual([]);
  });
});
