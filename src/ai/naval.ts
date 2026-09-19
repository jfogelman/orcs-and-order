import { DIRS8, distance, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { City, GameState, ProductionItem, TerrainId, Unit } from '../model/types';
import type { UnitTypeDef } from '../model/units';
import { canFoundCity } from '../sim/city';
import { playerCities } from '../sim/gamestate';
import { moveToward, routeTo, tryStep } from '../sim/movement';
import { canBoard, isCoastal, roomAboard, unloadAll } from '../sim/ships';

/**
 * The AI at sea.
 *
 * Deliberately a thin layer over the land AI rather than a second brain. A land
 * unit that has somewhere to be across the water -- a settler with no room left
 * on its island, a soldier whose war is on another one -- asks for passage and
 * walks to a carrier. A carrier fetches whoever is asking, sails them to a
 * landing beside where they were going, and puts them ashore; from there the
 * land AI takes over as if they had walked. With nothing to carry, it explores.
 * A warship sinks what it can beat, stays near a loaded carrier, and otherwise
 * shells the shore or looks around.
 *
 * Ships are asked for only when somebody is waiting for one, or when the AI is
 * stranded on an island with nobody in sight -- so on a continent, where
 * everybody can walk to everybody, this mostly never happens.
 */
export const NAVAL = {
  /** The switch, for sweeps: off is the game before ships had an AI. */
  enabled: true,
  /** Carriers an empire keeps at most. */
  maxCarriers: 4,
  /** Warships an empire keeps at most. */
  maxWarships: 2,
  /** Turns a part-loaded carrier waits at the shore for more before it sails. */
  waitTurns: 3,
  /**
   * Turns a part-loaded carrier of *soldiers* waits. Longer: three soldiers
   * landed beside a walled town one boat at a time are three dead soldiers.
   */
  invasionWait: 8,
  /** How far a warship will go to sink something or to keep a carrier company. */
  huntRange: 8,
};

/** What the land AI lends the sea AI, so neither file has to import the other. */
export interface NavalHelpers {
  odds: (attacker: Unit, defender: Unit) => number;
  siteScore: (x: number, y: number) => number;
  caution: number;
}

// ------------------------------------------------------------------ landmasses

let cached: { terrain: TerrainId[]; width: number; labels: Int32Array } | null = null;

/**
 * Which landmass every land tile is on; -1 for water. Water never changes in a
 * game, so this is worked out once per map and kept.
 */
export function landmasses(state: GameState): Int32Array {
  if (cached && cached.terrain === state.terrain && cached.width === state.width) return cached.labels;
  const w = state.width;
  const h = state.height;
  const labels = new Int32Array(w * h).fill(-1);
  let next = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== -1 || TERRAIN[state.terrain[start]].water) continue;
    const stack = [start];
    labels[start] = next;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = Math.floor(i / w);
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = idx(nx, ny, w);
        if (labels[ni] !== -1 || TERRAIN[state.terrain[ni]].water) continue;
        labels[ni] = next;
        stack.push(ni);
      }
    }
    next++;
  }
  cached = { terrain: state.terrain, width: w, labels };
  return labels;
}

function landmassAt(state: GameState, x: number, y: number): number {
  return landmasses(state)[idx(x, y, state.width)];
}

function isWater(state: GameState, x: number, y: number): boolean {
  return TERRAIN[state.terrain[idx(x, y, state.width)]].water;
}

function carriers(state: GameState, playerId: number): Unit[] {
  return state.units.filter((u) => u.owner === playerId && unitType(u.type).carries > 0);
}

function warships(state: GameState, playerId: number): Unit[] {
  return state.units.filter((u) => u.owner === playerId && unitType(u.type).sails && unitType(u.type).attack > 0);
}

// ------------------------------------------------------------------ passengers

/**
 * Whether there is anywhere left to found a city on this unit's own island.
 * A settler with room at home walks; only one without asks for a boat.
 */
