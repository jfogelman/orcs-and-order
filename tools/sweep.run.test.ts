import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { AI_TUNING } from '../src/ai/ai';
import { CALM, POSTING } from '../src/sim/city';
import { TRADE } from '../src/sim/trade';
import { SPECIALS } from '../src/model/terrain';
import type { Arm } from './sweep';
import { NEW_GAME, rawRows, report, runSweep, seedSet } from './sweep';

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
const control = () => {
  CALM.base = 6;
  AI_TUNING.calmBuildAhead = 1;
  AI_TUNING.calmRateAtLimit = 1;
  AI_TUNING.buildRoads = true;
  AI_TUNING.citiesPerRoadWorker = 4;
  AI_TUNING.guardTheGold = true;
  POSTING.enabled = true;
  SPECIALS.chance = 0.06;
  SPECIALS.rules = true;
  SPECIALS.ruleTiles = true;
  TRADE.enabled = true;
  NEW_GAME.barbarians = false;
};

const ARMS: Arm[] = [
  // Section 106, asked properly at last. Trade routes were measured once before
  // and moved nothing, for a reason that had nothing to do with them: the AI's
  // treasuries stood unguarded, so almost no link had two paying ends. Section
  // 108 fixed that, and 96 games in 108 now end with a route that pays -- so
  // this is the first time the question has been worth asking.
  //
  // The arm without should reproduce section 108's shipped numbers, 31-23 and
  // 32-22, since the gold is the only thing switched off.
  {
    label: 'no trade routes',
    apply: () => {
      control();
      TRADE.enabled = false;
    },
  },
  { label: 'trade routes', apply: control },
];

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
    Math.max(600_000, ARMS.length * SETS.length * PER_BASE * 3 * 15_000),
  );
});
