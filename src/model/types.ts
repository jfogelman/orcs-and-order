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

/** Section 113's five levels. Saves before it all say `'normal'`. */
export type DifficultyId = 'easiest' | 'easy' | 'normal' | 'hard' | 'hardest';

export interface Player {
  id: number;
  faction: FactionId;
  /**
   * Not a side in the game, just something that lives on the map.
   *
   * Barbarians hold a `Player` slot because units are owned by index and every
   * lookup in the game assumes that. What they are not is a **contender**: they
   * are skipped by victory, elimination, score and the dominance clock, so a
   * game with them in it is still won or lost between the two empires.
   *
   * Optional so every save without them loads as "no barbarians here".
   */
  barbarian?: boolean;
  /** The civilisation name, e.g. "The Bleeding Skull Horde". */
  name: string;
  /** The leader's name, e.g. "Grunk the Reasonably Confident". */
  leader: string;
  controller: Controller;
  /**
   * Section 113: what the difficulty gave this seat at the start. `content` is
   * extra patience in its cities, `cost` scales what it pays to build and to
   * research. Absent means Normal, which is every save before section 113.
   */
  handicap?: { content: number; cost: number };
  /** Map / UI colour, as a CSS hex string. */
  color: string;
  gold: number;
  /** Research points accumulated toward the current advance. */
  beakers: number;
  researching: TechId | null;
  techs: TechId[];
  /** Share of trade sent to the treasury, 0..10. The remainder becomes science. */
  /**
   * How the empire divides what its cities earn, in twelfths.
   *
   * Optional so that a save written before this existed still loads: absent
   * means the even split everyone starts on. Read through `tradeRates` rather
   * than directly, which is what applies that default.
   */
  rates?: TradeRates;
  /** Superseded by `rates`. Kept so old saves still open. */
  taxRate?: number;
  /**
   * Section 67's Civic Pride: which piece of the capital stands at which tier.
   *
   * Held by the empire rather than by the city, because a capital that falls is
   * still an empire that built all that. Optional, so a game where nobody has
   * been offered anything carries nothing.
   */
  palace?: Record<string, number>;
  /**
   * How many pieces this empire has been offered, which is what the next
   * milestone is counted against.
   */
  prideTaken?: number;
  /**
   * Trade routes this player had last turn, as `linkKey` strings.
   *
   * Kept so the turn can say what opened and what closed rather than only
   * handing over the gold. Optional, and deleted when there are none, so a game
   * with no roads in it -- and every save from before trade routes -- carries
   * nothing. Section 106.
   */
  tradeLinks?: string[];
  /**
   * The turn this empire first put one of section 110's ending works into
   * production, which is when everybody was told. Absent until then, and in
   * every save from before the endings existed.
   */
  endingBegunAt?: number;
  /**
   * Shields put into each of section 110's works so far, by building id. Kept by
   * the empire rather than in a city's shield box, so a riot, a change of orders
   * or moving the work to another city spends none of it. Absent until a work is
   * begun, and a work's entry is deleted when it is finished.
   */
  worksBanked?: Record<string, number>;
  /**
   * Shared follies this empire has already been told somebody started, by
   * building id, so the announcement is made once each. Section 111. Absent
   * until the first one is begun, and in every save from before them.
   */
  folliesTold?: string[];
  /** 0/1 per tile: has this player ever seen it? Drives the terrain memory. */
  explored: number[];
  /** 0/1 per tile: can this player see it right now? Recomputed each turn. */
  visible: number[];
  alive: boolean;
  /**
   * Crises the council has already demanded an audience about.
   *
   * Exactly what is wrong right now, rewritten each time it is checked, so a
   * crisis that clears is forgotten and can be raised again if it returns. A
   * council that asked every turn of a long riot would be trained away in
   * three turns.
   *
   * Optional so every existing save loads unchanged and means "nothing said
   * yet", which at worst raises one audience the player has already had.
   */
  warnedOf?: string[];
  /**
   * Turn this player first held a commanding share of the map without
   * interruption, or absent if they do not hold one now.
   *
   * Optional so old saves load unchanged. Cleared the moment the share slips,
   * so it measures an unbroken run rather than a total.
   */
  dominantSince?: number;
  /**
   * Raiders this player can currently see, by unit id.
   *
   * Held so a sighting is announced when it *happens* rather than every turn a
   * band spends walking along your border. Rewritten each turn from what is
   * actually visible, which also means a band that slips back into the trees
   * and comes out again is reported again -- correctly, because that is a new
   * sighting.
   *
   * Optional so every existing save loads unchanged and means "nothing seen
   * yet", which at worst re-announces a band already on screen once.
   */
  sightedRaiders?: number[];
}

// ---------------------------------------------------------------------- units

