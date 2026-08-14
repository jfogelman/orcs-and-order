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
};

export const FACTION_IDS: FactionId[] = ['orc', 'human'];

export function otherFaction(id: FactionId): FactionId {
  return id === 'orc' ? 'human' : 'orc';
}
