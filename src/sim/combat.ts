import { distance, idx } from '../engine/grid';
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
  /** Attack multiplier from sallying out of a city that has the means. */
  sallyMult: number;
  berserk: boolean;
}

/**
 * What a thrower is worth once it has thrown the thing it fights with.
 *
 * Deliberately brutal. The throw itself hits hard and from two tiles away with
 * no reply, so the price of using it has to be steep enough that an axethrower
 * is a decision rather than a free opening move every turn.
 */
export const DISARMED_ATTACK = 0.25;

/** What a dragon's breath does to whatever is standing behind its target. */
export const BREATH_CARRY = 0.6;

/**
 * Give a thrower its weapon back.
 *
 * Two ways to earn it, both requiring the unit to do something rather than
 * wait: walk into a friendly city, or kill somebody and pick their axe up off
 * the floor.
 */
export function rearm(state: GameState, unit: Unit, how: string): void {
  if (!unit.disarmed) return;
  unit.disarmed = false;
  log(state, `${unitType(unit.type).name} ${how}.`, 'good', unit.owner, 'promote', [unit.x, unit.y]);
}

/**
 * A dragon's breath carries past whatever it hit, into the tile directly
 * behind, along the line it was already travelling.
 *
 * It does not check whose side that unit is on. Positioning is the whole
 * mechanic: a dragon lined up behind your own front rank will cook it.
 *
 * Returns whatever it caught, or null.
 */
export function breatheThrough(
  state: GameState,
  attacker: Unit,
  target: Unit,
  damageDealt: number,
): Unit | null {
  if (!unitType(attacker.type).lineBreath || damageDealt <= 0) return null;
  const bx = target.x + (target.x - attacker.x);
  const by = target.y + (target.y - attacker.y);
  const behind = state.units.find((u) => u.x === bx && u.y === by);
  if (!behind) return null;

  const carried = Math.max(1, Math.round(damageDealt * BREATH_CARRY));
  behind.hp -= carried;
  log(
    state,
    `The breath carries on into ${unitType(behind.type).name} for ${carried}.`,
    behind.owner === attacker.owner ? 'bad' : 'combat',
    attacker.owner,
    undefined,
    [behind.x, behind.y],
  );
  if (behind.hp <= 0) destroyUnit(state, behind, 'is burned away behind the line');
  return behind;
}

export function attackStrength(state: GameState, attacker: Unit, defender: Unit): StrengthBreakdown {
  const type = unitType(attacker.type);
  const owner = state.players[attacker.owner];
  const defenderCity = cityAt(state, defender.x, defender.y);
  const berserk = hasFlag(owner, 'berserk');

  const siegeMult = defenderCity ? type.siegeBonus : 1;

  // Charging out of your own city with something encouraging behind you. The
  // Horde's answer to walls: no help at all if you sit still, considerable
  // help if you come out and meet them.
  const homeCity = cityAt(state, attacker.x, attacker.y);
  const sallyMult =
    homeCity && homeCity.owner === attacker.owner
      ? 1 + homeCity.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.sallyBonus ?? 0), 0)
      : 1;

  let total = type.attack;
  // Nothing left to fight with but hands and regret.
  if (attacker.disarmed) total *= DISARMED_ATTACK;
  if (attacker.veteran) total *= VETERAN_BONUS;
  total *= siegeMult;
  total *= sallyMult;
  if (berserk) total *= 1.25;

  return {
    total,
    base: type.attack,
    veteran: attacker.veteran,
    fortified: false,
    terrainMult: 1,
    wallsMult: 1,
    siegeMult,
    sallyMult,
    berserk,
  };
}

/**
 * Defensive strength, optionally against a specific attacker.
 *
 * The attacker matters because siege engines are built to ignore walls. A
 * defender otherwise stacks terrain (up to x3), the free fortify bonus for
 * standing in a city (x1.5), walls (x2) and veterancy (x1.5) — up to x13.5,
 * which put a walled hill city beyond anything the AI would willingly attack
 * and left almost every game to be decided on points.
 */
export function defenseStrength(
  state: GameState,
  defender: Unit,
  attacker?: Unit,
): StrengthBreakdown {
  const type = unitType(defender.type);
  const owner = state.players[defender.owner];
  const terrain = TERRAIN[state.terrain[idx(defender.x, defender.y, state.width)]];
  const city = cityAt(state, defender.x, defender.y);
  const berserk = hasFlag(owner, 'berserk');

  // Siege units bring the walls down; that is what they are for. Anything a
  // siege engine cannot simply knock over still counts.
  const siegeAttacker = attacker !== undefined && unitType(attacker.type).siegeBonus > 1;
  const wallsMult = city
    ? city.buildings.reduce((mult, id) => {
        const def = BUILDINGS[id];
        if (!def?.defenseMult) return mult;
        if (siegeAttacker && def.negatedBySiege) return mult;
        return mult * def.defenseMult;
      }, 1)
    : 1;
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
    sallyMult: 1,
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
  /** The defender was finished off outright rather than fought. */
  executed: boolean;
}

/**
 * Can this attacker simply finish off a wounded defender?
 *
 * Deliberately restricted to a defender no larger than the attacker. Without
 * that guard a single Death Knight could delete Ten Orcs by catching them
 * wounded, which would make it far and away the strongest thing in the game.
 */
export function canExecute(attacker: Unit, defender: Unit): boolean {
  const a = unitType(attacker.type);
  const d = unitType(defender.type);
  if (a.executeChance <= 0) return false;
  if (d.hp > a.hp) return false;
  return defender.hp < d.hp * 0.5;
}

export function resolveCombat(state: GameState, attacker: Unit, defender: Unit): CombatResult {
  if (canExecute(attacker, defender)) {
    const executed = withRng(state, (rng) => rng.chance(unitType(attacker.type).executeChance));
    if (executed) {
      defender.hp = 0;
      return {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerWon: true,
        rounds: 0,
        attackerHp: attacker.hp,
        defenderHp: 0,
        attackStrength: 0,
        defenseStrength: 0,
        promoted: false,
        executed: true,
      };
    }
  }

  const atk = attackStrength(state, attacker, defender);
  const def = defenseStrength(state, defender, attacker);
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
    executed: false,
  };
}

/**
 * A sapper killed while defending takes the neighbourhood with it.
 *
 * Deliberately does not chain: a unit killed *by* a blast never detonates in
 * turn, or one sapper in a line clears a continent. And it only fires on
 * defence, because the whole joke is that you cannot aim it.
 *
 * Returns the units it killed, already removed from the board.
 */
export function detonate(state: GameState, sapper: Unit): Unit[] {
  const power = unitType(sapper.type).explodes;
  if (power <= 0) return [];

  const caught = state.units.filter(
    (u) => u.id !== sapper.id && distance(u.x, u.y, sapper.x, sapper.y) === 1,
  );
  const killed: Unit[] = [];
  for (const victim of caught) {
    victim.hp -= Math.max(1, Math.round(unitType(victim.type).hp * power));
    if (victim.hp <= 0) killed.push(victim);
  }
  log(
    state,
    `${unitType(sapper.type).name} goes up, taking ${caught.length} unit(s) with it.`,
    'combat',
    sapper.owner,
    'explosion',
    [sapper.x, sapper.y],
  );
  for (const victim of killed) {
    const i = state.units.indexOf(victim);
    if (i >= 0) state.units.splice(i, 1);
    log(state, `${unitType(victim.type).name} is caught in the blast.`, 'bad', victim.owner);
  }
  return killed;
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
