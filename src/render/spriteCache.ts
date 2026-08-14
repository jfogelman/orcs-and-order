import type { FactionId, TerrainId, UnitTypeId } from '../model/types';
import { unitType } from '../model/units';
import { buildCitySprite, buildUnitSprite, composeGroupSprite } from './placeholders';
import { TERRAIN_VARIANTS } from './tileArt';
import type { TerrainTileSet } from './tileArt';

/**
 * Sprite lookup, with two fallbacks behind every request.
 *
 * For a single creature: use `units/<id>.png` if it exists, otherwise a
 * procedural placeholder.
 *
 * For a group ("Two Orcs", "Ten Footmen"): use `units/<id>.png` if someone has
 * hand-drawn one, but otherwise **compose it** by stamping the base creature's
 * artwork N times. Image generators are bad at drawing an exact number of
 * matching figures, and this side-steps the problem entirely — one good Orc
 * gives you the whole counting ladder, and the count on screen is always right.
 */

/** Edge length of a composed group sprite. Matches tools/prepare_art.py. */
const COMPOSED_SIZE = 96;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`no art at ${src}`));
    img.src = src;
  });
}

export class SpriteCache {
  private units = new Map<UnitTypeId, CanvasImageSource>();
  private cities = new Map<string, CanvasImageSource>();
  private baseArt = new Map<string, Promise<HTMLImageElement>>();
  private attempted = new Set<string>();
  private readonly base: string;

  /** Unit ids currently drawn from real art rather than a placeholder. */
  readonly loadedArt = new Set<string>();
  /** Unit ids drawn by stamping a base creature's art N times. */
  readonly composedArt = new Set<string>();

  constructor(baseUrl: string = import.meta.env.BASE_URL) {
    this.base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  unit(typeId: UnitTypeId): CanvasImageSource {
    let sprite = this.units.get(typeId);
    if (!sprite) {
      sprite = buildUnitSprite(unitType(typeId));
      this.units.set(typeId, sprite);
    }
    this.resolveArt(typeId);
    return sprite;
  }

  /**
   * Settlement art, in three size tiers per faction. Real art at
   * `cities/<faction>_<tier>.png` replaces the procedural hut cluster.
   */
  city(faction: FactionId, color: string, shade: string, size: number): CanvasImageSource {
    const tier = size >= 8 ? 8 : size >= 4 ? 4 : 1;
    const key = `${faction}|${tier}`;
    let sprite = this.cities.get(key);
    if (!sprite) {
      sprite = buildCitySprite(color, shade, tier);
      this.cities.set(key, sprite);
    }
    if (!this.attempted.has(key)) {
      this.attempted.add(key);
      loadImage(`${this.base}cities/${faction}_${tier}.png`)
        .then((img) => this.cities.set(key, img))
        .catch(() => {});
    }
    return sprite;
  }

  /** Cached loader, so ten group sizes share one download of the base art. */
  private creatureArt(creatureId: string): Promise<HTMLImageElement> {
    let pending = this.baseArt.get(creatureId);
    if (!pending) {
      pending = loadImage(`${this.base}units/${creatureId}.png`);
      // A missing file is the normal case; swallow it so it is not an unhandled
      // rejection, and let each caller's own catch decide what to do.
      pending.catch(() => {});
      this.baseArt.set(creatureId, pending);
    }
    return pending;
  }

  private resolveArt(typeId: UnitTypeId): void {
    if (this.attempted.has(typeId)) return;
    this.attempted.add(typeId);
    const def = unitType(typeId);

    if (def.count === 1) {
      this.creatureArt(def.base)
        .then((img) => {
          this.units.set(typeId, img);
          this.loadedArt.add(typeId);
        })
        .catch(() => {});
      return;
    }

    // A hand-drawn group sprite wins if one exists; otherwise stamp the base.
    loadImage(`${this.base}units/${typeId}.png`)
      .then((img) => {
        this.units.set(typeId, img);
        this.loadedArt.add(typeId);
      })
      .catch(() =>
        this.creatureArt(def.base)
          .then((img) => {
            this.units.set(typeId, composeGroupSprite(img, def.count, COMPOSED_SIZE));
            this.composedArt.add(typeId);
          })
          .catch(() => {}),
      );
  }

  /**
   * Swap in real terrain tiles where they exist, keeping the procedural ones
   * everywhere else. Mutates the set in place so the renderer picks the new
   * tiles up on its next frame without any reload.
   */
  installTerrainArt(tiles: TerrainTileSet, ids: TerrainId[], onLoaded?: () => void): void {
    for (const id of ids) {
      for (let v = 0; v < TERRAIN_VARIANTS; v++) {
        loadImage(`${this.base}terrain/${id}_${v}.png`)
          .then((img) => {
            tiles[id][v] = img;
            onLoaded?.();
          })
          .catch(() => {});
      }
    }
  }
}
