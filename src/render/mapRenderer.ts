import { fatCrossIndices, idx } from '../engine/grid';
import { FACTIONS } from '../model/factions';
import { TERRAIN_IDS } from '../model/terrain';
import { aliveCount, unitType } from '../model/units';
import type { City, GameState, Unit } from '../model/types';
import { Camera } from './camera';
import { SpriteCache } from './spriteCache';
import { buildSpecialIcon, buildTerrainTiles } from './tileArt';
import type { TerrainTileSet } from './tileArt';
import { garrisonOf, capitalOf, inSupply } from '../sim/city';
import { TerrainLayer } from './terrainLayer';
import { UnitAnimator } from './unitAnimator';

/**
 * A planned route, split at the point this turn's movement runs out. Drawn in
 * two colours so "how far do I get now" is readable at a glance rather than
 * something to be counted out tile by tile.
 */
export interface RoutePreview {
  tiles: Array<[number, number]>;
  /** Index one past the last tile reachable this turn. */
  thisTurn: number;
  /** Whole turns the whole march will take. */
  turns: number;
}

export interface MapOverlay {
  selectedUnitId: number | null;
  hover: { x: number; y: number } | null;
  /** Tile indices the selected unit could reach this turn. */
  reachable: Set<number> | null;
  /** Tiles the selected unit could attack right now. */
  attacks: Set<number> | null;
  /**
   * Tiles holding a legal target for the ability the selected unit has armed.
   * Distinct from `attacks`, which is what a normal move would pick a fight
   * with — these are picked deliberately and nothing else on the map is
   * clickable while they are showing.
   */
  targets: Set<number> | null;
  /** Preview of the route to the hovered tile. */
  path: RoutePreview | null;
  /** The selected unit's standing march order, if it has one. */
  gotoPath: RoutePreview | null;
  /** Tiles worked by the city currently open, drawn as a highlight ring. */
  workRing: Set<number> | null;
  showGrid: boolean;
}

export const EMPTY_OVERLAY: MapOverlay = {
  selectedUnitId: null,
  hover: null,
  reachable: null,
  attacks: null,
  targets: null,
  path: null,
  gotoPath: null,
  workRing: null,
  showGrid: true,
};

const VOID_COLOR = '#0a0806';

/**
 * Share of maximum health at which a unit starts to look it.
 *
 * Purely cosmetic -- nothing in the rules changes at these numbers. The health
 * bar already carries the exact figure; this is so a battered army reads as
 * battered at a glance, without counting bars.
 */
const HURT_LEVELS = { hurt: 0.5, dying: 0.1 } as const;

