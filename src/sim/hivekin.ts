import { FACTIONS } from '../model/factions';
import type { BroodBonus, City, GameState, Player, Unit } from '../model/types';
import { TERRAIN } from '../model/terrain';
import { contenders, log, makePlayer, playerCities, spawnUnit } from './gamestate';
import { ensureWilds } from './barbarians';
import { idx, inBounds } from '../engine/grid';

/**
 * Section 125: the Hivekin, and the fact that they are not here yet.
 *
 * The other two empires are on the map at turn one, settle outward from a start
 * the generator chose for them, and are measured against each other from the
 * first turn. The Hivekin are not a third of that. They **emerge**: somewhere
 * around the middle of the game, on ground nobody has taken, a Grub and an
 * escort are simply there, and a Hive is founded shortly afterwards.
 *
 * That is Jeremy's answer and it is also the cheap one, in a way worth saying
 * out loud. A third start position would have changed every opening in the
 * game, and the stated balance target for this section is that **the Horde
 * against the Kingdom must stay balanced**. An arrival at turn ninety leaves
 * the opening exactly as it was measured and puts the whole of the change into
 * one clean arm.
 */
export const HIVEKIN = {
  /** Whether they turn up at all. Off is the game from before this section. */
  enabled: true,
  /**
   * The window they arrive in, inclusive. One turn is drawn from it per game.
   *
   * A window rather than a fixed turn so the arrival cannot be diarised to the
   * exact turn, and a narrow one so it can still be planned against -- Jeremy
   * asked for "predictable enough to plan against", which a range of thirty
   * turns is and a coin flip over two hundred is not.
   */
  from: 90,
  until: 120,
  /**
   * How far from the nearest city of an existing empire the Hive must appear.
   *
   * The point of the whole rule: they arrive on **unclaimed** ground. Too close
   * and they are a surprise attack on whoever happened to be nearest, which is
   * not a third contender, it is a random punishment.
   */
  clearOf: 10,
  /** How much open land has to be within reach of the spot to be worth it. */
  room: 8,
  /** What arrives: one founder, and an escort of the first fighting caste. */
  escort: 2,
  /**
   * Turns of grace before anything may attack them.
   *
   * They arrive with two Fodder-caste and a Grub. Anything standing nearby
   * would end them on the turn they appeared, which is not an emergence, it is
   * a spawn kill -- and the arrival is deliberately far from anybody, so this
   * only ever matters for the wilds.
   */
  grace: 3,
};

/** The Hivekin seat, once it exists. */
export function hivekinOf(state: GameState): Player | null {
  return state.players.find((p) => p.faction === 'hivekin' && !p.barbarian) ?? null;
}

/** Whether the Hivekin have been seen on this map yet. */
export function hivekinArrived(state: GameState): boolean {
  return hivekinOf(state) !== null;
}

/**
 * The turn this game's Hive arrives, drawn once and remembered.
 *
 * Stored on the state rather than recomputed, because it is drawn from the
 * shared random stream: asking twice would draw twice and move every roll after
 * it. Section 110 learned that the hard way with the ending clock.
 */
function arrivalTurn(state: GameState): number {
  if (state.hivekinAt === undefined) {
    const span = Math.max(1, HIVEKIN.until - HIVEKIN.from + 1);
    // Hashed off the map's seed rather than drawn from the shared stream, for
    // two reasons and the second is the important one.
    //
    // The first: `state.rngState` starts life as `seed ^ 0x1d872b41`, so two
    // small seeds differ only in the low byte, and one xorshift round later
    // `float()` reads the top bits -- which have not been mixed yet. The first
    // draw of a fresh game is therefore very nearly seed-independent, and six
    // seeds in a row all emerged on turn 117 before this was understood.
    //
    // The second: taking nothing from the shared stream means switching the
    // Hivekin off does not shift every roll that comes after them. A sweep arm
    // with `enabled: false` is then the same game as before this section rather
    // than a differently-shuffled one, which is section 59's whole rule about
    // emulating a control instead of stashing it.
    let h = (state.seed ^ 0x9e3779b9) >>> 0;
    for (let i = 0; i < 4; i++) {
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    }
    state.hivekinAt = HIVEKIN.from + (h % span);
  }
  return state.hivekinAt;
}