export function roomAtHome(state: GameState, unit: Unit, helpers: NavalHelpers): boolean {
  const home = landmassAt(state, unit.x, unit.y);
  const labels = landmasses(state);
  const seen = state.players[unit.owner].explored;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== home || !seen[i]) continue;
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    if (canFoundCity(state, unit, x, y).ok && helpers.siteScore(x, y) > 0) return true;
  }
  return false;
}

/** Whether a target on land is somewhere this unit cannot walk to. */
export function acrossTheWater(state: GameState, unit: Unit, x: number, y: number): boolean {
  if (isWater(state, x, y)) return false;
  return landmassAt(state, x, y) !== landmassAt(state, unit.x, unit.y);
}

/**
 * Ask for a boat, and go to one if there is one. Returns whether the unit's turn
 * was spent on it; false means there is no carrier yet, and the request stands
 * so that one gets built.
 */
export function seekPassage(state: GameState, unit: Unit): boolean {
  if (!NAVAL.enabled) return false;
  unit.wantsPassage = true;
  const home = landmassAt(state, unit.x, unit.y);
  const ships = carriers(state, unit.owner)
    .filter((s) => canBoard(unit, s) && !s.voyage)
    .sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
  const ship = ships[0];
  if (!ship) return false;
  if (distance(unit.x, unit.y, ship.x, ship.y) === 1) {
    tryStep(state, unit, ship.x, ship.y);
    delete unit.wantsPassage;
    return true;
  }
  // The shore beside the ship, on our side of the water.
  const shore = DIRS8.map(([dx, dy]) => ({ x: ship.x + dx, y: ship.y + dy }))
    .filter(
      (p) =>
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < state.width &&
        p.y < state.height &&
        !isWater(state, p.x, p.y) &&
        landmassAt(state, p.x, p.y) === home,
    )
    .sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
  for (const spot of shore.slice(0, 3)) {
    if (routeTo(state, unit, spot.x, spot.y)) {
      moveToward(state, unit, spot.x, spot.y);
      return true;
    }
  }
  // The ship is somewhere else for now; it will come. Wait where we are.
  return true;
}

// ------------------------------------------------------------------ carriers

/** Water next to land on the given landmass, nearest the given point first. */
function coastOf(state: GameState, landmass: number, nearX: number, nearY: number, within: number): Array<[number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let y = Math.max(0, nearY - within - 1); y <= Math.min(state.height - 1, nearY + within + 1); y++) {
    for (let x = Math.max(0, nearX - within - 1); x <= Math.min(state.width - 1, nearX + within + 1); x++) {
      if (!isWater(state, x, y)) continue;
      const touches = DIRS8.some(([dx, dy]) => {
        const lx = x + dx;
        const ly = y + dy;
        if (lx < 0 || ly < 0 || lx >= state.width || ly >= state.height) return false;
        return landmassAt(state, lx, ly) === landmass && distance(lx, ly, nearX, nearY) <= within;
      });
      if (touches) out.push([x, y, distance(x, y, nearX, nearY)]);
    }
  }
  return out.sort((a, b) => a[2] - b[2]).map(([x, y]) => [x, y]);
}

/** The first of these water tiles the ship can actually sail to. */
function reachable(state: GameState, ship: Unit, tiles: Array<[number, number]>): [number, number] | null {
  for (const [x, y] of tiles.slice(0, 6)) {
    if (x === ship.x && y === ship.y) return [x, y];
    if (routeTo(state, ship, x, y)) return [x, y];
  }
  return null;
}

/** Where a load of settlers should go: the best free site across the water. */
function settleTarget(state: GameState, ship: Unit, settler: Unit, helpers: NavalHelpers): { x: number; y: number } | null {
  const seen = state.players[ship.owner].explored;
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      if (!seen[idx(x, y, state.width)] || isWater(state, x, y)) continue;
      if (!canFoundCity(state, settler, x, y).ok) continue;
      const score = helpers.siteScore(x, y) - distance(ship.x, ship.y, x, y) * 2;
      if (score > 0 && (!best || score > best.score)) best = { x, y, score };
    }
  }
  return best;
}

