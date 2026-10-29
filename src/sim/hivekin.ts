import { FACTIONS } from '../model/factions';
import type { FactionDef } from '../model/factions';
import type { BroodBonus, City, GameState, Player, Unit } from '../model/types';
import { TERRAIN } from '../model/terrain';
import { unitType } from '../model/units';
import { arrivalTurnFor, dueNow, latecomers } from './arrivals';
import { contenders, log, makePlayer, playerCities, spawnUnit } from './gamestate';
import { ensureWilds } from './barbarians';
import { tileYield } from './city';
import { fatCrossIndices, idx, inBounds } from '../engine/grid';

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
  /**
   * What arrives: founders, and an escort of the first fighting caste.
   *
   * One Grub was the bible's "a settler and an escort", and it reads like the
   * other two sides' opening -- except they start on turn one and this does
   * not. An empire that has had ninety turns is six cities deep by the time
   * this lands, so the question of how many Hives the Hive starts with is a
   * different question from how many cities the Horde starts with, and the
   * answer is measured rather than assumed.
   *
   * Two, measured over five packages and ten seeds: one Grub to two is worth
   * 2.8 Hives to 3.5 and seventeen per cent of the world to twenty-one, and
   * takes survival from nine games in ten to ten. Three and four add almost
   * nothing on top of that -- 3.6 and 4.0 Hives -- so two is where the cheap
   * gain is, and a Hive that arrives already split in two is a better story
   * than one that arrives with an army.
   */
  founders: 2,
  /**
   * Superseded by `escortShields`. Kept so a sweep arm can still pin a count
   * and so `control.ts` reads unchanged; nothing in the game asks it.
   */
  escort: 2,
  /**
   * Shields' worth of escort, rather than a number of them. Section 157.
   *
   * **The count was measured and the price was not.** Two escort was taken in
   * section 125 over five packages and ten seeds -- for the Hive. Every
   * faction since has been given *the same count* of its own `starterUnit`,
   * and those cost different amounts:
   *
   * | side | escort | A/D/HP | cost | at 40s |
   * |---|---|---|---|---|
   * | Hivekin | Fodder-caste | 1/1/10 | **10** | 4 |
   * | Wandering Folk | Skirmisher | 1/1/10 | **13** | 3 |
   * | Unbound | Revenant | 2/3/12 | **20** | 2 |
   *
   * A budget fixes the class rather than the instance: a side with a cheap
   * starter brings more of it, and **faction six needs no entry here at all**.
   * That is the same move as `FACTION_IDS` replacing a hand-written tuple, and
   * this file has been caught by the hand-written version six times.
   *
   * **Forty, and it is a lever that does nothing -- which is why it is forty.**
   * Section 159 swept 26 (what the old count bought), 40 and 90 over 324
   * games. At 40 every column of every faction is indistinguishable from the
   * old rule in both seed sets. At 90 the Wandering Folk end *smaller* on
   * cities, population, units and recruiting, both sets agreeing, while the
   * Hive ends larger on all four: a fixed shields budget rewards a cheap
   * starter, and the cheapest belongs to the side that already wins most.
   *
   * So this is kept at the value that retires the hand-maintained list
   * without moving the balance, and **the arrival package is not the Wandering
   * Folk's problem**. `tools/escortprobe.run.test.ts` tripled their escort and
   * measured the same five survivors in eighteen, dying *later* rather than
   * sooner. What ails them is in section 157's other two options and in the
   * arrival *order* -- see section 159 and `latecomers`.
   */
  escortShields: 40,
  /**
   * Turns of grace before anything may attack them.
   *
   * They arrive with two Fodder-caste and a Grub. Anything standing nearby
   * would end them on the turn they appeared, which is not an emergence, it is
   * a spawn kill -- and the arrival is deliberately far from anybody, so this
   * only ever matters for the wilds.
   */
  grace: 3,
  /**
   * Whether the Hive's AI follows a plan of its own.
   *
   * Off, it falls back to the Horde's priority list the way it did before this
   * was noticed -- every entry of which is either an orc advance it cannot
   * research or a shared one it can, so it walks the shared spine and never
   * grows a caste. That is not a sensible way to play and it is not meant to
   * be: it is the control, so the cost of the bug can be stated in games rather
   * than asserted.
   */
  ownPlans: true,
};

