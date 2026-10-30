import { UPGRADES, upgradeHeld } from '../model/upgrades';
import type { UpgradeDef } from '../model/upgrades';
import { unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { cityAt, log } from './gamestate';
import { handicapCost } from './difficulty';

/**
 * Section 155: taking a creature that is already standing back to the works.
 *
 * Jeremy's second ruling: *"units already built upgrade in a friendly city,
 * for a fee"*. The alternative -- new builds only -- is cheaper to write and
 * he did not want it, and he is right about why: an empire that researches an
 * upgrade halfway through a war wants it on the army it is fighting with, not
 * on the one it will have finished building by the time the war is over.
 *
 * So there are two routes to carrying an upgrade and this file is the paid
 * one. The free one is in `city.ts`, where a unit that has just been built
 * comes out as whatever the current model is.
 */

/** The upgrade this unit's owner would fit to it, or null if there is none. */
export function upgradeOffered(state: GameState, unit: Unit): UpgradeDef | null {
  if (!UPGRADES.enabled) return null;
  const owner = state.players[unit.owner];
  if (!owner) return null;
  // The *creature*, not the group size: `orc3` is three orcs and its base is
  // `orc`, which is the id the thirty-six upgrades are declared against.
  return upgradeHeld(owner.techs, unitType(unit.type).base);
}

/**
 * What it costs in gold to fit it.
 *
 * `UPGRADES.fee` gold per shield of the creature's build cost, so a group of
 * three costs three times what one does -- it is three creatures, and all
 * three come back changed. Carried through `handicapCost` for the same reason
 * research is: a level that makes an empire's building and studying dearer
 * should not leave it a cheap way to improve an army.
 */
export function upgradeFee(state: GameState, unit: Unit): number {
  const owner = state.players[unit.owner];
  const list = Math.round(unitType(unit.type).cost * UPGRADES.fee);
  return owner ? handicapCost(owner, list) : list;
}

/** Why this unit cannot be upgraded here, or null if it can. */
export function upgradeBlocked(state: GameState, unit: Unit): string | null {
  if (!UPGRADES.enabled) return 'There is no such thing in this game.';
  const offered = upgradeOffered(state, unit);
  if (!offered) return 'Nothing has been learned about this kind yet.';
  // Not `unit.upgrade !== undefined`: a unit wearing its family's linear
  // upgrade is owed the branch once the empire takes one, and that is a
  // second fee rather than a refusal.
  if (unit.upgrade === offered.id) return `It is already ${offered.name}.`;
  if (unit.moves <= 0) return 'No movement left this turn.';
  // On the tile, not merely beside it. `resupply` allows a neighbour because a
  // thrower that had to get inside would be turned away by its own garrison;
  // this is the unit going into the works, so it goes in.
  const here = cityAt(state, unit.x, unit.y);
  if (!here || here.owner !== unit.owner) return 'It must be standing in a city of yours.';
  const fee = upgradeFee(state, unit);
  if ((state.players[unit.owner]?.gold ?? 0) < fee) return `Needs ${fee} gold.`;
  return null;
}

/**
 * Pay, and let it out of the works as the current model.
 *
 * Costs the rest of the turn as well as the gold, which is what stops a column
 * upgrading itself mid-march. The same price `resupply` charges, and for the
 * same reason: a unit does one useful thing in a city per turn.
 */
export function buyUpgrade(state: GameState, unit: Unit): boolean {
  if (upgradeBlocked(state, unit) !== null) return false;
  const offered = upgradeOffered(state, unit);
  if (!offered) return false;
  const fee = upgradeFee(state, unit);
  const owner = state.players[unit.owner];
  owner.gold -= fee;
  unit.upgrade = offered.id;
  unit.moves = 0;
  log(
    state,
    `${unitType(unit.type).name} goes back to the works and comes out ${offered.name}, for ${fee} gold.`,
    'good',
    unit.owner,
    'promote',
    [unit.x, unit.y],
  );
  return true;
}

/**
 * What a unit just built should come out as. Used by `city.ts`.
 *
 * Free, because the works are already making one and this is simply which one
 * they are making. Returns undefined rather than null so it can be spread
 * straight onto a new `Unit` without writing the key at all in a game with the
 * box unticked -- which keeps every save and fixture byte-identical.
 */
export function upgradeForNewUnit(state: GameState, unit: Unit): string | undefined {
  return upgradeOffered(state, unit)?.id;
}
