import type { TerrainId } from './types';

export interface TerrainSpecial {
  name: string;
  food: number;
  shields: number;
  trade: number;
}

export interface TerrainDef {
  id: TerrainId;
  name: string;
  /** Movement points to enter. Units with any movement left can always move. */
  moveCost: number;
  /** Defence multiplier for a unit standing here. 1 = no help. */
  defense: number;
  food: number;
  shields: number;
  trade: number;
  /** Water tiles cannot be entered by land units. */
  water: boolean;
  /** Cities cannot be founded here. */
  noCity: boolean;
  /** Blocks line of sight past this tile. */
  blocksSight: boolean;
  /**
   * Which terrain bleeds over which at a shared edge.
   *
   * The higher number wins and feathers itself into its neighbour, so grass
   * softens into sand, rock crumbles onto grass, and land forms a shoreline
   * against water rather than a hard square edge.
   */
  blend: number;
  /** Base fill colour for the procedural tile art. */
  base: string;
  /** Secondary colour for speckle / detail passes. */
  detail: string;
  /** The bonus resource that sometimes appears on this terrain. */
  special: TerrainSpecial | null;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  deep: {
    id: 'deep',
    name: 'Deep Water',
    moveCost: 1,
    defense: 1,
    food: 1,
    shields: 0,
    trade: 2,
    water: true,
    noCity: true,
    blocksSight: false,
    blend: 0,
    base: '#173650',
    detail: '#1e4462',
    special: { name: 'Something Enormous', food: 3, shields: 0, trade: 2 },
  },
  water: {
    id: 'water',
    name: 'Shallows',
    moveCost: 1,
    defense: 1,
    food: 2,
    shields: 0,
    trade: 2,
    water: true,
    noCity: true,
    blocksSight: false,
    blend: 1,
    base: '#2a6b8f',
    detail: '#3d86ab',
    special: { name: 'Fish, Probably', food: 3, shields: 0, trade: 2 },
  },
  grass: {
    id: 'grass',
    name: 'Grassland',
    moveCost: 1,
    defense: 1,
    food: 2,
    shields: 1,
    trade: 0,
    water: false,
    noCity: false,
    blocksSight: false,
    blend: 4,
    base: '#5b8a3c',
    detail: '#6e9f47',
    special: { name: 'Suspiciously Good Grass', food: 3, shields: 1, trade: 1 },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    moveCost: 2,
    defense: 1.25,
    food: 1,
    shields: 2,
    trade: 0,
    water: false,
    noCity: false,
    blocksSight: true,
    blend: 5,
    base: '#2f5a2c',
    detail: '#417036',
    special: { name: 'Big Angry Game', food: 3, shields: 2, trade: 0 },
  },
  hills: {
    id: 'hills',
    name: 'Hills',
    moveCost: 2,
    defense: 2,
    food: 1,
    shields: 2,
    trade: 0,
    water: false,
    noCity: false,
    blocksSight: false,
    blend: 6,
    base: '#7a7346',
    detail: '#8f8754',
    special: { name: 'Shiny Rocks', food: 1, shields: 4, trade: 0 },
  },
  mountains: {
    id: 'mountains',
    name: 'Mountains',
    moveCost: 3,
    defense: 3,
    food: 0,
    shields: 1,
    trade: 0,
    water: false,
    noCity: true,
    blocksSight: true,
    blend: 7,
    base: '#6b625c',
    detail: '#9a9089',
    special: { name: 'A Very Deep Hole', food: 0, shields: 2, trade: 6 },
  },
  swamp: {
    id: 'swamp',
    name: 'Swamp',
    moveCost: 2,
    defense: 1.5,
    food: 1,
    shields: 0,
    trade: 0,
    water: false,
    noCity: false,
    blocksSight: false,
    blend: 2,
    base: '#47563a',
    detail: '#586a44',
    special: { name: 'Smells Like Money', food: 1, shields: 4, trade: 0 },
  },
  desert: {
    id: 'desert',
    name: 'Wastes',
    moveCost: 1,
    defense: 1,
    food: 0,
    shields: 1,
    trade: 1,
    water: false,
    noCity: false,
    blocksSight: false,
    blend: 3,
    base: '#bfa568',
    detail: '#d5bc80',
    special: { name: 'Bones Worth Something', food: 0, shields: 1, trade: 5 },
  },
};

export const TERRAIN_IDS = Object.keys(TERRAIN) as TerrainId[];

export function terrainAt(terrain: TerrainId[], index: number): TerrainDef {
  return TERRAIN[terrain[index]];
}

/** Land tiles a land unit may enter. */
export function isLand(id: TerrainId): boolean {
  return !TERRAIN[id].water;
}
