import type { SilhouetteId, UnitTypeDef } from '../model/units';
import { TILE } from './camera';
import { makeCanvas, shift } from './tileArt';

/**
 * Procedural unit sprites.
 *
 * These exist so the game is playable and legible before a single image file
 * exists. Crucially, a count unit is drawn as its base silhouette repeated N
 * times in a cluster — so "Ten Orcs" genuinely looks like ten orcs even in
 * placeholder form, and the joke reads from the map at a glance.
 *
 * Drop a real PNG into `public/assets/units/<id>.png` and the sprite cache
 * uses that instead, with no code change.
 */

const OUTLINE = '#1d1710';
/** Feet baseline within the 32x32 sprite. */
const BASELINE = 28;

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Filled rect with a one-pixel dark border — the whole art style, really. */
function blk(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function tri(
  ctx: CanvasRenderingContext2D,
  pts: Array<[number, number]>,
  fill: string,
  outline = true,
): void {
  if (outline) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------ silhouettes
// All drawn in a local space where (0, 0) is between the feet and up is -y.

type DrawFn = (ctx: CanvasRenderingContext2D, body: string, trim: string) => void;

const SILHOUETTES: Record<SilhouetteId, DrawFn> = {
  worker: (ctx, body, trim) => {
    blk(ctx, 5, -21, 2, 16, '#6b4a2a'); // shaft
    blk(ctx, 3, -23, 6, 3, '#9aa0a8'); // pick head
    blk(ctx, -3, -6, 2, 6, trim);
    blk(ctx, 1, -6, 2, 6, trim);
    blk(ctx, -4, -14, 8, 9, body);
    blk(ctx, -3, -19, 6, 5, shift(body, 18));
    ctx.fillStyle = '#2b1c12';
    ctx.fillRect(-2, -17, 1, 1);
    ctx.fillRect(1, -17, 1, 1);
  },

  small: (ctx, body, trim) => {
    blk(ctx, 4, -15, 2, 8, trim); // little blade
    blk(ctx, -3, -5, 2, 5, shift(body, -30));
    blk(ctx, 1, -5, 2, 5, shift(body, -30));
    blk(ctx, -3, -11, 6, 7, body);
    blk(ctx, -4, -16, 8, 5, shift(body, 14));
    blk(ctx, -7, -16, 3, 2, shift(body, -10)); // ears
    blk(ctx, 4, -16, 3, 2, shift(body, -10));
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(-2, -14, 1, 1);
    ctx.fillRect(1, -14, 1, 1);
  },

  brute: (ctx, body, trim) => {
    blk(ctx, 7, -25, 2, 18, '#5a4028'); // haft
    blk(ctx, 5, -27, 6, 5, trim); // blade
    blk(ctx, -5, -7, 4, 7, shift(body, -28));
    blk(ctx, 1, -7, 4, 7, shift(body, -28));
    blk(ctx, -6, -18, 12, 12, body);
    blk(ctx, -9, -18, 4, 6, shift(body, -14)); // shoulders
    blk(ctx, 5, -18, 4, 6, shift(body, -14));
    blk(ctx, -4, -23, 8, 6, shift(body, 12));
    ctx.fillStyle = '#f2eddc';
    ctx.fillRect(-3, -18, 1, 2); // tusks
    ctx.fillRect(2, -18, 1, 2);
    ctx.fillStyle = '#2b1c12';
    ctx.fillRect(-2, -21, 1, 1);
    ctx.fillRect(1, -21, 1, 1);
  },

  thrower: (ctx, body, trim) => {
    blk(ctx, 4, -25, 2, 9, '#5a4028');
    blk(ctx, 2, -27, 6, 4, trim);
    blk(ctx, -3, -6, 2, 6, shift(body, -28));
    blk(ctx, 1, -6, 2, 6, shift(body, -28));
    blk(ctx, -4, -16, 8, 10, body);
    blk(ctx, 3, -21, 2, 6, shift(body, -6)); // raised arm
    blk(ctx, -3, -21, 6, 5, shift(body, 14));
  },

  rider: (ctx, body, trim) => {
    blk(ctx, -9, -13, 2, 6, shift(body, -34)); // tail
    blk(ctx, -6, -4, 2, 4, shift(body, -34)); // legs
    blk(ctx, -2, -4, 2, 4, shift(body, -34));
    blk(ctx, 3, -4, 2, 4, shift(body, -34));
    blk(ctx, -8, -12, 15, 8, shift(body, -18)); // barrel
    blk(ctx, 5, -17, 3, 6, shift(body, -18)); // neck
    blk(ctx, 6, -19, 6, 3, shift(body, -10)); // head
    blk(ctx, -3, -20, 6, 8, body); // rider
    blk(ctx, -2, -24, 4, 4, shift(body, 16));
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-4, -26);
    ctx.lineTo(12, -14);
    ctx.stroke();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, -26);
    ctx.lineTo(12, -14);
    ctx.stroke();
  },

  robed: (ctx, body, trim) => {
    blk(ctx, 7, -26, 2, 26, '#5a4028'); // staff
    disc(ctx, 8, -27, 3, trim);
    tri(
      ctx,
      [
        [0, -19],
        [-8, 0],
        [8, 0],
      ],
      body,
    );
    blk(ctx, -4, -24, 8, 6, shift(body, -16)); // hood
    ctx.fillStyle = trim;
    ctx.fillRect(-2, -21, 4, 2); // the bit where a face should be
  },

  winged: (ctx, body, trim) => {
    tri(
      ctx,
      [
        [-2, -18],
        [-15, -22],
        [-4, -6],
      ],
      shift(body, -22),
    );
    tri(
      ctx,
      [
        [2, -18],
        [15, -22],
        [4, -6],
      ],
      shift(body, -22),
    );
    blk(ctx, -12, -8, 4, 2, shift(body, -30)); // tail
    blk(ctx, -4, -16, 9, 12, body);
    blk(ctx, 4, -21, 3, 6, body); // neck
    blk(ctx, 5, -24, 7, 4, shift(body, 12)); // head
    ctx.fillStyle = trim;
    ctx.fillRect(9, -23, 2, 1);
    ctx.fillStyle = '#ffd066';
    ctx.fillRect(-3, -13, 3, 4); // glowing chest, obviously
  },

  engine: (ctx, body, trim) => {
    blk(ctx, -1, -20, 3, 10, '#5a4028'); // throwing arm
    blk(ctx, -7, -21, 15, 3, trim);
    blk(ctx, -9, -11, 18, 6, body);
    disc(ctx, -5, -3, 3, shift(body, -26));
    disc(ctx, 5, -3, 3, shift(body, -26));
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(-5, -4, 1, 2);
    ctx.fillRect(5, -4, 1, 2);
  },

  armored: (ctx, body, trim) => {
    blk(ctx, 6, -26, 2, 24, '#5a4028'); // spear
    tri(
      ctx,
      [
        [7, -31],
        [4, -25],
        [10, -25],
      ],
      '#c8ccd2',
    );
    blk(ctx, -3, -6, 2, 6, shift(body, -34));
    blk(ctx, 1, -6, 2, 6, shift(body, -34));
    blk(ctx, -5, -17, 10, 11, body);
    blk(ctx, -10, -16, 5, 10, trim); // shield
    ctx.fillStyle = shift(trim, 30);
    ctx.fillRect(-8, -13, 1, 4);
    blk(ctx, -4, -23, 8, 6, shift(body, 10)); // helm
    ctx.fillStyle = '#241c14';
    ctx.fillRect(-3, -20, 6, 2); // visor
  },
};

