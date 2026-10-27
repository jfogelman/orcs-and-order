import type { BuildingId, BuiltEnding, FactionId } from './types';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** Which faction may build it; 'both' for shared infrastructure. */
  faction: FactionId | 'both';
  cost: number;
  /** Gold per turn to keep it standing. */
  upkeep: number;
  blurb: string;
  /** Multiplies the defence of units inside the city. */
  defenseMult?: number;
  /**
   * Whether a siege unit's attack ignores this building's defence.
   *
   * True of Walls, which is what a siege engine is built to bring down. Not
   * true of a Broken Catapult, which is not a wall and has nothing to knock
   * over -- so the Horde keeps its modest bonus even against a ballista.
   */
  negatedBySiege?: boolean;
  /** Extra content citizens, offsetting disorder. */
  contentBonus?: number;
  /** Fraction of the food box kept when the city grows. */
  foodKept?: number;
  /** New land units are built as veterans. */
  veteranUnits?: boolean;
  /**
   * Rank new units are built at, when that beats plain veterancy.
   *
   * A city takes the best of everything standing in it, so a second-tier drill
   * building need not know whether the barracks under it still exists.
   */
  startingRank?: number;
  /**
   * A building that must already stand here before this one may be built.
   *
   * What makes a second tier a tier rather than a parallel choice: the cheap
   * one is not skippable, so the expensive one is genuinely an upgrade and not
   * an alternative for a city that never bothered with the first.
   */
  needs?: BuildingId;
  /** Extra share of this city's gold income, as a fraction. 0.5 = +50%. */
  goldBonus?: number;
  /** Extra share of this city's research output, as a fraction. */
  scienceBonus?: number;
  /**
   * Extra attack, as a fraction, for a unit attacking *out of* this city.
   * The opposite of Walls: it does nothing at all for a defender sitting
   * still, and everything for one that comes out swinging.
   */
  sallyBonus?: number;
  /**
   * Only works while somebody is standing in the city.
   *
   * The economic buildings that carry this pay roughly double what an
   * unconditional one would, so it is a trade rather than a tax: leave a unit
   * at home and the place earns its keep, march everybody out and it is a
   * warehouse full of things nobody is watching.
   *
   * Only ever gates economic output. A defensive bonus needs no such rule --
   * it is already worth nothing unless there is a defender to apply it to.
   */
  needsGarrison?: boolean;
  /**
   * Soldiers the city must be holding before this does anything, where one is
   * not enough.
   *
   * `needsGarrison` means one, which is what the AI keeps in every city anyway
   * -- so a bonus gated on it costs that AI nothing. Two is the smallest number
   * that is actually a soldier: one more than the garrison already there.
   */
  garrisonNeeded?: number;
  /**
   * Extends supply to this city, so units near it fight and heal normally.
   *
   * Without one, only the capital supplies anything -- which is what stops a
   * conquest from feeding itself. Taking a city gives you the ground; making
   * it useful to the army standing on it costs you the shields.
   */
  suppliesArmy?: boolean;
  /**
   * One of section 110's endings: built once, in the capital, never for gold, and
   * the game is over if it is still standing in its builder's hands when its
   * clock runs out. See `sim/endings.ts`.
   */
  victory?: BuiltEnding;
  /**
   * One of the two lesser works an ending needs before its final work can be
   * begun. Any city, one per empire, never for gold. See `sim/endings.ts`.
   */
  endingPart?: BuiltEnding;
  /**
   * Section 111: a folly, of which there is only one. `'world'` once in the whole
   * game, and a race between both sides; `'faction'` once per empire. Never for
   * gold, never sold, never sacked. See `sim/follies.ts`.
   */
  folly?: 'world' | 'faction';
  /** Rings of sight added to the city holding it. */
  citySight?: number;
  /** The city holding it sees over anything, hills and forest included. */
  sightUnblocked?: boolean;
  /** Content citizens added in every city of the empire holding it. */
  empireContent?: number;
  /** Multiplies how long the holder's burning and freezing last. */
  spellTurnsMult?: number;
  /** Attack added, for good, to every unit built in the city holding it. */
  builtAttack?: number;
  /** Ranks added to the starting rank of every unit built in the city holding it. */
  builtRanks?: number;
  /** Tiles of extra reach for mages built in the city holding it. */
  builtReach?: number;
  /** Share of a donor's health a Dark Bargain takes for the holder, for the same healing. */
  bargainTakes?: number;
  /** Movement added to the holder's units that begin their turn on its own land. */
  homeMoves?: number;
  /** Defence added to the holder's mounted units. */
  mountedDefense?: number;
  /**
   * Attack added to the Princess-caste and the Broodlord-caste, empire-wide.
   *
   * Restricted to named creatures the way the Long Vigil's `mountedDefense` is,
   * and for the same reason: the rule is about *those* two and saying so in the
   * data is better than a second list somewhere else.
   */
  casteAttack?: number;
  /** Sight added to every one of the holder's units. */
  unitSight?: number;
  /**
   * Section 146: added to a unit's movement for good, where the city that
   * built it holds this and the creature is one of `STRIDERS`.
   *
   * Restricted to named creatures the way `mountedDefense` is, and for the
   * same reason: a folly that quickened the whole roster would be a different
   * and much larger thing than one that quickened two of it.
   */
  builtMoves?: number;
  /**
   * Section 146: taken off the chance a Recruit simply fails, empire-wide.
   *
   * A share rather than a count, because that is what the odds are. The
   * bible resolves its own open question in favour of this over a Create
   * discount, *"since that's the half of the faction's whole identity this
   * building's flavor is actually about"*.
   */
  recruitOdds?: number;
  /**
   * Shields this city makes on top of what its land does. Section 125.
   *
   * Deliberately not a tile yield: the Undercity is underneath the Hive, and
   * Jeremy's rule is that it keeps producing when the fields above have been
   * pillaged. A building bonus does that by construction -- pillaging takes
   * improvements off tiles and cannot reach a building at all.
   */
  cityShields?: number;
  /**
   * Share off the price of a **unit** built in this city, as a fraction.
   *
   * Only units, and only this city: the Broodwarmth is a warm place to grow
   * things in, not a tax break. Buildings are priced the same as everywhere.
   */
  unitDiscount?: number;
  /**
   * Section 152: taken off the chance a scattered spirit fails to gather
   * again, empire-wide.
   *
   * A share rather than a count, for section 146's `recruitOdds` reason -- it
   * is what the odds are -- and the bible asks for exactly this stacking:
   * The First Binding *"reduces reform-failure chance further, faction-wide;
   * stacks with Sigil-Bound, Anchor Totem, and The Ankh."*
   */
  reformOdds?: number;
  /**
   * Section 152: defence added, flat, to whoever is standing in this city.
   *
   * Flat rather than `defenseMult`, because The Standing Watch is one thing
   * that has decided to guard this settlement and not a thickening of its
   * walls: *"+2 defense for the garrison in this settlement"*. A multiplier
   * would be worth most to whatever was already toughest, which is the
   * opposite of a sentry turning up for a town that had nobody.
   */
  garrisonDefense?: number;
  /**
   * Section 152: share off the price of a **bound** creature built here.
   *
   * Restricted to named creatures the way `casteAttack` and `mountedDefense`
   * are, and for the same reason: The Read Terms is a record of one
   * negotiation, and *"Jinn and Archon reformed or bound in this settlement
   * cost 15% less"* is a rule about those two.
   */
  boundDiscount?: number;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    faction: 'both',
    cost: 40,
    upkeep: 1,
    veteranUnits: true,
    blurb: 'Units built here start as veterans, having been shouted at properly.',
  },
  yellingGrounds: {
    id: 'yellingGrounds',
    name: 'The Yelling Grounds',
    faction: 'orc',
    cost: 100,
    upkeep: 2,
    startingRank: 2,
    needs: 'barracks',
    blurb:
      'Everything the barracks does, at greater volume and for longer. ' +
      'Units arrive already hardened, and faintly deaf.',
  },
  paradeGround: {
    id: 'paradeGround',
    name: 'The Parade Ground',
    faction: 'human',
    cost: 100,
    upkeep: 2,
    startingRank: 2,
    needs: 'barracks',
    blurb:
      'Marching, in squares, until it stops being marching and becomes character. ' +
      'Units arrive hardened and very tired of squares.',
  },
  granary: {
    id: 'granary',
    name: 'Granary',
    faction: 'both',
    cost: 50,
    upkeep: 1,
    foodKept: 0.5,
    blurb: 'Half the food store survives each new citizen instead of all of it vanishing.',
  },
  walls: {
    id: 'walls',
    name: 'Walls',
    // Human-only. The Horde attempts the same advance and arrives somewhere
    // else entirely -- see the Broken Catapult.
    faction: 'human',
    cost: 60,
    upkeep: 1,
    defenseMult: 2,
    negatedBySiege: true,
    blurb: 'Doubles the defence of everyone inside. Astonishingly effective for a pile of rocks.',
  },
  catapult: {
    id: 'catapult',
    name: 'Broken Catapult',
    faction: 'orc',
    cost: 60,
    upkeep: 1,
    sallyBonus: 1,
    // Deliberately far short of the x2 a wall gives. It is a large broken
    // object in the way, not a fortification, and the difference in character
    // is carried by the sally bonus above rather than by this number: a wall
    // does nothing but defend and falls to siege, where this survives siege
    // and sends the garrison out swinging.
    //
    // Briefly raised to 2 on the strength of a comparison that turned out to
    // describe a matchup which does not happen -- neither this nor a wall is
    // ever actually built in a played-out game, so those numbers were theory.
    // See section 24.
    defenseMult: 1.35,
    blurb:
      'This would have been a marvellous ranged weapon if anybody here ' +
      'understood wheels. As it stands, everyone gets very worked up and ' +
      'runs out to fight instead, which turns out to work.',
  },
  orcPosting: {
    id: 'orcPosting',
    name: 'Orc Posting',
    faction: 'orc',
    cost: 30,
    upkeep: 1,
    contentBonus: 2,
    garrisonNeeded: 2,
    // Somewhere to put them first. A posting is soldiers standing about on
    // purpose, and that is what a barracks is for -- which also gives the
    // barracks a second reason to exist, having had only veterancy before.
    needs: 'barracks',
    blurb:
      'Two orcs stand here at all times and look at everybody. Nobody has ' +
      'explained what they are for. Everybody has worked it out.',
  },
  soldierPosting: {
    id: 'soldierPosting',
    name: 'Soldier Posting',
    faction: 'human',
    cost: 30,
    upkeep: 1,
    contentBonus: 2,
    garrisonNeeded: 2,
    // Somewhere to put them first. A posting is soldiers standing about on
    // purpose, and that is what a barracks is for -- which also gives the
    // barracks a second reason to exist, having had only veterancy before.
    needs: 'barracks',
    blurb:
      'A friendly reminder that you are being watched, delivered by two ' +
      'people who are watching.',
  },
  totem: {
    id: 'totem',
    name: 'Totem of Managed Feelings',
    faction: 'orc',
    cost: 40,
    upkeep: 1,
    contentBonus: 2,
    blurb: 'A large frightening pole. Two citizens stop complaining, mostly out of fear.',
  },
  chapel: {
    id: 'chapel',
    name: 'Chapel of Mild Optimism',
    faction: 'human',
    cost: 40,
    upkeep: 1,
    contentBonus: 2,
    blurb: 'Two citizens are reassured that things are, on balance, going fine.',
  },

  bigTotem: {
    id: 'bigTotem',
    name: 'Considerably Larger Totem',
    faction: 'orc',
    cost: 90,
    upkeep: 2,
    contentBonus: 3,
    needs: 'totem',
    blurb: 'The old pole, but much bigger. Nobody has asked what it is for in some time.',
  },
  cathedral: {
    id: 'cathedral',
    name: 'Cathedral of Firm Conviction',
    faction: 'human',
    cost: 90,
    upkeep: 2,
    contentBonus: 3,
    needs: 'chapel',
    blurb: 'Mild optimism, formalised, with a roof worth the walk.',
  },

  // ------------------------------------------------------------- treasuries
  outpost: {
    id: 'outpost',
    name: 'Attempted Outpost',
    faction: 'orc',
    cost: 50,
    upkeep: 1,
    suppliesArmy: true,
    blurb:
      'It has a roof, mostly, and a pile of food near it. Supplies now reach ' +
      'this part of the map, or at any rate they reach somewhere close to it.',
  },
  depot: {
    id: 'depot',
    name: 'Forward Depot',
    faction: 'human',
    cost: 50,
    upkeep: 1,
    suppliesArmy: true,
    blurb:
      'Requisitions may be submitted here in triplicate. Two of the copies ' +
      'are for the depot. Nobody has established what the third is for.',
  },
  treasury: {
    id: 'treasury',
    name: 'Goblin Treasury',
    faction: 'orc',
    cost: 60,
    upkeep: 1,
    goldBonus: 1,
    needsGarrison: true,
    blurb:
      'The goblins love gold. It has not yet occurred to any of them that ' +
      'somebody else might also love gold, so somebody had better stand on it.',
  },
  market: {
    id: 'market',
    name: 'Simple Market',
    faction: 'human',
    cost: 60,
    upkeep: 1,
    goldBonus: 1,
    needsGarrison: true,
    blurb:
      'Buy and sell, but only one thing at a time, and only while a soldier ' +
      'is present to make sure the queue is observed.',
  },

  // --------------------------------------------------------- places to think
  bigVault: {
    id: 'bigVault',
    name: 'Goblin Vault, Reinforced',
    faction: 'orc',
    cost: 110,
    upkeep: 2,
    goldBonus: 0.5,
    needs: 'treasury',
    blurb: 'The treasury, but with a door on it now. The goblins are terribly proud.',
  },
  exchange: {
    id: 'exchange',
    name: 'Slightly Complicated Market',
    faction: 'human',
    cost: 110,
    upkeep: 2,
    goldBonus: 0.5,
    needs: 'market',
    blurb: 'Now with a second stall, and a man who writes things down.',
  },
  thinkingRock: {
    id: 'thinkingRock',
    name: 'The Thinking Rock',
    faction: 'orc',
    cost: 60,
    upkeep: 1,
    scienceBonus: 0.5,
    blurb:
      'One orc sits on it at a time. Every so often something occurs to them, ' +
      'and they are helped down and asked to describe it.',
  },
  biggerRock: {
    id: 'biggerRock',
    name: 'The Considerably Bigger Rock',
    faction: 'orc',
    cost: 130,
    upkeep: 2,
    scienceBonus: 0.5,
    needs: 'thinkingRock',
    blurb: 'Three orcs fit on it now. Progress has roughly tripled, or at least the sitting has.',
  },
  library: {
    id: 'library',
    name: 'Hall of Cross-Referenced Notes',
    faction: 'human',
    cost: 130,
    upkeep: 2,
    scienceBonus: 0.5,
    needs: 'scriptorium',
    blurb: 'The notes now refer to one another, which everyone agrees is the hard part.',
  },
  scriptorium: {
    id: 'scriptorium',
    name: 'Hall of Careful Notes',
    faction: 'human',
    cost: 60,
    upkeep: 1,
    scienceBonus: 0.5,
    blurb:
      'Everything worth knowing, written down twice in case the first copy ' +
      'turns out to have been written down wrong.',
  },
  // Section 110: the ways to end a game by building something. Each side has two
  // lesser works that may stand in any city and a final one for a city holding one
  // of them. One of each per empire, never for sale, and everybody is told the
  // moment work begins. At 180, 180 and 240 for both sides the endings decided 75
  // games of 108 and turned a Horde lead of 63-44 into a Kingdom one of 41-67, so
  // they were made dearer, 300, 300 and 400. The Kingdom's still landed more than
  // twice as often as the Horde's (Object 49, Portal 21), so its committee pays a
  // fifth more: 360, 360 and 480.
  knockingStones: {
    id: 'knockingStones',
    name: 'The Knocking Stones',
    faction: 'orc',
    cost: 300,
    upkeep: 0,
    endingPart: 'portal',
    blurb:
      'Three large stones arranged so that the ground has something to knock on. The ground has ' +
      'started knocking back. One of two works the Demonic Portal needs.',
  },
  offeringPit: {
    id: 'offeringPit',
    name: 'The Pit of Offerings',
    faction: 'orc',
    cost: 300,
    upkeep: 0,
    endingPart: 'portal',
    blurb:
      'A hole into which the Horde throws things it can spare, and a few it cannot, to see whether ' +
      'anything throws them back. One of two works the Demonic Portal needs.',
  },
  demonPortal: {
    id: 'demonPortal',
    name: 'The Demonic Portal',
    faction: 'orc',
    cost: 400,
    upkeep: 0,
    victory: 'portal',
    blurb:
      'A hole in the world with something very large and very patient on the other side. Only in ' +
      'a city holding the Knocking Stones or the Pit of Offerings, once both stand. Hold the city long ' +
      'enough and the Horde wins, in a sense.',
  },
  committeeChamber: {
    id: 'committeeChamber',
    name: 'The Committee Chamber',
    faction: 'human',
    cost: 360,
    upkeep: 0,
    endingPart: 'object',
    blurb:
      'A room with a very large table, in which the question of what not to touch can be discussed ' +
      'at length. One of two works the Mysterious Object needs.',
  },
  pedestal: {
    id: 'pedestal',
    name: 'A Very Good Pedestal',
    faction: 'human',
    cost: 360,
    upkeep: 0,
    endingPart: 'object',
    blurb:
      'Stone, level, and roped off. Nobody knows yet what it is for, which the committee considers ' +
      'progress. One of two works the Mysterious Object needs.',
  },
  mysteriousObject: {
    id: 'mysteriousObject',
    name: 'The Mysterious Object',
    faction: 'human',
    cost: 480,
    upkeep: 0,
    victory: 'object',
    blurb:
      'Grey, about the size of a barrel, with one button on top. Only in a city holding the ' +
      'Committee Chamber or the Pedestal, once both stand. Nobody is told what the button does. Hold the city ' +
      'long enough and somebody finds out.',
  },
  // ------------------------------------------------- section 125: the Hivekin
  //
  // The ending, in section 110's shape: two lesser works buildable once the
  // advance is known, then the final one, only in a Hive already holding one of
  // them and only once both stand.
  //
  // **Six hundred shields against the other two endings' thousand**, and the
  // reason is the thing it is paid out of: 3.5 Hives of 5.5 citizens, where an
  // empire pays out of six cities of eight. Measured both ways round -- while
  // the road to the advance was long this price was not a lever at all (at 40%
  // of it they still built 0.2 works, because cheapening the end of a road
  // nobody walks changes nothing), and once the road was shortened it was worth
  // double: 2 wins in 12 at a thousand shields, 4 at six hundred. See the note
  // on `all-is-the-hive` in techs.ts for the road.
  moltingChamber: {
    id: 'moltingChamber',
    name: 'The Molting Chamber',
    faction: 'hivekin',
    cost: 180,
    upkeep: 0,
    endingPart: 'hive',
    blurb:
      'A space built for shedding what no longer fits. The Hive has never needed one this ' +
      "large before. One of two works the Second Queen's Shell needs.",
  },
  secondFeeding: {
    id: 'secondFeeding',
    name: 'The Second Feeding',
    faction: 'hivekin',
    cost: 180,
    upkeep: 0,
    endingPart: 'hive',
    blurb:
      'Enough was gathered to feed one Queen. This gathers enough for two. One of two works ' +
      "the Second Queen's Shell needs.",
  },
  secondQueenShell: {
    id: 'secondQueenShell',
    name: "The Second Queen's Shell",
    faction: 'hivekin',
    cost: 240,
    upkeep: 0,
    victory: 'hive',
    blurb:
      'Two queens should not have been possible. This makes it possible anyway. Only in a Hive ' +
      'holding the Molting Chamber or the Second Feeding, once both stand. Hold the Hive long ' +
      'enough and the shapes decide there was only ever the one Hive after all.',
  },

  // ------------------------------------------------------------ section 152
  //
  // The Unbound's ten, from `NEW_FACTION_BUILDINGS.md`: the same ten slots
  // every faction since the Hive has had, and the mechanical fields copied
  // **from the Hive's equivalent slot unchanged**, deliberately, exactly as
  // section 142 did for the Wandering Folk. All five sides stay on one
  // economy and a faction cannot be accidentally buffed by being written
  // last.
  //
  // Register is the bible's: *"flat, clinical and faintly bureaucratic about
  // being dead. Nothing is celebrated; things are simply noted, and kept."*
  drawnLine: {
    id: 'drawnLine',
    name: 'The Drawn Line',
    faction: 'unbound',
    cost: 60,
    upkeep: 1,
    defenseMult: 2,
    negatedBySiege: true,
    blurb: 'A line was drawn. Most things have respected it.',
  },
  quietRoom: {
    id: 'quietRoom',
    name: 'The Quiet Room',
    faction: 'unbound',
    cost: 40,
    upkeep: 1,
    contentBonus: 2,
    blurb: 'Nothing is expected here. This is found restful, by those who find things.',
  },
  longConversation: {
    id: 'longConversation',
    name: 'The Long Conversation',
    faction: 'unbound',
    cost: 90,
    upkeep: 2,
    contentBonus: 3,
    blurb:
      'It began some time ago. It has not been interrupted, and nobody has ' +
      'finished a sentence.',
  },
  appointedPlace: {
    id: 'appointedPlace',
    name: 'The Appointed Place',
    faction: 'unbound',
    cost: 30,
    upkeep: 1,
    contentBonus: 2,
    garrisonNeeded: 2,
    blurb: 'Somewhere to be stood in. It is the same spot every time.',
  },
  wallOfNames: {
    id: 'wallOfNames',
    name: 'The Wall of Names',
    faction: 'unbound',
    cost: 60,
    upkeep: 1,
    scienceBonus: 0.5,
    blurb: 'Every name that has been carried here. Most of them can still be read.',
  },
  sigilStacks: {
    id: 'sigilStacks',
    name: 'The Sigil Stacks',
    faction: 'unbound',
    cost: 130,
    upkeep: 2,
    scienceBonus: 0.5,
    blurb: 'Each mark says which way to come back. There are, by now, a great many.',
  },
  titheBasin: {
    id: 'titheBasin',
    name: 'The Tithe Basin',
    faction: 'unbound',
    cost: 60,
    upkeep: 1,
    goldBonus: 1,
    blurb: 'Left by the living, collected by everyone else.',
  },
  titheVault: {
    id: 'titheVault',
    name: 'The Tithe Vault',
    faction: 'unbound',
    cost: 110,
    upkeep: 2,
    goldBonus: 0.5,
    blurb: 'Larger than the basin, and for the same reason.',
  },
  farDoor: {
    id: 'farDoor',
    name: 'The Far Door',
    faction: 'unbound',
    cost: 50,
    upkeep: 1,
    suppliesArmy: true,
    blurb:
      'A doorway standing alone in a field. It leads here from somewhere ' +
      'else, and does not need a wall.',
  },
  rehearsalFloor: {
    id: 'rehearsalFloor',
    name: 'The Rehearsal Floor',
    faction: 'unbound',
    cost: 100,
    upkeep: 2,
    startingRank: 2,
    needs: 'barracks',
    blurb: 'They have done this before. They are now doing it properly.',
  },
  // The two that reform runs on. Not calm, not gold, not study: these exist
  // so a dispersed spirit has somewhere to come back to, and `dispersal.ts`
  // is the only thing that reads them.
  retrievalCircle: {
    id: 'retrievalCircle',
    name: 'The Retrieval Circle',
    faction: 'unbound',
    cost: 70,
    upkeep: 1,
    blurb:
      'Somewhere to come back to, so long as nobody is standing in it. ' +
      'This has proved harder to arrange than expected.',
  },
  anchorTotem: {
    id: 'anchorTotem',
    name: 'The Anchor Totem',
    faction: 'unbound',
    cost: 120,
    upkeep: 2,
    blurb:
      'Driven in once, properly. Whatever is coming back will find it, and ' +
      'does not mind who else is here.',
  },

  // ------------------------------------------------------------ section 146
  //
  // The Wandering Folk's road out, and the fourth side to have one. Same
  // three-work pattern as the other three, with the costs `WANDERERS_PLAN.md`
  // gives -- 300, 300, 400, which is dearer than anybody else's and the one
  // place this faction's quarter-more premium is written into the works
  // themselves rather than into the units.
  //
  // The bible lists this twice and disagrees with itself. Its open-questions
  // section says the trigger *"isn't defined yet"* and wonders about a share
  // of the map's units being recruited; its ending-buildings section then
  // specifies the ordinary pattern exactly, down to prereqs and costs. The
  // concrete one wins -- and it is also the right answer, because an ending
  // that fires off a recruitment count would be a second victory rule nobody
  // else plays by, on top of a mechanic that is already theirs alone.
  lastMap: {
    id: 'lastMap',
    name: 'The Last Map',
    faction: 'wandering',
    cost: 300,
    upkeep: 0,
    endingPart: 'circle',
    blurb:
      'Every corner has a mark on it now. Nobody has needed to draw a new line in some ' +
      'time. One of two works the Circling Caravan needs.',
  },
  standingOrder: {
    id: 'standingOrder',
    name: 'The Standing Order',
    faction: 'wandering',
    cost: 300,
    upkeep: 0,
    endingPart: 'circle',
    blurb:
      'A contract that never ends, because there was never a place to end it at. Everyone ' +
      'still gets paid on schedule regardless. One of two works the Circling Caravan needs.',
  },
  circlingCaravan: {
    id: 'circlingCaravan',
    name: 'The Circling Caravan',
    faction: 'wandering',
    cost: 400,
    upkeep: 0,
    victory: 'circle',
    blurb:
      'Everywhere there was to reach has been reached. Without anywhere left, the whole ' +
      'caravan starts moving in a slow, permanent circle instead. Only in a settlement ' +
      'holding the Last Map or the Standing Order, once both stand. Hold it long enough ' +
      'and everyone simply agrees the circle is the destination.',
  },

  // Section 111: the follies. One of each, ever -- shared ones once in the whole
  // game, the rest once per empire. Priced by how deep the advance they ride on
  // sits: 150 behind one of 45 to 85 beakers, 200 behind 100 to 130, 250 beyond.
  // No upkeep; the price is the shields. Flavour is Jeremy's, from the follies bible.
  firstLedger: {
    id: 'firstLedger',
    name: 'The First Ledger',
    faction: 'both',
    cost: 150,
    upkeep: 0,
    folly: 'world',
    goldBonus: 0.5,
    blurb:
      'The original tax record, preserved out of either reverence or spite. It has been copied so ' +
      'many times nobody is sure the original numbers were ever right.',
  },
  yellingWall: {
    id: 'yellingWall',
    name: 'The Yelling Wall',
    faction: 'both',
    cost: 200,
    upkeep: 0,
    folly: 'world',
    citySight: 2,
    sightUnblocked: true,
    blurb:
      'A wall so tall both sides claim credit for the idea. Nobody remembers who suggested it ' +
      "first. Everyone remembers whose idea it definitely wasn't.",
  },
  longPeaceMonument: {
    id: 'longPeaceMonument',
    name: 'The Long Peace',
    faction: 'both',
    cost: 250,
    upkeep: 0,
    folly: 'world',
    empireContent: 1,
    blurb:
      'Erected during a brief, genuine cessation of hostilities, and finished just after ' +
      'hostilities resumed. The plaque was updated. The peace was not.',
  },
  skyArgumentSpire: {
    id: 'skyArgumentSpire',
    name: 'The Argument With The Sky',
    faction: 'both',
    cost: 250,
    upkeep: 0,
    folly: 'world',
    spellTurnsMult: 2,
    blurb:
      'Fire and cold were each mastered separately and immediately turned on each other. The ' +
      'weather has held a grudge ever since.',
  },
  // ------------------------------------------------------------ section 146
  //
  // The Wandering Folk's three, and the split the bible asks for: one civ,
  // two city. Each rides on an advance they would learn anyway, which is the
  // convention section 111 set.
  //
  // All three are about Recruit rather than about building, deliberately --
  // the bible resolves its own open question that way, *"since that's the
  // half of the faction's whole identity this building's flavor is actually
  // about"*.
  firstCaravan: {
    id: 'firstCaravan',
    name: 'The First Caravan',
    faction: 'wandering',
    cost: 150,
    upkeep: 0,
    folly: 'faction',
    recruitOdds: 0.15,
    blurb:
      'The original route the founders walked, before there was a name for what they were ' +
      'doing. It is walked still, though never on purpose: every Caravan since has somehow ' +
      'ended up sitting on part of it.',
  },
  headCount: {
    id: 'headCount',
    name: 'The Head Count',
    faction: 'wandering',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    builtRanks: 1,
    blurb:
      'One head, properly counted, is worth more than outsiders expect. This has now been ' +
      'formally recorded, in this settlement specifically, for the benefit of anyone still ' +
      'doubting it.',
  },
  unnamedMarker: {
    id: 'unnamedMarker',
    name: 'The Unnamed Marker',
    faction: 'wandering',
    cost: 250,
    upkeep: 0,
    folly: 'faction',
    builtMoves: 1,
    blurb:
      'Where the guide was found still is not written down anywhere. A marker was raised ' +
      'regardless, pointing at nothing in particular, which everyone involved agrees is ' +
      'roughly accurate.',
  },
  loudestRock: {
    id: 'loudestRock',
    name: 'The Loudest Rock',
    faction: 'orc',
    cost: 150,
    upkeep: 0,
    folly: 'faction',
    builtAttack: 1,
    blurb:
      'The biggest thinking-rock ever raised, mostly so orcs can shout at it from further away. ' +
      'It has never once thought anything back. Not to be confused with the Considerably Bigger ' +
      'Rock, a completely different rock.',
  },
  bonepit: {
    id: 'bonepit',
    name: 'The Bonepit',
    faction: 'orc',
    cost: 150,
    upkeep: 0,
    folly: 'faction',
    builtRanks: 1,
    blurb:
      'An ever-growing monument built from every enemy the Horde has definitely, actually, ' +
      'historically beaten. The pit does not lie, though it has been known to exaggerate.',
  },
  bargainStone: {
    id: 'bargainStone',
    name: 'The Bargain Stone',
    faction: 'orc',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    bargainTakes: 1 / 3,
    blurb:
      'A record of every deal struck with the dead, kept mostly so nobody has to remember the ' +
      'terms out loud a second time.',
  },
  longMarchRoad: {
    id: 'longMarchRoad',
    name: 'The Long March',
    faction: 'orc',
    cost: 250,
    upkeep: 0,
    folly: 'faction',
    homeMoves: 1,
    blurb:
      'The Horde has finished writing down its one plan for the late game and has now also ' +
      'finished walking there ahead of schedule.',
  },
  unfinishedCathedral: {
    id: 'unfinishedCathedral',
    name: 'The Unfinished Cathedral',
    faction: 'human',
    cost: 150,
    upkeep: 0,
    folly: 'faction',
    contentBonus: 1,
    blurb:
      'Construction has been "almost done" for two generations. The committee overseeing its ' +
      'completion has itself required a committee.',
  },
  rumblingArchive: {
    id: 'rumblingArchive',
    name: 'The Rumbling Archive',
    faction: 'human',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    builtReach: 1,
    blurb:
      "Every recorded instance of someone's voice making something true. Cross-referencing it " +
      'against actual events has been deliberately deprioritised.',
  },
  longVigilShrine: {
    id: 'longVigilShrine',
    name: 'The Long Vigil',
    faction: 'human',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    mountedDefense: 1,
    blurb: 'A vow, sworn once, renewed constantly, and never once actually finished being kept.',
  },
  learnedCommittee: {
    id: 'learnedCommittee',
    name: 'The Learned Committee',
    faction: 'human',
    cost: 250,
    upkeep: 0,
    folly: 'faction',
    unitSight: 1,
    blurb:
      "A standing body convened to watch the horizon on the Kingdom's behalf. It has produced " +
      'fourteen reports and no horizon.',
  },
  // Section 125: three rather than four, which the Hivekin have not noticed.
  // One civ-wide and two city-wide, read through `empireBonus` and
  // `cityFollyBonus` respectively, exactly as the other eight are.
  oldQueensShell: {
    id: 'oldQueensShell',
    name: "The Old Queen's Shell",
    faction: 'hivekin',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    casteAttack: 1,
    blurb:
      'The molted exoskeleton of the very first, immobile founding Queen, enshrined exactly ' +
      'where her Hive still stands. A Princess is a queen already being kept in reserve; this ' +
      'is what she is being kept in reserve for.',
  },
  /*
   * Section 136: the three the Hive never had.
   *
   * `faction: 'both'` meant "the two sides" when there were two, and nothing
   * re-read those entries when a third arrived -- so Wall Building, Joy Making
   * and Hammers of Glory each unlocked a Horde building and a Kingdom building
   * and nothing at all for the Hivekin. Three cards that cost ninety beakers
   * and rendered blank.
   *
   * Priced and costed exactly as their opposite numbers, deliberately: this is
   * closing a hole, not tuning a faction. If the Hive should be better or worse
   * at keeping calm than the Kingdom, that is a decision to make on purpose and
   * measure, not one to smuggle in through a building that had to exist anyway.
   */
  theNarrowing: {
    id: 'theNarrowing',
    name: 'The Narrowing',
    faction: 'hivekin',
    cost: 60,
    upkeep: 1,
    defenseMult: 2,
    negatedBySiege: true,
    blurb:
      'The ways in were made smaller. Nothing was added; a great deal was taken away, ' +
      'which turned out to be the same thing done more cheaply.',
  },
  theHum: {
    id: 'theHum',
    name: 'The Hum',
    faction: 'hivekin',
    cost: 40,
    upkeep: 1,
    contentBonus: 2,
    blurb:
      'A chamber shaped so the sound the hive is always making comes back to it. ' +
      'Two shapes stop whatever it is they do instead of complaining.',
  },
  theScentRecord: {
    id: 'theScentRecord',
    name: 'The Scent Record',
    faction: 'hivekin',
    cost: 60,
    upkeep: 1,
    scienceBonus: 0.5,
    blurb:
      'What was learned is laid down in a wall and left there. Anything that walks past ' +
      'it knows what it says, and nobody has to be taught twice.',
  },
  theDeeperHum: {
    id: 'theDeeperHum',
    name: 'The Deeper Hum',
    faction: 'hivekin',
    cost: 90,
    upkeep: 2,
    contentBonus: 3,
    blurb:
      'The same note, carried further down and held longer. Three shapes find they have ' +
      'nothing they wished to raise.',
  },
  theStandingNiche: {
    id: 'theStandingNiche',
    name: 'The Standing Niche',
    faction: 'hivekin',
    cost: 30,
    upkeep: 1,
    contentBonus: 2,
    garrisonNeeded: 2,
    blurb:
      'A hollow by the door, exactly large enough for two of the sturdier shapes to ' +
      'stand in without being in the way. They are in it now.',
  },
  theDeepRecord: {
    id: 'theDeepRecord',
    name: 'The Deep Record',
    faction: 'hivekin',
    cost: 130,
    upkeep: 2,
    scienceBonus: 0.5,
    blurb:
      'Everything the hive has ever known, laid down in order, further down than anything ' +
      'needs to go. Nothing is thrown away. Nothing is read twice, either.',
  },
  theRenderingPit: {
    id: 'theRenderingPit',
    name: 'The Rendering Pit',
    faction: 'hivekin',
    cost: 60,
    upkeep: 1,
    goldBonus: 1,
    blurb:
      'Things that are no longer any particular use go in, and come out as the sort of ' +
      'thing other people will accept in exchange for grain.',
  },
  theGreaterRendering: {
    id: 'theGreaterRendering',
    name: 'The Greater Rendering',
    faction: 'hivekin',
    cost: 110,
    upkeep: 2,
    goldBonus: 0.5,
    blurb:
      'The same pit, worked out properly. It now takes in things that were still being ' +
      'used, which was found to be more efficient and is not discussed.',
  },
  theForwardBurrow: {
    id: 'theForwardBurrow',
    name: 'The Forward Burrow',
    faction: 'hivekin',
    cost: 50,
    upkeep: 1,
    suppliesArmy: true,
    blurb:
      'A hole dug at the far end of everything, with food in it. Shapes that reach it are ' +
      'fed. Shapes that do not reach it were going to be a loss anyway.',
  },
  theHardeningFloor: {
    id: 'theHardeningFloor',
    name: 'The Hardening Floor',
    faction: 'hivekin',
    cost: 100,
    upkeep: 2,
    startingRank: 2,
    needs: 'barracks',
    blurb:
      'New shapes are walked across it until the soft parts are not soft. They arrive ' +
      'finished, and a little quieter than the ones that were not.',
  },
  // --------------------------------------------- section 142: the Wandering Folk
  //
  // The same ten slots the Hivekin got, filled from
  // `NEW_FACTION_BUILDINGS.md`: defence, calm 2, calm 3, posting, study x2,
  // gold x2, supply, veterancy. Ids, names, costs, unlocks and flavour are
  // Jeremy's; the mechanical fields are copied **from the Hive's equivalent
  // slot unchanged**, deliberately, so all four sides stay on one economy and
  // a faction cannot be accidentally buffed by being written later.
  //
  // `tech-useful.test.ts` is what insisted on these. With the units and the
  // tech fork in and no buildings at all, it reported that the Wandering Folk
  // "cannot keep a city calm, cannot study, cannot make gold, cannot supply
  // an army abroad, cannot send units out hardened" -- a faction that could
  // fight and never develop. Four of its tests caught it at once.
  circledWagons: {
    id: 'circledWagons',
    name: 'The Circled Wagons',
    faction: 'wandering',
    cost: 60,
    upkeep: 1,
    defenseMult: 2,
    negatedBySiege: true,
    blurb: 'Defence, achieved by parking carefully and chaining the wheels together.',
  },
  sharedFire: {
    id: 'sharedFire',
    name: 'The Shared Fire',
    faction: 'wandering',
    cost: 40,
    upkeep: 1,
    contentBonus: 2,
    blurb: 'Anyone may sit. Nobody asks what you brought.',
  },
  bigTent: {
    id: 'bigTent',
    name: 'The Big Tent',
    faction: 'wandering',
    cost: 90,
    upkeep: 2,
    contentBonus: 3,
    blurb: 'Everyone is welcome. The terms are printed on the flap, in very small writing.',
  },
  hiredPost: {
    id: 'hiredPost',
    name: 'The Hired Post',
    faction: 'wandering',
    cost: 30,
    upkeep: 1,
    contentBonus: 2,
    garrisonNeeded: 2,
    blurb: 'One guard, engaged by the night, renewable if the night goes well.',
  },
  routeBook: {
    id: 'routeBook',
    name: 'The Route Book',
    faction: 'wandering',
    cost: 60,
    upkeep: 1,
    scienceBonus: 0.5,
    blurb: 'Every road anyone has ever taken, and what it cost them.',
  },
  knottedRecord: {
    id: 'knottedRecord',
    name: 'The Knotted Record',
    faction: 'wandering',
    cost: 130,
    upkeep: 2,
    scienceBonus: 0.5,
    blurb: 'Nothing here was written down. Everybody agrees on what it says.',
  },
  strongboxWagon: {
    id: 'strongboxWagon',
    name: 'The Strongbox Wagon',
    faction: 'wandering',
    cost: 60,
    upkeep: 1,
    goldBonus: 1,
    blurb: 'The one wagon nobody is allowed to borrow, and the only one with a lock.',
  },
  tollPost: {
    id: 'tollPost',
    name: 'The Toll Post',
    faction: 'wandering',
    cost: 110,
    upkeep: 2,
    goldBonus: 0.5,
    blurb:
      'It has never been established what it is a toll *on*. Payment is accepted regardless.',
  },
  waystation: {
    id: 'waystation',
    name: 'The Waystation',
    faction: 'wandering',
    cost: 50,
    upkeep: 1,
    suppliesArmy: true,
    blurb:
      'A cache for whoever comes next. Whoever comes next is expected to leave it fuller.',
  },
  wagerRing: {
    id: 'wagerRing',
    name: 'The Wager Ring',
    faction: 'wandering',
    cost: 100,
    upkeep: 2,
    startingRank: 2,
    needs: 'barracks',
    blurb: 'Veterans are made here, mostly because there is money riding on it.',
  },
  broodwarmth: {
    id: 'broodwarmth',
    name: 'The Broodwarmth',
    faction: 'hivekin',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    unitDiscount: 0.15,
    blurb:
      'Four arms produce faster than two. This was always true. It has now been built ' +
      'somewhere permanent, mostly so it stops needing to be explained to new shapes as they ' +
      'are finished.',
  },
  undercity: {
    id: 'undercity',
    name: 'The Undercity',
    faction: 'hivekin',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    cityShields: 2,
    blurb:
      'The tunnels went further down than the Hive above them ever needed to. Eventually the ' +
      'Hive noticed and extended downward to match, on the theory that unused space is a shape ' +
      'problem like any other.',
  },
  // Section 152: the Unbound's three follies, one civ-wide and two city-wide,
  // which is the split the Hive and the Wandering Folk both have. Read through
  // `empireBonus` and `cityFollyBonus` exactly as the other eleven are.
  //
  // All three ride on an advance that already existed, which is the convention
  // and here also the joke: nothing this faction builds is new, it is a thing
  // that happened once and was afterwards kept.
  firstBinding: {
    id: 'firstBinding',
    name: 'The First Binding',
    faction: 'unbound',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    reformOdds: 0.08,
    blurb:
      'The very first one that came back, before there was a circle or a sigil or anybody ' +
      'who could say why it had worked. The stone it was standing beside is worn smoother ' +
      'than the others, and nobody has established whether that is the cause.',
  },
  standingWatch: {
    id: 'standingWatch',
    name: 'The Standing Watch',
    faction: 'unbound',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    garrisonDefense: 2,
    blurb:
      'It no longer knows what it was guarding. It has selected this settlement instead, on ' +
      'its own initiative, and will not be talked out of it.',
  },
  readTerms: {
    id: 'readTerms',
    name: 'The Read Terms',
    faction: 'unbound',
    cost: 200,
    upkeep: 0,
    folly: 'faction',
    boundDiscount: 0.15,
    blurb:
      'The terms were read, in full, by somebody. That record is kept here. Nobody has ' +
      'needed to consult it since, which is either reassuring or exactly the problem.',
  },
  // Section 152's three works, the fifth road out. Same pattern as the other
  // four, and the same reason: section 146 settled that an ending which fired
  // off a bespoke counter would be a second victory rule nobody else plays by.
  //
  // **This one does do something while it counts down**, which the Circling
  // Caravan does not. Jeremy picked "converts what it kills" from four shapes
  // and the reasoning is in `UNBOUND_PLAN.md`: it is an extension of the
  // faction's own rule rather than a new system beside it -- dispersal and
  // reform already bring their units back, and the ending turns that on
  // everybody else's. See `GUEST_LIST` in `sim/dispersal.ts`.
  guestList: {
    id: 'guestList',
    name: 'The Guest List',
    faction: 'unbound',
    cost: 300,
    upkeep: 0,
    endingPart: 'party',
    blurb:
      'Every name added to it has, eventually, attended. This has not yet failed to be ' +
      'true. One of two works the Spirit Party needs.',
  },
  standingInvitation: {
    id: 'standingInvitation',
    name: 'The Standing Invitation',
    faction: 'unbound',
    cost: 300,
    upkeep: 0,
    endingPart: 'party',
    blurb:
      'It was extended once, to the living generally. It has not been possible to retract ' +
      'since. One of two works the Spirit Party needs.',
  },
  spiritParty: {
    id: 'spiritParty',
    name: 'The Spirit Party',
    faction: 'unbound',
    cost: 400,
    upkeep: 0,
    victory: 'party',
    blurb:
      'A party thrown for every guest who has ever died, and now, gradually, for those who ' +
      'have not yet. Only in a settlement holding the Guest List or the Standing ' +
      'Invitation, once both stand. While it is being thrown, anybody who falls near it ' +
      'joins the Unbound, which is not considered a condition of attendance. Hold the ' +
      'settlement long enough and eventually nobody there recalls it being optional.',
  },
};


export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export function buildingsForFaction(faction: FactionId): BuildingDef[] {
  return BUILDING_IDS.map((id) => BUILDINGS[id]).filter(
    (b) => b.faction === 'both' || b.faction === faction,
  );
}
