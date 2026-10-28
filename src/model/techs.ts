import type { BuildingId, FactionId, TechId, UnitTypeId } from './types';

/**
 * The tech tree, whose names come from the original design doc.
 *
 * Both factions are discovering the same thing — that more than one soldier
 * can occupy the same patch of ground — and the joke is entirely in how they
 * describe it. The Orcs get there by admitting they are stupid. The Humans get
 * there by forming a committee.
 */

export type TechFlag =
  /** Section 136 slice 8: a spy may set a town talking against its own rulers. */
  | 'incite'
  /** Section 136 slice 7: a spy may ask a town what it thinks of everybody. */
  | 'gossip'
  /** Section 136 slice 6: a spy may offer somebody else's soldier money. */
  | 'turning'
  /** Section 138: the high tier of spies, which nobody else can see at all. */
  | 'unseen'
  /** Removes the movement penalty on groups of five or more. */
  | 'coordination'
  /** +1 sight for every unit. */
  | 'mapmaking'
  /** Forest and swamp cost one movement point instead of two. */
  | 'bridges'
  /** Section 145: a Wandering Folk worker may plant a Caravan where it stands. */
  | 'caravans'
  /** Section 148: word has got round that people stay, so recruits ask less. */
  | 'staying'
  /** Section 148: anybody at all may park a Caravan, not only a worker. */
  | 'anyone-parks'
  /** Section 150: the Mystic learns to send a spirit back rather than scatter it. */
  | 'exorcism'
  /** Section 152: a dispersed spirit is likelier to find its way back. */
  | 'sigil-bound'
  /** Section 152: likelier again, and it stacks with Sigil-Bound. */
  | 'the-ankh'
  /** +1 sight for cities, and cities see through forest. */
  | 'watchtower'
  /** +1 content citizen in every city. */
  | 'contentment'
  /** +25% attack, -25% defence, army-wide. Seemed like a good idea at the time. */
  | 'berserk'
  /** Magical damage sets its target alight for a few turns. */
  | 'pyromancy'
  /** Magical damage leaves its target slow for a few turns. */
  | 'cryomancy'
  /** Ogres may choose a club when they are promoted. */
  | 'clubs'
  /** Sappers may learn to survive one killing blow. */
  | 'volatile'
  /** Knights may learn to withdraw from a fight they did not win. */
  | 'valour'
  /** A lone troll on a swamp may make another troll. */
  | 'swampy'
  /** Death knights may take the health of their own side. */
  | 'bargain'
  /**
   * Leads to one of section 110's endings. Not researchable while the endings are
   * switched off, so an arm without them is the game from before they existed.
   */
  | 'ending'
  /**
   * The one advance section 111's follies needed of their own. Not researchable
   * while the follies are switched off.
   */
  | 'folly'
  /** Workers may irrigate, mine and clear the land. Section 112. */
  | 'terraform'
  /** Workers may irrigate away from water. Section 112. */
  | 'channels'
  /** Section 125: sinking no longer leaves the dirt disturbed. */
  | 'quiet-sinking'
  /** Section 125: a Burrower crosses three tiles underground rather than two. */
  | 'deep-burrowing'
  /** Section 125: coming up beside somebody is worth a harder first swing. */
  | 'ambush-burrowing';

export interface TechDef {
  id: TechId;
  name: string;
  faction: FactionId | 'both';
  /** Beakers required. Zero means it is granted at game start. */
  cost: number;
  prereqs: TechId[];
  units: UnitTypeId[];
  buildings: BuildingId[];
  flags: TechFlag[];
  flavor: string;
}

