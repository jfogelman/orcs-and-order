import type { FactionId } from './types';

/**
 * The six people who will tell you what to do, per side.
 *
 * Text only, in the manner of Civ2's advisors, using art the game already has.
 * `docs/advisor_bible.md` is the brief they are written from: role, appearance,
 * personality and a sample line each.
 *
 * The point of them is not advice. A player who wants to know how their empire
 * is doing has the report; an advisor is there to have an opinion about it, and
 * to be wrong in a way that is in character. The Knight-Marshal wants walls
 * whether or not walls are the answer. The Ledger-Thane would rather you spent
 * nothing at all, ever. Reading them as a panel of experts is a mistake the
 * game is happy for you to make once.
 */

/** What an advisor is nominally responsible for. Mirrored across the sides. */
export type AdvisorRole = 'military' | 'faith' | 'domestic' | 'trade' | 'diplomacy' | 'arcane';

export const ROLE_NAMES: Record<AdvisorRole, string> = {
  military: 'Military',
  faith: 'Faith',
  domestic: 'Domestic',
  trade: 'Trade',
  diplomacy: 'Diplomacy',
  arcane: 'Arcane',
};

/**
 * A snapshot of an empire, in the terms advisors care about.
 *
 * Gathered once and handed to all six, so nobody re-walks the city list, and
 * so two advisors looking at the same thing cannot disagree about the facts --
 * only about what should be done, which is the entire joke.
 */
export interface Situation {
  turn: number;
  faction: FactionId;
  cities: number;
  /** Cities currently rioting. */
  rioting: number;
  /** Cities at or one short of the point where they riot. */
  restless: number;
  /** Cities losing food. */
  starving: number;
  gold: number;
  goldPerTurn: number;
  beakersPerTurn: number;
  /** Twelfths, as set on the empire report. */
  rates: { coin: number; beakers: number; calm: number };
  researching: string | null;
  /** Cities of ours with nobody standing in them. */
  undefended: number;
  /** Enemy fighters we can currently see. */
  enemiesSeen: number;
  /** Ours: everything that can fight. */
  army: number;
  /** Ours: creatures that strike with magic. */
  magicUnits: number;
  /** Ours: the cheap, numerous ones. The Death Knight has views. */
  rankAndFile: number;
  /** Ours: paladins specifically, which is all the Paladin counts. */
  paladins: number;
  /** Cities with walls, and whether walls can be built at all yet. */
  walled: number;
  wallsAvailable: boolean;
  /** Cities with a barracks of some kind. */
  barracks: number;
  /** Cities with something that makes money. */
  coinBuildings: number;
  /** Cities with something that keeps people calm. */
  calmBuildings: number;
  /**
   * Whether anything that calms a city can be built at all yet, and what
   * advance would change that.
   *
   * Separate from `calmBuildings`, which counts what is standing. A player with
   * riots everywhere and no Totem may be failing to build one or unable to --
   * and those are opposite problems with opposite answers. Read from a played
   * save at turn 143 where eight cities held forty-five people, four of them
   * were rioting, half the trade was going to calm, and the advance that
   * unlocks the Horde's happiness building had simply never been taken. Nothing
   * in the game said so.
   */
  calmAvailable: boolean;
  /** The advance that would unlock one, when there is none. */
  calmNeedsAdvance: string | null;
  /** Structures that push supply further out. */
  supplyPosts: number;
  /**
   * Turns until somebody wins by holding most of the world, and who.
   *
   * Null when nobody is close. Reported here rather than shouted into the log
   * every turn: the game ended on turn 137 in a played game and the losing side
   * had never been told the clock was running, but a line repeated for ten
   * turns is one people learn to skip. An advisor says it when asked, which is
   * what advisors are for.
   */
  dominance: { turnsLeft: number; theirs: boolean } | null;
  /**
   * The deadline, once it is close enough to be worth planning around.
   *
   * Null until then, so an advisor can simply ask whether it is set rather than
   * doing arithmetic about the turn limit in every line that mentions it.
   * `ahead` is the points standing as it currently stands, which is the only
   * part of it a player can still do anything about.
   */
  deadline: { turnsLeft: number; ahead: boolean; level: boolean } | null;
}

