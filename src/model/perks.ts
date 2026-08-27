import type { FactionId, Unit } from './types';
import { unitType } from './units';

/**
 * What a unit chooses when it is promoted.
 *
 * Rank on its own is a multiplier going up, which is not a decision. These are.
 * Every one of them hooks into a rule that already exists rather than adding a
 * new subsystem -- supply, sacking, the militia stand, healing -- so a promoted
 * unit changes how the parts already in the game behave around it.
 *
 * The two sides take the same perks under different names. The Horde's are
 * things that happened to it; the Kingdom's are things somebody arranged.
 */
export interface PerkDef {
  id: string;
  /** What each side calls it. */
  name: Record<FactionId, string>;
  blurb: string;
  /**
   * Base creatures this is offered to. Absent means anybody.
   *
   * The first perks in the game were all things that could happen to any unit.
   * A club is not: it is a thing an ogre is holding.
   */
  only?: string[];
  /**
   * Advance that has to be in hand before this appears on the menu.
   *
   * This is what DESIGN_QUEUE section 11 was actually asking for -- a unit's
   * menu of choices growing as the tree does, so a late advance lands as
   * something visible rather than another number.
   */
  flag?: string;
}

export const PERKS: PerkDef[] = [
  {
    id: 'bloodied',
    name: { orc: 'Worked Up', human: 'Commended' },
    blurb: 'Hits appreciably harder than it used to.',
  },
  {
    id: 'dug-in',
    name: { orc: 'Stubborn', human: 'Drilled' },
    blurb: 'Much harder to shift once it has decided to stay.',
  },
  {
    id: 'quartermaster',
    name: { orc: 'Knows a Bloke', human: 'Quartermaster' },
    blurb: 'Supply reaches it further out than it reaches anybody else.',
  },
  {
    id: 'field-repairs',
    name: { orc: 'Licks It Better', human: 'Field Surgeon' },
    blurb: 'Recovers even beyond the supply line, slowly.',
  },
  {
    id: 'butcher',
    name: { orc: 'Thorough', human: 'Requisition Order' },
    blurb: 'Takes noticeably more of a city when it takes one.',
  },
  /*
   * The three clubs, from DESIGN_QUEUE section 11. All ogre-only and all
   * waiting on one advance, so the choice arrives as a choice rather than as
   * three more units on the list.
   */
  {
    id: 'fiery-club',
    name: { orc: 'Fiery Club', human: 'Fiery Club' },
    blurb: 'Sets fire to whatever it hits, and keeps it that way for a while.',
    only: ['ogre'],
    flag: 'clubs',
  },
  {
    id: 'exploding-club',
    name: { orc: 'Exploding Club', human: 'Exploding Club' },
    blurb: 'Goes off on impact, catching everything around the target. The ogre included, though it minds less.',
    only: ['ogre'],
    flag: 'clubs',
  },
  {
    id: 'quake-club',
    name: { orc: 'Quake Club', human: 'Quake Club' },
    blurb: 'Hits the ground so hard that everyone standing near the ogre regrets it.',
    only: ['ogre'],
    flag: 'clubs',
  },
  /*
   * The last three from DESIGN_QUEUE section 11, each hung off an advance that
   * was previously a dead end -- which is the whole point of the section.
   */
  {
    id: 'mostly-volatile',
    name: { orc: 'Mostly Volatile', human: 'Mostly Volatile' },
    blurb: 'Survives one killing blow. One. It does not go off that time either.',
    only: ['sapper'],
    flag: 'volatile',
  },
  {
    id: 'better-part-of-valour',
    name: { orc: 'Better Part of Valour', human: 'Better Part of Valour' },
    blurb: 'Falls back a step when it attacks something and fails to finish it.',
    only: ['knight'],
    flag: 'valour',
  },
  {
    id: 'swampy-friend',
    name: { orc: 'Swampy Friend', human: 'Swampy Friend' },
    blurb: 'Alone, and standing in a swamp, it can make another of itself. It costs nearly everything.',
    only: ['troll'],
    flag: 'swampy',
  },
  {
    id: 'reputation',
    name: { orc: 'Preceded By Rumour', human: 'Reputation' },
    blurb: 'Townsfolk do not bother throwing things. They have heard.',
  },
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(
  PERKS.map((p) => [p.id, p]),
);

export function hasPerk(unit: Unit, id: string): boolean {
  return unit.perks?.includes(id) === true;
}

/**
 * How many choices this unit has coming.
 *
 * Derived from rank rather than stored, so nothing can drift: a unit that has
 * been promoted three times and chosen twice is owed one, whatever happened in
 * between.
 */
export function owedPerks(unit: Unit): number {
  return Math.max(0, unit.rank - (unit.perks?.length ?? 0));
}

/**
 * What this unit could still take, in a stable order.
 *
 * `flags` is what its owner has researched; omitted, nothing gated on an
 * advance is offered, which is the safe way round for a caller that has not
 * been taught about them yet.
 */
export function perkChoices(unit: Unit, flags: readonly string[] = []): PerkDef[] {
  const base = unitType(unit.type).base;
  return PERKS.filter((p) => {
    if (hasPerk(unit, p.id)) return false;
    if (p.only && !p.only.includes(base)) return false;
    if (p.flag && !flags.includes(p.flag)) return false;
    return true;
  });
}

export function perkName(perk: PerkDef, faction: FactionId): string {
  return perk.name[faction] ?? perk.id;
}
