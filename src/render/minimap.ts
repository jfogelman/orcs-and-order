import { idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import type { GameState } from '../model/types';
import { Camera, TILE } from './camera';

/**
 * The minimap draws one canvas pixel per tile and lets CSS scale it up with
 * `image-rendering: pixelated`, which keeps it crisp and costs nothing.
 */
export class Minimap {
  constructor(private canvas: HTMLCanvasElement) {}

  draw(state: GameState, viewerId: number, cam: Camera): void {
    const { width: w, height: h } = state;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const viewer = state.players[viewerId];

    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    for (let i = 0; i < w * h; i++) {
      if (!viewer.explored[i]) continue;
      const hex = TERRAIN[state.terrain[i]].base;
      const n = parseInt(hex.slice(1), 16);
      const dim = viewer.visible[i] ? 1 : 0.62;
      const o = i * 4;
      data[o] = ((n >> 16) & 255) * dim;
      data[o + 1] = ((n >> 8) & 255) * dim;
      data[o + 2] = (n & 255) * dim;
      data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Cities are remembered; units are only shown where you can see them now.
    for (const c of state.cities) {
      const i = idx(c.x, c.y, w);
      if (!viewer.explored[i]) continue;
      ctx.fillStyle = state.players[c.owner].color;
      ctx.fillRect(c.x - 1, c.y - 1, 3, 3);
    }
    for (const u of state.units) {
      const i = idx(u.x, u.y, w);
      if (!viewer.visible[i]) continue;
      ctx.fillStyle = state.players[u.owner].color;
      ctx.fillRect(u.x, u.y, 1, 1);
    }

    // Current view rectangle.
    ctx.strokeStyle = 'rgba(255,245,210,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(cam.x / TILE) + 0.5,
      Math.round(cam.y / TILE) + 0.5,
      Math.round(cam.viewportW / cam.zoom / TILE),
      Math.round(cam.viewportH / cam.zoom / TILE),
    );
  }

  /** Which tile a click at CSS pixel (px, py) inside the element refers to. */
  tileAt(px: number, py: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor((px / rect.width) * this.canvas.width),
      y: Math.floor((py / rect.height) * this.canvas.height),
    };
  }
}