/** Whether this tile could hold the first Hive. */
function couldSettle(state: GameState, x: number, y: number): boolean {
  if (!inBounds(x, y, state.width, state.height)) return false;
  const ground = TERRAIN[state.terrain[idx(x, y, state.width)]];
  if (!ground || ground.water) return false;
  // Nothing already standing here, and no city on the tile.
  if (state.units.some((u) => u.x === x && u.y === y)) return false;
  if (state.cities.some((c) => c.x === x && c.y === y)) return false;
  return true;
}

/** How much workable land sits within a short walk of here. */
function roomAround(state: GameState, x: number, y: number): number {
  let open = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny, state.width, state.height)) continue;
      const ground = TERRAIN[state.terrain[idx(nx, ny, state.width)]];
      if (ground && !ground.water) open++;
    }
  }
  return open;
}

/** Chebyshev distance to the nearest city of an empire that is already here. */
function awayFromEveryone(state: GameState, x: number, y: number): number {
  let nearest = Infinity;
  for (const p of contenders(state)) {
    if (p.faction === 'hivekin') continue;
    for (const c of playerCities(state, p.id)) {
      const d = Math.max(Math.abs(c.x - x), Math.abs(c.y - y));
      if (d < nearest) nearest = d;
    }
  }
  return nearest;
}

/**
 * Where they come up: the emptiest ground that is far enough from everybody.
 *
 * Scored rather than taken first-found, so a map whose only distant corner is a
 * three-tile island does not put a whole faction on it. Falls back by relaxing
 * the distance rather than by giving up, because a crowded map should still get
 * its third side -- just with less elbow room, which is its own kind of fair.
 */
