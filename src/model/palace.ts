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
 * Anchor by the meaningful structural line, never by the bounding box: a
 * picture's middle is an accident of what else the artist drew into the frame.
 *
 * - `foot` -- where the structure meets the ground, measured off the art into
 *   `palaceArt.ts` (the first row that is structure rather than fringe, so a
 *   tower stands on its base logs and not on the stakes in front of them).
 * - `mid` -- the middle of the picture, for the gate: its lowest row is a wall
 *   stub off to one side.
 * - `seam` -- the flat unfinished wall a wing was drawn with, read off the art.
 */
export type PalaceAnchor = 'foot' | 'mid' | 'seam';

/**
 * A named place on a chassis where a piece hangs.
 *
 * **This is the half the first versions were missing.** They fixed where on each
 * *module* the anchor sits, and then aimed it at a percentage of the box -- and
 * the Warcamp and the Grand Hall have their doors, corner posts and roofs in
 * different places, so one formula served neither. These are marked by hand,
 * once per chassis, off a pixel grid of the art as drawn: there are only two
 * chassis, they never change, and no measurement can tell a door from a window.
 */
export type PalacePoint = 'door' | 'corner' | 'side' | 'roof' | 'yard';

export interface PalaceChassis {
  /** Drawn flipped left to right. Its points are marked on the art as drawn. */
  mirror?: boolean;
  /**
   * Drawn width, as a share of the box, before the composition is fitted.
   *
   * What matters is this against the modules' sizes -- the whole picture is
   * then scaled to fit, so there is no position to set.
   */
  width: number;
  /** Where each kind of piece hangs, in the chassis art's own pixels. */
  points: Record<PalacePoint, [number, number]>;
}

/**
 * The two chassis, and where things hang off them.
 *
 * Chosen at the worst case -- every module at its biggest tier -- so the tower,
 * the wing and the banner do not collide when all three are as large as they
 * get: the wing hangs off the far side and is drawn behind, the tower stands at
 * the other corner in front, and the banner takes a corner of the roof away from
 * both.
 */
export const PALACE_CHASSIS: Record<FactionId, PalaceChassis> = {
  orc: {
    width: 0.46,
    points: {
      // The left-hand door, which faces the way the gate arch opens.
      door: [37, 103],
      // The right corner post, at its foot.
      corner: [121, 92],
      // Behind the back-right wall, well along it towards the back corner: the
      // corner tower rises straight up from [121, 92], and at its biggest tier
      // a wing hung any nearer that corner disappears behind it.
      side: [80, 28],
      // The left corner of the roof, away from the tower and the wing.
      roof: [14, 36],
      // The near corner: the yard is centred just in front of it.
      yard: [64, 116],
    },
  },
  human: {
    mirror: true,
    width: 0.46,
    points: {
      door: [38, 91],
      corner: [122, 80],
      // Tucked behind the left wall, so the hall is drawn over the cathedral's
      // seam rather than the cathedral floating beside it.
      side: [34, 58],
      roof: [64, 22],
      yard: [76, 98],
    },
  },
};

export interface PalacePlacement {
  /** Which place on the chassis it hangs from. */
  point: PalacePoint;
  /** Which line of its own art is hung there. */
  anchor: PalaceAnchor;
  /**
   * Drawn size at tier two, as a share of the box: height for things that stand
   * up, width for things marked `wide`. Independent of the chassis's size, and
   * a judgement -- the art is drawn one subject to a frame, each filling it, so
   * nothing on disk says a tower is bigger than a gate.
   */
  size: number;
  /** Measured across rather than up. */
  wide?: boolean;
  /** Placed by its middle: a top-down slab has no foot. */
  vmid?: boolean;
  /** A small correction from the point, in chassis pixels. */
  nudge?: [number, number];
}

/**
 * How a module's size moves with its tier: the numbers below are the middle
 * tier, so a first totem does not fill the space a blazing altar wing does.
 */
export const PALACE_TIER_SCALE = [0.84, 1, 1.16];

export interface PalaceModuleDef {
  id: PalaceModuleId;
  /** What both sides call the category, for the offer and the pedia. */
  name: string;
  /** The three tiers, per faction, cheapest first. */
  tiers: Record<FactionId, [string, string, string]>;
  at: PalacePlacement;
  /** Where it differs on one side's chassis. */
  per?: Partial<Record<FactionId, Partial<PalacePlacement>>>;
  /** Drawn before the chassis, so the chassis covers the join. */
  behind?: boolean;
  blurb: string;
}

