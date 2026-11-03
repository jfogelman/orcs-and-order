import { UPGRADES, UPGRADES_BY_ID } from '../model/upgrades';
import type { UpgradeDef, UpgradeEffect } from '../model/upgrades';
import { unitType, maxHp } from '../model/units';
import { isMounted, onOwnLand } from './follyEffects';
import { hasStatus } from './status';
import { besideWater } from './dispersal';
import { cityAt } from './gamestate';
import { defenseOf } from '../model/terrain';
import { idx } from '../engine/grid';
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
export function upgradeAttack(state: GameState, unit: Unit, against?: Unit): number {
  if (!UPGRADES.enabled) return 0;
  let bonus = upgradeStat(unit, 'attack');

  // `orc-berserker`: +2 attack and -1 defence below half health. The defence
  // half is in `upgradeDefence`; this is an orc that fights better the worse
  // it is doing, which is the single most Horde sentence in the upgrade bible.
  if (hasUpgrade(unit, 'orc-berserker') && unit.hp < maxHp(unit) / 2) {
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

  // ---------------------------------------------------------------- slice 6
  //
  // The three newer factions. Everything below reuses the seams the Horde's
  // and the Kingdom's set opened in slice 5 -- an adjacency loop, a condition
  // on the ground, a condition on the target -- which is most of why fifty-four
  // more effects is a smaller job than the first thirty-six were.

  // `fodder-swarm`: *"+2 attack for each other Swarm or ordinary Fodder in the
  // same stack"*. **This game is one unit to a tile**, so Jeremy's ruling of
  // 2026-11-02 reads "stack" as "adjacent" -- the idiom the Ogre Warlord and
  // the Dread Knight already use. The cap is the bible's own.
  if (hasUpgrade(unit, 'fodder-swarm')) {
    const shapes = neighbours(state, unit, 'friendly').filter(
      (n) => unitType(n.type).base === 'fodder',
    ).length;
    bonus += Math.min(SWARM.cap, SWARM.each * shapes);
  }

  // `elite-warform` and `broodlord-many` are not here: Jeremy read their extra
  // attacks as extra *opening* blows, which `firstStrikesOf` grants.

  // `soldier-reaver`: *"bonus vs. cities"*, which is the Reaver's whole point
  // -- a longer blade on the same shell, pointed at a wall.
  if (hasUpgrade(unit, 'soldier-reaver') && cityAt(state, against?.x ?? -1, against?.y ?? -1)) {
    bonus += REAVER.againstCities;
  }

  // `outcast-grudge`: it has a specific list of people, and the list is the
  // Horde. Faction rather than ownership, because the grudge is about who
  // they are rather than whose side they are on this week.
  if (hasUpgrade(unit, 'outcast-grudge') && against && unitType(against.type).faction === 'orc') {
    bonus += GRUDGE.againstTheHorde;
  }

  // `sylph-gale` and `slinger-marksman`: open ground, which here means ground
  // that gives its defender nothing. A tile whose terrain multiplier is one.
  if (against && openGround(state, against)) {
    if (hasUpgrade(unit, 'sylph-gale')) bonus += GALE.inTheOpen;
    if (hasUpgrade(unit, 'slinger-marksman')) bonus += MARKSMAN_SHOT.inTheOpen;
  }

  // `naiad-tidal`: a Naiad is only really itself near its own water, and this
  // one more so. Reuses `besideWater`, which section 152 already defined.
  if (hasUpgrade(unit, 'naiad-tidal') && besideWater(state, unit)) bonus += TIDAL.besideWater;

  // `wf-skirmisher-cutpurse`: everything on the battlefield is technically
  // unclaimed, and a battlefield is somewhere that is not home.
  if (hasUpgrade(unit, 'wf-skirmisher-cutpurse') && !onOwnLand(state, unit.owner, unit.x, unit.y)) {
    bonus += CUTPURSE.abroad;
  }

  // `warden-purging`: what it touches does not come back, and the things that
  // come back are the Unbound.
  if (hasUpgrade(unit, 'warden-purging') && against && isSpirit(state, against)) {
    bonus += PURGING.againstSpirits;
  }

  for (const near of neighbours(state, unit, 'friendly')) {
    // `warband-sergeant`: nobody voted, several agreed afterwards.
    if (hasUpgrade(near, 'warband-sergeant')) bonus += SERGEANT_AT_ARMS.attack;
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
      // `jinn-fineprint`: the wording was agreed, and the wording was read.
      if (hasUpgrade(near, 'jinn-fineprint')) bonus -= FINE_PRINT.attack;
    }
  }

  // `bonebound-rattling`: the noise is considered part of the service. Unlike
  // the auras above this one is about *who it is swinging at* rather than who
  // is standing nearby, so a Bonebound rattles only at whoever came for it.
  if (against && hasUpgrade(against, 'bonebound-rattling')) bonus -= RATTLING.attack;

  return bonus;
}

