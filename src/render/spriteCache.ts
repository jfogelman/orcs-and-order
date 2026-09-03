import type { FactionId, TerrainId, UnitTypeId } from '../model/types';
import { unitType } from '../model/units';
import { buildCitySprite, buildUnitSprite, composeGroupSprite } from './placeholders';
import { makeCanvas, TERRAIN_VARIANTS } from './tileArt';
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
  /** Per-type attack frames; null means "looked, and there are none". */
  /** Keyed by unit type plus variant; null means "looked, and there are none". */
  private attacks = new Map<string, CanvasImageSource[] | null>();
  private attackAttempted = new Set<string>();
  private marks = new Map<string, CanvasImageSource | null>();
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
    // Start the attack strip loading as soon as a unit of this type is drawn.
    //
    // It used to be fetched at the moment of attacking, which meant the answer
    // was always "not yet" and the swing was skipped -- the animation was
    // effectively never seen. Warming it here costs one request per creature
    // that appears on screen, well before anyone throws a punch.
    this.attackFrames(typeId);
    // Wanted the instant the unit takes a hit, so fetched before it does.
    this.hurtFrames(typeId);
    // Only trolls have one, so this is a single 404 for everyone else, once.
    if (unitType(typeId).regenMultiplier > 1) this.regenFrames(typeId);
    // A thrower has two more sheets -- swinging with nothing, and getting the
    // weapon back. Warmed here for the same reason as the attack itself: asked
    // for at the moment they are needed, the answer is always "not yet" and the
    // animation is simply skipped. Only for creatures the model says throw,
    // so this is not thirty-four requests that will never exist.
    if (unitType(typeId).throwsWeapon) {
      this.attackFrames(typeId, true);
      this.rearmFrames(typeId);
      this.hurtFrames(typeId, true);
    }
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

  /**
   * The frames of a creature's attack animation, composed for the group size.
   *
   * Returns null until the strip has loaded, and permanently for any creature
   * that has no animation art -- the caller falls back to the idle sprite, so
   * a missing file costs nothing but the animation.
   *
   * Frame count comes from the strip's own proportions, exactly as it does for
   * the effect layer: square frames, so width over height is the count.
   */
  attackFrames(
    typeId: UnitTypeId,
    disarmed = false,
    variant = '',
  ): CanvasImageSource[] | null {
    // A thrower that has thrown swings at nothing, and has its own animation
    // for it. Falls back to the armed one, so a creature with only the single
    // sheet still animates rather than freezing.
    if (disarmed) return this.variantFrames(typeId, '-disarmed') ?? this.variantFrames(typeId, '');
    // An ogre holding a particular club swings it, and there is a sheet per
    // club. Same fallback: a club with no art yet still animates.
    if (variant) return this.variantFrames(typeId, variant) ?? this.variantFrames(typeId, '');
    return this.variantFrames(typeId, '');
  }

  /** A creature knitting itself back together, for the ones that visibly do. */
  regenFrames(typeId: UnitTypeId): CanvasImageSource[] | null {
    return this.variantFrames(typeId, '', 'regen');
  }

  /** The single pose for getting a thrown weapon back, if there is one. */
  rearmFrames(typeId: UnitTypeId): CanvasImageSource[] | null {
    return this.variantFrames(typeId, '-rearm');
  }

  /**
   * How badly hurt a unit looks. Two poses: bloodied but upright, and down on
   * one knee. Null for a creature with no such sheet, which falls back to
   * looking perfectly fine however close to death it is.
   */
  hurtFrames(typeId: UnitTypeId, disarmed = false): CanvasImageSource[] | null {
    if (disarmed) {
      return this.variantFrames(typeId, '-disarmed', 'hurt') ?? this.variantFrames(typeId, '', 'hurt');
    }
    return this.variantFrames(typeId, '', 'hurt');
  }

  /**
   * The badge for a rank, or null until it has loaded.
   *
   * Drawn as an object rather than a number: these land at roughly a sixth of
   * a tile, where a glyph stops being legible and a silhouette does not.
   */
  promotionMark(faction: FactionId, rank: number): CanvasImageSource | null {
    const key = `mark:${faction}:${rank}`;
    const ready = this.marks.get(key);
    if (ready !== undefined) return ready;
    if (this.attackAttempted.has(key)) return null;
    this.attackAttempted.add(key);
    loadImage(`${this.base}promotions/${faction}-${rank}.png`)
      .then((img) => this.marks.set(key, img))
      .catch(() => this.marks.set(key, null));
    return null;
  }

  private overlays = new Map<string, HTMLImageElement | null>();

  /**
   * The overlay for a condition, or its guttering version for the last turn.
   *
   * Loaded the same way a rank mark is, and remembering failure as well as
   * success so a missing file is not re-requested on every frame of every turn.
   */
  statusOverlay(kind: string, fading: boolean): HTMLImageElement | null {
    const name = fading ? `${kind}-fading` : kind;
    const key = `status:${name}`;
    const ready = this.overlays.get(key);
    if (ready !== undefined) return ready;
    if (this.attackAttempted.has(key)) return null;
    this.attackAttempted.add(key);
    loadImage(`${this.base}status/${name}.png`)
      .then((img) => this.overlays.set(key, img))
      .catch(() => this.overlays.set(key, null));
    return null;
  }

  private variantFrames(
    typeId: UnitTypeId,
    variant: string,
    sheet = 'attack',
  ): CanvasImageSource[] | null {
    const key = `${typeId}${variant}_${sheet}`;
    const ready = this.attacks.get(key);
    if (ready !== undefined) return ready;
    if (this.attackAttempted.has(key)) return null;
    this.attackAttempted.add(key);

    const def = unitType(typeId);
    loadImage(`${this.base}units/${def.base}${variant}_${sheet}.png`)
      .then((strip) => {
        const size = strip.height;
        const count = Math.max(1, Math.round(strip.width / size));
        const frames: CanvasImageSource[] = [];
        for (let i = 0; i < count; i++) {
          const cut = makeCanvas(size, size);
          const ctx = cut.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(strip, i * size, 0, size, size, 0, 0, size, size);
          // A group animates by stamping the same frame the same way its idle
          // sprite is stamped, so Three Orcs swing as three orcs.
          frames.push(
            def.count === 1 ? cut : composeGroupSprite(cut, def.count, COMPOSED_SIZE),
          );
        }
        this.attacks.set(key, frames);
      })
      .catch(() => {
        // No animation of this kind for this creature. Remembered as null so
        // the fallback is decided once rather than every frame.
        this.attacks.set(key, null);
      });
    return null;
  }

  /**
   * How a thrower looks having thrown: the last frame of its own attack, which
   * is the pose with the weapon already gone.
   *
   * Reusing the animation's final frame means the disarmed state is drawn from
   * art that already exists and can never disagree with it.
   */
  disarmedSprite(typeId: UnitTypeId): CanvasImageSource | null {
    // Prefer the sheet drawn without the weapon; failing that, the last frame
    // of the armed swing, which is the moment after the axe has left.
    const own = this.variantFrames(typeId, '-disarmed');
    const frames = own ?? this.variantFrames(typeId, '');
    return frames && frames.length > 0 ? frames[frames.length - 1] : null;
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
  /**
   * The eight land specials, one per terrain, keyed by the terrain they sit on.
   *
   * Anything missing simply never lands in the map and the caller falls back to
   * the drawn diamond, so a partial set is fine -- which matters because these
   * were written up in ART_PROMPTS.md long before all eight existed.
   */
  installSpecialArt(
    into: Map<TerrainId, HTMLImageElement>,
    ids: TerrainId[],
    onLoaded?: () => void,
  ): void {
    for (const id of ids) {
      loadImage(`${this.base}specials/${id}.png`)
        .then((img) => {
          into.set(id, img);
          onLoaded?.();
        })
        .catch(() => {});
    }
  }

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
