import type { GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import { TERRAIN } from '../model/terrain';
import { idx, inBounds } from '../engine/grid';
import { cityAt, log, unitAt } from './gamestate';
import { hostile } from './diplomacy';
import { hasFlag } from './rules';

/**
 * Section 125 slice B: the Burrower-caste, and the two different things it does
 * with the ground.
 *
 * **Sink** is a stance: go down where you stand and stop being there, as far as
 * anybody else can tell. **Burrow** is a move: go under the ground and come up
 * somewhere else, passing through whatever is in the way. The bible is emphatic
 * that these are two abilities rather than one with two names, and the
 * difference is worth keeping -- one is about not being found and the other is
 * about arriving somewhere you could not have walked to.
 *
 * ## The thing this needed that the game did not have
 *
 * **Nothing in this game has ever been hidden.** Fog of war is a fact about
 * *tiles* -- `player.visible` is a bitmap, and a unit standing on a visible
 * tile is a unit you can see. The Sunken Legion wades, the Ogre Clan Brute
 * shouts, the Tomb Wardens stand still; not one of them is invisible. So the
 * question "can this player see that unit" had never been asked before, and the
 * answer was always "is the tile lit".
 *
 * `seenBy` is that question asked properly, and it is deliberately the only
 * place the rule lives: the renderer, the AI's target search and the sighting
 * report all go through it rather than each doing their own version. A rule
 * about who can see what that is implemented four times is a rule that will be
 * four different rules within a month.
 */
export const BURROW = {
  /** Whether any of this is on. Off is the game before section 125 slice B. */
  enabled: true,
  /** Tiles a Burrow may cross, before `burrower-deep`. */
  range: 2,
  /** Tiles a Burrow may cross once the Hive has learned to go further down. */
  deepRange: 3,
  /**
   * Attack multiplier for a unit striking on the turn it came up, once the Hive
   * has learned to be already waiting.
   *
   * A multiplier rather than a flat point so it is worth the same to a Burrower
   * as the surrounding numbers grow, and modest because it stacks with having
   * arrived somewhere nobody expected.
   */
  ambush: 1.5,
};

/** Whether this creature is one that goes under the ground at all. */
export function burrows(unit: Unit): boolean {
  return unitType(unit.type).base === 'burrower';
}

/** Whether this unit is currently underground. */
export function isSunk(unit: Unit): boolean {
  return unit.order === 'sunk';
}

/**
 * Whether `viewer` can see `unit` at all.
 *
 * The tile has to be lit, as it always did -- and the unit has to be above the
 * ground, unless it is one of yours. **Every reader of enemy units goes through
 * here**: see the note at the top of this file.
 */
export function seenBy(state: GameState, unit: Unit, viewerId: number): boolean {
  const viewer = state.players[viewerId];
  if (!viewer) return false;
  if (!viewer.visible[idx(unit.x, unit.y, state.width)]) return false;
  if (unit.owner === viewerId) return true;
  return !(BURROW.enabled && isSunk(unit));
}

/**
 * Whether this player knows something went into the ground here.
 *
 * Sinking leaves the dirt disturbed. That is the whole of what an enemy gets --
 * a tile, not a unit, and no indication of whether whatever made it is still
 * down there -- and it is what `burrower-veteran` takes away.
 */
export function markedAt(state: GameState, x: number, y: number, viewerId: number): boolean {
  if (!BURROW.enabled) return false;
  const viewer = state.players[viewerId];
  if (!viewer?.visible[idx(x, y, state.width)]) return false;
  return state.units.some(
    (u) =>
      u.x === x &&
      u.y === y &&
      isSunk(u) &&
      u.owner !== viewerId &&
      u.sinkMark === true &&
      hostile(state, viewerId, u.owner),
  );
}

/** Why this unit cannot go to ground right now, or null if it can. */
export function sinkBlocked(state: GameState, unit: Unit): string | null {
  if (!BURROW.enabled) return 'This unit cannot do that.';
  if (!burrows(unit)) return 'Only a Burrower-caste goes under the ground.';
  if (isSunk(unit)) return 'It is already down there.';
  if (unit.moves <= 0) return 'No movement left this turn.';
  const ground = TERRAIN[state.terrain[idx(unit.x, unit.y, state.width)]];
  if (!ground || ground.water) return 'There is nothing here to go into.';
  if (cityAt(state, unit.x, unit.y)) return 'Not under a settlement.';
  return null;
}

/**
 * Go down where you stand.
 *
 * Costs the rest of the turn, which is what stops it being a free dodge: a
 * Burrower cannot walk up to somebody, hit them and vanish in the same breath.
 */
export function sink(state: GameState, unit: Unit): boolean {
  if (sinkBlocked(state, unit) !== null) return false;
  unit.order = 'sunk';
  unit.moves = 0;
  // Without the Veteran advance, the ground remembers. The mark is written now
  // rather than read later so that learning the advance does not retroactively
  // tidy up every hole this unit has ever left.
  const quiet = hasFlag(state.players[unit.owner], 'quiet-sinking');
  if (quiet) delete unit.sinkMark;
  else unit.sinkMark = true;
  log(
    state,
    quiet
      ? 'It goes into the ground. Where it was is no longer known.'
      : 'It goes into the ground, and leaves the dirt disturbed where it went.',
    'good',
    unit.owner,
    undefined,
    [unit.x, unit.y],
  );
  return true;
}

/**
 * Come back up, for whatever reason.
 *
 * `ambushed` is set when it surfaces beside somebody, which is what the Ambush
 * advance pays off on -- held on the unit rather than worked out at the moment
 * of attack, because by then it is standing on the surface like anything else
 * and nothing distinguishes it.
 */
export function surface(state: GameState, unit: Unit, quiet = false): void {
  if (!isSunk(unit)) return;
  unit.order = 'none';
  delete unit.sinkMark;
  if (hasFlag(state.players[unit.owner], 'ambush-burrowing') && besideAnEnemy(state, unit)) {
    unit.ambushing = true;
  }
  if (!quiet) {
    log(state, 'It comes up out of the ground.', 'good', unit.owner, undefined, [unit.x, unit.y]);
  }
}

/** Whether anything hostile is standing next to this tile. */
function besideAnEnemy(state: GameState, unit: Unit): boolean {
  return state.units.some(
    (u) =>
      u.owner !== unit.owner &&
      hostile(state, unit.owner, u.owner) &&
      Math.max(Math.abs(u.x - unit.x), Math.abs(u.y - unit.y)) === 1,
  );
}

/**
 * Somebody has walked onto the tile a Burrower is hiding under.
 *
 * They could not see it and it does not block them, so the only honest outcome
 * is that it is found out: it is pushed to the nearest free ground and has used
 * its turn being surprised. With nowhere to go it is buried, which is the price
 * of hiding under a road somebody was about to use.
 *
 * Returns true if something was down there.
 */
export function disturbedBy(state: GameState, mover: Unit): boolean {
  if (!BURROW.enabled) return false;
  const below = state.units.find(
    (u) => u !== mover && u.x === mover.x && u.y === mover.y && isSunk(u),
  );
  if (!below) return false;

  const spot = freeGroundNear(state, below);
  if (!spot) {
    state.units.splice(state.units.indexOf(below), 1);
    log(state, 'Something was under there. It is still under there.', 'bad', below.owner, undefined, [
      below.x,
      below.y,
    ]);
    return true;
  }
  below.x = spot[0];
  below.y = spot[1];
  surface(state, below, true);
  below.moves = 0;
  log(
    state,
    'Something was under there, and has been stood on. It is out now, and put out.',
    'bad',
    below.owner,
    undefined,
    [below.x, below.y],
  );
  log(state, 'The ground gives way. Something was waiting under it.', 'bad', mover.owner, undefined, [
    mover.x,
    mover.y,
  ]);
  return true;
}

/** Free, legal ground next to this unit, if there is any. */
function freeGroundNear(state: GameState, unit: Unit): [number, number] | null {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (!canStopHere(state, unit, x, y)) continue;
      return [x, y];
    }
  }
  return null;
}