/** One thing an advisor might be exercised about, and what they say about it. */
export interface Concern {
  /** Whether this is what is on their mind right now. */
  when: (s: Situation) => boolean;
  say: (s: Situation) => string;
  /**
   * What this line is *about*, so somebody else can object to it.
   *
   * A tag rather than a rule between two advisors: six people who each disagree
   * with two or three others is thirty-odd relationships to write and maintain,
   * and every new advisor multiplies it. A topic is one word on the line and one
   * word on whoever objects, and it stays true when the cast changes.
   *
   * Untagged lines are simply nobody's business, which is most of them.
   */
  about?: Topic;
}

/**
 * The things this council argues about.
 *
 * Deliberately few and deliberately blunt. These are not policy areas, they are
 * the handful of subjects on which these particular people are known to be
 * tiresome.
 */
export type Topic =
  | 'magic'
  | 'walls'
  | 'war'
  | 'money'
  | 'expansion'
  | 'the-dead'
  | 'the-little-ones'
  | 'the-spiral';

export interface AdvisorDef {
  id: string;
  name: string;
  role: AdvisorRole;
  faction: FactionId;
  /** One line on who they are, shown under the portrait. */
  blurb: string;
  /**
   * Checked in order; the first that applies is what they say. So the order
   * is the character: the Knight-Marshal checks for enemies before he checks
   * for walls, because he would always rather attack than build.
   */
  concerns: Concern[];
  /** When nothing they care about is happening. Chosen by turn, not at random,
   *  so an advisor does not change their mind while you are looking at them. */
  idle: string[];
  /**
   * What they say when somebody else raises a subject they object to.
   *
   * Keyed by topic. Having one is what makes an advisor an interruption rather
   * than a row in a list -- and not having one is fine, since somebody who
   * agrees with everybody is a perfectly good advisor and a bad argument.
   */
  retorts?: Partial<Record<Topic, string>>;
}

/**
 * Who speaks up when this line is said, and what they say.
 *
 * Never the speaker themselves, and only advisors on the same council -- the
 * two sides never meet, and an orc heckling the Kingdom's Archmage would be a
 * fog-of-war leak in the shape of a joke.
 */
export function objectionsTo(
  speaker: AdvisorDef,
  line: Concern | null,
): Array<{ advisor: AdvisorDef; says: string }> {
  if (!line?.about) return [];
  const topic = line.about;
  return advisorsFor(speaker.faction)
    .filter((a) => a.id !== speaker.id && a.retorts?.[topic])
    .map((a) => ({ advisor: a, says: a.retorts![topic]! }));
}

/**
 * The concern an advisor is currently voicing, rather than the text of it.
 *
 * `advisorLine` returns a string, which is all the panel needed until the panel
 * needed to know what the line was *about*.
 */
export function advisorConcern(a: AdvisorDef, s: Situation): Concern | null {
  return a.concerns.find((c) => c.when(s)) ?? null;
}

const NUMBER_WORDS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen', 'twenty',
];

/**
 * Numbers up to twenty in words, and in figures after that.
 *
 * These are people talking, and people say "three cities". A digit in the
 * middle of a spoken line reads as a readout rather than a sentence, which is
 * the difference between an advisor and a status bar. Zero is "no" rather than
 * "nought", because "no cities rioting" is what somebody would actually say.
 */
/**
 * Has nobody touched the trade split?
 *
 * Perfectly even is what the game ships and what a player who never opens the
 * empire report keeps. Measured, that costs about seven games in a hundred and
 * eight, a quarter of a side's population and a fifth of its army -- see
 * DESIGN_QUEUE section 64. The AI was taught to manage its own split in section
 * 47 and the human was told nothing, so the game shipped a default its opponent
 * automatically improves on.
 *
 * Tested by equality rather than against the literal four, so a deliberate even
 * split reads the same as an untouched one. Somebody who has chosen an even
 * split has heard the advice and can stop listening to it; somebody who has not
 * is exactly who this is for, and the two are indistinguishable from here.
 *
 * Not before `SETTLED_BY`, because an opening where nothing has been built yet
 * is not a state anybody has failed to manage.
 */
