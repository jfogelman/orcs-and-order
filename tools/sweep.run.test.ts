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
import { RUINS } from '../src/sim/ruins';
import { HIVEKIN } from '../src/sim/hivekin';
import { TECHS } from '../src/model/techs';
import type { TechId } from '../src/model/types';
import { endingWorks } from '../src/sim/endings';
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
  // Section 125: what the Hive arrives with, named here rather than left to
  // the harness putting the levers back. The arms below are about the bar they
  // swing at, and an arm that silently depends on a default it does not state
  // is the shape of mistake this file's own rule is against.
  HIVEKIN.founders = 2;
  HIVEKIN.escort = 2;
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
  // Section 123: ruins are a map feature rather than a raider one, so they are
  // on in the quiet game too -- which is the game this baseline measures.
  RUINS.enabled = true;
  RUINS.perLand = 100;
  RUINS.wardenDefence = 1;
  RUINS.aiOdds = 0.25;
  RUINS.aiSeeks = true;
  RUINS.wardensStrike = false;
  RUINS.wardensHold = true;
  RUINS.soldiersOnly = true;
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

const buildArms = (): Arm[] => {
  // Section 125: the road to the Hive's ending.
  //
  // Four measurements said the Hivekin win nothing, and the fourth said why the
  // first three could not have helped: thirty-eight of fifty-four games are
  // decided by somebody finishing an ending, and the Hive had built **no works
  // in any game, ever**. Its road cost 860 beakers over eleven advances at 9.9
  // beakers a turn -- 87 turns of pure research against the Horde's 23 -- in a
  // life of about 140.
  //
  // Repricing it is provably not a lever: their advances per game read 11.8
  // whatever the road costs, so an eleven-advance road is their whole game at
  // any price. The road has to be *short*. Off `caste-soldier` it is 165 over
  // four advances they research anyway, asked for fifth rather than
  // twenty-second, with the works at 180/180/240 rather than 300/300/400.
  // Probed at 4 wins in 12 against zero; this is the 216 that decides it.
  //
  // The long arm restores every part of that at once, because they are one
  // change: a cheap work at the end of a road nobody walks measured as nothing.
  //
  // **Both arms state all four values, and that is not optional here.** The
  // tech table and the building table are not in `LEVERS`, so the harness
  // cannot put them back between arms -- and it cannot see them in its
  // identity check either, so an arm that relied on the default would have
  // silently inherited the other arm's road and the check would have passed on
  // the `techPriority` difference alone. That is section 59 wearing a hat.
  // They are deliberately not added to `LEVERS`: `TECHS` and `TECHS_BY_ID`
  // share their objects, and restoring either one by shallow assign would hand
  // the other a stale set.
  const hiveEnding = (cost: number, prereqs: TechId[], works: number[], at: number) => {
    const road = TECHS.find((t) => t.id === 'all-is-the-hive')!;
    road.cost = cost;
    road.prereqs = prereqs;
    endingWorks('hive').forEach((b, i) => (b.cost = works[i]));
    const list = PERSONALITIES.hivekin.techPriority.filter((t) => t !== 'all-is-the-hive');
    list.splice(at, 0, 'all-is-the-hive');
    PERSONALITIES.hivekin.techPriority = list;
  };
  return [
    {
      label: 'long road',
      apply: () => {
        control();
        hiveEnding(200, ['caste-princess', 'insanity'], [300, 300, 400], 21);
      },
    },
    {
      label: 'short road',
      apply: () => {
        control();
        hiveEnding(100, ['caste-soldier'], [180, 180, 240], 4);
      },
    },
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
