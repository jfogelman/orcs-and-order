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
  // Section 144. Marked off the real art at last, which section 142 could not
  // do because `prepare_art.py` keeps its own hand-written palace list and the
  // sixteen files had never been processed. The grid is
  // `public/palace/wandering-base.png`, 128 by 91.
  //
  // **This chassis is not a building.** The Standing Caravan is a *ring* of
  // wagons and tents around an open compound, so the three points that mean
  // "a corner of a hall" have no corner to mean. Read the way the Hive's mound
  // was -- the nearest and left-most places the shape meets the ground -- with
  // one difference that is the faction rather than the geometry: a camp's
  // middle is a middle, so the regalia stands **in** the compound rather than
  // on a roof there is none of.
  // Section 152. Marked off the real art, which took telling `prepare_art.py`
  // about the sixteen pieces first -- the points in the first draft were the
  // Wandering Folk's, borrowed, because the art had never been processed and
  // there was no pixel grid to read. That is section 142's mistake repeated
  // and then caught, which is the best this project has managed with that
  // particular list so far.
  //
  // The grid is `public/palace/unbound-base.png`, 128 by 97, and **it is very
  // nearly a true ellipse**: widest at y of 50 to 63 where it touches x of 0
  // and 127, tapering to a ten-pixel tip at the top and a twelve-pixel one at
  // the bottom. The Permanent Circle is a ring of standing stones round a
  // plain floor, seen from high enough up that the ring reads as an oval.
  //
  // So it is read the way the Hive's mound and the Wandering Folk's camp were,
  // and for the same reason: **there are no corners.** The three points that
  // mean "a corner of a hall" elsewhere are the nearest and left-most places
  // the ring meets the ground, and the one that means "a roof" is the middle
  // of the enclosed floor, because that is the only place on this chassis a
  // marker could stand at all.
  unbound: {
    // Not the Wandering Folk's 0.62 that this borrowed. Matched on **drawn
    // area**, which is the measure section 125 settled on after matching the
    // Hive's width and then its height both went wrong in opposite
    // directions: a filled ellipse draws 9,944 pixels of its 128-by-97 box,
    // which is nearer the Grand Hall's 10,260 than the Standing Caravan's
    // 8,273. A ring drawn at the camp's share stood a head taller than
    // everything hung off it.
    width: 0.59,
    points: {
      // The near arc, left of centre, where the Horde's and the Kingdom's
      // doors both sit (0.29 and 0.30 across). A ring has no doorway; this is
      // the stretch of it a gate is set into. At x of 46 the arc reaches y 93.
      door: [46, 92],
      // The nearest point the ring meets the ground, which is what "nearest
      // corner" means on something round: the bottom of the oval, x 64.
      tower: [64, 95],
      // The left extreme. x of 0 is reached from y 50 to 63, so this is the
      // middle of that run -- and on an ellipse the widest point *is* the
      // ground line there, which is why it sits higher than a hall's left
      // corner would and is correct rather than an error.
      side: [1, 57],
      // Not a roof. The middle of the floor the stones enclose, which is
      // where a marker that stays lit would be put: the one spot visible from
      // every side of the ring. The ellipse's own centre.
      roof: [64, 49],
      // The near arc, as the tower. The yard lies just inside it.
      yard: [64, 94],
    },
  },
  wandering: {
    // The art is 128 by 91, the widest and lowest of the four. Matched on
    // drawn area, the way the Hive's was after matching width and then height
    // both went wrong in opposite directions.
    width: 0.62,
    points: {
      // The front rim, left of centre, where the Horde's and the Kingdom's
      // doors both sit (0.29 and 0.30 across). A ring has no doorway, so this
      // is the arc of it a gate would be dragged across.
      door: [46, 82],
      // The nearest point the ring meets the ground, which is what "nearest
      // corner" means on something round.
      tower: [78, 88],
      // The left extreme, at x of 0 between y 52 and 61 -- on an ellipse the
      // widest point *is* the ground line, so this is lower than a hall's
      // left corner would be and that is correct rather than an error.
      side: [2, 60],
      // Not a roof. A pole in the middle of the circled wagons, set back so
      // it does not stand in the yard -- which is the one place every member
      // of this faction can see it from, and the nearest thing they have to a
      // capital building.
      roof: [64, 50],
      // The near rim, as the tower: the yard is centred just in front of it.
      yard: [78, 88],
    },
  },
  // Section 125. Marked the same way the other two were -- by hand, off a pixel
  // grid of `public/palace/hivekin-base.png`, which is 128 by 88. A mound has
  // no corners, so the two points that mean "corner" elsewhere are read as the
  // nearest and the left-most places it meets the ground.
  hivekin: {
    // Wider than the other two, because the art is wider than theirs: the
    // Warcamp and the Grand Hall are 128 by 117 and 128 by 99, and a Hive is
    // 128 by 88. Matching their *width* share left a mound that everything
    // hung off it stood taller than. Matched on height instead.
    //
    // **And that overcorrected.** Matching height made a mound 0.76 of the box
    // across, where the other two are 0.58, and every module hangs at a share
    // of the *box* rather than of the chassis -- so the wings were correct and
    // simply looked small beside it. Reported from a played game: the chassis
    // is too big relative to the wings, and the gate is right.
    //
    // Matched on drawn **area** instead, which is the nearest single number to
    // "how much of the picture is mound". The Horde's covers 0.58 x 0.53 of the
    // box; a Hive is 128 by 88, so w * w * (88/128) = 0.307 gives w = 0.67. It
    // sits between the two things that were tried and failed, for a reason that
    // is not "it looks better now". Nothing else moves: the hanging points are
    // in the art's own pixels and scale with it, and a module's size is
    // independent of the chassis, so the gate is untouched.
    width: 0.67,
    points: {
      // The tunnel mouth, at its base: the opening runs from about x 28 to 48.
      door: [38, 80],
      // Right of the door, where the mound meets the ground -- the gate's line,
      // which is where the other two chassis put their tower.
      tower: [84, 84],
      // The left-hand edge at the ground line. The wing hangs off this.
      side: [10, 74],
      // On the dome's front rim, between the door and the crown.
      roof: [50, 26],
      // The near point, centred, with the grounds laid out in front of it.
      yard: [64, 85],
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
      hivekin: ['Packed Earth', 'Scoured Apron', 'Tended Brood-Beds'],
      wandering: ['Ground, On Credit', 'Ground, Paid Up', 'Ground, Owned Outright'],
      unbound: ["Where It Happened", "Where It Happens Now", "Where It Is Expected"],
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
      hivekin: ['Brood Annex', 'Brood Hall', 'Royal Gallery'],
      wandering: ['Wing, On Credit', 'Wing, Paid Up', 'Wing, Owned Outright'],
      unbound: ["A Room, Added", "A Hall, Added", "A Wing That Doesn't Leave"],
    },
    // Behind the chassis, its nearest corner on the hall's left-hand corner: the
    // hall is drawn over the blank wall it joins by.
    at: { point: 'side', anchor: 'tip', size: 0.38 },
    // The cathedral is meant to tower over the hall, as the reference art draws
    // it, so the Kingdom's wings grow faster with their tier than anything else:
    // the shrine annex is a shed and the cathedral the tallest thing there.
    // Wholly behind the hall, like every wing.
    per: {
      human: { size: 0.44, tierScale: [0.8, 1, 1.36] },
      // **0.34 since section 136**, reported from the first game played as
      // them: the Brood Annex stood very nearly as tall as the mound it is
      // attached to, and hung off its flank into the yard.
      //
      // The cause is upstream and worth naming, because it will catch the next
      // Hive module too: a module's size is a share of the *frame*, and the
      // Hive's chassis is 0.76 of it against the other two's 0.58 -- widened
      // deliberately, because the mound art is squat and matching their width
      // left everything standing taller than it. So a Hive hall fills 71% of
      // the picture where an empire's fills 43%, and a module sized as though
      // it had the empires' room has none.
      hivekin: { size: 0.34, nudge: [10, 4] },
    },
    behind: true,
    blurb: 'Somewhere to be solemn, attached to the side of somewhere to shout.',
  },
  {
    id: 'tower',
    name: 'Watchtower',
    tiers: {
      human: ['Wooden Lookout', 'Stone Tower', 'Gilded Spire'],
      orc: ['Lashed-Log Lookout', 'Bone-Reinforced Tower', 'Iron-Plated Tower'],
      hivekin: ['Low Vent', 'Watch Spire', 'High Spire'],
      wandering: ['Watch, On Credit', 'Watch, Paid Up', 'Watch, Owned Outright'],
      unbound: ["Something Is Watching", "Something Is Posted", "Something Permanent"],
    },
    // Sizes are shares of the box at tier two: twice the chassis's drawn height
    // -- 0.58 x 117/128 of the box for the Warcamp, 0.58 x 99/128 for the Grand
    // Hall -- over the top tier's 1.16. The Horde's are set by eye off the
    // composites (Jeremy's): the bone tower at the lookout's height, and the
    // Iron-Plated Tower at two thirds of the top tier's, since its art is a solid
    // block to the top of its crown and read three times the hall's height.
    at: { point: 'tower', anchor: 'plinth', size: 0.914 },
    // A spire grown out of a mound is not a watchtower on a corner: at the
    // Kingdom's share it stood half again as tall as the Hive and touched
    // nothing. Two thirds, and pulled in over the chassis rather than off it.
    per: {
      orc: { tierScale: [0.84, 0.84, 0.773] },
      human: { size: 0.774 },
      // 0.46 since section 136, for the reason on the wing above: two thirds
      // was measured against the Kingdom's corner tower and not against how
      // little room a 0.76 chassis leaves beside it.
      hivekin: { size: 0.46, nudge: [-26, 6] },
      // Section 144, and the cause is the art's aspect rather than its tier.
      // `size` sets a module's **height** and the width follows its own
      // shape, so a watchtower drawn 128 by 126 comes out 1.22 times as wide
      // as it is tall where the Horde's, drawn 104 by 128, comes out 0.81 --
      // half again broader for the same number. At 0.914 it was 1.7 times the
      // caravan's width, against the Horde's tower standing at 1.0 of its
      // hall, and the fit shrank the whole capital to make room for it.
      wandering: { size: 0.53 },
    },
    blurb: 'For seeing trouble coming, and for being seen having seen it.',
  },
  {
    id: 'gate',
    name: 'Gate',
    tiers: {
      human: ['Simple Wooden Gate', 'Reinforced Stone Gate', 'Ornamental Grand Gate'],
      orc: ['Crude Palisade Gate', 'Spiked Iron Gate', 'Trophy-Flanked Warfort Gate'],
      hivekin: ['Open Tunnel', 'Chitin Valve', 'Sealed Valve'],
      wandering: ['Gate, On Credit', 'Gate, Paid Up', 'Gate, Owned Outright'],
      unbound: ["Unlocked, Technically", "Attended", "Warded"],
    },
    at: { point: 'door', anchor: 'mid', size: 0.23 },
    per: { hivekin: { size: 0.3, nudge: [0, 2] } },
    blurb: 'The part visitors are meant to look at while they wait.',
  },
  {
    id: 'banners',
    name: 'Regalia',
    tiers: {
      human: ['Single Cloth Banner', 'Matched Banner Set', 'Gold-Trimmed Heraldry'],
      orc: ['Single Torn Banner', 'Chained Banner Set', 'Blackened War-Banners'],
      hivekin: ['Pheromone Stalk', 'Paired Stalks', 'Crowned Stalks'],
      wandering: ['Banner, On Credit', 'Banner, Paid Up', 'Banner, Owned Outright'],
      unbound: ["A Marker", "A Pair, Matching", "A Marker That Stays Lit"],
    },
    at: { point: 'roof', anchor: 'foot', size: 0.19 },
    // The Horde's are drawn facing the other way, towards the gate below them.
    per: { orc: { flip: true }, hivekin: { size: 0.15 } },
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
  // Section 143: a side whose capital has not been through the art pipeline
  // yet draws no capital, rather than taking the city panel down with it.
  //
  // `PALACE_ART` is generated from whatever `npm run art` has processed, and
  // the Wandering Folk's palace art had not been -- so `arrange` read `.w` off
  // `undefined` and **opening your own capital threw**, which is the one city
  // every game has. Found by opening one. An empty frame is a placeholder; a
  // thrown exception is a blank panel and a console nobody is reading.
  if (!PALACE_ART[`${faction}-base`]) return { pieces: [], width: box, height: 0 };
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
 * What a finished palace is worth, section 124.
 *
 * Asked for from play: *"if we build a full palace, it should give a perm joy
 * bonus"*, and he is right that it needed one. Fifteen pieces is an excellent
 * game's worth of milestones -- `PRIDE.step` is thirty-five score apiece -- and
 * the reward for all fifteen was a complete picture and nothing else.
 *
 * **One content citizen everywhere**, which is deliberately modest. It arrives
 * at the point in a game where the player is usually winning already, so it is
 * a lap of honour rather than a lever: enough to feel, too small to decide
 * anything. The same argument section 67 used for the palace itself.
 */
export const PALACE_COMPLETE_CONTENT = 1;

/** Whether every module is at its top tier. */
export function palaceComplete(player: Player): boolean {
  const have = palaceOf(player);
  return PALACE_MODULES.every((m) => (have[m.id] ?? 0) >= PALACE_TIERS);
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
