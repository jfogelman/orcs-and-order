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
   * Whether this side is on the map at turn one **in an ordinary game**.
   *
   * Not the same question as whether it can be chosen, though this field
   * answered both until section 136 and that conflation is what kept the
   * Hivekin out of the picker. See `playable`.
   *
   * Section 125's Hivekin are not: they **emerge**, around the middle of the
   * game, on ground nobody took. That is a rule about the world rather than
   * about them, which is why it is a field here and not inferred from `talks`
   * -- a later faction could perfectly well emerge *and* negotiate, or start on
   * the map and refuse to.
   *
   * Playing as a side that emerges turned out to need neither its own opening
   * nor a replacement for itself. Seat 0 is on the map because it is seat 0,
   * and the rivals are whoever would ordinarily start -- so a Hive player
   * faces **both** empires from turn one, which is three contenders, the same
   * as anybody else's game. `generateWorld` already took a player count.
   */
  startsOnMap: boolean;
  /**
   * Whether the picker offers this side. Section 136.
   *
   * Split from `startsOnMap`, which was doing two jobs: one is a fact about
   * the world (does this side exist before somebody digs it up) and the other
   * is a fact about the menu. The Hivekin are false for the first and true for
   * the second, and reading one off the other is what made "can I play them"
   * look like a design question instead of a line of code.
   */
  playable: boolean;
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
    playable: true,
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
    playable: true,
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
    playable: true,
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
  // ------------------------------------------------------------ section 142
  //
  // The Wandering Folk. Orcs answer "how many", humans "how organised",
  // Hivekin "what grows next"; these answer **"whoever's left standing"**.
  //
  // `WANDERERS_PLAN.md` has the whole design. What is not in it, and is
  // therefore mine rather than Jeremy's, is marked where it appears: the
  // civ name, the leader, the colour and the city names. All four are
  // drafted in the bible's own register -- pragmatic, transactional, dry
  // rather than mournful -- and all four are the easiest things in this
  // file to overwrite.
  wandering: {
    id: 'wandering',
    name: 'Wandering Folk',
    // Mine. The bible names the faction and never names its nation, which for
    // this lot is the joke: the closest thing they have to a country is an
    // agreed meeting point.
    civName: 'The Agreed Meeting Point',
    leader: 'Whoever Was Holding The Ledger',
    // Mine. A dusty road-brown: warm enough to read against the Hive's amber
    // at a glance, and deliberately the least martial colour on the map --
    // it is the one faction whose banner is a tarpaulin. Checked against the
    // raiders' tan (#a8894e), which is lighter and greyer, and against the
    // Kingdom's blue, which it shares no hue with at all.
    color: '#b5683a',
    shade: '#5a2d16',
    startTech: 'first-wanderers',
    // Section 139 made this a fact about the slot rather than the faction, so
    // this only decides whether they are offered as a side that *can* open on
    // the map. They can: there is nothing about them that has to arrive late.
    startsOnMap: true,
    playable: true,
    settlerUnit: 'wanderer',
    starterUnit: 'wf-skirmisher',
    blurb:
      'No homeland, no birthright, and no particular feelings about either. ' +
      'Whatever they have, somebody agreed to hand over.',
    // Mine. Every name is a transaction, a direction, or a thing nobody got
    // round to deciding -- which between them is the whole faction.
    cityNames: [
      'The Agreed Meeting Point',
      'Second Meeting Point',
      'Where The Carts Stopped',
      'Good Enough Crossing',
      'The Long Stay',
      'Three Weeks Camp',
      'Still Three Weeks Camp',
      'The Paid-Up Field',
      'Somebody Else’s Hill',
      'Formerly Somebody Else’s Hill',
      'The Open Ledger',
      'Halfway To Anywhere',
      'The Mended Wheel',
      'Last Water Before The Dry',
      'First Water After It',
      'The Place With The Big Tent',
      'The Place With The Other Tent',
      'Nobody’s Road',
      'The Short Contract',
      'The Long Contract',
      'Owed And Settled',
      'The Turning Place',
      'Far Pitch',
      'We Will Move On Shortly',
    ],
  },
  // ------------------------------------------------------------ section 152
  //
  // The Unbound. Orcs answer "how many", humans "how organised", Hivekin
  // "what grows next", the Wandering Folk "whoever's left standing" -- and
  // these answer **"it did not take"**.
  //
  // `UNBOUND_PLAN.md` has the whole design. What is not in it, and is
  // therefore mine rather than Jeremy's, is marked where it appears: the civ
  // name, the leader, the colour and the city names. All four are drafted in
  // the bible's own register -- unhurried, faintly bureaucratic, certain that
  // the arrangement is reasonable -- and all four are the easiest things in
  // this file to overwrite.
  unbound: {
    id: 'unbound',
    name: 'Unbound',
    // Mine. The joke for this lot is that nothing is a nation: it is an
    // agreement nobody can now recall entering into and nobody has rescinded.
    civName: 'The Standing Arrangement',
    leader: 'The One Who Was Asked First',
    // Mine. A cold bone-grey with a blue cast: the one faction whose colour
    // is an absence of warmth rather than a hue. Checked against the Hive's
    // amber and the Wanderers' road-brown, which are both warm; against the
    // Kingdom's blue, which is saturated where this is washed out; and
    // against the raiders' tan, which is darker and yellower.
    color: '#9fb3bd',
    shade: '#3d4e57',
    startTech: 'first-unbound',
    // Nothing about them has to arrive late -- what they are is a condition,
    // not an event -- so they are offered as a side that can open on the map.
    startsOnMap: true,
    playable: true,
    settlerUnit: 'domovoi',
    starterUnit: 'revenant',
    blurb:
      'Died, and then carried on, and have since declined every opportunity ' +
      'to make anything of it. The arrangement suits them.',
    // Mine. Every name is a thing that was supposed to be temporary, a thing
    // nobody has got round to, or a place described by what happened there --
    // which between them is the whole faction.
    cityNames: [
      'The Standing Arrangement',
      'Where It Happened',
      'The Second Arrangement',
      'Still Pending',
      'The Long Wake',
      'Nobody Left To Ask',
      'The Agreed Hour',
      'Somewhere To Wait',
      'The Unread Will',
      'Formerly A Field',
      'The Quiet Clause',
      'As Discussed',
      'The Returned Quarter',
      'Twice Buried',
      'The Open Question',
      'Pending Review',
      'The Last Appointment',
      'Nobody Objected',
      'The Settled Matter',
      'Unfinished Business',
      'The Late Holding',
      'Where The Lamps Stay Lit',
      'The Agreed Remainder',
      'We Are Still Here',
    ],
  },
};

