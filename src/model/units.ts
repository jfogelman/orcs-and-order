import type { DamageKind, FactionId, UnitTypeId } from './types';

/**
 * Units are singleton, Civ2 style: one tile, one unit, one health bar.
 *
 * "Two Orcs" is not a stack — it is a unit type whose sprite happens to have
 * two orcs drawn on it and whose numbers are doubled. Every count variant is
 * generated from its base creature at module load, so adding a whole new rung
 * of the ladder means adding a number to a `counts` array.
 *
 * The trade is deliberate: N orcs cost N orcs' worth of shields but occupy one
 * tile and spend one movement point, which is efficient — right up until they
 * lose one battle and you lose all ten of them at once.
 */

export type UnitRole = 'worker' | 'melee' | 'ranged' | 'siege' | 'caster' | 'flying';

/** Shapes the placeholder art generator knows how to draw. */
export type SilhouetteId =
  | 'worker'
  | 'small'
  | 'brute'
  | 'thrower'
  | 'rider'
  | 'robed'
  | 'winged'
  | 'engine'
  | 'armored';

export interface CreatureDef {
  id: string;
  /** Singular form, used when count is 1: "Orc". */
  name: string;
  /** Plural form, used for every other count: "Orcs". */
  plural: string;
  faction: FactionId;
  role: UnitRole;
  attack: number;
  defense: number;
  hp: number;
  /** Movement points per turn. */
  move: number;
  /** Shield cost of a single one. */
  cost: number;
  sight: number;
  /** Group sizes that exist for this creature. Always includes 1. */
  counts: number[];
  /** Can found cities. */
  settler?: boolean;
  /** Ignores terrain movement costs. */
  flies?: boolean;
  /**
   * What this creature's blows are made of. Physical unless stated.
   *
   * Only matters against something that resists a kind. Setting it changes
   * nothing on its own, which is why it can be declared honestly now and the
   * resistances that read it can wait to be measured.
   */
  damageKind?: DamageKind;
  /**
   * Share of magical damage this creature shrugs off, before rank.
   *
   * Left unset on every creature for the moment. It is the half of this that
   * moves the balance -- it favours the best units on each side and the Horde
   * has two of the three candidates -- so it wants measuring alongside the
   * advances that make it matter, not switching on quietly underneath them.
   */
  magicResist?: number;
  /**
   * Free rounds at the start of a fight, in which only this creature lands
   * blows.
   *
   * Civ4's first strikes, and the answer to what an archer or an axethrower is
   * *for*. They used to be artillery, firing from exactly two tiles for the
   * whole turn and unable to take a city -- which made an army half made of
   * them very bad at finishing a war. Section 38 measured a third of all sieges
   * consisting of besiegers who could not walk in.
   *
   * Only the difference between the two sides counts, so two units that both
   * strike first simply fight.
   */
  firstStrikes?: number;
  /**
   * Shots this creature carries before it needs reloading. Absent means it
   * never runs out.
   *
   * Artillery is the only thing in the game that can hit without being hit
   * back and keep doing it, and the chooser rated a ballista the Kingdom's best
   * purchase on that basis -- it built a hundred and eleven a game. A magazine
   * is the structural answer: a hundred and eleven ballistas cannot all be kept
   * in missiles. See DESIGN_QUEUE section 40.
   */
  ammo?: number;
  /**
   * Where a reload comes from.
   *
   * `labour` -- a neighbour spends its turn making one.
   * `sacrifice` -- a neighbour *is* the ammunition, and is informed of its new
   * job. Reserved for the Horde's artillery, which throws goblins.
   */
  reloadsBy?: 'labour' | 'sacrifice';
  /** Multiplier when attacking a city. */
  siegeBonus?: number;
  /** Multiplies this creature's natural healing. Trolls are famously hard to keep down. */
  regenMultiplier?: number;
  /**
   * Fraction of each neighbour's maximum health lost when this creature is
   * killed *defending*. Friend and enemy alike — the joke is that you cannot
   * aim it.
   */
  explodes?: number;
  /**
   * Spends itself bringing a city's walls down, once. Expendable by design.
   */
  demolishes?: boolean;
  /**
   * Chance of destroying a wounded defender outright instead of fighting it.
   * Only ever applies to a defender no larger than the attacker.
   */
  executeChance?: number;
  /**
   * How far this creature can strike without closing. 1, the default, means it
   * has to walk up to whatever it is hitting.
   */
  range?: number;
  /**
   * Throws the weapon it fights with, so a ranged attack costs it that weapon
   * until it can get another. Hits harder for the throw; much weaker after.
   */
  throwsWeapon?: boolean;
  /**
   * Breath carries past whatever it hits, into the tile directly behind.
   * Friend or enemy — it does not look first.
   */
  lineBreath?: boolean;
  /**
   * Fraction of a wounded friend's maximum health this creature can restore,
   * per member of the group: one Paladin patches a unit up to half, two get it
   * all the way. Absent for everyone who cannot do it at all.
   */
  healFraction?: number;
  /**
   * How large this creature is drawn, relative to an Orc at 1.0.
   *
   * Art is trimmed and scaled to fill a fixed frame, so without this a goblin
   * renders exactly as tall as an ogre. Applied at draw time rather than baked
   * into the file, so one number governs the real art, the procedural
   * placeholder, and the composed group sprites alike.
   */
  artScale?: number;
  silhouette: SilhouetteId;
  body: string;
  trim: string;
  blurb: string;
}

