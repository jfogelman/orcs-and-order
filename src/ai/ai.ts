import { DIRS8, distance, fatCrossIndices, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { City, GameState, Player, ProductionItem, Unit } from '../model/types';
import { buildOptions, canFoundCity, foundCity, tileYield } from '../sim/city';
import { playerCities, playerUnits, withRng } from '../sim/gamestate';
import { attackTargets, moveToward, routeTo, tryStep } from '../sim/movement';
import { researchableTechs, setResearch, techCost } from '../sim/research';

/**
 * The opposition.
 *
 * Deliberately simple and deliberately in character: the Horde builds the
 * biggest thing it can afford and walks it at the nearest enemy, while the
 * Kingdom expands and garrisons first and only then goes looking for trouble.
 * The interface is one function, so a better brain can replace this wholesale.
 */

export interface AiPersonality {
  /** Cities the AI wants before it stops prioritising settlers. */
  targetCities: number;
  /** Share of production spent on defenders rather than attackers. */
  garrisonPerCity: number;
  /** Preferred research, tried in order before falling back to cheapest. */
  techPriority: string[];
  /** How readily it attacks at poor odds. 1 = only good odds, 0 = always. */
  caution: number;
}

const PERSONALITIES: Record<string, AiPersonality> = {
  orc: {
    // The Horde is supposed to be the numerous one. Expanding to only four
    // cities left it permanently behind on trade, and therefore permanently
    // stuck at the bottom of its own counting ladder.
    targetCities: 6,
    garrisonPerCity: 1,
    // The Horde's research programme is the counting ladder, with a couple of
    // detours for things to hit people with. Straying too far from the ladder
    // meant the late-game units were never fielded at all.
    techPriority: [
      'orc-meaning',
      'orc-together',
      'idiots-stick-together',
      'to-be-an-orc',
      'axes',
      'next-level-stupid',
      'throwing-buddies',
      'beyond-stupid',
      'not-just-stupid',
      'stupidity-for-all',
      'axes-crazy',
      'my-little-friend',
      'dead-messed-up',
      'full-of-fire',
    ],
    caution: 0.25,
  },
  human: {
    targetCities: 6,
    garrisonPerCity: 2,
    techPriority: [
      'brotherhood',
      'archery',
      'join-army',
      'mapmaking',
      'horses-sneeze',
      'bunches-footmen',
      'tree-hugging',
      'ten-heads',
      'wall-building',
      'pointed-ears',
      'let-us-ride',
      'run-you-through',
      'arrows-glory',
    ],
    caution: 0.6,
  },
};

// -------------------------------------------------------------- evaluation

function siteScore(state: GameState, x: number, y: number): number {
  let score = 0;
  let land = 0;
  for (const i of fatCrossIndices(x, y, state.width, state.height)) {
    const y2 = tileYield(state, i, false);
    if (!TERRAIN[state.terrain[i]].water) land++;
    score += y2.food * 3 + y2.shields * 2 + y2.trade;
  }
  if (land < 10) return -1;
  return score;
}

/** Rough odds the attacker wins, used to keep the AI from obvious suicide. */
function attackOdds(state: GameState, attacker: Unit, defender: Unit): number {
  const a = unitType(attacker.type);
  const d = unitType(defender.type);
  const terrain = TERRAIN[state.terrain[idx(defender.x, defender.y, state.width)]];
  const atk = a.attack * (attacker.veteran ? 1.5 : 1) * (attacker.hp / a.hp);
  const def =
    d.defense *
    (defender.veteran ? 1.5 : 1) *
    terrain.defense *
    (defender.order === 'fortified' ? 1.5 : 1);
  return atk / Math.max(0.0001, atk + def);
}

function nearestEnemyTarget(
  state: GameState,
  playerId: number,
  from: Unit,
): { x: number; y: number } | null {
  const player = state.players[playerId];
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  const consider = (x: number, y: number, weight: number) => {
    if (!player.explored[idx(x, y, state.width)]) return;
    const dist = distance(from.x, from.y, x, y) * weight;
    if (dist < bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  };

  for (const c of state.cities) if (c.owner !== playerId) consider(c.x, c.y, 1);
  for (const u of state.units) {
    if (u.owner !== playerId && player.visible[idx(u.x, u.y, state.width)]) {
      consider(u.x, u.y, 1.6);
    }
  }
  return best;
}

/**
 * Explored land tiles that still touch the unknown — the places worth walking
 * to in order to see more.
 *
 * Computed once per AI turn rather than per unit: scanning the whole map for
 * every soldier every turn was the AI's other hot spot.
 */
function frontierTiles(state: GameState, player: Player): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const i = idx(x, y, state.width);
      if (!player.explored[i]) continue;
      if (TERRAIN[state.terrain[i]].water) continue;
      let touchesUnknown = false;
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        if (!player.explored[idx(nx, ny, state.width)]) {
          touchesUnknown = true;
          break;
        }
      }
      if (touchesUnknown) out.push([x, y]);
    }
  }
  return out;
}