/** Whether this unit could legally end a move on this tile. */
function canStopHere(state: GameState, unit: Unit, x: number, y: number): boolean {
  if (!inBounds(x, y, state.width, state.height)) return false;
  const ground = TERRAIN[state.terrain[idx(x, y, state.width)]];
  if (!ground || ground.water) return false;
  if (unitAt(state, x, y)) return false;
  const city = cityAt(state, x, y);
  if (city && city.owner !== unit.owner) return false;
  return true;
}

/** How far this unit may travel underground. */
export function burrowRange(state: GameState, unit: Unit): number {
  return hasFlag(state.players[unit.owner], 'deep-burrowing') ? BURROW.deepRange : BURROW.range;
}

/** Why this unit cannot burrow right now, or null if it can. */
export function burrowBlocked(state: GameState, unit: Unit): string | null {
  if (!BURROW.enabled) return 'This unit cannot do that.';
  if (!burrows(unit)) return 'Only a Burrower-caste goes under the ground.';
  if (unit.moves <= 0) return 'No movement left this turn.';
  // You cannot go into ground you are not standing on. A Burrower riding a
  // Tide-caste is at sea, and the sea has no underneath to use.
  const here = TERRAIN[state.terrain[idx(unit.x, unit.y, state.width)]];
  if (!here || here.water) return 'There is nothing under the water to go into.';
  return null;
}

