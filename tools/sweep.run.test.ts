import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { PERSONALITIES } from '../src/ai/ai';
import { SPY } from '../src/sim/spying';
import { DISGUISE } from '../src/sim/disguise';
import { SABOTAGE } from '../src/sim/sabotage';
import { TURNING } from '../src/sim/turning';
import { GOSSIP } from '../src/sim/gossip';
import { INCITE } from '../src/sim/unrest';

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
   * **What is the whole of espionage worth?**
   *
   * Eight rungs have landed one at a time, and every measurement so far has
   * asked about *one* of them against a game that already had the others. This
   * asks the question nobody has: take the lot away and see what changes.
   *
   * **The "away" arm takes the research with it, on purpose.** Switching the
   * levers off alone would leave the AI still working through four espionage
   * advances worth about 375 beakers that now do nothing at all -- which would
   * make the arm look worse for a reason that has nothing to do with
   * espionage. The counterfactual being tested is *a game where this feature
   * was never built*, and in that game nobody researches it either. Several
   * knobs move together because they are one feature; both arms set every one
   * of them explicitly, which is section 59.
   *
   * **Predictions, before the run.** Every side gets espionage equally, so I
   * expect **no winner shift** -- that has been the answer for turning, for
   * sabotage and for the research order, and nothing here is more one-sided
   * than those were. What I expect to see is the *character* columns: the
   * feature costs beakers and shields and buys information, so if anything
   * moves it should be advances and units rather than wins.
   *
   * **The one thing I am actively watching for: Kingdom units.** It has moved
   * in both espionage sweeps so far (+1.54, then +1.20), and I have no
   * explanation that covers both. If it moves a third time, that is three
   * sightings and worth chasing properly rather than noting again.
   */

  /**
   * **What it measured, 2026-10-16.** 216 games.
   *
   *     with espionage       Horde 32  Kingdom 34  Hive 42
   *     no espionage at all  Horde 42  Kingdom 33  Hive 33
   *
   * **No winner shift** at the bar: Horde p = 0.11, Kingdom p = 1.00, Hive
   * p = 0.12. The prediction was right. Both trends have both seed sets
   * agreeing in direction, which is half of the believe-it test, and the
   * second half failed -- see below.
   *
   * **Games run 15.3 turns longer (t = 3.81)**, and twice as many reach the
   * limit: 22 of 108 against 9. Fights (t = -0.29) and captures (t = -0.21)
   * are flat, so it is the same amount of war resolving more slowly.
   * **Jeremy's call: that is wanted, not a cost** -- the game "was honestly a
   * little fast from a player perspective at times."
   *
   * **A mechanism tested and disproved.** The obvious story was that longer
   * games favour the late-arriving Hive. Games are longer; but *within each
   * arm* the Hive does not win later than anybody else (t = -0.92 and +0.13),
   * so the chain breaks. It would have been an easy thing to assert.
   *
   * **The Kingdom-units question, closed.** +1.86 here (t = +5.09), after
   * +1.54 and +1.20. It is **not** turning: `boughtFrom` counts soldiers that
   * changed hands and 0.04 a game survive to the end. It is the agents
   * themselves plus an economy that does not feel their cost -- the Kingdom
   * ends with 2.67 agents, 35.5 units and 778 gold against the Horde's 2.00,
   * 31.3 and 155, so the same sixty shields costs it proportionally less. The
   * Horde pays for two agents with about 1.8 real units; the Kingdom with 0.8.
   *
   * **Found while looking for something else:** the Hive ends with **0.38
   * agents** against 2.00 and 2.67, on the same `aiWants` of 2. Jeremy has
   * ruled the late-arrival gap out of scope for now -- staggered arrival by
   * difficulty is coming, and the adjustment belongs in that decision.
   */

  const SPY_TECHS = [
    'someone-elses-business',
    'asking-around',
    'everyone-has-a-price',
    'a-word-in-the-wrong-ear',
  ];

  /** The priority lists as they ship, captured before any arm touches them. */
  const asShipped = new Map(
    Object.entries(PERSONALITIES).map(([k, v]) => [k, [...v.techPriority]] as const),
  );

  /**
   * Every espionage knob, set one way or the other.
   *
   * Set from the captured original in **both** arms rather than edited in
   * place: `restoreLevers` puts levers back with `Object.assign`, which copies
   * `PERSONALITIES`' top-level keys by reference and would not undo a change
   * made inside one of them.
   */
  const espionage = (on: boolean): void => {
    SPY.enabled = on;
    SPY.ai = on;
    SABOTAGE.enabled = on;
    SABOTAGE.ai = on;
    TURNING.enabled = on;
    TURNING.ai = on;
    GOSSIP.enabled = on;
    GOSSIP.ai = on;
    INCITE.enabled = on;
    INCITE.ai = on;
    DISGUISE.enabled = on;
    for (const [name, list] of asShipped) {
      PERSONALITIES[name].techPriority = on
        ? [...list]
        : list.filter((t) => !SPY_TECHS.includes(t));
    }
  };

  const shipped = (): Arm => ({
    label: 'with espionage',
    apply: () => {
      control();
      espionage(true);
    },
  });

  const without = (): Arm => ({
    label: 'no espionage at all',
    apply: () => {
      control();
      espionage(false);
    },
  });

  return [shipped(), without()];
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
