/**
 * The game as it actually ships, as a function every measurement can call.
 *
 * This lived inside `sweep.run.test.ts` as a local `control()`, which meant the
 * sweeps played the shipped game and **the probes did not**. One lever was
 * enough to matter: `RUINS.aiOdds` ships at 0.4 and every sweep since section
 * 123 has measured it at 0.25, so every probe was running a game where all
 * three sides were markedly more cautious about attacking a ruin. Section 125's
 * ladder probe and ladder sweep then disagreed about the sign, which is how it
 * was found.
 *
 * A probe that contradicts a sweep should be a finding about the game, never a
 * finding about which file you ran it from. One definition, imported by both.
 */
import { AI_TUNING, PERSONALITIES } from '../src/ai/ai';
import { CALM, POSTING } from '../src/sim/city';
import { TRADE } from '../src/sim/trade';
import { PILLAGE } from '../src/sim/roads';
import { POSTS } from '../src/sim/posts';
import { SPECIALS } from '../src/model/terrain';
import { ALT_VICTORY } from '../src/sim/endings';
import { GOBLIN_SCOUT } from '../src/model/units';
import { NAVAL } from '../src/ai/naval';
import { INTIMIDATE, LEGION, RAIDER_TIERS } from '../src/sim/wilds';
import { RUINS } from '../src/sim/ruins';
import { HIVEKIN } from '../src/sim/hivekin';
import { PREY } from '../src/sim/barbarians';
import { PEACE, STANDING } from '../src/sim/diplomacy';
import { CONTACT } from '../src/sim/contact';
import { NEGOTIATION } from '../src/model/factions';
import { NEW_GAME } from './sweep';
import { FOLLIES } from '../src/sim/follyEffects';
import { TERRAFORM } from '../src/sim/terraform';
import { AUTO_TILES } from '../src/sim/city';

/** The Horde's research list as it stands, kept so an arm can put it back. */
const HORDE_LIST = [...PERSONALITIES.orc.techPriority];

export const control = () => {
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
  // **0.4, which is what the game ships.** This said 0.25 from the day ruins
  // landed: PR #126 added `aiOdds: 0.4` to `ruins.ts` and `RUINS.aiOdds = 0.25`
  // to the control in the same commit, the 0.25 being a leftover of the arm
  // that *lost*. So every sweep since has measured a game where the AI attacks
  // a thing standing in a doorway at one-in-four odds -- the behaviour section
  // 123 measured as costing the Horde fifteen games and then rejected.
  //
  // Paired comparisons survive it, since both arms had it. Absolute numbers do
  // not: anything quoted from a sweep before 2026-10-05 describes a game
  // nobody plays.
  RUINS.aiOdds = 0.4;
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
  // Section 135: the standing between each pair, and meeting somebody. Pinned
  // here as the shipped game so an arm that is not asking about them inherits
  // them rather than whatever the previous arm left behind.
  STANDING.enabled = true;
  CONTACT.enabled = true;
  // Slice 3b: and the Hive comes to the table, which is the shipped game from
  // here on.
  NEGOTIATION.hivekin = true;
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

