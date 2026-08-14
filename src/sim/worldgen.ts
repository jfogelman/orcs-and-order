import { Rng } from '../engine/rng';
import { fatCrossIndices, idx, inBounds, distance } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import type { GameSettings, TerrainId } from '../model/types';

export interface StartPosition {
  x: number;
  y: number;
}

export interface WorldgenResult {
  terrain: TerrainId[];
  specials: number[];
  starts: StartPosition[];
}

// ------------------------------------------------------------------ noise

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Bilinear-interpolated value noise. A coarse lattice of random values is
 * smoothly upsampled to the full map, which gives soft blobs rather than
 * per-tile static.
 */
function valueNoise(rng: Rng, w: number, h: number, cell: number): Float32Array {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const lattice = new Float32Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.float();

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const ty = smoothstep(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const tx = smoothstep(gx - x0);
      const a = lattice[y0 * gw + x0];
      const b = lattice[y0 * gw + x0 + 1];
      const c = lattice[(y0 + 1) * gw + x0];
      const d = lattice[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    }
  }
  return out;
}

/** Summed octaves of value noise, normalised to roughly [0, 1]. */
function fbm(rng: Rng, w: number, h: number, octaves: number, startCell: number): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1;
  let total = 0;
  let cell = startCell;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(rng, w, h, cell);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
    cell = Math.max(2, cell / 2);
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// -------------------------------------------------------------- generation

/**
 * Push elevation down toward the map border so the world is an island group
 * ringed by ocean rather than land running off the edge.
 */
function applyEdgeFalloff(elev: Float32Array, w: number, h: number): void {
  const marginX = w * 0.16;
  const marginY = h * 0.16;
  for (let y = 0; y < h; y++) {
    const dy = Math.min(y, h - 1 - y) / marginY;
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x) / marginX;
      const f = smoothstep(Math.min(1, Math.max(0, Math.min(dx, dy))));
      elev[y * w + x] *= f;
    }
  }
}

/**
 * Choose the elevation cutoff that yields exactly the requested land ratio.
 * Doing it by percentile rather than a fixed threshold means every seed gets a
 * playable amount of land.
 */
function seaLevelFor(elev: Float32Array, landRatio: number): number {
  const sorted = Float32Array.from(elev).sort();
  const cut = Math.floor((1 - landRatio) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, cut))];
}

/**
 * Rewrite a field in place so its values are their own percentile ranks.
 *
 * Raw summed-octave noise has a different mean and spread on every seed, so
 * absolute thresholds produce a map that is nearly all forest on one seed and
 * has three trees on the next. Ranking makes the thresholds mean "the wettest
 * 30% of tiles", which is stable across seeds.
 */
function percentileNormalize(field: Float32Array): void {
  const n = field.length;
  const order = new Array<number>(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => field[a] - field[b]);
  for (let rank = 0; rank < n; rank++) field[order[rank]] = rank / (n - 1);
}

function classifyLand(relHeight: number, moisture: number, warmth: number): TerrainId {
  if (relHeight > 0.74) return 'mountains';
  if (relHeight > 0.5) return 'hills';
  if (moisture > 0.7) return 'forest';
  if (moisture > 0.6 && relHeight < 0.22) return 'swamp';
  if (moisture < 0.24 || (warmth > 0.78 && moisture < 0.36)) return 'desert';
  return 'grass';
}

/** Shallow water is any ocean tile touching land; everything else is deep. */
function markShallows(terrain: TerrainId[], w: number, h: number): void {
  const shallow: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      if (terrain[i] !== 'deep') continue;
      let touchesLand = false;
      for (let dy = -1; dy <= 1 && !touchesLand; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, w, h)) continue;
          if (!TERRAIN[terrain[idx(nx, ny, w)]].water) {
            touchesLand = true;
            break;
          }
        }
      }
      if (touchesLand) shallow.push(i);
    }
  }
  for (const i of shallow) terrain[i] = 'water';
}

// ---------------------------------------------------------- start positions

/**
 * How good a capital site is: total yield of the fat cross, with a hard
 * requirement of enough workable land and a coastal nudge.
 */
function siteScore(
  terrain: TerrainId[],
  specials: number[],
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const here = TERRAIN[terrain[idx(x, y, w)]];
  if (here.water || here.noCity) return -1;

  let land = 0;
  let score = 0;
  const ring = fatCrossIndices(x, y, w, h);
  if (ring.length < 18) return -1; // too close to the map edge

  for (const i of ring) {
    const t = TERRAIN[terrain[i]];
    if (!t.water) land++;
    let food = t.food;
    let shields = t.shields;
    let trade = t.trade;
    if (specials[i] && t.special) {
      food = t.special.food;
      shields = t.special.shields;
      trade = t.special.trade;
    }
    score += food * 3 + shields * 2 + trade;
  }
  if (land < 12) return -1; // not enough dry ground to build an empire on

  // A little coast is good (food, and it looks nicer); an inland sea is not.
  const water = ring.length - land;
  if (water > 0 && water <= 8) score += 6;
  return score;
}