// ---------------------------------------------------------------- cluster

/**
 * Where each member of a group of N stands, as a fraction of the sprite's size
 * relative to its centre.
 *
 * Normalised rather than in pixels because the same layout drives both the
 * 32-pixel procedural placeholders and the 96-pixel composed sprites built from
 * real art. Rows are emitted back to front, so drawing them in order gives the
 * correct overlap.
 */
export function clusterPositions(n: number): Array<[number, number]> {
  if (n <= 1) return [[0, 0]];
  const perRow = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows: number[] = [];
  let left = n;
  while (left > 0) {
    const k = Math.min(perRow, left);
    rows.push(k);
    left -= k;
  }
  const cellW = 0.84 / perRow;
  const cellH = rows.length > 1 ? 0.47 / rows.length : 0;
  const out: Array<[number, number]> = [];
  rows.forEach((count, r) => {
    const y = (r - (rows.length - 1) / 2) * cellH;
    for (let i = 0; i < count; i++) {
      out.push([(i - (count - 1) / 2) * cellW, y]);
    }
  });
  return out;
}

/** Members shrink as the crowd grows, but never below legibility. */
export function clusterScale(n: number): number {
  if (n <= 1) return 1;
  return Math.max(0.42, 1.05 / Math.pow(n, 0.38));
}

