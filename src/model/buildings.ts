import type { BuildingId, FactionId } from './types';

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
  victory?: 'portal' | 'object';
  /**
   * One of the two lesser works an ending needs before its final work can be
   * begun. Any city, one per empire, never for gold. See `sim/endings.ts`.
   */
  endingPart?: 'portal' | 'object';
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
  /** Sight added to every one of the holder's units. */
  unitSight?: number;
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
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export function buildingsForFaction(faction: FactionId): BuildingDef[] {
  return BUILDING_IDS.map((id) => BUILDINGS[id]).filter(
    (b) => b.faction === 'both' || b.faction === faction,
  );
}