/**
 * What the Hive's ending costs, by how long it has had to pay for it.
 *
 * Section 136. The three works price at six hundred shields against the other
 * two endings' thousand, and `buildings.ts` says exactly why: *"the thing it is
 * paid out of: 3.5 Hives of 5.5 citizens, where an empire pays out of six
 * cities of eight."* That is a correct price for the side section 125 built --
 * one that does not exist until turn ninety and is three and a half towns deep
 * when the game ends.
 *
 * It is the wrong price for a Hive that has been there since turn one.
 * Measured: a turn-one Hive wins 83% of its games against a 64% baseline for
 * the same seat, finishing in 141 turns against 230, and ten of thirteen wins
 * are this ending. It is not that their kit is too strong. It is that they are
 * walking a road priced for a third of a game with a whole one in hand.
 *
 * So the price is not a constant any more, it is a **lerp between the two
 * cases**, and the anchors were both facts rather than guesses: a Hive that has
 * the whole game pays what an empire pays, and a Hive that arrives when
 * section 125 said it arrives pays what section 125 measured. Everything
 * between is interpolated, which is what makes a staggered arrival possible at
 * all -- a Hive that turns up on turn forty should not pay either price.
 *
 * ## Section 161: the floor is not reachable, and both ends went up a third
 *
 * Two things have happened to this since it was written, and the first is why
 * the second was needed.
 *
 * **`HIVEKIN.from` is turn ninety, and nothing arrives on turn ninety any
 * more.** Section 153 replaced the single late arrival with one stagger gap
 * per slot, so on Normal the Hive lands somewhere in turns 20-60 and this
 * function returns 1.52 to 1.22 -- never 1. The cheap anchor is unreachable
 * at every difficulty, so the number in `buildings.ts` is a price the game
 * cannot charge. Anchoring to a fact about the world is only safe while the
 * world holds still; this is the same failure as section 160's arrival order
 * and section 125's three-sided win target.
 *
 * **So the lerp had drifted upward and the Hive still won too much.** On 324
 * games it took 27% against an even share of 20% -- every win this ending,
 * none by any other route. Section 161 multiplied the shipped price by a
 * third, which lifts both anchors and leaves the shape alone: 21%, the ending
 * landing on turn 217 rather than 206, and no other side's share moving.
 *
 * What it does **not** fix is the shape. The Hive either establishes or does
 * not, and the price only touches the first branch: 47 of 108 games get three
 * cities, and those convert at 49% where they used to convert at 62%. The
 * other 61 have never won a game at any price. That cliff is a different fix
 * and nobody has asked for it yet.
 */
export const HIVE_ENDING = {
  /** The switch, for sweeps. Off is section 125's flat six hundred. */
  scaled: true,
  /**
   * Section 161: a multiplier on the whole curve, both anchors together.
   *
   * Jeremy, on the Hive winning 37% of games against an even share of 20%:
   * *"hivekin shouldn't just be the default winners, definitely not."* He
   * named six hundred, eight hundred and a thousand, which are this at 1,
   * 4/3 and 5/3 -- and the thing worth knowing before reading the result is
   * that **the Hive has not paid six hundred since section 153**.
   *
   * The floor below is the price for a Hive that arrives on `HIVEKIN.from`,
   * turn ninety. Section 153 replaced that single arrival with a stagger of
   * one gap per slot, so on Normal the Hive turns up somewhere in turns
   * 20-60 and `hiveEndingScale` lerps it to **735-915**. Turn ninety is no
   * longer reachable at any level, so six hundred is a number the game
   * cannot charge. That is why the shipped arm here is not "six hundred".
   */
  works: 1,
  /**
   * What the works cost a Hive present from turn one, as a multiple of the
   * shipped price -- so 5/3 of 800 is **1333**.
   *
   * It was written as `1000 / 600`, and it meant something: *an empire's
   * ending, because that is what a side with a whole game and an empire's
   * worth of towns is.* Section 161 lifted the shipped price a third and left
   * this ratio alone, which raises both anchors together and breaks that
   * reading -- a turn-one Hive now pays more than the Kingdom's 1200.
   *
   * **That is the arm that was measured**, and it is kept rather than
   * re-anchored because the measurement is what says both ends were too
   * cheap: at the old anchors the Hive won 27% of 324 games against an even
   * 20%, and the games it wins are not turn-one games -- they are the staggered
   * ones in turns 20-60, which is the middle of this lerp and moves only if
   * both ends do. Lifting the floor alone is a different lever and an
   * unmeasured one; section 161's queue entry says so.
   */
  early: 5 / 3,
};

/**
 * The multiplier on a Hive ending work for this side, from when it arrived.
 *
 * One at `HIVEKIN.from` and later, which is every game section 125 measured,
 * so that arm is unchanged by construction.
 */
