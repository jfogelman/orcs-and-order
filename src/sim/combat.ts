import { idx } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { cityAt, log, withRng } from './gamestate';
import { hasFlag } from './rules';

/**
 * Civ2-flavoured combat: two strengths, repeated coin flips, one survivor.
 *
 * Because a "Ten Orcs" unit has ten orcs' worth of both strength and health,
 * a large group is genuinely, deliberately powerful — and dies all at once
 * when it finally loses. That asymmetry is the whole point of the tech ladder.
 */

export const VETERAN_BONUS = 1.5;
export const FORTIFY_BONUS = 1.5;
/** Chance a survivor is promoted after winning a fight. */
export const PROMOTION_CHANCE = 0.25;

export interface StrengthBreakdown {
  total: number;
  base: number;
  veteran: boolean;
  fortified: boolean;
  terrainMult: number;
  wallsMult: number;
  siegeMult: number;
  berserk: boolean;
}

export function attackStrength(state: GameState, attacker: Unit, defender: Unit): StrengthBreakdown {
  const type = unitType(attacker.type);
  const owner = state.players[attacker.owner];
  const defenderCity = cityAt(state, defender.x, defender.y);
  const berserk = hasFlag(owner, 'berserk');

  const siegeMult = defenderCity ? type.siegeBonus : 1;
  let total = type.attack;
  if (attacker.veteran) total *= VETERAN_BONUS;
  total *= siegeMult;
  if (berserk) total *= 1.25;

  return {
    total,
    base: type.attack,
    veteran: attacker.veteran,
    fortified: false,
    terrainMult: 1,
    wallsMult: 1,
    siegeMult,
    berserk,
  };
}

export function defenseStrength(state: GameState, defender: Unit): StrengthBreakdown {
  const type = unitType(defender.type);
  const owner = state.players[defender.owner];
  const terrain = TERRAIN[state.terrain[idx(defender.x, defender.y, state.width)]];
  const city = cityAt(state, defender.x, defender.y);
  const berserk = hasFlag(owner, 'berserk');

  const wallsMult =
    city && city.buildings.includes('walls') ? (BUILDINGS.walls.defenseMult ?? 1) : 1;
  const fortified = defender.order === 'fortified' || city !== undefined;

  let total = type.defense;
  if (defender.veteran) total *= VETERAN_BONUS;
  total *= terrain.defense;
  if (fortified) total *= FORTIFY_BONUS;
  total *= wallsMult;
  if (berserk) total *= 0.75;

  return {
    total,
    base: type.defense,
    veteran: defender.veteran,
    fortified,
    terrainMult: terrain.defense,
    wallsMult,
    siegeMult: 1,
    berserk,
  };
}

/**
 * Damage per exchange, scaled so that a fight resolves in a bounded number of
 * rounds no matter how large the units are. Both sides use the same figure, so
 * a health advantage still translates fully into rounds survived.
 */
export function damagePerRound(attackerMaxHp: number, defenderMaxHp: number): number {
  return Math.max(1, Math.round(Math.max(attackerMaxHp, defenderMaxHp) / 15));
}

export interface CombatResult {
  attackerId: number;
  defenderId: number;
  attackerWon: boolean;
  rounds: number;
  attackerHp: number;
  defenderHp: number;
  attackStrength: number;
  defenseStrength: number;
  /** Set when the winner earned a promotion out of it. */
  promoted: boolean;
}

export function resolveCombat(state: GameState, attacker: Unit, defender: Unit): CombatResult {
  const atk = attackStrength(state, attacker, defender);
  const def = defenseStrength(state, defender);
  const atkMax = unitType(attacker.type).hp;
  const defMax = unitType(defender.type).hp;
  const dmg = damagePerRound(atkMax, defMax);
  // A defence of zero would make the fight a certainty; keep it a contest.
  const pAttack = atk.total / Math.max(0.0001, atk.total + def.total);

  let rounds = 0;
  const result = withRng(state, (rng) => {
    while (attacker.hp > 0 && defender.hp > 0) {
      rounds++;
      if (rng.float() < pAttack) defender.hp -= dmg;
      else attacker.hp -= dmg;
      // Runaway guard: an unwinnable matchup should not spin forever.
      if (rounds > 500) break;
    }
    const attackerWon = defender.hp <= 0;
    const winner = attackerWon ? attacker : defender;
    const promoted = !winner.veteran && rng.chance(PROMOTION_CHANCE);
    if (promoted) winner.veteran = true;
    return { attackerWon, promoted };
  });

  attacker.hp = Math.max(0, attacker.hp);
  defender.hp = Math.max(0, defender.hp);

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerWon: result.attackerWon,
    rounds,
    attackerHp: attacker.hp,
    defenderHp: defender.hp,
    attackStrength: atk.total,
    defenseStrength: def.total,
    promoted: result.promoted,
  };
}

/** Remove a dead unit and narrate it to both sides. */
export function destroyUnit(state: GameState, unit: Unit, cause: string): void {
  const i = state.units.indexOf(unit);
  if (i >= 0) state.units.splice(i, 1);
  const type = unitType(unit.type);
  const owner = state.players[unit.owner];
  log(state, `${type.name} ${cause}.`, 'bad', unit.owner);
  if (type.count > 1) {
    log(
      state,
      `All ${type.count} of them, at once. ${owner.name} takes it about as well as expected.`,
      'bad',
      unit.owner,
    );
  }
}