/**
 * Every tile this unit could come up on.
 *
 * Measured as a straight distance rather than a walked path, because that is
 * the whole point: it goes **through** what is in the way -- a wall, a river, a
 * mountain, somebody's army -- and the only question is how far. What it may
 * not do is come up inside something, which is why the landing is filtered to
 * ground it could have stood on anyway.
 */
export function burrowTargets(state: GameState, unit: Unit): Array<[number, number]> {
  if (burrowBlocked(state, unit) !== null) return [];
  const reach = burrowRange(state, unit);
  const out: Array<[number, number]> = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > reach) continue;
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (canStopHere(state, unit, x, y)) out.push([x, y]);
    }
  }
  return out;
}

/**
 * Go under the ground and come up over there.
 *
 * Costs the whole turn however far it went, so a short burrow past a wall is
 * priced the same as a long one across a valley. That is deliberate: what is
 * being bought is *the crossing*, not the distance.
 */
export function burrow(state: GameState, unit: Unit, x: number, y: number): boolean {
  if (burrowBlocked(state, unit) !== null) return false;
  if (!burrowTargets(state, unit).some(([tx, ty]) => tx === x && ty === y)) return false;
  const wasSunk = isSunk(unit);
  unit.x = x;
  unit.y = y;
  unit.order = 'none';
  delete unit.sinkMark;
  unit.moves = 0;
  if (hasFlag(state.players[unit.owner], 'ambush-burrowing') && besideAnEnemy(state, unit)) {
    unit.ambushing = true;
  }
  log(
    state,
    wasSunk
      ? 'It moves without coming up, and surfaces somewhere else.'
      : 'It goes down, crosses under, and comes up on the other side.',
    'good',
    unit.owner,
    undefined,
    [x, y],
  );
  return true;
}

/**
 * Clear the ambush mark at the start of its owner's turn.
 *
 * It is already waiting is a thing that is true for exactly one turn. Cleared
 * here rather than after the attack, because a Burrower that comes up and does
 * not swing has still given away where it is.
 */
export function clearAmbush(state: GameState, playerId: number): void {
  for (const u of state.units) {
    if (u.owner === playerId) delete u.ambushing;
  }
}
