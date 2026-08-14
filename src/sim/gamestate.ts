import { Rng } from '../engine/rng';
import { idx, inBounds, neighbors8 } from '../engine/grid';
import { revealAround } from '../engine/fov';
import { TERRAIN } from '../model/terrain';
import { FACTIONS, otherFaction } from '../model/factions';
import { unitType } from '../model/units';
import type {
  City,
  FactionId,
  GameSettings,
  GameState,
  LogEntry,
  Player,
  Unit,
  UnitTypeId,
} from '../model/types';
import { generateWorld } from './worldgen';
import { citySight, effectiveMove, effectiveSight } from './rules';

export const SAVE_VERSION = 1;

export interface NewGameOptions {
  seed?: number;
  width?: number;
  height?: number;
  landRatio?: number;
  difficulty?: GameSettings['difficulty'];
  maxTurns?: number;
  /** Which side the person at the keyboard plays. */
  playerFaction?: FactionId;
}

// ------------------------------------------------------------- accessors

export function unitAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find((u) => u.x === x && u.y === y);
}

export function cityAt(state: GameState, x: number, y: number): City | undefined {
  return state.cities.find((c) => c.x === x && c.y === y);
}

export function findUnit(state: GameState, id: number): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

export function findCity(state: GameState, id: number): City | undefined {
  return state.cities.find((c) => c.id === id);
}

export function playerUnits(state: GameState, owner: number): Unit[] {
  return state.units.filter((u) => u.owner === owner);
}

export function playerCities(state: GameState, owner: number): City[] {
  return state.cities.filter((c) => c.owner === owner);
}

export function player(state: GameState, id: number): Player {
  return state.players[id];
}

export function humanPlayer(state: GameState): Player {
  return state.players.find((p) => p.controller === 'human') ?? state.players[0];
}

/**
 * Run a block with the game's shared random stream, committing the new cursor
 * back into the state so saves resume mid-sequence.
 */
export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rngState);
  const result = fn(rng);
  state.rngState = rng.getState();
  return result;
}

export function log(
  state: GameState,
  text: string,
  kind: LogEntry['kind'] = 'info',
  forPlayer: number | null = null,
): void {
  state.log.push({ turn: state.turn, player: forPlayer, text, kind });
  // The log is a UI convenience, not a historical record; keep it bounded.
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

// ------------------------------------------------------------ visibility

export function recomputeVisibility(state: GameState, playerId: number): void {
  const p = state.players[playerId];
  p.visible.fill(0);
  for (const u of state.units) {
    if (u.owner !== playerId) continue;
    revealAround(
      state.terrain,
      state.width,
      state.height,
      p.visible,
      p.explored,
      u.x,
      u.y,
      effectiveSight(state, p, u),
    );
  }
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    revealAround(
      state.terrain,
      state.width,
      state.height,
      p.visible,
      p.explored,
      c.x,
      c.y,
      citySight(p),
    );
  }
}

export function recomputeAllVisibility(state: GameState): void {
  for (const p of state.players) recomputeVisibility(state, p.id);
}

// ----------------------------------------------------------- construction

export function spawnUnit(
  state: GameState,
  owner: number,
  type: UnitTypeId,
  x: number,
  y: number,
  veteran = false,
): Unit {
  const u: Unit = {
    id: state.nextUnitId++,
    owner,
    type,
    x,
    y,
    hp: unitType(type).hp,
    moves: effectiveMove(state.players[owner], type),
    veteran,
    order: 'none',
    goto: null,
    homeCity: null,
  };
  state.units.push(u);
  return u;
}

/** Next unused city name for a faction, falling back to a numbered outpost. */
export function nextCityName(state: GameState, faction: FactionId): string {
  const taken = new Set(state.cities.map((c) => c.name));
  for (const name of FACTIONS[faction].cityNames) {
    if (!taken.has(name)) return name;
  }
  return `Outpost ${state.cities.length + 1}`;
}

/**
 * Breadth-first search for free land tiles near a point, used to lay out
 * starting units without ever putting two on the same tile.
 */
function freeTilesNear(
  state: GameState,
  x: number,
  y: number,
  count: number,
  typeId: UnitTypeId,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seen = new Set<number>([idx(x, y, state.width)]);
  const queue: Array<[number, number]> = [[x, y]];
  while (queue.length > 0 && out.length < count) {
    const [cx, cy] = queue.shift()!;
    const t = state.terrain[idx(cx, cy, state.width)];
    const occupied = unitAt(state, cx, cy) !== undefined;
    const passable = unitType(typeId).flies || !TERRAIN[t].water;
    if (passable && !occupied) out.push([cx, cy]);
    for (const [nx, ny] of neighbors8(cx, cy, state.width, state.height)) {
      const i = idx(nx, ny, state.width);
      if (seen.has(i)) continue;
      seen.add(i);
      queue.push([nx, ny]);
    }
  }
  return out;
}

function makePlayer(
  id: number,
  faction: FactionId,
  controller: Player['controller'],
  tileCount: number,
): Player {
  const def = FACTIONS[faction];
  return {
    id,
    faction,
    name: def.civName,
    leader: def.leader,
    controller,
    color: def.color,
    gold: 50,
    beakers: 0,
    researching: null,
    techs: [def.startTech],
    taxRate: 4,
    explored: new Array(tileCount).fill(0),
    visible: new Array(tileCount).fill(0),
    alive: true,
  };
}

export function createGame(opts: NewGameOptions = {}): GameState {
  const settings: GameSettings = {
    width: opts.width ?? 64,
    height: opts.height ?? 48,
    landRatio: opts.landRatio ?? 0.34,
    difficulty: opts.difficulty ?? 'normal',
    maxTurns: opts.maxTurns ?? 300,
  };
  const seed = (opts.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const playerFaction = opts.playerFaction ?? 'orc';
  const tileCount = settings.width * settings.height;

  const world = generateWorld(seed, settings, 2);

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: (seed ^ 0x1d872b41) >>> 0,
    turn: 1,
    width: settings.width,
    height: settings.height,
    terrain: world.terrain,
    specials: world.specials,
    players: [
      makePlayer(0, playerFaction, 'human', tileCount),
      makePlayer(1, otherFaction(playerFaction), 'ai', tileCount),
    ],
    units: [],
    cities: [],
    activePlayer: 0,
    nextUnitId: 1,
    nextCityId: 1,
    log: [],
    winner: null,
    settings,
  };

  // Starting forces: two settlers and two of the faction's first fighting unit.
  const rng = new Rng(seed ^ 0x5bf03635);
  const starts = world.starts;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const def = FACTIONS[p.faction];
    const start = starts[i] ?? starts[0] ?? { x: 4, y: 4 };
    const roster: UnitTypeId[] = [
      def.settlerUnit,
      def.settlerUnit,
      def.starterUnit,
      def.starterUnit,
    ];
    const spots = freeTilesNear(state, start.x, start.y, roster.length, def.settlerUnit);
    roster.forEach((type, n) => {
      const spot = spots[n];
      if (spot && inBounds(spot[0], spot[1], state.width, state.height)) {
        spawnUnit(state, p.id, type, spot[0], spot[1]);
      }
    });
  }
  // Consume one draw so the seed stream is defined even when nothing shifted.
  rng.next();

  recomputeAllVisibility(state);
  log(
    state,
    `${FACTIONS[playerFaction].civName} awakens. Somewhere over the horizon, so does everyone else.`,
    'info',
  );
  return state;
}
