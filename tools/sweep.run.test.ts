import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { AI_TUNING, PERSONALITIES } from '../src/ai/ai';
import { CALM, POSTING } from '../src/sim/city';
import { TRADE } from '../src/sim/trade';
import { PILLAGE } from '../src/sim/roads';
import { POSTS } from '../src/sim/posts';
import { SPECIALS } from '../src/model/terrain';
import { ALT_VICTORY } from '../src/sim/endings';
import type { Arm } from './sweep';
import { GOBLIN_SCOUT } from '../src/model/units';
import { NAVAL } from '../src/ai/naval';
import { INTIMIDATE, LEGION, RAIDER_TIERS } from '../src/sim/wilds';
import { PREY } from '../src/sim/barbarians';
import { PEACE } from '../src/sim/diplomacy';
import { NEW_GAME, rawRows, report, runSweep, seedSet } from './sweep';
import { FOLLIES } from '../src/sim/follyEffects';
import { TERRAFORM } from '../src/sim/terraform';
import { AUTO_TILES } from '../src/sim/city';

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
/** The Horde's research list as it stands, kept so an arm can put it back. */
const HORDE_LIST = [...PERSONALITIES.orc.techPriority];

const control = () => {
  CALM.base = 6;
  PERSONALITIES.orc.targetCities = 5;
  PERSONALITIES.human.targetCities = 6;
  AI_TUNING.calmBuildAhead = 1;
  AI_TUNING.calmRateAtLimit = 1;
  AI_TUNING.buildRoads = true;
  AI_TUNING.citiesPerRoadWorker = 4;
  AI_TUNING.guardTheGold = true;
  POSTING.enabled = false;
  SPECIALS.chance = 0.06;
  SPECIALS.rules = true;
  SPECIALS.ruleTiles = true;
  TRADE.enabled = true;
  PILLAGE.enabled = true;
  AI_TUNING.pillage = true;
  POSTS.enabled = true;
  AI_TUNING.buildPosts = true;
  // Back to the quiet game for section 102: the baseline it has to beat is
  // section 101's Posting table, which was measured without raiders.
  NEW_GAME.barbarians = false;
  NEW_GAME.world = 'continent';
  NEW_GAME.difficulty = 'normal';
  NAVAL.enabled = true;
  NAVAL.overseasExtra = 3;
  NAVAL.crossFor = 1.2;
  NAVAL.beachhead = 1;
  RAIDER_TIERS.enabled = true;
  // Section 120 measured the chieftain's summons on and shipped them on, so a
  // control that left them off would be measuring a game nobody plays.
  RAIDER_TIERS.leader.summons = true;
  // Section 121's bellow, likewise on in the shipped game; the arms move it.
  INTIMIDATE.enabled = true;
  // Section 122: the Sunken Legion, and how often a due wave comes by sea.
  LEGION.enabled = true;
  LEGION.share = 0.2;
  // Section 120: what a band walks at. On in the shipped game; off is the old
  // rule, which is the arm this was measured against.
  PREY.enabled = true;
  PREY.town = 4;
  PREY.works = 3;
  PREY.mob = 3;
  PEACE.enabled = true;
  GOBLIN_SCOUT.enabled = true;
  // Section 110's endings, at their shipping settings -- fifteen turns, not the
  // ten they were first measured at. Left at ten here, every arm since would have
  // been measuring a game nobody plays.
  ALT_VICTORY.enabled = true;
  ALT_VICTORY.portalTurns = 15;
  ALT_VICTORY.objectTurns = 15;
  // Section 111's follies ship too, so the game being measured has them.
  FOLLIES.enabled = true;
  AI_TUNING.sharedFollyFirst = true;
  PERSONALITIES.orc.techPriority = [...HORDE_LIST];
  // Section 112: terraforming ships, so the game being measured has it.
  TERRAFORM.enabled = true;
  // And a city at its content limit stops chasing food, which is what keeps it.
  AUTO_TILES.spareFoodAtLimit = true;
};

const ARMS: Arm[] = [
  // Section 122, second pass. The first measured the Legion as built against no
  // Legion at all and found eight games moving to the Horde -- not because the
  // sea faction is strong, but because a wave that goes to the coast is a wave
  // that did not go inland, and the Kingdom is the more coastal side on these
  // maps. Horde sackings fell 1.45 to 1.20 while the Kingdom's rose 1.10 to
  // 1.30, which is the whole story in one column.
  //
  // So this asks the only question left: how much sea is balance-neutral.
  {
    label: 'wilds only',
    apply: () => {
      control();
      NEW_GAME.barbarians = true;
      LEGION.enabled = false;
    },
  },
  {
    label: 'sea at 0.4',
    apply: () => {
      control();
      NEW_GAME.barbarians = true;
    },
  },
  {
    label: 'sea at 0.2',
    apply: () => {
      control();
      NEW_GAME.barbarians = true;
      LEGION.share = 0.2;
    },
  },
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
