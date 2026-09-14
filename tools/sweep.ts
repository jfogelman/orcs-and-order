import { AI_TUNING, PERSONALITIES, runAiTurn } from '../src/ai/ai';
import { ATTRITION } from '../src/model/units';
import { DRAIN, SPLIT } from '../src/sim/abilities';
import { CALM, DISORDER, MILITIA, POSTING, RESETTLE, RUIN, SETTLER, SUPPLY } from '../src/sim/city';
import { FORTIFY_BONUS_REF, XP } from '../src/sim/combat';
import type { GameState, VictoryKind } from '../src/model/types';
import { RAIDED } from '../src/sim/barbarians';
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
export const NEW_GAME = { barbarians: false };

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
};

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

export interface Outcome {
  seed: number;
  turns: number;
  winner: number | null;
  combats: number;
  /**
   * Cities that changed hands, counted by watching ownership rather than by
   * reading the log: `log()` keeps only the last 400 entries, so anything
   * counted from it over a 300-turn game is a floor and not a total.
   */
  captures: number;
  cities: [number, number];
  /** Total citizens. Weighted heavily by the score, so worth watching. */
  population: [number, number];
  units: [number, number];
  techs: [number, number];
  ladder: [number, number];
  /** How it ended, or null for a game still going when the half-turns ran out. */
  victory: VictoryKind | null;
  /**
   * Cities of each side raided, counted as it happens for the same reason
   * combats are. Always zero in a game without raiders.
   */
  sacks: [number, number];
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
  joined: [number, number];
  /**
   * Trade routes standing at the end, orc and human, and what they pay a turn.
   *
   * Section 106 is an economy change, and these are the same guard as the roads
   * columns: an arm that moves nothing because no AI ever earned a route should
   * say so here rather than read as "no effect".
   */
  links: [number, number];
  routeGold: [number, number];
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
  return (state.settings.maxTurns + TURN_SLACK) * state.players.length;
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
  const state = createGame({ seed, barbarians: NEW_GAME.barbarians });
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
  const sacks: [number, number] = [0, 0];
  let readLog = 0;
  const countCombat = () => {
    for (let i = readLog; i < state.log.length; i++) {
      const entry = state.log[i];
      if (entry.kind === 'combat') combats++;
      if (entry.subject === RAIDED && (entry.player === 0 || entry.player === 1)) {
        sacks[entry.player]++;
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
  return {
    seed,
    turns: state.turn,
    winner: state.winner,
    combats,
    captures,
    cities: [playerCities(state, 0).length, playerCities(state, 1).length],
    population: [
      playerCities(state, 0).reduce((n, c) => n + c.size, 0),
      playerCities(state, 1).reduce((n, c) => n + c.size, 0),
    ],
    units: [playerUnits(state, 0).length, playerUnits(state, 1).length],
    techs: [state.players[0].techs.length, state.players[1].techs.length],
    ladder: [deepestGroup(per(0)), deepestGroup(per(1))],
    victory: state.victory ?? null,
    sacks,
    map,
    roadTiles: (state.roads ?? []).reduce((n, r) => n + r, 0),
    joined: [joinedShare(state, 0), joinedShare(state, 1)],
    links: [tradeLinks(state, 0).length, tradeLinks(state, 1).length],
    routeGold: [tradeGold(state, 0), tradeGold(state, 1)],
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
 */
export const SECONDS_PER_GAME = 8;

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
  orcWins: number;
  humanWins: number;
  draws: number;
  /**
   * Games the loop gave up on before anybody won or the limit came. Should
   * always be zero in a real sweep, and is printed so it cannot hide again.
   */
  unfinished: number;
  turns: number;
  cities: [number, number];
  population: [number, number];
  techs: [number, number];
  combats: number;
  captures: number;
  /** Games by how they ended: conquest, dominance, points, draw, unfinished. */
  routes: Record<string, number>;
  /** Mean cities raided per game, orc and human. */
  sacks: [number, number];
  /** Mean road tiles at the end of a game. */
  roadTiles: number;
  /** Mean share of cities joined to the capital by road, orc and human. */
  joined: [number, number];
  /** Mean trade routes standing at the end, and mean gold a turn from them. */
  links: [number, number];
  routeGold: [number, number];
}

export function summarise(results: ArmResult[]): Summary[] {
  return results.map((r) => ({
    arm: r.arm,
    set: r.set,
    games: r.outcomes.length,
    orcWins: r.outcomes.filter((o) => o.winner === 0).length,
    humanWins: r.outcomes.filter((o) => o.winner === 1).length,
    draws: r.outcomes.filter((o) => o.victory === 'draw').length,
    unfinished: r.outcomes.filter((o) => o.victory === null).length,
    turns: mean(r.outcomes.map((o) => o.turns)),
    cities: [mean(r.outcomes.map((o) => o.cities[0])), mean(r.outcomes.map((o) => o.cities[1]))],
    population: [
      mean(r.outcomes.map((o) => o.population[0])),
      mean(r.outcomes.map((o) => o.population[1])),
    ],
    techs: [mean(r.outcomes.map((o) => o.techs[0])), mean(r.outcomes.map((o) => o.techs[1]))],
    combats: mean(r.outcomes.map((o) => o.combats)),
    captures: mean(r.outcomes.map((o) => o.captures)),
    routes: countBy(r.outcomes.map((o) => o.victory ?? 'unfinished')),
    sacks: [mean(r.outcomes.map((o) => o.sacks[0])), mean(r.outcomes.map((o) => o.sacks[1]))],
    roadTiles: mean(r.outcomes.map((o) => o.roadTiles)),
    joined: [mean(r.outcomes.map((o) => o.joined[0])), mean(r.outcomes.map((o) => o.joined[1]))],
    links: [mean(r.outcomes.map((o) => o.links[0])), mean(r.outcomes.map((o) => o.links[1]))],
    routeGold: [
      mean(r.outcomes.map((o) => o.routeGold[0])),
      mean(r.outcomes.map((o) => o.routeGold[1])),
    ],
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
  const head =
    `${'arm'.padEnd(18)}${'set'.padEnd(10)}${pad('games', 6)}${pad('orc', 5)}${pad('hum', 5)}` +
    `${pad('draw', 5)}${pad('unfin', 6)}${pad('turns', 7)}${pad('cities', 14)}${pad('pop', 14)}${pad('techs', 13)}` +
    `${pad('fights', 8)}${pad('caps', 6)}${pad('cq/dm/pt/po/ob', 16)}${pad('sacked', 11)}${pad('roads', 7)}${pad('joined', 11)}${pad('routes', 10)}${pad('routeG', 9)}`;
  const body = rows.map(
    (r) =>
      r.arm.padEnd(18) +
      r.set.padEnd(10) +
      pad(r.games, 6) +
      pad(r.orcWins, 5) +
      pad(r.humanWins, 5) +
      pad(r.draws, 5) +
      pad(r.unfinished, 6) +
      pad(r.turns.toFixed(0), 7) +
      pad(`${r.cities[0].toFixed(2)}/${r.cities[1].toFixed(2)}`, 14) +
      pad(`${r.population[0].toFixed(1)}/${r.population[1].toFixed(1)}`, 14) +
      pad(`${r.techs[0].toFixed(1)}/${r.techs[1].toFixed(1)}`, 13) +
      pad(r.combats.toFixed(0), 8) +
      pad(r.captures.toFixed(1), 6) +
      pad(
        `${r.routes.conquest ?? 0}/${r.routes.dominance ?? 0}/${r.routes.points ?? 0}/` +
          `${r.routes.portal ?? 0}/${r.routes.object ?? 0}`,
        16,
      ) +
      pad(`${r.sacks[0].toFixed(1)}/${r.sacks[1].toFixed(1)}`, 11) +
      pad(r.roadTiles.toFixed(0), 7) +
      pad(`${Math.round(r.joined[0] * 100)}%/${Math.round(r.joined[1] * 100)}%`, 11) +
      pad(`${r.links[0].toFixed(1)}/${r.links[1].toFixed(1)}`, 10) +
      pad(`${r.routeGold[0].toFixed(1)}/${r.routeGold[1].toFixed(1)}`, 9),
  );
  return [head, '-'.repeat(head.length), ...body].join('\n');
}

/** Every game, one per line, for when the summary hides the thing you need. */
export function rawRows(results: ArmResult[]): string {
  return results
    .flatMap((r) =>
      r.outcomes.map(
        (o) =>
          `${r.arm}\t${r.set}\t${o.seed}\t${o.turns}\t${o.winner ?? '-'}\t${o.combats}\t` +
          `${o.captures}\t${o.cities[0]}\t${o.cities[1]}\t${o.population[0]}\t${o.population[1]}\t` +
          `${o.techs[0]}\t${o.techs[1]}\t${o.ladder[0]}\t${o.ladder[1]}\t` +
          `${o.victory ?? '-'}\t${o.sacks[0]}\t${o.sacks[1]}\t${o.map}\t` +
          `${o.roadTiles}\t${o.joined[0].toFixed(2)}\t${o.joined[1].toFixed(2)}\t` +
          `${o.links[0]}\t${o.links[1]}\t${o.routeGold[0]}\t${o.routeGold[1]}`,
      ),
    )
    .join('\n');
}