function nearestFrontier(
  frontier: Array<[number, number]>,
  from: Unit,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const [x, y] of frontier) {
    const dist = distance(from.x, from.y, x, y);
    if (dist > 0 && dist < bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  }
  return best;
}

// ------------------------------------------------------------- production

function chooseProduction(
  state: GameState,
  city: City,
  personality: AiPersonality,
): ProductionItem {
  const owner = state.players[city.owner];
  const options = buildOptions(state, city);
  if (options.units.length === 0) return { kind: 'coin' };

  // A garrison is whoever is standing on or beside the city. Counting only the
  // city tile would never reach two, because only one unit fits on a tile.
  const garrison = state.units.filter(
    (u) => u.owner === city.owner && distance(u.x, u.y, city.x, city.y) <= 1 && !unitType(u.type).settler,
  ).length;
  const cities = playerCities(state, city.owner).length;
  const settlers = playerUnits(state, city.owner).filter((u) => unitType(u.type).settler).length;

  // 1. Somebody has to hold the gate.
  if (garrison < personality.garrisonPerCity) {
    const defender = [...options.units]
      .filter((u) => u.attack > 0)
      .sort((a, b) => b.defense / b.cost - a.defense / a.cost)[0];
    if (defender) return { kind: 'unit', id: defender.id };
  }

  // 2. Expand while there is room to expand into.
  if (cities + settlers < personality.targetCities) {
    const settler = options.units.find((u) => u.settler);
    if (settler) return { kind: 'unit', id: settler.id };
  }

  // 3. Useful buildings, when they can be afforded comfortably.
  const wantedBuilding = options.buildings.find(
    (b) => (b.id === 'barracks' || b.id === 'walls') && b.cost <= 80,
  );
  if (wantedBuilding && city.size >= 3 && withRng(state, (r) => r.chance(0.35))) {
    return { kind: 'building', id: wantedBuilding.id };
  }

  // 4. Otherwise: the biggest stick currently affordable in reasonable time.
  const attackers = [...options.units]
    .filter((u) => u.attack > 0 && !u.settler)
    .sort((a, b) => b.attack - a.attack);
  const affordable = attackers.find((u) => u.cost <= 40 + city.size * 22) ?? attackers.at(-1);
  if (affordable) return { kind: 'unit', id: affordable.id };
  void owner;
  return { kind: 'coin' };
}

// ------------------------------------------------------------------ turn

function actSettler(state: GameState, unit: Unit, personality: AiPersonality): void {
  const cities = playerCities(state, unit.owner).length;
  if (cities >= personality.targetCities + 2) {
    // Enough cities; park it somewhere safe rather than wandering forever.
    unit.order = 'sentry';
    return;
  }

  const here = canFoundCity(state, unit, unit.x, unit.y);
  const hereScore = here.ok ? siteScore(state, unit.x, unit.y) : -1;
  if (hereScore >= 90 || (cities === 0 && here.ok)) {
    foundCity(state, unit);
    return;
  }

  // Look for somewhere better within a short walk.
  let best: { x: number; y: number; score: number } | null = null;
  const radius = 7;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 1 || y < 1 || x >= state.width - 1 || y >= state.height - 1) continue;
      if (!canFoundCity(state, unit, x, y).ok) continue;
      const score = siteScore(state, x, y) - distance(unit.x, unit.y, x, y) * 4;
      if (score > 0 && (!best || score > best.score)) best = { x, y, score };
    }
  }

  if (best && best.score > hereScore) {
    if (!routeTo(state, unit, best.x, best.y)) {
      if (here.ok) foundCity(state, unit);
      return;
    }
    moveToward(state, unit, best.x, best.y);
    // Arrived this turn? Settle immediately rather than idling a turn.
    if (unit.x === best.x && unit.y === best.y && canFoundCity(state, unit, unit.x, unit.y).ok) {
      foundCity(state, unit);
    }
    return;
  }
  if (here.ok) foundCity(state, unit);
}