/** Where a load of soldiers should go: the nearest enemy town we know of. */
function invasionTarget(state: GameState, ship: Unit): City | null {
  const seen = state.players[ship.owner].explored;
  return (
    state.cities
      .filter((c) => c.owner !== ship.owner && seen[idx(c.x, c.y, state.width)] && !state.players[c.owner]?.barbarian)
      .sort((a, b) => distance(ship.x, ship.y, a.x, a.y) - distance(ship.x, ship.y, b.x, b.y))[0] ?? null
  );
}

/**
 * Explored water worth sailing to, to see more: the most unknown within sight
 * of it for the distance.
 *
 * Not simply the nearest edge of the unknown. Behind a forest or a mountain
 * there is always a tile nobody at sea will ever see, and "nearest edge" sent
 * carriers round and round the same islands for a hundred turns looking at it
 * while the other side's whole empire sat in the open sea unexplored.
 */
function seaFrontier(state: GameState, ship: Unit): [number, number] | null {
  const seen = state.players[ship.owner].explored;
  const R = 2;
  let best: [number, number] | null = null;
  let bestScore = 0;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!seen[idx(x, y, state.width)] || !isWater(state, x, y)) continue;
      const d = distance(ship.x, ship.y, x, y);
      if (d === 0) continue;
      let unknown = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
          if (!seen[idx(nx, ny, state.width)]) unknown++;
        }
      }
      // Three unseen tiles is a glimpse round a corner, not new sea.
      if (unknown < 4) continue;
      const score = unknown / (4 + d);
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
  }
  return best;
}

/** Go and look at the unknown, or go home if there is none left. */
function wander(state: GameState, ship: Unit): void {
  const edge = seaFrontier(state, ship);
  if (edge && routeTo(state, ship, edge[0], edge[1])) {
    moveToward(state, ship, edge[0], edge[1]);
    return;
  }
  const home = playerCities(state, ship.owner)
    .filter((c) => isCoastal(state, c))
    .sort((a, b) => distance(ship.x, ship.y, a.x, a.y) - distance(ship.x, ship.y, b.x, b.y))[0];
  if (!home || distance(ship.x, ship.y, home.x, home.y) <= 1) return;
  const berth = reachable(state, ship, coastOf(state, landmassAt(state, home.x, home.y), home.x, home.y, 1));
  if (berth) moveToward(state, ship, berth[0], berth[1]);
}

/** Another carrier of ours nearby, still taking on soldiers for the same crossing. */
function fleetLoading(state: GameState, ship: Unit): boolean {
  return carriers(state, ship.owner).some(
    (c) =>
      c.id !== ship.id &&
      !c.voyage &&
      (c.cargo?.length ?? 0) > 0 &&
      roomAboard(c) > 0 &&
      (c.voyageWait ?? 0) < NAVAL.invasionWait &&
      distance(c.x, c.y, ship.x, ship.y) <= 6,
  );
}

