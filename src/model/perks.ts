import type { FactionId, Unit } from './types';

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

/** What this unit could still take, in a stable order. */
export function perkChoices(unit: Unit): PerkDef[] {
  return PERKS.filter((p) => !hasPerk(unit, p.id));
}

export function perkName(perk: PerkDef, faction: FactionId): string {
  return perk.name[faction] ?? perk.id;
}