export function hiveEndingScale(state: GameState, ownerId: number): number {
  // **The faction question first**, so `works` below cannot reach a side whose
  // ending this is not. Nobody else's price is scaled by anything here.
  const p = state.players[ownerId];
  if (!p || p.faction !== 'hivekin') return 1;
  if (!HIVE_ENDING.scaled) return HIVE_ENDING.works;
  // Absent means it was there when the map was made -- seat 0 in a game
  // somebody chose to play as the Hive, where nothing ever set it.
  const joined = p.joinedAt ?? 1;
  const span = Math.max(1, HIVEKIN.from - 1);
  const earliness = Math.max(0, Math.min(1, 1 - (joined - 1) / span));
  // `works` lifts both anchors together, so the shape of the lerp is
  // untouched and only the price it interpolates between moves.
  return HIVE_ENDING.works * (1 + (HIVE_ENDING.early - 1) * earliness);
}

/** The Hivekin seat, once it exists. */
export function hivekinOf(state: GameState): Player | null {
  return state.players.find((p) => p.faction === 'hivekin' && !p.barbarian) ?? null;
}

/** Whether the Hivekin have been seen on this map yet. */
export function hivekinArrived(state: GameState): boolean {
  return hivekinOf(state) !== null;
}

/**
 * The turn this game's Hive arrives.
 *
 * Section 139 moved the schedule to `sim/arrivals.ts`, where it is a fact
 * about *the queue* rather than about the Hivekin -- the Hive is simply
 * whichever latecomer it happens to be. Kept here as a thin question because
 * the Orcpedia, the Hive's own rules and two tests all ask it by this name,
 * and because "when does the Hive come up" is a question worth being able to
 * ask even when the answer is somebody else's business.
 *
 * Null when the Hive is not a latecomer in this game at all: chosen as the
 * only opponent it starts on the map, and chosen by nobody it never comes.
 */
