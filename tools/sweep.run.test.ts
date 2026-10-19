import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { PERSONALITIES } from '../src/ai/ai';
import { UNSEEN } from '../src/sim/unseen';

/**
 * The town's own eyes, as they ship, read once at module load.
 *
 * Captured rather than written out, so an arm that zeroes them can put the
 * real numbers back without this file holding a second copy that drifts.
 */
const TOWN_EYES = {
  notice: UNSEEN.notice,
  noticeCelebrating: UNSEEN.noticeCelebrating,
  noticePerGuard: UNSEEN.noticePerGuard,
};

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
   * Section 138: the high tier, and the watchful town, asked apart.
   *
   * **Three arms, because the slice is two changes.** One adds an agent
   * nobody can see; the other gives every town a chance to notice a concealed
   * stranger on its own land, which applies to the *low* tier too and
   * therefore moves a game that shipped in section 136. A single arm turning
   * both off could not say which did it, and the two have good reason to pull
   * opposite ways -- one puts more agents on the board, the other kills them.
   *
   * **Predictions, written before the run.**
   *
   * 1. **No winner shift anywhere.** Espionage *entire* did not move winners
   *    (Horde p = 0.11, Kingdom p = 1.00, Hive p = 0.12); one more rung
   *    should not. If any arm clears the bar I should distrust it before I
   *    believe it.
   *
   * 2. **A few more turns, and not significantly.** Espionage entire bought
   *    +15.3 turns (t = 3.81) by resolving the same amount of war more
   *    slowly. The high tier is about one more agent a side and arrives late
   *    -- `nobody-in-particular` is four advances and 160 beakers in, and the
   *    probe has the *first* agent of any kind appearing on turn 89 of ~240.
   *    Predict +2 to +5 turns, not clearing 2σ.
   *
   * 3. **The watchful town is the half more likely to show**, and in the
   *    other direction. It bites from the moment any spy exists rather than
   *    from the fourth spy advance, and what it does is kill agents. So it
   *    should shorten games slightly, and the combined shipped arm should
   *    read **flatter than either half alone**. If the two-arm version of
   *    this sweep had been run it would have come back a null for the wrong
   *    reason.
   *
   * 4. **Kingdom units up again, in the shipped arm.** `Kingdom units` has
   *    moved in all four espionage sweeps (+1.54, +1.20, +1.86) and the cause
   *    is settled: agents against an economy that does not feel their cost.
   *    The probe has the Kingdom building the most agents (3.38 a game
   *    against the Horde's 2.71). Predict +0.5 to +1.0.
   *
   * 5. **The Hive is flat across all three.** 0.46 agents a game in the
   *    probe against 2.71 and 3.38. It barely participates in espionage at
   *    all, which is the late-arrival gap Jeremy has ruled out of scope until
   *    staggered arrival is decided.
   */

  /** The advance that buys the high tier, and nothing else. */
  const HIGH_TECH = 'nobody-in-particular';

  /** The priority lists as they ship, captured before any arm touches them. */
  const asShipped = new Map(
    Object.entries(PERSONALITIES).map(([k, v]) => [k, [...v.techPriority]] as const),
  );

  /**
   * Every knob this sweep moves, set one way or the other in every arm.
   *
   * Section 59, and the reason the lists are rebuilt from the captured
   * original in **both** directions rather than edited in place:
   * `restoreLevers` puts levers back with `Object.assign`, which copies
   * `PERSONALITIES`' top-level keys by reference and would not undo a change
   * made inside one of them.
   *
   * `UNSEEN.enabled` is the master switch for both halves -- `goesUnseen`,
   * `hiddenFrom` and `townNotice` all ask it -- so the "no high tier" arm has
   * to put the towns back on by hand to isolate them. Reading that the wrong
   * way round would have measured the towns in the arm that claims not to
   * have them.
   */
  const highTier = (on: boolean): void => {
    UNSEEN.enabled = true;
    UNSEEN.ai = on;
    // With the units switched off the advance unlocks nothing, so leaving it
    // in the lists would have the control spending 160 beakers on an empty
    // box -- a research-order difference masquerading as the mechanic.
    for (const [name, list] of asShipped) {
      PERSONALITIES[name].techPriority = on
        ? [...list]
        : list.filter((t) => t !== HIGH_TECH);
    }
  };

  /** Whether a town ever notices a concealed stranger by itself. */
  const watchfulTowns = (on: boolean): void => {
    UNSEEN.notice = on ? TOWN_EYES.notice : 0;
    UNSEEN.noticeCelebrating = on ? TOWN_EYES.noticeCelebrating : 0;
    UNSEEN.noticePerGuard = on ? TOWN_EYES.noticePerGuard : 0;
  };

  const arm = (label: string, high: boolean, towns: boolean): Arm => ({
    label,
    apply: () => {
      control();
      highTier(high);
      watchfulTowns(towns);
    },
  });

  return [
    arm('as it ships', true, true),
    arm('no high tier', false, true),
    arm('no watchful towns', true, false),
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
          'arm\tset\tseed\tturns\twinner\tfights\tcaps\torcC\thumC\torcP\thumP\torcT\thumT\torcL\thumL\tvictory\torcSacked\thumSacked\tmap\troadTiles\torcJoined\thumJoined\torcLinks\thumLinks\torcRouteGold\thumRouteGold',
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
