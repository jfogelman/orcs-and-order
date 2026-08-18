import type { FactionId, Player } from './types';

/**
 * Who actually lives in your cities.
 *
 * Population is a number in the rules and stays one -- nothing here affects
 * yields, growth or contentment. What it changes is that a city of eight is
 * eight *particular* people, and which sorts of people you can attract depends
 * on what you have learned.
 *
 * The Horde has more kinds available than the Kingdom, which is the joke: it
 * is not an empire so much as an ongoing accident that keeps acquiring
 * participants.
 *
 * Existing citizens are never re-rolled. A city that filled up before you
 * learned to attract ogres keeps the goblins it already had; only somebody
 * newly born rolls against the current list.
 */
export interface CitizenRace {
  id: string;
  name: string;
  faction: FactionId;
  /**
   * Advance that makes this sort start turning up, or undefined for the ones
   * who were always here.
   */
  needs?: string;
  /** Relative likelihood against the other unlocked sorts. */
  weight: number;
  /** Whether there is a separate sheet of women of this sort. */
  hasFemale?: boolean;
  blurb: string;
}

export const CITIZEN_RACES: CitizenRace[] = [
  // ------------------------------------------------------------- the Horde
  {
    id: 'goblin',
    name: 'Goblins',
    faction: 'orc',
    weight: 4,
    blurb: 'Were here first, and will not let anyone forget it.',
  },
  {
    id: 'orc',
    name: 'Orcs',
    faction: 'orc',
    needs: 'orc-meaning',
    weight: 4,
    blurb: 'Arrived once somebody worked out what an orc was for.',
  },
  {
    id: 'troll',
    name: 'Trolls',
    faction: 'orc',
    needs: 'axes',
    weight: 2,
    blurb: 'Turned up with the axes and stayed for the conversation.',
  },
  {
    id: 'ogre',
    name: 'Ogres',
    faction: 'orc',
    needs: 'my-little-friend',
    weight: 2,
    blurb: 'Eats a great deal. Counts as one citizen, which is generous.',
  },
  {
    id: 'deathmage',
    name: 'Death Mages',
    faction: 'orc',
    needs: 'dead-messed-up',
    weight: 1,
    blurb: 'Moved in after the incident. Nobody has asked them to leave.',
  },

  // ----------------------------------------------------------- the Kingdom
  {
    id: 'human',
    name: 'Humans',
    faction: 'human',
    weight: 5,
    hasFemale: true,
    blurb: 'Filling in forms since before there were forms.',
  },
  {
    id: 'dwarven',
    name: 'Dwarves',
    faction: 'human',
    needs: 'bridge-building',
    weight: 3,
    hasFemale: true,
    blurb: 'Came to look at the bridge. Stayed to criticise it.',
  },
  {
    id: 'elven',
    name: 'Elves',
    faction: 'human',
    needs: 'pointed-ears',
    weight: 2,
    hasFemale: true,
    blurb: 'Arrived the moment somebody noticed they existed.',
  },
  {
    id: 'mage',
    name: 'Mages',
    faction: 'human',
    needs: 'rumbling-voice',
    weight: 1,
    hasFemale: true,
    blurb: 'Will explain the rumbling if given the slightest encouragement.',
  },
];

export const CITIZEN_BY_ID: Record<string, CitizenRace> = Object.fromEntries(
  CITIZEN_RACES.map((r) => [r.id, r]),
);

/** The sorts of people currently willing to live in this player's cities. */
export function availableRaces(player: Player): CitizenRace[] {
  return CITIZEN_RACES.filter(
    (r) => r.faction === player.faction && (!r.needs || player.techs.includes(r.needs)),
  );
}

/** How many moods each citizen sheet holds: happy, pleased, flat, furious. */
export const CITIZEN_MOODS = 4;