// -------------------------------------------------------------- creatures

export const CREATURES: CreatureDef[] = [
  // ------------------------------------------------------------- orc side
  {
    id: 'peon',
    name: 'Peon',
    plural: 'Peons',
    faction: 'orc',
    role: 'worker',
    attack: 0,
    defense: 1,
    hp: 10,
    move: 1,
    cost: 20,
    sight: 1,
    counts: [1],
    settler: true,
    artScale: 0.86,
    silhouette: 'worker',
    body: '#7e9b46',
    trim: '#4a3a26',
    blurb: 'Digs holes. Occasionally a city happens.',
  },
  {
    id: 'goblin',
    name: 'Goblin',
    plural: 'Goblins',
    faction: 'orc',
    role: 'melee',
    attack: 1,
    defense: 1,
    hp: 10,
    move: 2,
    cost: 10,
    sight: 2,
    counts: [1, 2, 3, 5],
    artScale: 0.7,
    silhouette: 'small',
    body: '#93b24d',
    trim: '#c2452b',
    blurb: 'Fast, cheap, and entirely expendable — a fact the goblins are aware of.',
  },
  {
    id: 'sapper',
    name: 'Goblin Sapper',
    plural: 'Goblin Sappers',
    faction: 'orc',
    role: 'siege',
    attack: 3,
    defense: 1,
    hp: 10,
    move: 1,
    cost: 25,
    sight: 1,
    counts: [1, 2],
    siegeBonus: 2,
    explodes: 0.4,
    demolishes: true,
    artScale: 0.72,
    silhouette: 'engine',
    body: '#7f9440',
    trim: '#d8722a',
    blurb: 'Carries the explosives. Has been told repeatedly not to run.',
  },
  {
    id: 'orc',
    name: 'Orc',
    plural: 'Orcs',
    faction: 'orc',
    role: 'melee',
    attack: 3,
    defense: 2,
    hp: 12,
    move: 1,
    cost: 20,
    sight: 1,
    counts: [1, 2, 3, 4, 6, 8, 10],
    artScale: 1.0,
    silhouette: 'brute',
    body: '#6f9138',
    trim: '#a8371f',
    blurb: 'The backbone of the Horde, and the subject of its entire research programme.',
  },
  {
    id: 'axethrower',
    throwsWeapon: true,
    // The axe leaves its hand as you close, and lands before you arrive. That
    // is the first strike, and the reason it then has no axe.
    firstStrikes: 1,
    name: 'Axethrower',
    plural: 'Axethrowers',
    faction: 'orc',
    role: 'ranged',
    attack: 4,
    defense: 1,
    hp: 10,
    move: 1,
    cost: 25,
    sight: 2,
    counts: [1, 2, 3],
    artScale: 0.94,
    silhouette: 'thrower',
    body: '#6a8a3c',
    trim: '#8f8f96',
    blurb: 'Throws the axe. Then has no axe. This remains an active area of study.',
  },
  {
    id: 'troll',
    name: 'Troll',
    plural: 'Trolls',
    faction: 'orc',
    role: 'melee',
    attack: 5,
    defense: 3,
    hp: 15,
    move: 1,
    // Dearer than the raw numbers justify, because it heals at twice the rate
    // and that never appears in a value figure. See DESIGN_QUEUE section 35.
    cost: 42,
    sight: 1,
    counts: [1, 2, 3],
    regenMultiplier: 2,
    artScale: 1.14,
    silhouette: 'brute',
    body: '#4f7f6a',
    trim: '#b8503a',
    blurb: 'Regenerates, given enough time and no further trolls to argue with.',
  },
  {
    id: 'ogre',
    name: 'Ogre',
    plural: 'Ogres',
    faction: 'orc',
    role: 'melee',
    attack: 7,
    defense: 4,
    hp: 20,
    move: 1,
    // Was 50, which made it the best buy in the game by a distance.
    cost: 62,
    sight: 1,
    counts: [1, 2],
    artScale: 1.28,
    silhouette: 'brute',
    body: '#9aa05c',
    trim: '#6b3a2a',
    blurb: 'Two heads, one opinion, which is the ideal ratio.',
  },
  {
    id: 'deathknight',
    // A death knight's touch is not a weapon blow.
    damageKind: 'magic',
    // Magical things are hard to do magic to. Improves with rank, capped well
    // short of immunity -- see resistance() in sim/combat.
    magicResist: 0.3,
    name: 'Death Knight',
    plural: 'Death Knights',
    faction: 'orc',
    role: 'caster',
    attack: 6,
    defense: 3,
    hp: 15,
    move: 2,
    // Cheaper: it was priced as a heavyweight and fought like a middleweight,
    // so nothing ever picked it even once the AI started valuing units properly.
    cost: 48,
    sight: 2,
    counts: [1, 2],
    executeChance: 0.3,
    artScale: 1.1,
    silhouette: 'robed',
    body: '#3d3348',
    trim: '#7f3fbf',
    blurb: 'Formerly a person. Currently a policy.',
  },
  {
    id: 'dragon',
    // Breath, not bite.
    damageKind: 'magic',
    // Magical things are hard to do magic to. Improves with rank, capped well
    // short of immunity -- see resistance() in sim/combat.
    magicResist: 0.3,
    lineBreath: true,
    name: 'Dragon',
    plural: 'Dragons',
    faction: 'orc',
    role: 'flying',
    attack: 10,
    defense: 6,
    hp: 25,
    move: 4,
    // The capstone of the tree, and it should be expensive enough to feel like
    // one. At 90 it was better value than anything the Kingdom could field.
    cost: 110,
    sight: 3,
    counts: [1],
    flies: true,
    artScale: 1.34,
    silhouette: 'winged',
    body: '#8f2f2f',
    trim: '#e8a33a',
    blurb: 'The Horde has exactly one plan for the late game and this is it.',
  },

  // ----------------------------------------------------------- human side
  {
    id: 'peasant',
    name: 'Peasant',
    plural: 'Peasants',
    faction: 'human',
    role: 'worker',
    attack: 0,
    defense: 1,
    hp: 10,
    move: 1,
    cost: 20,
    sight: 1,
    counts: [1],
    settler: true,
    artScale: 0.88,
    silhouette: 'worker',
    body: '#b98a55',
    trim: '#5a4128',
    blurb: 'Founds cities, pays taxes, and asks surprisingly pointed questions.',
  },
  {
    id: 'footman',
    name: 'Footman',
    plural: 'Footmen',
    faction: 'human',
    role: 'melee',
    attack: 2,
    defense: 3,
    hp: 12,
    move: 1,
    cost: 20,
    sight: 1,
    counts: [1, 2, 3, 5, 10],
    artScale: 1.0,
    silhouette: 'armored',
    body: '#c9d2dc',
    trim: '#2f5fa8',
    blurb: 'Holds the line, holds the shield, holds several strong views about pay.',
  },
  {
    id: 'outrider',
    name: 'Outrider',
    plural: 'Outriders',
    faction: 'human',
    role: 'melee',
    attack: 1,
    defense: 1,
    hp: 8,
    move: 3,
    cost: 15,
    sight: 3,
    counts: [1],
    artScale: 1.04,
    silhouette: 'rider',
    body: '#a8b0bb',
    trim: '#4a7f3a',
    blurb: 'Sees the world. Writes it down. Is very pleased about both.',
  },
  {
    id: 'archer',
    firstStrikes: 1,
    name: 'Archer',
    plural: 'Archers',
    faction: 'human',
    role: 'ranged',
    attack: 4,
    defense: 2,
    hp: 10,
    move: 1,
    cost: 25,
    sight: 2,
    counts: [1, 2, 3],
    artScale: 0.94,
    silhouette: 'thrower',
    body: '#5f7f4a',
    trim: '#c9b06a',
    blurb: 'Keeps the arrow. This is considered the decisive military insight of the age.',
  },
  {
    id: 'knight',
    name: 'Knight',
    plural: 'Knights',
    faction: 'human',
    role: 'melee',
    attack: 5,
    defense: 3,
    // Sixteen rather than fourteen. The Kingdom had nothing in the middle of
    // its roster worth building next to the Horde's ogres.
    hp: 16,
    move: 2,
    cost: 40,
    sight: 2,
    counts: [1, 2, 3],
    artScale: 1.16,
    silhouette: 'rider',
    body: '#d8dde4',
    trim: '#2f5fa8',
    blurb: 'Expensive, mounted, and deeply committed to being seen being mounted.',
  },
  {
    id: 'ballista',
    range: 2,
    // Three bolts, then somebody has to fetch more.
    ammo: 3,
    reloadsBy: 'labour',
    name: 'Ballista',
    plural: 'Ballistae',
    faction: 'human',
    role: 'siege',
    attack: 8,
    defense: 1,
    hp: 12,
    move: 1,
    cost: 45,
    sight: 1,
    counts: [1],
    siegeBonus: 2,
    artScale: 1.08,
    silhouette: 'engine',
    body: '#8a6a45',
    trim: '#3f3128',
    blurb: 'Turns a wall into a former wall.',
  },
  {
    id: 'mage',
    // The whole point of a mage.
    damageKind: 'magic',
    // Magical things are hard to do magic to. Improves with rank, capped well
    // short of immunity -- see resistance() in sim/combat.
    magicResist: 0.3,
    range: 2,
    name: 'Mage',
    plural: 'Mages',
    faction: 'human',
    role: 'caster',
    attack: 6,
    defense: 2,
    hp: 12,
    move: 1,
    // Was 55, which made it the worst buy on either roster despite being the
    // Kingdom's only answer to a dragon.
    cost: 45,
    sight: 3,
    counts: [1, 2],
    artScale: 0.98,
    silhouette: 'robed',
    body: '#4b57a8',
    trim: '#e0d18a',
    blurb: 'Has read every book in the Kingdom and will tell you about all of them.',
  },
  {
    id: 'paladin',
    healFraction: 0.5,
    name: 'Paladin',
    plural: 'Paladins',
    faction: 'human',
    role: 'melee',
    attack: 8,
    defense: 6,
    hp: 18,
    move: 2,
    cost: 70,
    sight: 2,
    counts: [1, 2],
    artScale: 1.22,
    silhouette: 'rider',
    body: '#e8d9a0',
    trim: '#c9a33a',
    blurb: 'Morally certain, heavily armoured, and correct about roughly half of it.',
  },
];

