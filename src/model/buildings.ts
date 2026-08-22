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
   * Extends supply to this city, so units near it fight and heal normally.
   *
   * Without one, only the capital supplies anything -- which is what stops a
   * conquest from feeding itself. Taking a city gives you the ground; making
   * it useful to the army standing on it costs you the shields.
   */
  suppliesArmy?: boolean;
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
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export function buildingsForFaction(faction: FactionId): BuildingDef[] {
  return BUILDING_IDS.map((id) => BUILDINGS[id]).filter(
    (b) => b.faction === 'both' || b.faction === faction,
  );
}
