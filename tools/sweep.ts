import { AI_TUNING, runAiTurn } from '../src/ai/ai';
import { ATTRITION } from '../src/model/units';
import { DRAIN, SPLIT } from '../src/sim/abilities';
import { DISORDER, MILITIA, RESETTLE, RUIN, SETTLER, SUPPLY } from '../src/sim/city';
import { FORTIFY_BONUS_REF, XP } from '../src/sim/combat';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { SACKING } from '../src/sim/movement';
import { BEAKERS_PER_TRADE } from '../src/sim/research';
import { SPELL_TURNS } from '../src/sim/status';
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
 * Every constant a sweep is allowed to move, by name.
 *
 * The list is here rather than at each call site so that the identity check
 * below sees the whole surface: an arm that changes something missing from this
 * table would be invisible to it, and the sweep would refuse to run a
 * comparison that is in fact real.
 */
export const LEVERS: Record<string, object> = {
  AI_TUNING,
  ATTRITION,
  BEAKERS_PER_TRADE,
  DISORDER,
  DOMINANCE,
  DRAIN,
  FORTIFY_BONUS_REF,
  MILITIA,
  REGEN,
  RESETTLE,
  RUIN,
  SACKING,
  SCORE_WEIGHTS,
  SETTLER,
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
}

function deepestGroup(types: string[]): number {
  return types.reduce((max, t) => Math.max(max, Number(t.split('_x')[1] ?? 1)), 1);
}

/** Enough to run past the turn limit, so every game reaches a verdict. */
export const HALF_TURNS = 700;

/**
 * One whole game, both sides played by the AI.
 *
 * The single runner. It was private to the balance regression, so every sweep
 * grew its own near-copy, and the near-copies disagreed about things that
 * mattered -- one of them read fights off the tail of a trimmed log and
 * reported none.
 */
export function playGame(seed: number, halfTurns = HALF_TURNS): Outcome {
  const state = createGame({ seed });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);

  const owners = new Map<number, number>();
  let captures = 0;
  // Counted as it happens, for the same reason captures are: `log()` keeps only
  // the last 400 entries, and a game that runs to the turn limit pushes its
  // early fighting straight out of the window. Read off the tail, a seed with
  // thirty-seven fights reports none.
  let combats = 0;
  let readLog = 0;
  const countCombat = () => {
    for (let i = readLog; i < state.log.length; i++) {
      if (state.log[i].kind === 'combat') combats++;
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
  for (let i = 0; i < halfTurns && state.winner === null; i++) {
    const before = state.log.length;
    // The window slid if the log was trimmed while the turn ran; start again
    // from whatever is still there rather than from an index that has moved.
    if (before < readLog) readLog = 0;
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
    countCombat();
    sweepOwners();
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
export const TUNED = seedSet('tuned', [1, 1_000_003, 2_000_011]);
export const HELD_OUT = seedSet('held-out', [7_654_321, 8_000_011, 9_000_017]);

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
        say(
          `  ${arm.label} / ${set.name}: ${outcomes.length} games in ` +
            `${((Date.now() - at) / 1000 / 60).toFixed(1)} min`,
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

export interface Summary {
  arm: string;
  set: string;
  games: number;
  orcWins: number;
  humanWins: number;
  draws: number;
  turns: number;
  cities: [number, number];
  population: [number, number];
  techs: [number, number];
  combats: number;
  captures: number;
}

export function summarise(results: ArmResult[]): Summary[] {
  return results.map((r) => ({
    arm: r.arm,
    set: r.set,
    games: r.outcomes.length,
    orcWins: r.outcomes.filter((o) => o.winner === 0).length,
    humanWins: r.outcomes.filter((o) => o.winner === 1).length,
    draws: r.outcomes.filter((o) => o.winner === null).length,
    turns: mean(r.outcomes.map((o) => o.turns)),
    cities: [mean(r.outcomes.map((o) => o.cities[0])), mean(r.outcomes.map((o) => o.cities[1]))],
    population: [
      mean(r.outcomes.map((o) => o.population[0])),
      mean(r.outcomes.map((o) => o.population[1])),
    ],
    techs: [mean(r.outcomes.map((o) => o.techs[0])), mean(r.outcomes.map((o) => o.techs[1]))],
    combats: mean(r.outcomes.map((o) => o.combats)),
    captures: mean(r.outcomes.map((o) => o.captures)),
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
    `${pad('draw', 5)}${pad('turns', 7)}${pad('cities', 14)}${pad('pop', 14)}${pad('techs', 13)}` +
    `${pad('fights', 8)}${pad('caps', 6)}`;
  const body = rows.map(
    (r) =>
      r.arm.padEnd(18) +
      r.set.padEnd(10) +
      pad(r.games, 6) +
      pad(r.orcWins, 5) +
      pad(r.humanWins, 5) +
      pad(r.draws, 5) +
      pad(r.turns.toFixed(0), 7) +
      pad(`${r.cities[0].toFixed(2)}/${r.cities[1].toFixed(2)}`, 14) +
      pad(`${r.population[0].toFixed(1)}/${r.population[1].toFixed(1)}`, 14) +
      pad(`${r.techs[0].toFixed(1)}/${r.techs[1].toFixed(1)}`, 13) +
      pad(r.combats.toFixed(0), 8) +
      pad(r.captures.toFixed(1), 6),
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
          `${o.techs[0]}\t${o.techs[1]}\t${o.ladder[0]}\t${o.ladder[1]}`,
      ),
    )
    .join('\n');
}