function actCarrier(state: GameState, ship: Unit, helpers: NavalHelpers): void {
  const cargo = ship.cargo ?? [];

  if (cargo.length > 0) {
    // Wait for the rest of the party while anybody else is on the way.
    const coming = state.units.some(
      (u) => u.owner === ship.owner && u.wantsPassage && distance(u.x, u.y, ship.x, ship.y) <= 6,
    );
    const hasSettler = cargo.some((u) => unitType(u.type).settler);
    const waited = ship.voyageWait ?? 0;
    const ready = hasSettler
      ? roomAboard(ship) === 0 || !coming || waited >= NAVAL.waitTurns || cargo.some((u) => !unitType(u.type).settler)
      : // An invasion goes full, or after a long wait -- and never before the
        // other carriers loading beside it are full too, so they land together.
        (roomAboard(ship) === 0 && !fleetLoading(state, ship)) || waited >= NAVAL.invasionWait;
    if (!ship.voyage && !ready) {
      ship.voyageWait = (ship.voyageWait ?? 0) + 1;
      return;
    }

    // Where to: a site for settlers, a town for soldiers.
    if (!ship.voyage) {
      const settler = cargo.find((u) => unitType(u.type).settler);
      const target = settler ? settleTarget(state, ship, settler, helpers) : invasionTarget(state, ship);
      if (!target) {
        // Nowhere known yet. Carry them while looking.
        wander(state, ship);
        return;
      }
      // The beach nearest the target, however far inland the target is: a town
      // six tiles from the sea was unreachable when this looked only three out.
      const mass = landmassAt(state, target.x, target.y);
      const landing = reachable(state, ship, coastOf(state, mass, target.x, target.y, Math.max(state.width, state.height)));
      if (!landing) {
        wander(state, ship);
        return;
      }
      ship.voyage = { x: landing[0], y: landing[1], tx: target.x, ty: target.y };
      delete ship.voyageWait;
    }

    const v = ship.voyage;
    const there = ship.x === v.x && ship.y === v.y;
    if (!there) {
      const step = moveToward(state, ship, v.x, v.y);
      if (step.kind === 'blocked' && !routeTo(state, ship, v.x, v.y)) delete ship.voyage;
      if (!(ship.x === v.x && ship.y === v.y)) return;
    }
    unloadAll(state, ship, v.tx, v.ty);
    if (!ship.cargo?.length) delete ship.voyage;
    return;
  }

  delete ship.voyage;
  delete ship.voyageWait;

  // Fetch whoever is asking, nearest first.
  const asking = state.units
    .filter((u) => u.owner === ship.owner && u.wantsPassage && !unitType(u.type).sails)
    .sort((a, b) => distance(ship.x, ship.y, a.x, a.y) - distance(ship.x, ship.y, b.x, b.y))[0];
  if (asking) {
    if (distance(ship.x, ship.y, asking.x, asking.y) <= 1) return; // alongside: hold for them
    const pickup = reachable(
      state,
      ship,
      coastOf(state, landmassAt(state, asking.x, asking.y), asking.x, asking.y, 4),
    );
    if (pickup) {
      if (pickup[0] !== ship.x || pickup[1] !== ship.y) moveToward(state, ship, pickup[0], pickup[1]);
      return;
    }
  }
  wander(state, ship);
}

// ------------------------------------------------------------------ warships

function actWarship(state: GameState, ship: Unit, helpers: NavalHelpers): void {
  const viewer = state.players[ship.owner];
  const enemies = state.units.filter(
    (u) => u.owner !== ship.owner && viewer.visible[idx(u.x, u.y, state.width)],
  );

  // Anything next to us we can beat, ship or shore.
  const adjacent = enemies
    .filter((e) => distance(e.x, e.y, ship.x, ship.y) === 1)
    .map((e) => ({ e, odds: helpers.odds(ship, e) }))
    .sort((a, b) => b.odds - a.odds)[0];
  if (adjacent && adjacent.odds >= helpers.caution) {
    tryStep(state, ship, adjacent.e.x, adjacent.e.y);
    return;
  }

  // A ship worth sinking within reach: carriers first, they are full of people.
  const prey = enemies
    .filter((e) => unitType(e.type).sails && distance(e.x, e.y, ship.x, ship.y) <= NAVAL.huntRange)
    .filter((e) => helpers.odds(ship, e) >= helpers.caution)
    .sort(
      (a, b) =>
        unitType(b.type).carries - unitType(a.type).carries ||
        distance(ship.x, ship.y, a.x, a.y) - distance(ship.x, ship.y, b.x, b.y),
    )[0];
  if (prey && routeTo(state, ship, prey.x, prey.y) !== null) {
    moveToward(state, ship, prey.x, prey.y);
    return;
  }
  if (prey) {
    // Its own tile is not a place to path to; the water beside it is.
    const beside = DIRS8.map(([dx, dy]) => [prey.x + dx, prey.y + dy] as [number, number]).filter(
      ([x, y]) => x >= 0 && y >= 0 && x < state.width && y < state.height && isWater(state, x, y),
    );
    const spot = reachable(state, ship, beside);
    if (spot) {
      moveToward(state, ship, spot[0], spot[1]);
      return;
    }
  }

  // Keep a loaded carrier company.
  const convoy = carriers(state, ship.owner)
    .filter((c) => (c.cargo?.length ?? 0) > 0 && distance(c.x, c.y, ship.x, ship.y) <= NAVAL.huntRange)
    .sort((a, b) => distance(ship.x, ship.y, a.x, a.y) - distance(ship.x, ship.y, b.x, b.y))[0];
  if (convoy) {
    if (distance(convoy.x, convoy.y, ship.x, ship.y) > 1) {
      const beside = DIRS8.map(([dx, dy]) => [convoy.x + dx, convoy.y + dy] as [number, number]).filter(
        ([x, y]) => x >= 0 && y >= 0 && x < state.width && y < state.height && isWater(state, x, y),
      );
      const spot = reachable(state, ship, beside);
      if (spot) moveToward(state, ship, spot[0], spot[1]);
    }
    return;
  }

  wander(state, ship);
}

