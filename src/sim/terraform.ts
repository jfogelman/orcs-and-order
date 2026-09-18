import { DIRS8, idx } from '../engine/grid';
import { TECHS } from '../model/techs';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import type { FactionId, GameState, TerrainId, Unit } from '../model/types';
import { hasFlag } from './rules';

/**
 * Section 112: terraforming -- what a worker does once the roads are laid.
 *
 * Section 107 found the diggers piling up: 21 settler-class units standing about
 * at the end of a game with roads against 5 without, every one of them costing
 * upkeep, because once every city was joined there was nothing left for a worker
 * to do. This is the something.
 *
 * Four jobs, taught by Tree-Hugging ("having hugged the trees, everybody agrees
 * they are in the way"):
 *
 * - **irrigate** grassland or wastes for +1 food. Needs water within reach: the
 *   coast, a city, or a ditch already dug next door.
 * - **mine** hills for +1 shield, mountains for +2.
 * - **clear** a forest or a swamp to grassland. No art; the ground just changes,
 *   and so does what it is worth to defend.
 *
 * The same jobs on both sides under different names -- a Peon digs *A Ditch
 * Somebody Fell In*, a Peasant lays *Tidy Furrows* -- with one picture each.
 * Raiders can tear any of it up (`pillage` in `roads.ts`).
 */
export const TERRAFORM = {
  /** Whether the land can be improved at all. A lever, so it measures as an arm. */
  enabled: true,
  /** Worker-turns for each job, by ground. Ground not listed cannot have it done. */
  turns: {
    irrigate: { grass: 3, desert: 4 },
    mine: { hills: 5, mountains: 8 },
    clear: { forest: 5, swamp: 6 },
  } as Record<Job, Partial<Record<TerrainId, number>>>,
  /** Food an irrigated tile adds. */
  food: 1,
  /** Shields a mine adds, by ground. */
  shields: { hills: 1, mountains: 2 } as Partial<Record<TerrainId, number>>,
  /** What a cleared forest or swamp becomes. */
  becomes: 'grass' as TerrainId,
};

export type Job = 'irrigate' | 'mine' | 'clear';
export const JOBS: Job[] = ['irrigate', 'mine', 'clear'];

/** The plain verb, for a button. */
export const JOB_VERB: Record<Job, string> = { irrigate: 'Irrigate', mine: 'Mine', clear: 'Clear' };

/**
 * What each side calls the job. Clearing depends on what is being cleared: a
 * forest is stamped flat or managed away; a swamp is somebody falling in again,
 * or a committee of three with one pump.
 */
export function jobName(job: Job, faction: FactionId, terrain?: TerrainId): string {
  if (job === 'irrigate') return faction === 'orc' ? 'A Ditch Somebody Fell In' : 'Tidy Furrows';
  if (job === 'mine') return faction === 'orc' ? 'The Big Hole' : 'A Respectable Mine';
  if (terrain === 'swamp') return faction === 'orc' ? 'Somebody Fell In Again' : 'Reclaiming the Bog';
  return faction === 'orc' ? 'Stomping It Flat' : 'Managed Woodland Reduction';
}

/** Worker-turns for this job on this ground, or null if it cannot be done there. */
export function jobTurns(job: Job, terrain: TerrainId): number | null {
  return TERRAFORM.turns[job][terrain] ?? null;
}

/** Whether a tile is irrigated, or could irrigate the tile beside it. */
function wet(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
  const i = idx(x, y, state.width);
  if (TERRAIN[state.terrain[i]].water) return true;
  if (state.irrigation?.[i] === 1) return true;
  return state.cities.some((c) => c.x === x && c.y === y);
}

/**
 * Why this tile cannot have this job done, or null if it can. The tile alone --
 * who is asking is `canImprove`'s question -- so the AI can survey land it is not
 * standing on.
 */
