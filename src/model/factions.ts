import type { FactionId, TechId } from './types';

export interface FactionDef {
  id: FactionId;
  /** The people, e.g. "Orcs". */
  name: string;
  /** The polity, e.g. "The Bleeding Skull Horde". */
  civName: string;
  leader: string;
  /** Map / UI colour. */
  color: string;
  /** Darker shade for outlines and shadowed edges. */
  shade: string;
  /** The advance every member of this faction starts the game already knowing. */
  startTech: TechId;
  /**
   * Whether this side is on the map at turn one, and so can be chosen to play.
   *
   * Section 125's Hivekin are not: they **emerge**, around the middle of the
   * game, on ground nobody took. That is a rule about the world rather than
   * about them, which is why it is a field here and not inferred from `talks`
   * -- a later faction could perfectly well emerge *and* negotiate, or start on
   * the map and refuse to.
   *
   * Playing as a side that emerges is a real question and an open one: it would
   * need its own opening, and the whole point of emergence was to leave the
   * measured opening alone. Until that is answered, the picker offers the two
   * that start.
   */
  startsOnMap: boolean;
  /** The unit that founds cities. */
  settlerUnit: string;
  /** The first fighting unit. */
  starterUnit: string;
  cityNames: string[];
  blurb: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  orc: {
    id: 'orc',
    name: 'Orcs',
    civName: 'The Bleeding Skull Horde',
    leader: 'Grunk the Reasonably Confident',
    color: '#8ab53f',
    shade: '#40561c',
    startTech: 'first-orc',
    startsOnMap: true,
    settlerUnit: 'peon',
    starterUnit: 'goblin',
    blurb:
      'Enormously strong, enormously numerous, and collectively unable to ' +
      'count past four without a research programme.',
    cityNames: [
      'Skullgrind',
      'Bonechew',
      'Grimtooth',
      'Mudhole',
      'Second Mudhole',
      'Definitely Not Mudhole',
      'Stabhaven',
      'Gorepit',
      'The Loud Place',
      'Big Rock',
      'Other Big Rock',
      'Uggo',
      'Thrag',
      'Nrrgh',
      'Deathcamp Number Four',
      'Fort Probably Fine',
      'Screamhollow',
      'The Wet Place',
      'Krungle',
      'Blorf',
      'Ash Pile',
      'Former Ash Pile',
      'Grukkendorf',
      'The Bit With The Skulls',
    ],
  },
  human: {
    id: 'human',
    name: 'Humans',
    civName: 'The Radiant Kingdom of Bram',
    leader: 'King Aldric the Well-Meaning',
    color: '#5b9bd8',
    shade: '#1f3f66',
    startTech: 'first-human',
    startsOnMap: true,
    settlerUnit: 'peasant',
    starterUnit: 'footman',
    blurb:
      'Organised, literate, and in possession of a formal committee process ' +
      'for deciding that two soldiers may stand beside one another.',
    cityNames: [
      'Highmarch',
      'Aldenwatch',
      'Silverbrook',
      'Fairhaven',
      "Duke's Rest",
      'Thornwall',
      'Greyford',
      "Saint Meredith's Elbow",
      'New Aldenwatch',
      'Kingsbridge',
      'Palewater',
      "Merchant's Folly",
      'Lightholm',
      'Abbotsford',
      'Crownhill',
      'Little Crownhill',
      'Westmoot',
      'Emberford',
      'The Third Duchy',
      'Provisional Capital',
      'Oldbridge',
      'Newbridge',
      'Bridgeless',
      'Saint Aldric-in-the-Marsh',
    ],
  },
  hivekin: {
    id: 'hivekin',
    name: 'Hivekin',
    civName: 'The Hive As It Stands',
    leader: 'The Queen, Who Is Already Aware',
    // Amber, for the bioluminescence. Checked against the raiders' tan
    // (#a8894e), which is the nearest thing on the map and is duller and
    // darker; and against the Horde's yellow-green, which it does not share a
    // hue with at this saturation.
    color: '#e08a2e',
    shade: '#6d3c10',
    startTech: 'first-hivekin',
    startsOnMap: false,
    settlerUnit: 'grub',
    starterUnit: 'fodder',
    blurb:
      'Patient, numerous, and entirely without ambition, on the grounds that ' +
      'whatever happens next was always going to be what happened next.',
    cityNames: [
      'The First Hollow',
      'Second Hollow',
      'The Warm Place',
      'Deepcell',
      'The Hive That Is Adequate',
      'Nineteen Chambers',
      'Twenty Chambers',
      'The Dry Mound',
      'The Wet Mound',
      'Where The Ground Gave',
      'The Overflow',
      'Second Overflow',
      'The Quiet Brood',
      'Far Cell',
      'The Hive Nearest The Water',
      'The Hive Slightly Further From The Water',
      'Cracked Shell',
      'The Replacement',
      "The Replacement's Replacement",
      'Sufficient',
      'More Than Sufficient',
      'The Mound That Was Always Going To Be Here',
      'Southcell',
      'The Last One For Now',
    ],
  },
};

export const FACTION_IDS: FactionId[] = ['orc', 'human', 'hivekin'];

/** The sides a new game may be started as, and that begin on the map. */
export const STARTING_FACTIONS: FactionId[] = FACTION_IDS.filter((f) => FACTIONS[f].startsOnMap);

/**
 * Everybody who is not this one.
 *
 * Replaces `otherFaction`, which was a coin flip and could only ever have been.
 * Nothing in the game wants "the other side" any more -- it wants the list, and
 * usually the first of it, which is what the two-sided code was really asking
 * for all along.
 */
export function rivalFactions(id: FactionId): FactionId[] {
  return FACTION_IDS.filter((f) => f !== id);
}

/**
 * Whether this side sits down at a table at all. Section 135 slice 3b.
 *
 * **It used to be "everybody but the Hivekin", and that was two things at
 * once.** Section 125 wrote it as a joke -- the Queen does not negotiate and
 * the advisor who speaks for her does not soften it -- but it was also load
 * bearing, because the peace in `sim/diplomacy.ts` was a single global
 * agreement and a third contender would have been quietly included in somebody
 * else's treaty. Slice 1 made relations per pair, which removed the second
 * reason entirely.
 *
 * Jeremy, asked directly whether the Hive should be silent: *"No definitely
 * not, they're alien to orcs/humans not silent. They have their odd diplomacy
 * advisor that tries to mimic humanoid emotion after all."* So they talk, and
 * what makes them alien is **what they want out of it** rather than whether
 * they turn up -- see the Hive branch of `wantPeace`, which reads the balance
 * of power and nothing else, because survival trumps everything and it does
 * not hold grudges it could recompute instead.
 */
export const NEGOTIATION = {
  /** The switch, for sweeps. Off is the game before the Hive had a table. */
  hivekin: true,
};

export function talks(id: FactionId): boolean {
  return id === 'hivekin' ? NEGOTIATION.hivekin : true;
}
