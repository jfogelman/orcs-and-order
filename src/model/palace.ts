import type { FactionId, Player } from './types';
import { PALACE_ART } from './palaceArt';

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

/**
 * Which line in a piece of art it is hung from.
 *
 * The lesson of every mistake made getting this to look right: **anchor by the
 * meaningful structural line, not by the bounding box.** A picture's middle is
 * an accident of what else the artist drew into the frame.
 *
 * - `foot` -- the middle of its lowest row of pixels, which for an isometric box
 *   is its near corner. Right for anything that stands on the ground.
 * - `mid` -- the middle of the picture. Right for the gate, whose lowest row is
 *   a wall stub off to one side: foot-anchored, it walks into the corner.
 * - `seam` -- the outer edge on the side it joins from, which is the flat
 *   unfinished wall the wings were drawn with on purpose. Anchoring anywhere
 *   else lets a wide wing overlap the hall by however much of itself sits past
 *   the seam.
 */
export type PalaceAnchor = 'foot' | 'mid' | 'seam';

/**
 * Which side of the chassis a wing hangs off, for this side's art.
 *
 * Read from the art rather than decided here: the wings were generated with a
 * flat unfinished wall on the side they join along, and which edge that came out
 * on is not guaranteed -- so the piece is docked by whichever edge it actually
 * is, and a re-rolled wing that comes back the other way round still lands
 * right. A seam on the *right* of the picture means the wing sits to the *left*
 * of the hall, with that edge hidden against it.
 */
export function wingSide(faction: FactionId): -1 | 1 {
  const art = PALACE_ART[`${faction}-wing-1`];
  return art?.seam === 'left' ? 1 : -1;
}

export interface PalacePlacement {
  /**
   * Drawn size at tier two, as a share of the whole picture's box.
   *
   * A share of the *box* and not of the chassis, so that a piece's size and the
   * chassis's size are independent numbers: "a smaller hall with grander wings"
   * is a thing somebody can ask for and get.
   *
   * Nothing in the art says how big anything is -- every asset was drawn one
   * subject to a frame, each filling its frame, so a tower sprite and a hall
   * sprite are the same size on disk. These numbers are a judgement, and they
   * were made by looking at the three of them side by side.
   */
  size: number;
  /** Measured across rather than up: the hall and the yard are wider than tall. */
  wide?: boolean;
  /** Placed by its middle: a top-down slab has no foot to stand on. */
  vmid?: boolean;
  anchor: PalaceAnchor;
  /**
   * Marks the piece that takes the corner opposite the wing.
   *
   * The wing's side is decided by its own seam, so the tower cannot have a side
   * written down: it has to be told to take the other one.
   */
  side?: 'tower';
  /**
   * Where its anchor lands, from the chassis's foot, in box fractions.
   *
   * For the two pieces that hang off the sides, `dx` is a distance rather than a
   * direction: the wing's side comes from its seam and the tower takes the other
   * corner, so neither has a left or a right written down here.
   */
  dx: number;
  dy: number;
  /** Instead of `dy`: this far up the chassis's own height. For the roofline. */
  roof?: number;
}

/**
 * How a module's size moves with its tier.
 *
 * A first totem should not fill the same space as a blazing altar wing, and a
 * lashed-log lookout should not stand as tall as an iron-plated tower. The
 * numbers in `PALACE_MODULES` are the middle tier, and this drifts either side
 * of it -- so the capital of an empire that has finished something reads as
 * grander without every module being retuned by hand.
 */
export const PALACE_TIER_SCALE = [0.84, 1, 1.16];

export interface PalaceModuleDef {
  id: PalaceModuleId;
  /** What both sides call the category, for the offer and the pedia. */
  name: string;
  /** The three tiers, per faction, cheapest first. */
  tiers: Record<FactionId, [string, string, string]>;
  at: PalacePlacement;
  /** Drawn before the chassis, so the chassis is drawn over where they join. */
  behind?: boolean;
  blurb: string;
}

