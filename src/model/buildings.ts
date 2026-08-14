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
    faction: 'both',
    cost: 60,
    upkeep: 1,
    defenseMult: 2,
    blurb: 'Doubles the defence of everyone inside. Astonishingly effective for a pile of rocks.',
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
    goldBonus: 0.5,
    blurb:
      'The goblins love gold. It has not yet occurred to any of them that ' +
      'somebody else might also love gold.',
  },
  market: {
    id: 'market',
    name: 'Simple Market',
    faction: 'human',
    cost: 60,
    upkeep: 1,
    goldBonus: 0.5,
    blurb:
      'Buy and sell, but only one thing at a time. A queue forms. In due ' +
      'course the queue becomes the point.',
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
