import { distance, idx } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import { hasPerk } from '../model/perks';
import { TERRAIN } from '../model/terrain';
import { headcount, needsAmmo, unitType } from '../model/units';
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

/**
 * Turns before a thrower has fetched its own axe back.
 *
 * Two, so it throws every other fight rather than once and then never again.
 * Lives here rather than in `abilities` because the axe now leaves the hand
 * during a first strike, and `abilities` already imports from this module --
 * the other direction would be a cycle.
 */
export const REARM_TURNS = 2;

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
/**
 * The one killing blow a Mostly Volatile sapper walks away from.
 *
 * Section 11 left a question open: does the saved sapper detonate on the blow
 * it survived, or does the blast wait for the second? It waits, and it does so
 * *by falling out of the rules already there* rather than by a special case --
 * a sapper only detonates when it dies, and this one did not die. Surviving
 * and going off would have been a lot of value out of one perk.
 *
 * Intercepted here rather than in the combat loop so it covers every way a
 * unit can be killed: an exchange, somebody else's blast, or a fire.
 */
function survivesOnce(unit: Unit, wouldBeFatal: boolean): boolean {
  if (!wouldBeFatal) return false;
  if (!hasPerk(unit, 'mostly-volatile')) return false;
  if (unit.reprieved) return false;
  unit.reprieved = true;
  return true;
}

export function applyDamage(unit: Unit, amount: number, kind: DamageKind): number {
  if (amount <= 0) return 0;
  const dealt = Math.round(amount * (1 - resistance(unit, kind)));
  unit.hp -= dealt;
  // Left standing on one hit point, the once. Reported as the full damage
  // dealt regardless, so nothing downstream has to know it was interrupted.
  if (survivesOnce(unit, unit.hp <= 0)) unit.hp = 1;
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
  const fire = hasFlag(owner, 'pyromancy');
  const ice = hasFlag(owner, 'cryomancy');
  if (!fire && !ice) return;

  // One spell per blow. Casting both left a target burning *and* frozen, which
  // is not a thing that happens to anybody; and simply letting the second
  // overwrite the first would have quietly made whichever advance ran first
  // worthless to anyone holding both, which is a worse bug for being invisible.
  //
  // Alternated on the turn rather than rolled for, deliberately: this runs on
  // every blow in the game, and drawing from the seeded stream here would shift
  // everything downstream of it to answer a question that does not need
  // randomness.
  const casts: 'burning' | 'frozen' =
    fire && ice ? (state.turn % 2 === 0 ? 'burning' : 'frozen') : fire ? 'burning' : 'frozen';
  applyStatus(target, casts, SPELL_TURNS[casts]);
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
  const type = unitType(unit.type);
  const wantsAxe = type.throwsWeapon && unit.disarmed;
  const wantsMissiles = needsAmmo(unit);
  if (!type.throwsWeapon && type.ammo <= 0) return 'This unit has nothing to restock.';
  if (!wantsAxe && !wantsMissiles) {
    return type.throwsWeapon ? 'It already has its axe.' : 'It is already loaded.';
  }
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
  const type = unitType(unit.type);
  // A city has a whole armoury in it, so this fills the magazine rather than
  // handing over one missile the way a neighbour in the field does.
  if (type.ammo > 0 && needsAmmo(unit)) {
    unit.ammo = type.ammo;
    log(state, `${type.name} loads up from the city stores.`, 'good', unit.owner, 'promote', [unit.x, unit.y]);
  }
  rearm(state, unit, 'draws a fresh axe from the stores');
  unit.moves = 0;
  return true;
}

