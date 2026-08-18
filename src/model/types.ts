/**
 * The shape of the world.
 *
 * `GameState` is a plain, JSON-serialisable object with no methods and no
 * cyclic references — every rule lives in `src/sim/` as a function over this
 * state. That is what makes saves trivial and the simulation testable.
 */

// ---------------------------------------------------------------- identifiers

export type FactionId = 'orc' | 'human';
export type TerrainId =
  | 'deep'
  | 'water'
  | 'grass'
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'swamp'
  | 'desert';

export type UnitTypeId = string;
export type TechId = string;
export type BuildingId = string;

// -------------------------------------------------------------------- players

export type Controller = 'human' | 'ai';

export interface Player {
  id: number;
  faction: FactionId;
  /** The civilisation name, e.g. "The Bleeding Skull Horde". */
  name: string;
  /** The leader's name, e.g. "Grunk the Reasonably Confident". */
  leader: string;
  controller: Controller;
  /** Map / UI colour, as a CSS hex string. */
  color: string;
  gold: number;
  /** Research points accumulated toward the current advance. */
  beakers: number;
  researching: TechId | null;
  techs: TechId[];
  /** Share of trade sent to the treasury, 0..10. The remainder becomes science. */
  taxRate: number;
  /** 0/1 per tile: has this player ever seen it? Drives the terrain memory. */
  explored: number[];
  /** 0/1 per tile: can this player see it right now? Recomputed each turn. */
  visible: number[];
  alive: boolean;
}

// ---------------------------------------------------------------------- units

export type UnitOrder = 'none' | 'fortified' | 'sentry' | 'skip';

export interface Unit {
  id: number;
  owner: number;
  type: UnitTypeId;
  x: number;
  y: number;
  hp: number;
  /** Movement points remaining this turn. */
  moves: number;
  veteran: boolean;
  order: UnitOrder;
  /** Standing destination; the unit resumes walking there each turn. */
  goto: { x: number; y: number } | null;
  /** City that supports this unit, or null for free units. */
  homeCity: number | null;
  /**
   * Has thrown its one weapon and not yet got it back. Only ever true for
   * creatures that throw the thing they fight with.
   */
  disarmed: boolean;
}

// --------------------------------------------------------------------- cities

export type ProductionItem =
  | { kind: 'unit'; id: UnitTypeId }
  | { kind: 'building'; id: BuildingId }
  | { kind: 'coin' };

export interface City {
  id: number;
  owner: number;
  name: string;
  x: number;
  y: number;
  size: number;
  /** Food accumulated toward the next citizen. */
  food: number;
  /** Shields accumulated toward the current production item. */
  shields: number;
  buildings: BuildingId[];
  producing: ProductionItem;
  /** Flat tile indices currently worked by citizens (excludes the centre). */
  workedTiles: number[];
  /** True while the city is rioting; it produces nothing. */
  disorder: boolean;
  foundedTurn: number;
  /**
   * Who actually lives here, one entry per point of size.
   *
   * Purely descriptive -- nothing in the rules reads it. Rolled once when a
   * citizen is born and kept thereafter, so a city that filled up before you
   * could attract ogres keeps the goblins it already had.
   */
  citizens?: string[];
}

// ------------------------------------------------------------------ game meta

export interface LogEntry {
  turn: number;
  /** Player this message is addressed to, or null for everyone. */
  player: number | null;
  text: string;
  kind: 'info' | 'combat' | 'growth' | 'research' | 'bad' | 'good';
  /**
   * Optional name of a sound this event should make. The simulation says what
   * happened; the interface decides what that sounds like, so `sim/` still
   * knows nothing about audio.
   */
  cue?: string;
  /**
   * Where on the map this happened, for anything that wants to draw it there.
   * Sound does not need it, animation does; keeping it beside `cue` means the
   * simulation still says only what happened and where, never how to show it.
   */
  at?: readonly [number, number];
  /**
   * The unit that did it, for anything that wants to animate the doer rather
   * than the place. Kept as an id and not a reference so the log stays
   * serialisable, and looked up defensively -- by the time this is read the
   * unit may well be dead.
   */
  actor?: number;
}

export interface GameSettings {
  width: number;
  height: number;
  /** 0..1, share of the map that should end up as land. */
  landRatio: number;
  difficulty: 'peaceful' | 'normal' | 'nasty';
  /** After this turn, the highest score wins by default. */
  maxTurns: number;
}

export interface GameState {
  /** Bumped when the save format changes incompatibly. */
  version: number;
  seed: number;
  /**
   * Live PRNG cursor for in-game rolls (combat, AI coin flips). Stored in the
   * state rather than a module global so that saving and reloading resumes the
   * exact same random stream.
   */
  rngState: number;
  turn: number;
  width: number;
  height: number;
  terrain: TerrainId[];
  /** 0/1 per tile: does this tile carry its terrain's special resource? */
  specials: number[];
  players: Player[];
  units: Unit[];
  cities: City[];
  activePlayer: number;
  nextUnitId: number;
  nextCityId: number;
  log: LogEntry[];
  winner: number | null;
  settings: GameSettings;
}
