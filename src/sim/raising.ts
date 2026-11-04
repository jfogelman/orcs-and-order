import { ANCIENT, cannotBeRaised } from '../model/raising';
import { UPGRADES } from '../model/upgrades';
import { maxHp, unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { log, spawnUnit, withRng } from './gamestate';
import { hasUpgrade } from './upgradeEffects';
import { DIRS8 } from '../engine/grid';
import { canStandOn } from './movement';

/**
 * Section 155: what a Grave Knight leaves standing behind it.
 *
 * *"Killing a unit has a chance to raise a weak skeletal copy for a few
 * turns."* Everything about who may be raised lives in `model/raising.ts`,
 * which is Jeremy's six exclusions; this is the part that happens.
 *
 * ## The numbers, and which of them are arguments
 *
 * `RAISED.scale` -- half the original -- is **his**, chosen over a cap and
 * over fixed stats, so a raised dragon really is half a dragon. The three
 * below are mine and provisional, like every first number in this project.
 *
 * ## The four rulings that are not numbers
 *
 * **Only kills the Knight makes itself, in combat.** Not a blast, not a
 * dragon's breath, not a militia, not a sapper going up beside it -- all of
 * those kill through `destroyUnit` too, and a Grave Knight standing near a
 * detonation would otherwise populate a graveyard it had nothing to do with.
 *
 * **No upkeep, no score, and it cannot take a city.** A few turns of help,
 * not an empire; see `isRaised`, which the three places that care consult.
 *
 * **No cap on a Soul-Bound Knight's skeletons.** The drain is the cap, and
 * that is the joke the flavour text makes -- *the pyramid scheme finally has
 * overhead*. A Knight that raises faster than it can bleed kills itself, and
 * nothing else needs to say so.
 *
 * **A raised thing is never raised again.** Refused here as well as in
 * `cannotBeRaised`, because the two ask different questions: that one is
 * about the kind of creature, this is about the particular corpse.
 */
export const RAISING = {
  /** Kills in which something comes up. Unmeasured. */
  chance: 1 / 3,
  /** Turns an ordinary raised copy lasts before it crumbles. Unmeasured. */
  turns: 3,
  /** Health a Soul-Bound Knight pays per turn, per skeleton still standing. */
  drain: 1,
};

/** Whether this unit came out of the ground rather than out of a city. */
export function isRaised(unit: Unit): boolean {
  return unit.raised !== undefined;
}

/** Whether this unit raises anything at all. */
export function raises(unit: Unit): boolean {
  return (
    UPGRADES.enabled &&
    (hasUpgrade(unit, 'deathknight-grave') || hasUpgrade(unit, 'deathknight-soulbound'))
  );
}

/**
 * Whether a Grave Knight's kill ends one of the Unbound for good.
 *
 * Jeremy's ruling of 2026-10-29: it cannot make a skeleton out of a ghost, so
 * it banishes instead -- no dispersal, no reform, that one is finished -- and
 * digs something older up. Read by `scatters` in `dispersal.ts`, through the
 * same hook `exorcises` already uses.
 */
export function banishes(killer: Unit | undefined): boolean {
  return killer !== undefined && raises(killer);
}

/** A free tile beside the corpse for the thing coming up out of it. */
function roomNear(state: GameState, at: Unit, typeId: string): [number, number] | null {
  const taken = new Set(state.units.map((u) => `${u.x},${u.y}`));
  const type = unitType(typeId);
  for (const [dx, dy] of [[0, 0] as const, ...DIRS8]) {
    const x = at.x + dx;
    const y = at.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    if (taken.has(`${x},${y}`)) continue;
    if (!canStandOn(type, state.terrain[y * state.width + x])) continue;
    return [x, y];
  }
  return null;
}

/**
 * Try to pull something up out of what this Knight just killed.
 *
 * Called from the one place a Grave Knight kills something itself, so that
 * every other way a unit can die -- and there are six -- is excluded by not
 * calling it rather than by a list of exceptions here.
 *
 * Returns the thing raised, or null, which is the ordinary outcome.
 */
export function raiseFrom(state: GameState, killer: Unit, victim: Unit): Unit | null {
  if (!raises(killer) || killer.hp <= 0) return null;
  // A corpse that was itself raised goes back in the ground for good.
  if (isRaised(victim)) return null;

  const unbound = state.players[victim.owner]?.faction === 'unbound';
  // Who comes up: a halved copy of whatever died, or -- for the Unbound, who
  // leave no body -- something that was down there already.
  const typeId = unbound ? ANCIENT : unitType(victim.type).base;
  if (!unbound && cannotBeRaised(unitType(victim.type)) !== null) return null;

  if (!withRng(state, (rng) => rng.chance(RAISING.chance))) return null;
  const spot = roomNear(state, victim, typeId);
  if (!spot) return null;

  const risen = spawnUnit(state, killer.owner, typeId as Unit['type'], spot[0], spot[1], false);
  risen.raised = killer.id;
  // A Soul-Bound Knight's do not expire. That is the whole of that upgrade,
  // and the price is in `payForTheRisen`.
  if (!hasUpgrade(killer, 'deathknight-soulbound')) {
    risen.fadesOn = state.turn + RAISING.turns;
  }
  risen.hp = maxHp(risen);
  log(
    state,
    unbound
      ? `Something much older than ${unitType(victim.type).name} comes up where it fell.`
      : `${unitType(victim.type).name} gets back up, and is no longer anybody's.`,
    'good',
    killer.owner,
    'promote',
    [risen.x, risen.y],
    killer.id,
  );
  return risen;
}

/**
 * Crumble whatever is out of time, and bleed whoever is paying for the rest.
 *
 * Run at the top of a side's turn, so a skeleton raised on turn 10 with three
 * turns in it is standing on 11, 12 and 13 and gone on 14 -- which is what
 * "lasts three turns" should mean to somebody counting.
 */
export function payForTheRisen(state: GameState, playerId: number): void {
  if (!UPGRADES.enabled) return;
  const mine = state.units.filter((u) => u.owner === playerId);

  for (const risen of mine) {
    if (!isRaised(risen) || risen.fadesOn === undefined) continue;
    if (state.turn < risen.fadesOn) continue;
    risen.hp = 0;
    log(
      state,
      `${unitType(risen.type).name} runs out of whatever was holding it together.`,
      'info',
      playerId,
      undefined,
      [risen.x, risen.y],
    );
  }

  // The overhead. Counted off the board rather than off a tally on the Knight,
  // so a skeleton killed by somebody else stops costing immediately and
  // nothing has to remember to say so.
  for (const knight of mine) {
    if (!hasUpgrade(knight, 'deathknight-soulbound') || knight.hp <= 0) continue;
    const held = mine.filter((u) => u.raised === knight.id && u.hp > 0).length;
    if (held <= 0) continue;
    knight.hp -= RAISING.drain * held;
    if (knight.hp <= 0) {
      log(
        state,
        `${unitType(knight.type).name} has nothing left to hold them with.`,
        'bad',
        playerId,
        undefined,
        [knight.x, knight.y],
      );
    }
  }
}