export function hiveArrivalTurn(state: GameState): number | null {
  const n = latecomers(state).indexOf('hivekin');
  return n < 0 ? null : arrivalTurnFor(state, n);
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

/**
 * What a Hive founded here would actually have to live on.
 *
 * **This is the measure that was missing, and its absence is why they were
 * small.** The first version scored a site by how much land was near it and how
 * far it was from everybody, and never asked what the land *yielded* -- so it
 * reliably picked the emptiest quarter of the map, which is empty for a reason.
 * Measured over eight games, the Hive worked ground the AI's own siting rule
 * rates 152 against the empires' 183, made half the food (11.0 against 23.4)
 * and grew to 4.6 citizens against 9.7.
 *
 * Deliberately the same formula `siteScore` uses for every other city in the
 * game, weighted to food, rather than a second opinion about what good ground
 * is. It is duplicated rather than imported because that one lives in `ai/` and
 * this is `sim/`; if a third caller ever wants it, it should move down here.
 */
function groundWorth(state: GameState, x: number, y: number): number {
  let score = 0;
  for (const i of fatCrossIndices(x, y, state.width, state.height)) {
    const y2 = tileYield(state, i, false);
    score += y2.food * 3 + y2.shields * 2 + y2.trade;
  }
  return score;
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
export function arrivalSpot(state: GameState): { x: number; y: number } | null {
  for (const clearance of [HIVEKIN.clearOf, HIVEKIN.clearOf - 3, HIVEKIN.clearOf - 6]) {
    let best: { x: number; y: number; score: number } | null = null;
    for (let y = 1; y < state.height - 1; y++) {
      for (let x = 1; x < state.width - 1; x++) {
        if (!couldSettle(state, x, y)) continue;
        const away = awayFromEveryone(state, x, y);
        if (away < clearance) continue;
        const room = roomAround(state, x, y);
        if (room < HIVEKIN.room) continue;
        // What it would live on first, then room to grow into, then distance.
        // Room alone picked the emptiest ground on the map; yield alone would
        // pick a rich corner with nowhere to expand. The weights put a tile of
        // food ahead of a tile of bare land, which is the choice a settler
        // actually makes.
        const score = groundWorth(state, x, y) * 2 + room * 4 + Math.min(away, clearance * 2);
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
 * A side that was not here turns up, if this is the turn for one.
 *
 * Section 139 generalised this from the Hive's own emergence. Everything it
 * does was already faction-agnostic except the two lines that named the
 * Hivekin: the founders and the escort are `settlerUnit` and `starterUnit`
 * off the faction table, which every side has had since section 125, and the
 * spot is unclaimed ground wherever it is.
 *
 * Called at the top of the calendar rather than inside anybody's turn, because
 * a new seat changes `state.players` and every turn loop in the game walks
 * that array by index.
 */
export function maybeArrive(state: GameState): void {
  if (state.winner !== null) return;
  const due = dueNow(state);
  if (!due) return;
  // Section 125's switch still governs the Hive specifically, so a sweep arm
  // that turns the Hivekin off gets no Hive however the slots are arranged.
  if (due.faction === 'hivekin' && !HIVEKIN.enabled) return;

  const spot = arrivalSpot(state);
  // No room anywhere. Tried again next turn rather than cancelled: cities
  // fall, empires shrink, and ground that was crowded on turn ninety may not
  // be on turn one hundred.
  if (!spot) return;

  const tileCount = state.width * state.height;
  const side = makePlayer(state.players.length, due.faction, 'ai', tileCount);
  state.players.push(side);

  const def: FactionDef = FACTIONS[due.faction];
  spawnUnit(state, side.id, def.settlerUnit, spot.x, spot.y);
  // The rest stand around it. Founders first, so a cramped spot that can only
  // fit three of them gets the ones that matter.
  // Section 157: founders are a count, escort is a budget. The founders stay
  // a count because two of them is a *rule* -- "it arrives already split in
  // two" -- rather than an amount of anything, and because a dearer founder
  // should not mean a lonelier one. The escort is what has to hold the ground
  // and is therefore what is worth measuring in what it costs.
  const escortCost = Math.max(1, unitType(def.starterUnit).cost);
  const escort = Math.max(1, Math.floor(HIVEKIN.escortShields / escortCost));
  const around = besideIt(state, spot.x, spot.y, HIVEKIN.founders - 1 + escort);
  around.forEach(([x, y], n) => {
    const type = n < HIVEKIN.founders - 1 ? def.settlerUnit : def.starterUnit;
    spawnUnit(state, side.id, type, x, y);
  });
  side.safeUntil = state.turn + HIVEKIN.grace;
  side.joinedAt = state.turn;

  // Told to everybody, the way an ending being begun is. Another contender
  // appearing is the largest single thing that can happen to a game, and a
  // player who finds out by losing a city to it has been treated unfairly.
  //
  // The Hive keeps its own words. It comes up out of the ground and the others
  // walk over a hill, and a line written for the first would be nonsense about
  // the second.
  const news =
    due.faction === 'hivekin'
      ? 'Ground that nobody had claimed has opened, and something has come up out of it. ' +
        'It does not appear to be in a hurry.'
      : `${side.name} has been found out there, on ground nobody had claimed. ` +
        'They appear to have been on their way for some time.';
  for (const p of contenders(state)) {
    if (p.id === side.id) continue;
    log(state, news, 'bad', p.id, undefined, [spot.x, spot.y]);
  }
  log(state, `${side.name} is here. It was always going to be.`, 'good', side.id, undefined, [
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
  const queen = spawnUnit(state, owner.id, 'queen', city.x, city.y);
  // Section 136, reported from play: she was drawn standing on the tile like
  // something that had just walked there and might walk off again. She is
  // immobile by rule -- `isQueen` is checked everywhere movement is -- so the
  // one order that says "this is where I am" is the one she should have from
  // the moment she exists. It is also what stops her asking for orders in the
  // idle cycle every turn for the rest of the game.
  queen.order = 'fortified';
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

/**
 * The Hive's ten ordinary buildings, as a lever.
 *
 * Here purely so the thing can be *measured*. Before #144 the Hivekin had two
 * ordinary buildings against ten apiece for the other two -- no happiness, no
 * science, no gold, no supply, no veterancy -- and nothing has ever measured
 * what giving it a full set did to the game.
 *
 * A lever rather than an arm that edits `TECHS`, for two reasons. The
 * identity check in `runSweep` compares `LEVERS`, and an arm moving something
 * that is not in there makes two real arms look like one arm run twice
 * (section 59 -- this refused to run until it was done properly). And
 * `restoreLevers` puts levers back with `Object.assign`, which cannot shrink
 * an array, so a mutated `TECHS` would not be restored between runs anyway.
 */
export const HIVE_WORKS = { enabled: true };

/** Whether this is one of the Hive's ten ordinary buildings. */
export function isHiveWork(b: { faction?: string; folly?: unknown; endingPart?: unknown; victory?: unknown }): boolean {
  return (
    b.faction === 'hivekin' &&
    b.folly === undefined &&
    b.endingPart === undefined &&
    b.victory === undefined
  );
}
