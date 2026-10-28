import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { DISPERSAL } from '../src/sim/dispersal';
import { NEW_GAME } from './sweep';

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
   * Section 153: **does the Unbound's rule do anything?**
   *
   * Everything about this faction is a first answer. `UNBOUND_PLAN.md` left
   * three numbers open and section 152 filled them in by argument --
   * `DISPERSAL.failBase` at a third, the Archon at 72, the Naiad's waterside
   * share at 0.4 -- and nothing has ever been measured. This is the first
   * question to ask of it, and it is deliberately not *"is 0.35 the right
   * failure rate"*: a sweep that tunes a number before establishing that the
   * mechanic matters at all is a sweep measuring noise.
   *
   * ## Three arms, because there are two different claims
   *
   * - **`as it ships`** -- the game as section 152 left it.
   * - **`no dispersal`** -- `DISPERSAL.enabled` off. An Unbound unit dies like
   *   anybody else's, which makes the faction **exactly its stat line** -- and
   *   its stat line is deliberately nobody's own, the named equivalent's
   *   unchanged. So this arm is the sharpest possible control: if it comes
   *   back level, the faction's whole identity is costing nothing.
   * - **`always gathers`** -- `failBase` and `failFloor` at zero, so a spirit
   *   with a site always comes back. The upper bound, which brackets the
   *   mechanic rather than tuning it: off, as-shipped, and certain. If the
   *   top of that range does not move a game, no value of `failBase` in
   *   between is going to.
   *
   * ## The arm that was dropped, and why it is worth writing down
   *
   * The first draft's third arm was **`no want`** -- `DISPERSAL.ai` off, the
   * game as it was for the first twelve games section 152 played, where the
   * AI never builds a Retrieval Circle. A smoke run returned it
   * **byte-identical to `no dispersal`** in every column.
   *
   * That is correct and is the design stated as a number: with no site
   * anywhere, `scatter` has nowhere to send a spirit and removes it, so
   * *dispersal with no infrastructure is exactly dying*. The identity check
   * passed because the two arms move different levers; it cannot see that
   * they produce the same game. **Two arms can differ in their settings and
   * not in their games**, which is section 59's trap one level further in,
   * and the only thing that catches it is reading a cheap run before paying
   * for an expensive one.
   *
   * `GUEST_LIST` is deliberately **not** an arm. Section 152's probe built
   * 0.8 ending works of three across twelve games and threw no Spirit Party
   * at all, so an arm that switched the conversion off would differ from the
   * control in approximately zero games. Measuring it wants the ending road
   * shortened first, which is a change rather than a lever.
   *
   * ## The Unbound play themselves, from turn one
   *
   * `NEW_GAME.playerFaction` is set in every arm, which makes it part of the
   * control rather than a confound. The default game seats them **fourth**,
   * arriving around turn 80 onto a map three empires have been settling since
   * the start -- section 153's probe has them finishing with no cities at all
   * in some seeds. A mechanic cannot be measured on a side that is not in the
   * game, which is the lesson section 136 learned about espionage arriving in
   * the last fifth of a game and measuring zero three slices running.
   *
   * It is a seating change, so it moves the map. That is fine **because every
   * arm has it** -- the thing section 94 warns about is an arm that changes
   * worldgen against one that does not, and the identity check below reads
   * `NEW_GAME`, so a mistake here is a refusal rather than a wrong answer.
   */
  /** As shipped, read once, so an arm can put the real numbers back. */
  const SHIPPED = { failBase: DISPERSAL.failBase, failFloor: DISPERSAL.failFloor };

  const arm = (label: string, enabled: boolean, certain: boolean): Arm => ({
    label,
    apply: () => {
      control();
      // Seat 0, so the faction is in the game it is being measured in.
      NEW_GAME.playerFaction = 'unbound';
      DISPERSAL.enabled = enabled;
      DISPERSAL.failBase = certain ? 0 : SHIPPED.failBase;
      DISPERSAL.failFloor = certain ? 0 : SHIPPED.failFloor;
    },
  });

  return [
    arm('as it ships', true, false),
    arm('no dispersal', false, false),
    arm('always gathers', true, true),
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
