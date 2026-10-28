import { AI_TUNING, PERSONALITIES, runAiTurn } from '../src/ai/ai';
import { ATTRITION } from '../src/model/units';
import { DRAIN, SPLIT } from '../src/sim/abilities';
import { CALM, DISORDER, MILITIA, POSTING, RESETTLE, RUIN, SETTLER, SUPPLY } from '../src/sim/city';
import { FORTIFY_BONUS_REF, XP } from '../src/sim/combat';
import { DIFFICULTIES } from '../src/sim/difficulty';
import { NAVAL } from '../src/ai/naval';
import { INTIMIDATE, LEGION, RAIDER_TIERS } from '../src/sim/wilds';
import { PEACE, STANDING } from '../src/sim/diplomacy';
import { CONTACT } from '../src/sim/contact';
import { NEGOTIATION } from '../src/model/factions';
import { DISGUISE } from '../src/sim/disguise';
import { SPY } from '../src/sim/spying';
import { UNSEEN } from '../src/sim/unseen';
import { SABOTAGE } from '../src/sim/sabotage';
import { TURNING } from '../src/sim/turning';
import { GOSSIP } from '../src/sim/gossip';
import { INCITE } from '../src/sim/incite';
import { HIVE_WORKS } from '../src/sim/hivekin';
import { DISPERSAL, GUEST_LIST } from '../src/sim/dispersal';
import { DIPLOMACY_AI } from '../src/ai/diplomacy';
import { GOBLIN_SCOUT } from '../src/model/units';
import type { DifficultyId, FactionId, GameState, VictoryKind } from '../src/model/types';
import { FACTION_IDS, FACTIONS } from '../src/model/factions';
import { PREY, RAIDED } from '../src/sim/barbarians';
import { RUINS } from '../src/sim/ruins';
import { HIVE_ENDING, HIVEKIN, QUEEN } from '../src/sim/hivekin';
import { TECHS_BY_ID } from '../src/model/techs';
import { BURROW } from '../src/sim/burrow';
import { PILLAGE, ROADS, connectedByRoad } from '../src/sim/roads';
import { POSTS } from '../src/sim/posts';
import { TRADE, tradeGold, tradeLinks } from '../src/sim/trade';
import { capitalOf } from '../src/sim/city';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { SACKING } from '../src/sim/movement';
import { BEAKERS_PER_TRADE } from '../src/sim/research';
import { SPECIALS } from '../src/model/terrain';
import { SPELL_TURNS } from '../src/sim/status';
import { ALT_VICTORY } from '../src/sim/endings';
import { DOMINANCE, REGEN, SCORE_WEIGHTS, beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';
import { FOLLIES } from '../src/sim/follyEffects';
import { TERRAFORM } from '../src/sim/terraform';
import { AUTO_TILES } from '../src/sim/city';

/**
 * A repeatable way to measure a rules change.
 *
 * Every balance question so far was answered by a script written from scratch
 * for that question, and two of them were invalid in ways that looked like
 * results (section 59). The methodology was sound and lived nowhere: two arms,
 * two seed sets, controls emulated through the mutable constants rather than
 * through `git stash`. This is that methodology as code, so the next question
 * is a dozen lines of arms rather than two hundred lines of fresh harness with
 * fresh ways to be wrong.
 *
 * What it will not let you do is the thing that went wrong before: **two arms
 * that are secretly the same code**. `git stash push -- <paths>` rejects the
 * entire pathspec when any one path is untracked, so a control arm that stashed
 * `src/` alongside a new test file stashed nothing and ran the new code twice.
 * The output was two arms identical to the decimal. Here, the settings are read
 * back after each arm sets itself up and compared, and a sweep whose arms leave
 * the game in the same state refuses to run at all.
 */

// ------------------------------------------------------------------- levers

/**
 * How each game is set up, as opposed to the rules it is played under.
 *
 * A lever like the others so the identity check can see it. Raiders are a
 * setting chosen at the start of a game rather than a constant a rule reads, so
 * nothing in `LEVERS` moved when they were switched on -- and an arm with raiders
 * against an arm without would have been refused as the same arm run twice,
 * which is section 59's check being right about the wrong thing.
 *
 * Off by default, so every earlier number in this file and the balance band in
 * `tests/balance.test.ts` still describe the game they were taken from.
 */
export const NEW_GAME: {
  barbarians: boolean;
  difficulty: DifficultyId;
  world: 'continent' | 'archipelago';
  /**
   * Which side seat 0 is created as. Undefined is the Horde, which is what
   * `createGame` defaults to and what every measurement in this project has
   * been taken with.
   *
   * Here so a probe can ask "what if the person at the keyboard were somebody
   * else" without building its own runner -- which is the thing
   * `probe-and-sweep-same-game` exists to stop.
   */
  playerFaction?: FactionId;
} = {
  barbarians: false,
  playerFaction: undefined,
  // Ships: the archipelago is its own world, measured as an arm of its own.
  world: 'continent',
  // Section 113. Seat 0 is created as the player's and handed to the AI, so it
  // keeps the player's side of the level: patience at home, full prices, while
  // seat 1 gets the AI's discount. That is how a level is measured.
  difficulty: 'normal',
};

/**
 * Every constant a sweep is allowed to move, by name.
 *
 * The list is here rather than at each call site so that the identity check
 * below sees the whole surface: an arm that changes something missing from this
 * table would be invisible to it, and the sweep would refuse to run a
 * comparison that is in fact real.
 */
export const LEVERS: Record<string, object> = {
  AI_TUNING,
  ALT_VICTORY,
  FOLLIES,
  TERRAFORM,
  AUTO_TILES,
  DIFFICULTIES,
  NAVAL,
  GOBLIN_SCOUT,
  RAIDER_TIERS,
  INTIMIDATE,
  LEGION,
  RUINS,
  HIVEKIN,
  HIVE_ENDING,
  BURROW,
  QUEEN,
  PREY,
  PEACE,
  // Section 135. Both of them, because an arm that moved one and not the other
  // would otherwise be invisible to the identity check below -- which is what
  // happened the first time slice 3's arms were run, and the guard caught it.
  STANDING,
  CONTACT,
  NEGOTIATION,
  DISGUISE,
  SPY,
  // Section 138: the high tier. In the table the day it was written, so an
  // arm that turns it off is a real arm rather than a duplicate the identity
  // check refuses.
  UNSEEN,
  SABOTAGE,
  TURNING,
  GOSSIP,
  INCITE,
  HIVE_WORKS,
  /**
   * Section 153: the Unbound's whole rule, and the thing their ending does.
   *
   * In the table before the first arm that moves them, which is the point of
   * the two comments above: an arm that changes a lever the fingerprint
   * cannot see is an arm the identity check calls a duplicate, and a sweep
   * that refuses to run is the *good* outcome of that mistake.
   */
  DISPERSAL,
  GUEST_LIST,
  DIPLOMACY_AI,
  ATTRITION,
  BEAKERS_PER_TRADE,
  CALM,
  DISORDER,
  DOMINANCE,
  DRAIN,
  FORTIFY_BONUS_REF,
  MILITIA,
  NEW_GAME,
  POSTING,
  REGEN,
  RESETTLE,
  PERSONALITIES,
  PILLAGE,
  POSTS,
  ROADS,
  TRADE,
  RUIN,
  SACKING,
  SCORE_WEIGHTS,
  SETTLER,
  SPECIALS,
  SPELL_TURNS,
  SPLIT,
  SUPPLY,
  XP,
  /**
   * Two advances, registered as levers because section 136 measures a change
   * to *what they grant* rather than to a tuning number.
   *
   * Unusual, and the alternative is worse: an arm that mutates a tech table
   * the fingerprint cannot see is an arm the identity check calls a duplicate,
   * which is the section 59 trap wearing a different hat. `PERSONALITIES` is
   * already in here for the same reason -- `control()` rewrites its
   * `techPriority` and the snapshot has to notice.
   */
  FIRST_HIVEKIN: TECHS_BY_ID['first-hivekin'],
  CASTE_FODDER: TECHS_BY_ID['caste-fodder'],
};

/**
 * Every road out, in one place, so the summary row cannot miss one.
 *
 * Section 156. The row named six kinds by hand -- `conquest`, `dominance`,
 * `points`, `portal`, `object`, `hive` -- which was right when there were
 * three factions and silently wrong once there were five. Section 153's sweep
 * reported **sixteen Spirit Party wins as nothing at all**, and the Wandering
 * Folk's Circling Caravan had no column either.
 *
 * That is section 140's own finding repeated: its note says *"a report that
 * cannot name the third side's ending cannot show the third side winning"* --
 * and then the fourth and fifth arrived and nobody read the row again. The
 * `routes` field held every kind the whole time; only the printing dropped
 * them.
 */
const VICTORY_KINDS: readonly VictoryKind[] = [
  'conquest',
  'dominance',
  'points',
  'draw',
  'portal',
  'object',
  'hive',
  'circle',
  'party',
];

/** What every lever says right now, as one comparable string. */
export function settingsSnapshot(): string {
  return JSON.stringify(
    Object.fromEntries(Object.keys(LEVERS).sort().map((k) => [k, LEVERS[k]])),
  );
}

/** Put every lever back where it was. Always called, even when a sweep throws. */
function restoreLevers(saved: Record<string, object>): void {
  for (const [name, values] of Object.entries(saved)) {
    Object.assign(LEVERS[name], values);
  }
}

function saveLevers(): Record<string, object> {
  return Object.fromEntries(
    Object.entries(LEVERS).map(([k, v]) => [k, structuredClone(v)]),
  );
}

// -------------------------------------------------------------------- games

/**
 * A measure taken per side, keyed by **faction** rather than by seat.
 *
 * Section 140. Every one of these used to be `[number, number]`, meaning seat
 * 0 and seat 1 -- which meant the Horde and the Kingdom for as long as those
 * were the only two seats there could be. Section 139 made the sides in a game
 * a choice, so seat 1 is now whoever was picked first and a seat may not exist
 * at all. A column headed `hum` that reported whatever sat in seat 1 would
 * have been wrong without ever looking wrong.
 *
 * **A missing key means that side was not in the game**, which is not the same
 * as a side that was in it and ended with nothing. The averages below count
 * only the games a side actually played, or a faction present in half the
 * games would report half its real size and read as weak.
 */
export type PerSide = Partial<Record<FactionId, number>>;

export interface Outcome {
  seed: number;
  turns: number;
  winner: number | null;
  /**
   * The side that won, by faction.
   *
   * `winner` is a seat, and a seat is no longer a side: section 139 lets the
   * Hive be picked as the first opponent, in which case it sits in seat 1 and
   * the old `winner > 1` test for "the Hive won" counted it as the Kingdom.
   */
  winnerFaction: FactionId | null;
  /** Every non-barbarian side that was in this game, in seat order. */
  sides: FactionId[];
  combats: number;
  /**
   * Cities that changed hands, counted by watching ownership rather than by
   * reading the log: `log()` keeps only the last 400 entries, so anything
   * counted from it over a 300-turn game is a floor and not a total.
   */
  captures: number;
  cities: PerSide;
  /** Total citizens. Weighted heavily by the score, so worth watching. */
  population: PerSide;
  units: PerSide;
  techs: PerSide;
  ladder: PerSide;
  /** How it ended, or null for a game still going when the half-turns ran out. */
  victory: VictoryKind | null;
  /**
   * Cities of each side raided, counted as it happens for the same reason
   * combats are. Always zero in a game without raiders.
   */
  sacks: PerSide;
  /**
   * A fingerprint of the map and starting positions this game was played on.
   *
   * Two arms can only be compared seed by seed if they played the same map.
   * Section 94 compared an arm with the rule tiles absent against one with them
   * present -- and choosing between two specials draws one more random number
   * in world generation, so the terrain came out identical and every starting
   * position moved. More than half the games changed winner. That was two sets
   * of different games, not one change, and it hid a real effect.
   */
  map: string;
  /** Road tiles on the map when the game ended. Roads have no owner, so one number. */
  roadTiles: number;
  /**
   * Share of each side's cities joined to its own capital by road at the end,
   * orc and human. Here so a roads arm cannot come back "no effect" for the
   * reason section 91 did: because the AI never used the thing at all.
   */
  joined: PerSide;
  /**
   * Trade routes standing at the end, orc and human, and what they pay a turn.
   *
   * Section 106 is an economy change, and these are the same guard as the roads
   * columns: an arm that moves nothing because no AI ever earned a route should
   * say so here rather than read as "no effect".
   */
  links: PerSide;
  routeGold: PerSide;
}

function deepestGroup(types: string[]): number {
  return types.reduce((max, t) => Math.max(max, Number(t.split('_x')[1] ?? 1)), 1);
}

/** Turns past the limit the loop will run, so every game reaches a verdict. */
const TURN_SLACK = 50;

/**
 * How many half-turns a game needs to reach its verdict.
 *
 * Was a flat 700, which is 350 turns for two players and quietly assumed there
 * would only ever be two. A game with raiders has three slots in the turn order,
 * so 700 half-turns ran out at turn 234 -- sixty-six turns short of the limit --
 * and those games came back with no winner. In a table that counted a game with
 * no winner as a draw, a harness running out of loop read as raiders making
 * games shorter and more often drawn, which was the very thing being measured.
 * Counted from the players actually in the game now.
 */
export function halfTurnsFor(state: GameState): number {
  // Section 123 is the same trap a second time. A quiet game now acquires a
  // wilds slot *part-way through* -- the first time anybody disturbs a ruin --
  // so a budget counted off the players present at turn one ran out around
  // turn 220 and every one of those games came back with no winner. Budget for
  // the seat whether or not it has been taken yet.
  const mayWake = RUINS.enabled && !state.players.some((p) => p.barbarian);
  // Section 125 is the same trap a third time, and this one was caught by the
  // measurement rather than before it: six of 108 three-sided games stopped at
  // turn 294 to 299 with nobody having won, because the Hivekin take a seat of
  // their own around turn a hundred and the budget was counted without them.
  // An unfinished game is not a draw -- it is a game missing from every column.
  const mayEmerge = HIVEKIN.enabled && !state.players.some((p) => p.faction === 'hivekin');
  const seats = state.players.length + (mayWake ? 1 : 0) + (mayEmerge ? 1 : 0);
  return (state.settings.maxTurns + TURN_SLACK) * seats;
}

/**
 * Share of this player's cities, other than the capital, on the capital's road
 * network. The capital itself is left out, or an empire with no roads at all
 * reads as one city in n joined.
 */
function joinedShare(state: GameState, playerId: number): number {
  const seat = capitalOf(state, playerId);
  if (!seat) return 0;
  const others = playerCities(state, playerId).filter((c) => c.id !== seat.id);
  if (others.length === 0) return 0;
  const net = connectedByRoad(state, playerId, seat.x, seat.y);
  return others.filter((c) => net.has(c.y * state.width + c.x)).length / others.length;
}

/** FNV-1a over the terrain, the specials and where everybody starts. */
export function mapSignature(state: GameState): string {
  const text = [
    state.terrain.join(','),
    state.specials.join(','),
    state.units.map((u) => `${u.owner}:${u.type}:${u.x},${u.y}`).join(' '),
  ].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * One whole game, both sides played by the AI.
 *
 * The single runner. It was private to the balance regression, so every sweep
 * grew its own near-copy, and the near-copies disagreed about things that
 * mattered -- one of them read fights off the tail of a trimmed log and
 * reported none.
 */
export function playGame(
  seed: number,
  halfTurns?: number,
  /**
   * Called after every half-turn, for a diagnostic that needs to watch a game
   * rather than only read its result.
   *
   * An observer rather than a second loop, because a second loop is how the
   * near-copies got out of step in the first place -- see the note above.
   */
  watch?: (state: GameState) => void,
): Outcome {
  const state = createGame({
    seed,
    barbarians: NEW_GAME.barbarians,
    difficulty: NEW_GAME.difficulty,
    world: NEW_GAME.world,
    playerFaction: NEW_GAME.playerFaction,
  });
  const map = mapSignature(state);
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);

  const owners = new Map<number, number>();
  let captures = 0;
  // Counted as it happens, for the same reason captures are: `log()` keeps only
  // the last 400 entries, and a game that runs to the turn limit pushes its
  // early fighting straight out of the window. Read off the tail, a seed with
  // thirty-seven fights reports none.
  let combats = 0;
  // Keyed by faction as everything else now is, and counted for every side
  // rather than only seats 0 and 1 -- a latecomer takes whatever seat is free
  // and would have been counted as nobody.
  const sacks: PerSide = {};
  let readLog = 0;
  const countCombat = () => {
    for (let i = readLog; i < state.log.length; i++) {
      const entry = state.log[i];
      if (entry.kind === 'combat') combats++;
      if (entry.subject === RAIDED && entry.player !== null) {
        const who = state.players[entry.player];
        if (who && !who.barbarian) sacks[who.faction] = (sacks[who.faction] ?? 0) + 1;
      }
    }
    readLog = state.log.length;
  };
  const sweepOwners = () => {
    for (const c of state.cities) {
      const was = owners.get(c.id);
      if (was !== undefined && was !== c.owner) captures++;
      owners.set(c.id, c.owner);
    }
  };
  sweepOwners();
  const budget = halfTurns ?? halfTurnsFor(state);
  for (let i = 0; i < budget && state.winner === null; i++) {
    const before = state.log.length;
    // The window slid if the log was trimmed while the turn ran; start again
    // from whatever is still there rather than from an index that has moved.
    if (before < readLog) readLog = 0;
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
    countCombat();
    sweepOwners();
    watch?.(state);
  }
  const per = (p: number) => playerUnits(state, p).map((u) => u.type);
  // Everybody who was in this game, barbarians excluded -- they are a seat but
  // not a side, and averaging the wilds' cities would be a column of zeroes
  // pretending to be a contender.
  const contending = state.players.filter((p) => !p.barbarian);
  const sides = contending.map((p) => p.faction);
  /** A measure taken for every side that was in the game, keyed by faction. */
  const each = (f: (id: number) => number): PerSide =>
    Object.fromEntries(contending.map((p) => [p.faction, f(p.id)]));
  const winnerSeat = state.winner;
  return {
    seed,
    turns: state.turn,
    winner: winnerSeat,
    winnerFaction:
      winnerSeat === null ? null : (state.players[winnerSeat]?.faction ?? null),
    sides,
    combats,
    captures,
    cities: each((id) => playerCities(state, id).length),
    population: each((id) => playerCities(state, id).reduce((n, c) => n + c.size, 0)),
    units: each((id) => playerUnits(state, id).length),
    techs: each((id) => state.players[id].techs.length),
    ladder: each((id) => deepestGroup(per(id))),
    victory: state.victory ?? null,
    // Every side that was raided gets a key, and one that never was gets a
    // zero rather than being missing -- it was in the game.
    sacks: { ...each(() => 0), ...sacks },
    map,
    roadTiles: (state.roads ?? []).reduce((n, r) => n + r, 0),
    joined: each((id) => joinedShare(state, id)),
    links: each((id) => tradeLinks(state, id).length),
    routeGold: each((id) => tradeGold(state, id)),
  };
}

// -------------------------------------------------------------------- seeds

export interface SeedSet {
  name: string;
  seeds: number[];
}

/**
 * Eighteen seeds on each of three map bases, which is the shape every sweep
 * here has used: 54 games an arm.
 *
 * Three bases rather than 54 seeds off one, because a single base can hand both
 * arms the same unusual continent and a difference that is really about one map
 * reads as a difference about the rule.
 */
export function seedSet(name: string, bases: number[], perBase = 18): SeedSet {
  const seeds: number[] = [];
  for (const base of bases) {
    for (let i = 0; i < perBase; i++) seeds.push((base + i * 7919) >>> 0);
  }
  return { name, seeds };
}

/**
 * The set a rule gets tuned against, and the set that decides whether it worked.
 *
 * Two sets is not ceremony. Section 19's resettlement numbers came back "costs
 * the Horde three games" on the tuned seeds and reversed on the held-out ones,
 * 54-54 against 50-58. One set would have shipped the wrong rule with a
 * confident number attached to it.
 */
export const TUNED_BASES = [1, 1_000_003, 2_000_011];
export const HELD_OUT_BASES = [7_654_321, 8_000_011, 9_000_017];
export const TUNED = seedSet('tuned', TUNED_BASES);
export const HELD_OUT = seedSet('held-out', HELD_OUT_BASES);

// -------------------------------------------------------------------- sweeps

export interface Arm {
  label: string;
  /** Move the levers this arm needs. Called once before its games. */
  apply: () => void;
}

export interface ArmResult {
  arm: string;
  set: string;
  outcomes: Outcome[];
}

export interface SweepOptions {
  arms: Arm[];
  sets?: SeedSet[];
  halfTurns?: number;
  /** Told what it is about to cost before it starts. */
  say?: (line: string) => void;
  /**
   * Run against one seed set. Only for a look, never for a decision -- see
   * `TUNED` and `HELD_OUT` above for why.
   */
  allowOneSet?: boolean;
}

/**
 * Measured, so a sweep can be quoted before it runs rather than after.
 *
 * Section 60's table says 54 games took 2.6 to 4.5 minutes, which is 2.9 to 5.0
 * seconds a game. A run today came in at 8.2, and the reason is in that same
 * section: cost tracks **total simulated turns**, not games. Those runs averaged
 * 110 to 132 turns because somebody won; games now reach the 300-turn limit far
 * more often, so each one costs more.
 *
 * `runSweep` prints what it actually took against this number, so it can be
 * recalibrated from real output rather than guessed at again.
 *
 * Recalibrated to 15 for section 125, off two 216-game runs that came in at
 * 13.4 and 15.7 seconds a game. Same reason as before, one seat further on:
 * three sides take more turns each than two, and almost every game now runs to
 * the limit. At 8 this told Jeremy to expect 29 minutes for a run that took 57.
 */
export const SECONDS_PER_GAME = 15;

export function estimate(games: number): string {
  const mins = (games * SECONDS_PER_GAME) / 60;
  return (
    `${games} games, about ${mins.toFixed(0)} minutes ` +
    `(${(mins * 0.6).toFixed(0)}-${(mins * 1.3).toFixed(0)}, depending on how many run to the turn limit)`
  );
}

/**
 * Run every arm over every seed set.
 *
 * Refuses two things outright, both of which have already produced a wrong
 * answer in this project:
 *
 * - **Arms that are secretly identical.** Section 59: the settings are read
 *   back after each arm applies itself, and two arms that leave the game in the
 *   same state are not a comparison.
 * - **A single seed set.** Section 19: the tuned seeds said one thing and the
 *   held-out seeds said the opposite.
 */
export function runSweep(opts: SweepOptions): ArmResult[] {
  const sets = opts.sets ?? [TUNED, HELD_OUT];
  const say = opts.say ?? ((line: string) => console.log(line));

  if (opts.arms.length < 2) {
    throw new Error('A sweep needs at least two arms; one arm is a measurement of nothing.');
  }
  if (sets.length < 2 && !opts.allowOneSet) {
    throw new Error(
      'A sweep needs two seed sets, one to tune against and one to decide with. ' +
        'Pass allowOneSet for a look that will not be used to decide anything.',
    );
  }

  const saved = saveLevers();
  try {
    // Every arm set up and read back *before* any game runs, so an invalid
    // comparison costs nothing rather than half an hour.
    const shapes = new Map<string, string>();
    for (const arm of opts.arms) {
      restoreLevers(saved);
      arm.apply();
      const shape = settingsSnapshot();
      const twin = [...shapes.entries()].find(([, s]) => s === shape)?.[0];
      if (twin) {
        throw new Error(
          `Arms "${twin}" and "${arm.label}" leave every setting the same, so they are ` +
            'the same arm run twice. This is the section 59 trap: emulate a control by ' +
            'moving a constant, and make sure the constant you moved is in LEVERS.',
        );
      }
      shapes.set(arm.label, shape);
    }

    const games = opts.arms.length * sets.reduce((n, s) => n + s.seeds.length, 0);
    say(`Sweep: ${opts.arms.length} arms x ${sets.length} sets. ${estimate(games)}.`);

    const started = Date.now();
    const results: ArmResult[] = [];
    for (const arm of opts.arms) {
      for (const set of sets) {
        restoreLevers(saved);
        arm.apply();
        const at = Date.now();
        const outcomes = set.seeds.map((seed) => playGame(seed, opts.halfTurns));
        results.push({ arm: arm.label, set: set.name, outcomes });
        // Only when nobody capped the games on purpose, as the tests do.
        const unfinished = outcomes.filter((o) => o.victory === null).length;
        if (unfinished > 0 && opts.halfTurns === undefined) {
          say(
            `  WARNING: ${unfinished} of these games ran out of turns before anybody won. ` +
              'They are not draws, and every number below is short of them.',
          );
        }
        say(
          `  ${arm.label} / ${set.name}: ${outcomes.length} games in ` +
            `${((Date.now() - at) / 1000 / 60).toFixed(1)} min`,
        );
      }
    }
    // Seed-by-seed pairing assumes every arm played the same map. An arm that
    // changes what world generation draws plays different games altogether, so
    // this is said rather than refused -- some questions cannot be asked any
    // other way -- but it is said, because section 94 read one as a control.
    for (const set of sets) {
      const byArm = results.filter((r) => r.set === set.name);
      const moved = set.seeds.filter(
        (seed) => new Set(byArm.map((r) => r.outcomes.find((o) => o.seed === seed)?.map)).size > 1,
      ).length;
      if (moved > 0) {
        say(
          `  NOTE: on ${moved} of ${set.seeds.length} ${set.name} seeds the arms played different maps. ` +
            'Read the totals, which include map luck; do not pair these games seed by seed.',
        );
      }
    }
    const actual = (Date.now() - started) / 1000;
    say(
      `Done in ${(actual / 60).toFixed(1)} min ` +
        `(${(actual / games).toFixed(1)}s a game; SECONDS_PER_GAME says ${SECONDS_PER_GAME}).`,
    );
    return results;
  } finally {
    restoreLevers(saved);
  }
}

// ------------------------------------------------------------------ reading

const mean = (ns: number[]) => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0);