/** A ship's turn. */
export function actShip(state: GameState, ship: Unit, helpers: NavalHelpers): void {
  if (!NAVAL.enabled) return;
  if (unitType(ship.type).carries > 0) actCarrier(state, ship, helpers);
  else actWarship(state, ship, helpers);
}

// ------------------------------------------------------------------ production

/** Somebody waiting on the shore for a boat, or aboard one. */
export function passageWanted(state: GameState, playerId: number): number {
  return state.units.filter((u) => u.owner === playerId && u.wantsPassage).length;
}

/**
 * Stranded: no enemy town known, and every island we hold has been walked
 * end to end. The one case where a ship is wanted before anybody has asked.
 *
 * Asked of the islands themselves rather than of the edge of the unknown,
 * because every coast touches unexplored sea and that edge never empties.
 */
export function stranded(state: GameState, playerId: number): boolean {
  const seen = state.players[playerId].explored;
  const known = state.cities.some(
    (c) => c.owner !== playerId && !state.players[c.owner]?.barbarian && seen[idx(c.x, c.y, state.width)],
  );
  if (known) return false;
  const labels = landmasses(state);
  const ours = new Set(playerCities(state, playerId).map((c) => labels[idx(c.x, c.y, state.width)]));
  if (ours.size === 0) return false;
  for (let i = 0; i < labels.length; i++) {
    if (ours.has(labels[i]) && !seen[i]) return false;
  }
  return true;
}

/**
 * A ship this city should build, if the empire needs one and this is the place.
 * One yard at a time: a carrier already on the slips anywhere counts.
 */
export function shipToBuild(
  state: GameState,
  city: City,
  offered: UnitTypeDef[],
): ProductionItem | null {
  if (!NAVAL.enabled || !isCoastal(state, city)) return null;
  const carrier = offered.find((u) => u.carries > 0);
  const warship = offered.find((u) => u.sails && u.attack > 0);
  const building = (pick: (t: UnitTypeDef) => boolean) =>
    playerCities(state, city.owner).filter(
      (c) => c.producing.kind === 'unit' && pick(unitType(c.producing.id)) && c.id !== city.id,
    ).length;

  const waiting = passageWanted(state, city.owner);
  const lost = stranded(state, city.owner);
  if (carrier && (waiting > 0 || lost)) {
    const want = Math.min(NAVAL.maxCarriers, Math.max(1, Math.ceil(waiting / carrier.carries)));
    const have = carriers(state, city.owner).length + building((t) => t.carries > 0);
    if (have < want) return { kind: 'unit', id: carrier.id };
  }
  if (warship) {
    const viewer = state.players[city.owner];
    const threat = state.units.some(
      (u) => u.owner !== city.owner && unitType(u.type).sails && viewer.visible[idx(u.x, u.y, state.width)],
    );
    const convoys = carriers(state, city.owner).length;
    const want = Math.min(NAVAL.maxWarships, (threat ? 1 : 0) + convoys);
    const have = warships(state, city.owner).length + building((t) => t.sails && t.attack > 0);
    if (have < want) return { kind: 'unit', id: warship.id };
  }
  return null;
}
