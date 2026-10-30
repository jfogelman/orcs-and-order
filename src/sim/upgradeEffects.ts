import { UPGRADES, UPGRADES_BY_ID } from '../model/upgrades';
import type { UpgradeDef, UpgradeEffect } from '../model/upgrades';
import { unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { distance } from '../engine/grid';

/**
 * Section 155 slice 5: what an upgrade actually does.
 *
 * Slice 4 made a unit able to carry one; every blurb still described an effect
 * that no code produced. This file is the reading side -- one place that
 * answers "is this unit a Berserker" and "how much attack does its upgrade add
 * to the base" -- and the rules themselves live wherever their subsystem does,
 * which is mostly `combat.ts`.
 *
 * **Everything here returns nothing when the lever is off**, which is what
 * keeps a game with the box unticked byte-identical to the game every number
 * in this project was measured on. It is checked rather than assumed: see the
 * fixture suite, which regenerates 299 turns of AI decisions every run.
 */

/** The upgrade this unit is wearing, or null -- including when the lever is off. */
export function upgradeOf(unit: Unit): UpgradeDef | null {
  if (!UPGRADES.enabled || !unit.upgrade) return null;
  return UPGRADES_BY_ID[unit.upgrade] ?? null;
}

/**
 * Whether this unit carries one particular upgrade.
 *
 * The `hasPerk` of this system, and named the same way on purpose: a rule that
 * is about one upgrade should say which one, out loud, where somebody reading
 * that rule can see it. It is also what the completeness test greps for.
 */
export function hasUpgrade(unit: Unit, id: string): boolean {
  return upgradeOf(unit)?.id === id;
}

/** The flat part of an upgrade's effect, or zero. */
export function upgradeStat(unit: Unit, key: keyof UpgradeEffect): number {
  return upgradeOf(unit)?.effect?.[key] ?? 0;
}

/**
 * Units standing next to this one, optionally only friends or only enemies.
 *
 * Section 155's three auras all want this and nothing in the game had it:
 * adjacency was computed inline wherever it was needed. One definition rather
 * than four, because an aura that disagrees with another aura about what
 * "adjacent" means is the quietest possible bug.
 *
 * Diagonals count, which is how every other distance in this game works.
 */
export function neighbours(
  state: GameState,
  unit: Unit,
  side: 'friendly' | 'enemy' | 'any' = 'any',
): Unit[] {
  return state.units.filter((u) => {
    if (u.id === unit.id) return false;
    if (distance(u.x, u.y, unit.x, unit.y) !== 1) return false;
    if (side === 'friendly') return u.owner === unit.owner;
    if (side === 'enemy') return u.owner !== unit.owner;
    return true;
  });
}

/**
 * What this unit's upgrade, and its neighbours' upgrades, add to its attack.
 *
 * Added to the base in `attackStrength`, beside `drilled`, so it scales with
 * the headcount the way every other flat addition there does: four points on
 * Ten Orcs is four points per orc, which is the rule the Loudest Rock and the
 * Old Queen's Shell already follow.
 *
 * Floored at zero overall rather than per source. Fear can take a creature's
 * swing down but not below nothing, which is the same floor `cowed` uses and
 * for the same reason -- the cheapest units should be made worse, not switched
 * off entirely.
 */
export function upgradeAttack(state: GameState, unit: Unit): number {
  if (!UPGRADES.enabled) return 0;
  let bonus = upgradeStat(unit, 'attack');

  // `orc-berserker`: +2 attack and -1 defence below half health. The defence
  // half is in `upgradeDefence`; this is an orc that fights better the worse
  // it is doing, which is the single most Horde sentence in the upgrade bible.
  if (hasUpgrade(unit, 'orc-berserker') && unit.hp < unitType(unit.type).hp / 2) {
    bonus += BERSERK_RAGE.attack;
  }

  // `orc-veteran`: +1 attack after surviving two fights. Counted on the unit
  // rather than inferred from `xp`, which is awarded for razing, taking cities
  // and reading a spy's dispatches and would make a scholar of anybody.
  if (hasUpgrade(unit, 'orc-veteran') && (unit.fights ?? 0) >= SEASONED.fights) {
    bonus += SEASONED.attack;
  }

  // `knight-vanguard`: +2 attack when this unit is the one that started it.
  // The bible says "the first strike of any combat this unit initiates"; a
  // combat has exactly one first strike, so initiating *is* the condition,
  // and reading it as a per-round effect would make it an ordinary +2.
  if (hasUpgrade(unit, 'knight-vanguard')) bonus += VANGUARD.attack;

  // `ogre-grinder`: +1 for each enemy standing next to it. Surrounding it was,
  // in retrospect, the mistake.
  if (hasUpgrade(unit, 'ogre-grinder')) {
    bonus += GRINDER.perEnemy * neighbours(state, unit, 'enemy').length;
  }

  for (const near of neighbours(state, unit, 'friendly')) {
    // `ogre-warlord`: everything of its own standing beside it swings harder.
    // The bible says "adjacent orc units"; read as units of the warlord's own
    // side, because a Kingdom army with an ogre in it does not arise and a
    // rule about faction rather than ownership would be the odd one out here.
    if (hasUpgrade(near, 'ogre-warlord')) bonus += WARLORD.attack;
  }

  // `deathknight-dread`: and everything standing beside *it* swings weaker.
  // `paladin-templar` is the whole answer to this upgrade and exists only to
  // be the answer to it, which is why the check sits inside the loop it undoes.
  if (!hasUpgrade(unit, 'paladin-templar')) {
    for (const near of neighbours(state, unit, 'enemy')) {
      if (hasUpgrade(near, 'deathknight-dread')) bonus -= DREAD.attack;
    }
  }

  return bonus;
}

/** The same, for defence. */
export function upgradeDefence(state: GameState, unit: Unit): number {
  if (!UPGRADES.enabled) return 0;
  let bonus = upgradeStat(unit, 'defence');

  if (hasUpgrade(unit, 'orc-berserker') && unit.hp < unitType(unit.type).hp / 2) {
    bonus -= BERSERK_RAGE.defence;
  }

  // `footman-veteran`: the Kingdom's half of the same idea, on the currency it
  // actually fights in.
  if (hasUpgrade(unit, 'footman-veteran') && (unit.fights ?? 0) >= SEASONED.fights) {
    bonus += SEASONED.defence;
  }

  // `footman-shieldwall`: +1 defence to adjacent Footmen, and only when there
  // are two of them standing together -- which is what makes it a wall rather
  // than a bonus. "Stacked 2" is read as the pair being adjacent, since this
  // game puts one unit on a tile and a *group* is a single unit of ten.
  for (const near of neighbours(state, unit, 'friendly')) {
    if (hasUpgrade(near, 'footman-shieldwall') && unitType(unit.type).base === 'footman') {
      bonus += SHIELDWALL.defence;
      break;
    }
  }

  return bonus;
}

/** Movement points this unit's upgrade adds or takes away. */
export function upgradeMoves(unit: Unit): number {
  return UPGRADES.enabled ? upgradeStat(unit, 'moves') : 0;
}

/** Tiles this unit's upgrade adds to a striking range. */
export function upgradeReach(unit: Unit): number {
  return UPGRADES.enabled ? upgradeStat(unit, 'reach') : 0;
}

/**
 * Every number slice 5 invented, in one place a sweep can reach.
 *
 * **All of them are the bible's own suggestions**, which that document is
 * explicit are *"suggested starting points, not final balance"*. None has been
 * measured, and none can be until every upgrade does something -- an arm run
 * now would compare a game with upgrades against a game with most of them
 * still inert.
 */
export const BERSERK_RAGE = { attack: 2, defence: 1 };
export const SEASONED = { fights: 2, attack: 1, defence: 1 };
export const VANGUARD = { attack: 2 };
export const GRINDER = { perEnemy: 1 };
export const WARLORD = { attack: 1 };
export const DREAD = { attack: 1 };
export const SHIELDWALL = { defence: 1 };

/**
 * Free opening blows this unit gets, after its upgrade has had its say.
 *
 * **The Archer is not what the upgrade bible thought it was.** That document
 * describes a Civ-style bowman — "range increases to 3 tiles", "can target any
 * unit in range regardless of intervening units" — and this game's Archer has
 * `range: 1`. What makes it ranged here is `firstStrikes: 1`, section 11's
 * free blow before the fight proper, so "loses the not-struck-back protection"
 * means losing that.
 *
 * Which is why `archer-marksman` is wired and the other two archer lines are
 * not: this one happens to describe the game that exists, and the other two
 * describe a mechanic it does not have.
 *
 * Floored at zero. Nothing should be able to give the *other* side a free blow
 * by taking one away from this one, which is what a negative here would do
 * when `resolveCombat` nets the two.
 */
export function firstStrikesOf(unit: Unit): number {
  const base = unitType(unit.type).firstStrikes;
  if (hasUpgrade(unit, 'archer-marksman')) return Math.max(0, base - MARKSMAN.firstStrikes);
  return base;
}

/** What a Marksman gives up for its two points. */
export const MARKSMAN = { firstStrikes: 1 };