export type UnitOrder = 'none' | 'fortified' | 'sentry' | 'skip' | 'road' | 'post' | 'improve';

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
   * Turns until a thrower has walked over and picked its axe back up.
   *
   * The axe is not gone, it is lying over there. Resupplying at a city is the
   * fast way to get one; this is the slow way, and it exists because a single
   * throw per game was priced for a unit with three times the health this one
   * now has. See DESIGN_QUEUE section 38.
   */
  rearmIn?: number;
  /**
   * Whether this unit has already used its one reprieve.
   *
   * Only ever set on a sapper that took Mostly Volatile. Absent means it still
   * has it, so nothing needs writing out for the units that never will.
   */
  reprieved?: boolean;
  /**
   * Attack added for good by the city it was built in -- section 111's Loudest
   * Rock. Absent means none, so every older save and fixture loads unchanged.
   */
  drilled?: number;
  /**
   * Tiles of extra reach, from the city it was built in -- section 111's Rumbling
   * Archive. A ranged unit may strike from its own range or up to this much
   * further. Absent means none.
   */
  reach?: number;
  /**
   * Shots left, for a creature that carries a finite number.
   *
   * Absent means "as its type says" -- a fresh piece is loaded, and old saves
   * and fixtures need not declare it. Only ever spent by firing at range.
   */
  ammo?: number;
  /**
   * Conditions this unit is under, with the turns left on each.
   *
   * Optional so old saves and test fixtures need not declare it; absent and
   * empty mean the same thing.
   */
  statuses?: Status[];
  /**
   * Turns of digging left on the job this worker is doing where it stands.
   *
   * Only while `order` is `road`. Optional so every save and fixture from before
   * roads loads unchanged, and absent means no job.
   */
  work?: number;
  /** Which of section 112's jobs a worker on `improve` is doing. */
  job?: 'irrigate' | 'mine' | 'clear';
  /**
   * A standing Irrigate To: dig ditches along the way to this tile, section 112.
   * Absent in every older save.
   */
  irrigateTo?: { x: number; y: number };
  /** Auto work: the worker finds land to improve by itself each turn. Section 112. */
  autoWork?: boolean;
  /**
   * Explore: walks toward the unknown each turn and halts at the first new
   * sighting. Section 15's auto-scout. Absent in every older save.
   */
  exploring?: boolean;
  /**
   * Land units riding in this ship, off the map until they step ashore. Only
   * ever set on a carrier. Absent in every older save.
   */
  cargo?: Unit[];
  /** AI only: a land unit that has somewhere to be across the water. */
  wantsPassage?: boolean;
  /** AI only: where a loaded carrier is bound -- the landing, and what it is for. */
  voyage?: { x: number; y: number; tx: number; ty: number };
  /** AI only: turns a part-loaded carrier has waited at the shore. */
  voyageWait?: number;
  /**
   * The wilds only: the turn a Warband Chieftain may next call somebody. Absent
   * on everything else, and on every save from before section 115.
   */
  summonAt?: number;
  /**
   * A road this worker is laying all the way to a tile: dig wherever the ground
   * wants a road, walk over road that is already there, stop at the end.
   *
   * Beside `goto` rather than folded into it, because a march and a road-to are
   * interrupted by different things -- a march does not stop to dig. Optional so
   * every save from before it loads unchanged.
   */
  roadTo?: { x: number; y: number };
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
 *
 * `portal` and `object` are section 110's two built endings: the Horde's Demonic
 * Portal held open long enough, and the Kingdom's Mysterious Object with its
 * button pressed.
 */
export type VictoryKind = 'conquest' | 'dominance' | 'points' | 'draw' | 'portal' | 'object';

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
  /**
   * The turn this city's ending was finished: section 110's Demonic Portal or
   * Mysterious Object. Absent everywhere else, and in every save from before the
   * endings existed.
   */
  endingSince?: number;
  /** Flat tile indices currently worked by citizens (excludes the centre). */
  workedTiles: number[];
  /**
   * Tiles the player picked by hand, which the greedy assignment must not undo.
   *
   * Separate from `workedTiles` because that is recomputed from scratch every
   * time the city grows, starves or loses a tile, and a choice that survives
   * none of those is not a choice. Absent on a city nobody has touched, which
   * is most of them and every old save -- so the default stays "the game sorts
   * it out" and nobody who does not care is made to care.
   */
  chosenTiles?: number[];
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
  /**
   * The turn this city last lost something to force: raiders carried off a
   * building or its people, or sappers brought its walls down. Shown on the map
   * for a few turns. Absent on a city nothing has happened to.
   */
  damagedAt?: number;
}

// ------------------------------------------------------------------ game meta

