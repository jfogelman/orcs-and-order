import { DIRS8, idx, inBounds } from '../engine/grid';
import { TERRAIN, TERRAIN_IDS } from '../model/terrain';
import type { GameState, TerrainId } from '../model/types';
import { TILE } from './camera';
import { makeCanvas, TERRAIN_VARIANTS, variantFor } from './tileArt';
import type { TerrainTileSet } from './tileArt';

/**
 * The terrain, pre-rendered once into a single offscreen image.
 *
 * Two things fall out of doing it this way. Blending neighbouring terrains into
 * each other is far too expensive to repeat every frame, but perfectly
 * affordable once per map. And drawing the map becomes a single blit of a
 * sub-rectangle rather than a loop over every visible tile.
 *
 * The blend itself is a priority soak: each terrain has a `blend` rank, and the
 * higher-ranked of any two neighbours feathers itself across the shared edge.
 * Grass softens into sand, rock crumbles onto grass, and land grows a shoreline
 * against water instead of stopping at a hard square boundary.
 */

/**
 * How far a terrain reaches into its neighbour, in tile pixels.
 *
 * Must stay well under half a tile. A tile is soaked from up to eight sides at
 * once, so at 15 the gradients from opposite edges met in the middle and a lone
 * water tile in a forest kept a core of about two pixels by two -- it read as a
 * smear of forest rather than as water, which is worse than ugly, because that
 * tile is one a unit cannot walk onto. At 10 the middle 14x14 of every tile is
 * left completely alone whatever surrounds it.
 */
const FEATHER = 10;

type MaskedTiles = Record<TerrainId, HTMLCanvasElement[][]>;

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

/**
 * An alpha ramp that is solid along one edge (or corner) of the tile and fades
 * to nothing `FEATHER` pixels in.
 */
function edgeMask(direction: number): CanvasGradient | null {
  const scratch = makeCanvas(TILE, TILE);
  const ctx = ctx2d(scratch);
  const [dx, dy] = DIRS8[direction];

  let gradient: CanvasGradient;
  if (dx !== 0 && dy !== 0) {
    // Diagonal: a soak radiating from the corner the neighbour sits behind.
    const cx = dx > 0 ? TILE : 0;
    const cy = dy > 0 ? TILE : 0;
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, FEATHER);
  } else if (dx !== 0) {
    const from = dx > 0 ? TILE : 0;
    const to = dx > 0 ? TILE - FEATHER : FEATHER;
    gradient = ctx.createLinearGradient(from, 0, to, 0);
  } else {
    const from = dy > 0 ? TILE : 0;
    const to = dy > 0 ? TILE - FEATHER : FEATHER;
    gradient = ctx.createLinearGradient(0, from, 0, to);
  }
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  return gradient;
}

/**
 * For every terrain, variant and direction, the tile art already faded out
 * along that edge. 8 terrains x 4 variants x 8 directions is 256 small
 * canvases built once, which turns each blend during map assembly into a
 * single `drawImage`.
 */
function buildMaskedTiles(tiles: TerrainTileSet): MaskedTiles {
  const out = {} as MaskedTiles;
  for (const id of TERRAIN_IDS) {
    const perVariant: HTMLCanvasElement[][] = [];
    for (let v = 0; v < TERRAIN_VARIANTS; v++) {
      const perDirection: HTMLCanvasElement[] = [];
      for (let d = 0; d < DIRS8.length; d++) {
        const canvas = makeCanvas(TILE, TILE);
        const ctx = ctx2d(canvas);
        ctx.drawImage(tiles[id][v], 0, 0, TILE, TILE);
        const mask = edgeMask(d);
        if (mask) {
          ctx.globalCompositeOperation = 'destination-in';
          ctx.fillStyle = mask;
          ctx.fillRect(0, 0, TILE, TILE);
        }
        perDirection.push(canvas);
      }
      perVariant.push(perDirection);
    }
    out[id] = perVariant;
  }
  return out;
}

export class TerrainLayer {
  readonly canvas: HTMLCanvasElement;
  /** Identifies the map this was built for, so staleness is cheap to spot. */
  readonly key: string;

  private constructor(canvas: HTMLCanvasElement, key: string) {
    this.canvas = canvas;
    this.key = key;
  }

  static keyFor(state: GameState): string {
    return `${state.seed}:${state.width}x${state.height}:${state.settings.landRatio}`;
  }

  static build(
    state: GameState,
    tiles: TerrainTileSet,
    specialIcon: HTMLCanvasElement,
  ): TerrainLayer {
    const { width: w, height: h, terrain } = state;
    const masked = buildMaskedTiles(tiles);
    const canvas = makeCanvas(w * TILE, h * TILE);
    const ctx = ctx2d(canvas);
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const here = terrain[idx(x, y, w)];
        const px = x * TILE;
        const py = y * TILE;
        ctx.drawImage(tiles[here][variantFor(x, y)], px, py, TILE, TILE);

        // Collect neighbours that outrank this tile, then lay them down
        // weakest first so the strongest terrain ends up on top.
        const overlays: Array<{ terrain: TerrainId; direction: number; variant: number }> = [];
        for (let d = 0; d < DIRS8.length; d++) {
          const [dx, dy] = DIRS8[d];
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, w, h)) continue;
          const other = terrain[idx(nx, ny, w)];
          if (TERRAIN[other].blend <= TERRAIN[here].blend) continue;

          // Only soak a diagonal when it is a genuine corner poke. If either
          // flanking tile is the same terrain, the straight edges already
          // cover it and doubling up just darkens the seam.
          if (dx !== 0 && dy !== 0) {
            const sideA = terrain[idx(x + dx, y, w)];
            const sideB = terrain[idx(x, y + dy, w)];
            if (sideA === other || sideB === other) continue;
          }
          overlays.push({ terrain: other, direction: d, variant: variantFor(nx, ny) });
        }
        overlays.sort((a, b) => TERRAIN[a.terrain].blend - TERRAIN[b.terrain].blend);
        for (const o of overlays) {
          ctx.drawImage(masked[o.terrain][o.variant][o.direction], px, py, TILE, TILE);
        }

        if (state.specials[idx(x, y, w)]) {
          ctx.drawImage(specialIcon, px, py, TILE, TILE);
        }
      }
    }
    return new TerrainLayer(canvas, TerrainLayer.keyFor(state));
  }
}