function actSoldier(
  state: GameState,
  unit: Unit,
  personality: AiPersonality,
  frontier: Array<[number, number]>,
): void {
  // Attack anything adjacent that we can beat.
  const targets = attackTargets(state, unit);
  let bestTarget: { x: number; y: number; odds: number } | null = null;
  for (const i of targets) {
    const x = i % state.width;
    const y = Math.floor(i / state.width);
    const defender = state.units.find((u) => u.x === x && u.y === y);
    const odds = defender ? attackOdds(state, unit, defender) : 1; // empty city = free
    if (!bestTarget || odds > bestTarget.odds) bestTarget = { x, y, odds };
  }
  if (bestTarget && bestTarget.odds >= personality.caution) {
    tryStep(state, unit, bestTarget.x, bestTarget.y);
    return;
  }

  // Hold undefended home cities.
  const ownCities = playerCities(state, unit.owner);
  const bare = ownCities.find(
    (c) => !state.units.some((u) => u.owner === unit.owner && u.x === c.x && u.y === c.y),
  );
  if (bare) {
    if (unit.x === bare.x && unit.y === bare.y) {
      unit.order = 'fortified';
      return;
    }
    if (distance(unit.x, unit.y, bare.x, bare.y) <= 8 && routeTo(state, unit, bare.x, bare.y)) {
      moveToward(state, unit, bare.x, bare.y);
      return;
    }
  }

  // March on whatever we know about.
  const target = nearestEnemyTarget(state, unit.owner, unit);
  if (target && routeTo(state, unit, target.x, target.y)) {
    moveToward(state, unit, target.x, target.y);
    return;
  }

  // Nothing known: go and look.
  const edge = nearestFrontier(frontier, unit);
  if (edge && routeTo(state, unit, edge.x, edge.y)) {
    moveToward(state, unit, edge.x, edge.y);
    // Spent its movement, or queued behind someone: nothing more to do.
    if (unit.moves <= 0 || unit.goto) return;
  }

  // Still here: probably wedged in behind its own army. Shuffle to any open
  // neighbour so the tile frees up and the jam unwinds over a few turns.
  if (unit.moves > 0) {
    for (const [dx, dy] of DIRS8) {
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
      if (state.units.some((u) => u.x === x && u.y === y)) continue;
      if (state.cities.some((c) => c.x === x && c.y === y && c.owner !== unit.owner)) continue;
      if (tryStep(state, unit, x, y).kind === 'moved') return;
    }
  }
  unit.order = 'fortified';
}

function chooseResearch(state: GameState, player: Player, personality: AiPersonality): void {
  if (player.researching) return;
  const options = researchableTechs(player);
  if (options.length === 0) return;
  for (const wanted of personality.techPriority) {
    const match = options.find((t) => t.id === wanted);
    if (match) {
      setResearch(state, player, match.id);
      return;
    }
  }
  const cheapest = options.reduce((a, b) => (techCost(player, a) <= techCost(player, b) ? a : b));
  setResearch(state, player, cheapest.id);
}

export function runAiTurn(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player.alive) return;
  const personality = PERSONALITIES[player.faction] ?? PERSONALITIES.orc;

  chooseResearch(state, player, personality);

  for (const city of playerCities(state, playerId)) {
    city.producing = chooseProduction(state, city, personality);
  }

  const frontier = frontierTiles(state, player);

  // Snapshot: units can die (or be consumed founding cities) mid-loop.
  for (const unit of [...playerUnits(state, playerId)]) {
    if (!state.units.includes(unit)) continue;
    if (unit.moves <= 0) continue;
    const type = unitType(unit.type);
    if (type.settler) actSettler(state, unit, personality);
    else actSoldier(state, unit, personality, frontier);
  }
}
