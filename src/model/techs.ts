import type { BuildingId, FactionId, TechId, UnitTypeId } from './types';

/**
 * The tech tree, whose names come from the original design doc.
 *
 * Both factions are discovering the same thing — that more than one soldier
 * can occupy the same patch of ground — and the joke is entirely in how they
 * describe it. The Orcs get there by admitting they are stupid. The Humans get
 * there by forming a committee.
 */

export type TechFlag =
  /** Removes the movement penalty on groups of five or more. */
  | 'coordination'
  /** +1 sight for every unit. */
  | 'mapmaking'
  /** Forest and swamp cost one movement point instead of two. */
  | 'bridges'
  /** +1 sight for cities, and cities see through forest. */
  | 'watchtower'
  /** +1 content citizen in every city. */
  | 'contentment'
  /** +25% attack, -25% defence, army-wide. Seemed like a good idea at the time. */
  | 'berserk'
  /** Magical damage sets its target alight for a few turns. */
  | 'pyromancy'
  /** Magical damage leaves its target slow for a few turns. */
  | 'cryomancy';

export interface TechDef {
  id: TechId;
  name: string;
  faction: FactionId | 'both';
  /** Beakers required. Zero means it is granted at game start. */
  cost: number;
  prereqs: TechId[];
  units: UnitTypeId[];
  buildings: BuildingId[];
  flags: TechFlag[];
  flavor: string;
}