/** The same, for defence. */
export function upgradeDefence(state: GameState, unit: Unit): number {
  if (!UPGRADES.enabled) return 0;
  let bonus = upgradeStat(unit, 'defence');

  if (hasUpgrade(unit, 'orc-berserker') && unit.hp < maxHp(unit) / 2) {
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

  // `warband-caravanguard`: the job was originally to protect the wagons, and
  // has since been extended. Unlike the shieldwall above it does not care what
  // kind of thing it is standing in front of -- a caravan guard guards the
  // caravan, which is whoever is with it.
  for (const near of neighbours(state, unit, 'friendly')) {
    if (hasUpgrade(near, 'warband-caravanguard')) {
      bonus += CARAVAN_GUARD.defence;
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
export function firstStrikesOf(unit: Unit, against?: Unit): number {
  // Section 155, `mage-warden`, Jeremy's second reading of it: nobody gets a
  // free opening blow against a Warden Mage at all. Before the subtractions
  // below, because there is nothing left to subtract from.
  if (against && hasUpgrade(against, 'mage-warden')) return 0;
  let n = unitType(unit.type).firstStrikes;
  if (hasUpgrade(unit, 'archer-marksman')) n -= MARKSMAN.firstStrikes;
  // `knight-lance`: a lance is a thing for use against horses, and this is the
  // only upgrade in the thirty-six whose effect depends on *what it is
  // fighting* -- hence the second parameter, which every other caller omits.
  if (against && hasUpgrade(unit, 'knight-lance') && isMounted(against)) n += LANCE.firstStrikes;
  // `archer-volley`, on Jeremy's reading of 2026-10-30. The bible's "any unit
  // in range regardless of intervening units" means nothing at range 1, and
  // what an Archer has instead of range is the free opening blow -- so a
  // Volley Archer gets two of them.
  if (hasUpgrade(unit, 'archer-volley')) n += VOLLEY.firstStrikes;
  // Section 155 slice 6. **Five more that cannot have range.** The Spitter and
  // the Slinger have `range: 1` exactly as the Archer does, so "+1 range of
  // effect" and "attacks one tile further" describe nothing -- and Jeremy
  // ruled that shape twice for the Archer, both times as a free opening blow.
  // Applied here by precedent rather than asked a third time.
  //
  // `elite-warform` and `broodlord-many` are his explicit ruling of
  // 2026-11-02: a unit in this game attacks once a turn, so "attacks more"
  // becomes "gets in first, twice".
  for (const id of OPENS_TWICE) if (hasUpgrade(unit, id)) n += 1;
  return Math.max(0, n);
}

/**
 * Whether anything beside this unit is shrugging the first blow off for it.
 *
 * `footman-sergeant`: *"adjacent Footmen ignore the first point of damage
 * taken each combat"*. Read once at the top of a fight rather than per blow,
 * because "the first" has to mean the first of that fight and `applyDamage`
 * has no idea which fight it is in.
 */
export function shrugsFirstBlow(state: GameState, unit: Unit): boolean {
  if (!UPGRADES.enabled) return false;
  if (unitType(unit.type).base !== 'footman') return false;
  return neighbours(state, unit, 'friendly').some((n) => hasUpgrade(n, 'footman-sergeant'));
}

/**
 * Whether this unit's ability leaves it the rest of its turn.
 *
 * Two upgrades, one sentence between them: `mage-battle` is *"no 'costs the
 * whole turn' penalty after striking"* and `paladin-warden` is *"heal no
 * longer costs the whole turn"*. Asked in `abilities.ts` at each of the two
 * places that spend the turn, so the pair cannot drift apart.
 */
export function keepsItsTurn(unit: Unit, ability: 'ranged' | 'heal'): boolean {
  if (!UPGRADES.enabled) return false;
  if (ability === 'ranged') return hasUpgrade(unit, 'mage-battle');
  return hasUpgrade(unit, 'paladin-warden');
}

/** How far a sapper's blast reaches: one tile, and `sapper-deep` makes it two. */
export function blastRadius(sapper: Unit): number {
  return 1 + (UPGRADES.enabled ? upgradeStat(sapper, 'blast') : 0);
}

/** What a Marksman gives up for its two points. */
export const MARKSMAN = { firstStrikes: 1 };

/** What a lance is worth against something on a horse. */
export const LANCE = { firstStrikes: 1 };

/** A second opening shot, for the archer line that could not have range. */
export const VOLLEY = { firstStrikes: 1 };

/** What a broken bone costs the line it was holding. */
export const BONEBREAKER = { pierces: 1 };

/** How much more of the blow an Elder Dragon's breath carries through. */
export const ELDER = { carries: 0.3 };

/** What a Sergeant's Footmen shrug off, once a fight. */
export const SERGEANT = { ignores: 1 };

/**
 * Whether this unit gets its movement at all this turn. Section 155.
 *
 * **One upgrade in thirty-six needs this**, and it needs it because the flat
 * number did not work: `orc-guardian` reads "-1 movement" and an orc has one,
 * so taken literally the Guardian could never move again. Jeremy's answer on
 * 2026-10-29 was *one tile every two turns*, which is a real cost that still
 * leaves a unit playing -- the same shape as `FREEZE_SLOW`, and the same
 * reasoning behind it.
 *
 * Every Guardian in the game steps on the same turns, which is predictable to
 * play against and, for a creature whose joke is that it has finally learned
 * to wait, rather the point.
 */
export function movesThisTurn(state: GameState, unit: Unit): boolean {
  if (!UPGRADES.enabled) return true;
  if (hasUpgrade(unit, 'orc-guardian')) return state.turn % GUARDIAN.everyTurns === 0;
  return true;
}

/**
 * The unit standing in front of this one, if anybody is. Section 155.
 *
 * `orc-guardian`'s other half, and the reason it is worth two points of
 * defence and half its speed: it can spend a turn **covering** somebody
 * adjacent, and whatever comes for them meets the Guardian instead.
 *
 * Returns the Guardian rather than a boolean, because the caller substitutes
 * it into the fight whole -- its own defence, its own health, its own death.
 * Checked for adjacency again here rather than trusted from when the order was
 * given, since both of them may have moved since.
 */
export function coveringFor(state: GameState, unit: Unit): Unit | null {
  if (!UPGRADES.enabled) return null;
  for (const near of neighbours(state, unit, 'friendly')) {
    if (near.covering === unit.id && near.hp > 0 && hasUpgrade(near, 'orc-guardian')) return near;
  }
  return null;
}

/** How often a Guardian may move, in turns, and what covering costs. */
export const GUARDIAN = { everyTurns: 2 };

/** What a Brawler's backswing is worth, as a share of what it dealt. */
export const BRAWLER = { share: 0.5 };

/**
 * What a Warden Mage shrugs off, as a share of any blow. Section 155.
 *
 * **The second reading of this upgrade, and the first one that is worth
 * anything.** As written in the bible -- *"first strike against this unit
 * deals reduced damage"* -- it was a no-op: `damagePerRound` is
 * `max(1, round(maxHp / 15))`, so a free blow is one hit point for
 * seventy-eight of the game's eighty-one creatures, and half of one is one.
 * Measured before it was believed, and taken back out.
 *
 * Jeremy's answer on 2026-10-30 was to make it both larger and simpler: half
 * of **any** attack, and no free first strike against it at all. Read through
 * `resistance`, which is the one thing `applyDamage` consults -- so it covers
 * an exchange, a blast, a dragon's breath and a militia, and does **not**
 * cover burning, which takes its health directly and is not an attack.
 */
export const WARD = { share: 0.5 };

/** How much of any blow this unit's upgrade shrugs off, 0..1. */
export function wardShare(unit: Unit): number {
  return hasUpgrade(unit, 'mage-warden') ? WARD.share : 0;
}

/**
 * How many axes this thrower has to throw before it is empty-handed.
 *
 * One, unless it is `axethrower-twin`, which carries a spare: *"can throw
 * twice before dropping to reduced strength"*. The count is what forced
 * `Unit.axesThrown` to exist -- `disarmed` is a boolean, and for a creature
 * with one axe a boolean and a count are the same thing, which is why nothing
 * noticed until there were two.
 */
export function axesCarried(unit: Unit): number {
  return 1 + (UPGRADES.enabled && hasUpgrade(unit, 'axethrower-twin') ? TWIN.spare : 0);
}

/**
 * Defence this attacker's blows go straight through. Section 155.
 *
 * `axethrower-heavy` is *"thrown strikes ignore 1 point of target defense"*,
 * and in this engine **a thrown strike does not consult defence at all** --
 * the free opening blow deals `damagePerRound`, which is a function of health.
 * So the sentence has no literal home, and the nearest true one is the fight
 * the throw opens: a Heavy Thrower's target holds the line one point worse.
 *
 * Read in `defenseStrength`, which already takes the attacker for the sake of
 * siege engines, so this costs no new plumbing.
 */
export function piercesDefence(attacker: Unit | undefined): number {
  if (!UPGRADES.enabled || !attacker) return 0;
  if (hasUpgrade(attacker, 'axethrower-heavy')) return HEAVY.pierces;
  // `troll-bonebreaker`, on Jeremy's reading of 2026-10-30. Written as a
  // debuff lasting two turns, which a probe found can never land: 0 of 2160
  // melee fights leave both sides alive. Applied to the fight instead, where
  // the bone actually breaks.
  if (hasUpgrade(attacker, 'troll-bonebreaker')) return BONEBREAKER.pierces;
  return 0;
}

/**
 * What share of a dragon's blow carries into the tile behind. Section 155.
 *
 * `dragon-elder` is *"breath damage increases"*, and the carry-through is the
 * part of a dragon's attack that is actually the breath -- everything else
 * about it is an ordinary fight. So that is what gets stronger.
 *
 * Its written drawback was flying over enemy cities at double cost, which no
 * unit in this game may do at all. Jeremy's ruling on 2026-10-30 was to keep
 * the stronger breath and pay for it somewhere the game can express: an Elder
 * Dragon is a *slower* dragon, which is also what "circling to line up the
 * shot" should look like. It has four movement points, so one off is a real
 * cost and not the trap `orc-guardian` fell into.
 */
export function breathShare(attacker: Unit, base: number): number {
  return UPGRADES.enabled && hasUpgrade(attacker, 'dragon-elder') ? base + ELDER.carries : base;
}

/** Whether this unit might find its axe again before the slow walk back. */
export function retrievesAxe(unit: Unit): boolean {
  return UPGRADES.enabled && hasUpgrade(unit, 'axethrower-retriever');
}

/** The spare axe, the point it goes through, and the odds of finding one again. */
export const TWIN = { spare: 1 };
export const HEAVY = { pierces: 1 };
/**
 * An invented number, like every first answer here. Half, so a Retriever
 * averages one turn without its axe where `REARM_TURNS` is two -- worth
 * having, and short of the Twin Thrower's second axe, which is certain.
 */
export const RETRIEVER = { odds: 0.5 };

/**
 * What a condition is worth to a defence. Section 155.
 *
 * `paladin-champion` puts `blessed` on whatever it heals. Read here rather
 * than in `status.ts` because it is an upgrade rule first and a condition
 * second -- nothing else in the game applies it, and with the upgrades
 * switched off it can never appear at all.
 *
 * It had a twin, briefly. `troll-bonebreaker` was going to put `broken` on
 * whatever a troll hit, until a probe found that **zero of 2160 melee fights
 * leave both sides alive** -- so a lasting debuff on a combat survivor can
 * never fire. See the unwired list.
 */
export function conditionDefence(unit: Unit): number {
  return hasStatus(unit, 'blessed') ? CHAMPION.defence : 0;
}

/** Whether this dragon's breath spares whatever of its own is behind the line. */
export function breathSpares(unit: Unit): boolean {
  return UPGRADES.enabled && hasUpgrade(unit, 'dragon-wyrm');
}

/** What a Champion's blessing is worth, and for how long. */
export const CHAMPION = { defence: 1, turns: 1 };

/**
 * Whether a blast spares this neighbour. Section 155, `sapper-cadre`.
 *
 * *"Can be deployed in pairs without doubling detonation risk to each other."*
 * A sapper's blast catches everything standing next to it, its own side
 * included, so two sappers side by side are a liability to each other -- and
 * a pair is exactly what you want when one bundle is not enough. A Cadre is
 * not caught by another Cadre of its own side; everything else still is, and
 * a blast still does not chain.
 */
export function sparedByBlast(sapper: Unit, victim: Unit): boolean {
  if (!UPGRADES.enabled) return false;
  if (victim.owner !== sapper.owner) return false;
  return hasUpgrade(sapper, 'sapper-cadre') && hasUpgrade(victim, 'sapper-cadre');
}

/**
 * Health a troll knits back while the fight is still going on.
 *
 * `troll-regen` is *"healing applies mid-combat, not just end of turn"*, and
 * the rate is the whole question. **A blow in this game is one point and
 * lands about half the time**, so a troll taking roughly half a point a round
 * becomes literally unkillable at anything faster than one point every two
 * rounds. One in four is a quarter of a point a round: worth having, and well
 * short of immortal.
 *
 * Invented, like every first number here, and the arithmetic above is why it
 * is not larger rather than a measurement saying it should not be.
 */
export function knitsMidFight(unit: Unit): boolean {
  return UPGRADES.enabled && hasUpgrade(unit, 'troll-regen');
}

/** How often a knitting troll gets a point back, in rounds, and how much. */
export const KNIT = { everyRounds: 4, amount: 1 };

/**
 * Whether this unit carries a passenger, and how many. Section 155.
 *
 * `dragon-rider` is *"can carry one ground unit, dropping it in an adjacent
 * tile"*, which is the ship mechanism exactly -- `cargo`, `board`, `unload`
 * and `landingTiles` all work on anything that will hold somebody, and only
 * ever asked `sails`. So the dragon is let in through the same door rather
 * than given a second one.
 */
export function ridesAlong(unit: Unit): boolean {
  return UPGRADES.enabled && hasUpgrade(unit, 'dragon-rider');
}

/** Seats this unit has, counting the one its upgrade adds. */
export function seatsOn(unit: Unit): number {
  return unitType(unit.type).carries + (ridesAlong(unit) ? RIDER.carries : 0);
}

/**
 * Whether this unit may make one crossing of ground it cannot stand on.
 *
 * `sapper-tunnel`, *"can move through impassable terrain once before
 * detonating"*. The only ground impassable to a sapper in this game is water,
 * both kinds -- mountains cost three to cross and cross fine -- so this is a
 * sapper going under a lake, once.
 *
 * **The pathfinder is deliberately not told.** A one-use pass and a route
 * planner do not mix: the planner would happily lay out a five-tile sea
 * crossing on a budget of one. So a march is never routed through water, and
 * the step has to be taken by hand -- which is also the only way the player
 * finds out the pass has been spent.
 */
export function tunnelsOnce(unit: Unit): boolean {
  return UPGRADES.enabled && hasUpgrade(unit, 'sapper-tunnel') && unit.tunnelled !== true;
}

/** The seat a Dragon Rider adds. */
export const RIDER = { carries: 1 };

/**
 * Ground that gives its defender nothing. Section 155 slice 6.
 *
 * Two upgrades say "on open ground" -- `sylph-gale` and `slinger-marksman` --
 * and the game has no such category, but it has the thing the category is
 * about: `defenseOf` is the multiplier a tile hands whoever stands on it, and
 * open ground is a tile that hands over one.
 */
export function openGround(state: GameState, unit: Unit): boolean {
  const i = idx(unit.x, unit.y, state.width);
  return defenseOf(state.terrain[i], state.specials[i]) <= 1;
}

/** Whether this unit is one of the things that comes back. */
export function isSpirit(state: GameState, unit: Unit): boolean {
  return state.players[unit.owner]?.faction === 'unbound';
}

/**
 * Upgrades whose extra reach or extra attack became an extra opening blow.
 *
 * Three because their creature has `range: 1` and the bible gave it range;
 * two because Jeremy read "attacks twice" that way rather than teaching the
 * game a second attack per turn for two units.
 */
export const OPENS_TWICE = [
  'spitter-long',
  'slinger-steady',
  'slinger-marksman',
  'elite-warform',
  'broodlord-many',
] as const;

/** Section 155 slice 6's numbers, every one a first answer from the bible. */
export const SWARM = { each: 2, cap: 3 };
export const REAVER = { againstCities: 2 };
export const GRUDGE = { againstTheHorde: 3 };
export const GALE = { inTheOpen: 4 };
export const MARKSMAN_SHOT = { inTheOpen: 5 };
export const TIDAL = { besideWater: 4 };
export const CUTPURSE = { abroad: 1, plunder: 2 };
export const PURGING = { againstSpirits: 3 };
export const SERGEANT_AT_ARMS = { attack: 1 };
export const CARAVAN_GUARD = { defence: 2 };
export const FINE_PRINT = { attack: 2 };
export const RATTLING = { attack: 1 };

/**
 * The three upgrades that mend whoever is standing next to them, and the one
 * that mends itself. Section 155 slice 6.
 *
 * Run at the top of a side's turn, beside the Grave Knight's bookkeeping.
 * Adjacent rather than "in its stack", which is Jeremy's ruling of 2026-11-02
 * and the only reading this game has -- one unit to a tile.
 *
 * Capped at `maxHp` like every other heal, and it does not care whether the
 * patient is `spent`: that status stops a troll tearing itself in half twice,
 * and has nothing to say about somebody else's bandages.
 */
export function tendTheWounded(state: GameState, playerId: number): void {
  if (!UPGRADES.enabled) return;
  const mine = state.units.filter((u) => u.owner === playerId && u.hp > 0);
  for (const healer of mine) {
    const keeper = hasUpgrade(healer, 'broodlord-keeper');
    const hauler = hasUpgrade(healer, 'wf-brute-hauler');
    if (!keeper && !hauler) continue;
    const amount = keeper ? KEEPER.heals : HAULER.heals;
    for (const near of neighbours(state, healer, 'friendly')) {
      if (near.hp <= 0 || near.hp >= maxHp(near)) continue;
      near.hp = Math.min(maxHp(near), near.hp + amount);
    }
  }
  // `naiad-still`: nothing disturbs it, and the water puts it back together.
  for (const unit of mine) {
    if (!hasUpgrade(unit, 'naiad-still') || !besideWater(state, unit)) continue;
    unit.hp = Math.min(maxHp(unit), unit.hp + STILL_WATER.heals);
  }
}

/**
 * Whether this unit walks away from a fight it lost. Section 155 slice 6.
 *
 * `better-part-of-valour` has been in the game since section 11 and **fired
 * zero times in a probe of 2160 fights** -- no creature carries the perk.
 * Jeremy's ruling of 2026-11-02 gives it to the mercenary who is paid to go
 * last, which makes a dead rule live rather than adding a second one beside
 * it. The bible says "retreat without penalty"; this game's version of that
 * is surviving on one hit point and stepping back, which the mover already
 * knows how to do.
 */
export function breaksOff(unit: Unit): boolean {
  return UPGRADES.enabled && hasUpgrade(unit, 'wf-skirmisher-rearguard');
}

/**
 * What a Reckoner takes out of everyone who came for it after the first.
 *
 * *"Counter-attacks every attacker in a turn"*, and every defender in this
 * game already fights back every time -- measured, including a unit attacked
 * twice in one turn. So the clause as written is a no-op, and Jeremy's ruling
 * of 2026-11-02 is that being swarmed should cost the swarm: the second
 * attacker of a turn and every one after pays for the privilege.
 *
 * Counted on the unit because "in a turn" is a fact about the turn, and reset
 * where every other per-turn thing is.
 */
export function reckons(unit: Unit): boolean {
  return UPGRADES.enabled && hasUpgrade(unit, 'yaksha-reckoner');
}

/** What each of them is worth. All first answers. */
export const KEEPER = { heals: 2 };
export const HAULER = { heals: 1 };
export const STILL_WATER = { heals: 2 };
export const RECKONER = { hurtsEachAfterTheFirst: 2 };

/**
 * Whether an enemy Immovable Yaksha forbids this tile. Section 155 slice 6.
 *
 * *"Units cannot move through its tile"* -- which **everything in this game
 * already cannot**: one unit to a tile, and nobody passes through anybody.
 * So the clause as written is a no-op, and Jeremy's ruling of 2026-11-02 made
 * it the thing it was reaching for: a real zone of control, the eight tiles
 * around it closed to the other side.
 *
 * **This is the only upgrade in ninety whose reach is wider than itself**, so
 * two deliberate limits. It is asked in `tryStep` and *not* in the
 * pathfinder: a route planner that knew about it would thread around one and
 * look clairvoyant, and one that did not would strand a march against it --
 * the same trade `sapper-tunnel` makes, for the same reason. And it never
 * closes a tile somebody is standing on or a city, because a rule that can
 * strand a unit in its own town is a bug wearing a mechanic's coat.
 */
export function zoneOfControl(state: GameState, mover: Unit, x: number, y: number): boolean {
  if (!UPGRADES.enabled) return false;
  if (cityAt(state, x, y)) return false;
  return state.units.some(
    (u) =>
      u.owner !== mover.owner &&
      u.hp > 0 &&
      hasUpgrade(u, 'yaksha-immovable') &&
      distance(u.x, u.y, x, y) === 1 &&
      !(u.x === x && u.y === y),
  );
}
