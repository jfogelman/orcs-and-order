import { describe, expect, it } from 'vitest';
import { frameAt } from '../src/render/effects';

/**
 * The effect layer is otherwise all canvas calls, but which frame is showing
 * at a given moment is arithmetic, and it is the part that goes wrong: an
 * off-by-one here shows a blank frame at the end of every animation.
 */
describe('animation frame selection', () => {
  it('spends an equal share of the duration on each frame', () => {
    // Four frames over one second: a quarter each.
    expect(frameAt(0, 1, 4)).toBe(0);
    expect(frameAt(0.24, 1, 4)).toBe(0);
    expect(frameAt(0.26, 1, 4)).toBe(1);
    expect(frameAt(0.51, 1, 4)).toBe(2);
    expect(frameAt(0.76, 1, 4)).toBe(3);
  });

  it('holds the last frame rather than wrapping to the first', () => {
    // Wrapping would flash frame 0 for a moment just before the effect is
    // culled, which reads as the explosion restarting.
    expect(frameAt(1, 1, 4)).toBe(3);
    expect(frameAt(99, 1, 4)).toBe(3);
  });

  it('copes with a single-frame strip and a zero duration', () => {
    expect(frameAt(0.5, 1, 1)).toBe(0);
    expect(frameAt(0.5, 0, 4)).toBe(0);
  });

  it('never returns a frame outside the strip', () => {
    for (const frames of [1, 4, 6]) {
      for (let t = -0.5; t < 2; t += 0.017) {
        const f = frameAt(t, 1, frames);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(frames);
      }
    }
  });
});