/**
 * Drawn in the order of this list: the yard first, because it is the ground the
 * rest stands in, then the hall, then what hangs off it.
 *
 * The numbers are written for the Warcamp. The Grand Hall's chassis faces the
 * other way -- so it is drawn mirrored, and every `dx` is negated with it, which
 * swaps the tower and the wing onto the sides their art expects.
 */
export const PALACE_MODULES: PalaceModuleDef[] = [
  {
    id: 'grounds',
    name: 'Grounds',
    tiers: {
      human: ['Dirt Yard', 'Cobbled Courtyard', 'Manicured Garden'],
      orc: ['Trampled Dirt Yard', 'Weapon Racks', 'Forge Yard'],
    },
    // Tucked under: its middle sits above the chassis's foot by enough that the
    // hall is drawn over its back edge. Flush underneath, the two read as two
    // stacked stickers with a seam between them rather than a building standing
    // in its own yard.
    at: { size: 0.5, wide: true, vmid: true, anchor: 'mid', dx: 0, dy: 0.03 },
    behind: true,
    blurb: 'What is out the front, and therefore what everybody judges the place by.',
  },
  {
    id: 'tower',
    name: 'Watchtower',
    tiers: {
      human: ['Wooden Lookout', 'Stone Tower', 'Gilded Spire'],
      orc: ['Lashed-Log Lookout', 'Bone-Reinforced Tower', 'Iron-Plated Tower'],
    },
    // At a front corner, which is half a chassis width out and a quarter up.
    at: { size: 0.44, anchor: 'foot', side: 'tower', dx: 0.24, dy: -0.115 },
    blurb: 'For seeing trouble coming, and for being seen having seen it.',
  },
  {
    id: 'wing',
    name: 'Wing',
    tiers: {
      human: ['Shrine Annex', 'Stained-Glass Chapel', 'Cathedral Wing'],
      orc: ['Single Totem', 'Totem Cluster', 'Ritual Altar Wing'],
    },
    // Hung from its seam against the hall's other side, and a little forward.
    at: { size: 0.38, anchor: 'seam', dx: 0.02, dy: 0.058 },
    blurb: 'Somewhere to be solemn, attached to the side of somewhere to shout.',
  },
  {
    id: 'gate',
    name: 'Gate',
    tiers: {
      human: ['Simple Wooden Gate', 'Reinforced Stone Gate', 'Ornamental Grand Gate'],
      orc: ['Crude Palisade Gate', 'Spiked Iron Gate', 'Trophy-Flanked Warfort Gate'],
    },
    at: { size: 0.23, anchor: 'mid', dx: 0, dy: 0.01 },
    blurb: 'The part visitors are meant to look at while they wait.',
  },
  {
    id: 'banners',
    name: 'Regalia',
    tiers: {
      human: ['Single Cloth Banner', 'Matched Banner Set', 'Gold-Trimmed Heraldry'],
      orc: ['Single Torn Banner', 'Chained Banner Set', 'Blackened War-Banners'],
    },
    // On the roofline, which is measured up the chassis rather than in box
    // fractions: the two halls are different heights.
    at: { size: 0.19, anchor: 'foot', dx: 0, dy: 0, roof: 0.55 },
    blurb: 'Cloth on a pole. Enormously important cloth, on an enormously important pole.',
  },
];

/**
 * Where each side's chassis stands, and which way round it faces.
 *
 * `width` is a share of the box and `ground` is how far down the box its near
 * corner sits -- low enough that a tier-three spire fits above it. The Kingdom's
 * hall is drawn facing the other way, so it is flipped and the pieces that hang
 * off its sides swap with it.
 */
export const PALACE_BASE: Record<FactionId, { width: number; ground: number; mirror?: boolean }> = {
  orc: { width: 0.46, ground: 0.66 },
  human: { width: 0.46, ground: 0.66, mirror: true },
};

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