function emergenceSpot(state: GameState): { x: number; y: number } | null {
  for (const clearance of [HIVEKIN.clearOf, HIVEKIN.clearOf - 3, HIVEKIN.clearOf - 6]) {
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = 1; y < state.height - 1; y++) {
      for (let x = 1; x < state.width - 1; x++) {
        if (!couldSettle(state, x, y)) continue;
        const away = awayFromEveryone(state, x, y);
        if (away < clearance) continue;
        const room = roomAround(state, x, y);
        if (room < HIVEKIN.room) continue;
        // Room first, then distance: a big empty space a little nearer beats a
        // tiny one far away, which is the choice a settler would actually make.
        const score = room * 10 + Math.min(away, clearance * 2);
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return null;
}

/** Somewhere free next to the spot, for the escort to stand. */
function besideIt(state: GameState, x: number, y: number, wanted: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 1; r <= 3 && out.length < wanted; r++) {
    for (let dy = -r; dy <= r && out.length < wanted; dy++) {
      for (let dx = -r; dx <= r && out.length < wanted; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (couldSettle(state, x + dx, y + dy)) out.push([x + dx, y + dy]);
      }
    }
  }
  return out;
}

/**
 * The Hive arrives, if this is the turn for it.
 *
 * Called at the top of the calendar rather than inside anybody's turn, because
 * a new seat changes `state.players` and every turn loop in the game walks that
 * array by index.
 */
export function maybeEmerge(state: GameState): void {
  if (!HIVEKIN.enabled || state.winner !== null) return;
  if (hivekinArrived(state)) return;
  if (state.turn < arrivalTurn(state)) return;

  const spot = emergenceSpot(state);
  // No room anywhere. Tried again next turn rather than cancelled: cities fall,
  // empires shrink, and ground that was crowded on turn ninety may not be on
  // turn one hundred.
  if (!spot) return;

  const tileCount = state.width * state.height;
  const hive = makePlayer(state.players.length, 'hivekin', 'ai', tileCount);
  state.players.push(hive);

  const def = FACTIONS.hivekin;
  spawnUnit(state, hive.id, def.settlerUnit, spot.x, spot.y);
  for (const [x, y] of besideIt(state, spot.x, spot.y, HIVEKIN.escort)) {
    spawnUnit(state, hive.id, def.starterUnit, x, y);
  }
  hive.safeUntil = state.turn + HIVEKIN.grace;
  hive.joinedAt = state.turn;

  // Told to everybody, the way an ending being begun is. A third empire
  // appearing is the largest single thing that can happen to a game, and a
  // player who finds out by losing a city to it has been treated unfairly.
  for (const p of contenders(state)) {
    if (p.id === hive.id) continue;
    log(
      state,
      'Ground that nobody had claimed has opened, and something has come up out of it. ' +
        'It does not appear to be in a hurry.',
      'bad',
      p.id,
      undefined,
      [spot.x, spot.y],
    );
  }
  log(state, `${hive.name} is here. It was always going to be.`, 'good', hive.id, undefined, [
    spot.x,
    spot.y,
  ]);
}

/**
 * The Queen, placed in the first Hive the moment it is founded.
 *
 * Jeremy's reading of "starting unit": she is present from the beginning of the
 * Hivekin's own story rather than from turn one of the calendar, immobile, and
 * the first Hive is built around her. No advance grants her and nothing can
 * build her, which is why this is the only place she is ever made.
 */
export function placeQueen(state: GameState, city: City): void {
  const owner = state.players[city.owner];
  if (!owner || owner.faction !== 'hivekin') return;
  // The first Hive only. A second Queen is the *ending*, not a second city.
  if (playerCities(state, owner.id).length !== 1) return;
  if (state.units.some((u) => u.owner === owner.id && u.type === 'queen')) return;
  spawnUnit(state, owner.id, 'queen', city.x, city.y);
  // Remembered on the player rather than derived from "the oldest city", so a
  // seat that is lost and a capital that moves are two different events.
  owner.queenSeat = city.id;
  log(
    state,
    `She is in ${city.name}. She has not moved, and will not, and this is not a complaint.`,
    'good',
    owner.id,
    undefined,
    [city.x, city.y],
  );
}

/** Whether this unit is a Queen: immobile, and the Hive's whole production. */
export function isQueen(unit: Unit): boolean {
  return unit.type === 'queen';
}

/**
 * Section 125 slice B: the Queen, and what happens when she is not there.
 *
 * She is the one unit in the game that cannot move and the one unit a city
 * depends on. Losing her does not end the Hive outright -- that would make a
 * single lucky raid decisive in a way nothing else in this game is -- but her
 * seat stops producing until there is a Queen in it again, and if nobody grows
 * one the place is given up.
 *
 * **A Princess is the plan, and the plan is the point.** The bible's whole
 * argument for the caste is that redundancy ought to be a real strategy rather
 * than a tax: spare Princesses are not wasted, they become something the city
 * keeps. So the rule has to reward having built more than one, which is why the
 * extras convert rather than simply standing there.
 */
export const QUEEN = {
  /** Whether any of this is on. Off is slice A, where she is scenery. */
  enabled: true,
  /**
   * Turns the seat may sit queenless before the Hive gives it up.
   *
   * The bible's placeholder, and still a placeholder: nothing has measured what
   * five turns is worth. It is long enough to walk a Princess in from the next
   * city and short enough that ignoring it is a decision.
   */
  countdown: 5,
};

/** The city the Queen sits in, if this side still holds it. */
export function queenSeat(state: GameState, owner: Player): City | null {
  if (owner.queenSeat === undefined) return null;
  return state.cities.find((c) => c.id === owner.queenSeat && c.owner === owner.id) ?? null;
}

/** Whether there is a Queen in this city right now. */
export function queenIn(state: GameState, city: City): Unit | null {
  return (
    state.units.find((u) => u.type === 'queen' && u.owner === city.owner && u.x === city.x && u.y === city.y) ??
    null
  );
}

/**
 * Whether this city makes nothing because she is not in it.
 *
 * Read by `cityYield`, which is the one place shields are counted, so a
 * queenless seat is unproductive everywhere at once -- the panel, the build
 * estimate and the AI's plans all agree without any of them being told.
 */
export function queenless(state: GameState, city: City): boolean {
  if (!QUEEN.enabled) return false;
  const owner = state.players[city.owner];
  if (!owner || owner.faction !== 'hivekin') return false;
  if (owner.queenSeat !== city.id) return false;
  return queenIn(state, city) === null;
}

/** The dormant Princesses waiting in this city. */
function princessesIn(state: GameState, city: City): Unit[] {
  return state.units.filter(
    (u) => u.type === 'princess' && u.owner === city.owner && u.x === city.x && u.y === city.y,
  );
}

/**
 * The succession, run at the top of the Hive's own turn.
 *
 * Order matters here: a Princess standing in the seat is grown **before** the
 * countdown is checked, so walking one in on the last turn works rather than
 * being a turn too late. That is the version a player would expect and the
 * other one would feel like a cheat.
 */
export function tickSuccession(state: GameState, playerId: number): void {
  if (!QUEEN.enabled) return;
  const owner = state.players[playerId];
  if (!owner || owner.faction !== 'hivekin') return;
  const seat = queenSeat(state, owner);

  // The seat is gone -- taken, or razed. The Queen goes with it, and so does
  // the countdown: there is nothing left to hold a succession in.
  if (!seat) {
    delete owner.succession;
    return;
  }
  if (queenIn(state, seat)) {
    delete owner.succession;
    return;
  }

  const waiting = princessesIn(state, seat);
  if (waiting.length > 0) {
    growQueen(state, seat, waiting);
    delete owner.succession;
    return;
  }

  if (owner.succession === undefined) {
    owner.succession = state.turn + QUEEN.countdown;
    log(
      state,
      `She is not there. ${seat.name} will continue for ${QUEEN.countdown} turns. ` +
        'A Princess grown in it before then becomes the Queen.',
      'bad',
      owner.id,
      undefined,
      [seat.x, seat.y],
    );
    return;
  }
  if (state.turn >= owner.succession) abandonSeat(state, seat);
}

/**
 * One Princess becomes the Queen. The rest become something the Hive keeps.
 *
 * The choice of what they become is the player's and is made **now**, not when
 * the Princess was built -- which is the whole of Jeremy's note on it. An AI is
 * asked the same question and answers it by looking at the city.
 */
function growQueen(state: GameState, seat: City, waiting: Unit[]): void {
  const [heir, ...spare] = waiting;
  state.units.splice(state.units.indexOf(heir), 1);
  spawnUnit(state, seat.owner, 'queen', seat.x, seat.y);
  log(
    state,
    `A Princess is grown into the Queen in ${seat.name}. The Hive continues. ` +
      'Nobody has remarked on it.',
    'good',
    seat.owner,
    undefined,
    [seat.x, seat.y],
  );
  for (const extra of spare) {
    state.units.splice(state.units.indexOf(extra), 1);
    const kind = state.players[seat.owner].controller === 'human' ? null : bestBonusFor(state, seat);
    seat.brood = [...(seat.brood ?? []), kind ?? 'pending'];
  }
  if (spare.length > 0) {
    log(
      state,
      `${spare.length === 1 ? 'A Princess' : `${spare.length} Princesses`} in ${seat.name} ` +
        `${spare.length === 1 ? 'was' : 'were'} no longer needed, and ${spare.length === 1 ? 'has' : 'have'} ` +
        'become part of the Hive instead.',
      'good',
      seat.owner,
      undefined,
      [seat.x, seat.y],
    );
  }
}

/** What an AI would pick, by looking at what the city is short of. */
function bestBonusFor(state: GameState, city: City): BroodBonus {
  if (city.disorder) return 'calm';
  if (state.players[city.owner].gold < 0) return 'gold';
  return 'shields';
}

/**
 * Nobody grew one. The Hive lets the place go.
 *
 * Its units go feral rather than dying, which is the bible's own answer and
 * reuses the band that already exists rather than inventing a third kind of
 * owner. The city is abandoned outright -- not handed to anybody, because
 * nobody took it.
 */
function abandonSeat(state: GameState, seat: City): void {
  const owner = state.players[seat.owner];
  const wild = ensureWilds(state);
  const strays = state.units.filter((u) => u.owner === owner.id);
  for (const u of strays) {
    if (wild) {
      u.owner = wild.id;
      u.order = 'none';
    } else {
      state.units.splice(state.units.indexOf(u), 1);
    }
  }
  state.cities.splice(state.cities.indexOf(seat), 1);
  delete owner.succession;
  delete owner.queenSeat;
  log(
    state,
    `No Queen was grown. ${seat.name} is given up, and what was in it stops taking instructions.`,
    'bad',
    owner.id,
    undefined,
    [seat.x, seat.y],
  );
  for (const p of contenders(state)) {
    if (p.id === owner.id) continue;
    log(state, `${seat.name} has been abandoned. Whatever lived there is still out there.`, 'info', p.id);
  }
}

/** Turns left before the seat is given up, or null when nothing is counting. */
export function successionLeft(state: GameState, owner: Player): number | null {
  if (!QUEEN.enabled || owner.succession === undefined) return null;
  return Math.max(0, owner.succession - state.turn);
}

/** Settle a conversion the player was asked about. */
export function chooseBrood(city: City, index: number, kind: BroodBonus): void {
  const brood = city.brood;
  if (!brood || brood[index] !== 'pending') return;
  brood[index] = kind;
}

/** What the converted Princesses are worth to this city. */
export function broodBonus(city: City, kind: BroodBonus): number {
  return (city.brood ?? []).filter((b) => b === kind).length;
}