export function tileBlocked(state: GameState, i: number, job: Job): string | null {
  const terrain = state.terrain[i];
  const def = TERRAIN[terrain];
  const x = i % state.width;
  const y = Math.floor(i / state.width);
  if (def.water) return 'Not on water.';
  if (state.cities.some((c) => c.x === x && c.y === y)) return 'A city is in the way.';
  if (jobTurns(job, terrain) === null) {
    if (job === 'irrigate') return `Nothing grows on ${def.name} that water would help.`;
    if (job === 'mine') return `There is nothing under ${def.name} worth digging for.`;
    return `There is nothing on ${def.name} to clear.`;
  }
  if (job === 'irrigate') {
    if (state.irrigation?.[i] === 1) return 'Already irrigated.';
    if (!DIRS8.some(([dx, dy]) => wet(state, x + dx, y + dy))) {
      return 'No water within reach: dig beside the coast, a city, or another ditch.';
    }
  }
  if (job === 'mine' && state.mines?.[i] === 1) return 'Already mined.';
  return null;
}

/** Whether this worker could start this job where it stands, and why not. */
export function canImprove(state: GameState, unit: Unit, job: Job): { ok: boolean; reason?: string } {
  if (!TERRAFORM.enabled) return { ok: false, reason: 'Nobody here knows how to improve the land.' };
  if (!unitType(unit.type).settler) return { ok: false, reason: 'Only workers dig.' };
  if (!hasFlag(state.players[unit.owner], 'terraform')) {
    // Named from the tech table, so renaming the advance cannot leave this stale.
    const teacher = TECHS.find((t) => t.flags.includes('terraform'))?.name ?? 'the right advance';
    return { ok: false, reason: `That needs ${teacher}.` };
  }
  const blocked = tileBlocked(state, idx(unit.x, unit.y, state.width), job);
  return blocked ? { ok: false, reason: blocked } : { ok: true };
}

/** Set a worker to a job where it stands. Returns whether it started. */
export function startImprove(state: GameState, unit: Unit, job: Job): boolean {
  if (!canImprove(state, unit, job).ok) return false;
  unit.order = 'improve';
  unit.job = job;
  unit.work = jobTurns(job, state.terrain[idx(unit.x, unit.y, state.width)])!;
  unit.goto = null;
  delete unit.roadTo;
  return true;
}

/**
 * One turn of work, at the top of the worker's turn.
 *
 * `stopped` when the job can no longer be done here -- another worker finished
 * it, or somebody founded a city on the spot. `what` names what was made, in the
 * owner's words, for the line in the log.
 */
export function advanceImproveWork(
  state: GameState,
  unit: Unit,
): { status: 'done' | 'working' | 'stopped'; what?: string } {
  const job = unit.job;
  const i = idx(unit.x, unit.y, state.width);
  if (!job || tileBlocked(state, i, job) !== null) {
    unit.order = 'none';
    delete unit.work;
    delete unit.job;
    return { status: 'stopped' };
  }
  const terrain = state.terrain[i];
  unit.work = (unit.work ?? jobTurns(job, terrain) ?? 1) - 1;
  if (unit.work > 0) return { status: 'working' };

  const what = jobName(job, state.players[unit.owner].faction, terrain);
  const blank = () => new Array(state.width * state.height).fill(0);
  if (job === 'irrigate') {
    // Created with the first ditch rather than with the map, like the roads, so a
    // save from before terraforming -- and a game nobody dug in -- carries nothing.
    state.irrigation ??= blank();
    state.irrigation[i] = 1;
  } else if (job === 'mine') {
    state.mines ??= blank();
    state.mines[i] = 1;
  } else {
    state.terrain[i] = TERRAFORM.becomes;
    // The special went with the trees, or the bog.
    state.specials[i] = 0;
    // The map picture is built once and kept, so it has to be told.
    state.terrainEdits = (state.terrainEdits ?? 0) + 1;
  }
  unit.order = 'none';
  delete unit.work;
  delete unit.job;
  return { status: 'done', what };
}

/**
 * What the worked land adds to a tile, on top of its terrain and any special.
 *
 * Not gated on the lever: a game with it off never digs anything, and one that
 * did before it was switched off keeps what it dug.
 */
export function improvementYield(state: GameState, i: number): { food: number; shields: number } {
  const terrain = state.terrain[i];
  return {
    food: state.irrigation?.[i] === 1 && jobTurns('irrigate', terrain) !== null ? TERRAFORM.food : 0,
    shields: state.mines?.[i] === 1 ? (TERRAFORM.shields[terrain] ?? 0) : 0,
  };
}
