import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { HIVEKIN } from '../src/sim/hivekin';

/**
 * The question this sweep is currently asking.
 *
 * **Edit `ARMS` and run `npm run sweep`.** This file is the question; `sweep.ts`
 * is the machinery, and there is no reason to touch it. It does not run with
 * the ordinary suite -- it plays hundreds of whole games -- so it lives behind
 * its own config.
 *
 * The rules that are not negotiable, and that `runSweep` enforces:
 *
 * - **At least two arms, and they must really differ.** Emulate a control by
 *   moving a constant, never by stashing the source: `git stash push --
 *   <paths>` rejects the entire pathspec when any one path is untracked, so a
 *   control arm that stashes `src/` next to a new file stashes nothing and runs
 *   the new code twice. Section 59.
 * - **Two seed sets.** One to tune against, one to decide with. Section 19's
 *   numbers reversed between them.
 *
 * The arms below are whatever is being asked right now. Replace them.
 */

// Declared rather than pulled in via @types/node, matching the balance suite.
declare const process: { env: Record<string, string | undefined> };

/**
 * Every arm sets **every** knob, including the ones it is not changing.
 *
 * An arm that only sets what it moves inherits whatever the previous arm left
 * behind, which is a different bug from section 59's and the same kind of wrong
 * answer.
 */
// The shipped game lives in `control.ts` now, so the probes can play it too.
// See the note at the top of that file: they were not, and it showed.

const buildArms = (): Arm[] => {
  /**
   * Section 159: **does the escort budget fix the Wandering Folk, and what
   * does it cost the Hive?**
   *
   * ## Answered: no, and more than it is worth
   *
   * 324 games, 82.2 minutes. **40 is indistinguishable from the old rule on
   * every column of every faction in both seed sets.** At 90 the Wandering
   * Folk end smaller on cities, population, units and recruiting -- both sets
   * agreeing -- and the Hive ends larger on all four, because a fixed shields
   * budget buys the most of the cheapest starter and the cheapest belongs to
   * the side that already wins most. `escortShields` ships at 40: the value
   * that retires the hand-maintained list without moving the balance.
   *
   * `tools/escortprobe.run.test.ts` then asked *why* and found it is not
   * death: tripling the escort left the same five survivors in eighteen,
   * dying on turn 69 against 63. The arrival package is not what ails them.
   *
   * These arms are kept as run, for the next person who wants to re-measure
   * the same three points. The finding is section 159.
   *
   * Section 156 measured the Wandering Folk at 0 wins of 324. Section 157's
   * probe found they die in thirteen games of eighteen without building a
   * single unit, and that neither of the two hypotheses on offer -- too little
   * gold, too little Recruit -- survives contact with the counters. What
   * changed is that a latecomer's escort is a **shields budget** rather than
   * a count of whatever its own starter happens to be.
   *
   * ## The thing to be careful about
   *
   * Section 157's first draft claimed the Hive arrives behind a 3/2/12 and the
   * Wandering Folk behind a 1/1/10. **That was a misreading**: both arrive
   * behind a 1/1/10, and the Hive's is *cheaper* (10 shields against 13). So
   * the budget gives the Hive **more** escort than the Wandering Folk, and the
   * Hive already wins two games in five.
   *
   * | side | starter | cost | at 26s | at 40s | at 90s |
   * |---|---|---|---|---|---|
   * | Hivekin | Fodder | 10 | 2 | 4 | **9** |
   * | Wandering Folk | Skirmisher | 13 | 2 | 3 | 6 |
   * | Unbound | Revenant | 20 | 1 | 2 | 4 |
   *
   * This sweep exists because that table is an argument and not a result.
   *
   * ## Three arms, and the control is the old rule
   *
   * - **`old count`** -- `escortShields` low enough that everybody gets what
   *   the fixed count gave them. The game as section 156 measured it, which
   *   is what makes the comparison a comparison.
   * - **`40 shields`** -- the middle. Lifts the weak sides without tripling
   *   anybody.
   * - **`90 shields`** -- what ships, and Jeremy's pick.
   *
   * Three points rather than two because the question is **shape**: if the
   * Wandering Folk come up between 26 and 40 and the Hive runs away between
   * 40 and 90, the answer is 40 and neither two-arm sweep would have found it.
   *
   * ## The default game, not the Unbound's
   *
   * Section 156's sweep set `NEW_GAME.playerFaction = 'unbound'` to measure a
   * mechanic on a side that would otherwise barely be in the game. This one
   * does **not**: arrival packages are about the whole roster, and the
   * question is which sides win the shipped default. Putting a thumb on the
   * seating would be measuring a different game than the one being asked
   * about.
   */
  const arm = (label: string, shields: number): Arm => ({
    label,
    apply: () => {
      control();
      HIVEKIN.escortShields = shields;
    },
  });

  return [
    // 26 is the lowest budget that still buys the Hive its old two Fodder
    // (26/10 = 2) and the Wandering Folk their old two Skirmishers (26/13 = 2).
    // The Unbound drop to one Revenant against their old two, which is the one
    // place this control is not quite the old game -- there is no budget that
    // reproduces a count for three different prices, and that is the point.
    arm('old count', 26),
    arm('40 shields', 40),
    arm('90 shields', 90),
  ];
};

const ARMS: Arm[] = buildArms();


/**
 * Eighteen seeds a base is the full run. Set SWEEP_PER_BASE=1 to check the
 * plumbing of a new set of arms in a minute rather than finding out half an
 * hour in that one of them throws.
 */
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 18);

/** Where each run is kept, so one sweep can be read against another. */
const OUT = 'sweep-results';

const SETS = [
  seedSet('tuned', [1, 1_000_003, 2_000_011], PER_BASE),
  seedSet('held-out', [7_654_321, 8_000_011, 9_000_017], PER_BASE),
];

describe('sweep', () => {
  it(
    'measures the arms in tools/sweep.run.test.ts',
    () => {
      const lines: string[] = [];
      const results = runSweep({
        arms: ARMS,
        sets: SETS,
        say: (line) => {
          lines.push(line);
          console.log(line);
        },
      });
      const table = report(results);
      console.log('\n' + table + '\n');

      // Kept as well as printed, because the comparison that matters is usually
      // against the sweep you ran last week and no longer have on screen.
      if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
      const file = join(OUT, `${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      writeFileSync(
        file,
        [
          `arms: ${ARMS.map((a) => a.label).join(' vs ')}`,
          `seeds per base: ${PER_BASE}`,
          '',
          ...lines,
          '',
          table,
          '',
          'seed by seed:',
          // **No hand-written header.** `rawRows` emits its own, built from
          // the same list it builds the rows from, so the two cannot drift.
          // The one that used to live here had drifted: it said `orcL/humL`
          // for a column pair that is the deepest counting-group reached, and
          // section 138 wrote a prediction against "Kingdom units" on the
          // strength of it. There was no units column at all.
          rawRows(results),
          '',
        ].join('\n'),
        'utf8',
      );
      console.log(`Written to ${file}`);
    },
    // Generous, and scaled: an explicit timeout overrides the config entirely,
    // so a fixed one silently caps how many seeds can ever be run.
    //
    // Twenty-five seconds a game, up from fifteen. Section 125's fight-bar
    // sweep took 15.7s a game over 216 games -- 56.6 minutes against a budget
    // of exactly 54 -- so it printed its whole table and *then* failed on the
    // timeout. A third seat makes games longer, and a measurement that has to
    // be read out of a failed test is one somebody will eventually throw away.
    Math.max(600_000, ARMS.length * SETS.length * PER_BASE * 3 * 25_000),
  );
});