const countBy = (keys: string[]): Record<string, number> =>
  keys.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});

export interface Summary {
  arm: string;
  set: string;
  games: number;
  /**
   * Wins per faction, keyed by faction. Section 140.
   *
   * Was three fixed fields, the last of which read `winner > 1` -- "anything
   * past seat one is the Hive". Section 139 lets the Hive be picked as the
   * first opponent, which puts it in seat 1, where that test counted it as
   * the Kingdom. Counted off the winner's actual faction now.
   */
  wins: PerSide;
  draws: number;
  /**
   * Games the loop gave up on before anybody won or the limit came. Should
   * always be zero in a real sweep, and is printed so it cannot hide again.
   */
  unfinished: number;
  turns: number;
  cities: PerSide;
  population: PerSide;
  units: PerSide;
  techs: PerSide;
  combats: number;
  captures: number;
  /**
   * Games by how they ended: conquest, dominance, points, and each side's own
   * ending.
   *
   * The `hive` column was missing for the whole of section 125, so the twenty-
   * seven games the Hivekin won off their own ending appeared only as a
   * discrepancy: the five printed numbers summed to 38 of 54 and the sixteen
   * missing games were the ones that mattered most. A report that cannot name
   * the third side's ending cannot show the third side winning.
   */
  routes: Record<string, number>;
  /** Mean cities raided per game, per side. */
  sacks: PerSide;
  /** Mean road tiles at the end of a game. */
  roadTiles: number;
  /** Mean share of cities joined to the capital by road, per side. */
  joined: PerSide;
  /** Mean trade routes standing at the end, and mean gold a turn from them. */
  links: PerSide;
  routeGold: PerSide;
  /**
   * Every side that appeared in this arm, in table order.
   *
   * So the report can print a block per side that was actually there, rather
   * than a fixed two and a guess about the rest.
   */
  sides: FactionId[];
}

