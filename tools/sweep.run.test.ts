import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { SABOTAGE } from '../src/sim/sabotage';
import { HIVE_WORKS } from '../src/sim/hivekin';

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

  /** The shipped game, untouched. Both arms below are read against this. */
  const shipped = (): Arm => ({
    label: 'shipped',
    apply: () => {
      control();
      HIVE_WORKS.enabled = true;
      SABOTAGE.enabled = true;
    },
  });

  /**
   * The Hive as it was before #144: its ten buildings taken back out of the
   * advances that offer them.
   *
   * Done by editing the tech entries rather than the buildings, because a
   * building nobody can reach is a building nobody builds, and it leaves the
   * definitions alone for the arm that follows.
   */
  /*
   * **The sabotage arm was dropped once and is back, which is the point.**
   *
   * It is measurable now: the probe reports 0.25 sabotage attempted and 0.21
   * works wrecked a game, where it reported 0.00 of both. What changed was not
   * sabotage but *when espionage exists at all* -- the advance was being
   * learned on turn 182 of 240. See the commit.
   *
   * The original note follows, because it is the better lesson.
   *
   * **What it measured, once it could.** 216 games. Only five seeds in a
   * hundred and eight diverge in their winner at all, and no side moves:
   * Horde 41 v 39 (p = 0.50), Kingdom 33 v 36 (p = 0.375), Hive 34 v 33
   * (p = 1.000), with game length flat (paired t = 0.44). The prediction
   * written before the first attempt was right -- below the noise floor.
   *
   * It is a *real* null rather than the earlier empty one: the probe says
   * 0.25 sabotage attempted and 0.21 works wrecked a game, so the mechanism
   * is on the board. It is simply too rare, as the AI uses it, to move a
   * balance. Making it commoner is a design decision and wants its own run.
   * The smoke run came back byte-identical to `shipped` on every
   * column across eighteen games -- same turns, cities, population, fights,
   * captures -- which means the RNG stream never diverged and sabotage never
   * fired once. The probe then confirmed it: `0.00 sabotage attempted per
   * game` over twenty-four games, and `0.00 sweeps run` with it.
   *
   * So the arm would have spent twenty-five minutes proving a tautology, and
   * a null result with no mechanism behind it is a finding about the
   * instrument and not about balance -- which is the whole of section 125's
   * lesson. The AI's reach for both orders has to be fixed before either can
   * be measured; see the espionage memory.
   */

  const noSabotage = (): Arm => ({
    label: 'no sabotage',
    apply: () => {
      control();
      HIVE_WORKS.enabled = true;
      SABOTAGE.enabled = false;
    },
  });

  return [shipped(), noSabotage()];
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