// ------------------------------------------------------- generated types

const NUMBER_WORDS = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
];

/** Groups of this size or larger cannot agree on a direction. */
export const CROWD_THRESHOLD = 5;

export interface UnitTypeDef {
  id: UnitTypeId;
  /** Creature this variant is built from. */
  base: string;
  /** How many of them are on the tile — and on the sprite. */
  count: number;
  name: string;
  faction: FactionId;
  role: UnitRole;
  attack: number;
  defense: number;
  hp: number;
  move: number;
  cost: number;
  sight: number;
  settler: boolean;
  flies: boolean;
  firstStrikes: number;
  ammo: number;
  reloadsBy: 'labour' | 'sacrifice';
  siegeBonus: number;
  /**
   * True when the group is big enough to lose a movement point to internal
   * disagreement, until the owner researches their coordination advance.
   */
  crowded: boolean;
  regenMultiplier: number;
  /** Fraction of a neighbour's health lost when this dies defending; 0 for most. */
  explodes: number;
  /** What its blows are made of. */
  damageKind: DamageKind;
  /** Share of magical damage it shrugs off before rank; 0 for everything today. */
  magicResist: number;
  demolishes: boolean;
  executeChance: number;
  /** Tiles this unit can strike across. 1 means adjacent only. */
  range: number;
  /** Throws its weapon when it strikes at range, and is the worse for it. */
  throwsWeapon: boolean;
  /** Attacks carry into the tile beyond the target. */
  lineBreath: boolean;
  /**
   * Health a target is restored to, as a fraction of its maximum. Scales with
   * the group, so Two Paladins heal outright where one leaves the job half
   * done, and is capped at full health.
   */
  healsTo: number;
  /** Drawn size relative to an Orc. See CreatureDef.artScale. */
  artScale: number;
  silhouette: SilhouetteId;
  body: string;
  trim: string;
  blurb: string;
}