export const TECHS: TechDef[] = [
  // ============================================================ shared line
  {
    id: 'mapmaking',
    name: 'Mapmaking',
    faction: 'both',
    cost: 25,
    prereqs: [],
    // One ship a side. The filter that decides what a city may build asks the
    // unit's own faction, so a shared advance can hand all three their boat.
    units: ['raft', 'barge', 'tidecaste', 'ferrycontract', 'ferrymansdue'],
    buildings: [],
    flags: ['mapmaking'],
    flavor: 'The world turns out to have a shape. Everyone is a little put out about it.',
  },
  {
    id: 'tree-hugging',
    name: 'Tree-Hugging',
    faction: 'both',
    cost: 55,
    prereqs: ['mapmaking'],
    units: [],
    buildings: ['granary'],
    flags: ['terraform'],
    flavor: 'If you do not eat the whole forest immediately, there is more forest later.',
  },
  {
    id: 'bridge-building',
    name: 'Bridge Building',
    faction: 'both',
    cost: 45,
    prereqs: ['mapmaking'],
    units: [],
    buildings: ['outpost', 'depot', 'theForwardBurrow', 'waystation', 'farDoor'],
    flags: ['bridges'],
    flavor: 'Walking around the swamp was, in hindsight, a choice.',
  },
  {
    id: 'wall-building',
    name: 'Wall Building',
    faction: 'both',
    cost: 75,
    prereqs: ['bridge-building'],
    units: [],
    buildings: ['walls', 'catapult', 'theNarrowing', 'circledWagons', 'drawnLine'],
    flags: [],
    flavor:
      'A bridge, but standing up and unwelcoming. The Horde attends the same ' +
      'lecture and comes away with a catapult.',
  },
  {
    id: 'tower-building',
    name: 'Tower Building',
    faction: 'both',
    cost: 115,
    prereqs: ['wall-building'],
    units: [],
    buildings: ['bigVault', 'exchange', 'yellingWall', 'theGreaterRendering', 'tollPost', 'titheVault'],
    flags: ['watchtower', 'channels'],
    flavor: 'A wall, but taller and lonelier.',
  },
  {
    id: 'not-you-again',
    name: 'Not You Again!',
    faction: 'both',
    cost: 45,
    prereqs: ['mapmaking'],
    units: [],
    buildings: ['treasury', 'market', 'firstLedger', 'theRenderingPit', 'strongboxWagon', 'titheBasin'],
    flags: [],
    flavor:
      'The same coin keeps turning up. Eventually somebody scratches a number ' +
      'on it and the whole economy follows.',
  },
  {
    id: 'hammers-of-glory',
    name: 'Hammers of Glory',
    faction: 'both',
    cost: 85,
    prereqs: ['not-you-again'],
    units: [],
    buildings: ['thinkingRock', 'scriptorium', 'unfinishedCathedral', 'theScentRecord', 'routeBook', 'wallOfNames'],
    flags: [],
    flavor:
      'It emerges you can build a place specifically for thinking in. The ' +
      'hammers were, in the end, the easy part.',
  },
  {
    id: 'joy-making',
    name: 'Joy Making',
    faction: 'both',
    cost: 65,
    prereqs: ['tree-hugging'],
    units: [],
    buildings: ['totem', 'chapel', 'theHum', 'sharedFire', 'quietRoom'],
    flags: [],
    flavor: 'Morale is discovered, immediately weaponised, and then regulated.',
  },
  {
    id: 'happiness',
    name: 'Happiness',
    faction: 'both',
    cost: 105,
    prereqs: ['joy-making'],
    units: [],
    buildings: [],
    flags: ['contentment'],
    flavor: 'Formal proof that people who are not miserable work slightly harder.',
  },
  {
    id: 'pyromancy',
    name: 'Setting Things Alight',
    faction: 'both',
    cost: 165,
    prereqs: ['insanity'],
    units: [],
    buildings: [],
    flags: ['pyromancy'],
    flavor:
      'Fire was always available. What is new is doing it to somebody deliberately, ' +
      'from a distance, and then walking away while it continues.',
  },
  {
    id: 'cryomancy',
    name: 'The Cold Shoulder',
    faction: 'both',
    cost: 180,
    prereqs: ['insanity'],
    units: [],
    buildings: [],
    flags: ['cryomancy'],
    flavor:
      'Nobody has worked out how to make a thing colder. They have worked out how to ' +
      'make a thing very slow, which for military purposes is the same discovery.',
  },
  // Section 111: the one folly whose prerequisite did not exist -- both elements
  // known at once, and they sit side by side under Insanity rather than on one line.
  // Cheap, because the two advances before it did the expensive part.
  {
    id: 'sky-argument',
    name: 'The Argument With The Sky',
    faction: 'both',
    cost: 70,
    prereqs: ['pyromancy', 'cryomancy'],
    units: [],
    buildings: ['skyArgumentSpire'],
    flags: ['folly'],
    flavor:
      'Fire and cold were each mastered separately and immediately turned on each other. The ' +
      'weather has held a grudge ever since.',
  },
  {
    id: 'insanity',
    name: 'Insanity',
    faction: 'both',
    cost: 150,
    prereqs: ['happiness'],
    units: [],
    buildings: ['bigTotem', 'cathedral', 'longPeaceMonument', 'theDeeperHum', 'bigTent', 'longConversation'],
    flags: ['berserk'],
    flavor: 'Happiness, taken one step further than anyone recommended.',
  },

  // =============================================================== orc line
  {
    id: 'first-orc',
    name: 'First Orc',
    faction: 'orc',
    cost: 0,
    prereqs: [],
    units: ['peon', 'goblin'],
    buildings: [],
    flags: [],
    flavor: 'There is an orc. This took considerably longer than you would expect.',
  },
  {
    id: 'goblin-smarts',
    name: 'Goblin "Smarts"',
    faction: 'orc',
    cost: 20,
    prereqs: ['first-orc'],
    units: ['goblin_x2', 'goblin_x3', 'scout'],
    buildings: [],
    flags: [],
    flavor: 'The goblins work it out first. Nobody enjoys this.',
  },
  {
    id: 'suicidal-goblins',
    name: '"Suicidal" Goblins',
    faction: 'orc',
    cost: 45,
    prereqs: ['goblin-smarts'],
    units: ['goblin_x5', 'sapper'],
    buildings: [],
    flags: [],
    flavor: 'The quotation marks are load-bearing. Nobody has explained them.',
  },
  {
    id: 'underground-smarts',
    name: 'Underground Smarts',
    faction: 'orc',
    cost: 95,
    prereqs: ['suicidal-goblins'],
    units: ['sapper_x2', 'goblincatapult'],
    buildings: ['biggerRock'],
    flags: ['volatile'],
    flavor: 'Everything is better underground, where nobody can see how it is going.',
  },
  {
    id: 'orc-meaning',
    name: 'The Meaning of Orc',
    faction: 'orc',
    cost: 25,
    prereqs: ['first-orc'],
    units: ['orc'],
    buildings: [],
    flags: [],
    flavor: 'A long night of reflection concludes that an orc is a thing that hits.',
  },
  {
    id: 'orc-together',
    name: "Let's Orc Together",
    faction: 'orc',
    cost: 40,
    prereqs: ['orc-meaning'],
    units: ['orc_x2'],
    buildings: [],
    flags: [],
    flavor: 'Two orcs can stand in the same place. Nothing is ever the same again.',
  },
  {
    id: 'idiots-stick-together',
    name: 'Idiots Stick Together',
    faction: 'orc',
    cost: 60,
    prereqs: ['orc-together'],
    units: ['orc_x3'],
    buildings: [],
    flags: [],
    flavor: 'Three. The number is three. It comes after the other two.',
  },
  {
    id: 'next-level-stupid',
    name: 'The Next Level of Stupid',
    faction: 'orc',
    cost: 85,
    prereqs: ['idiots-stick-together'],
    units: ['orc_x4'],
    buildings: [],
    flags: [],
    flavor: 'Four orcs. The Horde is officially past what its hands can represent.',
  },
  {
    id: 'beyond-stupid',
    name: 'Beyond Stupid',
    faction: 'orc',
    cost: 105,
    prereqs: ['next-level-stupid'],
    units: ['orc_x6'],
    buildings: [],
    flags: [],
    flavor: 'Six orcs, achieved by doing three orcs twice and refusing to elaborate.',
  },
  {
    id: 'not-just-stupid',
    name: 'Not Just Stupid Anymore',
    faction: 'orc',
    cost: 132,
    prereqs: ['beyond-stupid'],
    units: ['orc_x8'],
    buildings: [],
    flags: ['coordination'],
    flavor: 'Eight orcs, all walking the same way. Historians will not believe this part.',
  },
  {
    id: 'stupidity-for-all',
    name: 'And Stupidity for All',
    faction: 'orc',
    cost: 168,
    prereqs: ['not-just-stupid'],
    units: ['orc_x10'],
    buildings: ['yellingGrounds'],
    flags: [],
    flavor: 'Ten orcs. One unit. One extremely large mistake waiting to happen.',
  },
  {
    id: 'to-be-an-orc',
    name: 'To Be An Orc',
    faction: 'orc',
    cost: 45,
    prereqs: ['orc-meaning'],
    units: [],
    buildings: ['barracks', 'orcPosting', 'loudestRock'],
    flags: [],
    flavor: 'It emerges that an orc can be trained, which is to say shouted at on purpose.',
  },
  {
    id: 'axes',
    name: 'Axes',
    faction: 'orc',
    cost: 50,
    prereqs: ['orc-meaning'],
    units: ['troll'],
    buildings: [],
    flags: [],
    flavor: 'Sharpened on one side. The Horde considers this its finest hour so far.',
  },
  {
    id: 'axes-crazy',
    name: 'Axes Make You Crazy',
    faction: 'orc',
    cost: 80,
    prereqs: ['axes'],
    units: ['troll_x2', 'troll_x3'],
    buildings: ['bonepit'],
    flags: ['swampy'],
    flavor: 'Correlation is established. Causation is declared uninteresting.',
  },
  {
    id: 'throwing-buddies',
    name: 'Throwing Buddies',
    faction: 'orc',
    cost: 65,
    prereqs: ['axes'],
    units: ['axethrower', 'axethrower_x2', 'warboat'],
    buildings: [],
    flags: [],
    flavor: 'The axe goes away from you. This is the entire discovery.',
  },
  {
    id: 'club-improvement',
    name: 'Improvements to the Club',
    faction: 'orc',
    cost: 150,
    prereqs: ['my-little-friend'],
    units: [],
    buildings: [],
    flags: ['clubs'],
    flavor:
      'Three of them, and no agreement on which is best. The argument is ongoing and occasionally on fire.',
  },
  {
    id: 'my-little-friend',
    name: 'My Little Friend',
    faction: 'orc',
    cost: 95,
    prereqs: ['throwing-buddies'],
    units: ['axethrower_x3', 'ogre'],
    buildings: [],
    flags: [],
    flavor: 'Every orc should have someone larger standing behind them.',
  },
  {
    id: 'dead-messed-up',
    name: 'The Dead are Messed Up',
    faction: 'orc',
    cost: 130,
    prereqs: ['to-be-an-orc', 'axes-crazy'],
    units: ['deathknight'],
    buildings: ['bargainStone'],
    flags: ['bargain'],
    flavor: 'A finding delivered with unusual confidence and no supporting evidence.',
  },
  // ------------------------------------------------------------ section 150
  //
  // Verbatim from `UNBOUND_PLAN.md`, which writes this advance out in full and
  // says plainly where it belongs: *"Bone-Speaker's tech entry belongs in the
  // orc tree (`techs.ts`), not here -- same as how Warden-caste's tech lives
  // inside Hivekin's own tree."* So it is here, in the Horde's magic line,
  // behind the advance that got the Horde into this sort of thing to begin
  // with.
  //
  // It ships **before the faction it answers**. Every side needs its exorcist
  // standing before the Unbound arrive, or there is a stretch of sections in
  // which one side cannot be permanently beaten by anybody.
  {
    id: 'bone-speaker',
    name: 'The Unpopular Sort',
    faction: 'orc',
    cost: 140,
    prereqs: ['dead-messed-up'],
    units: ['orc-shaman'],
    buildings: [],
    flags: [],
    flavor:
      'Someone has to send them back. This has never been a popular job. ' +
      'It has always, nonetheless, been a job.',
  },
  {
    id: 'full-of-fire',
    name: 'Full of Fire',
    faction: 'orc',
    cost: 185,
    prereqs: ['dead-messed-up'],
    units: ['deathknight_x2', 'dragon'],
    buildings: ['longMarchRoad'],
    flags: [],
    flavor: 'The Horde has one plan for the late game and has now finished writing it down.',
  },

  // ============================================================= human line
  {
    id: 'first-human',
    name: 'First Human',
    faction: 'human',
    cost: 0,
    prereqs: [],
    units: ['peasant', 'footman'],
    buildings: [],
    flags: [],
    flavor: 'A human, with a name, a trade, and three opinions about the tax code.',
  },
  {
    id: 'brotherhood',
    name: 'Brotherhood',
    faction: 'human',
    cost: 30,
    prereqs: ['first-human'],
    units: ['footman_x2'],
    buildings: [],
    flags: [],
    flavor: 'A man may stand beside another man. The paperwork runs to forty pages.',
  },
  {
    id: 'join-army',
    name: 'Join the Army',
    faction: 'human',
    cost: 55,
    prereqs: ['brotherhood'],
    units: ['footman_x3', 'frigate'],
    buildings: ['barracks', 'soldierPosting'],
    flags: [],
    flavor: 'See the world. Meet interesting people. Stand extremely close to them.',
  },
  {
    id: 'bunches-footmen',
    name: 'Bunches of Footmen',
    faction: 'human',
    cost: 88,
    prereqs: ['join-army'],
    units: ['footman_x5'],
    buildings: [],
    flags: [],
    flavor: 'The official term is "bunches". The Royal Academy fought this and lost.',
  },
  {
    id: 'ten-heads',
    name: '10 Heads are Better than One',
    faction: 'human',
    cost: 128,
    prereqs: ['bunches-footmen'],
    units: ['footman_x10'],
    buildings: ['library'],
    flags: ['coordination'],
    flavor: 'Ten heads, one direction, and a rota for who carries the flag.',
  },
  {
    id: 'see-the-world',
    name: 'See the World',
    faction: 'human',
    cost: 30,
    prereqs: ['first-human'],
    units: ['outrider'],
    buildings: [],
    flags: [],
    flavor: 'Someone should go and look. Someone else should write down what they saw.',
  },
  {
    id: 'archery',
    name: 'Archery',
    faction: 'human',
    cost: 40,
    prereqs: ['first-human'],
    units: ['archer'],
    buildings: [],
    flags: [],
    flavor: 'Like Throwing Buddies, except you get to keep the pointy thing.',
  },
  {
    id: 'pointed-ears',
    name: 'Pointed Ears Anyone?',
    faction: 'human',
    cost: 65,
    prereqs: ['archery'],
    units: ['archer_x2'],
    buildings: [],
    flags: [],
    flavor: 'An enquiry is opened into who exactly has been helping with the archery.',
  },
  {
    id: 'arrows-glory',
    name: 'Arrows to Glory',
    faction: 'human',
    cost: 90,
    prereqs: ['pointed-ears'],
    units: ['archer_x3', 'ballista'],
    buildings: [],
    flags: [],
    flavor: 'If one arrow is glory, the correct number of arrows is all of them.',
  },
  {
    id: 'horses-sneeze',
    name: 'Horses Make Me Sneeze',
    faction: 'human',
    cost: 50,
    prereqs: ['first-human'],
    units: ['knight'],
    buildings: [],
    flags: [],
    flavor: 'The Kingdom presses on regardless, eyes streaming, into the age of cavalry.',
  },
  {
    id: 'let-us-ride',
    name: 'Let us Ride!',
    faction: 'human',
    cost: 85,
    prereqs: ['horses-sneeze'],
    units: ['knight_x2'],
    buildings: [],
    flags: [],
    flavor: 'Two knights, riding abreast, at considerable expense to everyone.',
  },
  {
    id: 'run-you-through',
    name: "We'll Run You Through!",
    faction: 'human',
    cost: 125,
    prereqs: ['let-us-ride', 'join-army'],
    units: ['knight_x3', 'paladin'],
    buildings: ['longVigilShrine'],
    flags: ['valour'],
    flavor: 'Shouted in advance, as courtesy demands.',
  },
  {
    id: 'rumbling-voice',
    name: 'Rumbling Voice',
    faction: 'human',
    cost: 100,
    prereqs: ['see-the-world', 'join-army'],
    units: ['mage'],
    buildings: ['rumblingArchive'],
    flags: [],
    flavor: 'It is discovered that saying things in a deeper voice makes them true.',
  },
  {
    id: 'lordship',
    name: 'Lordship',
    faction: 'human',
    cost: 150,
    prereqs: ['rumbling-voice'],
    units: ['mage_x2', 'paladin_x2'],
    buildings: ['paradeGround', 'learnedCommittee'],
    flags: [],
    flavor: 'The rumbling voice is given a hat, a title, and a great deal of land.',
  },
  // ================================================== section 110's endings
  {
    id: 'somebody-knocked',
    name: 'Somebody Knocked',
    faction: 'orc',
    // Half the Kingdom's price, and a shorter road, on purpose. The two roads cost
    // the same to walk when both went through Insanity (930 against 965 base,
    // docs/TECH_TREE.md), but the Kingdom researches faster: it learned its ending
    // advance in 26 games of 31 to the Horde's 14, and halving this price alone
    // changed nothing. With the works made dearer, the Object then landed nearly
    // three times as often as the Portal (33 to 12 in 108 games), so the Horde's
    // road no longer runs through Insanity. Section 110.
    cost: 100,
    prereqs: ['dead-messed-up'],
    units: [],
    buildings: ['knockingStones', 'offeringPit', 'demonPortal'],
    flags: ['ending'],
    flavor:
      'Something under the ground knocked. An orc knocked back. Neither of them has been ' +
      'able to stop since.',
  },
  {
    id: 'do-not-touch',
    name: 'Do Not Touch That',
    faction: 'human',
    cost: 200,
    prereqs: ['lordship', 'insanity'],
    units: [],
    buildings: ['committeeChamber', 'pedestal', 'mysteriousObject'],
    flags: ['ending'],
    flavor:
      'A committee has been formed to establish what it does. So far it has agreed on the ' +
      'wording of the sign.',
  },

  // =========================================================== section 125
  // The Hivekin. Not a counting ladder and not a committee ladder: every
  // advance here is a shape the Hive has become capable of growing, and the
  // tree is simply the order they arrive in.
  {
    id: 'first-hivekin',
    name: 'There Was A Hive',
    faction: 'hivekin',
    cost: 0,
    prereqs: [],
    // The Queen is not here. She is placed in the first Hive when it is
    // founded, which is what "starting unit" means for a side that cannot
    // build one -- see `sim/hivekin.ts`.
    // **Fodder from the first turn**, which the other two sides have always
    // had: `first-orc` opens with a peon *and* a goblin, `first-human` with a
    // peasant and a footman. The Hive opened with a settler and a labourer and
    // nothing that could hold a tile -- reported from the first game anybody
    // played as them, where turn one offered a choice between a Grub it could
    // not afford and research. Section 136.
    units: ['grub', 'worker', 'fodder'],
    buildings: [],
    flags: [],
    flavor: 'There was a hive. This took considerably less deliberation than usual.',
  },
  {
    id: 'caste-fodder',
    name: 'A Shape For This',
    faction: 'hivekin',
    cost: 20,
    prereqs: ['first-hivekin'],
    // **Empty since section 136**, when the shape itself moved to
    // `first-hivekin` so the Hive could field something on turn one. This
    // still does two jobs and neither is the caste: it opens the rest of the
    // caste tree, and it is what a `hk-worker` citizen needs. The counting
    // ladder was deliberately *not* given this rung -- the Hive buys the whole
    // thing in two advances where the Horde needs six, and a test defends
    // that, because one advance granting every shape at once is the inversion
    // that makes the ladder theirs.
    units: [],
    buildings: [],
    flags: [],
    flavor: 'A shape existed for this. It has been made.',
  },
  {
    id: 'caste-soldier',
    name: 'A Sturdier Shape',
    faction: 'hivekin',
    cost: 45,
    prereqs: ['caste-fodder'],
    units: ['soldier'],
    buildings: ['theStandingNiche'],
    flags: [],
    flavor: 'The last shape held. A better one was owed regardless.',
  },
  {
    // ------------------------------------------- the counting ladder, inverted
    //
    // The Horde's ladder is the game's oldest joke and it is six advances long:
    // Let's Orc Together, Idiots Stick Together, The Next Level of Stupid,
    // Beyond Stupid, Not Just Stupid Anymore, And Stupidity for All. Five
    // hundred and ninety beakers to get from one orc to ten, one painful
    // realisation about numbers at a time.
    //
    // **The Hive gets two, and each one raises every shape at once**, which is
    // both the better joke and the only affordable shape. The better joke
    // because a hive did not have to learn to count -- quantity came with the
    // shape, and being counted is something that happens to it rather than
    // something it achieves. The only affordable shape because they research
    // 11.8 advances in an entire game at 9.9 beakers a turn: a six-advance
    // ladder would eat their game exactly as the eleven-advance road to their
    // own ending did, which is the mistake this section already made once.
    //
    // No `coordination` flag, and they do not need one. Every caste with a
    // ladder moves one, and `effectiveMove` floors at one, so the crowding
    // penalty that costs the Horde a movement point until it learns to walk in
    // a line cannot touch them. Ten of them were always one thought.
    id: 'always-this-many',
    name: 'There Were Always This Many',
    faction: 'hivekin',
    cost: 40,
    prereqs: ['caste-soldier'],
    units: ['fodder_x2', 'fodder_x3', 'soldier_x2'],
    buildings: [],
    flags: [],
    flavor:
      'The Hive has not grown. The Hive has been counted, which is a different ' +
      'thing, and it would prefer the counting to stop.',
  },
  {
    id: 'assumed-fewer',
    name: 'You Had Assumed Fewer',
    faction: 'hivekin',
    cost: 80,
    prereqs: ['always-this-many'],
    units: ['fodder_x5', 'soldier_x3', 'spitter_x2', 'elite_x2'],
    buildings: [],
    flags: [],
    flavor:
      'No additional shapes were made for this. You were simply looking at ' +
      'some of them.',
  },
  {
    id: 'caste-spitter',
    name: 'A Shape That Reaches',
    faction: 'hivekin',
    cost: 50,
    prereqs: ['caste-fodder'],
    units: ['spitter'],
    buildings: [],
    flags: [],
    flavor: 'Distance was the only thing missing. It no longer is.',
  },
  {
    id: 'caste-burrower',
    name: 'The Ground Was Already Hollow',
    faction: 'hivekin',
    cost: 65,
    prereqs: ['caste-fodder'],
    units: ['burrower'],
    buildings: [],
    flags: [],
    flavor: 'The ground was already hollow. This was noticed.',
  },
  {
    id: 'caste-riptide',
    name: 'A Shape That Opens Other Shapes',
    faction: 'hivekin',
    cost: 70,
    prereqs: ['caste-soldier'],
    units: ['riptidecaste'],
    buildings: [],
    flags: [],
    flavor: 'The sea was previously unclaimed. This has been corrected.',
  },
  {
    // Section 125 slice B wires the three burrower upgrades to an ability that
    // does not exist yet. They are in the tree now so the road to the ending
    // and the cost of walking it are the ones a sweep will measure.
    id: 'burrower-veteran',
    name: 'The Last Tile Forgotten',
    faction: 'hivekin',
    cost: 90,
    prereqs: ['caste-burrower'],
    units: [],
    buildings: [],
    flags: ['quiet-sinking'],
    flavor: 'Where it was is no longer known. This was arranged on purpose.',
  },
  {
    id: 'caste-bloat',
    name: 'A Shape That Empties Once',
    faction: 'hivekin',
    cost: 95,
    prereqs: ['caste-spitter'],
    units: ['bloatcaste'],
    buildings: [],
    flags: [],
    flavor: 'Distance solved the reaching problem. Walls remained. This solves that too.',
  },
  {
    // Deep and Ambush hang off the same advance and **both may be taken**. The
    // bible called them mutually exclusive; nothing in this tree can say that,
    // and Jeremy's answer of 2026-10-06 was that it should not have to here --
    // the exclusivity would be guarding a boundary that is not under threat,
    // since both branches are the Burrower-caste being more itself and nothing
    // bleeds between castes. One is mobility, the other damage, and paying 90
    // plus 240 beakers out of a ten-advance game is the specialisation.
    id: 'burrower-deep',
    name: 'Further Down',
    faction: 'hivekin',
    cost: 120,
    prereqs: ['burrower-veteran'],
    units: [],
    buildings: ['undercity', 'theDeepRecord'],
    flags: ['deep-burrowing'],
    flavor: 'Two tiles became three. The ground did not object.',
  },
  {
    id: 'burrower-ambush',
    name: 'Already Waiting',
    faction: 'hivekin',
    cost: 120,
    prereqs: ['burrower-veteran'],
    units: [],
    buildings: [],
    flags: ['ambush-burrowing'],
    flavor: 'It was there first. It simply waited to be noticed.',
  },
  {
    id: 'caste-elite',
    name: 'The Best Shape So Far',
    faction: 'hivekin',
    cost: 85,
    prereqs: ['caste-soldier'],
    units: ['elite'],
    buildings: ['theHardeningFloor'],
    flags: [],
    flavor: 'Better shapes remain possible. This one will do for now.',
  },
  {
    id: 'caste-broodlord',
    name: 'A Shape With Four Arms',
    faction: 'hivekin',
    cost: 130,
    prereqs: ['caste-elite'],
    units: ['broodlord'],
    buildings: ['broodwarmth'],
    flags: [],
    flavor: 'Two arms were doing the work of four. This has been corrected.',
  },
  {
    id: 'caste-warden',
    name: 'A Shape That Dissolves Things',
    faction: 'hivekin',
    cost: 140,
    prereqs: ['caste-elite', 'hammers-of-glory'],
    units: ['warden'],
    buildings: [],
    flags: [],
    flavor: 'Something was needed against what does not have a shape to begin with.',
  },
  {
    id: 'caste-princess',
    name: 'A Shape That Waits',
    faction: 'hivekin',
    cost: 110,
    prereqs: ['caste-elite', 'happiness'],
    units: ['princess'],
    buildings: ['oldQueensShell'],
    flags: [],
    flavor:
      'She was always going to be needed eventually. Eventually has not ' +
      'arrived. She waits regardless.',
  },
  {
    // **The shortest road to an ending in the game, on purpose.**
    //
    // It used to hang off `caste-princess` and `insanity`, which is where the
    // bible put it and reads perfectly: the second Queen comes after the shape
    // that waits, and after the world has stopped making sense. It also cost
    // 860 beakers over eleven advances, and the Hive earns 9.9 beakers a turn
    // against the Horde's 19.1 and the Kingdom's 32.4. That is 87 turns of pure
    // research in a life of about 140, against the Horde's 23 and the Kingdom's
    // 30 -- so in twelve games they reached this advance twice and built, in
    // total, no works at all.
    //
    // Thirty-eight of fifty-four games are decided by somebody finishing an
    // ending, and they hold 22% of the world against the 50% dominance needs,
    // so this is the only door they have. Repricing it was measured and does
    // nothing: their advances per game read 11.8 whatever the road costs,
    // because repricing buys no research, it only changes what the research is
    // spent on. 860, 710 and 610 all give zero wins.
    //
    // So the road has to fit inside four of their twelve advances. Off
    // `caste-soldier` it is 165 beakers over four, every one of which they
    // research anyway, and that is the first thing in section 125 to produce a
    // win: 4 of 12 with the works at 180/180/240 below, and every win an ending
    // win. Jeremy chose this over a research mechanic on 2026-10-04.
    //
    // What it means in play: their victory advance lands around turn 130 rather
    // than never, and the race is theirs to lose rather than not to enter.
    id: 'all-is-the-hive',
    name: 'All Is The Hive',
    faction: 'hivekin',
    cost: 100,
    prereqs: ['caste-soldier'],
    units: [],
    buildings: ['moltingChamber', 'secondFeeding', 'secondQueenShell'],
    flags: ['ending'],
    flavor:
      'Two queens should not have been possible. Two queens were possible. All ' +
      'is the Hive and the Hive are all, and if they were capable of joy, they ' +
      'would be reasonably pleased about this. Not excessively. It is, after ' +
      'all, only the one world.',
  },
  {
    // Section 136, the first of the spy advances and the only one built so far.
    //
    // **On the shared spine**, like the other four will be: all three sides
    // build spies, and three parallel chains would have been fifteen advances
    // and fifteen icons for one feature. The flavour is carried by the units --
    // a Skulker and a Factor learning the same advance and doing visibly
    // different things with it is the joke -- rather than by the tree.
    //
    // Nothing in this tree was about *knowing things* before it. The shared
    // spine was land, walls, weather and mood; the faction ladders are units
    // and counting jokes.
    id: 'a-word-in-the-wrong-ear',
    name: 'A Word In The Wrong Ear',
    faction: 'both',
    cost: 120,
    prereqs: ['asking-around'],
    units: [],
    buildings: [],
    flags: ['incite'],
    flavor:
      'Nothing is invented and nothing is even untrue. The trick is only to mention the ' +
      'right grievance to the right person at the right hour, and then to be somewhere ' +
      'else by the time they have finished agreeing with themselves.',
  },
  {
    id: 'asking-around',
    name: 'Asking Around',
    faction: 'both',
    cost: 85,
    prereqs: ['someone-elses-business'],
    units: [],
    buildings: [],
    flags: ['gossip'],
    flavor:
      'People will tell you a startling amount about their neighbours if you stand ' +
      'near them and look interested. They will tell you more if you buy the next ' +
      'round, but that is a separate advance and somebody is still costing it.',
  },
  {
    id: 'everyone-has-a-price',
    name: "Everyone Has A Price",
    faction: 'both',
    cost: 110,
    prereqs: ['someone-elses-business', 'not-you-again'],
    units: [],
    buildings: [],
    flags: ['turning'],
    flavor:
      'Somebody worked out that a soldier is a person, and that a person who is paid ' +
      'once a season can be paid twice. The second payment is the interesting one, and ' +
      'nobody has yet found the argument against it.',
  },
  // ----------------------------------------------- section 142: the Wandering Folk
  //
  // Taken verbatim from `WANDERERS_PLAN.md`'s table -- ids, names, costs,
  // prerequisites and flavour are all Jeremy's. The fork sits on the shared
  // spine exactly as the orc and human trees do.
  //
  // **Two of the bible's thirteen are not here yet.** `caravan-building`
  // grants the Caravan and `nowhere-left-but-up` grants the three ending
  // works, and neither building exists; an advance that unlocks nothing would
  // be an empty box in the tree. They arrive with their buildings.
  {
    id: 'first-wanderers',
    name: 'Whoever Was Left',
    faction: 'wandering',
    cost: 0,
    prereqs: [],
    // **The Skirmisher from the first turn**, and this is section 136's note
    // on `first-hivekin` repeated word for word, because section 142 wrote
    // this entry straight out of `WANDERERS_PLAN.md` without reading it.
    //
    // The bible's draft gives this advance `units: ['wanderer']` and puts the
    // Skirmisher behind `tier-skirmisher` at twenty beakers. Every other side
    // opens with a settler **and** something that can hold a tile -- a peon
    // and a goblin, a peasant and a footman, a grub and a fodder. The
    // Wandering Folk opened with a Wanderer and nothing else, and a city of
    // one is not offered a settler at all (`SETTLER.minCitySize`), so their
    // first town could build **nothing whatsoever**: the Units list was empty
    // and the production box was set to a Skirmisher nobody could have
    // chosen, because `FACTIONS.wandering.starterUnit` names one.
    //
    // Reported from the first game played as them, exactly as the Hive's was.
    // **And a Caravan from turn one**, which is the `caravans` flag below.
    // Section 148, from playtest. Asking a faction to research eighty beakers
    // before it may do the single thing that distinguishes it is the same
    // shape of mistake as a town that can build nothing: the mechanic exists
    // and the player cannot reach it.
    //
    // Jeremy's argument for why this needs no research gate, and it is the
    // better brake: **gold is a premium early game.** A Caravan on turn one
    // is a Caravan they cannot afford to use, so the cost of asking paces
    // Recruit rather than a wall in front of it -- and that is a tension a
    // player can feel and act on, where a tech wall is only a wait.
    units: ['wanderer', 'wf-skirmisher'],
    buildings: [],
    flags: ['caravans'],
    flavor: 'There was no homeland to begin from. This turned out not to matter.',
  },
  // ------------------------------------------------------------ section 145
  //
  // Held back in section 142 with a note saying its building did not exist,
  // which was true and was also the wrong way round: the Caravan is not a
  // building. It is a **terrain improvement**, filed in the bible beside the
  // irrigation and mine overlays, and what it needed was `sim/caravans.ts`.
  //
  // Verbatim from `WANDERERS_PLAN.md` apart from `buildings`, which the draft
  // gave as `['caravan']` and which is the slip that kept this advance out of
  // the game for three sections. Nothing is built in a city here. The advance
  // unlocks an order a worker can be given, the way Bridge Building unlocks
  // laying a road, and `canBuildCaravan` is what reads it.
  {
    // ---------------------------------------------------------- section 148
    //
    // **Repurposed, for the same reason `tier-skirmisher` was.** This used to
    // be the gate on Caravans themselves, and that gate moved to
    // `first-wanderers` so the faction can reach its own mechanic on turn
    // one. Deleting the advance was never an option -- it is a prereq of
    // `nowhere-left-but-up`, so the whole ending hangs off it.
    //
    // What it buys instead is **Jeremy's idea, and a better one than the
    // reach bump I had drafted**: every unit can park a Caravan, not only a
    // worker. That changes how the faction is played rather than a number on
    // it. Early, a Caravan costs a Wanderer's time and has to be planted on
    // purpose; after this, the army plants them where the army already is --
    // which is exactly where there is anybody to ask.
    //
    // It suits what a Caravan *is*, too. A garrison post is built; a ring of
    // parked wagons is only stopped. There was never a good reason a soldier
    // could not stop.
    id: 'caravan-building',
    name: 'Somewhere To Ask From',
    faction: 'wandering',
    cost: 80,
    prereqs: ['first-wanderers', 'wall-building'],
    units: [],
    buildings: ['firstCaravan'],
    flags: ['anyone-parks'],
    flavor: 'A fort, more or less, except the point of it is conversation.',
  },
  {
    // ---------------------------------------------------------- section 148
    //
    // **Repurposed, not deleted.** This granted the Skirmisher, which moved to
    // `first-wanderers` when playtest found that a Wandering Folk town could
    // build nothing at all on turn one. That left this advance granting
    // nothing -- and deleting it was the wrong answer twice over: the whole
    // fork hangs off it (`tier-warband` and `tier-slinger` both name it as a
    // prereq), and the AI's tech priority leads with it.
    //
    // It needed no new name. *"The First Ones Who Stayed -- they were not
    // asked to leave. They left anyway."* is a line about **recruits**, not
    // about a unit tier, and it has been sitting on the wrong thing since
    // section 142.
    //
    // It answers the bible's own open question -- *"worth confirming whether
    // Wandering Folk should get their own reliability-improving advances"* --
    // and splits cleanly from the First Caravan folly, which is the other
    // thing that touches Recruit: **the advance makes asking cheaper, the
    // folly makes it likelier to work.** Two levers, two prices, no overlap.
    id: 'tier-skirmisher',
    name: 'The First Ones Who Stayed',
    faction: 'wandering',
    cost: 20,
    prereqs: ['first-wanderers'],
    units: [],
    buildings: [],
    flags: ['staying'],
    flavor: 'They were not asked to leave. They left anyway. Close enough.',
  },
  {
    id: 'tier-warband',
    name: 'A Proper Line',
    faction: 'wandering',
    cost: 45,
    prereqs: ['tier-skirmisher'],
    units: ['warband'],
    buildings: ['hiredPost'],
    flags: [],
    flavor: 'Ordinary people, mostly. The paperwork was the only unusual part.',
  },
  {
    id: 'tier-slinger',
    name: 'Aim, Borrowed',
    faction: 'wandering',
    cost: 50,
    prereqs: ['tier-skirmisher'],
    units: ['slinger'],
    buildings: [],
    flags: [],
    flavor: 'Nobody remembers whose technique this originally was. It works regardless.',
  },
  {
    id: 'tier-outcast',
    name: 'Exile, Reclassified',
    faction: 'wandering',
    cost: 85,
    prereqs: ['tier-warband'],
    units: ['outcast'],
    buildings: ['wagerRing'],
    flags: [],
    flavor: 'The word "outcast" was already accurate. It was simply adopted.',
  },
  {
    id: 'tier-brute',
    name: 'The One-Headed Sort',
    faction: 'wandering',
    cost: 95,
    prereqs: ['tier-outcast'],
    units: ['wf-brute'],
    buildings: ['headCount'],
    flags: [],
    flavor: 'One head was, elsewhere, considered a defect. Here it is simply a head count.',
  },
  {
    id: 'signature-mystic',
    name: 'Taught By Watching',
    faction: 'wandering',
    cost: 100,
    prereqs: ['tier-warband'],
    units: ['mystic'],
    buildings: ['knottedRecord'],
    flags: [],
    flavor: 'No institution agreed to teach this. It was learned regardless, from a distance.',
  },
  // Section 150. `WANDERERS_PLAN.md` puts this in their tree -- *"an upgrade
  // tech (same linear-upgrade shape as Burrower's) later grants the Mystic
  // exorcism capability"* -- and its icon has been drawn and processed since
  // the faction drop, waiting for the advance to exist.
  //
  // The only one of the four exorcists that has to be **taught**. The other
  // three can do it by being what they are; the Mystic is self-taught, and
  // learns this the way it learned everything else, which is by watching
  // somebody and then trying it.
  {
    id: 'mystic-exorcism',
    name: 'Sending Them Back',
    faction: 'wandering',
    cost: 90,
    prereqs: ['signature-mystic'],
    units: [],
    buildings: [],
    flags: ['exorcism'],
    flavor:
      'Nobody taught me this one either. It seems to work, and the alternative ' +
      'is that it keeps happening.',
  },
  {
    id: 'signature-champion',
    name: 'An Order Of One',
    faction: 'wandering',
    cost: 125,
    prereqs: ['tier-outcast'],
    units: ['champion'],
    buildings: [],
    flags: [],
    flavor:
      'Nobody else was going to found the order. This was considered sufficient reason ' +
      'to do it personally.',
  },
  {
    id: 'signature-bonebound',
    name: 'A Guide, Picked Up',
    faction: 'wandering',
    cost: 130,
    prereqs: ['tier-brute'],
    units: ['bonebound'],
    buildings: ['unnamedMarker'],
    flags: [],
    flavor: 'Where it was found has not been disclosed. This is generally considered wise.',
  },
  {
    id: 'signature-drake',
    name: 'Caught, Not Bred',
    faction: 'wandering',
    cost: 185,
    prereqs: ['signature-bonebound'],
    units: ['drake'],
    buildings: [],
    flags: [],
    flavor:
      'The drake was not purchased. The drake was convinced. There is a difference, and ' +
      'it involved considerably more fish.',
  },
  // ------------------------------------------------------------ section 152
  //
  // The Unbound's fork, verbatim from `UNBOUND_PLAN.md` apart from the two
  // places noted below. Twelve advances, and the shape that matters is the
  // **reform chain**: `retrieval-circle` to `sigil-bound` is the ritual line,
  // `anchor-totem` hangs off the spirit line, and `the-ankh` needs both --
  // a genuine fork closed from two sides, the shared Folly's
  // pyromancy-and-cryomancy shape rather than a longer chain.
  //
  // Section 151 settled `anchor-totem`'s prereq, which the bible flagged as
  // a placeholder: it stays `tier-yaksha`, because the yaksha is the spirit
  // that already stays where it is put.
  {
    id: 'first-unbound',
    name: 'It Did Not Stay Gone',
    faction: 'unbound',
    cost: 0,
    prereqs: [],
    // The bible gives `['effigy', 'domovoi']`, and section 148 is the reason
    // the Revenant is here too: every side opens with a settler **and**
    // something that can hold a tile, or its first town can build nothing at
    // all. A sweep over `FACTION_IDS` enforces it now.
    units: ['effigy', 'domovoi', 'revenant'],
    buildings: [],
    flags: [],
    flavor: 'It did not stay gone. Nobody involved has fully explained why.',
  },
  {
    id: 'tier-revenant',
    name: 'One Who Returns',
    faction: 'unbound',
    cost: 25,
    prereqs: ['first-unbound'],
    // Its unit moved to the opening advance -- section 148's rule, that a
    // faction's first advance grants the starter as well as the founder -- so
    // what this carries instead is **The First Binding**, which the bible
    // hangs here by name and for a reason worth keeping: *"riding on Revenant
    // rather than Retrieval Circle specifically because this predates all of
    // that."* The folly is the proof reform was always possible, arriving
    // well before anything existed to make it reliable.
    //
    // It briefly also carried the `sigil-bound` flag, which was wrong twice
    // over: the flag belongs to the advance of that name, and a reliability
    // bonus two advances before the building it reads from would have been a
    // rung on a ladder that was not there yet.
    units: [],
    buildings: ['appointedPlace', 'firstBinding'],
    flags: [],
    flavor: 'The name is the whole of the description. It returns.',
  },
  {
    id: 'tier-sylph',
    name: 'Hard To Pin Down',
    faction: 'unbound',
    cost: 45,
    prereqs: ['first-unbound'],
    units: ['sylph'],
    buildings: [],
    flags: [],
    flavor: 'Agreed to be somewhere. Has not been there since.',
  },
  {
    id: 'tier-naiad',
    name: 'Wherever The Water Is',
    faction: 'unbound',
    cost: 65,
    prereqs: ['tier-revenant'],
    units: ['naiad'],
    buildings: [],
    flags: [],
    flavor: 'It belongs to a stretch of water. The stretch of water has not commented.',
  },
  {
    id: 'tier-yaksha',
    name: 'What Was Left To Guard',
    faction: 'unbound',
    cost: 85,
    prereqs: ['tier-revenant'],
    units: ['yaksha'],
    // And The Standing Watch, which the bible hangs here: the one kind of
    // spirit that stays where it is put is the one that decides, unprompted,
    // to stay where a town is.
    buildings: ['rehearsalFloor', 'standingWatch'],
    flags: [],
    flavor: 'The treasure is long gone. The guarding has continued regardless.',
  },
  {
    id: 'tier-jinn',
    name: 'A Binding, Offered',
    faction: 'unbound',
    cost: 90,
    prereqs: ['tier-revenant'],
    units: ['jinn'],
    // And The Read Terms, where the bible puts it: somebody did read them,
    // once, and the Jinn is the advance about there being terms at all.
    buildings: ['readTerms'],
    flags: [],
    flavor: 'Every offer is binding. This is mentioned, briefly, near the end.',
  },
  {
    id: 'retrieval-circle',
    name: 'A Place To Call Back To',
    faction: 'unbound',
    cost: 55,
    prereqs: ['first-unbound'],
    units: [],
    buildings: ['retrievalCircle'],
    flags: [],
    flavor: 'Somewhere to come back to. Empty, ideally, and quiet.',
  },
  {
    id: 'sigil-bound',
    name: 'Sigil-Bound',
    faction: 'unbound',
    cost: 80,
    prereqs: ['retrieval-circle'],
    // The bible gives this no units and no buildings -- it is a reliability
    // advance -- so it carries a flag, which is how `caravan-building` and
    // `burrower-veteran` express the same thing.
    units: [],
    buildings: ['sigilStacks'],
    flags: ['sigil-bound'],
    flavor: 'The marks are for the one coming back, not for anybody reading them.',
  },
  {
    id: 'anchor-totem',
    name: 'Something To Hold Onto',
    faction: 'unbound',
    cost: 130,
    // Section 151: settled rather than placeholder. You learn to anchor a
    // spirit from the one kind that already anchors itself.
    prereqs: ['tier-yaksha'],
    units: [],
    buildings: ['anchorTotem'],
    flags: [],
    flavor: 'Driven in once, properly, and not discussed again.',
  },
  {
    id: 'the-ankh',
    name: 'The Ankh',
    faction: 'unbound',
    cost: 150,
    prereqs: ['sigil-bound', 'anchor-totem'],
    units: [],
    buildings: [],
    flags: ['the-ankh'],
    flavor: 'An old symbol for a thing that was never actually a question.',
  },
  {
    id: 'archon-tech',
    name: 'A Ruler, Assembled',
    faction: 'unbound',
    cost: 220,
    prereqs: ['the-ankh', 'tier-jinn'],
    units: ['archon'],
    buildings: [],
    flags: [],
    flavor: 'Assembled from the parts of an agreement everybody had forgotten signing.',
  },
  // The naval and siege advances, and the transport on shared Mapmaking.
  {
    id: 'tier-drowned',
    name: 'Already Occupied',
    faction: 'unbound',
    cost: 85,
    prereqs: ['tier-naiad'],
    units: ['ub-drowned'],
    buildings: [],
    flags: [],
    flavor: 'The water had residents before it had traffic. This was inevitable.',
  },
  {
    id: 'tier-cairn',
    name: 'What It Guards Now',
    faction: 'unbound',
    cost: 95,
    prereqs: ['tier-yaksha'],
    units: ['cairn'],
    buildings: [],
    flags: [],
    flavor: 'It was built to guard something. It has been given something else to do.',
  },
  // The fifth road out, and the last. Held back from section 152's first pass
  // for the reason section 142 held the Wandering Folk's back: an advance that
  // grants three buildings that do not exist is an empty box in the tree.
  //
  // What it does while it counts down is the one thing this ending has that
  // the Circling Caravan does not -- see `GUEST_LIST` in `sim/dispersal.ts`.
  {
    id: 'arrangement-permanent',
    name: 'The Arrangement Became Permanent',
    faction: 'unbound',
    cost: 200,
    prereqs: ['archon-tech'],
    units: [],
    buildings: ['guestList', 'standingInvitation', 'spiritParty'],
    flags: ['ending'],
    flavor:
      'Death is solved! The spirits embrace their new physical brethren, inviting them to ' +
      'new Undead parties and enjoying a life filled with a lack of food or drink and ' +
      'endless, droning conversations. They will all love it, the Unbound knows -- ' +
      'eventually.',
  },
  // ------------------------------------------------------------ section 146
  //
  // The fourth road out. Held back in section 142 for the same reason
  // `caravan-building` was -- its buildings did not exist -- and this time
  // that was simply true rather than a misreading: the three works are real
  // city buildings and had to be written.
  //
  // Costs are `WANDERERS_PLAN.md`'s: 300, 300 and 400, a thousand shields
  // against the Hive's six hundred and the empires' thousand. The Wandering
  // Folk pay the full empire price for their ending *and* a quarter more for
  // every soldier, which is the trade Recruit is supposed to be worth.
  {
    id: 'nowhere-left-but-up',
    name: 'Nowhere Left But Up',
    faction: 'wandering',
    cost: 200,
    prereqs: ['caravan-building', 'signature-champion'],
    units: [],
    buildings: ['lastMap', 'standingOrder', 'circlingCaravan'],
    flags: ['ending'],
    flavor:
      'Everyone has joined. There is nowhere further to go and no one left to ' +
      'ask. The caravan keeps moving because stopping was never on the ' +
      'schedule, and one enterprising young beastkin has begun pointing ' +
      'straight up.',
  },
  // Section 146: the attack ship and the siege engine, each behind one
  // advance of its own, which is the pattern the reference units set. The
  // transport needs only shared Mapmaking and so has no advance here.
  {
    id: 'tier-corsair',
    name: 'A Fee, Negotiated',
    faction: 'wandering',
    cost: 70,
    prereqs: ['tier-warband'],
    units: ['corsair'],
    buildings: [],
    flags: [],
    flavor: 'The toll was boarding. This was explained in advance, mostly for legal reasons.',
  },
  {
    id: 'tier-collector',
    name: 'The Debt Comes Due',
    faction: 'wandering',
    cost: 90,
    prereqs: ['tier-outcast'],
    units: ['collector'],
    buildings: [],
    flags: [],
    flavor: 'Every debt is owed to somebody. This one was finally owed to the right people.',
  },
  {
    // Section 138: the last rung, and the one that is a different question.
    //
    // Priced well above the four below it and sitting behind the two that
    // teach an agent to *do* something, because what it buys is not another
    // order -- it is a unit nobody can look at. A side that learns this
    // before it has learned to search has built something the other side has
    // no answer to at all, which is why `asking-around` is a prerequisite:
    // the counter exists before the thing it counters.
    id: 'nobody-in-particular',
    name: 'Nobody In Particular',
    faction: 'both',
    cost: 160,
    prereqs: ['a-word-in-the-wrong-ear'],
    units: ['nobody', 'intelligencer', 'hollow', 'offbooks', 'unreturned'],
    buildings: [],
    flags: ['unseen'],
    flavor:
      'The discovery is not a method, it is a posture. Walk as though you have every right ' +
      'to be there and are faintly bored of being there, and people will look directly at ' +
      'you and later be quite certain the room was empty.',
  },
  {
    id: 'someone-elses-business',
    name: "Someone Else's Business",
    faction: 'both',
    cost: 60,
    prereqs: ['mapmaking'],
    units: ['skulker', 'factor', 'mimic', 'tagalong', 'borrowedface'],
    buildings: [],
    flags: [],
    flavor:
      'It turns out you can simply walk over and look. Nobody has written down a rule ' +
      'against it, which everyone agrees is an oversight, and nobody wants to be the one ' +
      'to write it down in case somebody asks how they knew it was needed.',
  },
];

export const TECHS_BY_ID: Record<TechId, TechDef> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
);

export function tech(id: TechId): TechDef {
  const t = TECHS_BY_ID[id];
  if (!t) throw new Error(`Unknown tech: ${id}`);
  return t;
}

/** Advances a faction is allowed to research at all. */
export function techsForFaction(faction: FactionId): TechDef[] {
  return TECHS.filter((t) => t.faction === 'both' || t.faction === faction);
}
