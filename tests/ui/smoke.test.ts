// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

/**
 * The harness itself: that a test file can ask for a browser and get the real
 * page, rather than a hand-written copy of it that drifts.
 */
describe('the interface harness', () => {
  it('serves the page the game is actually served in', () => {
    // Every id `main.ts` reaches for with `el()` has to be here, because it
    // throws on a missing one and that would be a test failure about the
    // fixture rather than about the game.
    for (const id of ['map', 'topbar', 'sidebar', 'selection', 'minimap', 'logbox', 'modal-root', 'btn-endturn']) {
      expect(document.getElementById(id), `#${id}`).not.toBeNull();
    }
  });

  it('has a canvas that accepts being drawn on', () => {
    const ctx = document.createElement('canvas').getContext('2d');
    expect(ctx).not.toBeNull();
    expect(() => {
      const c = ctx as unknown as CanvasRenderingContext2D;
      c.fillStyle = '#000';
      c.fillRect(0, 0, 10, 10);
      c.save();
      c.restore();
    }).not.toThrow();
  });
});