export function unitTypeId(baseId: string, count: number): UnitTypeId {
  return count === 1 ? baseId : `${baseId}_x${count}`;
}

export function countName(creature: CreatureDef, count: number): string {
  if (count === 1) return creature.name;
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} ${creature.plural}`;
}

function makeVariant(c: CreatureDef, count: number): UnitTypeDef {
  return {
    id: unitTypeId(c.id, count),
    base: c.id,
    count,
    name: countName(c, count),
    faction: c.faction,
    role: c.role,
    attack: c.attack * count,
    defense: c.defense * count,
    /*
     * Health does *not* scale with the count, and that is the single most
     * important number in the game.
     *
     * When it did, a rung of the ladder bought N times the damage and N times
     * the health for N times the price -- and the two multiply, so a stack was
     * effectively N-squared for a linear cost. Nothing priced linearly could
     * compete, which is why the AI never once built a dragon and why the whole
     * right-hand side of the tech tree was scenery. See DESIGN_QUEUE 31 and 32.
     *
     * Flat health is also what the design document always claimed the trade
     * was: N orcs are efficient because they hold one tile and spend one
     * movement point, and the price is that you lose all of them at once. That
     * price was never actually being charged.
     */
    hp: c.hp,
    move: c.move,
    cost: c.cost * count,
    sight: c.sight,
    settler: c.settler === true,
    flies: c.flies === true,
    firstStrikes: c.firstStrikes ?? 0,
    // Not multiplied by the count: three ballistas share the supply wagon.
    ammo: c.ammo ?? 0,
    reloadsBy: c.reloadsBy ?? 'labour',
    siegeBonus: c.siegeBonus ?? 1,
    crowded: count >= CROWD_THRESHOLD,
    regenMultiplier: c.regenMultiplier ?? 1,
    explodes: c.explodes ?? 0,
    damageKind: c.damageKind ?? 'physical',
    magicResist: c.magicResist ?? 0,
    demolishes: c.demolishes === true,
    executeChance: c.executeChance ?? 0,
    range: c.range ?? 1,
    throwsWeapon: c.throwsWeapon === true,
    lineBreath: c.lineBreath === true,
    // Still scaled by the count, unlike health. This is a share of the
    // *patient's* health bar rather than the healer's, and "one paladin
    // patches you up halfway, two finish the job" is a designed mechanic that
    // has nothing to do with how tough the healer is.
    healsTo: Math.min(1, (c.healFraction ?? 0) * count),
    artScale: c.artScale ?? 1,
    silhouette: c.silhouette,
    body: c.body,
    trim: c.trim,
    blurb: c.blurb,
  };
}

export const CREATURES_BY_ID: Record<string, CreatureDef> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
);

export const UNIT_TYPES: Record<UnitTypeId, UnitTypeDef> = (() => {
  const out: Record<UnitTypeId, UnitTypeDef> = {};
  for (const c of CREATURES) {
    for (const n of c.counts) {
      const v = makeVariant(c, n);
      out[v.id] = v;
    }
  }
  return out;
})();

export const UNIT_TYPE_IDS = Object.keys(UNIT_TYPES);

export function unitType(id: UnitTypeId): UnitTypeDef {
  const t = UNIT_TYPES[id];
  if (!t) throw new Error(`Unknown unit type: ${id}`);
  return t;
}

/**
 * How many of the creature are still on their feet.
 *
 * A count unit is one unit with N drawn on it, so damage has to mean something
 * other than "the same N, slightly tired". It means losses: Ten Orcs at half
 * health is Five Orcs, and fights like Five Orcs until it heals.
 *
 * **A singleton never degrades.** A dragon on its last legs still breathes the
 * same fire, because there is only ever one of it and it is either there or it
 * is not. That asymmetry is the point rather than a side effect -- see
 * DESIGN_QUEUE section 32.
 *
 * Rounds up, so a unit is never reduced below one while it is still alive.
 */
export function aliveCount(unit: { type: UnitTypeId; hp: number }): number {
  const type = unitType(unit.type);
  if (unit.hp <= 0) return 0;
  if (type.count <= 1) return 1;
  return Math.max(1, Math.min(type.count, Math.ceil(type.count * (unit.hp / type.hp))));
}

/**
 * Switch for measuring against a control arm, in the manner of
 * `FORTIFY_BONUS_REF`. Off means the old behaviour: full strength until dead.
 */
export const ATTRITION = { enabled: true };

/** The share of its full strength a unit still fights at, from its losses. */
export function headcount(unit: { type: UnitTypeId; hp: number }): number {
  if (!ATTRITION.enabled) return 1;
  const type = unitType(unit.type);
  if (type.count <= 1) return 1;
  return aliveCount(unit) / type.count;
}

/**
 * Shots this unit has left. Absent on the unit means it is fully loaded, so a
 * fresh piece and an old save both read correctly without a migration.
 */
export function ammoLeft(unit: { type: UnitTypeId; ammo?: number }): number {
  const max = unitType(unit.type).ammo;
  if (max <= 0) return Infinity;
  return unit.ammo ?? max;
}

/** True for a piece that carries a magazine and has not filled it. */
export function needsAmmo(unit: { type: UnitTypeId; ammo?: number }): boolean {
  const max = unitType(unit.type).ammo;
  return max > 0 && ammoLeft(unit) < max;
}