export const TECHS: TechDef[] = [
  // ============================================================ shared line
  {
    id: 'mapmaking',
    name: 'Mapmaking',
    faction: 'both',
    cost: 25,
    prereqs: [],
    units: [],
    buildings: [],
    flags: ['mapmaking'],
    flavor: 'The world turns out to have a shape. Everyone is a little put out about it.',
  },
  {
    id: 'tree-hugging',
    name: 'Tree-Hugging',
    faction: 'both',
    cost: 55,
    prereqs: ['mapmaking'],
    units: [],
    buildings: ['granary'],
    flags: [],
    flavor: 'If you do not eat the whole forest immediately, there is more forest later.',
  },
  {
    id: 'bridge-building',
    name: 'Bridge Building',
    faction: 'both',
    cost: 45,
    prereqs: ['mapmaking'],
    units: [],
    buildings: ['outpost', 'depot'],
    flags: ['bridges'],
    flavor: 'Walking around the swamp was, in hindsight, a choice.',
  },
  {
    id: 'wall-building',
    name: 'Wall Building',
    faction: 'both',
    cost: 75,
    prereqs: ['bridge-building'],
    units: [],
    buildings: ['walls', 'catapult'],
    flags: [],
    flavor:
      'A bridge, but standing up and unwelcoming. The Horde attends the same ' +
      'lecture and comes away with a catapult.',
  },
  {
    id: 'tower-building',
    name: 'Tower Building',
    faction: 'both',
    cost: 115,
    prereqs: ['wall-building'],
    units: [],
    buildings: ['bigVault', 'exchange'],
    flags: ['watchtower'],
    flavor: 'A wall, but taller and lonelier.',
  },
  {
    id: 'not-you-again',
    name: 'Not You Again!',
    faction: 'both',
    cost: 45,
    prereqs: ['mapmaking'],
    units: [],
    buildings: ['treasury', 'market'],
    flags: [],
    flavor:
      'The same coin keeps turning up. Eventually somebody scratches a number ' +
      'on it and the whole economy follows.',
  },
  {
    id: 'hammers-of-glory',
    name: 'Hammers of Glory',
    faction: 'both',
    cost: 85,
    prereqs: ['not-you-again'],
    units: [],
    buildings: ['thinkingRock', 'scriptorium'],
    flags: [],
    flavor:
      'It emerges you can build a place specifically for thinking in. The ' +
      'hammers were, in the end, the easy part.',
  },
  {
    id: 'joy-making',
    name: 'Joy Making',
    faction: 'both',
    cost: 65,
    prereqs: ['tree-hugging'],
    units: [],
    buildings: ['totem', 'chapel'],
    flags: [],
    flavor: 'Morale is discovered, immediately weaponised, and then regulated.',
  },
  {
    id: 'happiness',
    name: 'Happiness',
    faction: 'both',
    cost: 105,
    prereqs: ['joy-making'],
    units: [],
    buildings: [],
    flags: ['contentment'],
    flavor: 'Formal proof that people who are not miserable work slightly harder.',
  },
  {
    id: 'pyromancy',
    name: 'Setting Things Alight',
    faction: 'both',
    cost: 165,
    prereqs: ['insanity'],
    units: [],
    buildings: [],
    flags: ['pyromancy'],
    flavor:
      'Fire was always available. What is new is doing it to somebody deliberately, ' +
      'from a distance, and then walking away while it continues.',
  },
  {
    id: 'cryomancy',
    name: 'The Cold Shoulder',
    faction: 'both',
    cost: 180,
    prereqs: ['insanity'],
    units: [],
    buildings: [],
    flags: ['cryomancy'],
    flavor:
      'Nobody has worked out how to make a thing colder. They have worked out how to ' +
      'make a thing very slow, which for military purposes is the same discovery.',
  },
  {
    id: 'insanity',
    name: 'Insanity',
    faction: 'both',
    cost: 150,
    prereqs: ['happiness'],
    units: [],
    buildings: ['bigTotem', 'cathedral'],
    flags: ['berserk'],
    flavor: 'Happiness, taken one step further than anyone recommended.',
  },

  // =============================================================== orc line
  {
    id: 'first-orc',
    name: 'First Orc',
    faction: 'orc',
    cost: 0,
    prereqs: [],
    units: ['peon', 'goblin'],
    buildings: [],
    flags: [],
    flavor: 'There is an orc. This took considerably longer than you would expect.',
  },
  {
    id: 'goblin-smarts',
    name: 'Goblin "Smarts"',
    faction: 'orc',
    cost: 20,
    prereqs: ['first-orc'],
    units: ['goblin_x2', 'goblin_x3'],
    buildings: [],
    flags: [],
    flavor: 'The goblins work it out first. Nobody enjoys this.',
  },
  {
    id: 'suicidal-goblins',
    name: '"Suicidal" Goblins',
    faction: 'orc',
    cost: 45,
    prereqs: ['goblin-smarts'],
    units: ['goblin_x5', 'sapper'],
    buildings: [],
    flags: [],
    flavor: 'The quotation marks are load-bearing. Nobody has explained them.',
  },
  {
    id: 'underground-smarts',
    name: 'Underground Smarts',
    faction: 'orc',
    cost: 95,
    prereqs: ['suicidal-goblins'],
    units: ['sapper_x2'],
    buildings: ['biggerRock'],
    flags: [],
    flavor: 'Everything is better underground, where nobody can see how it is going.',
  },
  {
    id: 'orc-meaning',
    name: 'The Meaning of Orc',
    faction: 'orc',
    cost: 25,
    prereqs: ['first-orc'],
    units: ['orc'],
    buildings: [],
    flags: [],
    flavor: 'A long night of reflection concludes that an orc is a thing that hits.',
  },
  {
    id: 'orc-together',
    name: "Let's Orc Together",
    faction: 'orc',
    cost: 40,
    prereqs: ['orc-meaning'],
    units: ['orc_x2'],
    buildings: [],
    flags: [],
    flavor: 'Two orcs can stand in the same place. Nothing is ever the same again.',
  },
  {
    id: 'idiots-stick-together',
    name: 'Idiots Stick Together',
    faction: 'orc',
    cost: 60,
    prereqs: ['orc-together'],
    units: ['orc_x3'],
    buildings: [],
    flags: [],
    flavor: 'Three. The number is three. It comes after the other two.',
  },
  {
    id: 'next-level-stupid',
    name: 'The Next Level of Stupid',
    faction: 'orc',
    cost: 85,
    prereqs: ['idiots-stick-together'],
    units: ['orc_x4'],
    buildings: [],
    flags: [],
    flavor: 'Four orcs. The Horde is officially past what its hands can represent.',
  },
  {
    id: 'beyond-stupid',
    name: 'Beyond Stupid',
    faction: 'orc',
    cost: 105,
    prereqs: ['next-level-stupid'],
    units: ['orc_x6'],
    buildings: [],
    flags: [],
    flavor: 'Six orcs, achieved by doing three orcs twice and refusing to elaborate.',
  },
  {
    id: 'not-just-stupid',
    name: 'Not Just Stupid Anymore',
    faction: 'orc',
    cost: 132,
    prereqs: ['beyond-stupid'],
    units: ['orc_x8'],
    buildings: [],
    flags: ['coordination'],
    flavor: 'Eight orcs, all walking the same way. Historians will not believe this part.',
  },
  {
    id: 'stupidity-for-all',
    name: 'And Stupidity for All',
    faction: 'orc',
    cost: 168,
    prereqs: ['not-just-stupid'],
    units: ['orc_x10'],
    buildings: ['yellingGrounds'],
    flags: [],
    flavor: 'Ten orcs. One unit. One extremely large mistake waiting to happen.',
  },
  {
    id: 'to-be-an-orc',
    name: 'To Be An Orc',
    faction: 'orc',
    cost: 45,
    prereqs: ['orc-meaning'],
    units: [],
    buildings: ['barracks'],
    flags: [],
    flavor: 'It emerges that an orc can be trained, which is to say shouted at on purpose.',
  },
  {
    id: 'axes',
    name: 'Axes',
    faction: 'orc',
    cost: 50,
    prereqs: ['orc-meaning'],
    units: ['troll'],
    buildings: [],
    flags: [],
    flavor: 'Sharpened on one side. The Horde considers this its finest hour so far.',
  },
  {
    id: 'axes-crazy',
    name: 'Axes Make You Crazy',
    faction: 'orc',
    cost: 80,
    prereqs: ['axes'],
    units: ['troll_x2', 'troll_x3'],
    buildings: [],
    flags: [],
    flavor: 'Correlation is established. Causation is declared uninteresting.',
  },
  {
    id: 'throwing-buddies',
    name: 'Throwing Buddies',
    faction: 'orc',
    cost: 65,
    prereqs: ['axes'],
    units: ['axethrower', 'axethrower_x2'],
    buildings: [],
    flags: [],
    flavor: 'The axe goes away from you. This is the entire discovery.',
  },
  {
    id: 'my-little-friend',
    name: 'My Little Friend',
    faction: 'orc',
    cost: 95,
    prereqs: ['throwing-buddies'],
    units: ['axethrower_x3', 'ogre'],
    buildings: [],
    flags: [],
    flavor: 'Every orc should have someone larger standing behind them.',
  },
  {
    id: 'dead-messed-up',
    name: 'The Dead are Messed Up',
    faction: 'orc',
    cost: 130,
    prereqs: ['to-be-an-orc', 'axes-crazy'],
    units: ['deathknight'],
    buildings: [],
    flags: [],
    flavor: 'A finding delivered with unusual confidence and no supporting evidence.',
  },
  {
    id: 'full-of-fire',
    name: 'Full of Fire',
    faction: 'orc',
    cost: 185,
    prereqs: ['dead-messed-up'],
    units: ['deathknight_x2', 'dragon'],
    buildings: [],
    flags: [],
    flavor: 'The Horde has one plan for the late game and has now finished writing it down.',
  },

  // ============================================================= human line
  {
    id: 'first-human',
    name: 'First Human',
    faction: 'human',
    cost: 0,
    prereqs: [],
    units: ['peasant', 'footman'],
    buildings: [],
    flags: [],
    flavor: 'A human, with a name, a trade, and three opinions about the tax code.',
  },
  {
    id: 'brotherhood',
    name: 'Brotherhood',
    faction: 'human',
    cost: 30,
    prereqs: ['first-human'],
    units: ['footman_x2'],
    buildings: [],
    flags: [],
    flavor: 'A man may stand beside another man. The paperwork runs to forty pages.',
  },
  {
    id: 'join-army',
    name: 'Join the Army',
    faction: 'human',
    cost: 55,
    prereqs: ['brotherhood'],
    units: ['footman_x3'],
    buildings: ['barracks'],
    flags: [],
    flavor: 'See the world. Meet interesting people. Stand extremely close to them.',
  },
  {
    id: 'bunches-footmen',
    name: 'Bunches of Footmen',
    faction: 'human',
    cost: 88,
    prereqs: ['join-army'],
    units: ['footman_x5'],
    buildings: [],
    flags: [],
    flavor: 'The official term is "bunches". The Royal Academy fought this and lost.',
  },
  {
    id: 'ten-heads',
    name: '10 Heads are Better than One',
    faction: 'human',
    cost: 128,
    prereqs: ['bunches-footmen'],
    units: ['footman_x10'],
    buildings: ['library'],
    flags: ['coordination'],
    flavor: 'Ten heads, one direction, and a rota for who carries the flag.',
  },
  {
    id: 'see-the-world',
    name: 'See the World',
    faction: 'human',
    cost: 30,
    prereqs: ['first-human'],
    units: ['outrider'],
    buildings: [],
    flags: [],
    flavor: 'Someone should go and look. Someone else should write down what they saw.',
  },
  {
    id: 'archery',
    name: 'Archery',
    faction: 'human',
    cost: 40,
    prereqs: ['first-human'],
    units: ['archer'],
    buildings: [],
    flags: [],
    flavor: 'Like Throwing Buddies, except you get to keep the pointy thing.',
  },
  {
    id: 'pointed-ears',
    name: 'Pointed Ears Anyone?',
    faction: 'human',
    cost: 65,
    prereqs: ['archery'],
    units: ['archer_x2'],
    buildings: [],
    flags: [],
    flavor: 'An enquiry is opened into who exactly has been helping with the archery.',
  },
  {
    id: 'arrows-glory',
    name: 'Arrows to Glory',
    faction: 'human',
    cost: 90,
    prereqs: ['pointed-ears'],
    units: ['archer_x3', 'ballista'],
    buildings: [],
    flags: [],
    flavor: 'If one arrow is glory, the correct number of arrows is all of them.',
  },
  {
    id: 'horses-sneeze',
    name: 'Horses Make Me Sneeze',
    faction: 'human',
    cost: 50,
    prereqs: ['first-human'],
    units: ['knight'],
    buildings: [],
    flags: [],
    flavor: 'The Kingdom presses on regardless, eyes streaming, into the age of cavalry.',
  },
  {
    id: 'let-us-ride',
    name: 'Let us Ride!',
    faction: 'human',
    cost: 85,
    prereqs: ['horses-sneeze'],
    units: ['knight_x2'],
    buildings: [],
    flags: [],
    flavor: 'Two knights, riding abreast, at considerable expense to everyone.',
  },
  {
    id: 'run-you-through',
    name: "We'll Run You Through!",
    faction: 'human',
    cost: 125,
    prereqs: ['let-us-ride', 'join-army'],
    units: ['knight_x3', 'paladin'],
    buildings: [],
    flags: [],
    flavor: 'Shouted in advance, as courtesy demands.',
  },
  {
    id: 'rumbling-voice',
    name: 'Rumbling Voice',
    faction: 'human',
    cost: 100,
    prereqs: ['see-the-world', 'join-army'],
    units: ['mage'],
    buildings: [],
    flags: [],
    flavor: 'It is discovered that saying things in a deeper voice makes them true.',
  },
  {
    id: 'lordship',
    name: 'Lordship',
    faction: 'human',
    cost: 150,
    prereqs: ['rumbling-voice'],
    units: ['mage_x2', 'paladin_x2'],
    buildings: ['paradeGround'],
    flags: [],
    flavor: 'The rumbling voice is given a hat, a title, and a great deal of land.',
  },
];

export const TECHS_BY_ID: Record<TechId, TechDef> = Object.fromEntries(
  TECHS.map((t) => [t.id, t]),
);

export function tech(id: TechId): TechDef {
  const t = TECHS_BY_ID[id];
  if (!t) throw new Error(`Unknown tech: ${id}`);
  return t;
}

/** Advances a faction is allowed to research at all. */
export function techsForFaction(faction: FactionId): TechDef[] {
  return TECHS.filter((t) => t.faction === 'both' || t.faction === faction);
}