/**
 * Mean of a per-side measure, over **the games that side was in**.
 *
 * Section 140, and the half of this change that is not cosmetic. Dividing by
 * every game in the arm would report a faction present in half of them at
 * half its real size, which reads as a weak side rather than a rare one --
 * and with section 139 letting the opponents be chosen, "present in half the
 * games" is now an ordinary thing for an arm to be.
 */
function meanPerSide(outcomes: Outcome[], pick: (o: Outcome) => PerSide): PerSide {
  const sum: Record<string, number> = {};
  const seen: Record<string, number> = {};
  for (const o of outcomes) {
    for (const [faction, value] of Object.entries(pick(o))) {
      if (value === undefined) continue;
      sum[faction] = (sum[faction] ?? 0) + value;
      seen[faction] = (seen[faction] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(sum).map(([faction, total]) => [faction, total / seen[faction]]),
  ) as PerSide;
}

/** Wins per faction, counted by faction rather than by seat. */
function winsPerSide(outcomes: Outcome[]): PerSide {
  const out: Record<string, number> = {};
  for (const o of outcomes) {
    // Every side that played gets a key, so a faction that was in the arm and
    // never won reads as a zero rather than as absent.
    for (const f of o.sides) out[f] ??= 0;
    if (o.winnerFaction) out[o.winnerFaction] = (out[o.winnerFaction] ?? 0) + 1;
  }
  return out as PerSide;
}

export function summarise(results: ArmResult[]): Summary[] {
  return results.map((r) => ({
    arm: r.arm,
    set: r.set,
    games: r.outcomes.length,
    wins: winsPerSide(r.outcomes),
    draws: r.outcomes.filter((o) => o.victory === 'draw').length,
    unfinished: r.outcomes.filter((o) => o.victory === null).length,
    turns: mean(r.outcomes.map((o) => o.turns)),
    cities: meanPerSide(r.outcomes, (o) => o.cities),
    population: meanPerSide(r.outcomes, (o) => o.population),
    units: meanPerSide(r.outcomes, (o) => o.units),
    techs: meanPerSide(r.outcomes, (o) => o.techs),
    combats: mean(r.outcomes.map((o) => o.combats)),
    captures: mean(r.outcomes.map((o) => o.captures)),
    routes: countBy(r.outcomes.map((o) => o.victory ?? 'unfinished')),
    sacks: meanPerSide(r.outcomes, (o) => o.sacks),
    roadTiles: mean(r.outcomes.map((o) => o.roadTiles)),
    joined: meanPerSide(r.outcomes, (o) => o.joined),
    links: meanPerSide(r.outcomes, (o) => o.links),
    routeGold: meanPerSide(r.outcomes, (o) => o.routeGold),
    /** Every side that appeared in this arm, in a stable order. */
    sides: FACTION_IDS.filter((f) => r.outcomes.some((o) => o.sides.includes(f))),
  }));
}

/**
 * The summary as a table.
 *
 * Wins are printed per seed set and never pooled, because pooling is how a
 * result that only exists on the tuned seeds disappears into an average that
 * still looks like evidence.
 */
export function report(results: ArmResult[]): string {
  const rows = summarise(results);
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  // Every side that appeared anywhere in the run, in table order. Taken across
  // all the arms rather than per arm, so the columns line up down the page
  // even when one arm had a side in it and another did not.
  const sides = FACTION_IDS.filter((f) => rows.some((r) => r.sides.includes(f)));
  const label = (f: FactionId) => FACTIONS[f].name.slice(0, 8);
  /** A per-side figure, or a dash where that side was not in the arm. */
  const cell = (v: PerSide, f: FactionId, dp: number, pct = false): string => {
    const n = v[f];
    if (n === undefined) return '-';
    return pct ? `${Math.round(n * 100)}%` : n.toFixed(dp);
  };

  // ---- the game, which is not per side -----------------------------------
  const head =
    `${'arm'.padEnd(18)}${'set'.padEnd(10)}${pad('games', 6)}${pad('draw', 6)}${pad('unfin', 6)}` +
    `${pad('turns', 7)}${pad('fights', 8)}${pad('caps', 6)}${pad('roads', 7)}` +
    // Three letters, not two: `points` and `portal` both abbreviate to `po`,
    // which is a header that cannot be read back.
    `  ${VICTORY_KINDS.map((k) => k.slice(0, 3)).join('/')}`;
  const body = rows.map(
    (r) =>
      r.arm.padEnd(18) +
      r.set.padEnd(10) +
      pad(r.games, 6) +
      pad(r.draws, 6) +
      pad(r.unfinished, 6) +
      pad(r.turns.toFixed(0), 7) +
      pad(r.combats.toFixed(0), 8) +
      pad(r.captures.toFixed(1), 6) +
      pad(r.roadTiles.toFixed(0), 7) +
      '  ' +
      VICTORY_KINDS.map((k) => r.routes[k] ?? 0).join('/'),
  );

  // ---- and then each side, one block apiece ------------------------------
  //
  // **A block rather than more columns.** The old row carried the Horde's and
  // the Kingdom's figures as `a/b` pairs and was already 180 characters wide;
  // a third side would have pushed it past any terminal and a fifth is
  // coming. A side gets its own short table, which also means a run with one
  // side in it prints one table rather than a row full of dashes.
  const blocks = sides.map((f) => {
    const subhead =
      `${label(f).padEnd(18)}${'set'.padEnd(10)}${pad('wins', 6)}${pad('cities', 8)}${pad('pop', 8)}` +
      `${pad('units', 8)}${pad('techs', 8)}${pad('sacked', 8)}${pad('joined', 8)}${pad('routes', 8)}${pad('routeG', 8)}`;
    const lines = rows.map(
      (r) =>
        r.arm.padEnd(18) +
        r.set.padEnd(10) +
        pad(r.wins[f] ?? '-', 6) +
        pad(cell(r.cities, f, 2), 8) +
        pad(cell(r.population, f, 1), 8) +
        pad(cell(r.units, f, 1), 8) +
        pad(cell(r.techs, f, 1), 8) +
        pad(cell(r.sacks, f, 1), 8) +
        pad(cell(r.joined, f, 0, true), 8) +
        pad(cell(r.links, f, 1), 8) +
        pad(cell(r.routeGold, f, 1), 8),
    );
    return [subhead, '-'.repeat(subhead.length), ...lines].join('\n');
  });

  return [head, '-'.repeat(head.length), ...body, '', ...blocks.flatMap((b) => [b, ''])]
    .join('\n')
    .trimEnd();
}

/**
 * Every game, one per line, for when the summary hides the thing you need.
 *
 * **Named columns, generated per side.** Section 140. The old row was
 * twenty-six positional fields with a hand-written header some distance away,
 * and the per-side pairs in it meant seat 0 and seat 1 — so the little
 * analysis scripts that get written against this file counted tabs and
 * trusted that seat 1 was still the Kingdom. One of them was written in
 * section 138 and had `units` where the file actually held `ladder`, which
 * cost a prediction that could not be tested.
 *
 * Now the header names every column (`hivekinCities`, `orcPop`) and is built
 * from the same list the rows are, so the two cannot drift.
 */
export function rawRows(results: ArmResult[]): string {
  const sides = FACTION_IDS.filter((f) =>
    results.some((r) => r.outcomes.some((o) => o.sides.includes(f))),
  );
  const measures: Array<[string, (o: Outcome) => PerSide]> = [
    ['Cities', (o) => o.cities],
    ['Pop', (o) => o.population],
    ['Units', (o) => o.units],
    ['Techs', (o) => o.techs],
    ['Ladder', (o) => o.ladder],
    ['Sacked', (o) => o.sacks],
    ['Joined', (o) => o.joined],
    ['Links', (o) => o.links],
    ['RouteGold', (o) => o.routeGold],
  ];
  const cols = [
    'arm',
    'set',
    'seed',
    'turns',
    'winner',
    'fights',
    'caps',
    'victory',
    'map',
    'roadTiles',
    ...sides.flatMap((f) => measures.map(([name]) => `${f}${name}`)),
  ];
  const lines = results.flatMap((r) =>
    r.outcomes.map((o) =>
      [
        r.arm,
        r.set,
        o.seed,
        o.turns,
        // The faction, not the seat. A seat number was never readable and is
        // not stable any more either.
        o.winnerFaction ?? '-',
        o.combats,
        o.captures,
        o.victory ?? '-',
        o.map,
        o.roadTiles,
        ...sides.flatMap((f) => measures.map(([, pick]) => pick(o)[f] ?? '-')),
      ].join('\t'),
    ),
  );
  return [cols.join('\t'), ...lines].join('\n');
}
