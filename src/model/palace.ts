import type { FactionId, Player } from './types';

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
 * **It is a reward, not a purchase.** Nothing here is queued, costs shields or
 * takes a turn: when the empire is doing especially well the council asks which
 * piece to add, and the answer is the whole of the mechanic. Section 67 was firm
 * about this -- "a reward for doing well, so it should not also be *how* you do
 * well" -- and a wing that costs a hundred and forty shields is a wing that
 * competes with an army, which makes it a cost with a picture attached.
 *
 * **And it does nothing.** No yields, no defence, no content, no upkeep: a
 * module is a picture of how well it is going. A palace that pays is a
 * multiplier on the capital, and sections 4c and 4e measured that class of thing
 * amplifying whoever is already ahead.
 *
 * The art is built for compositing rather than as one evolving picture, because
 * an image model cannot reliably edit its own last output and every combination
 * of five modules at three tiers is a great many pictures.
 * `art_src/palace/capital_building_bible (2).md` is the brief, and the pieces
 * come out of the pipeline centred in their own square -- the anchors below say
 * where each square goes.
 */
export type PalaceModuleId = 'wing' | 'tower' | 'banners' | 'gate' | 'grounds';

/** Tiers a module can reach. Three, everywhere, since the art comes in threes. */
export const PALACE_TIERS = 3;

export interface PalaceModuleDef {
  id: PalaceModuleId;
  /** What both sides call the category, for the build list and the pedia. */
  name: string;
  /** The three tiers, per faction, cheapest first. */
  tiers: Record<FactionId, [string, string, string]>;
  /**
   * Where the piece stands, in fractions of the box.
   *
   * `x` is the middle of it, `ground` is the line it stands on measured from the
   * top of the box, and `height` is how tall it is drawn. The art is isometric
   * at one fixed angle over one horizon, so pieces that share a ground line read
   * as one scene -- which is the whole trick, and is why this is a ground line
   * and not a centre point. Widths come from the pictures themselves.
   */
  at: { x: number; ground: number; height: number };
  /** Drawn before the chassis, so the chassis overlaps where they join. */
  behind?: boolean;
  blurb: string;
}

/**
 * Drawn in the order of this list, which is why it is not alphabetical: the yard
 * first because it is the ground, then the two pieces that stand behind the
 * hall, then the hall, then what is in front of it and what is on top of it.
 */
export const PALACE_MODULES: PalaceModuleDef[] = [
  {
    id: 'grounds',
    name: 'Grounds',
    tiers: {
      human: ['Dirt Yard', 'Cobbled Courtyard', 'Manicured Garden'],
      orc: ['Trampled Dirt Yard', 'Weapon Racks', 'Forge Yard'],
    },
    at: { x: 0.5, ground: 0.94, height: 0.24 },
    // Under everything: a yard is the ground, and the hall stands at the back
    // of it rather than on top of it.
    behind: true,
    blurb: 'What is out the front, and therefore what everybody judges the place by.',
  },
  {
    id: 'wing',
    name: 'Wing',
    tiers: {
      human: ['Shrine Annex', 'Stained-Glass Chapel', 'Cathedral Wing'],
      orc: ['Single Totem', 'Totem Cluster', 'Ritual Altar Wing'],
    },
    at: { x: 0.235, ground: 0.69, height: 0.4 },
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
    at: { x: 0.78, ground: 0.69, height: 0.54 },
    behind: true,
    blurb: 'For seeing trouble coming, and for being seen having seen it.',
  },
  {
    id: 'gate',
    name: 'Gate',
    tiers: {
      human: ['Simple Wooden Gate', 'Reinforced Stone Gate', 'Ornamental Grand Gate'],
      orc: ['Crude Palisade Gate', 'Spiked Iron Gate', 'Trophy-Flanked Warfort Gate'],
    },
    at: { x: 0.5, ground: 0.78, height: 0.28 },
    blurb: 'The part visitors are meant to look at while they wait.',
  },
  {
    id: 'banners',
    name: 'Regalia',
    tiers: {
      human: ['Single Cloth Banner', 'Matched Banner Set', 'Gold-Trimmed Heraldry'],
      orc: ['Single Torn Banner', 'Chained Banner Set', 'Blackened War-Banners'],
    },
    at: { x: 0.44, ground: 0.34, height: 0.22 },
    behind: true,
    blurb: 'Cloth on a pole. Enormously important cloth, on an enormously important pole.',
  },
];


/**
 * Where the chassis stands, and therefore where everything else does.
 *
 * The hall is deliberately not the tallest thing in the picture -- a tower is --
 * so it takes a little under half the height, leaving room above it for a spire
 * and below it for a yard.
 */
export const PALACE_BASE = { x: 0.5, ground: 0.72, height: 0.44 };

export const PALACE_BY_ID = new Map(PALACE_MODULES.map((m) => [m.id, m]));

/** What the art for one piece is called, under `public/palace/`. */
export function palaceArt(faction: FactionId, module: PalaceModuleId, tier: number): string {
  return `${faction}-${module}-${tier}`;
}

/** The tiers an empire has raised, which is a thing the empire owns. */
export type PalaceTiers = Partial<Record<PalaceModuleId, number>>;

/** What this empire has built onto its capital so far. */
export function palaceOf(player: Player): PalaceTiers {
  return player.palace ?? {};
}

/**
 * What the council can offer: every module that is not already at the top.
 *
 * Five choices at the start and fewer later, which is the shape Civ2's throne
 * room had -- the interesting decision is early, when everything is possible and
 * the empire is small enough that any of it would be a boast.
 */
export function prideOffer(player: Player): Array<{ module: PalaceModuleDef; tier: number }> {
  const have = palaceOf(player);
  return PALACE_MODULES.map((module) => ({ module, tier: (have[module.id] ?? 0) + 1 })).filter(
    (o) => o.tier <= PALACE_TIERS,
  );
}

/** Accept one. Returns whether it was a thing that could be accepted. */
export function takePride(player: Player, module: PalaceModuleId): boolean {
  const have = { ...palaceOf(player) };
  const tier = (have[module] ?? 0) + 1;
  if (tier > PALACE_TIERS) return false;
  have[module] = tier;
  player.palace = have;
  return true;
}

/** Pieces standing, in the order they are drawn. */
export function palacePieces(
  player: Player,
): Array<{ module: PalaceModuleDef; tier: number }> {
  const have = palaceOf(player);
  return PALACE_MODULES.filter((m) => (have[m.id] ?? 0) > 0).map((module) => ({
    module,
    tier: have[module.id]!,
  }));
}
