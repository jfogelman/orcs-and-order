/**
 * Which units are mid-swing, and how far through.
 *
 * Deliberately keyed on unit id and held in the renderer rather than on the
 * unit itself. An animation is not part of the game state: it must not appear
 * in a save, must not affect a replay, and a unit that dies mid-swing simply
 * stops being drawn. `sim/` never learns that any of this exists.
 */

/** Seconds a single attack frame is held. Four frames make a ~0.36s swing. */
const FRAME_SECONDS = 0.09;

interface Playing {
  elapsed: number;
  frames: number;
}

export class UnitAnimator {
  private playing = new Map<number, Playing>();

  /** True while anything is mid-animation, so a caller can wait it out. */
  get busy(): boolean {
    return this.playing.size > 0;
  }

  /**
   * Start (or restart) a unit's attack animation.
   *
   * Restarting rather than queueing is intentional: a unit that attacks twice
   * in a turn should swing twice, not build up a backlog to play out later.
   */
  attack(unitId: number, frames: number): void {
    if (frames < 2) return;
    this.playing.set(unitId, { elapsed: 0, frames });
  }

  update(dt: number): void {
    for (const [id, p] of this.playing) {
      p.elapsed += dt;
      if (p.elapsed >= p.frames * FRAME_SECONDS) this.playing.delete(id);
    }
  }

  /** Which frame this unit is showing, or null if it is not animating. */
  frameFor(unitId: number): number | null {
    const p = this.playing.get(unitId);
    if (!p) return null;
    return Math.min(p.frames - 1, Math.floor(p.elapsed / FRAME_SECONDS));
  }

  clear(): void {
    this.playing.clear();
  }
}
