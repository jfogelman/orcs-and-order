import { DIRS8, idx } from '../engine/grid';
import { TECHS } from '../model/techs';
import { TERRAIN } from '../model/terrain';
import type { GameState, Player, TerrainId, Unit } from '../model/types';
import { unitType } from '../model/units';
import { hasFlag, terrainMoveCost } from './rules';
import { log } from './gamestate';

/**
 * Roads: the first thing on the map that somebody put there.
 *
 * Section 27 set the order -- the overlay and the save first, then movement,
 * then trade, then anything that changes a tile's yield -- and this is the
 * first two. The rules are Civ2's, deliberately:
 *
 * - **A step from one road tile to another costs a third of a point.** Onto a
 *   road from open ground, or off one, is the ground's price as ever.
 * - **A city is a road.** Every city tile counts, so a road that reaches the
 *   gate joins the city.
 * - **Workers lay them.** The Peon and the Peasant, who until now dug holes for
 *   a living and did nothing with the ground but stand on it.
 * - **Rough ground takes longer.** Two turns on open ground, four in the
 *   woods, the hills or the bog, six up a mountain.
 * - **Anybody may use one.** A road does not know whose it is.
 *
 * Nothing here changes a tile's food, shields or trade. That is section 27's
 * third step, and it moves the economy, so it wants measuring on its own.
 */
export const ROADS = {
  /**
   * Movement spent on a step from one road tile to another.
   *
   * A lever in thirds: `snapMoves` rounds what is left to the nearest third,
   * so a value that is not a whole number of thirds would be rounded with it.
   */
  moveCost: 1 / 3,
  /** Worker-turns to lay a road, by ground. Ground not listed cannot take one. */
  turns: {
    grass: 2,
    desert: 2,
    forest: 4,
    hills: 4,
    swamp: 4,
    mountains: 6,
  } as Partial<Record<TerrainId, number>>,
};

/** Whether a tile counts as road: a road laid on it, or a city standing on it. */
export function hasRoad(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
  if (state.roads?.[idx(x, y, state.width)] === 1) return true;
  return state.cities.some((c) => c.x === x && c.y === y);
}

/**
 * Movement points to step from one tile onto its neighbour.
 *
 * The one place a step is priced, so the pathfinder, the march estimate and the
 * step itself cannot disagree about what a road is worth. They each read the
 * terrain directly before this existed, which is how section 27 counted four
 * places to change.
 */
export function stepCost(
  state: GameState,
  player: Player,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const ground = terrainMoveCost(player, state.terrain[idx(toX, toY, state.width)]);
  // No road anywhere on the map -- every game with only the AI in it, and every
  // game before somebody lays the first one. Cities count as roads, but no two
  // cities are ever adjacent (`MIN_CITY_SPACING`), so without a single road laid
  // no step can be a road step. Answered here without looking, which keeps the
  // pathfinder's hot loop as cheap as it was and those games identical.
  if (!state.roads) return ground;
  if (Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY)) !== 1) return ground;
  return hasRoad(state, fromX, fromY) && hasRoad(state, toX, toY)
    ? Math.min(ground, ROADS.moveCost)
    : ground;
}

/**
 * Every tile joined by road to (x, y), as tile indices: the network a city sits
 * on.
 *
 * Walked across road this player has explored, and nothing else. The AI decides
 * from what its side knows, never from the board, and a stretch of road through
 * the fog is not one it can count on. City tiles count as road, as they do for
 * movement, and so do diagonal steps.
 */