export class MapRenderer {
  private tiles: TerrainTileSet;
  private specialIcon: HTMLCanvasElement;
  readonly sprites: SpriteCache;
  /** Advances every frame; drives the selection pulse. */
  private clock = 0;
  private layer: TerrainLayer | null = null;
  /** Which units are mid-swing. Purely visual; never touches game state. */
  readonly animator = new UnitAnimator();
  /** Last seen disarmed state per unit, to spot the moment it changes back. */
  private wasDisarmed = new Map<number, boolean>();
  /** Last seen health per unit, to spot the moment it goes up. */
  private wasHp = new Map<number, number>();
  private rebuildTimer: number | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    sprites?: SpriteCache,
  ) {
    this.tiles = buildTerrainTiles();
    this.specialIcon = buildSpecialIcon();
    this.sprites = sprites ?? new SpriteCache();
    // Procedural tiles render immediately; real ones replace them as they load,
    // at which point the pre-rendered map has to be built again.
    this.sprites.installTerrainArt(this.tiles, TERRAIN_IDS, () => this.invalidateLayerSoon());
  }

  private ctx(): CanvasRenderingContext2D {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    return ctx;
  }

  /** Rebuild the pre-rendered terrain when the map underneath it changes. */
  private ensureLayer(state: GameState): void {
    const key = TerrainLayer.keyFor(state);
    if (this.layer && this.layer.key === key) return;
    this.layer = TerrainLayer.build(state, this.tiles, this.specialIcon);
  }

  /**
   * Terrain art arrives asynchronously, so the layer has to be rebuilt once it
   * lands. Debounced, because otherwise thirty-odd image loads would each
   * trigger a full re-render of the map.
   */
  private invalidateLayerSoon(): void {
    if (this.rebuildTimer !== null) window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.layer = null;
    }, 250);
  }

  /**
   * Copy the visible slice of the pre-rendered map onto the screen.
   *
   * The source rectangle is snapped to whole layer pixels and the remainder
   * paid back as a fractional destination offset; sampling on half-pixels with
   * smoothing disabled makes the whole map shimmer while panning.
   */
  private blitTerrain(ctx: CanvasRenderingContext2D, cam: Camera): void {
    const layer = this.layer;
    if (!layer) return;
    const zoom = cam.zoom;

    const originX = Math.floor(cam.x);
    const originY = Math.floor(cam.y);
    const fracX = cam.x - originX;
    const fracY = cam.y - originY;

    let srcX = originX;
    let srcY = originY;
    let srcW = Math.ceil(cam.viewportW / zoom + fracX);
    let srcH = Math.ceil(cam.viewportH / zoom + fracY);
    let dstX = -fracX * zoom;
    let dstY = -fracY * zoom;

    // A world smaller than the viewport leaves the camera outside the layer.
    if (srcX < 0) {
      dstX += -srcX * zoom;
      srcW += srcX;
      srcX = 0;
    }
    if (srcY < 0) {
      dstY += -srcY * zoom;
      srcH += srcY;
      srcY = 0;
    }
    srcW = Math.min(srcW, layer.canvas.width - srcX);
    srcH = Math.min(srcH, layer.canvas.height - srcY);
    if (srcW <= 0 || srcH <= 0) return;

    ctx.drawImage(
      layer.canvas,
      srcX,
      srcY,
      srcW,
      srcH,
      dstX,
      dstY,
      srcW * zoom,
      srcH * zoom,
    );
  }

  draw(state: GameState, viewerId: number, cam: Camera, overlay: MapOverlay, dt: number): void {
    this.clock += dt;
    this.animator.update(dt);
    const ctx = this.ctx();
    const viewer = state.players[viewerId];
    const { x0, y0, x1, y1 } = cam.visibleTileRange();
    const size = cam.tileSize;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = VOID_COLOR;
    ctx.fillRect(0, 0, cam.viewportW, cam.viewportH);

    // --- terrain ---------------------------------------------------------
    // One blit of a pre-rendered, edge-blended map rather than a loop over
    // every visible tile. Unexplored ground is painted back out under fog.
    this.ensureLayer(state);
    this.blitTerrain(ctx, cam);

    // --- grid ------------------------------------------------------------
    if (overlay.showGrid && size >= 24) {
      // Light touch: now that terrain feathers across tile boundaries, a strong
      // grid is the only hard edge left and undoes the effect.
      ctx.strokeStyle = 'rgba(0,0,0,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 1; x++) {
        const sx = Math.round(cam.tileToScreen(x, 0).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, cam.viewportH);
      }
      for (let y = y0; y <= y1 + 1; y++) {
        const sy = Math.round(cam.tileToScreen(0, y).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(cam.viewportW, sy);
      }
      ctx.stroke();
    }

    // --- movement / attack overlays -------------------------------------
    if (overlay.reachable) {
      ctx.fillStyle = 'rgba(120,220,255,0.16)';
      for (const i of overlay.reachable) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const s = cam.tileToScreen(x, y);
        ctx.fillRect(s.x, s.y, size, size);
      }
    }
    if (overlay.attacks) {
      ctx.fillStyle = 'rgba(230,70,50,0.28)';
      for (const i of overlay.attacks) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const s = cam.tileToScreen(x, y);
        ctx.fillRect(s.x, s.y, size, size);
      }
    }

    // A pulsing reticle on everything the armed ability could be aimed at. It
    // moves, because these appear over units that are already drawn and a
    // static outline reads as part of the sprite.
    if (overlay.targets && overlay.targets.size > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(this.clock * 6);
      ctx.save();
      ctx.strokeStyle = `rgba(255,214,120,${pulse.toFixed(3)})`;
      ctx.lineWidth = Math.max(2, size / 14);
      const inset = size * 0.16;
      const arm = size * 0.22;
      for (const i of overlay.targets) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const s = cam.tileToScreen(x, y);
        const l = s.x + inset;
        const r = s.x + size - inset;
        const t = s.y + inset;
        const b = s.y + size - inset;
        ctx.beginPath();
        // Four corner brackets rather than a full box, so the unit underneath
        // stays readable.
        ctx.moveTo(l, t + arm); ctx.lineTo(l, t); ctx.lineTo(l + arm, t);
        ctx.moveTo(r - arm, t); ctx.lineTo(r, t); ctx.lineTo(r, t + arm);
        ctx.moveTo(r, b - arm); ctx.lineTo(r, b); ctx.lineTo(r - arm, b);
        ctx.moveTo(l + arm, b); ctx.lineTo(l, b); ctx.lineTo(l, b - arm);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (overlay.workRing) {
      ctx.strokeStyle = 'rgba(255,215,120,0.7)';
      ctx.lineWidth = 2;
      for (const i of overlay.workRing) {
        const x = i % state.width;
        const y = Math.floor(i / state.width);
        const s = cam.tileToScreen(x, y);
        ctx.strokeRect(s.x + 2, s.y + 2, size - 4, size - 4);
      }
    }

    // --- our borders -----------------------------------------------------
    // The outline around everything our cities claim, drawn as one perimeter
    // rather than a box per tile. Per-tile borders were the first attempt and
    // were the wrong idea twice over: at a hairline they vanished into the
    // terrain, and even visible they drew the *grid* rather than the shape,
    // which is the thing you actually need in order to see where a new city
    // would overlap an old one.
    //
    // The claim is the fat cross -- the ground a city can work -- not the tiles
    // it happens to be working today. Those change every time it grows, and a
    // border that moves as citizens are reassigned is not a border.
    //
    // Ours only. An enemy's would say how much ground they hold and exactly
    // where their cities sit, which is a great deal more than seeing one city
    // tells you.
    const claimed = new Set<number>();
    for (const c of state.cities) {
      if (c.owner !== viewerId) continue;
      for (const i of fatCrossIndices(c.x, c.y, state.width, state.height)) claimed.add(i);
    }
    if (claimed.size > 0) {
      // Drawn twice: a dark line underneath, then the colour on top. The map
      // runs from near-black water to pale sand, and a single mid-tone line
      // disappears against one end or the other.
      const edges: Array<[number, number, number, number]> = [];
      for (const i of claimed) {
        const tx = i % state.width;
        const ty = Math.floor(i / state.width);
        if (tx < x0 - 1 || tx > x1 + 1 || ty < y0 - 1 || ty > y1 + 1) continue;
        const p = cam.tileToScreen(tx, ty);
        const has = (nx: number, ny: number) =>
          nx >= 0 && ny >= 0 && nx < state.width && ny < state.height &&
          claimed.has(idx(nx, ny, state.width));
        if (!has(tx, ty - 1)) edges.push([p.x, p.y, p.x + size, p.y]);
        if (!has(tx, ty + 1)) edges.push([p.x, p.y + size, p.x + size, p.y + size]);
        if (!has(tx - 1, ty)) edges.push([p.x, p.y, p.x, p.y + size]);
        if (!has(tx + 1, ty)) edges.push([p.x + size, p.y, p.x + size, p.y + size]);
      }
      const stroke = (colour: string, width: number, alpha: number) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (const [ax, ay, bx, by] of edges) {
          ctx.moveTo(Math.round(ax) + 0.5, Math.round(ay) + 0.5);
          ctx.lineTo(Math.round(bx) + 0.5, Math.round(by) + 0.5);
        }
        ctx.stroke();
      };
      ctx.save();
      stroke('#000000', 4, 0.45);
      stroke(state.players[viewerId].color, 2, 0.95);
      ctx.restore();
    }

    // --- cities ----------------------------------------------------------
    for (const c of state.cities) {
      const i = idx(c.x, c.y, state.width);
      if (!viewer.explored[i]) continue;
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      this.drawCity(ctx, state, c, cam);
    }

    // --- units -----------------------------------------------------------
    for (const u of state.units) {
      const i = idx(u.x, u.y, state.width);
      if (!viewer.visible[i]) continue;
      if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
      // A unit resting inside its own city is drawn as a mark on the city
      // rather than on top of it -- what the player is thinking about at that
      // tile is the city. The selected one still draws itself, so choosing a
      // garrison member from the panel shows you which one you picked.
      if (overlay.selectedUnitId !== u.id && this.restingInCity(state, u)) continue;
      this.drawUnit(ctx, state, u, cam, overlay.selectedUnitId === u.id, viewerId);
    }

    // --- fog of war ------------------------------------------------------
    // Unexplored ground is painted out solid; explored-but-unseen is dimmed.
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = idx(x, y, state.width);
        if (viewer.visible[i]) continue;
        const s = cam.tileToScreen(x, y);
        ctx.fillStyle = viewer.explored[i] ? 'rgba(4,6,10,0.5)' : VOID_COLOR;
        ctx.fillRect(s.x, s.y, Math.ceil(size), Math.ceil(size));
      }
    }

    // --- march orders and path preview -----------------------------------
    // The standing order is a solid line the unit will actually walk; the
    // hover preview is dashed, because it is only a proposal.
    if (overlay.gotoPath) {
      this.drawPreview(ctx, cam, overlay.gotoPath, '140,215,255', false);
    }
    if (overlay.path) {
      this.drawPreview(ctx, cam, overlay.path, '255,240,180', true);
    }

    // --- hover cursor ----------------------------------------------------
    if (overlay.hover) {
      const s = cam.tileToScreen(overlay.hover.x, overlay.hover.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 1, s.y + 1, size - 2, size - 2);
    }
  }

  /**
   * Draw a route in two tones: solid for the part walked this turn, faded for
   * everything beyond it, with the number of turns marked at the destination.
   */
  private drawPreview(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    preview: RoutePreview,
    rgb: string,
    dashed: boolean,
  ): void {
    const { tiles, thisTurn, turns } = preview;
    if (tiles.length < 2) return;
    const size = cam.tileSize;

    if (thisTurn < tiles.length) {
      // The later legs first, so this turn's segment draws over the join.
      this.drawRoute(ctx, cam, tiles.slice(thisTurn - 1), `rgba(${rgb},0.32)`, dashed);
    }
    this.drawRoute(ctx, cam, tiles.slice(0, thisTurn), `rgba(${rgb},0.95)`, dashed);

    const end = tiles[tiles.length - 1];
    const s = cam.tileToScreen(end[0], end[1]);
    ctx.strokeStyle = `rgba(${rgb},0.95)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x + size / 2, s.y + size / 2, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();

    if (turns > 1 && size >= 24) {
      const label = `${turns}`;
      ctx.font = `bold ${Math.round(size * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(12,10,8,0.85)';
      ctx.beginPath();
      ctx.arc(s.x + size / 2, s.y + size / 2, size * 0.19, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${rgb},1)`;
      ctx.fillText(label, s.x + size / 2, s.y + size / 2 + 1);
    }
  }

  /**
   * Which picture this unit should be showing right now.
   *
   * Three states, in order of precedence: mid-swing, having thrown its weapon,
   * or standing there. The disarmed pose is the last frame of the unit's own
   * attack -- the moment after the axe has left -- so it can never disagree
   * with the animation it came from.
   *
   * Every branch falls back to the idle sprite, so a creature with no
   * animation art simply never animates rather than disappearing.
   */
  private spriteFor(u: Unit): CanvasImageSource {
    const playing = this.animator.playingFor(u.id);
    if (playing) {
      const frames =
        playing.kind === 'rearm'
          ? this.sprites.rearmFrames(u.type)
          : playing.kind === 'regen'
            ? this.sprites.regenFrames(u.type)
            : // A thrower that has thrown swings with nothing in its hand.
              this.sprites.attackFrames(u.type, u.disarmed);
      if (frames && frames[playing.frame]) return frames[playing.frame];
    }
    // Standing still, health decides how it looks. Checked before the
    // disarmed pose, since a dying axethrower is more usefully drawn as dying
    // than as short of an axe.
    const share = u.hp / Math.max(1, unitType(u.type).hp);
    if (share < HURT_LEVELS.hurt) {
      const frames = this.sprites.hurtFrames(u.type, u.disarmed);
      if (frames && frames.length > 0) {
        const worst = frames.length - 1;
        return share < HURT_LEVELS.dying ? frames[worst] : frames[0];
      }
    }
    if (u.disarmed) {
      const thrown = this.sprites.disarmedSprite(u.type);
      if (thrown) return thrown;
    }
    return this.sprites.unit(u.type);
  }

  /**
   * Catch the moment a thrower gets its weapon back and hold the pose.
   *
   * Watched here rather than triggered from the rules, because the rules would
   * have to reach into the renderer to say so -- and this way it fires for the
   * enemy's units too, which the player can see happen. First sighting of a
   * unit never counts as a change, or every unit would salute on appearing.
   */
  /**
   * Catch a creature healing and show it happening.
   *
   * Watched rather than triggered from the rules, the same as the rearm pose,
   * so it fires for the enemy's units too and `sim/` learns nothing new. Only
   * creatures with the art animate, which today is trolls alone -- so this
   * needs no rule about who regenerates visibly.
   *
   * First sighting never counts: a unit walking out of the fog at full health
   * has not just healed, it has merely been seen.
   */
  private noticeRegen(u: Unit): void {
    const was = this.wasHp.get(u.id);
    this.wasHp.set(u.id, u.hp);
    if (was === undefined || u.hp <= was) return;
    const frames = this.sprites.regenFrames(u.type);
    if (frames) this.animator.regen(u.id, frames.length);
  }

  private noticeRearm(u: Unit): void {
    const was = this.wasDisarmed.get(u.id);
    this.wasDisarmed.set(u.id, u.disarmed);
    if (was !== true || u.disarmed) return;
    const frames = this.sprites.rearmFrames(u.type);
    if (frames) this.animator.rearm(u.id, frames.length);
  }

  private drawRoute(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    route: Array<[number, number]>,
    color: string,
    dashed: boolean,
  ): void {
    const size = cam.tileSize;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size / 14);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([size / 5, size / 6]);
    ctx.beginPath();
    route.forEach(([px, py], n) => {
      const s = cam.tileToScreen(px, py);
      const cx = s.x + size / 2;
      const cy = s.y + size / 2;
      if (n === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** True for a unit tucked up inside a city of its own. */
  private restingInCity(state: GameState, u: Unit): boolean {
    if (u.order !== 'fortified' && u.order !== 'sentry') return false;
    const here = state.cities.find((c) => c.x === u.x && c.y === u.y);
    return !!here && here.owner === u.owner;
  }

  // ------------------------------------------------------------- pieces

  private drawCity(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    c: City,
    cam: Camera,
  ): void {
    // The capital wears a small crown. It is the one city whose loss moves
    // the supply network, so it is worth being able to find at a glance.
    const seat = capitalOf(state, c.owner);
    const isCapital = seat?.id === c.id;
    const owner = state.players[c.owner];
    const faction = FACTIONS[owner.faction];
    const s = cam.tileToScreen(c.x, c.y);
    const size = cam.tileSize;
    const sprite = this.sprites.city(owner.faction, owner.color, faction.shade, c.size);
    ctx.drawImage(sprite, Math.round(s.x), Math.round(s.y), Math.ceil(size), Math.ceil(size));

    // Size badge, so the map reads without opening anything.
    const r = Math.max(6, size * 0.17);
    ctx.fillStyle = 'rgba(12,10,8,0.85)';
    ctx.beginPath();
    ctx.arc(s.x + r + 2, s.y + r + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = owner.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f2e6c8';
    ctx.font = `bold ${Math.round(r * 1.3)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.size), s.x + r + 2, s.y + r + 3);

    // How many are tucked up inside. A garrison you cannot see at all is how a
    // player loses a city they were sure was defended, so hiding the units
    // only works if the city says how many it is holding.
    const garrison = garrisonOf(state, c).length;
    if (garrison > 0 && size >= 24) {
      const gr = Math.max(5, size * 0.15);
      const gx = s.x + size - gr - 2;
      const gy = s.y + size - gr - 2;
      ctx.fillStyle = 'rgba(12,10,8,0.85)';
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c8b48a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#f2e6c8';
      ctx.font = `bold ${Math.round(gr * 1.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(garrison), gx, gy + 1);
    }

    // A crown on the capital, opposite the size badge.
    if (isCapital) {
      const cr = Math.max(5, size * 0.15);
      const cx = s.x + size - cr - 3;
      const cy = s.y + cr + 3;
      ctx.fillStyle = 'rgba(12,10,8,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f0c64a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Three points and a base: legible at a dozen pixels where a glyph is not.
      ctx.fillStyle = '#f0c64a';
      ctx.beginPath();
      ctx.moveTo(cx - cr * 0.55, cy + cr * 0.4);
      ctx.lineTo(cx - cr * 0.55, cy - cr * 0.35);
      ctx.lineTo(cx - cr * 0.2, cy + cr * 0.05);
      ctx.lineTo(cx, cy - cr * 0.5);
      ctx.lineTo(cx + cr * 0.2, cy + cr * 0.05);
      ctx.lineTo(cx + cr * 0.55, cy - cr * 0.35);
      ctx.lineTo(cx + cr * 0.55, cy + cr * 0.4);
      ctx.closePath();
      ctx.fill();
    }

    if (size >= 40) {
      ctx.font = `${Math.round(size * 0.22)}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const label = c.name;
      const w = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(12,10,8,0.72)';
      ctx.fillRect(s.x + size / 2 - w / 2 - 3, s.y + size - 2, w + 6, size * 0.26);
      ctx.fillStyle = '#f2e6c8';
      ctx.fillText(label, s.x + size / 2, s.y + size - 1);
    }
  }

  private drawUnit(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    u: Unit,
    cam: Camera,
    selected: boolean,
    viewerId: number,
  ): void {
    const type = unitType(u.type);
    const owner = state.players[u.owner];
    this.noticeRearm(u);
    this.noticeRegen(u);
    const s = cam.tileToScreen(u.x, u.y);
    const size = cam.tileSize;
    const onCity = state.cities.some((c) => c.x === u.x && c.y === u.y);
    // Nudge garrisons down so the town behind them stays visible.
    const yOff = onCity ? size * 0.14 : 0;

    // A goblin should not tower over an orc just because both sprites fill the
    // same frame. The disc follows the same scaling, but only partly, so small
    // units keep a disc big enough to read.
    const art = type.artScale;
    const discScale = 0.82 + 0.18 * art;

    // Owner disc at the feet. This carries almost all of the faction
    // identification, so it is filled rather than outlined — a green orc on
    // green grass is otherwise very hard to pick out at a glance.
    ctx.save();
    ctx.translate(s.x + size / 2, s.y + size * 0.87 + yOff);
    ctx.scale(1, 0.4);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.33 * discScale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,8,6,0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.29 * discScale, 0, Math.PI * 2);
    ctx.fillStyle = owner.color;
    ctx.globalAlpha = 0.72;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (selected) {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.35 * discScale, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(255,244,190,${0.55 + 0.4 * Math.sin(this.clock * 6)})`;
      ctx.stroke();
    }
    ctx.restore();

    // Scaled about the bottom edge, so every unit's feet stay on its disc
    // however tall it is drawn.
    const drawSize = size * art;
    ctx.drawImage(
      this.spriteFor(u),
      Math.round(s.x + (size - drawSize) / 2),
      Math.round(s.y + (size - drawSize) + yOff),
      Math.ceil(drawSize),
      Math.ceil(drawSize),
    );

    // Health bar, only when it matters.
    if (u.hp < type.hp) {
      const w = size * 0.7;
      const h = Math.max(3, size * 0.07);
      const bx = s.x + (size - w) / 2;
      const by = s.y + size * 0.06;
      const frac = Math.max(0, u.hp / type.hp);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = frac > 0.6 ? '#5fbf4a' : frac > 0.3 ? '#d8b13a' : '#c9432c';
      ctx.fillRect(bx, by, w * frac, h);
    }

    // Conditions the unit is under, drawn over the sprite. The overlays are
    // hollow through the middle on purpose, so the creature underneath stays
    // identifiable -- a burning orc you cannot recognise as an orc is worse
    // than no overlay at all.
    //
    // The last turn shows a guttering version, which is the only way the map
    // can say how much longer a condition has left to run.
    for (const st of u.statuses ?? []) {
      if (st.kind === 'spent') continue;
      const sheet = this.sprites.statusOverlay(st.kind, st.turns <= 1);
      if (!sheet || sheet.height === 0) continue;
      const frames = Math.max(1, Math.round(sheet.width / sheet.height));
      // Wall-clock, because this is decoration: it must never reach the
      // simulation, and a replay that drew a different frame is the same game.
      const frame = frames === 1 ? 0 : Math.floor(performance.now() / 130) % frames;
      const f = sheet.height;
      ctx.drawImage(sheet, frame * f, 0, f, f, s.x, s.y, size, size);
    }

    if (size >= 28) {
      // Count badge: how many are still standing, not how many set out. A
      // wounded Ten Orcs fights as the number shown here, so the number has to
      // be the live one or the badge would be quietly lying about the odds.
      if (type.count > 1) {
        const alive = aliveCount(u);
        const bw = size * 0.3;
        ctx.fillStyle = 'rgba(12,10,8,0.85)';
        ctx.fillRect(s.x + size - bw - 1, s.y + size - bw - 1, bw, bw);
        ctx.strokeStyle = alive < type.count ? '#c8503c' : owner.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x + size - bw - 1, s.y + size - bw - 1, bw, bw);
        ctx.fillStyle = alive < type.count ? '#f0b8a8' : '#f2e6c8';
        ctx.font = `bold ${Math.round(bw * 0.78)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(alive), s.x + size - bw / 2 - 1, s.y + size - bw / 2);
      }
      // Rank badge, in place of the drawn asterisk this used to be. Sits at
      // the bottom-left so it does not collide with the count badge on the
      // right or the out-of-supply mark at the top.
      if (u.rank > 0) {
        const mark = this.sprites.promotionMark(owner.faction, u.rank);
        if (mark) {
          const m = size * 0.42;
          ctx.drawImage(mark, Math.round(s.x + 1), Math.round(s.y + size - m - 1), m, m);
        }
      }
      // Spent is a corner badge rather than an overlay, because unlike the
      // other three it only ever lands on one kind of creature -- which makes
      // it the one thing worth spending the last free corner on.
      if ((u.statuses ?? []).some((st) => st.kind === 'spent')) {
        const mark = this.sprites.statusOverlay('spent', false);
        if (mark) {
          const m = size * 0.34;
          ctx.drawImage(mark, Math.round(s.x + 1), Math.round(s.y + 1), m, m);
        }
      }
      // A disarmed thrower fights at a quarter strength, which without a mark
      // on the map looks exactly like the unit being broken.
      if (u.disarmed) {
        const r = size * 0.15;
        const cx = s.x + size - r - 2;
        const cy = s.y + r + 2;
        ctx.fillStyle = 'rgba(20,16,12,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e0603c';
        ctx.lineWidth = Math.max(1.5, size / 22);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.5, cy + r * 0.5);
        ctx.moveTo(cx + r * 0.5, cy - r * 0.5);
        ctx.lineTo(cx - r * 0.5, cy + r * 0.5);
        ctx.stroke();
      }
      // Out of supply. Marked because a unit quietly fighting at 60% and
      // never healing is indistinguishable from one that is simply losing.
      if (u.owner === viewerId && !inSupply(state, u)) {
        const r = size * 0.15;
        const cx = s.x + r + 2;
        const cy = s.y + r + 2;
        ctx.fillStyle = 'rgba(20,16,12,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8b23c';
        ctx.font = `bold ${Math.round(r * 1.5)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy + 1);
      }
      if (u.order === 'fortified') {
        ctx.strokeStyle = 'rgba(240,230,200,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x + 3, s.y + 3, size - 6, size - 6);
      }
    }
  }
}
