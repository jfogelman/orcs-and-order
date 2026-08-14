import { idx } from '../engine/grid';
import { FACTIONS } from '../model/factions';
import { TERRAIN_IDS } from '../model/terrain';
import { unitType } from '../model/units';
import type { City, GameState, Unit } from '../model/types';
import { Camera } from './camera';
import { SpriteCache } from './spriteCache';
import { buildSpecialIcon, buildTerrainTiles } from './tileArt';
import type { TerrainTileSet } from './tileArt';
import { TerrainLayer } from './terrainLayer';

export interface MapOverlay {
  selectedUnitId: number | null;
  hover: { x: number; y: number } | null;
  /** Tile indices the selected unit could reach this turn. */
  reachable: Set<number> | null;
  /** Tiles the selected unit could attack right now. */
  attacks: Set<number> | null;
  /** Preview of the route to the hovered tile. */
  path: Array<[number, number]> | null;
  /** The selected unit's standing march order, if it has one. */
  gotoPath: Array<[number, number]> | null;
  /** Tiles worked by the city currently open, drawn as a highlight ring. */
  workRing: Set<number> | null;
  showGrid: boolean;
}

export const EMPTY_OVERLAY: MapOverlay = {
  selectedUnitId: null,
  hover: null,
  reachable: null,
  attacks: null,
  path: null,
  gotoPath: null,
  workRing: null,
  showGrid: true,
};

const VOID_COLOR = '#0a0806';

export class MapRenderer {
  private tiles: TerrainTileSet;
  private specialIcon: HTMLCanvasElement;
  readonly sprites: SpriteCache;
  /** Advances every frame; drives the selection pulse. */
  private clock = 0;
  private layer: TerrainLayer | null = null;
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
      this.drawUnit(ctx, state, u, cam, overlay.selectedUnitId === u.id);
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
    if (overlay.gotoPath && overlay.gotoPath.length > 1) {
      this.drawRoute(ctx, cam, overlay.gotoPath, 'rgba(140,215,255,0.85)', false);
      const end = overlay.gotoPath[overlay.gotoPath.length - 1];
      const s = cam.tileToScreen(end[0], end[1]);
      ctx.strokeStyle = 'rgba(140,215,255,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x + size / 2, s.y + size / 2, size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (overlay.path && overlay.path.length > 1) {
      this.drawRoute(ctx, cam, overlay.path, 'rgba(255,240,180,0.9)', true);
    }

    // --- hover cursor ----------------------------------------------------
    if (overlay.hover) {
      const s = cam.tileToScreen(overlay.hover.x, overlay.hover.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 1, s.y + 1, size - 2, size - 2);
    }
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

  // ------------------------------------------------------------- pieces

  private drawCity(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    c: City,
    cam: Camera,
  ): void {
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
  ): void {
    const type = unitType(u.type);
    const owner = state.players[u.owner];
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
      this.sprites.unit(u.type),
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

    if (size >= 28) {
      // Count badge: the sprite already shows the crowd, this confirms it.
      if (type.count > 1) {
        const bw = size * 0.3;
        ctx.fillStyle = 'rgba(12,10,8,0.85)';
        ctx.fillRect(s.x + size - bw - 1, s.y + size - bw - 1, bw, bw);
        ctx.strokeStyle = owner.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x + size - bw - 1, s.y + size - bw - 1, bw, bw);
        ctx.fillStyle = '#f2e6c8';
        ctx.font = `bold ${Math.round(bw * 0.78)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(type.count), s.x + size - bw / 2 - 1, s.y + size - bw / 2);
      }
      if (u.veteran) {
        ctx.fillStyle = '#f0c64a';
        ctx.font = `bold ${Math.round(size * 0.26)}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('*', s.x + 2, s.y + size * 0.55);
      }
      if (u.order === 'fortified') {
        ctx.strokeStyle = 'rgba(240,230,200,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x + 3, s.y + 3, size - 6, size - 6);
      }
    }
  }
}
