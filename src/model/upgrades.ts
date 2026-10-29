import type { FactionId, UnitTypeId } from './types';

/**
 * Section 155: one upgrade per unit, then a choice between two.
 *
 * Jeremy's, with the design and about 210 sprites already drawn:
 * *"Upgraded Units Option (similar to barbarians). I already have the full
 * upgrade bible and assets."* The bibles are `art_src/unit upgrades/`.
 *
 * ## The shape, and the three things he decided
 *
 * Every base unit gets a **linear** upgrade, and on top of it **two branches
 * that cannot both be had**. Twelve base units across the Horde and the
 * Kingdom is thirty-six advances.
 *
 * 1. **The branch is empire-wide and permanent.** Research Branch A and that
 *    is your army for the rest of the game. It is the reading that makes
 *    "mutually exclusive" mean anything, and it makes the choice a fact
 *    about your empire rather than a per-city shopping decision.
 * 2. **Units already built upgrade in a friendly city, for a fee** -- the
 *    Civ2 idiom. The alternative, new-builds-only, is cheaper to write and
 *    he did not want it.
 * 3. **Horde and Kingdom first.** The three newer factions have their own
 *    bible and follow: their own balance is too fresh to layer an untested
 *    system on, and two unknowns in one measurement answer neither.
 *
 * Costs come from the bible, which says plainly that they are *"suggested
 * starting points, not final balance"*. They are first answers by argument
 * and a sweep decides them, as with every other number in this project.
 *
 * ## Why this is not thirty-six new unit types
 *
 * The advances bible proposes `units: ['sapper-tunnel']`, which would make
 * each upgrade a new creature. **That is the one thing not to do.** Thirty-six
 * new unit ids would be the largest single addition to every hand-maintained
 * list in the game, and sections 141, 144, 147 and 152 are all the same story
 * about what that costs.
 *
 * So an upgrade is a **variant of the unit that already exists**: the creature
 * keeps its id and its row in every table, and carries which upgrade it has.
 * The art follows the convention `clubVariant()` already uses for the ogre's
 * clubs -- the sprites are named `<base>-<variant>`, which is what these ids
 * are, so the renderer resolves them without a mapping table.
 *
 * ## Off by default
 *
 * Like the raiders, and for the same reason: every balance number this
 * project has was measured with the box unticked, so the baseline is the box
 * unticked. The question this has to answer is "does it work", not "does it
 * move the baseline".
 */
export const UPGRADES = {
  /** The new-game checkbox. Off is every measurement ever taken. */
  enabled: false,
};

/** Which of a family's three an upgrade is. */
export type UpgradeLine = 'linear' | 'a' | 'b';

export interface UpgradeDef {
  /**
   * `<base>-<variant>`, which is also the sprite's filename.
   *
   * Not a `UnitTypeId`: nothing of this name is in `UNIT_TYPES` and nothing
   * should be. See the note above.
   */
  id: string;
  /** The creature this upgrades, which keeps its own id throughout. */
  base: UnitTypeId;
  line: UpgradeLine;
  faction: FactionId;
  /** What the player sees it called. */
  name: string;
  /** The advance that makes it available. */
  needs: string;
  /** What it does, in the bible's own words. */
  blurb: string;
  /** And the joke, which is usually the point. */
  flavour: string;
}