/**
 * Label every land tile with the index of the landmass it belongs to.
 * Water tiles get -1.
 */
function landComponents(
  terrain: TerrainId[],
  w: number,
  h: number,
): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== -1 || TERRAIN[terrain[start]].water) continue;
    const label = sizes.length;
    let size = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = Math.floor(i / w);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(nx, ny, w, h)) continue;
          const ni = idx(nx, ny, w);
          if (labels[ni] !== -1 || TERRAIN[terrain[ni]].water) continue;
          labels[ni] = label;
          stack.push(ni);
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

function pickStarts(
  terrain: TerrainId[],
  specials: number[],
  w: number,
  h: number,
  count: number,
): { starts: StartPosition[]; mainlandSize: number } {
  // Everyone starts on the same continent. There are no ships in this version,
  // so civilisations placed on separate islands could never reach each other
  // and the game would consist entirely of quietly accumulating orcs.
  const { labels, sizes } = landComponents(terrain, w, h);
  let mainland = -1;
  let biggest = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] > biggest) {
      biggest = sizes[i];
      mainland = i;
    }
  }

  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (labels[idx(x, y, w)] !== mainland) continue;
      const score = siteScore(terrain, specials, x, y, w, h);
      if (score > 0) candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const mainlandSize = biggest;
  if (candidates.length === 0) return { starts: [], mainlandSize };

  // Take the best site, then the best site that is still far from every site
  // already taken, relaxing the separation requirement until everyone fits.
  const chosen: StartPosition[] = [{ x: candidates[0].x, y: candidates[0].y }];
  let minDist = Math.max(w, h) * 0.55;
  while (chosen.length < count && minDist > 3) {
    const next = candidates.find((c) =>
      chosen.every((s) => distance(c.x, c.y, s.x, s.y) >= minDist),
    );
    if (next) {
      chosen.push({ x: next.x, y: next.y });
    } else {
      minDist *= 0.85;
    }
  }
  return { starts: chosen, mainlandSize };
}

// ------------------------------------------------------------------ entry

/**
 * Generate a world, retrying with a nudged seed until the mainland is big
 * enough to hold everybody. A map whose largest continent is a sandbar makes
 * for a very short game.
 */
export function generateWorld(
  seed: number,
  settings: GameSettings,
  playerCount: number,
): WorldgenResult {
  const minMainland = Math.round(settings.width * settings.height * settings.landRatio * 0.45);
  let last = generateAttempt(seed, settings, playerCount);
  for (let attempt = 1; attempt < 10; attempt++) {
    if (last.starts.length >= playerCount && last.mainlandSize >= minMainland) break;
    last = generateAttempt((seed + attempt * 0x9e3779b9) >>> 0, settings, playerCount);
  }
  return last;
}

function generateAttempt(
  seed: number,
  settings: GameSettings,
  playerCount: number,
): WorldgenResult & { mainlandSize: number } {
  const { width: w, height: h } = settings;
  const rng = new Rng(seed);

  const elev = fbm(rng, w, h, 5, Math.max(w, h) / 4);
  const moist = fbm(rng, w, h, 4, Math.max(w, h) / 3);
  percentileNormalize(moist);
  applyEdgeFalloff(elev, w, h);

  const sea = seaLevelFor(elev, settings.landRatio);
  // Normalise against the highest point the noise actually reached, not 1.
  // Summed octaves plus edge falloff never approach 1, so dividing by (1 - sea)
  // squashes every land tile into the low end and the map comes out with no
  // mountains at all.
  let peak = sea;
  for (let i = 0; i < elev.length; i++) if (elev[i] > peak) peak = elev[i];
  const span = Math.max(1e-6, peak - sea);

  const terrain: TerrainId[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    const warmth = 1 - Math.abs(y - (h - 1) / 2) / ((h - 1) / 2);
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      const e = elev[i];
      if (e <= sea) {
        terrain[i] = 'deep';
      } else {
        terrain[i] = classifyLand((e - sea) / span, moist[i], warmth);
      }
    }
  }
  markShallows(terrain, w, h);

  const specials: number[] = new Array(w * h).fill(0);
  for (let i = 0; i < specials.length; i++) {
    if (TERRAIN[terrain[i]].special && rng.chance(0.06)) specials[i] = 1;
  }

  const { starts, mainlandSize } = pickStarts(terrain, specials, w, h, playerCount);
  return { terrain, specials, starts, mainlandSize };
}
