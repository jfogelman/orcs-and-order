import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { TURNING } from '../src/sim/turning';

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
   * **Predictions for the turning arm, written before the run.**
   *
   * This is the busiest rung yet built. The probe says **10.88 offers a game,
   * 5.42 taken and 5.46 refused**, with 678 gold spent -- against sabotage's
   * 0.25 attempts, which measured a clean null. So unlike that one I expect
   * this to *move something*, and the honest uncertainty is which direction.
   *
   * Two forces pull opposite ways and I cannot call it:
   *
   * **For the buyer**: five soldiers a game change hands, each swinging twice
   * (one lost to them, one gained by us), paid for out of a purse the AI
   * otherwise never spends. That should be worth real ground.
   *
   * **Against the buyer**: 5.46 refusals a game are 5.46 *certain* exposures
   * and standing hits, and section 135's slice 4 made the AI read standing
   * when it chooses who to march on. A side that spends the game insulting
   * everybody may simply get attacked more.
   *
   * So: **winners move, by more than sabotage did**, and I will not guess the
   * sign. If the Kingdom gains it is probably the purse -- it banks 55 to 70
   * per cent more gold than the Horde, which is the measured reason
   * `rushBuying` stays off, and the same asymmetry would apply here. That is
   * the first thing to check if this comes back lopsided.
   */

  /**
   * **What it measured, 2026-10-16.** 216 games.
   *
   *     buying allowed  Horde 34  Kingdom 35  Hive 38
   *     no buying       Horde 38  Kingdom 32  Hive 38
   *
   * Horde p = 0.52, Kingdom p = 0.68, Hive p = 1.00. **The prediction below
   * was wrong**: I said winners would move by more than sabotage did, on the
   * strength of 10.88 offers a game against sabotage's 0.25, and they did not
   * move at all. Five soldiers changing hands a game reshuffles 29 seeds in a
   * hundred and eight without tilting any of them.
   *
   * The *other* half of the prediction was right, and is the interesting part.
   * "If the Kingdom gains it is probably the purse" -- and the purse shows up
   * exactly where it should: **Kingdom units +1.20 (t = +3.80)** and Kingdom
   * cities +0.44 (t = +1.73), against the Horde flat and slightly down. The
   * Kingdom banks 55 to 70 per cent more gold, so it buys more soldiers, and
   * turning *transfers* units rather than creating them -- so this is a real
   * net gain and not a counting artefact.
   *
   * It simply never reaches the win column. The side that profits by it is
   * already the side that was going to bank the gold, and gaining a soldier a
   * game is not the same as gaining a game.
   *
   * **Worth noting across two sweeps:** Kingdom units was also the one moving
   * column when espionage arrived a hundred turns earlier (+1.54, t = +4.14).
   * There I guessed it was the agents themselves being counted; here nothing
   * is created, so that explanation cannot carry this one. The common factor
   * is more likely the Kingdom's economy expressing itself wherever espionage
   * becomes more available. Two observations are not a finding -- but a third
   * sweep that moves this column again would be worth chasing properly.
   */

  /** The shipped game: agents may buy somebody else's soldiers. */
  const shipped = (): Arm => ({
    label: 'buying allowed',
    apply: () => {
      control();
      TURNING.enabled = true;
      TURNING.ai = true;
    },
  });

  /** The same game with the purse shut. */
  const noBuying = (): Arm => ({
    label: 'no buying',
    apply: () => {
      control();
      TURNING.enabled = false;
      TURNING.ai = false;
    },
  });

  return [shipped(), noBuying()];
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
