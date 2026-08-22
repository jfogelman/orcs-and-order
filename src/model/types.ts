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
  /**
   * Turn this player first held a commanding share of the map without
   * interruption, or absent if they do not hold one now.
   *
   * Optional so old saves load unchanged. Cleared the moment the share slips,
   * so it measures an unbroken run rather than a total.
   */
  dominantSince?: number;
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
  /**
   * How many times this unit has been promoted, 0 to 3.
   *
   * Replaces a single `veteran` flag. Rank 1 is worth exactly what veteran
   * was, so nothing about an ordinary promoted unit has changed; the two
   * ranks above it are new.
   */
  rank: number;
  /** Experience toward the next rank. */
  xp: number;
  /**
   * Perks chosen on promotion, one per rank.
   *
   * Optional so old saves and test fixtures need not declare it; a unit owes a
   * choice whenever it has fewer of these than it has ranks.
   */
  perks?: string[];
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
  /**
   * Conditions this unit is under, with the turns left on each.
   *
   * Optional so old saves and test fixtures need not declare it; absent and
   * empty mean the same thing.
   */
  statuses?: Status[];
}

// --------------------------------------------------------------------- cities

/**
 * What a city does when it finishes something and needs a new order.
 *
 * `ask` leaves it on Coin for the interface to raise with the player.
 * `repeat` goes back to making the unit it was making. `coin` banks the
 * shields and stops asking --
 * which, before this existed, could not be expressed at all: a city left on
 * Coin was quietly given something to build on the following turn whether that
 * was wanted or not.
 */
export type AutoBuild = 'ask' | 'repeat' | 'coin';

/**
 * A condition a unit is under for a few turns.
 *
 * Deliberately separate from `disarmed`, which is a bare boolean with no
 * duration and ends by killing something rather than by waiting.
 */
export type StatusKind = 'burning' | 'frozen' | 'confused' | 'spent';

export interface Status {
  kind: StatusKind;
  /** Turns left, counted down at the start of the owner's turn. */
  turns: number;
}

/**
 * What a blow is made of.
 *
 * Only exists so that resistance can be to *something* rather than to damage in
 * general. A creature that shrugs off spells should still feel an axe.
 */
export type DamageKind = 'physical' | 'magic';

/**
 * What a city is working on.
 *
 * The three standing choices -- coin, beakers, calm -- are things a city can
 * always do, as opposed to things it can finish. They never complete, so a city
 * set to one stays on it until told otherwise, and none of them can be
 * exhausted the way a building list can.
 *
 * `calm` matters more than it looks. A rioting city produces nothing, so before
 * this existed it could be left with no action that would end the riot once
 * every content building was already up: a trap rather than a setback. Spending
 * production on placating people is always available, so there is always a way
 * out.
 */
/**
 * The three ways a game can end.
 *
 * `conquest` is the last civilisation standing, `dominance` is holding most of
 * the world long enough for it to count, and `points` is the clock running out
 * -- which the game itself describes as satisfying nobody.
 *
 * `draw` is the clock running out with the totals exactly level, and is the one
 * ending with no winner at all: `winner` stays null. Use isOver() rather than a
 * null check to ask whether a game has finished.
 */
export type VictoryKind = 'conquest' | 'dominance' | 'points' | 'draw';

export type ProductionItem =
  | { kind: 'unit'; id: UnitTypeId }
  | { kind: 'building'; id: BuildingId }
  | { kind: 'coin' }
  | { kind: 'beakers' }
  | { kind: 'calm' };

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
  /**
   * What this city does when it finishes something and needs a new order.
   *
   * Optional so old saves and test fixtures need not declare it; absent means
   * `ask`, which is what a player who has never touched the setting expects.
   */
  autoBuild?: AutoBuild;
  /**
   * The last unit this city built, so `repeat` knows what to go back to.
   *
   * Needed because finishing a unit does not clear `producing` -- a city making
   * units already makes more without being told -- so by the time a standing
   * order is consulted at all, what it should repeat has been gone a while.
   */
  lastUnit?: UnitTypeId;
  /** Flat tile indices currently worked by citizens (excludes the centre). */
  workedTiles: number[];
  /** True while the city is rioting; it produces nothing. */
  disorder: boolean;
  foundedTurn: number;
  /**
   * Who founded it, which is not always who holds it.
   *
   * Optional for old saves, where it is unknown and the holder is assumed.
   */
  foundedBy?: number;
  /**
   * Who actually lives here, one entry per point of size.
   *
   * Purely descriptive -- nothing in the rules reads it. Rolled once when a
   * citizen is born and kept thereafter, so a city that filled up before you
   * could attract ogres keeps the goblins it already had.
   */
  citizens?: string[];
  /**
   * Turn until which this place is still a ruin, after being sacked.
   *
   * A city taken by storm used to regrow to full size long before anybody came
   * back for it, which is why repeated capture never ground one down to
   * nothing. Absent on a city that has never changed hands.
   */
  ruinedUntil?: number;
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
  /**
   * What this is about, when the interface needs to know which picture to
   * use and the position alone will not say -- a razed city names its
   * faction and size tier, so the right settlement can be shown collapsing.
   */
  subject?: string;
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
  /**
   * How the game ended, so the ending can be shown rather than described.
   *
   * Optional because a save from before this existed knows it has a winner but
   * not how; the interface falls back to the conquest picture, which is right
   * for two of the three routes.
   */
  victory?: VictoryKind;
  settings: GameSettings;
}
