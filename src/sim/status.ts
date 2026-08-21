import { unitType } from '../model/units';
import type { GameState, Status, StatusKind, Unit } from '../model/types';
import { log } from './gamestate';

/**
 * Conditions a unit is under for a few turns.
 *
 * Four things in DESIGN_QUEUE section 11 -- being on fire, being frozen, being
 * confused, and a troll's regeneration being spent -- are the same feature
 * wearing different names, so this is built once. `disarmed` is deliberately
 * *not* folded in: it is a bare boolean with no duration, it ends by killing
 * something rather than by waiting, and rewriting it here would change a rule
 * that already works.
 *
 * Three constraints the queue set, all of them met here:
 *
 * - **It serialises.** `statuses` is plain data on the unit, optional so old
 *   saves and every existing fixture load unchanged.
 * - **It ticks deterministically.** Duration counts down at a fixed rate and
 *   burning deals a fixed share of maximum health. Nothing here touches the
 *   RNG, so a replay of the same seed plays out identically.
 * - **It is visible.** The renderer draws an overlay per condition, and a
 *   second, guttering one for the last turn. A unit quietly losing health for
 *   three turns with nothing drawn on it does not read as on fire; it reads as
 *   a bug.
 *
 * Nothing applies a status yet. The advances that would -- pyromancer,
 * cryomancer, the deathknight's confusion, the troll's Swampy Friend -- are the
 * *items* in section 11, and this is the groundwork they were blocked on. That
 * also means this changes no outcome and needs no re-measuring: a game played
 * today has no statuses in it.
 */

/** What each condition does, in one place, so the rules are readable together. */
export const STATUS_RULES: Record<StatusKind, { label: string; blurb: string }> = {
  burning: { label: 'On fire', blurb: 'Loses health each turn until it goes out.' },
  frozen: { label: 'Frozen', blurb: 'Cannot move or act.' },
  confused: { label: 'Confused', blurb: 'Cannot tell friend from enemy.' },
  spent: { label: 'Spent', blurb: 'Cannot regenerate for the moment.' },
};

/** Share of maximum health lost per turn while alight. */
export const BURN_DAMAGE = 0.1;

/** Never less than this, so a burning Goblin still feels it. */
export const BURN_FLOOR = 1;

export function statusesOf(unit: Unit): Status[] {
  return unit.statuses ?? [];
}

export function hasStatus(unit: Unit, kind: StatusKind): boolean {
  return statusesOf(unit).some((s) => s.kind === kind);
}

/** Turns left on a condition, or 0 if the unit is not under it. */
export function statusTurns(unit: Unit, kind: StatusKind): number {
  return statusesOf(unit).find((s) => s.kind === kind)?.turns ?? 0;
}

/**
 * Put a unit under a condition, or extend one it is already under.
 *
 * Extends rather than stacks. Two pyromancers setting the same orc alight
 * should leave it burning for longer, not burning twice as fast -- stacking
 * intensity is how a status effect turns into a one-shot kill, and the longest
 * of the two durations is the answer that cannot run away.
 */
export function applyStatus(unit: Unit, kind: StatusKind, turns: number): void {
  if (turns <= 0) return;
  const existing = statusesOf(unit).find((s) => s.kind === kind);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    return;
  }
  unit.statuses = [...statusesOf(unit), { kind, turns }];
}

export function clearStatus(unit: Unit, kind: StatusKind): void {
  const left = statusesOf(unit).filter((s) => s.kind !== kind);
  if (left.length === 0) delete unit.statuses;
  else unit.statuses = left;
}

/**
 * Count every condition on this unit down by a turn, and act on the ones that
 * do something as they pass.
 *
 * Returns true if the unit died of it, which the caller has to handle: burning
 * is the first thing in the game that can kill a unit when nobody attacked it.
 *
 * Damage is a share of maximum health rather than a flat number, so fire is
 * equally frightening to a Goblin and to Ten Trolls -- a flat figure would be
 * lethal to one and beneath the notice of the other.
 */
export function tickStatuses(state: GameState, unit: Unit): boolean {
  const statuses = statusesOf(unit);
  if (statuses.length === 0) return false;

  if (hasStatus(unit, 'burning')) {
    const max = unitType(unit.type).hp;
    unit.hp -= Math.max(BURN_FLOOR, Math.round(max * BURN_DAMAGE));
  }

  for (const s of statuses) s.turns -= 1;
  const left = statuses.filter((s) => s.turns > 0);
  if (left.length === 0) delete unit.statuses;
  else unit.statuses = left;

  if (unit.hp <= 0) {
    log(state, `${unitType(unit.type).name} burns to nothing.`, 'bad', unit.owner, undefined, [
      unit.x,
      unit.y,
    ]);
    return true;
  }
  return false;
}
