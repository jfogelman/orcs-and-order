import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { HIVE_ENDING } from '../src/sim/hivekin';

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
   * Section 161: **the Hive wins more than anybody and only ever one way.**
   *
   * Of 108 games of the shipped arm: Hivekin 40, Kingdom 33, Horde 16,
   * Wandering Folk 3, Unbound 3, 13 unfinished. Five sides, so an even share
   * is about 20. Every one of the 40 is their own ending -- not one win by
   * conquest, dominance or points, in any arm -- and they finish it on turn
   * **193** against 270 for the Mysterious Object and 283 for the Portal.
   *
   * It is not a small side punching up. It is two games wearing one average:
   *
   * | | games | cities | pop | units | wins |
   * |---|---|---|---|---|---|
   * | it established | 52 | 5.92 | 40.1 | 29.7 | **40 (77%)** |
   * | it did not | 56 | 1.15 | 9.6 | 2.9 | **0** |
   *
   * Nothing drifted to get here. Section 125 gave them the shortest road to
   * an ending in the game and the cheapest ending, on purpose, because before
   * that they could not win at all -- and tuned it to 4 wins in 12, which in
   * a *three-sided* game was exactly even. Sections 142 and 152 then added
   * two more sides and nobody re-asked. Jeremy: *"hivekin shouldn't just be
   * the default winners, definitely not."*
   *
   * ## What the arms actually charge, which is not what they are named
   *
   * `buildings.ts` prices the three works at 180/180/240. **The Hive has not
   * paid that since section 153.** Section 136 made the price a lerp on how
   * early they arrive, anchored at turn `HIVEKIN.from` (90); section 153
   * replaced the single turn-90 arrival with one gap per slot, so on Normal
   * they land in turns 20-60 and pay **735-915**. Turn ninety is no longer
   * reachable at any level, so six hundred is a price the game cannot charge
   * and the control arm is not "six hundred".
   *
   * | arm | `works` | base | **effective, turns 20-60** |
   * |---|---|---|---|
   * | `as shipped` | 1 | 600 | **735-915** |
   * | `half again` | 4/3 | 800 | **980-1220** |
   * | `double-ish` | 5/3 | 1000 | **1225-1525** |
   *
   * For scale, the other four endings are flat: Portal, Caravan and Party at
   * 1000, the Mysterious Object at 1200.
   *
   * ## What would count
   *
   * The win column is the point here, which is unusual -- `attribution-
   * needs-the-same-bar` normally forbids reading rare-event counts, but 40 of
   * 108 is not a rare event and the three arms are a monotone ladder, so a
   * monotone fall across both seed sets is the thing to look for. The column
   * that should move with it is **the turn the Hive's ending lands**: if the
   * price bites, 193 moves toward the 270-283 the empires take, and the
   * ending race becomes a race.
   *
   * The failure mode to watch for is the lever being a cliff rather than a
   * slope -- section 125 found exactly that when it repriced the *road*
   * (860, 710 and 610 beakers all gave zero wins). If `half again` and
   * `double-ish` both give roughly nothing, the answer is "somewhere under
   * 800" and the next sweep is a narrower ladder, not a wider one.
   */
  const hive = (label: string, works: number): Arm => ({
    label,
    apply: () => {
      control();
      HIVE_ENDING.works = works;
    },
  });

  return [hive('as shipped', 1), hive('half again', 4 / 3), hive('double-ish', 5 / 3)];
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
