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
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

export function buildingsForFaction(faction: FactionId): BuildingDef[] {
  return BUILDING_IDS.map((id) => BUILDINGS[id]).filter(
    (b) => b.faction === 'both' || b.faction === faction,
  );
}
