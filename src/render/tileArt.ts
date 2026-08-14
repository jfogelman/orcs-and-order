import { Rng } from '../engine/rng';
import { TERRAIN, TERRAIN_IDS } from '../model/terrain';
import type { TerrainId } from '../model/types';
import { TILE } from './camera';

/**
 * Procedural terrain tiles.
 *
 * Each terrain gets a handful of variants baked once into offscreen canvases
 * at startup; the map renderer then just blits them. The generator is seeded,
 * so the world looks identical every run, and there are no image files to
 * download before the game is playable.
 */

export const TERRAIN_VARIANTS = 4;

/**
 * Variants are `CanvasImageSource` rather than canvases specifically so that
 * loaded terrain images can be swapped in over the procedural ones in place.
 */
export type TerrainTileSet = Record<TerrainId, CanvasImageSource[]>;

// --------------------------------------------------------------- colour

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Lighten (positive) or darken (negative) a #rrggbb colour. */
export function shift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp255(((n >> 16) & 255) + amount);
  const g = clamp255(((n >> 8) & 255) + amount);
  const b = clamp255((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------- canvas

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// ------------------------------------------------------------ primitives

function speckle(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  colors: string[],
  count: number,
  size = 1,
): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[rng.int(colors.length)];
    ctx.fillRect(rng.int(TILE - size + 1), rng.int(TILE - size + 1), size, size);
  }
}

function triangle(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.fill();
}

/** A slight darkening at the tile edges so tiles read as tiles on the map. */
function edgeShade(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(0, TILE - 1, TILE, 1);
  ctx.fillRect(TILE - 1, 0, 1, TILE);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, 0, TILE, 1);
  ctx.fillRect(0, 0, 1, TILE);
}

// ------------------------------------------------------------- terrains

function drawGrass(ctx: CanvasRenderingContext2D, rng: Rng, base: string, detail: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rng, [detail, shift(base, -14), shift(detail, 10)], 55);
  // A few tufts of taller grass.
  for (let i = 0; i < 5; i++) {
    const x = rng.range(2, TILE - 3);
    const y = rng.range(3, TILE - 3);
    ctx.fillStyle = shift(detail, 14);
    ctx.fillRect(x, y - 2, 1, 3);
    ctx.fillRect(x + 1, y - 1, 1, 2);
  }
}

function drawForest(ctx: CanvasRenderingContext2D, rng: Rng, base: string, detail: string): void {
  ctx.fillStyle = shift(base, -8);
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rng, [base, shift(base, -16)], 40);
  // Trees, back to front so the overlap reads correctly.
  const trees: Array<[number, number]> = [];
  for (let i = 0; i < 5; i++) trees.push([rng.range(4, TILE - 5), rng.range(9, TILE - 3)]);
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of trees) {
    ctx.fillStyle = '#3d2b1c';
    ctx.fillRect(x - 1, y - 3, 2, 4);
    triangle(ctx, x, y - 12, x - 5, y - 2, x + 5, y - 2, shift(detail, -18));
    triangle(ctx, x, y - 11, x - 3, y - 3, x + 3, y - 3, shift(detail, 12));
  }
}

function drawHills(ctx: CanvasRenderingContext2D, rng: Rng, base: string, detail: string): void {
  ctx.fillStyle = shift(base, -10);
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rng, [base, shift(base, -20)], 35);
  for (let i = 0; i < 3; i++) {
    const cx = rng.range(6, TILE - 6);
    const cy = rng.range(14, TILE - 4);
    const r = rng.range(6, 10);
    ctx.fillStyle = detail;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.62, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = shift(detail, 20);
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy - 1, r * 0.55, r * 0.34, 0, Math.PI, 2 * Math.PI);
    ctx.fill();
  }
}

function drawMountains(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  base: string,
  detail: string,
): void {
  ctx.fillStyle = shift(base, -18);
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rng, [base, shift(base, -26)], 30);
  const peaks: Array<[number, number, number]> = [];
  for (let i = 0; i < 3; i++) {
    peaks.push([rng.range(5, TILE - 5), rng.range(6, 13), rng.range(8, 13)]);
  }
  peaks.sort((a, b) => a[1] - b[1]);
  for (const [x, top, halfWidth] of peaks) {
    const bottom = TILE - 3;
    triangle(ctx, x, top, x - halfWidth, bottom, x + halfWidth, bottom, shift(detail, -22));
    triangle(ctx, x, top, x - halfWidth, bottom, x, bottom, detail);
    // Snow, or at least something white and unwelcoming.
    triangle(ctx, x, top, x - 3, top + 5, x + 3, top + 5, '#d8dce0');
  }
}

