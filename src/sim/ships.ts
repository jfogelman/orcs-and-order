import { distance, idx, neighbors8 } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { City, GameState, Unit } from '../model/types';
import { cityAt, log, recomputeVisibility, unitAt } from './gamestate';
import { effectiveMove } from './rules';

/**
 * Ships: the first slice of a navy.
 *
 * A ship goes on water and only on water. It is built in a city beside the sea
 * and launched onto a water tile next to it -- it never enters a city, because a
 * city tile already has its garrison and one unit to a tile holds everywhere.
 *
 * A **carrier** takes land units aboard. They ride *inside* it: out of
 * `state.units`, in `ship.cargo`, so nothing that walks the map meets them, and
 * one unit to a tile is never broken. A unit steps aboard from the shore by
 * moving onto the ship, which ends its turn; it steps ashore onto any free land
 * tile next to the ship, spending one move. If the ship goes down, everything in
 * it goes down too.
 *
 * A **warship** fights: it sinks ships, and attacks anything on the shore next
 * to it without ever landing. A land unit cannot fight a ship -- it would have
 * to wade out to it.
 */

export function sails(unit: Unit): boolean {
  return unitType(unit.type).sails;
}

/** How many more units this ship will take. */
export function roomAboard(ship: Unit): number {
  return Math.max(0, unitType(ship.type).carries - (ship.cargo?.length ?? 0));
}

/** Whether this unit could step aboard that ship at all. */
export function canBoard(unit: Unit, ship: Unit): boolean {
  if (ship.owner !== unit.owner || !sails(ship) || sails(unit)) return false;
  if (unitType(unit.type).flies) return false;
  return roomAboard(ship) > 0;
}

/** Step aboard. Ends the unit's turn: a crossing is not something to rush onto. */
export function board(state: GameState, unit: Unit, ship: Unit): boolean {
  if (!canBoard(unit, ship) || distance(unit.x, unit.y, ship.x, ship.y) !== 1) return false;
  const i = state.units.indexOf(unit);
  if (i < 0) return false;
  state.units.splice(i, 1);
  unit.x = ship.x;
  unit.y = ship.y;
  unit.moves = 0;
  unit.order = 'none';
  unit.goto = null;
  delete unit.roadTo;
  delete unit.irrigateTo;
  delete unit.autoWork;
  delete unit.exploring;
  (ship.cargo ??= []).push(unit);
  log(state, `${unitType(unit.type).name} goes aboard ${unitType(ship.type).name}.`, 'info', unit.owner, undefined, [
    ship.x,
    ship.y,
  ]);
  recomputeVisibility(state, unit.owner);
  return true;
}

/** Where a passenger could step ashore from this ship: free land next to it. */
export function landingTiles(state: GameState, ship: Unit): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [x, y] of neighbors8(ship.x, ship.y, state.width, state.height)) {
    if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
    if (unitAt(state, x, y)) continue;
    const city = cityAt(state, x, y);
    // Into one of our own towns, yes. Into somebody else's from a boat, no: a
    // landing is made on a beach, and the town is attacked from there.
    if (city && city.owner !== ship.owner) continue;
    out.push([x, y]);
  }
  return out;
}

/** Put one passenger ashore on a tile next to the ship. */
export function unload(state: GameState, ship: Unit, passengerId: number, x: number, y: number): boolean {
  const cargo = ship.cargo ?? [];
  const k = cargo.findIndex((u) => u.id === passengerId);
  if (k < 0) return false;
  if (!landingTiles(state, ship).some(([lx, ly]) => lx === x && ly === y)) return false;
  const unit = cargo[k];
  if (unit.moves <= 0) return false;
  cargo.splice(k, 1);
  if (cargo.length === 0) delete ship.cargo;
  unit.x = x;
  unit.y = y;
  unit.moves = Math.max(0, unit.moves - 1);
  state.units.push(unit);
  log(state, `${unitType(unit.type).name} wades ashore.`, 'info', unit.owner, undefined, [x, y]);
  recomputeVisibility(state, unit.owner);
  return true;
}

/**
 * Everybody off, onto whatever free land is next to the ship, nearest the given
 * tile first. Returns how many made it; anybody left had nowhere to stand, or
 * no move left to stand with.
 */
export function unloadAll(state: GameState, ship: Unit, towardX = ship.x, towardY = ship.y): number {
  let landed = 0;
  for (const unit of [...(ship.cargo ?? [])]) {
    const spots = landingTiles(state, ship).sort(
      (a, b) => distance(a[0], a[1], towardX, towardY) - distance(b[0], b[1], towardX, towardY),
    );
    if (spots.length === 0) break;
    if (unload(state, ship, unit.id, spots[0][0], spots[0][1])) landed++;
  }
  return landed;
}

/** A ship has gone down: everybody aboard goes with it. */
export function drownCargo(state: GameState, ship: Unit): void {
  const cargo = ship.cargo ?? [];
  if (cargo.length === 0) return;
  delete ship.cargo;
  for (const u of cargo) {
    log(state, `${unitType(u.type).name} goes down with the ship.`, 'bad', u.owner, undefined, [ship.x, ship.y]);
  }
}

/** Passengers get their legs back at the top of the owner's turn. */
export function refreshCargo(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  for (const ship of state.units) {
    if (ship.owner !== playerId || !ship.cargo) continue;
    for (const u of ship.cargo) {
      u.moves = effectiveMove(player, u.type);
      u.x = ship.x;
      u.y = ship.y;
    }
  }
}

/** Every unit a player has, aboard ships included. */
export function allUnitsOf(state: GameState, playerId: number): Unit[] {
  const out: Unit[] = [];
  for (const u of state.units) {
    if (u.owner !== playerId) continue;
    out.push(u);
    if (u.cargo) out.push(...u.cargo);
  }
  return out;
}

/** A city with the sea at its door, where ships can be built and launched. */
export function isCoastal(state: GameState, city: City): boolean {
  return neighbors8(city.x, city.y, state.width, state.height).some(
    ([x, y]) => TERRAIN[state.terrain[idx(x, y, state.width)]].water,
  );
}

/** Where a newly built ship goes in: an empty water tile next to the city. */
export function launchTile(state: GameState, city: City): [number, number] | null {
  for (const [x, y] of neighbors8(city.x, city.y, state.width, state.height)) {
    if (!TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
    if (!unitAt(state, x, y)) return [x, y];
  }
  return null;
}
