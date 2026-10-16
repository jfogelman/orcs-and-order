import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { PERSONALITIES } from '../src/ai/ai';

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
   * Two unmeasured changes, each against the shipped game.
   *
   * They are asked in one run rather than two because each is a separate arm
   * against a common control, which is the only safe way to pair anything: a
   * single arm moving both levers could not say which one did it.
   *
   * **Predictions, written before the run.**
   *
   * *The Hive's ten buildings* (#144). Before them the Hivekin had two
   * ordinary buildings against ten apiece -- no happiness, no science, no
   * gold, no supply, no veterancy -- so this is the larger of the two changes
   * by a distance. I expect **the Hive clearly better off with them**: more
   * cities held, more advances, and a visible share of the wins where it had
   * almost none. If this arm shows *nothing*, the likeliest explanation is not
   * that twelve buildings are worth nothing but that the Hive never lives long
   * enough to build them, which would be a finding about the arrival and not
   * about the buildings.
   *
   * *Sabotage* (#148). Small. One agent a side, a handful of attempts a game,
   * and the AI only wrecks ending works. I expect **no measurable difference
   * in winners**, and if anything a slightly longer game where an ending gets
   * set back. The honest prior is that this is below the noise floor at 108
   * games a set, and the probe counters are what will say whether it happened
   * at all -- a null result with zero attempts behind it is a finding about
   * the instrument, exactly as section 125's was.
   */

  /**
   * **What it measured, 2026-10-15.** 216 games, 40 minutes.
   *
   *     shipped                Horde 45 (41.7%)  Kingdom 34 (31.5%)  Hive 29 (26.9%)
   *     hive without its ten   Horde 46 (42.6%)  Kingdom 42 (38.9%)  Hive 20 (18.5%)
   *
   * Paired by seed, McNemar: 12 discordant pairs the Hive's way against 3 the
   * other, **exact two-sided p = 0.035**. Both sets agree in direction (tuned
   * 10 v 7, held-out 19 v 13). The *unpaired* comparison of the same numbers
   * gives z = 1.46, p = 0.14 and says nothing -- the pairing is what makes it
   * readable, which is why the rule about McNemar is written down.
   *
   * The ten did **not** make the Hive over-strong: at 26.9% of a three-way
   * game it is still the weakest of the three, and the nine wins came out of
   * the *Kingdom's* share rather than the Horde's, which did not move.
   *
   * The prediction below was half right, and the half it got wrong is worth
   * keeping: "a visible share of the wins where it had almost none" -- the
   * Hive already won 18.5% with no happiness, science, gold, supply or
   * veterancy building at all. The prior that it was crippled was overstated.
   */

  /**
   * **Predictions for the research-order arm, written before the run.**
   *
   * All three sides get the advance equally, so there is no reason for one to
   * gain over another and I expect **no significant shift in winners**. The
   * interesting columns are the other ones: sixty beakers and two
   * thirty-shield units that cannot fight are diverted from armies and
   * economy about a hundred turns earlier than before, so if anything moves I
   * expect **slightly fewer fights and slightly fewer units**, paid by
   * everybody at once.
   *
   * The honest worry is the opposite of a balance worry: that espionage
   * arriving a hundred turns earlier costs every side a little and buys them
   * something the AI is not good enough to use. The probe says the AI does use
   * it -- 8.4 readings and 388 sweeps a game -- but using a thing is not the
   * same as profiting by it, and this arm is the only way to tell.
   *
   * If winners *do* move, the first place to look is the Hive: it is the side
   * with the fewest cities and so the one for which thirty shields is the
   * largest share of a turn's production.
   */

  /**
   * **What it measured, 2026-10-16.** 216 games, 64 minutes.
   *
   *     asked for             Horde 41  Kingdom 33  Hive 34
   *     left to the fallback  Horde 44  Kingdom 33  Hive 31
   *
   * Paired McNemar: Horde p = 0.711, Kingdom p = 1.000, Hive p = 0.678.
   * **No side gains**, and the prediction below was right about that. Fights
   * (t = -0.13), captures (t = -0.89), turns (t = +0.87) and cities are all
   * flat: moving espionage a hundred turns earlier does not change the
   * character of the game either.
   *
   * **It is not a no-op, though: 37 of 108 seeds changed winner.** It reshapes
   * individual games thoroughly and favours nobody, which is worth knowing
   * mostly because it means a single game is no evidence about this change.
   *
   * One column moved and the prediction had the sign wrong: **Kingdom units
   * +1.54 (t = +4.14)**, where I expected fewer from shields diverted to units
   * that cannot fight. The likeliest reading is dull -- the probe measures
   * about 1.6 agents alive a side and this column counts units, so the
   * Kingdom is largely "gaining" the agents it now builds. But this file has
   * no spy breakdown and cannot separate that from a real change in army
   * size, and the Horde's +0.20 does not fit that story neatly. What it can
   * say is that whatever it is never reached the fighting.
   */

  /** The lists as they ship, captured before any arm has touched them. */
  const asShipped = new Map(
    Object.entries(PERSONALITIES).map(([k, v]) => [k, [...v.techPriority]] as const),
  );
  const SPY_TECH = 'someone-elses-business';

  /**
   * Put the advance into every priority list, or take it out of all of them.
   *
   * Set explicitly in **both** arms off the captured original, never by
   * editing in place: `restoreLevers` puts levers back with `Object.assign`,
   * which copies `PERSONALITIES`' top-level keys by reference and so would not
   * undo a change made inside one of them. Section 59, the same trap the Hive
   * arm fell into.
   */
  const askForIt = (on: boolean): void => {
    for (const [name, list] of asShipped) {
      PERSONALITIES[name].techPriority = on ? [...list] : list.filter((t) => t !== SPY_TECH);
    }
  };

  /** The shipped game: the advance is asked for, after the economy run. */
  const shipped = (): Arm => ({
    label: 'asked for',
    apply: () => {
      control();
      askForIt(true);
    },
  });

  /**
   * The game as it was before: in nobody's list, so the AI reaches it only
   * when the cheapest-thing fallback finds it -- measured at turn 182 of ~240,
   * and never at all in five games of twenty-four.
   */
  const fallbackOnly = (): Arm => ({
    label: 'left to the fallback',
    apply: () => {
      control();
      askForIt(false);
    },
  });

  return [shipped(), fallbackOnly()];
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