/**
 * The three things trade can be spent on, in twelfths of the total.
 *
 * Twelve because it divides by three, and the whole point is that an empire
 * starts perfectly even and moves off it deliberately -- you cannot raise one
 * without lowering another.
 */
export interface TradeRates {
  coin: number;
  beakers: number;
  /** Keeping people calm. The way out of a riot that no building can reach. */
  calm: number;
}

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
  difficulty: DifficultyId;
  /**
   * The shape of the world. `'archipelago'` is islands, the two sides on
   * separate ones, for ships to matter. Absent is the ordinary world, which is
   * every save from before ships.
   */
  world?: 'continent' | 'archipelago';
  /** After this turn, the highest score wins by default. */
  maxTurns: number;
  /**
   * Whether the wilds send raiding parties.
   *
   * Per game and saved with it, so a game started without them never grows
   * them and a game started with them keeps them. Off unless asked for:
   * section 69 is emphatic that a third party changes what a game *is*, and
   * every measurement in this project assumes exactly two sides.
   */
  barbarians?: boolean;
}

/**
 * One turn of the replay record (section 15's post-game summary).
 * `players[id]` is `[score, cities, citizens, units, advances]`; `cities` is
 * flat triples of `[cityId, owner, size]`.
 */
export interface TurnRecord {
  turn: number;
  players: number[][];
  cities: number[];
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
  /**
   * 0/1 per tile: has somebody laid a road here? Cities count as roads without
   * being marked.
   *
   * The first thing on the map that changes after world generation -- terrain
   * and specials are still constants. Optional, and created with the first road
   * rather than with the map, so a save from before roads loads as "no roads"
   * and a game nobody builds in carries nothing. Saved run-length packed, like
   * the fog.
   */
  roads?: number[];
  /**
   * 0/1 per tile: is there a garrison post here?
   *
   * Section 102's answer to section 101: somewhere for a soldier to stand that
   * is not the city tile. Optional and created with the first post, like the
   * roads layer, so a save from before them loads as a map without any, and
   * packed the same way.
   */
  posts?: number[];
  /**
   * 0/1 per tile: irrigated by a worker (section 112). Optional and created with
   * the first ditch, like the roads layer, and packed the same way.
   */
  irrigation?: number[];
  /** 0/1 per tile: mined by a worker (section 112). The same arrangement. */
  mines?: number[];
  /**
   * How many times a worker has changed the ground itself -- a forest or swamp
   * cleared to grassland. Part of the key the map picture is cached under, so the
   * change is drawn. Absent until the first clearing.
   */
  terrainEdits?: number;
  players: Player[];
  units: Unit[];
  cities: City[];
  activePlayer: number;
  nextUnitId: number;
  nextCityId: number;
  log: LogEntry[];
  /**
   * The replay record, one entry per finished turn. Absent in saves from before
   * it existed; those replay from the turn they were first loaded.
   */
  history?: TurnRecord[];
  /** Where every city that has ever stood stands, and its name: `[x, y, name]`. */
  sites?: Record<number, [number, number, string]>;
  /**
   * The great works: every folly and every ending work, as it was finished.
   * There is only one of each in the world, so this is the short list of
   * things a game is remembered by. Part of the replay record.
   */
  landmarks?: Array<{ turn: number; city: number; owner: number; id: BuildingId }>;
  /**
   * Section 116: how the two empires stand. Absent on every save from before
   * diplomacy, which is a war that nobody has ever tried to end.
   */
  diplomacy?: {
    /** The peace, while there is one: when it was made and when it lapses. */
    peace?: { since: number; until: number };
    /** Times each side has broken a peace, by player id. */
    distrust?: Record<number, number>;
    /** The turn each side's cities stop being ashamed of it, by player id. */
    shameUntil?: Record<number, number>;
    /** The turn each AI last made an offer of its own, by player id. */
    lastOffer?: Record<number, number>;
    /** An offer waiting for the human to answer, made by the AI. */
    pending?: { from: number; to: number; gold: number };
    /** The turn the two empires last fought, so a peace ends a war. */
    lastClash?: number;
  };
  winner: number | null;
  /**
   * How the game ended, so the ending can be shown rather than described.
   *
   * Optional because a save from before this existed knows it has a winner but
   * not how; the interface falls back to the conquest picture, which is right
   * for two of the three routes.
   */
  victory?: VictoryKind;
  /**
   * The game was won and the player asked to carry on anyway.
   *
   * Clears the result and stops anybody winning again -- including the turn
   * limit, or "keep playing" would end the game again on the next turn. The
   * game then runs until the player leaves it, which is what the option means
   * in every other game that offers it.
   *
   * Optional so every existing save loads unchanged and means "no".
   */
  playingOn?: boolean;
  settings: GameSettings;
}