const SETTLED_BY = 12;

export function ratesUntouched(s: Situation): boolean {
  return (
    s.turn >= SETTLED_BY &&
    s.rates.coin === s.rates.beakers &&
    s.rates.beakers === s.rates.calm
  );
}

export function spell(n: number): string {
  return n >= 0 && n <= 20 ? NUMBER_WORDS[n] : String(n);
}

/**
 * "one city", "three cities". Nobody with a written voice says "1 cities", and
 * an advisor who does stops sounding like a person immediately.
 */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${spell(n)} ${n === 1 ? one : many}`;
}

// ------------------------------------------------------------ the Kingdom

const KINGDOM: AdvisorDef[] = [
  {
    id: 'knight-marshal',
    name: 'Knight-Marshal',
    role: 'military',
    faction: 'human',
    blurb: 'Dented breastplate, never repaired, out of pride.',
    concerns: [
      {
        about: 'war',
        when: (s) => s.enemiesSeen > 0,
        say: (s) =>
          `Orcs. ${spell(s.enemiesSeen)} of them, in the open, unpunished. Every hour we do not ` +
          `ride out is an hour they will tell their children about.`,
      },
      {
        when: (s) => s.undefended > 0,
        say: (s) =>
          `${count(s.undefended, 'city', 'cities')} standing with the gate open and nobody behind it. ` +
          `I do not ask for much. I ask for a man with a spear. One man. One spear.`,
      },
      {
        about: 'walls',
        when: (s) => s.wallsAvailable && s.walled < s.cities,
        say: (s) =>
          `${count(s.cities - s.walled, 'city', 'cities')} without walls. Stone does not sleep, sire. ` +
          `Stone does not desert. Stone asks for no wages.`,
      },
      {
        when: (s) => !s.wallsAvailable,
        say: () =>
          `Our scholars have not yet worked out how to stack one stone upon another for ` +
          `defensive purposes. I am assured this is difficult.`,
      },
      {
        when: (s) => s.barracks < Math.max(1, Math.floor(s.cities / 2)),
        say: () =>
          `Our soldiers are being trained by their own enthusiasm. It shows. A barracks, ` +
          `sire, before enthusiasm gets them all killed.`,
      },
      {
        when: (s) => s.supplyPosts === 0 && s.cities > 2,
        say: () =>
          `An army marches on its stomach and ours is marching on optimism. Forward posts. ` +
          `Now, ideally before the marching.`,
      },
    ],
    idle: [
      'Our footmen stand idle while orcs sharpen their axes on our fenceposts. Idle. Steel rusts from disuse faster than from blood.',
      'The men ask what we are waiting for. I tell them strategy. I would like, one day, to be telling the truth.',
      'A quiet season. I do not trust it, and neither should you.',
    ],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    role: 'faith',
    faction: 'human',
    blurb: 'Radiant, humourless, standing suspiciously straight.',
    concerns: [
      {
        about: 'magic',
        when: (s) => s.magicUnits > 0,
        say: (s) =>
          `We field ${count(s.magicUnits, 'practitioner')} of the arcane. I have said nothing about ` +
          `this. I continue to say nothing about it, at length, whenever asked.`,
      },
      {
        when: (s) => s.paladins === 0 && s.army > 6,
        say: (s) =>
          `An army of ${spell(s.army)}, and not one paladin among them. A host without virtue is ` +
          `simply a mob that has been issued equipment.`,
      },
      {
        when: (s) => s.rates.coin > s.rates.calm + 3,
        say: () =>
          `We spend on gold and call it governance. The people are not comforted by a full ` +
          `treasury. I merely mention it.`,
      },
      {
        when: (s) => s.rioting > 0,
        say: (s) =>
          `${count(s.rioting, 'city', 'cities')} in open disorder. This is what happens. I shall ` +
          `not say what it is what happens *because of*. I shall simply stand here.`,
      },
    ],
    retorts: {
      magic: 'I withdraw my earlier silence on the subject of mages.',
    },
    idle: [
      'The orcs raise death knights from fallen heroes. We could simply... not do that. I merely mention it.',
      'A righteous realm needs no advice. I remain available, regardless, in case that changes.',
      'I have prayed on the matter. The answer was ambiguous, which I attribute to the question.',
    ],
  },
  {
    id: 'stonewarden',
    name: 'Stonewarden',
    role: 'domestic',
    faction: 'human',
    blurb: 'Dwarf engineer. Checks a spirit-level while you talk.',
    concerns: [
      {
        // The spiral, named. A riot with nothing buildable to end it is a
        // different problem from a riot with something buildable to end it,
        // and the difference is one advance the player has not taken.
        about: 'the-spiral',
        when: (s) => s.rioting > 0 && !s.calmAvailable && s.calmNeedsAdvance !== null,
        say: (s) =>
          `${count(s.rioting, 'city', 'cities')} rioting, and not one thing we may lawfully build to ` +
          `stop it. The advance is called ${s.calmNeedsAdvance}. I have written it down. Twice.`,
      },
      {
        when: (s) => s.rioting > 0,
        say: (s) =>
          `${count(s.rioting, 'city', 'cities')} rioting. Have you tried a sturdier roof? Works for morale, ` +
          `works for mine collapses. Same principle, mostly.`,
      },
      {
        when: (s) => s.starving > 0,
        say: (s) =>
          `${count(s.starving, 'city', 'cities')} eating less than it grows. That is not a mood, that is ` +
          `arithmetic, and arithmetic does not cheer up on its own.`,
      },
      {
        when: (s) => s.restless > 0 && s.calmBuildings < s.cities,
        say: (s) =>
          `${count(s.restless, 'city', 'cities')} a bad week from trouble, and ${spell(s.cities - s.calmBuildings)} ` +
          `with nothing built to hold them steady. Build the thing. Then we shall see.`,
      },
      {
        when: (s) => s.rates.calm === 0 && s.cities > 2,
        say: () =>
          `Not a copper going to keeping folk content. You can hold a wall up with nothing, ` +
          `too, right up until you cannot.`,
      },
    ],
    retorts: {
      magic: 'Stone does not need feeding, does not sulk, and has never once set a granary alight.',
      war: 'Attack, then. I shall be here. Behind the stone. When it goes badly.',
    },
    idle: [
      'Your peasants are unhappy. Have you tried a sturdier roof? Works for morale, works for mine collapses.',
      'Everything is standing. I have checked twice. I shall check again shortly.',
      'Good foundations, this season. Nobody ever thanks you for foundations.',
    ],
  },
  {
    id: 'ledger-thane',
    name: 'Ledger-Thane',
    role: 'trade',
    faction: 'human',
    blurb: 'Gold-threaded beard. Abacus of carved stone beads.',
    concerns: [
      {
        // Above even the dominance clock: that one is somebody winning, this
        // one is time running out on everybody, and it cannot be reversed.
        when: (s) => s.deadline !== null,
        say: (s) =>
          s.deadline!.level
            ? `${sentence(count(s.deadline!.turnsLeft, 'turn'))} until the ledger closes, and the ` +
              `two columns are the same length. I have checked. Twice.`
            : s.deadline!.ahead
              ? `${sentence(count(s.deadline!.turnsLeft, 'turn'))} until the ledger closes and we ` +
                `are the longer column. Do not do anything expensive and interesting.`
              : `${sentence(count(s.deadline!.turnsLeft, 'turn'))} until the ledger closes and we ` +
                `are the shorter column. Citizens, advances, structures. In that order. Now.`,
      },
      {
        // Before the money, because there shortly may not be a treasury.
        when: (s) => s.dominance !== null,
        say: (s) =>
          s.dominance!.theirs
            ? `They hold most of the known world. ${sentence(count(s.dominance!.turnsLeft, 'turn'))} ` +
              `of that and the ledger closes. I do not have a column for this.`
            : `We hold most of the known world. ${sentence(count(s.dominance!.turnsLeft, 'turn'))} more ` +
              `and it is settled. I have already ruled the line.`,
      },
      {
        when: (s) => s.goldPerTurn < 0,
        say: (s) =>
          `We are losing ${spell(Math.abs(s.goldPerTurn))} a turn. Losing. I have written it down ` +
          `in the ledger, in a colour I do not enjoy using.`,
      },
      {
        when: ratesUntouched,
        say: () =>
          `Four parts, four parts, four parts. Somebody has divided the trade of a nation the way ` +
          `one divides a cake among children who are watching. It is on the empire report. It can ` +
          `be *changed*. I shall raise this again.`,
      },
      {
        when: (s) => s.rates.coin < 3,
        say: (s) =>
          `${spell(s.rates.coin)} parts in twelve to the treasury. I have seen shipwrecks with ` +
          `better arrangements. At least they were *trying* to keep the gold aboard.`,
      },
      {
        when: (s) => s.coinBuildings < s.cities && s.cities > 1,
        say: (s) =>
          `${count(s.cities - s.coinBuildings, 'city', 'cities')} with nowhere to put the money. Money left ` +
          `lying about is money spent, eventually, by somebody with worse ideas than mine.`,
      },
      {
        when: (s) => s.gold > 400,
        say: (s) =>
          `${spell(s.gold)} in the vault. Beautiful. Do not touch it. I shall know.`,
      },
    ],
    idle: [
      'We could sell the surplus grain, or we could hoard it and watch the price triple. I know which I would choose. I know which I have chosen.',
      'The books balance. I take no pleasure in it. Pleasure is an expense.',
      'Somebody has been rounding. I will find them.',
    ],
  },
  {
    id: 'herald',
    name: 'Herald',
    role: 'diplomacy',
    faction: 'human',
    blurb: 'Elf. Patient to the point of insult.',
    concerns: [
      {
        when: (s) => s.cities < 3,
        say: (s) =>
          `${count(s.cities, 'city', 'cities')}. A modest holding. Modest holdings become great ones by ` +
          `growing, which is a thing that happens to those who permit it.`,
      },
      {
        when: (s) => s.enemiesSeen > 2,
        say: () =>
          `The orcs are about. They are always about. In four centuries they have never ` +
          `once been elsewhere. Do try not to hurry.`,
      },
      {
        when: (s) => s.starving > 0,
        say: () =>
          `A city that does not eat does not grow, and a realm that does not grow is simply ` +
          `a long, well-attended decline.`,
      },
    ],
    idle: [
      'The orcs demand tribute. I recall a similar demand from their ancestors, four centuries ago. We said no then, too.',
      'Nothing requires your attention. Very little ever does, in my experience.',
      'Patience. It costs nothing, which I understand is a consideration here.',
    ],
  },
  {
    id: 'archmage',
    name: 'Court Archmage',
    role: 'arcane',
    faction: 'human',
    blurb: 'Elf. Treats your spellcraft as charming tinkering.',
    concerns: [
      {
        when: (s) => s.researching === null,
        say: () =>
          `We are researching nothing whatsoever. A bold curriculum. I look forward to its ` +
          `findings.`,
      },
      {
        when: (s) => s.rates.beakers < 3,
        say: (s) =>
          `${spell(s.rates.beakers)} parts in twelve to study. One cannot discover very much on ` +
          `${spell(s.rates.beakers)}. One can barely discover the problem.`,
      },
      {
        about: 'magic',
        when: (s) => s.magicUnits === 0 && s.army > 8,
        say: (s) =>
          `${count(s.army, 'soldier')}, and not one of them able to do anything a horse could not. ` +
          `Mages, your majesty. The word is mages.`,
      },
      {
        when: (s) => s.beakersPerTurn < 3 && s.cities > 2,
        say: (s) =>
          `${count(s.beakersPerTurn, 'beaker')} a turn from ${count(s.cities, 'city', 'cities')}. Your alchemists have ` +
          `discovered fire again. We are delighted for them.`,
      },
    ],
    retorts: {
      'the-spiral': 'One advance, yes. *One.* And then the rest of the tree, which is where the interesting things are.',
      walls: 'A wall is a solved problem. Somebody solved it. That is rather the difficulty with walls.',
      war: 'By all means. Send them. I shall be in the tower, being useful.',
    },
    idle: [
      'Your alchemists have discovered fire again. We are delighted for them.',
      'The work proceeds. It would proceed faster with funding, but it proceeds.',
      'I have been reading. You would not enjoy it.',
    ],
  },
];

// -------------------------------------------------------------- the Horde

const HORDE: AdvisorDef[] = [
  {
    id: 'blademaster',
    name: 'Blademaster',
    role: 'military',
    faction: 'orc',
    blurb: 'Trophies sewn into the armour. Not all of them old.',
    concerns: [
      {
        about: 'war',
        when: (s) => s.enemiesSeen > 0,
        say: (s) =>
          `${spell(s.enemiesSeen)} of them. Standing there. Being alive. I do not know what else ` +
          `you want me to say about it.`,
      },
      {
        when: (s) => s.army < s.cities * 2,
        say: (s) =>
          `${count(s.army, 'warrior')} for ${count(s.cities, 'city', 'cities')}. That is not a horde. That is a ` +
          `queue.`,
      },
      {
        when: (s) => s.undefended > 0,
        say: (s) =>
          `${count(s.undefended, 'city', 'cities')} with nobody inside. Fine by me — nothing to defend means ` +
          `everyone is free to attack. But you will complain later, so I mention it.`,
      },
      {
        when: (s) => s.barracks === 0 && s.cities > 1,
        say: () =>
          `Our young are learning to fight by fighting and then by dying. It works. It is ` +
          `slow. A barracks is faster and I am impatient.`,
      },
    ],
    idle: [
      'You want more farms? Farms do not swing axes. Though I suppose someone must feed the axe-swingers.',
      'Nothing to kill today. I have made a list for tomorrow.',
      'Quiet. I hate it. Give me something to do before I invent something.',
    ],
  },
  {
    id: 'goblin-overseer',
    name: 'Goblin Overseer',
    role: 'domestic',
    faction: 'orc',
    blurb: 'Clipboard made of bone. Fewer fingers than last week.',
    concerns: [
      {
        about: 'the-spiral',
        when: (s) => s.rioting > 0 && !s.calmAvailable && s.calmNeedsAdvance !== null,
        say: (s) =>
          `${count(s.rioting, 'city', 'cities')} rioting, boss, and we got nothing to build at dem. ` +
          `Da clever ones say we need ${s.calmNeedsAdvance}. I do not know what dat is. Dey do.`,
      },
      {
        when: (s) => s.rioting > 0,
        say: (s) =>
          `${count(s.rioting, 'city', 'cities')} rioting, boss. Very energetic. Could be worse — could be ` +
          `rioting *at us*. Give them something shiny, is my advice, I have no other advice.`,
      },
      {
        when: (s) => s.starving > 0,
        say: (s) =>
          `${count(s.starving, 'city', 'cities')} running out of food. We tried eating optimism. Results ` +
          `disappointing, boss.`,
      },
      {
        when: (s) => s.restless > 0,
        say: (s) =>
          `${count(s.restless, 'city', 'cities')} getting *ideas*, boss. Ideas is how it starts. First ideas, ` +
          `then opinions, then me on a spike.`,
      },
      {
        when: (s) => s.rates.calm === 0,
        say: () =>
          `Nothing set aside for keeping the lads happy. Happy lads dig. Unhappy lads also ` +
          `dig, but at the wrong things, boss.`,
      },
    ],
    idle: [
      'City is very stable now, boss. Mostly. The east wall wobbles but that is a feature — extra ventilation.',
      'All good, boss. Do not look in the second cellar.',
      'Nobody has died in four days. I have put up a sign.',
    ],
  },
  {
    id: 'troll-headhunter',
    name: 'Troll Headhunter',
    role: 'diplomacy',
    faction: 'orc',
    blurb: 'Draped in bones. Disturbingly calm about it.',
    concerns: [
      {
        when: (s) => s.undefended > 0,
        say: (s) =>
          `${count(s.undefended, 'town')} with nobody in dem. Dis is not safe. I like safe. ` +
          `Safe is where da heads stay on.`,
      },
      {
        when: (s) => s.enemiesSeen > 2,
        say: (s) =>
          `${spell(s.enemiesSeen)} of dem out dere. We could rush dem. Or we could wait, and let ` +
          `dem come to us, tired. I prefer tired.`,
      },
      {
        when: (s) => s.army < 4,
        say: () =>
          `We are small. Small is fine. Small and careful lives longer dan big and hasty. ` +
          `I have seen both. I have da heads of both.`,
      },
      {
        when: (s) => s.walled === 0 && s.cities > 2,
        say: () =>
          `No walls anywhere. Walls is patience made of stone. I approve of patience.`,
      },
    ],
    idle: [
      'Dey want peace talks. We bring dem a gift. I know a good... gift. Very persuasive gift.',
      'Nothing is happening. Dis is da best kind of thing to happen.',
      'Be still. Be patient. Da world brings you what you need, eventually, and often by da hair.',
    ],
  },
  {
    id: 'death-mage',
    name: 'Death Mage',
    role: 'arcane',
    faction: 'orc',
    blurb: 'Trails cold mist. Finds the living inconvenient.',
    concerns: [
      {
        when: (s) => s.researching === null,
        say: () =>
          `We study nothing. Nothing studies well. It is patient and it never asks for ` +
          `funding, but its findings are thin.`,
      },
      {
        when: (s) => s.rates.beakers < 3,
        say: (s) =>
          `${spell(s.rates.beakers)} parts of twelve to study. Progress is slow. The dead make poor ` +
          `assistants — motivated, but forgetful.`,
      },
      {
        about: 'magic',
        when: (s) => s.magicUnits === 0,
        say: () =>
          `Not one of our number can do anything a strong arm cannot. It is embarrassing. ` +
          `The dead are *watching*, and they expected better of us.`,
      },
      {
        when: (s) => s.rioting > 0,
        say: (s) =>
          `${count(s.rioting, 'city', 'cities')} in uproar. Delicious. Nothing motivates study like a deadline ` +
          `made of angry people.`,
      },
    ],
    retorts: {
      war: 'Swing harder, by all means. The dead swung harder too, once.',
      walls: 'Build it. I shall be interested to see what walks through it.',
      'the-little-ones': 'Goblins are not a resource. They are barely a species. Use them.',
    },
    idle: [
      'Progress is slow. The dead make poor assistants — motivated, but forgetful.',
      'I have been experimenting. Do not drink from the north well for a while.',
      'All is well, which I say without enthusiasm, as you would expect.',
    ],
  },
  {
    id: 'death-knight',
    name: 'Death Knight',
    role: 'faith',
    faction: 'orc',
    blurb: 'Black armour, fel-green eyes, unsettlingly calm.',
    concerns: [
      {
        about: 'the-little-ones',
        when: (s) => s.rankAndFile > s.army * 0.6 && s.army > 6,
        say: (s) =>
          `${spell(s.rankAndFile)} of our ${spell(s.army)} are goblins and common orcs. They will break. ` +
          `They always break. Spend them somewhere it matters and let the rest of us hold ` +
          `the line.`,
      },
      {
        when: (s) => s.enemiesSeen > 0,
        say: () =>
          `An enemy in sight is an oath waiting to be sworn. Let us swear it. Let us swear ` +
          `it at them.`,
      },
      {
        when: (s) => s.rioting > 0,
        say: (s) =>
          `${count(s.rioting, 'city', 'cities')} forgetting itself. Good. A realm that never suffers never ` +
          `learns what it is for.`,
      },
      {
        when: (s) => s.army < 5,
        say: () =>
          `We are few. Few is honourable. Few is also brief, and I would rather we were ` +
          `honourable for longer.`,
      },
    ],
    retorts: {
      'the-spiral': 'Or we take a city that already has one. Faster, and the walk does them good.',
      magic: 'A spell is a thing that can fail. A blade is a thing that has already been tested.',
      walls: 'Walls are what a realm builds when it has stopped intending to win.',
    },
    idle: [
      'Our warriors fear death less than dishonour. This is either our greatest strength or the reason our graveyards are so full.',
      'The oaths hold. For now. Oaths are like walls that way.',
      'I have nothing to report. This is, in its own way, a kind of failure.',
    ],
  },
  {
    id: 'ogre-quartermaster',
    name: 'Ogre Quartermaster',
    role: 'trade',
    faction: 'orc',
    blurb: 'Two heads. One does the maths, one eats the samples.',
    concerns: [
      {
        when: (s) => s.deadline !== null,
        say: (s) =>
          s.deadline!.level
            ? `Both heads counted the turns. ${sentence(count(s.deadline!.turnsLeft, 'turn'))} left. ` +
              `Both heads counted the score. Same number. Neither head likes this.`
            : s.deadline!.ahead
              ? `${sentence(count(s.deadline!.turnsLeft, 'turn'))} left and we are winning on the ` +
                `counting. Right head wants to attack something. Do not listen to right head.`
              : `${sentence(count(s.deadline!.turnsLeft, 'turn'))} left and we are losing on the ` +
                `counting. More citizens, more advances, more buildings. Both heads agree, which is rare.`,
      },
      {
        when: (s) => s.dominance !== null,
        say: (s) =>
          s.dominance!.theirs
            ? `Both heads counted the world. Both heads say most of it is theirs. ` +
              `${sentence(count(s.dominance!.turnsLeft, 'turn'))} left and there is nothing to count.`
            : `Both heads counted the world. Most of it is ours. ` +
              `${sentence(count(s.dominance!.turnsLeft, 'turn'))} more and we stop counting.`,
      },
      {
        when: (s) => s.goldPerTurn < 0,
        say: (s) =>
          `Left head says we lose ${spell(Math.abs(s.goldPerTurn))} coin every turn. Right head ` +
          `says that is fine because coin is not food. Left head is upset.`,
      },
      {
        when: (s) => s.gold < 20,
        say: (s) =>
          `${spell(s.gold)} coin. Both heads counted. Both heads got ${spell(s.gold)}. Left head is ` +
          `worried, right head is hungry, nobody is happy.`,
      },
      {
        when: ratesUntouched,
        say: () =>
          `Four, four, four. Left head says that is a very tidy way to split the trade and asks who ` +
          `decided it. Right head says nobody decided it, it came like that. Left head would like ` +
          `you to decide it. Empire report. Left head is pointing.`,
      },
      {
        when: (s) => s.rates.coin < 3,
        say: (s) =>
          `Only ${spell(s.rates.coin)} bits of twelve go in the coin pile. Left head says that is ` +
          `not many bits. Right head has eaten a bit. Now fewer bits.`,
      },
      {
        when: (s) => s.gold > 300,
        say: (s) =>
          `Big pile now. ${spell(s.gold)}. Right head wants to eat it. Left head says no. This is ` +
          `an ongoing disagreement and you should probably spend it before it resolves.`,
      },
    ],
    retorts: {
      war: 'Right head says war is expensive. Left head says right head has never bought anything.',
      'the-little-ones': 'Goblins eat. Goblins carry. Left head has the figures and does not like them.',
    },
    idle: [
      'Left head says trade is good this season. Right head already ate the trade.',
      'Supplies counted. Twice. Different answers. Averaging.',
      'Everything is where it should be, or somewhere near there, or eaten.',
    ],
  },
];

export const ADVISORS: AdvisorDef[] = [...KINGDOM, ...HORDE];

export function advisorsFor(faction: FactionId): AdvisorDef[] {
  return ADVISORS.filter((a) => a.faction === faction);
}

/**
 * What this advisor has to say right now.
 *
 * Falls through their concerns in order and takes the first that applies, so
 * the ordering *is* the character. Nothing applying means an idle line, chosen
 * by turn rather than at random so that opening the panel twice on the same
 * turn does not get two different opinions out of the same person.
 */
export function advisorLine(advisor: AdvisorDef, s: Situation): string {
  for (const concern of advisor.concerns) {
    if (concern.when(s)) return sentence(concern.say(s));
  }
  return sentence(advisor.idle[s.turn % advisor.idle.length]);
}

/**
 * Start the line with a capital.
 *
 * Spelling numbers out put words like "one" and "no" at the front of a
 * sentence, and "one city rioting, boss" reads as a fragment somebody
 * interrupted. Done here rather than in every line, since the first word is
 * only known once the number has been chosen.
 */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
