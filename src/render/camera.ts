/** Native size of an authored tile, in pixels. */
export const TILE = 32;

export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4] as const;

/**
 * Maps between world pixels and screen pixels.
 *
 * The camera stores its position in *world* pixels (map space at zoom 1) so
 * that zooming about the cursor is a simple arithmetic adjustment rather than
 * a matrix stack.
 */
export class Camera {
  /** Top-left corner of the view, in world pixels. */
  x = 0;
  y = 0;
  zoomIndex = 2;
  viewportW = 800;
  viewportH = 600;

  constructor(
    private mapWidth: number,
    private mapHeight: number,
  ) {}

  get zoom(): number {
    return ZOOM_LEVELS[this.zoomIndex];
  }

  /** On-screen size of one tile. */
  get tileSize(): number {
    return TILE * this.zoom;
  }

  get worldPixelWidth(): number {
    return this.mapWidth * TILE;
  }

  get worldPixelHeight(): number {
    return this.mapHeight * TILE;
  }

  setMapSize(w: number, h: number): void {
    this.mapWidth = w;
    this.mapHeight = h;
    this.clamp();
  }

  setViewport(w: number, h: number): void {
    this.viewportW = w;
    this.viewportH = h;
    this.clamp();
  }

  /**
   * Keep the view inside the world. When the world is smaller than the
   * viewport on an axis, centre it on that axis instead.
   */
  clamp(): void {
    const visW = this.viewportW / this.zoom;
    const visH = this.viewportH / this.zoom;
    const maxX = this.worldPixelWidth - visW;
    const maxY = this.worldPixelHeight - visH;
    this.x = maxX <= 0 ? maxX / 2 : Math.min(Math.max(this.x, 0), maxX);
    this.y = maxY <= 0 ? maxY / 2 : Math.min(Math.max(this.y, 0), maxY);
  }

  panByScreen(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  centerOnTile(tx: number, ty: number): void {
    this.x = (tx + 0.5) * TILE - this.viewportW / this.zoom / 2;
    this.y = (ty + 0.5) * TILE - this.viewportH / this.zoom / 2;
    this.clamp();
  }

  /** Zoom a step, keeping the world point under (sx, sy) pinned in place. */
  zoomAt(delta: number, sx: number, sy: number): void {
    const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, this.zoomIndex + delta));
    if (next === this.zoomIndex) return;
    const worldX = this.x + sx / this.zoom;
    const worldY = this.y + sy / this.zoom;
    this.zoomIndex = next;
    this.x = worldX - sx / this.zoom;
    this.y = worldY - sy / this.zoom;
    this.clamp();
  }

  screenToTile(sx: number, sy: number): { x: number; y: number } {
    return {
      x: Math.floor((this.x + sx / this.zoom) / TILE),
      y: Math.floor((this.y + sy / this.zoom) / TILE),
    };
  }

  /** Screen position of a tile's top-left corner. */
  tileToScreen(tx: number, ty: number): { x: number; y: number } {
    return {
      x: (tx * TILE - this.x) * this.zoom,
      y: (ty * TILE - this.y) * this.zoom,
    };
  }

  /** Inclusive tile bounds currently on screen, with a one-tile margin. */
  visibleTileRange(): { x0: number; y0: number; x1: number; y1: number } {
    const x0 = Math.max(0, Math.floor(this.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(this.y / TILE) - 1);
    const x1 = Math.min(this.mapWidth - 1, Math.ceil((this.x + this.viewportW / this.zoom) / TILE));
    const y1 = Math.min(
      this.mapHeight - 1,
      Math.ceil((this.y + this.viewportH / this.zoom) / TILE),
    );
    return { x0, y0, x1, y1 };
  }
}
