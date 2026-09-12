import type { BuildingDef } from './buildings';
import type { BuildingId, FactionId } from './types';

/**
 * Civic Pride: the capital, built a piece at a time.
 *
 * Section 67, and Civ2's palace wings. The capital is a base chassis with five
 * independent modules hung on it -- a watchtower at one corner, a gate at the
 * front, a wing at one side, grounds in front and banners along the roofline --
 * each with three tiers, and the player picks which to spend on. Both sides get
 * the same five categories in their own materials, so nobody has a module the
 * other cannot answer.
 *
 * **It does nothing.** No yields, no defence, no content, no upkeep: a module is
 * a picture of how well it is going. Section 67 asked for it in that order --
 * decorative first, measured second, and only then a word about yields -- because
 * a palace that pays is a multiplier on the capital, and sections 4c and 4e
 * measured that class of thing amplifying whoever is already ahead. It is also
 * the reason the AI never builds one: shields spent on a view are shields, and an
 * AI doing that would be a balance change wearing a hat.
 *
 * The art is built for compositing rather than as one evolving picture, because
 * an image model cannot reliably edit its own last output and every combination
 * of five modules at three tiers is a great many pictures.
 * `art_src/palace/capital_building_bible (2).md` is the brief, and the pieces
 * come out of the pipeline centred in their own square -- the anchors below say
 * where each square goes.
 */
export type PalaceModuleId = 'wing' | 'tower' | 'banners' | 'gate' | 'grounds';

export interface PalaceModuleDef {
  id: PalaceModuleId;
  /** What both sides call the category, for the build list and the pedia. */
  name: string;
  /** The three tiers, per faction, cheapest first. */
  tiers: Record<FactionId, [string, string, string]>;
  /** Shields per tier. */
  cost: [number, number, number];
  /**
   * Where the piece's own centre sits, in fractions of the chassis box, and how
   * wide it is drawn against that box.
   *
   * Every piece arrives centred in a square of its own, so placing one is two
   * numbers and a size rather than a hand-cut atlas.
   */
  at: { x: number; y: number; scale: number };
  /** Drawn before the chassis, so the chassis overlaps where they join. */
  behind?: boolean;
  blurb: string;
}

/** Drawn in this order, which is why the list is not alphabetical. */
export const PALACE_MODULES: PalaceModuleDef[] = [
  {
    id: 'wing',
    name: 'Wing',
    tiers: {
      human: ['Shrine Annex', 'Stained-Glass Chapel', 'Cathedral Wing'],
      orc: ['Single Totem', 'Totem Cluster', 'Ritual Altar Wing'],
    },
    cost: [40, 80, 140],
    at: { x: 0.19, y: 0.5, scale: 0.42 },
    behind: true,
    blurb: 'Somewhere to be solemn, attached to the side of somewhere to shout.',
  },
  {
    id: 'tower',
    name: 'Watchtower',
    tiers: {
      human: ['Wooden Lookout', 'Stone Tower', 'Gilded Spire'],
      orc: ['Lashed-Log Lookout', 'Bone-Reinforced Tower', 'Iron-Plated Tower'],
    },
    cost: [40, 80, 140],
    at: { x: 0.8, y: 0.36, scale: 0.4 },
    behind: true,
    blurb: 'For seeing trouble coming, and for being seen having seen it.',
  },
  {
    id: 'banners',
    name: 'Regalia',
    tiers: {
      human: ['Single Cloth Banner', 'Matched Banner Set', 'Gold-Trimmed Heraldry'],
      orc: ['Single Torn Banner', 'Chained Banner Set', 'Blackened War-Banners'],
    },
    cost: [30, 60, 110],
    at: { x: 0.5, y: 0.08, scale: 0.3 },
    behind: true,
    blurb: 'Cloth on a pole. Enormously important cloth, on an enormously important pole.',
  },
  {
    id: 'gate',
    name: 'Gate',
    tiers: {
      human: ['Simple Wooden Gate', 'Reinforced Stone Gate', 'Ornamental Grand Gate'],
      orc: ['Crude Palisade Gate', 'Spiked Iron Gate', 'Trophy-Flanked Warfort Gate'],
    },
    cost: [40, 80, 140],
    at: { x: 0.5, y: 0.72, scale: 0.36 },
    blurb: 'The part visitors are meant to look at while they wait.',
  },
  {
    id: 'grounds',
    name: 'Grounds',
    tiers: {
      human: ['Dirt Yard', 'Cobbled Courtyard', 'Manicured Garden'],
      orc: ['Trampled Dirt Yard', 'Weapon Racks', 'Forge Yard'],
    },
    cost: [30, 60, 110],
    at: { x: 0.5, y: 0.92, scale: 0.56 },
    blurb: 'What is out the front, and therefore what everybody judges the place by.',
  },
];

/**
 * Where the chassis itself sits in the box.
 *
 * Not the whole box: the modules hang off its corners and its roofline, so it
 * has to leave room on every side or they are drawn behind a wall and lost. Two
 * thirds, found by looking at it.
 */
export const PALACE_BASE = { x: 0.5, y: 0.44, scale: 0.62 };

export const PALACE_BY_ID = new Map(PALACE_MODULES.map((m) => [m.id, m]));

/**
 * The building id for one module at one tier.
 *
 * The faction is in the id because the two sides' versions are different
 * buildings with different names -- a Gilded Spire is not an Iron-Plated Tower
 * -- and a building id is a key in one table. It also makes the id the art file
 * name with `palace-` taken off, which is one fewer thing to keep in step.
 */
export function palaceId(faction: FactionId, module: PalaceModuleId, tier: number): BuildingId {
  return `palace-${faction}-${module}-${tier}`;
}

/** Whether this building is a piece of the capital rather than a building. */
export function isPalace(id: BuildingId): boolean {
  return id.startsWith('palace-');
}

/** The module and tier a palace building id names, if it is one. */
export function palacePart(
  id: BuildingId,
): { faction: FactionId; module: PalaceModuleDef; tier: number } | null {
  if (!isPalace(id)) return null;
  const [, faction, name, tier] = id.split('-');
  const module = PALACE_BY_ID.get(name as PalaceModuleId);
  const n = Number(tier);
  if (!module || !(n >= 1 && n <= 3)) return null;
  if (faction !== 'orc' && faction !== 'human') return null;
  return { faction, module, tier: n };
}

/** Where the art for a piece lives, under `public/palace/`. */
export function palaceArt(id: BuildingId): string {
  return id.replace(/^palace-/, '');
}

/**
 * The thirty modules as buildings, so that everything a building already knows
 * how to do -- be queued, cost shields, finish, sit in a save, show in a list --
 * works without a second kind of thing to build.
 *
 * `needs` chains each tier to the one under it, which is what makes a tier a
 * tier rather than a parallel choice, and is the same rule the economy buildings
 * use.
 */
export function palaceBuildings(): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (const module of PALACE_MODULES) {
    for (const faction of ['orc', 'human'] as const) {
      for (let tier = 1; tier <= 3; tier++) {
        out.push({
          id: palaceId(faction, module.id, tier),
          name: module.tiers[faction][tier - 1],
          faction,
          cost: module.cost[tier - 1],
          upkeep: 0,
          civic: true,
          needs: tier > 1 ? palaceId(faction, module.id, tier - 1) : undefined,
          blurb: module.blurb,
        });
      }
    }
  }
  return out;
}
