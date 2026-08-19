import type { Camera } from './camera';

/**
 * Transient animations played over the map: a fireball, an arrow in flight, a
 * sapper going off.
 *
 * Purely cosmetic. Nothing here can affect the simulation, and an effect that
 * never gets drawn — because its art is missing, or because it happened in fog
 * — changes nothing about the game. That matters more than it sounds: these
 * are spawned from the log, which is replayed after the AI has taken its turn,
 * so a dozen can be queued at once for events the viewer may not even be able
 * to see.
 */

/** One frame's edge in the source strip. Matches tools/prepare_art.py. */
const FRAME = 64;

/** How long an effect that lands in one place plays for, in seconds. */
const IMPACT_SECONDS = 0.45;
/** How long a thrown thing takes to cross one tile. */
const TRAVEL_SECONDS = 0.12;

export type EffectId =
  // A settlement coming apart, by faction and size tier.
  | 'razed-orc-1'
  | 'razed-orc-4'
  | 'razed-orc-8'
  | 'razed-human-1'
  | 'razed-human-4'
  | 'razed-human-8'
  | 'arrow'
  | 'axe'
  | 'bolt'
  | 'clash'
  | 'death-touch'
  | 'demolish'
  | 'dragonfire'
  | 'explosion'
  | 'heal'
  | 'magic';

export interface EffectOptions {
  /**
   * Where it ends up. Given a start tile as well, the effect travels from one
   * to the other and turns to face the way it is going, which is what makes a
   * thrown axe read as thrown rather than as an axe appearing.
   */
  from?: { x: number; y: number };
  /** Multiplier on tile size. A dragon's breath wants to be bigger than a heal. */
  scale?: number;
  /** Seconds. Defaults to a fixed impact time, or to the distance travelled. */
  duration?: number;
  /** Held back this long before it starts, so a volley does not fire as one. */
  delay?: number;
}

interface Live {
  id: EffectId;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  travels: boolean;
  scale: number;
  duration: number;
  elapsed: number;
}

/**
 * Which frame is showing, given how far through the effect we are.
 *
 * Clamped rather than wrapped: these play once and stop. Wrapping would make a
 * dying explosion start over for a frame before it was culled.
 */
export function frameAt(elapsed: number, duration: number, frames: number): number {
  if (frames <= 1 || duration <= 0) return 0;
  const t = Math.min(0.999999, Math.max(0, elapsed / duration));
  return Math.min(frames - 1, Math.floor(t * frames));
}

export class EffectLayer {
  private live: Live[] = [];
  private sheets = new Map<EffectId, HTMLImageElement | null>();
  private readonly base: string;

  constructor(baseUrl: string = import.meta.env.BASE_URL) {
    this.base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  /** True while anything is still playing, so the caller can wait it out. */
  get busy(): boolean {
    return this.live.length > 0;
  }

  clear(): void {
    this.live.length = 0;
  }

  spawn(id: EffectId, x: number, y: number, opts: EffectOptions = {}): void {
    this.load(id);
    const from = opts.from;
    const travels = from !== undefined && (from.x !== x || from.y !== y);
    const distance = travels ? Math.hypot(x - from!.x, y - from!.y) : 0;
    const duration =
      opts.duration ?? (travels ? Math.max(0.1, distance * TRAVEL_SECONDS) : IMPACT_SECONDS);

    this.live.push({
      id,
      x,
      y,
      fromX: from?.x ?? x,
      fromY: from?.y ?? y,
      travels,
      scale: opts.scale ?? 1,
      duration,
      // A delay is just a head start in the negative, which keeps the update
      // loop to one rule instead of a separate pending list.
      elapsed: -(opts.delay ?? 0),
    });
  }

  update(dt: number): void {
    for (const e of this.live) e.elapsed += dt;
    this.live = this.live.filter((e) => e.elapsed < e.duration);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (this.live.length === 0) return;
    const size = cam.tileSize;

    for (const e of this.live) {
      if (e.elapsed < 0) continue;
      const sheet = this.sheets.get(e.id);
      if (!sheet) continue;

      const frames = Math.max(1, Math.round(sheet.width / sheet.height));
      const frame = frameAt(e.elapsed, e.duration, frames);
      const t = Math.min(1, e.elapsed / e.duration);

      // A travelling effect is at its target only at the end; a stationary one
      // is where it was put for the whole of its life.
      const tx = e.travels ? e.fromX + (e.x - e.fromX) * t : e.x;
      const ty = e.travels ? e.fromY + (e.y - e.fromY) * t : e.y;
      const p = cam.tileToScreen(tx, ty);
      const drawn = size * e.scale;
      const cx = p.x + size / 2;
      const cy = p.y + size / 2;

      ctx.save();
      ctx.translate(cx, cy);
      if (e.travels) ctx.rotate(Math.atan2(e.y - e.fromY, e.x - e.fromX));
      ctx.drawImage(
        sheet,
        frame * FRAME,
        0,
        FRAME,
        FRAME,
        -drawn / 2,
        -drawn / 2,
        drawn,
        drawn,
      );
      ctx.restore();
    }
  }

  /**
   * Fetch a strip once, remembering failures as well as successes so a missing
   * file is not re-requested every time something explodes.
   */
  private load(id: EffectId): void {
    if (this.sheets.has(id)) return;
    this.sheets.set(id, null);
    const img = new Image();
    img.onload = () => this.sheets.set(id, img);
    img.src = `${this.base}effects/${id}.png`;
  }
}
