import { distance } from '../engine/grid';
import { ammoLeft, needsAmmo, unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import {
  attackStrength,
  defenseStrength,
  applyDamage,
  applySpellEffects,
  damageKindOf,
  damagePerRound,
  destroyUnit,
  rearm,
  awardXp,
  XP
} from './combat';
import { log, recomputeVisibility, withRng } from './gamestate';

/**
 * Actions that pick a *target* rather than a destination.
 *
 * Everything here is knowledge-aware: the legal target list is built from what
 * the acting player can actually see, never from the true board. Otherwise the
 * interface would light up a tile containing a unit the player has not found
 * yet, which gives the position away just as surely as drawing the unit would.
 */

export type AbilityId = 'ranged' | 'heal' | 'reload';

export interface AbilitySpec {
  id: AbilityId;
  /** Shown on the button. */
  label: string;
  /** Single key that arms it. */
  key: string;
  /** Picks a friend instead of an enemy. */
  friendly: boolean;
  /** Sentence explaining why it is unavailable, when it is. */
  verb: string;
}

export const ABILITIES: Record<AbilityId, AbilitySpec> = {
  ranged: { id: 'ranged', label: 'Ranged', key: 'r', friendly: false, verb: 'strike at range' },
  heal: { id: 'heal', label: 'Heal', key: 'h', friendly: true, verb: 'patch anyone up' },
  reload: { id: 'reload', label: 'Reload', key: 'l', friendly: true, verb: 'hand over a missile' },
};

/** Re-exported: they live in the model, so `combat` can use them too. */
export { ammoLeft, needsAmmo } from '../model/units';

/** Rounds a ranged attack resolves before both sides stop. */
export const RANGED_ROUNDS = 3;

/** How much harder a thrown weapon hits than the same creature swinging it. */
export const THROW_BONUS = 1.5;

/** Re-exported: the constant lives in `combat`, where the axe now leaves. */
export { REARM_TURNS } from './combat';

/** What a unit is in principle capable of, ignoring its current state. */
export function abilitiesOf(unit: Unit): AbilityId[] {
  const type = unitType(unit.type);
  const out: AbilityId[] = [];
  if (type.range > 1) out.push('ranged');
  if (type.healsTo > 0) out.push('heal');
  // Anything that is not itself a piece of artillery can pass one a missile.
  if (type.ammo <= 0 && !type.settler) out.push('reload');
  return out;
}

/**
 * Whether the unit could use this right now, ignoring whether anything is
 * actually in reach. Kept separate from the target list so the interface can
 * explain *why* a button is dead rather than just hiding it.
 */
export function abilityReady(unit: Unit, ability: AbilityId): string | null {
  if (!abilitiesOf(unit).includes(ability)) return 'This unit cannot do that.';
  if (unit.moves <= 0) return 'No movement left this turn.';
  // You get one axe. Having thrown it, there is nothing to throw.
  if (ability === 'ranged' && unit.disarmed && unitType(unit.type).throwsWeapon) {
    return 'It has thrown its axe and has not got it back yet.';
  }
  // An empty magazine is the whole point of a magazine.
  if (ability === 'ranged' && ammoLeft(unit) <= 0) {
    return 'Out of missiles. Reload it, or take it back to a city.';
  }
  return null;
}

/**
 * Every unit this one could legally target right now.
 *
 * Only units the acting player can see are considered, which is what keeps an
 * armed ability from doubling as a fog-of-war probe.
 */
export function abilityTargets(state: GameState, unit: Unit, ability: AbilityId): Unit[] {
  if (abilityReady(unit, ability) !== null) return [];
  const type = unitType(unit.type);
  const seen = state.players[unit.owner].visible;
  const w = state.width;

  return state.units.filter((other) => {
    if (other.id === unit.id) return false;
    if (!seen[other.y * w + other.x]) return false;
    const d = distance(unit.x, unit.y, other.x, other.y);

    if (ability === 'ranged') {
      // Exactly at reach: a ranged unit cannot lob one at somebody standing
      // next to it, which is the drawback that makes the range worth having.
      if (other.owner === unit.owner) return false;
      return d === type.range;
    }

    if (ability === 'reload') {
      // A neighbour of ours with a magazine that is not full...
      if (other.owner !== unit.owner) return false;
      if (d > 1) return false;
      if (!needsAmmo(other)) return false;
      // ...and we have to be the right sort of neighbour. A ballista is fed by
      // people who make missiles, which is the archery line; a piece that
      // reloads by sacrifice is fed by whoever is standing closest and least
      // able to argue.
      return unitType(other.type).reloadsBy === 'sacrifice' || type.firstStrikes > 0;
    }

    // Healing is for a neighbour who actually needs it.
    if (other.owner !== unit.owner) return false;
    if (d > 1) return false;
    return other.hp < unitType(other.type).hp;
  });
}

export interface AbilityOutcome {
  ok: boolean;
  /** Why not, when `ok` is false. */
  reason?: string;
  /** Whether the target was killed outright. */
  killed?: boolean;
  /** Damage dealt, or health restored. */
  amount?: number;
}

/**
 * A strike from two tiles away.
 *
 * Unlike a normal attack this is not a fight to the death: a fixed few rounds
 * of damage land and that is the end of it. The defender never strikes back,
 * which is the entire point of having reach, and the attacker spends the rest
 * of its turn doing it.
 *
 * Deliberately cannot take a city. Killing the last defender leaves the tile
 * empty for somebody else to walk into — a ballista should not be able to
 * capture a capital from outside the walls.
 */
function fireAtRange(state: GameState, unit: Unit, target: Unit): AbilityOutcome {
  const type = unitType(unit.type);
  const atk = attackStrength(state, unit, target);
  const def = defenseStrength(state, target, unit);
  const dmg = damagePerRound(type.hp, unitType(target.type).hp);
  // A thrown weapon lands harder than a swung one -- that is what you are
  // buying with the axe you are about to be without.
  const power = type.throwsWeapon ? atk.total * THROW_BONUS : atk.total;
  const pHit = power / Math.max(0.0001, power + def.total);

  const landed = withRng(state, (rng) => {
    let hits = 0;
    for (let i = 0; i < RANGED_ROUNDS; i++) if (rng.float() < pHit) hits++;
    return hits;
  });

  // An arrow and a fireball are not the same thing to something that resists
  // one of them, so a thrown blow carries its thrower's kind.
  const amount = applyDamage(target, landed * dmg, damageKindOf(unit));
  applySpellEffects(state, unit, target);
  unit.moves = 0;
  if (unitType(unit.type).ammo > 0) unit.ammo = Math.max(0, ammoLeft(unit) - 1);
  // Shooting at somebody and living is worth less than closing with them.
  awardXp(state, unit, target.hp <= 0 ? XP.kill : XP.survive);
  if (target.hp > 0) awardXp(state, target, XP.survive);
  // Nothing that fires at range throws its weapon away any more. The only
  // creature that does is the axethrower, and it now closes and strikes first
  // instead -- the disarm lives in `resolveCombat` with the blow that causes it.

  const attackerName = unitType(unit.type).name;
  const targetName = unitType(target.type).name;
  const killed = target.hp <= 0;

  log(
    state,
    amount === 0
      ? `${attackerName} looses at ${targetName} and misses entirely.`
      : `${attackerName} hits ${targetName} from range for ${amount}.`,
    'combat',
    unit.owner,
    // No cue: an arrow, an axe and a fireball do not sound alike, and picking
    // between them is the interface's job, not this one's.
    undefined,
    [target.x, target.y],
    unit.id,
  );

  if (killed) {
    const where: readonly [number, number] = [target.x, target.y];
    destroyUnit(state, target, 'is shot down where it stands');
    // Killing somebody means there is an axe on the ground to pick up.
    rearm(state, unit, 'retrieves its axe from the wreckage');
    recomputeVisibility(state, unit.owner);
    recomputeVisibility(state, target.owner);
    log(state, `${targetName} falls.`, 'combat', unit.owner, undefined, where);
  }
  return { ok: true, killed, amount };
}

/** Patch a neighbour up. The first thing in the game that is not violence. */
function healFriend(state: GameState, unit: Unit, target: Unit): AbilityOutcome {
  const max = unitType(target.type).hp;
  const ceiling = Math.round(max * unitType(unit.type).healsTo);
  unit.moves = 0;

  if (target.hp >= ceiling) {
    log(
      state,
      `${unitType(unit.type).name} looks ${unitType(target.type).name} over and finds nothing it can fix.`,
      'info',
      unit.owner,
      undefined,
      [target.x, target.y],
    );
    return { ok: true, amount: 0 };
  }

  const amount = ceiling - target.hp;
  target.hp = ceiling;
  log(
    state,
    `${unitType(unit.type).name} patches up ${unitType(target.type).name} for ${amount}.`,
    'good',
    unit.owner,
    'holy',
    [target.x, target.y],
  );
  return { ok: true, amount };
}

/**
 * Run an ability against a target, re-checking legality first.
 *
 * The interface has already filtered the click to a legal target, but this is
 * the only place that actually changes anything, so it does not take that on
 * trust.
 */
/**
 * Hand a missile to the artillery next door.
 *
 * Costs the helper its whole turn for one shot, which is the point: a battery
 * of ballistas needs a tail of people feeding it, and that is a real price paid
 * in turns rather than a number in a table. A piece that reloads by
 * `sacrifice` eats the helper instead -- see DESIGN_QUEUE section 40.
 */
function handOverMissile(state: GameState, unit: Unit, target: Unit): AbilityOutcome {
  if (!needsAmmo(target)) return { ok: false, reason: 'It is already loaded.' };
  const type = unitType(target.type);
  const eaten = type.reloadsBy === 'sacrifice';

  target.ammo = Math.min(type.ammo, ammoLeft(target) + 1);
  unit.moves = 0;

  log(
    state,
    eaten
      ? `${unitType(unit.type).name} is informed of its new job by the ${type.name}.`
      : `${unitType(unit.type).name} hands the ${type.name} a missile.`,
    eaten ? 'bad' : 'good',
    unit.owner,
    undefined,
    [target.x, target.y],
    target.id,
  );

  if (eaten) destroyUnit(state, unit, 'is loaded, aimed, and released');
  return { ok: true, amount: 1 };
}

export function useAbility(
  state: GameState,
  unit: Unit,
  ability: AbilityId,
  target: Unit,
): AbilityOutcome {
  const blocked = abilityReady(unit, ability);
  if (blocked) return { ok: false, reason: blocked };
  if (!abilityTargets(state, unit, ability).some((t) => t.id === target.id)) {
    return { ok: false, reason: 'Not a legal target.' };
  }
  if (ability === 'ranged') return fireAtRange(state, unit, target);
  if (ability === 'reload') return handOverMissile(state, unit, target);
  return healFriend(state, unit, target);
}
