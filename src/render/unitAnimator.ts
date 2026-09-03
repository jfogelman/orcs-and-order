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

/** How long a creature is shown knitting itself back together. */
const REGEN_SECONDS = 0.6;

/** What a unit is in the middle of doing. */
export type AnimationKind = 'attack' | 'rearm' | 'regen';

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
   * Take back an animation that turned out not to have happened.
   *
   * The attack swing has to start *before* the fight resolves, so that a unit
   * which dies attacking is still seen to attack. The cost of starting early is
   * that a refused move -- out of movement, or a city that cannot be taken yet
   * -- had already swung by the time anybody knew. A swing with no blow landing
   * reads as an attack that did nothing, which is worse than no animation and
   * was reported as a bug twice before anybody worked out that the swing itself
   * was the misleading part.
   */
  cancel(unitId: number): void {
    this.playing.delete(unitId);
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

  /**
   * A creature visibly putting itself back together.
   *
   * Slower than a swing, because it is a state rather than an action -- the
   * point is to notice it happened, not to read four separate poses.
   */
  regen(unitId: number, frames: number): void {
    if (frames < 1) return;
    // Never over an attack. A troll that healed and then swung this turn is
    // more usefully shown swinging.
    if (this.playing.get(unitId)?.kind === 'attack') return;
    this.playing.set(unitId, {
      kind: 'regen',
      elapsed: 0,
      frames,
      secondsPerFrame: REGEN_SECONDS / frames,
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
