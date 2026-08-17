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

/** How long the "got it back" pose is held, in total. */
const REARM_SECONDS = 0.55;

/** What a unit is in the middle of doing. */
export type AnimationKind = 'attack' | 'rearm';

interface Playing {
  kind: AnimationKind;
  elapsed: number;
  frames: number;
  secondsPerFrame: number;
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
    this.playing.set(unitId, {
      kind: 'attack',
      elapsed: 0,
      frames,
      secondsPerFrame: FRAME_SECONDS,
    });
  }

  /**
   * Hold the pose for getting a weapon back.
   *
   * Usually a single frame, so it is held rather than played -- long enough to
   * read as an event, short enough not to look like the unit is stuck.
   */
  rearm(unitId: number, frames: number): void {
    if (frames < 1) return;
    this.playing.set(unitId, {
      kind: 'rearm',
      elapsed: 0,
      frames,
      secondsPerFrame: REARM_SECONDS / frames,
    });
  }

  update(dt: number): void {
    for (const [id, p] of this.playing) {
      p.elapsed += dt;
      if (p.elapsed >= p.frames * p.secondsPerFrame) this.playing.delete(id);
    }
  }

  /** What this unit is showing, or null if it is not animating. */
  playingFor(unitId: number): { kind: AnimationKind; frame: number } | null {
    const p = this.playing.get(unitId);
    if (!p) return null;
    return {
      kind: p.kind,
      frame: Math.min(p.frames - 1, Math.floor(p.elapsed / p.secondsPerFrame)),
    };
  }

  /** Which frame this unit is showing, or null. Kept for the frame maths tests. */
  frameFor(unitId: number): number | null {
    return this.playingFor(unitId)?.frame ?? null;
  }

  clear(): void {
    this.playing.clear();
  }
}