/**
 * Every side in the game, in table order.
 *
 * **Derived, not written out.** Section 142 added the Wandering Folk to
 * `FACTIONS` -- which is an exhaustive `Record<FactionId, …>`, so the compiler
 * demanded every one of a dozen per-faction tables be filled -- and then the
 * faction was *invisible to the entire game*, because this one array had not
 * been edited. It had units, a tech fork, a palace, perks and advisor lines,
 * and nothing offered it: the opponent picker, the Orcpedia's tabs,
 * `rivalFactions` and `opponentsOf` all read this.
 *
 * Nothing failed. Two Orcpedia tests caught it, and only because they sweep
 * the creature table rather than a list somebody maintains -- which is the
 * same reason they exist (section 137) and the same hand-maintained-list trap
 * section 141 hit with the art.
 *
 * `Object.keys` keeps insertion order, so this is the order the table is
 * written in, which is what section 139's "first opponent starts on the map"
 * reads. Adding a faction to `FACTIONS` now adds it everywhere.
 */
export const FACTION_IDS: FactionId[] = Object.keys(FACTIONS) as FactionId[];

/** The sides a new game may be started as, and that begin on the map. */
export const STARTING_FACTIONS: FactionId[] = FACTION_IDS.filter((f) => FACTIONS[f].playable);

/**
 * The sides that sit down opposite this one at turn one.
 *
 * Everybody who would ordinarily start, which is the two empires -- minus
 * whoever is being played. So an empire gets one rival and the game is the one
 * that has always been measured, and the Hive gets two, because the side it
 * would otherwise have been is itself.
 */
export function rivalsOnMap(playerFaction: FactionId): FactionId[] {
  return FACTION_IDS.filter((f) => f !== playerFaction && FACTIONS[f].startsOnMap);
}

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
