import { distance, idx } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import { hasPerk } from '../model/perks';
import { TERRAIN } from '../model/terrain';
import { headcount, unitType } from '../model/units';
import type { DamageKind, City, GameState, Unit } from '../model/types';
import { cityAt, log, withRng } from './gamestate';
import { militiaStrength, supplyQuality, SUPPLY } from './city';
import { hasFlag } from './rules';
import { SPELL_TURNS, applyStatus } from './status';

/**
 * Civ2-flavoured combat: two strengths, repeated coin flips, one survivor.
 *
 * Because a "Ten Orcs" unit has ten orcs' worth of both strength and health,
 * a large group is genuinely, deliberately powerful — and dies all at once
 * when it finally loses. That asymmetry is the whole point of the tech ladder.
 */

export const VETERAN_BONUS = 1.5;

/** What a chosen perk is worth where it simply multiplies something. */
export const PERK_BONUS = 1.25;

/**
 * What each rank multiplies strength by.
 *
 * Rank 1 is the old veteran bonus exactly, so the common case is unchanged and
 * the balance measured against it still holds. The two above are new and
 * deliberately smaller steps -- a unit that has survived three wars should be
 * frightening, not decisive on its own.
 */
export const RANK_BONUS = [1, VETERAN_BONUS, 1.75, 2] as const;
export const MAX_RANK = RANK_BONUS.length - 1;

/**
 * Experience, and where it comes from.
 *
 * Killing teaches most, surviving a fight teaches something, and damage a unit
 * did not choose teaches nothing at all -- a dragon's breath catching a
 * bystander, or a sapper going up, is not a lesson. That rule is mechanical as
 * much as thematic: a blast hits both sides, so counting it would have a
 * sapper promoting the survivors it was aimed at.
 *
 * Divided by the size of the group, because Ten Orcs winning a fight is ten
 * orcs each learning a tenth of it. Without that the counting ladder would
 * double as an experience ladder, and the biggest unit would both hit hardest
 * and improve fastest.
 */
export const XP = {
  kill: 50,
  survive: 15,
  /** Taking a city off somebody. */
  city: 60,
  /** Taking one off somebody so thoroughly that it stops being a city. */
  raze: 120,
  thresholds: [0, 100, 300, 700],
} as const;

export function rankBonus(unit: Unit): number {
  return RANK_BONUS[Math.min(unit.rank, MAX_RANK)] ?? 1;
}

/** Give a unit experience, and promote it if that is enough. */
export function awardXp(state: GameState, unit: Unit, amount: number): boolean {
  unit.xp += amount / Math.max(1, unitType(unit.type).count);
  let promoted = false;
  while (unit.rank < MAX_RANK && unit.xp >= XP.thresholds[unit.rank + 1]) {
    unit.rank++;
    promoted = true;
  }
  if (promoted) {
    log(state, `${unitType(unit.type).name} is promoted.`, 'good', unit.owner, 'promote', [
      unit.x,
      unit.y,
    ]);
  }
  return promoted;
}
/**
 * What digging in is worth to a defender.
 *
 * Held in an object as well as a constant so a sweep can vary it. This is the
 * lever that decides whether attack or defence is the better buy: defence is
 * multiplied by this, by terrain, and by any city building, where attack is
 * multiplied by nothing except a siege bonus. A faction that trades defence for
 * attack -- which is the Horde, by design -- is paying for the weaker currency.
 */
export const FORTIFY_BONUS_REF = { value: 1.5 };

/** The value itself, for anything that only needs to read it. */
export const FORTIFY_BONUS = FORTIFY_BONUS_REF.value;
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

/** Extra magical resistance per rank, on top of a creature's own. */
export const RESIST_PER_RANK = 0.08;

/** Nothing is ever immune. A cap keeps a notorious dragon killable. */
export const MAX_RESIST = 0.75;

/**
 * How much of a blow of this kind the unit shrugs off, 0..1.
 *
 * Currently zero for everything, because no creature declares `magicResist`
 * yet -- see the note on that field. The mechanism is here so the advances in
 * DESIGN_QUEUE section 11 have something to switch on, and so the numbers can
 * be measured when they are chosen rather than arriving with them.
 */
export function resistance(unit: Unit, kind: DamageKind): number {
  if (kind !== 'magic') return 0;
  const base = unitType(unit.type).magicResist ?? 0;
  if (base <= 0) return 0;
  return Math.min(MAX_RESIST, base + unit.rank * RESIST_PER_RANK);
}