/** Drawn in the order of this list, behind pieces first. */
export const PALACE_MODULES: PalaceModuleDef[] = [
  {
    id: 'grounds',
    name: 'Grounds',
    tiers: {
      human: ['Dirt Yard', 'Cobbled Courtyard', 'Manicured Garden'],
      orc: ['Trampled Dirt Yard', 'Weapon Racks', 'Forge Yard'],
    },
    // Centred a little behind the near corner, so the hall's foundation is
    // drawn over the yard's back edge: ground the hall stands in, not a rug.
    at: { point: 'yard', anchor: 'mid', size: 0.5, wide: true, vmid: true, nudge: [0, -6] },
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
    // Behind the chassis, with its seam against the hall's side: the hall is
    // drawn over the join, which is what hides the flat unfinished wall.
    at: { point: 'side', anchor: 'seam', size: 0.38 },
    // The cathedral's tracery reaches well above its roof, so it is drawn
    // smaller than a totem to sit at the same visual height.
    // The Warcamp's wing hangs behind the hall's far corner, where the seam
    // is hidden whichever way it faces, so it is centred on the point; the
    // Grand Hall's docks its seam against the wall.
    per: { orc: { anchor: 'mid' }, human: { size: 0.3 } },
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
    at: { point: 'corner', anchor: 'foot', size: 0.44 },
    blurb: 'For seeing trouble coming, and for being seen having seen it.',
  },
  {
    id: 'gate',
    name: 'Gate',
    tiers: {
      human: ['Simple Wooden Gate', 'Reinforced Stone Gate', 'Ornamental Grand Gate'],
      orc: ['Crude Palisade Gate', 'Spiked Iron Gate', 'Trophy-Flanked Warfort Gate'],
    },
    at: { point: 'door', anchor: 'mid', size: 0.23 },
    blurb: 'The part visitors are meant to look at while they wait.',
  },
  {
    id: 'banners',
    name: 'Regalia',
    tiers: {
      human: ['Single Cloth Banner', 'Matched Banner Set', 'Gold-Trimmed Heraldry'],
      orc: ['Single Torn Banner', 'Chained Banner Set', 'Blackened War-Banners'],
    },
    at: { point: 'roof', anchor: 'foot', size: 0.19 },
    blurb: 'Cloth on a pole. Enormously important cloth, on an enormously important pole.',
  },
];

/** One sprite of the composed capital, in pixels of a box `box` wide. */
export interface PlacedPiece {
  art: string;
  left: number;
  top: number;
  width: number;
  flip: boolean;
}

/**
 * The capital, as a list of sprites to draw in order.
 *
 * The one place the arrangement is worked out, so the city view and anything
 * that renders it offline cannot disagree about where a piece goes.
 *
 * **Fitted at the worst case.** The composition is laid out with every module at
 * its biggest tier, that is scaled and centred to fit the box, and the same
 * transform is then applied to whatever is actually standing. Two things follow:
 * nothing can be clipped by the frame however much has been built, and the hall
 * does not jump about or shrink as pieces are added -- a capital that got smaller
 * every time it got grander would be a strange reward.
 */
export function palaceLayout(
  faction: FactionId,
  standing: Array<{ module: PalaceModuleDef; tier: number }>,
  box: number,
): PlacedPiece[] {
  const worst = arrange(
    faction,
    PALACE_MODULES.map((module) => ({ module, tier: PALACE_TIERS })),
    box,
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of worst) {
    const shape = PALACE_ART[p.art];
    const h = (p.width * shape.h) / shape.w;
    minX = Math.min(minX, p.left);
    minY = Math.min(minY, p.top);
    maxX = Math.max(maxX, p.left + p.width);
    maxY = Math.max(maxY, p.top + h);
  }
  const margin = box * 0.03;
  const room = box - 2 * margin;
  const scale = Math.min(room / (maxX - minX), room / (maxY - minY));
  const offX = margin + (room - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = margin + (room - (maxY - minY) * scale) / 2 - minY * scale;
  return arrange(faction, standing, box).map((p) => ({
    ...p,
    left: p.left * scale + offX,
    top: p.top * scale + offY,
    width: p.width * scale,
  }));
}

/** The arrangement before fitting: the chassis at the origin, pieces hung off it. */
function arrange(
  faction: FactionId,
  standing: Array<{ module: PalaceModuleDef; tier: number }>,
  box: number,
): PlacedPiece[] {
  const chassis = PALACE_CHASSIS[faction];
  const baseArt = PALACE_ART[`${faction}-base`];
  const baseW = chassis.width * box;
  const scale = baseW / baseArt.w;

  const place = (module: PalaceModuleDef, tier: number): PlacedPiece | null => {
    const at: PalacePlacement = { ...module.at, ...(module.per?.[faction] ?? {}) };
    const art = palaceArt(faction, module.id, tier);
    const shape = PALACE_ART[art];
    if (!shape) return null;
    const size = at.size * PALACE_TIER_SCALE[tier - 1] * box;
    const w = at.wide ? size : (size * shape.w) / shape.h;
    const h = at.wide ? (size * shape.h) / shape.w : size;
    const [px, py] = chassis.points[at.point];
    const [nx, ny] = at.nudge ?? [0, 0];
    const tx = (px + nx) * scale;
    const ty = (py + ny) * scale;
    const hold =
      at.anchor === 'mid' ? 0.5 : at.anchor === 'seam' ? (shape.seam === 'right' ? 1 : 0) : shape.foot;
    return {
      art,
      left: tx - hold * w,
      top: ty - (at.vmid ? h / 2 : h * shape.base),
      width: w,
      flip: false,
    };
  };

  const out: PlacedPiece[] = [];
  const add = (behind: boolean) => {
    for (const { module, tier } of standing) {
      if (!!module.behind !== behind) continue;
      const piece = place(module, tier);
      if (piece) out.push(piece);
    }
  };
  add(true);
  out.push({ art: `${faction}-base`, left: 0, top: 0, width: baseW, flip: !!chassis.mirror });
  add(false);
  return out;
}

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