export function rearm(state: GameState, unit: Unit, how: string): void {
  if (!unit.disarmed) return;
  unit.disarmed = false;
  // Whichever way the axe came back, the slow way is no longer pending.
  delete unit.rearmIn;
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
  /**
   * The attacker broke off rather than dying, and is owed a step backwards.
   * The caller must move it or finish it: it is standing on one hit point in
   * front of the thing that nearly killed it.
   */
  withdrew?: boolean;
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

/** Share of a neighbour's health an exploding club takes off. */
export const CLUB_BLAST = 0.15;
/** What the ogre keeps of its own blast. It minds, but less. */
export const CLUB_SELF = 0.4;
/** Share of health the ground taking sides costs everyone nearby. */
export const CLUB_QUAKE = 0.12;

/**
 * What an ogre's club does after the swing has landed.
 *
 * DESIGN_QUEUE section 11 asked for three, and they differ in *who* they catch
 * rather than in how hard they hit:
 *
 * - **Fiery** sets the target alight and nothing else. The only one that is
 *   safe to swing next to your own line.
 * - **Exploding** goes off at the target, catching everything around it, friend
 *   and enemy alike, and the ogre takes a share of its own blast.
 * - **Quake** shakes the ground under everything next to the *ogre*, which is a
 *   different shape entirely: it is a way out of being surrounded.
 *
 * All three run after the fight resolves, so a dead ogre swings no club and a
 * dead target still burns nobody.
 */
function clubEffects(state: GameState, attacker: Unit, target: Unit): void {
  if (attacker.hp <= 0) return;
  if (unitType(attacker.type).base !== 'ogre') return;

  if (hasPerk(attacker, 'fiery-club') && target.hp > 0) {
    applyStatus(target, 'burning', SPELL_TURNS.burning);
    log(state, `${unitType(target.type).name} is set alight.`, 'combat', attacker.owner,
        undefined, [target.x, target.y], target.id);
  }

  const sweep = (centre: Unit, share: number, hostileOnly: boolean, cue: string, how: string) => {
    const caught = state.units.filter(
      (u) =>
        u.id !== attacker.id &&
        u.hp > 0 &&
        distance(u.x, u.y, centre.x, centre.y) <= 1 &&
        (!hostileOnly || u.owner !== attacker.owner),
    );
    if (caught.length === 0 && !hostileOnly) return;
    const killed: Unit[] = [];
    for (const victim of caught) {
      // A blast is a blast: nothing magical resists being stood next to one.
      applyDamage(victim, Math.max(1, Math.round(unitType(victim.type).hp * share)), 'physical');
      if (victim.hp <= 0) killed.push(victim);
    }
    if (caught.length > 0) {
      log(state, `${unitType(attacker.type).name} ${how}, catching ${caught.length} unit(s).`,
          'combat', attacker.owner, cue as never, [centre.x, centre.y], attacker.id);
    }
    for (const victim of killed) {
      const i = state.units.indexOf(victim);
      if (i >= 0) state.units.splice(i, 1);
      log(state, `${unitType(victim.type).name} does not get up.`, 'bad', victim.owner);
    }
  };

  if (hasPerk(attacker, 'exploding-club')) {
    sweep(target, CLUB_BLAST, false, 'explosion', 'brings the club down and it goes off');
    // Its own blast, at a discount. Never enough to kill it outright, because a
    // unit that explodes itself on a win is a perk nobody would ever choose.
    const self = Math.max(1, Math.round(unitType(attacker.type).hp * CLUB_BLAST * CLUB_SELF));
    attacker.hp = Math.max(1, attacker.hp - self);
  }

  if (hasPerk(attacker, 'quake-club')) {
    sweep(attacker, CLUB_QUAKE, true, 'explosion', 'hits the ground rather than the ogre in front');
  }
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

  // Free rounds before the fight proper, to whoever strikes first and by how
  // much more than the other. Netting them is what stops two archers giving
  // each other a free hit and calling it even.
  const edge = unitType(attacker.type).firstStrikes - unitType(defender.type).firstStrikes;
  if (edge !== 0) {
    const striker = edge > 0 ? attacker : defender;
    const struck = edge > 0 ? defender : attacker;
    for (let i = 0; i < Math.abs(edge) && struck.hp > 0; i++) {
      applyDamage(struck, dmg, damageKindOf(striker));
    }
    // And for a thrower, the free blow *is* the axe leaving its hand. It gets
    // the rest of the fight without one, and fetches it back afterwards.
    if (unitType(striker.type).throwsWeapon && !striker.disarmed) {
      striker.disarmed = true;
      striker.rearmIn = REARM_TURNS;
      // Says so out loud, which is also what puts the axe on the screen: the
      // interface reads this cue and throws the animation along the same line.
      // Without it the one throw in the game had no picture at all.
      log(
        state,
        `${unitType(striker.type).name} throws its axe at ${unitType(struck.type).name}.`,
        'combat',
        striker.owner,
        'axe-throw',
        [struck.x, struck.y],
        striker.id,
      );
    }
  }

  let rounds = 0;
  let withdrew = false;
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
      else {
        applyDamage(attacker, dmg, damageKindOf(defender));
        // Knowing when to stop. A fight here runs until somebody dies, so
        // "fails to kill what it attacked" can only ever mean *losing* -- this
        // is Civ4's withdrawal, and it is the only reading of section 11's
        // brief that can actually happen. The caller does the stepping back,
        // and kills it after all if there is nowhere to go.
        if (attacker.hp <= 0 && hasPerk(attacker, 'better-part-of-valour')) {
          attacker.hp = 1;
          withdrew = true;
          break;
        }
      }
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
  clubEffects(state, attacker, defender);

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
    withdrew,
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
/**
 * Share of a unit's shields handed back when it is broken up in a city.
 *
 * Half is the usual answer and is probably right: any higher and a unit becomes
 * a better shield store than a shield is, and people would build them to melt
 * them.
 */
export const DISBAND_REFUND = 0.5;

/** Why this unit cannot be disbanded, or null if it can. */
export function disbandBlocked(state: GameState, unit: Unit): string | null {
  if (unit.owner !== state.activePlayer) return 'Not yours to dismiss.';
  return null;
}

/**
 * What breaking this unit up would give back, which is nothing outside a city.
 *
 * Credited to the city it is standing in rather than the one that built it.
 * That does let an army walk its value to wherever it is wanted -- but walking
 * costs turns, which is a real price, and the alternative makes the refund
 * useless exactly when it is most wanted: finishing something in the city you
 * are defending, with the obsolete unit that is standing in it.
 */
export function disbandRefund(state: GameState, unit: Unit): number {
  const city = cityAt(state, unit.x, unit.y);
  if (!city || city.owner !== unit.owner) return 0;
  return Math.floor(unitType(unit.type).cost * DISBAND_REFUND);
}

/**
 * Whether a refund handed to this city would actually be kept.
 *
 * The standing orders empty the shield box every turn -- Coin turns it into
 * gold, Study into beakers, and Placating banks nothing at all by design. So
 * breaking a unit up in a city set to one of them pays the shields in and
 * watches them go straight back out, which is correct behaviour and completely
 * invisible. The interface says so rather than letting somebody find out.
 */
export function refundWouldStick(state: GameState, unit: Unit): boolean {
  const city = cityAt(state, unit.x, unit.y);
  if (!city || city.owner !== unit.owner) return false;
  return city.producing.kind === 'unit' || city.producing.kind === 'building';
}

/**
 * Get rid of a unit on purpose.
 *
 * There was previously no way at all: a Peon that had founded everything worth
 * founding, or a Goblin left over from an advance three tiers ago, cost upkeep
 * for ever and could only be disposed of by walking it into something.
 */
export function disband(state: GameState, unit: Unit): number {
  if (disbandBlocked(state, unit) !== null) return 0;
  const refund = disbandRefund(state, unit);
  if (refund > 0) {
    const city = cityAt(state, unit.x, unit.y)!;
    city.shields += refund;
    log(
      state,
      `${unitType(unit.type).name} is broken up in ${city.name} for ${refund} shields.`,
      'info',
      unit.owner,
      undefined,
      [city.x, city.y],
    );
  } else {
    log(state, `${unitType(unit.type).name} is dismissed.`, 'info', unit.owner, undefined, [unit.x, unit.y]);
  }
  const i = state.units.indexOf(unit);
  if (i >= 0) state.units.splice(i, 1);
  return refund;
}

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