export const UPGRADE_DEFS: UpgradeDef[] = [

  // ---- sapper
  {
    id: 'sapper-tunnel',
    base: 'sapper',
    line: 'linear',
    faction: 'orc',
    name: 'Tunnel Sapper',
    needs: 'digging-instead-of-running',
    blurb:
      'Can move through impassable terrain once before detonating.',
    flavour: 'Still carries the explosives. Now also carries a shovel.',
  },
  {
    id: 'sapper-deep',
    base: 'sapper',
    line: 'a',
    faction: 'orc',
    name: 'Deep Sapper',
    needs: 'load-bearing-grudges',
    blurb:
      'Detonation radius +1 tile.',
    flavour: 'Bigger bang, same nerves.',
  },
  {
    id: 'sapper-cadre',
    base: 'sapper',
    line: 'b',
    faction: 'orc',
    name: 'Sapper Cadre',
    needs: 'group-cowardice',
    blurb:
      'Can be deployed in pairs without doubling detonation risk to each ' +
      'other.',
    flavour: 'Misery, appropriately, loves company.',
  },

  // ---- orc
  {
    id: 'orc-veteran',
    base: 'orc',
    line: 'linear',
    faction: 'orc',
    name: 'Orc Veteran',
    needs: 'doing-this-before',
    blurb:
      '+1 attack after surviving 2 combats.',
    flavour: 'The Horde\'s closest thing to an education system.',
  },
  {
    id: 'orc-berserker',
    base: 'orc',
    line: 'a',
    faction: 'orc',
    name: 'Orc Berserker',
    needs: 'losing-it',
    blurb:
      '+2 attack, -1 defense below half HP.',
    flavour: 'Regrets nothing. Will regret this specifically, briefly.',
  },
  {
    id: 'orc-guardian',
    base: 'orc',
    line: 'b',
    faction: 'orc',
    name: 'Orc Guardian',
    needs: 'standing-still-on-purpose',
    blurb:
      '+2 defense, -1 movement.',
    flavour: 'Finally, an orc who waits.',
  },

  // ---- axethrower
  {
    id: 'axethrower-twin',
    base: 'axethrower',
    line: 'linear',
    faction: 'orc',
    name: 'Twin-Axe Thrower',
    needs: 'second-axe-radical',
    blurb:
      'Can throw twice before dropping to reduced strength.',
    flavour: 'A genuine institutional breakthrough.',
  },
  {
    id: 'axethrower-retriever',
    base: 'axethrower',
    line: 'a',
    faction: 'orc',
    name: 'Axe Retriever',
    needs: 'getting-it-back',
    blurb:
      'Chance to recover a thrown axe at the start of next turn.',
    flavour: 'Someone finally asked "then why not just pick it up.".',
  },
  {
    id: 'axethrower-heavy',
    base: 'axethrower',
    line: 'b',
    faction: 'orc',
    name: 'Heavy Axethrower',
    needs: 'sharper-wobbling',
    blurb:
      'Thrown strikes ignore 1 point of target defense.',
    flavour: 'Aerodynamically dubious. Effective anyway.',
  },

  // ---- troll
  {
    id: 'troll-brute',
    base: 'troll',
    line: 'linear',
    faction: 'orc',
    name: 'Troll Brute',
    needs: 'bigger-trolls',
    blurb:
      '+2 HP.',
    flavour: 'Heals just as fast, dies slightly less first.',
  },
  {
    id: 'troll-regen',
    base: 'troll',
    line: 'a',
    faction: 'orc',
    name: 'Regenerating Troll',
    needs: 'trolls-arguing-less',
    blurb:
      'Healing applies mid-combat, not just end of turn.',
    flavour: 'Annoyingly, the optimal troll.',
  },
  {
    id: 'troll-bonebreaker',
    base: 'troll',
    line: 'b',
    faction: 'orc',
    name: 'Troll Bonebreaker',
    needs: 'personal-space-issues',
    blurb:
      'Attacks reduce target\'s defense by 1 for 2 turns.',
    flavour: 'Doesn\'t need to argue. Just needs to lean on you.',
  },

  // ---- ogre
  {
    id: 'ogre-brawler',
    base: 'ogre',
    line: 'linear',
    faction: 'orc',
    name: 'Ogre Brawler',
    needs: 'meaner-little-friend',
    blurb:
      'Attacks hit the defender and one adjacent unit at half damage.',
    flavour: 'Two heads, two targets, finally consistent.',
  },
  {
    id: 'ogre-warlord',
    base: 'ogre',
    line: 'a',
    faction: 'orc',
    name: 'Ogre Warlord',
    needs: 'actual-leadership-one-head-only',
    blurb:
      'Adjacent orc units get +1 attack while this unit is alive.',
    flavour: 'One head does the yelling. The other still just eats.',
  },
  {
    id: 'ogre-grinder',
    base: 'ogre',
    line: 'b',
    faction: 'orc',
    name: 'Ogre Grinder',
    needs: 'the-other-heads-turn',
    blurb:
      'Gains +1 attack for each enemy unit adjacent to it.',
    flavour: 'Surrounding it was, in retrospect, the mistake.',
  },

  // ---- deathknight
  {
    id: 'deathknight-grave',
    base: 'deathknight',
    line: 'linear',
    faction: 'orc',
    name: 'Grave Knight',
    needs: 'dead-owe-us',
    blurb:
      'Killing a unit has a chance to raise a weak skeletal copy for a ' +
      'few turns.',
    flavour: 'Formerly a person. Currently a policy. Now also a pyramid scheme.',
  },
  {
    id: 'deathknight-dread',
    base: 'deathknight',
    line: 'a',
    faction: 'orc',
    name: 'Dread Knight',
    needs: 'worse-reputation',
    blurb:
      'Adjacent enemy units suffer -1 attack (fear).',
    flavour: 'Doesn\'t need to win the fight. Just needs you to hesitate.',
  },
  {
    id: 'deathknight-soulbound',
    base: 'deathknight',
    line: 'b',
    faction: 'orc',
    name: 'Soul-Bound Knight',
    needs: 'longer-contract',
    blurb:
      'Raised skeletons no longer expire, but this unit loses HP each ' +
      'turn one is active.',
    flavour: 'The pyramid scheme finally has overhead.',
  },

  // ---- dragon
  {
    id: 'dragon-elder',
    base: 'dragon',
    line: 'linear',
    faction: 'orc',
    name: 'Elder Dragon',
    needs: 'even-more-fire',
    blurb:
      'Breath damage increases, but flying over enemy cities costs double ' +
      'movement (circling to line up the shot).',
    flavour: 'The Horde\'s one plan, now with more commitment to the bit.',
  },
  {
    id: 'dragon-rider',
    base: 'dragon',
    line: 'a',
    faction: 'orc',
    name: 'Dragon Rider-Bonded',
    needs: 'very-trusting-volunteer',
    blurb:
      'Can carry one ground unit, dropping it in an adjacent tile.',
    flavour: 'The last step in a very short interview process.',
  },
  {
    id: 'dragon-wyrm',
    base: 'dragon',
    line: 'b',
    faction: 'orc',
    name: 'Ancient Wyrm',
    needs: 'bigger-everything',
    blurb:
      'Breath attack no longer has the "carries into the tile behind" ' +
      'friendly-fire risk.',
    flavour: 'Finally learns to aim. Nobody asked why it took this long.',
  },

  // ---- footman
  {
    id: 'footman-veteran',
    base: 'footman',
    line: 'linear',
    faction: 'human',
    name: 'Footman Veteran',
    needs: 'holding-the-line-longer',
    blurb:
      '+1 defense after surviving 2 combats.',
    flavour: 'Still holds the line. Now with opinions about pay AND experience.',
  },
  {
    id: 'footman-shieldwall',
    base: 'footman',
    line: 'a',
    faction: 'human',
    name: 'Shieldwall Footman',
    needs: 'standing-closer-together',
    blurb:
      'Adjacent Footmen get +1 defense when stacked 2+.',
    flavour: 'The shield was always the point. Someone just did the math.',
  },
  {
    id: 'footman-sergeant',
    base: 'footman',
    line: 'b',
    faction: 'human',
    name: 'Footman Sergeant',
    needs: 'yelling-as-a-tactic',
    blurb:
      'Adjacent Footmen ignore the first point of damage taken each ' +
      'combat.',
    flavour: 'Morale, it turns out, is mostly volume.',
  },

  // ---- archer
  {
    id: 'archer-longbow',
    base: 'archer',
    line: 'linear',
    faction: 'human',
    name: 'Longbow Archer',
    needs: 'bigger-bow',
    blurb:
      'Strike range increases to 3 tiles.',
    flavour: 'Keeps the arrow. Now from further away.',
  },
  {
    id: 'archer-volley',
    base: 'archer',
    line: 'a',
    faction: 'human',
    name: 'Volley Archer',
    needs: 'aiming-up-not-at',
    blurb:
      'Can target any unit in range regardless of intervening units.',
    flavour: 'Turns out you don\'t have to see them to hit them.',
  },
  {
    id: 'archer-marksman',
    base: 'archer',
    line: 'b',
    faction: 'human',
    name: 'Marksman Archer',
    needs: 'fewer-better-arrows',
    blurb:
      '+2 attack, but loses the "not struck back" protection.',
    flavour: 'Trades the safety net for the satisfaction.',
  },

  // ---- knight
  {
    id: 'knight-errant',
    base: 'knight',
    line: 'linear',
    faction: 'human',
    name: 'Knight Errant',
    needs: 'better-horse',
    blurb:
      'Movement +1.',
    flavour: 'Expensive, mounted, and now also fast about it.',
  },
  {
    id: 'knight-lance',
    base: 'knight',
    line: 'a',
    faction: 'human',
    name: 'Lance Knight',
    needs: 'pointier-stick',
    blurb:
      'First strike against cavalry-type units.',
    flavour: 'Deeply committed to being seen being mounted, and now also winning because of it.',
  },
  {
    id: 'knight-vanguard',
    base: 'knight',
    line: 'b',
    faction: 'human',
    name: 'Knight Vanguard',
    needs: 'going-first-badly',
    blurb:
      '+2 attack on the first strike of any combat this unit initiates.',
    flavour: 'All the commitment of a charge, none of the planning.',
  },

  // ---- paladin
  {
    id: 'paladin-champion',
    base: 'paladin',
    line: 'linear',
    faction: 'human',
    name: 'Paladin Champion',
    needs: 'run-you-through-again',
    blurb:
      'Heal ability also grants +1 defense for one turn to the healed ' +
      'unit.',
    flavour: 'Morally certain, heavily armored, and now also a healthcare plan.',
  },
  {
    id: 'paladin-templar',
    base: 'paladin',
    line: 'a',
    faction: 'human',
    name: 'Templar Paladin',
    needs: 'fewer-doubts',
    blurb:
      'Immune to the Death Knight\'s fear effect.',
    flavour: 'Correct about roughly half of it. The other half doesn\'t scare him either.',
  },
  {
    id: 'paladin-warden',
    base: 'paladin',
    line: 'b',
    faction: 'human',
    name: 'Warden Paladin',
    needs: 'healing-while-winning',
    blurb:
      'Heal ability no longer costs the whole turn.',
    flavour: 'Multitasking, treated as a holy virtue.',
  },

  // ---- mage
  {
    id: 'mage-archmage',
    base: 'mage',
    line: 'linear',
    faction: 'human',
    name: 'Archmage',
    needs: 'rumbling-voice-louder',
    blurb:
      'Strike range increases to 3 tiles.',
    flavour: 'Has read every book in the Kingdom. Started skimming for this one.',
  },
  {
    id: 'mage-battle',
    base: 'mage',
    line: 'a',
    faction: 'human',
    name: 'Battle Mage',
    needs: 'fighting-while-talking',
    blurb:
      'No "costs the whole turn" penalty after striking.',
    flavour: 'Still talks the whole time. Somehow also still swings.',
  },
  {
    id: 'mage-warden',
    base: 'mage',
    line: 'b',
    faction: 'human',
    name: 'Warden Mage',
    needs: 'reading-ahead',
    blurb:
      'First strike against this unit each combat deals reduced damage (a ' +
      'warding effect).',
    flavour: 'Read the book on getting hit. Skipped straight to the ending.',
  },
];

/** By id, for the renderer and the city view. */
export const UPGRADES_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADE_DEFS.map((u) => [u.id, u]),
);

/** Every upgrade offered for a base creature, linear first. */
export function upgradesFor(base: UnitTypeId): UpgradeDef[] {
  const mine = UPGRADE_DEFS.filter((u) => u.base === base);
  return [...mine.filter((u) => u.line === 'linear'), ...mine.filter((u) => u.line !== 'linear')];
}

/**
 * The two branches of a family, which are the choice.
 *
 * Empty for a creature with no upgrades at all, which is every unit the
 * bible has not reached yet -- ships, settlers, and the three newer
 * factions.
 */
export function branchesFor(base: UnitTypeId): UpgradeDef[] {
  return UPGRADE_DEFS.filter((u) => u.base === base && u.line !== 'linear');
}

/** The advance ids that grant an upgrade, for the tree view and the tests. */
export const UPGRADE_TECH_IDS: string[] = UPGRADE_DEFS.map((u) => u.needs);
