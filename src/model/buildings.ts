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
    // object in the way, not a fortification.
    defenseMult: 1.35,
    blurb:
      "This would have been a marvellous ranged weapon if anybody here " +
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

  // ------------------------------------------------------------- treasuries
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