/**
 * The one place health comes off a unit, so resistance cannot be forgotten at
 * one of the half-dozen sites that deal damage.
 *
 * Returns what was actually dealt, which is not always what was asked for --
 * the caller usually wants that figure for the log rather than the number it
 * passed in.
 */
export function applyDamage(unit: Unit, amount: number, kind: DamageKind): number {
  if (amount <= 0) return 0;
  const dealt = Math.round(amount * (1 - resistance(unit, kind)));
  unit.hp -= dealt;
  return dealt;
}

/** What this creature's blows are made of. */
export function damageKindOf(unit: Unit): DamageKind {
  return unitType(unit.type).damageKind ?? 'physical';
}

/**
 * Magic that leaves something behind.
 *
 * Only magical damage carries a spell, which is what makes the two advances
 * worth reaching for a side that has magical units and worth nothing at all to
 * a side that has none. An axe stays an axe.
 *
 * Applied to a target that survived: setting a corpse alight teaches nobody
 * anything, and a status on a unit about to be removed is a wasted lookup.
 */
export function applySpellEffects(state: GameState, attacker: Unit, target: Unit): void {
  if (target.hp <= 0) return;
  if (damageKindOf(attacker) !== 'magic') return;
  const owner = state.players[attacker.owner];
  if (hasFlag(owner, 'pyromancy')) applyStatus(target, 'burning', SPELL_TURNS.burning);
  if (hasFlag(owner, 'cryomancy')) applyStatus(target, 'frozen', SPELL_TURNS.frozen);
}

/** What a dragon's breath does to whatever is standing behind its target. */
export const BREATH_CARRY = 0.6;

/**
 * Give a thrower its weapon back.
 *
 * Two ways to earn it, both requiring the unit to do something rather than
 * wait: walk into a friendly city, or kill somebody and pick their axe up off
 * the floor.
 */
/**
 * Why this unit cannot pick up a fresh axe, or null if it can.
 *
 * Reaching a city is enough; it does not have to get inside one. A thrower that
 * had to stand on the tile would be turned away by its own garrison, which is
 * an absurd way to lose a unit's usefulness for the rest of a war.
 */
export function resupplyBlocked(state: GameState, unit: Unit): string | null {
  if (!unitType(unit.type).throwsWeapon) return 'This unit has nothing to restock.';
  if (!unit.disarmed) return 'It already has its axe.';
  if (unit.moves <= 0) return 'No movement left this turn.';
  const near = state.cities.some(
    (c) => c.owner === unit.owner && distance(c.x, c.y, unit.x, unit.y) <= 1,
  );
  if (!near) return 'No city of yours within reach.';
  return null;
}

/**
 * Draw a fresh axe from a neighbouring city.
 *
 * Costs the rest of the turn, which is what stops it being free: a thrower can
 * loose its axe or restock it, not both, so the reach it gets in exchange for
 * being weak afterwards still has a price.
 */