// ----------------------------------------------------------------- build

export function buildUnitSprite(def: UnitTypeDef): HTMLCanvasElement {
  const c = makeCanvas(TILE, TILE);
  const ctx = ctx2d(c);
  const draw = SILHOUETTES[def.silhouette];
  const scale = clusterScale(def.count);
  const positions = clusterPositions(def.count);

  for (const [dx, dy] of positions) {
    ctx.save();
    ctx.translate(TILE / 2 + dx * TILE, BASELINE + dy * TILE);
    ctx.scale(scale, scale);
    // Back rows sit slightly darker so a crowd reads as having depth.
    const depth = dy < 0 ? -12 : 0;
    draw(ctx, shift(def.body, depth), shift(def.trim, depth));
    ctx.restore();
  }
  return c;
}

/**
 * Build a group sprite by drawing one creature's artwork several times.
 *
 * This is why "Ten Orcs" needs no artwork of its own. Image generators are
 * unreliable at drawing a specific number of near-identical figures — ask for
 * seven orcs and you get six or nine, in slightly different armour. Stamping
 * one good orc N times is exact, consistent, and free.
 *
 * Alternate members are mirrored so a crowd does not read as a row of clones.
 */
export function composeGroupSprite(
  source: CanvasImageSource,
  count: number,
  size: number,
): HTMLCanvasElement {
  const canvas = makeCanvas(size, size);
  const ctx = ctx2d(canvas);
  const scale = clusterScale(count);
  const w = size * scale;
  const h = size * scale;

  clusterPositions(count).forEach(([nx, ny], i) => {
    const cx = size / 2 + nx * size;
    // Feet sit on a common floor line, offset per row for depth.
    const footY = size * 0.985 + ny * size;
    ctx.save();
    ctx.translate(cx, footY);
    if (i % 2 === 1) ctx.scale(-1, 1);
    ctx.drawImage(source, -w / 2, -h, w, h);
    ctx.restore();
  });
  return canvas;
}

/** The town on the map. Grows visibly as the city does. */
export function buildCitySprite(color: string, shade: string, size: number): HTMLCanvasElement {
  const c = makeCanvas(TILE, TILE);
  const ctx = ctx2d(c);
  const big = size >= 8;
  const mid = size >= 4;

  ctx.translate(TILE / 2, TILE - 5);
  // Palisade / wall footprint.
  blk(ctx, -13, -9, 26, 9, shade);
  ctx.fillStyle = color;
  ctx.fillRect(-12, -8, 24, 3);
  // Huts, with more of them in a bigger settlement.
  blk(ctx, -10, -15, 7, 7, shift(shade, 26));
  tri(
    ctx,
    [
      [-6.5, -21],
      [-11, -15],
      [-2, -15],
    ],
    color,
  );
  if (mid) {
    blk(ctx, 2, -17, 8, 9, shift(shade, 26));
    tri(
      ctx,
      [
        [6, -24],
        [1, -17],
        [11, -17],
      ],
      color,
    );
  }
  if (big) {
    blk(ctx, -3, -23, 6, 15, shift(shade, 40)); // a tower, for showing off
    tri(
      ctx,
      [
        [0, -30],
        [-4, -23],
        [4, -23],
      ],
      color,
    );
  }
  return c;
}
