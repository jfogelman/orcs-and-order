import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { ARRIVALS } from '../src/sim/arrivals';

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
   * **Answered: yes, and it mattered more than which faction you are.**
   * Shipped as `latecomers`; the table and the reasoning are in section 160.
   * Mean cities by the slot a side drew, every faction in every slot:
   * Kingdom 7.37 / 6.00 / 3.76 / 2.77, Wandering Folk 7.50 / 5.30 / 3.82 /
   * 2.81, Unbound 5.96 / 4.50 / 3.23 / 2.35 -- and **Hivekin 3.78 / 3.09 /
   * 3.94 / 2.72**, the one side with no gradient at all, which is the side
   * the unchosen order had been handing the best slot to.
   *
   * `all` is not shipped: it leaves 36 of 108 games unfinished at the turn
   * limit against 13, because it seats the Hive beside the player a quarter
   * of the time and nobody is then strong enough to close the game out.
   *
   * Left here as the worked example of three arms earning their cost. Two
   * would have bundled "arrival order" with "who your neighbour is" and the
   * answer differs between them: the queue is worth most of the gain, the
   * turn-one slot is worth the rest and costs the game its ending.
   *
   * ---
   *
   * Section 160: **does it matter that nobody chose the arrival order?**
   *
   * Section 159 went looking for why the two late factions are weak and found
   * this instead: `opponentsOf` returned the faction table's own declaration
   * order, never shuffled, and `arrivalTurnFor` is `(n + 1) * gap`. So on
   * Normal the Hive has always arrived about turn 20, the Wandering Folk
   * about turn 40 and the Unbound about turn 60 -- **in every game this
   * project has ever measured** -- and the Kingdom has always been the Orc
   * player's turn-one neighbour. The Hive is first because it was the first
   * latecomer there was (section 125) and the Unbound last because they were
   * written last (section 152). Nobody picked any of it.
   *
   * It also explains two numbers that have been sitting unexplained: section
   * 156's *"the Unbound arrive last, 4.5 cities"* -- they arrive last
   * **always** -- and section 157's *"dead by about turn fifty"*, against a
   * due turn of forty.
   *
   * ## Three arms, because "the order" is two rules wearing one name
   *
   * - **`table order`** -- the control, and every measurement to date.
   * - **`shuffle queue`** -- slot 0 keeps its occupant, so the turn-one
   *   neighbour is unchanged and only the arrival queue behind it is drawn.
   *   Isolates **arrival order** on its own.
   * - **`shuffle all`** -- slot 0 is drawn too, so *who starts beside you*
   *   stops being a fact about the table as well.
   *
   * The pair is what makes this worth three arms. If the queue moves nothing
   * and `shuffle all` moves a lot, the finding is about **the turn-one slot**
   * and not about arrival order at all -- and the fix would be a different
   * one line. Two arms would have blamed whichever rule they happened to
   * bundle.
   *
   * ## What would count
   *
   * A shuffle gives each latecomer each slot about a third of the time, so
   * what moves is each faction's average **over** slots. If being third is
   * what ails the Wandering Folk, their columns rise here; if they are simply
   * a weak faction, the shuffle redistributes and nothing moves except the
   * Hive, which loses its guaranteed head start. Either answer is useful and
   * the second one closes the question.
   *
   * `sweep-noise-at-108-games` still applies: believe it when both seed sets
   * agree and a second column moves with the first.
   */
  const arm = (label: string, shuffle: typeof ARRIVALS.shuffle): Arm => ({
    label,
    apply: () => {
      control();
      ARRIVALS.shuffle = shuffle;
    },
  });

  return [arm('table order', 'none'), arm('shuffle queue', 'latecomers'), arm('shuffle all', 'all')];
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