export function resupply(state: GameState, unit: Unit): boolean {
  if (resupplyBlocked(state, unit) !== null) return false;
  rearm(state, unit, 'draws a fresh axe from the stores');
  unit.moves = 0;
  return true;
}

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
  applyDamage(behind, carried, damageKindOf(attacker));
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
  // Losses. Ten Orcs that have taken half the damage they can take are Five
  // Orcs, and swing like five, which is what stops a big enough stack being
  // the answer to every question in the game. A singleton is unaffected.
  total *= headcount(attacker);
  // Nothing left to fight with but hands and regret.
  if (attacker.disarmed) total *= DISARMED_ATTACK;
  // Hungry, lost, and a long way from anyone who knows the way home. Graded
  // rather than a cliff edge: a step past the line is slightly worse off, not
  // suddenly useless.
  const supplied = supplyQuality(state, attacker);
  if (supplied < 1) total *= SUPPLY.attackPenalty + (1 - SUPPLY.attackPenalty) * supplied;
  total *= rankBonus(attacker);
  if (hasPerk(attacker, 'bloodied')) total *= PERK_BONUS;
  total *= siegeMult;
  total *= sallyMult;
  if (berserk) total *= 1.25;

  return {
    total,
    base: type.attack,
    veteran: attacker.rank > 0,
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
  // The same losses, on the other foot: fewer of them left to hold the line.
  total *= headcount(defender);
  total *= rankBonus(defender);
  if (hasPerk(defender, 'dug-in')) total *= PERK_BONUS;
  total *= terrain.defense;
  if (fortified) total *= FORTIFY_BONUS_REF.value;
  total *= wallsMult;
  if (berserk) total *= 0.75;

  return {
    total,
    base: type.defense,
    veteran: defender.rank > 0,
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
  // Measured in shields rather than health. Health used to stand in for how
  // big a thing was, because it scaled with the count; now that it does not,
  // price is the honest measure -- and without this a Death Knight could once
  // again delete Ten Orcs, which is the exact thing the guard exists to stop.
  if (d.cost > a.cost) return false;
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
  // The strengths above already count the losses each side arrived with, so
  // divide those out to get the part that does not change during the fight.
  // Everything else -- terrain, walls, rank, supply -- is fixed for the
  // duration; only the headcount moves, and it moves every round.
  const atkStatic = atk.total / Math.max(0.0001, headcount(attacker));
  const defStatic = def.total / Math.max(0.0001, headcount(defender));

  let rounds = 0;
  const result = withRng(state, (rng) => {
    while (attacker.hp > 0 && defender.hp > 0) {
      rounds++;
      // Recomputed per round rather than fixed at the start. A stack that is
      // being cut down swings weaker with every exchange, which is the whole
      // of DESIGN_QUEUE section 31: fixed odds plus health that scales with
      // the count is what made a big enough stack unbeatable by anything.
      const a = atkStatic * headcount(attacker);
      const d = defStatic * headcount(defender);
      // A defence of zero would make the fight a certainty; keep it a contest.
      const pAttack = a / Math.max(0.0001, a + d);
      if (rng.float() < pAttack) applyDamage(defender, dmg, damageKindOf(attacker));
      else applyDamage(attacker, dmg, damageKindOf(defender));
      // Runaway guard: an unwinnable matchup should not spin forever.
      if (rounds > 500) break;
    }
    const attackerWon = defender.hp <= 0;
    const winner = attackerWon ? attacker : defender;
    // Experience rather than a coin toss; awarded after the fight resolves,
    // outside this RNG block, so the message lands in the right order.
    const promoted = false;
    void winner;
    return { attackerWon, promoted };
  });

  attacker.hp = Math.max(0, attacker.hp);
  defender.hp = Math.max(0, defender.hp);

  // Whatever the magical one did, it leaves behind. Both directions: a mage
  // that fought off an orc has still set it alight.
  applySpellEffects(state, attacker, defender);
  applySpellEffects(state, defender, attacker);

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

/** Rounds the townsfolk will stand there throwing things before giving up. */
export const MILITIA_ROUNDS = 3;

export interface MilitiaResult {
  /** True if the attacker got in. */
  taken: boolean;
  /** Damage the attacker took doing it. */
  damage: number;
}

/**
 * An attempt to walk into a city nobody is guarding.
 *
 * The citizens are not a unit -- they have no health, cannot be killed, and
 * never appear on the board. They simply make the attacker pay something on
 * the way in, and occasionally kill a weak enough attacker outright.
 *
 * A strong attacker still walks in; that is intended. The point is not to make
 * cities safe, it is to stop a single wandering goblin annexing a town of
 * eight people for free.
 */
export function stormEmptyCity(state: GameState, attacker: Unit, city: City): MilitiaResult {
  // Some reputations arrive before the army does, and the townsfolk decide
  // this is somebody else's problem.
  if (hasPerk(attacker, 'reputation')) return { taken: true, damage: 0 };
  const atk = attackStrength(state, attacker, attacker).total;
  const def = militiaStrength(city);
  if (def <= 0) return { taken: true, damage: 0 };

  const dmg = Math.max(1, Math.round(unitType(attacker.type).hp / 12));
  const pAttack = atk / Math.max(0.0001, atk + def);

  const damage = withRng(state, (rng) => {
    let taken = 0;
    for (let i = 0; i < MILITIA_ROUNDS; i++) if (rng.float() >= pAttack) taken += dmg;
    return taken;
  });
  applyDamage(attacker, damage, 'physical');
  return { taken: attacker.hp > 0, damage };
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
    // A blast is a blast: nothing magical resists being stood next to one.
    applyDamage(victim, Math.max(1, Math.round(unitType(victim.type).hp * power)), 'physical');
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