export function connectedByRoad(
  state: GameState,
  viewerId: number,
  x: number,
  y: number,
): Set<number> {
  const seen = new Set<number>();
  if (!hasRoad(state, x, y)) return seen;
  const start = idx(x, y, state.width);
  seen.add(start);
  // No road laid anywhere, and no two cities are ever adjacent, so a city is on
  // a network of one.
  if (!state.roads) return seen;
  const explored = state.players[viewerId]?.explored;
  const queue = [start];
  while (queue.length > 0) {
    const i = queue.pop()!;
    const cx = i % state.width;
    const cy = Math.floor(i / state.width);
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const ni = idx(nx, ny, state.width);
      if (seen.has(ni) || !explored?.[ni] || !hasRoad(state, nx, ny)) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  return seen;
}

/**
 * Pillaging: tearing up what somebody else put on the ground.
 *
 * Section 96 waited on section 27 for a reason it stated plainly -- there was
 * nothing out there to ruin. A tile carried terrain and sometimes a special, and
 * a special is generated rather than chosen, so destroying one would be bad luck
 * rather than a consequence of leaving a border unwatched. Roads are the first
 * thing on the map that somebody decided to build, and section 106 made them
 * worth money, so now there is something to lose.
 *
 * The rule is Civ2's and is one line: a unit spends its turn and the road is
 * gone. What makes it interesting is not the mechanic but where it happens --
 * the road you were relying on, between the two cities that were paying you.
 */
export const PILLAGE = {
  /** Whether anything can be torn up at all. A lever, so it measures as an arm. */
  enabled: true,
};

/**
 * Whether this unit could tear up what it is standing on, and why not.
 *
 * Soldiers only: a Peon that could undo its own morning's work would be a
 * different feature (Civ2 let settlers clear their own improvements), and the
 * point of this one is what an enemy does to you.
 */
export function canPillage(state: GameState, unit: Unit): { ok: boolean; reason?: string } {
  if (!PILLAGE.enabled) return { ok: false, reason: 'Nothing can be torn up.' };
  if (unitType(unit.type).settler) return { ok: false, reason: 'Workers build; soldiers wreck.' };
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left.' };
  const i = idx(unit.x, unit.y, state.width);
  // A city tile counts as a road for movement and for trade, and is not one:
  // tearing up a city is sacking it, which is section 95 and a different rule.
  if (state.cities.some((c) => c.x === unit.x && c.y === unit.y)) {
    return { ok: false, reason: 'A city is not a road.' };
  }
  // Section 102's garrison posts are the second customer this rule was promised.
  // Anything somebody chose to put here counts.
  if (state.roads?.[i] !== 1 && state.posts?.[i] !== 1) {
    return { ok: false, reason: 'There is nothing here to tear up.' };
  }
  return { ok: true };
}

/**
 * Tear up the road underfoot. Returns whether anything happened.
 *
 * Costs the whole turn, like laying one, and is told to everybody watching the
 * tile. The louder half of the news is section 106's: a trade route that runs
 * through here says so on its own, by name, the moment the link breaks.
 */
export function pillage(state: GameState, unit: Unit): boolean {
  if (!canPillage(state, unit).ok) return false;
  const i = idx(unit.x, unit.y, state.width);
  // Whatever is here, in one turn's work: standing on a post beside a road and
  // being made to choose which to ruin is bookkeeping, not a decision.
  const hadPost = state.posts?.[i] === 1;
  const hadRoad = state.roads?.[i] === 1;
  if (hadRoad) state.roads![i] = 0;
  if (hadPost) state.posts![i] = 0;
  unit.moves = 0;
  unit.order = 'none';
  const who = state.players[unit.owner];
  const name = who?.barbarian ? 'Raiders' : who?.name ?? 'Somebody';
  for (const p of state.players) {
    if (p.barbarian || p.visible[i] !== 1) continue;
    log(
      state,
      hadPost && hadRoad
        ? `${name} tear up the road and the post with it.`
        : hadPost
          ? `${name} tear down the garrison post.`
          : `${name} tear up the road.`,
      p.id === unit.owner ? 'info' : 'bad',
      p.id,
      undefined,
      [unit.x, unit.y],
    );
  }
  return true;
}

/** Worker-turns to lay a road on this ground, or null if it cannot take one. */
export function roadTurns(terrain: TerrainId): number | null {
  return ROADS.turns[terrain] ?? null;
}

/**
 * Whether this unit may lay roads at all, wherever it stands: a worker, whose
 * side knows how.
 *
 * Roads are taught by the advance that carries the `bridges` flag -- Bridge
 * Building, the movement advance, which a Horde learns by about turn 21 and a
 * Kingdom by about 24. Mapmaking was the other candidate and arrives by turn 12
 * to 15, which would barely gate anything. The gate is on laying a road, not on
 * walking one: anybody may use a road somebody else laid. Section 105.
 */
export function canLayRoads(state: GameState, unit: Unit): { ok: boolean; reason?: string } {
  if (!unitType(unit.type).settler) return { ok: false, reason: 'Only workers lay roads.' };
  if (!hasFlag(state.players[unit.owner], 'bridges')) {
    // Named from the tech table, so renaming the advance cannot leave this stale.
    const teacher = TECHS.find((t) => t.flags.includes('bridges'))?.name ?? 'the right advance';
    return { ok: false, reason: `Roads need ${teacher}.` };
  }
  return { ok: true };
}

/** Whether this unit could start a road where it is standing, and why not. */
export function canBuildRoad(state: GameState, unit: Unit): { ok: boolean; reason?: string } {
  const may = canLayRoads(state, unit);
  if (!may.ok) return may;
  const i = idx(unit.x, unit.y, state.width);
  const terrain = state.terrain[i];
  if (TERRAIN[terrain].water) return { ok: false, reason: 'Not on water.' };
  if (roadTurns(terrain) === null) {
    return { ok: false, reason: `Nobody can lay a road on ${TERRAIN[terrain].name}.` };
  }
  if (state.cities.some((c) => c.x === unit.x && c.y === unit.y)) {
    return { ok: false, reason: 'A city is a road already.' };
  }
  if (state.roads?.[i] === 1) return { ok: false, reason: 'There is a road here already.' };
  return { ok: true };
}

/** Set a worker digging. Returns whether it started. */
export function startRoad(state: GameState, unit: Unit): boolean {
  if (!canBuildRoad(state, unit).ok) return false;
  unit.order = 'road';
  unit.work = roadTurns(state.terrain[idx(unit.x, unit.y, state.width)])!;
  unit.goto = null;
  return true;
}

/**
 * One turn of digging, at the top of the worker's turn.
 *
 * `stopped` when there is no longer a road to lay here -- another worker
 * finished it, or somebody founded a city on the spot -- so the worker is freed
 * rather than digging at a road that already exists.
 */
export function advanceRoadWork(state: GameState, unit: Unit): 'done' | 'working' | 'stopped' {
  if (!canBuildRoad(state, unit).ok) {
    unit.order = 'none';
    delete unit.work;
    return 'stopped';
  }
  const i = idx(unit.x, unit.y, state.width);
  unit.work = (unit.work ?? roadTurns(state.terrain[i]) ?? 1) - 1;
  if (unit.work > 0) return 'working';
  // Created on the first road rather than with the map, so a game nobody has
  // built in -- and every save from before roads existed -- carries nothing.
  state.roads ??= new Array(state.width * state.height).fill(0);
  state.roads[i] = 1;
  unit.order = 'none';
  delete unit.work;
  return 'done';
}

/**
 * Movement left, snapped to the nearest third.
 *
 * Three road steps from one point should leave exactly nothing, and in floating
 * point they leave 1e-16 -- a unit that still reads as having moves, and so as
 * idle, forever. Whole points are unaffected.
 */
export function snapMoves(moves: number): number {
  return Math.max(0, Math.round(moves * 3) / 3);
}

/** Movement for people to read: "1", "⅔", "1⅓". */
export function formatMoves(moves: number): string {
  const thirds = Math.round(moves * 3);
  const whole = Math.floor(thirds / 3);
  const part = ['', '⅓', '⅔'][thirds % 3];
  return whole === 0 && part ? part : `${whole}${part}`;
}
