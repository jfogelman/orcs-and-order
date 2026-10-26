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
  // --------------------------------------------------------- section 125
  //
  // Four sorts, and the joke is the inverse of the Horde's. The Horde has the
  // most kinds available because it is less an empire than an ongoing accident
  // that keeps acquiring participants; the Hive has the fewest, and the
  // differences between them are barely differences.
  {
    id: 'hk-worker',
    name: 'Worker-caste',
    faction: 'hivekin',
    weight: 4,
    blurb: 'Was grown for this. Is doing this.',
  },
  {
    id: 'hk-fodder',
    name: 'Fodder-caste',
    faction: 'hivekin',
    needs: 'caste-fodder',
    weight: 4,
    blurb: 'Grown in quantity, on the understanding that quantity is the point.',
  },
  {
    id: 'hk-soldier',
    name: 'Soldier-caste',
    faction: 'hivekin',
    needs: 'caste-soldier',
    weight: 2,
    blurb: 'Between occasions to fight, it stands where it was put.',
  },
  {
    id: 'hk-tender',
    name: 'Tender-caste',
    faction: 'hivekin',
    needs: 'happiness',
    weight: 1,
    blurb: 'Looks after the brood. Has not been told why this matters and does it anyway.',
  },

  // --------------------------------------------------------- section 143
  //
  // The Wandering Folk, and the joke is neither of the other two. The Horde
  // acquires participants and the Hive grows castes; **these turned up**. Each
  // sort is somebody who left one of the other sides, so the roster is the
  // only one in the game made entirely of other people's citizens -- which is
  // why the blurbs are all departures.
  //
  // The five sorts and their races are `WANDERERS_PLAN.md`'s, read off the
  // tier table: Gnome, Elf, Orc, Dwarf, Ogre, which is also exactly what the
  // art drop holds. **The weights and the `needs` gates are mine** -- the
  // bible assigns a race to a unit tier and says nothing about who lives in
  // the towns -- so each sort arrives with the tier it belongs to, and the
  // spread is 4/3/2/2/1, a rung either side of the Horde's 4/4/2/2/1: one
  // commonest sort rather than two, because the Gnome is the only one of
  // these who did not leave somewhere to be here.
  //
  // Section 142 shipped this faction with no entry here at all, so
  // `rollCitizen` fell to its `'goblin'` guard and **every Wandering Folk city
  // was full of goblins**, with ten processed sheets sitting unused in
  // `public/citizens/`. Nothing failed: the pictures were valid, they were
  // simply the wrong people.
  {
    id: 'wf-wanderer',
    name: 'Gnomes',
    faction: 'wandering',
    weight: 4,
    hasFemale: true,
    blurb: 'Never had a homeland to leave, so this is not a comedown.',
  },
  {
    id: 'wf-slinger',
    name: 'Elves',
    faction: 'wandering',
    needs: 'tier-slinger',
    weight: 3,
    hasFemale: true,
    blurb: 'Left somewhere beautiful. Will not be drawn on which, or why.',
  },
  {
    id: 'wf-outcast',
    name: 'Orcs',
    faction: 'wandering',
    needs: 'tier-outcast',
    weight: 2,
    hasFemale: true,
    blurb: 'Thrown out of the Horde, which takes some doing.',
  },
  {
    id: 'wf-brute',
    name: 'Ogres',
    faction: 'wandering',
    needs: 'tier-brute',
    weight: 2,
    hasFemale: true,
    blurb: 'Was promised regular meals. Is still, on balance, better off.',
  },
  {
    id: 'wf-mystic',
    name: 'Dwarves',
    faction: 'wandering',
    needs: 'signature-mystic',
    weight: 1,
    hasFemale: true,
    blurb: 'Came out to look at the road. Has been looking at it for years.',
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

/**
 * The four moods, in the order the sheets are drawn in. Section 143.
 *
 * `MOOD_LADDER` rather than `MOODS`, which `sim/diplomacy.ts` already has for
 * how two empires feel about each other. Two tables of that name, one about
 * citizens and one about treaties, is a mix-up waiting to be imported.
 *
 * Here rather than in the city panel because the panel and the Orcpedia both
 * have to name them, and two lists of four adjectives that must agree is a
 * disagreement waiting to be written. The colours are the heat bar's, taken
 * from the existing palette tokens rather than new ones: `--ok` at the top,
 * `--danger` at the bottom, and the two in between are the gold the rest of
 * the interface already uses for "worth your attention".
 */
export interface Mood {
  /** What to call it to a player. */
  name: string;
  /** The heat bar's colour for this rung. */
  color: string;
}

export const MOOD_LADDER: Mood[] = [
  { name: 'delighted', color: '#5fbf4a' },
  { name: 'content', color: '#9bbf3f' },
  { name: 'restless', color: '#d9a83f' },
  { name: 'furious', color: '#c9432c' },
];

/**
 * How the **nth** citizen of a city feels, from 0 (delighted) to 3 (furious).
 *
 * `n` is one-based: the first person in the town is 1.
 *
 * Until section 143 this took the city's size and returned one mood for
 * everybody, so a town of eight drew eight identical faces. That was never a
 * rule -- contentment is a property of a city and always has been -- it was a
 * drawing decision, and it threw away the only interesting thing the number
 * says, which is **which** of these people the limit does not cover.
 *
 * The ladder itself is unchanged, and deliberately so: feeding it `n` instead
 * of `city.size` leaves the **last** citizen on exactly the mood the whole town
 * used to show, and makes everybody standing in front of them happier. So no
 * city reads worse than it did, and a city over its limit now shows the
 * surplus as surplus instead of tarring the whole population with it.
 *
 * Rioting is still its own answer, and it is everybody's: a riot is not a
 * thing a town does by halves.
 */
export function moodAt(disorder: boolean, limit: number, n: number): number {
  if (disorder) return CITIZEN_MOODS - 1;
  const headroom = limit - n;
  if (headroom >= 3) return 0;
  if (headroom >= 2) return 1;
  if (headroom >= 1) return 2;
  return CITIZEN_MOODS - 1;
}

/** How many citizens sit on each mood, for a city of `size` content to `limit`. */
export function moodTally(disorder: boolean, limit: number, size: number): number[] {
  const tally = new Array<number>(CITIZEN_MOODS).fill(0);
  for (let n = 1; n <= size; n++) tally[moodAt(disorder, limit, n)]++;
  return tally;
}