function drawSwamp(ctx: CanvasRenderingContext2D, rng: Rng, base: string, detail: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rng, [detail, shift(base, -14)], 45);
  for (let i = 0; i < 3; i++) {
    const cx = rng.range(6, TILE - 6);
    const cy = rng.range(6, TILE - 6);
    ctx.fillStyle = '#2c3a30';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rng.range(4, 7), rng.range(2, 4), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f5244';
    ctx.fillRect(cx - 3, cy - 1, 6, 1);
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.range(1, TILE - 2);
    const y = rng.range(6, TILE - 2);
    ctx.fillStyle = shift(detail, 18);
    ctx.fillRect(x, y - 4, 1, 5);
  }
}

function drawDesert(ctx: CanvasRenderingContext2D, rng: Rng, base: string, detail: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rng, [detail, shift(base, -16)], 40);
  ctx.strokeStyle = shift(base, -22);
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = rng.range(4, TILE - 4);
    const x = rng.range(-6, TILE - 8);
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.quadraticCurveTo(x + 7, y - 3, x + 14, y + 2);
    ctx.stroke();
  }
}

function drawWater(ctx: CanvasRenderingContext2D, rng: Rng, base: string, detail: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, rng, [shift(base, 8), shift(base, -8)], 30);
  for (let i = 0; i < 4; i++) {
    const x = rng.range(2, TILE - 10);
    const y = rng.range(3, TILE - 3);
    ctx.fillStyle = shift(detail, 14);
    ctx.fillRect(x, y, 5, 1);
    ctx.fillRect(x + 5, y - 1, 3, 1);
  }
}

// ---------------------------------------------------------------- build

function drawTerrain(ctx: CanvasRenderingContext2D, rng: Rng, id: TerrainId): void {
  const def = TERRAIN[id];
  switch (id) {
    case 'grass':
      drawGrass(ctx, rng, def.base, def.detail);
      break;
    case 'forest':
      drawForest(ctx, rng, def.base, def.detail);
      break;
    case 'hills':
      drawHills(ctx, rng, def.base, def.detail);
      break;
    case 'mountains':
      drawMountains(ctx, rng, def.base, def.detail);
      break;
    case 'swamp':
      drawSwamp(ctx, rng, def.base, def.detail);
      break;
    case 'desert':
      drawDesert(ctx, rng, def.base, def.detail);
      break;
    case 'water':
    case 'deep':
      drawWater(ctx, rng, def.base, def.detail);
      break;
  }
  edgeShade(ctx);
}

export function buildTerrainTiles(): TerrainTileSet {
  const out = {} as TerrainTileSet;
  for (const id of TERRAIN_IDS) {
    const variants: CanvasImageSource[] = [];
    for (let v = 0; v < TERRAIN_VARIANTS; v++) {
      // A fixed per-terrain, per-variant seed keeps the art stable run to run.
      const rng = new Rng(0xa53f + id.length * 7919 + id.charCodeAt(0) * 131 + v * 104729);
      const c = makeCanvas(TILE, TILE);
      drawTerrain(ctx2d(c), rng, id);
      variants.push(c);
    }
    out[id] = variants;
  }
  return out;
}

/** Stable per-tile variant choice, so the map does not shimmer when panning. */
export function variantFor(x: number, y: number): number {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % TERRAIN_VARIANTS;
}

/** The little marker that says "this tile has the good stuff". */
export function buildSpecialIcon(): HTMLCanvasElement {
  const c = makeCanvas(TILE, TILE);
  const ctx = ctx2d(c);
  const cx = TILE - 8;
  const cy = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx + 6, cy);
  ctx.lineTo(cx, cy + 6);
  ctx.lineTo(cx - 6, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f0c64a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx + 4, cy);
  ctx.lineTo(cx, cy + 4);
  ctx.lineTo(cx - 4, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fdf0b0';
  ctx.fillRect(cx - 1, cy - 2, 2, 2);
  return c;
}
