import type { TerrainId } from './types';

/**
 * How often a tile that could carry a special actually does.
 *
 * Named because the Orcpedia quotes it. A number a player is told about should
 * not also be a literal buried in the generator, or the two drift apart and the
 * encyclopedia starts lying quietly.
 */
export const SPECIALS = {
  /**
   * Chance a tile that could carry a special does.
   *
   * A mutable object rather than a bare number so a sweep can move it, in the
   * manner of section 59. Section 66 said to measure what the existing eight are
   * worth **before** adding new kinds of special on top, since adding to an
   * unmeasured baseline is how a sweep becomes unreadable -- which sections 17
   * and 21 both learned the hard way.
   */
  chance: 0.06,

  /**
   * Whether a special may be a **rule** rather than a bigger number.
   *
   * Off, a defensive special still occupies its slot and still yields what it
   * yields -- which for these three is exactly what the bare ground yields --
   * and simply stops changing the defence. So an arm without this measures the
   * rule and nothing else, rather than measuring a different map.
   */
  rules: true,

  /**
   * Whether a special that is a rule is rolled onto the map at all.
   *
   * Separate from `rules`, and the difference is the whole measurement. Turning
   * the *rule* off leaves the tile in the roll, so both arms still split grass,
   * forest and desert between two specials -- which means the **yield** special
   * turns up about half as often on that ground either way. Section 93 says that
   * dilution is the balance-relevant change, so an arm has to be able to take
   * the tiles out of the roll entirely, not merely make them inert.
   */
  ruleTiles: true,
};

export interface TerrainSpecial {
  name: string;
  food: number;
  shields: number;
  trade: number;
  /**
   * Defence multiplier for whoever stands here, replacing the terrain's own.
   *
   * The first special that is a **rule** rather than a bigger number. Section
   * 93 measured the yield ones and found them a Kingdom lever -- they hand out
   * trade, and the Kingdom converts trade better -- so a special that touches
   * no yields at all is the direction that does not move the faction balance.
   */
  defense?: number;
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
  /**
   * Open sea rather than the shallows, for the one rule that tells them apart.
   *
   * Section 122: a wader may stand in shallow water and may not cross this.
   * Absent means shallow, so only the deep has to say so.
   */
  deepWater?: boolean;
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
  /**
   * The bonuses that can appear on this terrain, and which one a tile got is
   * stored per tile.
   *
   * A list rather than one, so the same ground can surprise somebody twice --
   * which is most of what makes a map worth reading. Empty means this terrain
   * never carries anything.
   */
  specials: TerrainSpecial[];
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  deep: {
    id: 'deep',
    deepWater: true,
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
    specials: [{ name: 'Something Enormous', food: 3, shields: 0, trade: 2 }],
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
    specials: [{ name: 'Fish, Probably', food: 3, shields: 0, trade: 2 }],
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
    specials: [
      { name: 'Suspiciously Good Grass', food: 3, shields: 1, trade: 1 },
      { name: 'A Very Rude Boulder', food: 2, shields: 1, trade: 0, defense: 2 },
    ],
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
    specials: [
      { name: 'Big Angry Game', food: 3, shields: 2, trade: 0 },
      { name: 'The Tanglewood', food: 1, shields: 2, trade: 0, defense: 2.25 },
    ],
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
    specials: [{ name: 'Shiny Rocks', food: 1, shields: 4, trade: 0 }],
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
    specials: [{ name: 'A Very Deep Hole', food: 0, shields: 2, trade: 6 }],
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
    specials: [{ name: 'Smells Like Money', food: 1, shields: 4, trade: 0 }],
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
    specials: [
      { name: 'Bones Worth Something', food: 0, shields: 1, trade: 5 },
      { name: 'The Only Cover For Miles', food: 0, shields: 1, trade: 1, defense: 2 },
    ],
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

/**
 * The special a tile is carrying, if any.
 *
 * `state.specials[i]` is a **one-based index** into the terrain's list, and
 * zero for nothing. One-based so that a save written when every terrain had a
 * single special -- where the value was a flag reading 1 -- still names that
 * same first special, and nothing had to be versioned.
 */
export function specialAt(terrain: TerrainId, index: number): TerrainSpecial | null {
  const list = TERRAIN[terrain]?.specials ?? [];
  return index > 0 && index <= list.length ? list[index - 1] : null;
}

/** The specials this ground may actually be rolled, as one-based indices. */
export function rollableSpecials(terrain: TerrainId): number[] {
  const list = TERRAIN[terrain]?.specials ?? [];
  const out: number[] = [];
  for (let n = 0; n < list.length; n++) {
    if (!SPECIALS.ruleTiles && list[n].defense !== undefined) continue;
    out.push(n + 1);
  }
  return out;
}

/**
 * Defence multiplier for a tile, which a special may override.
 *
 * Asked through here rather than off `TERRAIN[t].defense` directly, so a
 * special that is a rule reaches combat without every caller having to know
 * that specials can be rules now.
 */
export function defenseOf(terrain: TerrainId, index: number): number {
  const ground = TERRAIN[terrain].defense;
  if (!SPECIALS.rules) return ground;
  return specialAt(terrain, index)?.defense ?? ground;
}
