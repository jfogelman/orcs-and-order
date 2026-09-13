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
 * `art_src/palace/capital_building_bible (2).md` is the brief. The pipeline trims
 * each piece to its own picture and measures the points it hangs by; the anchors
 * and the chassis points below say where those go.
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
 * - `tip` -- for a wing: its lowest point, which is its nearest corner, where
 *   its front wall meets the blank wall it joins by. Hung on the hall's own
 *   corner, the wing's front carries on from the hall's and the blank wall runs
 *   back along the hall's side, where the hall covers it. Docking the blank
 *   wall's measured edge instead stood the cathedral forward of the hall's
 *   front, because a slanted wall has no one width to measure.
 * - `plinth` -- for a tower: the corner where its base meets the ground on the
 *   left, hung on the hall's nearest corner, so the tower stands on that corner
 *   and its skirt wall runs along the hall's wall. The towers that read right
 *   had landed there; the ones that did not were a few pixels either side.
 */
export type PalaceAnchor = 'foot' | 'mid' | 'tip' | 'plinth';

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
export type PalacePoint = 'door' | 'tower' | 'side' | 'roof' | 'yard';

export interface PalaceChassis {
  /** Drawn flipped left to right. Its points are marked on the art as drawn. */
  mirror?: boolean;
  /**
   * Drawn width, as a share of the box, before the composition is fitted.
   *
   * What matters is this against the modules' sizes -- the whole picture is
   * then scaled to fit, so there is no position to set. The points are in the
   * art's own pixels, so changing this moves them with the hall and none of them
   * needs marking again.
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
 * get: the wing on the left, the tower on the gate's line to the right, the
 * banner on the roof between. A right-hand wing was tried behind the hall, in front of it
 * and on the back wall, and in every version the corner tower hid it.
 */
export const PALACE_CHASSIS: Record<FactionId, PalaceChassis> = {
  orc: {
    width: 0.58,
    points: {
      // The left-hand door, which faces the way the gate arch opens.
      door: [37, 103],
      // The hall's nearest corner, where its two front walls meet the ground.
      tower: [63, 116],
      // The hall's left-hand corner, where its left wall meets the ground.
      side: [0, 85],
      // On the roof's front edge above the gate -- Jeremy: the banners go with
      // the gate, not off in the roof's far corner.
      roof: [37, 48],
      // The near corner: the yard is centred just in front of it.
      yard: [64, 116],
    },
  },
  human: {
    // The art is itself the mirror image of the first generation, so it is drawn as it is.
    width: 0.58,
    points: {
      door: [38, 91],
      // As the Horde's: the nearest corner.
      tower: [66, 98],
      // As the Horde's: the left-hand corner, where the clean vertical at x of
      // about 2 meets the ground.
      side: [2, 86],
      roof: [64, 22],
      // Marked by Jeremy: the ground line's real low point, nearest the viewer,
      // is at x of 64 to 70. At 76 the hall overhung the yard's left edge.
      yard: [64, 98],
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
  /** Drawn flipped left to right. */
  flip?: boolean;
  /** Its own growth with tier, where `PALACE_TIER_SCALE` is too gentle. */
  tierScale?: [number, number, number];
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
    // Its own fraction, not the vertical modules' budget. A foreshortened plane
    // needs more room than a tower to read at all, and the tier-three pieces --
    // the hedge maze, the forge yard's spread of props -- turn to noise when
    // they are drawn at the size of a gate.
    // It has its own frame (see `palaceLayout`), so its size is a share of the
    // finished box rather than of the composition and never costs the hall any
    // of its size -- and it is never narrower than what stands on it.
    at: { point: 'yard', anchor: 'mid', size: 0.8, wide: true, vmid: true, nudge: [0, -6] },
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
    // Behind the chassis, its nearest corner on the hall's left-hand corner: the
    // hall is drawn over the blank wall it joins by.
    at: { point: 'side', anchor: 'tip', size: 0.38 },
    // The cathedral is meant to tower over the hall, as the reference art draws
    // it, so the Kingdom's wings grow faster with their tier than anything else:
    // the shrine annex is a shed and the cathedral the tallest thing there.
    // Wholly behind the hall, like every wing.
    per: { human: { size: 0.44, tierScale: [0.8, 1, 1.36] } },
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
    // Sizes are shares of the box at tier two: twice the chassis's drawn height
    // -- 0.58 x 117/128 of the box for the Warcamp, 0.58 x 99/128 for the Grand
    // Hall -- over the top tier's 1.16. The Horde's are set by eye off the
    // composites (Jeremy's): the bone tower at the lookout's height, and the
    // Iron-Plated Tower at two thirds of the top tier's, since its art is a solid
    // block to the top of its crown and read three times the hall's height.
    at: { point: 'tower', anchor: 'plinth', size: 0.914 },
    per: { orc: { tierScale: [0.84, 0.84, 0.773] }, human: { size: 0.774 } },
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
    // The Horde's are drawn facing the other way, towards the gate below them.
    per: { orc: { flip: true } },
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

/** The capital, fitted: the sprites in draw order, and the frame they need. */
export interface PalaceLayout {
  pieces: PlacedPiece[];
  /** At least the box; more when the grounds reach past its side. */
  width: number;
  /** At least the box; more when the grounds reach below it. */
  height: number;
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
 *
 * **The grounds get a frame of their own.** Only the building and what is hung
 * on it are fitted to the square. The yard is centred on the hall's own point,
 * at a size set against the box, and the frame grows -- down, and sideways if it
 * must -- to take it. Fitting the yard in with the rest meant every bit of yard
 * cost the hall its size; holding it to the box's width meant a wing on one side
 * pushed the hall off-centre and cost it a quarter of its size again. And it is
 * never narrower than what stands on it: a wing or a tower hanging past the
 * yard's edge is standing on nothing, and reads as floating.
 */
export function palaceLayout(
  faction: FactionId,
  standing: Array<{ module: PalaceModuleDef; tier: number }>,
  box: number,
): PalaceLayout {
  const worst = arrange(
    faction,
    PALACE_MODULES.map((module) => ({ module, tier: PALACE_TIERS })),
    box,
  );
  const bounds = (pieces: PlacedPiece[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pieces) {
      const shape = PALACE_ART[p.art];
      const h = (p.width * shape.h) / shape.w;
      minX = Math.min(minX, p.left);
      minY = Math.min(minY, p.top);
      maxX = Math.max(maxX, p.left + p.width);
      maxY = Math.max(maxY, p.top + h);
    }
    return { minX, minY, maxX, maxY };
  };
  const isGrounds = (p: PlacedPiece) => p.art.startsWith(`${faction}-grounds-`);
  const building = bounds(worst.filter((p) => !isGrounds(p)));
  const margin = box * 0.03;
  const room = box - 2 * margin;
  const grounds = PALACE_BY_ID.get('grounds')!;
  const scale = Math.min(
    room / (building.maxX - building.minX),
    room / (building.maxY - building.minY),
  );
  const offX = margin + (room - (building.maxX - building.minX) * scale) / 2 - building.minX * scale;
  const offY = margin + (room - (building.maxY - building.minY) * scale) / 2 - building.minY * scale;
  const move = (p: PlacedPiece): PlacedPiece => ({
    ...p,
    left: p.left * scale + offX,
    top: p.top * scale + offY,
    width: p.width * scale,
  });
  // Everything that could ever stand on the yard, every tier at once.
  const reach = bounds(
    arrange(
      faction,
      PALACE_MODULES.flatMap((module) => [1, 2, 3].map((tier) => ({ module, tier }))),
      box,
    )
      .filter((p) => !isGrounds(p))
      .map(move),
  );
  const pad = box * 0.08;
  const fit = (pieces: PlacedPiece[]): PlacedPiece[] => {
    const moved = pieces.map(move);
    const onIt = bounds(moved.filter((p) => !isGrounds(p)));
    return moved.map((p) => {
      if (!isGrounds(p)) return p;
      // Sized against the finished box, about the point it was hung from, and
      // wide enough that everything standing is standing on it.
      const shape = PALACE_ART[p.art];
      const tier = Number(p.art.slice(p.art.lastIndexOf('-') + 1));
      const cx = p.left + p.width / 2;
      const cy = p.top + (p.width * shape.h) / shape.w / 2;
      const cover = (b: { minX: number; maxX: number }) =>
        2 * Math.max(cx - b.minX, b.maxX - cx) + pad;
      // Never narrower than what stands on it; and a tier's share of the widest
      // anything could need, so the top yard is the biggest -- the forge yard
      // came out smaller than the weapon racks, because the tower it stood
      // beside had shrunk.
      const width = Math.max(
        grounds.at.size * PALACE_TIER_SCALE[tier - 1] * box,
        cover(onIt),
        (cover(reach) * PALACE_TIER_SCALE[tier - 1]) / PALACE_TIER_SCALE[PALACE_TIERS - 1],
      );
      const height = (width * shape.h) / shape.w;
      return { ...p, left: cx - width / 2, top: cy - height / 2, width };
    });
  };
  // Where the yard reaches past the box, everything moves over to make room and
  // the frame grows, rather than anything being cut off or shrunk.
  const all = bounds(fit(worst));
  const shiftX = Math.max(0, margin - all.minX);
  const shiftY = Math.max(0, margin - all.minY);
  return {
    pieces: fit(arrange(faction, standing, box)).map((p) => ({
      ...p,
      left: p.left + shiftX,
      top: p.top + shiftY,
    })),
    width: Math.ceil(Math.max(box, all.maxX + shiftX + margin)),
    height: Math.ceil(Math.max(box, all.maxY + shiftY + margin)),
  };
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
    const size = at.size * (at.tierScale ?? PALACE_TIER_SCALE)[tier - 1] * box;
    const w = at.wide ? size : (size * shape.w) / shape.h;
    const h = at.wide ? (size * shape.h) / shape.w : size;
    const [px, py] = chassis.points[at.point];
    const [nx, ny] = at.nudge ?? [0, 0];
    const tx = (px + nx) * scale;
    const ty = (py + ny) * scale;
    const mirror = (x: number) => (at.flip ? 1 - x : x);
    // The point of its own art that is hung on the chassis's point.
    const corner =
      at.anchor === 'tip' ? shape.tip : at.anchor === 'plinth' ? shape.plinth : undefined;
    const [hx, hy] = corner
      ? [mirror(corner[0]), corner[1]]
      : [at.anchor === 'mid' ? 0.5 : mirror(shape.foot), at.vmid ? 0.5 : shape.base];
    return { art, left: tx - hx * w, top: ty - hy * h, width: w, flip: !!at.flip };
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
