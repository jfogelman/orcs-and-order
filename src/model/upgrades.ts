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
/**
 * What a raised skeleton is worth, against what it is a copy of. Section 155.
 *
 * Jeremy's ruling of 2026-10-30: **half the original's numbers**, attack,
 * defence and health alike. "A weak skeletal copy" then means something --
 * raising a dragon is worth more than raising a peon -- and it needs no
 * second table of stats, which for thirty-eight raisable creatures is the
 * difference between a rule and a chore.
 *
 * Here in `model/` rather than with the other upgrade rules because `maxHp`
 * needs it and nothing in `model/` may reach into `sim/`.
 */
export const RAISED = { scale: 0.5 };

export const UPGRADES = {
  /** The new-game checkbox. Off is every measurement ever taken. */
  enabled: false,
  /**
   * Gold per shield of the creature's build cost, to upgrade one already
   * built.
   *
   * A first answer by argument, which is how every number in this project
   * starts. Two gold a shield puts an Orc at twenty and a Dragon at ninety --
   * dear enough that an empire upgrades the army it means to fight with
   * rather than all of it, and cheap enough to be worth doing at all. It is
   * deliberately well under `rushCost`, which charges two gold a shield
   * *plus* a quadratic term and then doubles it from cold: buying a whole new
   * creature should cost more than improving one you have.
   */
  fee: 2,
};

/** Which of a family's three an upgrade is. */
export type UpgradeLine = 'linear' | 'a' | 'b';

/**
 * The part of an upgrade that is only a number. Section 155 slice 5.
 *
 * **Deliberately small, and deliberately not everything.** Of the thirty-six
 * blurbs, five are a flat modifier to a figure the game already computes and
 * the other thirty-one are rules -- a condition, an aura, a change to what an
 * ability costs. Trying to express all of them as data would mean inventing a
 * little language, and the moment a table needs a predicate it has stopped
 * being a table.
 *
 * So the flat ones live here, where they can be read off, and the rest are
 * named checks in the subsystem that owns them, exactly as `hasPerk` is. What
 * holds the two halves together is `tests/upgradeEffects.test.ts`, which
 * insists every one of the thirty-six is **either** data here, **or** named
 * somewhere under `src/`, **or** declared unwired with a reason. There is no
 * fourth option, which is the whole point: an upgrade whose blurb promises
 * something and whose code does nothing is a card that lies, and nothing else
 * would ever fail because of it.
 */
export interface UpgradeEffect {
  /** Added to the creature's base attack, before every multiplier. */
  attack?: number;
  /** Added to its base defence, likewise. */
  defence?: number;
  /** Movement points a turn. Negative is a real cost, and two of these have one. */
  moves?: number;
  /** Tiles added to a striking range, through the `reach` the Rumbling Archive uses. */
  reach?: number;
  /** Tiles added to a sapper's blast. */
  blast?: number;
  /** Hit points, per creature in the group. Read through `maxHp`. */
  hp?: number;
}

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
  /**
   * The flat part, if this upgrade's whole effect is a number.
   *
   * Absent means the effect is a rule and lives in code. It does **not** mean
   * the upgrade does nothing -- see the completeness test.
   */
  effect?: UpgradeEffect;
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
    effect: { blast: 1 },
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
      '+2 defense, and moves one tile every two turns. Can Cover an adjacent ' +
      'unit, meeting whatever comes for it in their place.',
    flavour: 'Finally, an orc who waits.',
    // The movement half is not a number. Jeremy settled it on 2026-10-29: an
    // orc has one movement point, so a flat -1 left the Guardian unable to
    // move at all for the rest of the game. It moves **one tile every two
    // turns** instead, and gets `cover` in exchange -- see `GUARDIAN` and
    // `coverBlocked`.
    effect: { defence: 2 },
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
      'Whatever it opens on holds the line one point worse.',
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
    effect: { hp: 2 },
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
      'Its breath carries further through the line, but it is slower: one ' +
      'movement point gone to circling.',
    flavour: 'The Horde\'s one plan, now with more commitment to the bit.',
    // The drawback the bible gave it -- double movement over enemy cities --
    // is a manoeuvre this game has no rule for: no unit may enter an enemy
    // city tile by pathing at all. Jeremy's ruling of 2026-10-30 moved the
    // cost somewhere the game can express. A dragon has four movement points,
    // so one off is a real price rather than the standstill `orc-guardian`
    // would have been.
    effect: { moves: -1 },
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
      'Looses twice at the opening of a fight: its free shot, the answer to ' +
      'it, and a second shot.',
    flavour: 'Keeps the arrow. Now from further away.',
    // Not range, which this game's Archer does not have -- Jeremy's ruling of
    // 2026-10-29 reads the bible's "twice as far" as **twice**: it looses,
    // is answered, and looses again. The rule is in `resolveCombat`; there is
    // no number here to hold.
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
    // The one archer line that ports cleanly, and only because the game is
    // not the one the bible pictured. The Archer here has `range: 1` and
    // `firstStrikes: 1` -- its "ranged" nature *is* the free opening blow, so
    // "loses the not-struck-back protection" means losing that first strike.
    // The +2 is data; the first strike is a rule in `firstStrikesOf`, and the
    // two have to land together or this is a free two points of attack.
    effect: { attack: 2 },
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
    effect: { moves: 1 },
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
    // "Range increases to 3", and the Mage's base is 2, so +1 rather than a
    // floor at 3. The Archer's line says the same words and does **not** get
    // this, because the Archer's range is 1: see `archer-longbow` in the
    // unwired list.
    effect: { reach: 1 },
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
      'Takes half the damage from any attack, and nothing gets a free first ' +
      'strike against it.',
    flavour: 'Read the book on getting hit. Skipped straight to the ending.',
  },

  // =====================================================================
  // Section 155 slice 6: the three newer factions, from Jeremy's second
  // bible (`unit_upgrades_new_factions.md`, in the assets repo rather than
  // this one -- which is how an earlier note in DESIGN_QUEUE came to record
  // a path that does not resolve here, and how it was then reported as
  // missing entirely).
  //
  // **Six, seven and five families rather than twelve each**, because the
  // bible's own "Skipped on purpose" section excludes the workers, the
  // spies, the naval transports, the siege attackers and the
  // one-of-a-kinds -- and the Burrower and the Mystic, which already have
  // upgrades of their own from sections 125 and 150.
  //
  // **Two families are renamed.** The bible calls them `skirmisher-*` and
  // `brute-*`, and both of those names already belong to **wild orc
  // raiders**. The renderer takes a creature off the front of an upgrade
  // id, so a Wandering Folk mercenary would have resolved to a raider's
  // sprite. They are `wf-skirmisher-*` and `wf-brute-*` here -- the prefix
  // the creatures themselves already carry -- and the advances are renamed
  // with them, so the bible's "the tech id equals the unit id it grants"
  // still holds.

  // ---- fodder (hivekin)
  {
    id: 'fodder-hardened',
    base: 'fodder',
    line: 'linear',
    faction: 'hivekin',
    name: 'Hardened Fodder',
    needs: 'fodder-hardened',
    blurb: '+1 defence, +2 HP.',
    flavour: 'The shell was cracked. It has been made less cracked.',
    effect: { defence: 1, hp: 2 },
  },
  {
    id: 'fodder-swarm',
    base: 'fodder',
    line: 'a',
    faction: 'hivekin',
    name: 'Swarm Fodder',
    needs: 'fodder-swarm',
    blurb:
      '+2 attack for each other Swarm or ordinary Fodder in the ' +
      'same stack (max +3).',
    flavour: 'One is a shape. Several is a larger shape.',
  },
  {
    id: 'fodder-burst',
    base: 'fodder',
    line: 'b',
    faction: 'hivekin',
    name: 'Bursting Fodder',
    needs: 'fodder-burst',
    blurb:
      'When killed, deals a caustic burst to the attacker (1 ' +
      'damage, ignores armour).',
    flavour:
      'It was always going to come apart. Now it comes apart on ' +
      'someone.',
  },

  // ---- soldier (hivekin)
  {
    id: 'soldier-seasoned',
    base: 'soldier',
    line: 'linear',
    faction: 'hivekin',
    name: 'Seasoned Soldier',
    needs: 'soldier-seasoned',
    blurb: '+1 attack, +1 defence.',
    flavour: 'The shape has been used. The shape remembers.',
    effect: { attack: 1, defence: 1 },
  },
  {
    id: 'soldier-reaver',
    base: 'soldier',
    line: 'a',
    faction: 'hivekin',
    name: 'Reaver Soldier',
    needs: 'soldier-reaver',
    blurb: '+3 attack, -1 defence; bonus vs. cities.',
    flavour:
      'The blade is longer. The shell is the same size. This was ' +
      'noted.',
    effect: { attack: 3, defence: -1 },
  },
  {
    id: 'soldier-carapace',
    base: 'soldier',
    line: 'b',
    faction: 'hivekin',
    name: 'Carapace Soldier',
    needs: 'soldier-carapace',
    blurb: '+3 defence, +3 HP, -1 move on rough terrain.',
    flavour: 'It is difficult to hit. It is also difficult to move.',
    effect: { defence: 3, hp: 3 },
  },

  // ---- spitter (hivekin)
  {
    id: 'spitter-long',
    base: 'spitter',
    line: 'linear',
    faction: 'hivekin',
    name: 'Long Spitter',
    needs: 'spitter-long',
    blurb: '+1 attack, +1 range of effect.',
    flavour: 'The gland is the same. The neck is longer.',
    effect: { attack: 1 },
  },
  {
    id: 'spitter-corrosive',
    base: 'spitter',
    line: 'a',
    faction: 'hivekin',
    name: 'Corrosive Spitter',
    needs: 'spitter-corrosive',
    blurb: 'Ignores half of the target\'s defence.',
    flavour:
      'It does not strike harder. It simply arrives in more ' +
      'places.',
  },
  {
    id: 'spitter-volley',
    base: 'spitter',
    line: 'b',
    faction: 'hivekin',
    name: 'Volley Spitter',
    needs: 'spitter-volley',
    blurb:
      'Hits every enemy on the target tile and one adjacent tile ' +
      'at reduced strength.',
    flavour: 'The shape produces less per spit and spits more often.',
  },

  // ---- elite (hivekin)
  {
    id: 'elite-crested',
    base: 'elite',
    line: 'linear',
    faction: 'hivekin',
    name: 'Crested Elite',
    needs: 'elite-crested',
    blurb: '+1 attack, +1 defence, +2 HP.',
    flavour: 'The crest is taller. No one has said why that helps.',
    effect: { attack: 1, defence: 1, hp: 2 },
  },
  {
    id: 'elite-warform',
    base: 'elite',
    line: 'a',
    faction: 'hivekin',
    name: 'Warform Elite',
    needs: 'elite-warform',
    blurb: '+3 attack, +1 attack per consecutive win in one turn.',
    flavour: 'It attacks more. It is not clear that it intends to stop.',
    effect: { attack: 3 },
  },
  {
    id: 'elite-bulwark',
    base: 'elite',
    line: 'b',
    faction: 'hivekin',
    name: 'Bulwark Elite',
    needs: 'elite-bulwark',
    blurb: '+3 defence, +4 HP; adjacent Hivekin take 1 less damage.',
    flavour: 'The plates overlap. So does the responsibility.',
    effect: { defence: 3, hp: 4 },
  },

  // ---- broodlord (hivekin)
  {
    id: 'broodlord-grown',
    base: 'broodlord',
    line: 'linear',
    faction: 'hivekin',
    name: 'Grown Broodlord',
    needs: 'broodlord-grown',
    blurb: '+1 attack, +1 defence, +4 HP.',
    flavour: 'It has not stopped growing. No one has asked it to.',
    effect: { attack: 1, defence: 1, hp: 4 },
  },
  {
    id: 'broodlord-many',
    base: 'broodlord',
    line: 'a',
    faction: 'hivekin',
    name: 'Many-Armed Broodlord',
    needs: 'broodlord-many',
    blurb: '+4 attack; may attack twice per turn against a stack.',
    flavour: 'There were four arms. This was found insufficient.',
    effect: { attack: 4 },
  },
  {
    id: 'broodlord-keeper',
    base: 'broodlord',
    line: 'b',
    faction: 'hivekin',
    name: 'Brood-Keeper Broodlord',
    needs: 'broodlord-keeper',
    blurb: 'Heals adjacent Hivekin 2 HP per turn; +2 defence.',
    flavour: 'It no longer needs to kill. It has things to tend.',
    effect: { defence: 2 },
  },

  // ---- warden (hivekin)
  {
    id: 'warden-tempered',
    base: 'warden',
    line: 'linear',
    faction: 'hivekin',
    name: 'Tempered Warden',
    needs: 'warden-tempered',
    blurb: '+1 defence, +2 HP; exorcises a little more surely.',
    flavour: 'The secretion is the same. It has had longer to set.',
    effect: { defence: 1, hp: 2 },
  },
  {
    id: 'warden-purging',
    base: 'warden',
    line: 'a',
    faction: 'hivekin',
    name: 'Purging Warden',
    needs: 'warden-purging',
    blurb:
      'Exorcises almost without fail; +3 attack against incorporeal ' +
      'units, and nothing gathers in a town it is standing beside.',
    flavour:
      'What it touches does not come back. The shape considers ' +
      'this the point.',
  },
  {
    id: 'warden-anchored',
    base: 'warden',
    line: 'b',
    faction: 'hivekin',
    name: 'Anchored Warden',
    needs: 'warden-anchored',
    blurb:
      '+3 defence, +4 HP; incorporeal units cannot move through the ' +
      'ground around it.',
    flavour:
      'It stands where it is. Things that cannot stand there are ' +
      'noted.',
    effect: { defence: 3, hp: 4 },
  },

  // ---- wf-skirmisher (wandering)
  {
    id: 'wf-skirmisher-paid',
    base: 'wf-skirmisher',
    line: 'linear',
    faction: 'wandering',
    name: 'Paid Skirmisher',
    needs: 'wf-skirmisher-paid',
    blurb: '+1 attack, +1 defence.',
    flavour:
      'Paid on time, which they are not used to, and which they ' +
      'are working out how to exploit.',
    effect: { attack: 1, defence: 1 },
  },
  {
    id: 'wf-skirmisher-cutpurse',
    base: 'wf-skirmisher',
    line: 'a',
    faction: 'wandering',
    name: 'Cutpurse Skirmisher',
    needs: 'wf-skirmisher-cutpurse',
    blurb:
      'Wins plunder +2 gold per kill; +1 attack in enemy ' +
      'territory.',
    flavour: 'Everything on the battlefield is technically unclaimed.',
  },
  {
    id: 'wf-skirmisher-rearguard',
    base: 'wf-skirmisher',
    line: 'b',
    faction: 'wandering',
    name: 'Rearguard Skirmisher',
    needs: 'wf-skirmisher-rearguard',
    blurb:
      '+3 defence; the stack it is in may retreat from combat ' +
      'without penalty.',
    flavour: 'Somebody has to go last. It is in the contract.',
    effect: { defence: 3 },
  },

  // ---- warband (wandering)
  {
    id: 'warband-seasoned',
    base: 'warband',
    line: 'linear',
    faction: 'wandering',
    name: 'Seasoned Warband',
    needs: 'warband-seasoned',
    blurb: '+1 attack, +1 defence, +2 HP.',
    flavour: 'Experience, like everything else, is billed in arrears.',
    effect: { attack: 1, defence: 1, hp: 2 },
  },
  {
    id: 'warband-caravanguard',
    base: 'warband',
    line: 'a',
    faction: 'wandering',
    name: 'Caravan Guard',
    needs: 'warband-caravanguard',
    blurb: '+3 defence; +2 defence to adjacent Wandering Folk.',
    flavour:
      'The job was originally to protect the wagons. It has since ' +
      'been extended.',
    effect: { defence: 3 },
  },
  {
    id: 'warband-sergeant',
    base: 'warband',
    line: 'b',
    faction: 'wandering',
    name: 'Sergeant-at-Arms',
    needs: 'warband-sergeant',
    blurb: '+3 attack; adjacent Wandering Folk attack at +1.',
    flavour: 'Nobody voted. Several agreed, afterwards.',
    effect: { attack: 3 },
  },

  // ---- slinger (wandering)
  {
    id: 'slinger-steady',
    base: 'slinger',
    line: 'linear',
    faction: 'wandering',
    name: 'Steady Slinger',
    needs: 'slinger-steady',
    blurb: '+1 attack, +1 range; fewer misses.',
    flavour: 'The arrows are the same. The aim has been paid for.',
    effect: { attack: 1 },
  },
  {
    id: 'slinger-quiver',
    base: 'slinger',
    line: 'a',
    faction: 'wandering',
    name: 'Quiver-Rich Slinger',
    needs: 'slinger-quiver',
    blurb:
      '+3 attack; ignores the first round of enemy defence ' +
      'bonuses from walls.',
    flavour: 'Having the arrows turns out to matter.',
    effect: { attack: 3 },
  },
  {
    id: 'slinger-marksman',
    base: 'slinger',
    line: 'b',
    faction: 'wandering',
    name: 'Marksman Slinger',
    needs: 'slinger-marksman',
    blurb:
      '+5 attack against units on open ground; attacks one tile ' +
      'further.',
    flavour: 'Payment is per hit. Misses are not discussed.',
  },

  // ---- outcast (wandering)
  {
    id: 'outcast-hardened',
    base: 'outcast',
    line: 'linear',
    faction: 'wandering',
    name: 'Hardened Outcast',
    needs: 'outcast-hardened',
    blurb: '+1 attack, +2 defence, +2 HP.',
    flavour: 'Being unwelcome has proven to be a transferable skill.',
    effect: { attack: 1, defence: 2, hp: 2 },
  },
  {
    id: 'outcast-grudge',
    base: 'outcast',
    line: 'a',
    faction: 'wandering',
    name: 'Grudge Outcast',
    needs: 'outcast-grudge',
    blurb: '+3 attack; +3 more against Orc Horde units.',
    flavour: 'It has a specific list of people. It is in no hurry.',
    effect: { attack: 3 },
  },
  {
    id: 'outcast-ironback',
    base: 'outcast',
    line: 'b',
    faction: 'wandering',
    name: 'Ironback Outcast',
    needs: 'outcast-ironback',
    blurb: '+3 defence; ignores terrain movement penalty.',
    flavour: 'If anyone wants it moved, they will need to move it.',
    effect: { defence: 3 },
  },

  // ---- wf-brute (wandering)
  {
    id: 'wf-brute-seasoned',
    base: 'wf-brute',
    line: 'linear',
    faction: 'wandering',
    name: 'Seasoned Brute',
    needs: 'wf-brute-seasoned',
    blurb: '+1 attack, +1 defence, +4 HP.',
    flavour: 'Has been fed on schedule. The results are visible.',
    effect: { attack: 1, defence: 1, hp: 4 },
  },
  {
    id: 'wf-brute-hauler',
    base: 'wf-brute',
    line: 'a',
    faction: 'wandering',
    name: 'Hauler Brute',
    needs: 'wf-brute-hauler',
    blurb:
      '+8 HP; adjacent Wandering Folk units heal +1 per turn in ' +
      'its stack.',
    flavour:
      'Mostly it carries things. Sometimes it carries people who ' +
      'disagree.',
    effect: { hp: 8 },
  },
  {
    id: 'wf-brute-wrecker',
    base: 'wf-brute',
    line: 'b',
    faction: 'wandering',
    name: 'Wrecker Brute',
    needs: 'wf-brute-wrecker',
    blurb: '+4 attack; double attack against fortified cities.',
    flavour: 'Charged by the wall, not by the hour.',
    effect: { attack: 4 },
  },

  // ---- bonebound (wandering)
  {
    id: 'bonebound-charmed',
    base: 'bonebound',
    line: 'linear',
    faction: 'wandering',
    name: 'Charmed Bonebound',
    needs: 'bonebound-charmed',
    blurb: '+1 attack, +1 defence, +4 HP.',
    flavour: 'Each charm is a favour. They are being collected.',
    effect: { attack: 1, defence: 1, hp: 4 },
  },
  {
    id: 'bonebound-regrowing',
    base: 'bonebound',
    line: 'a',
    faction: 'wandering',
    name: 'Regrowing Bonebound',
    needs: 'bonebound-regrowing',
    blurb: 'Regenerates 3 HP per turn, even after combat.',
    flavour: 'The troll is a long-term investment.',
  },
  {
    id: 'bonebound-rattling',
    base: 'bonebound',
    line: 'b',
    faction: 'wandering',
    name: 'Rattling Bonebound',
    needs: 'bonebound-rattling',
    blurb:
      '+4 attack; enemy units attacking it suffer -1 attack for ' +
      'one turn.',
    flavour: 'The noise is considered part of the service.',
    effect: { attack: 4 },
  },

  // ---- drake (wandering)
  {
    id: 'drake-harnessed',
    base: 'drake',
    line: 'linear',
    faction: 'wandering',
    name: 'Harnessed Drake',
    needs: 'drake-harnessed',
    blurb: '+1 attack, +1 defence, +4 HP.',
    flavour: 'Same drake. Better harness. The harness is the product.',
    effect: { attack: 1, defence: 1, hp: 4 },
  },
  {
    id: 'drake-courier',
    base: 'drake',
    line: 'a',
    faction: 'wandering',
    name: 'Courier Drake',
    needs: 'drake-courier',
    blurb: '+2 move; may carry one additional unit.',
    flavour: 'Letters are the product. The drake is the packaging.',
    effect: { moves: 2 },
  },
  {
    id: 'drake-fire',
    base: 'drake',
    line: 'b',
    faction: 'wandering',
    name: 'Fire-Hired Drake',
    needs: 'drake-fire',
    blurb:
      '+4 attack; sets the target tile ablaze (1 damage next ' +
      'turn).',
    flavour: 'Billed separately. Extra for the fire.',
    effect: { attack: 4 },
  },

  // ---- revenant (unbound)
  {
    id: 'revenant-settled',
    base: 'revenant',
    line: 'linear',
    faction: 'unbound',
    name: 'Settled Revenant',
    needs: 'revenant-settled',
    // The bible says *"reforms at +1 HP"*, and a spirit reforms at **full**
    // HP -- `spawnUnit` makes a whole one -- so a bonus paid on reform is a
    // bonus paid into a unit that is already full. It is +1 HP, flatly, which
    // is what the clause was reaching for and is worth it on the turn it is
    // bought rather than on the turn it dies. The card says the thing the game
    // does, because a card that promises a condition the game has not got is
    // worse than a smaller card.
    blurb: '+1 attack, +1 defence, +1 HP.',
    flavour: 'It is slightly less likely to come apart. This is noted.',
    effect: { attack: 1, defence: 1, hp: 1 },
  },
  {
    id: 'revenant-insistent',
    base: 'revenant',
    line: 'a',
    faction: 'unbound',
    name: 'Insistent Revenant',
    needs: 'revenant-insistent',
    blurb: 'Gathers again in 1 turn instead of 2; +2 attack once it has.',
    flavour: 'Nothing prevents it. This is a finding.',
  },
  {
    id: 'revenant-clinging',
    base: 'revenant',
    line: 'b',
    faction: 'unbound',
    name: 'Clinging Revenant',
    needs: 'revenant-clinging',
    blurb:
      '+3 defence; holding one of its own cities, only a Hive Warden ' +
      'can end it — anything else merely scatters it.',
    flavour: 'It was asked to leave. The request is on file.',
    effect: { defence: 3 },
  },

  // ---- sylph (unbound)
  {
    id: 'sylph-quickened',
    base: 'sylph',
    line: 'linear',
    faction: 'unbound',
    name: 'Quickened Sylph',
    needs: 'sylph-quickened',
    blurb: '+1 attack, +1 move.',
    flavour: 'It was there. It is now elsewhere.',
    effect: { attack: 1, moves: 1 },
  },
  {
    id: 'sylph-gale',
    base: 'sylph',
    line: 'a',
    faction: 'unbound',
    name: 'Gale Sylph',
    needs: 'sylph-gale',
    blurb:
      '+4 attack against units on open ground; ignores terrain ' +
      'movement costs.',
    flavour: 'The weather has a position. It was not asked.',
  },
  {
    id: 'sylph-stilled',
    base: 'sylph',
    line: 'b',
    faction: 'unbound',
    name: 'Stilled Sylph',
    needs: 'sylph-stilled',
    blurb:
      '+3 defence; negates attacker\'s terrain bonus; invisible to ' +
      'units more than 1 tile away.',
    flavour: 'The air is still. This is also an event.',
    effect: { defence: 3 },
  },

  // ---- naiad (unbound)
  {
    id: 'naiad-deepened',
    base: 'naiad',
    line: 'linear',
    faction: 'unbound',
    name: 'Deepened Naiad',
    needs: 'naiad-deepened',
    blurb: '+1 attack, +1 defence; water-adjacency bonus +1.',
    flavour: 'It has been in the water longer. The water has noticed.',
    effect: { attack: 1, defence: 1 },
  },
  {
    id: 'naiad-tidal',
    base: 'naiad',
    line: 'a',
    faction: 'unbound',
    name: 'Tidal Naiad',
    needs: 'naiad-tidal',
    blurb:
      '+4 attack when adjacent to water; may attack from water ' +
      'tiles.',
    flavour: 'The moon is cited. It has not commented.',
  },
  {
    id: 'naiad-still',
    base: 'naiad',
    line: 'b',
    faction: 'unbound',
    name: 'Still-Water Naiad',
    needs: 'naiad-still',
    blurb: '+3 defence; heals 2 HP per turn adjacent to water.',
    flavour: 'Nothing disturbs it. This is considered sufficient.',
    effect: { defence: 3 },
  },

  // ---- yaksha (unbound)
  {
    id: 'yaksha-posted',
    base: 'yaksha',
    line: 'linear',
    faction: 'unbound',
    name: 'Posted Yaksha',
    needs: 'yaksha-posted',
    blurb: '+1 attack, +2 defence, +2 HP.',
    flavour: 'It has been given an actual post. It seems to prefer this.',
    effect: { attack: 1, defence: 2, hp: 2 },
  },
  {
    id: 'yaksha-immovable',
    base: 'yaksha',
    line: 'a',
    faction: 'unbound',
    name: 'Immovable Yaksha',
    needs: 'yaksha-immovable',
    blurb: '+4 defence, +4 HP; units cannot move through its tile.',
    flavour: 'The request to move was received. It was reviewed.',
    effect: { defence: 4, hp: 4 },
  },
  {
    id: 'yaksha-reckoner',
    base: 'yaksha',
    line: 'b',
    faction: 'unbound',
    name: 'Reckoner Yaksha',
    needs: 'yaksha-reckoner',
    blurb: '+3 attack; counter-attacks every attacker in a turn.',
    flavour:
      'Every attacker is entered in the record. The record is ' +
      'balanced.',
    effect: { attack: 3 },
  },

  // ---- jinn (unbound)
  {
    id: 'jinn-practiced',
    base: 'jinn',
    line: 'linear',
    faction: 'unbound',
    name: 'Practised Jinn',
    needs: 'jinn-practiced',
    blurb: '+1 attack, +1 defence, +2 HP.',
    flavour: 'The terms are the same. It has read them more times.',
    effect: { attack: 1, defence: 1, hp: 2 },
  },
  {
    id: 'jinn-fineprint',
    base: 'jinn',
    line: 'a',
    faction: 'unbound',
    name: 'Fine-Print Jinn',
    needs: 'jinn-fineprint',
    blurb: '-2 attack to all enemies adjacent to it; +2 attack.',
    flavour: 'The wording was agreed. The wording was read.',
    effect: { attack: 2 },
  },
  {
    id: 'jinn-taker',
    base: 'jinn',
    line: 'b',
    faction: 'unbound',
    name: 'Wish-Taker Jinn',
    needs: 'jinn-taker',
    blurb: '+4 attack; each kill grants +1 gold.',
    flavour:
      'Something was asked for. Something was taken. The two are ' +
      'not identical.',
    effect: { attack: 4 },
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

/** By the advance that grants it, which is how the research side looks one up. */
export const UPGRADE_BY_TECH: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADE_DEFS.map((u) => [u.needs, u]),
);

/**
 * The other branch of a family -- the one taking this gives up.
 *
 * Null for a linear upgrade, which gives nothing up, and for a family that
 * somehow has only one branch, which the list-agreement test forbids.
 */
export function rivalBranch(u: UpgradeDef): UpgradeDef | null {
  if (u.line === 'linear') return null;
  return UPGRADE_DEFS.find((o) => o.base === u.base && o.line !== 'linear' && o.id !== u.id) ?? null;
}

/**
 * Whether this advance is a door that has already closed.
 *
 * **This is where "the branch is empire-wide and permanent" actually lives.**
 * Jeremy's first ruling was that researching Branch A settles the question for
 * the whole empire for the rest of the game, and the honest way to say that in
 * a game built on a tech tree is that Branch B stops being researchable. No
 * new field on `Player`, no second record of the decision that could disagree
 * with the books: the advance you took *is* the decision.
 *
 * Takes the id list rather than a `Player` so it stays a pure function of what
 * an empire knows, and so a test can ask it about a hand of three advances.
 */
export function branchGivenUp(techs: readonly string[], techId: string): boolean {
  const up = UPGRADE_BY_TECH[techId];
  if (!up) return false;
  const rival = rivalBranch(up);
  return rival !== null && techs.includes(rival.needs);
}

/**
 * What this empire's creatures of a kind are, given what it knows.
 *
 * The branch if a branch has been taken, otherwise the linear upgrade, and
 * null for a creature this empire has learned nothing about -- which is every
 * creature in a game with the box unticked, and most of them in one with it
 * ticked.
 *
 * A newly built unit comes out like this for nothing; one already standing
 * pays `UPGRADES.fee` in a city of its own. That split is Jeremy's second
 * ruling, and it is the Civ2 idiom: the factory makes the current model, and
 * last year's model goes back to the works.
 */
export function upgradeHeld(techs: readonly string[], base: UnitTypeId): UpgradeDef | null {
  const mine = UPGRADE_DEFS.filter((u) => u.base === base);
  return (
    mine.find((u) => u.line !== 'linear' && techs.includes(u.needs)) ??
    mine.find((u) => u.line === 'linear' && techs.includes(u.needs)) ??
    null
  );
}

/**
 * Point the lever at what this game was started with.
 *
 * **A lever a player can set is new here, and it needs exactly one owner.**
 * Every other subsystem switch in this project -- `ALT_VICTORY`, `FOLLIES`,
 * `TERRAFORM` -- is a module object that only a sweep ever writes, and
 * `techInPlay` reads this one from a `TechDef` with no game in hand, so it
 * cannot become a field on `GameState` without threading state through
 * thirty-seven call sites of `researchableTechs`.
 *
 * So the settings are the record and the lever is the live copy, and this is
 * the only thing that writes it: `createGame` calls it with the settings it
 * just built, and `deserialize` calls it with the settings it just read. A
 * save carries its own answer and loading one is enough to get it, which is
 * the failure to avoid -- a game started with upgrades, saved, and reopened in
 * a session that had them off.
 *
 * It reads `UPGRADES.enabled` as the *default* rather than clearing it, so a
 * sweep that sets the lever and then calls `createGame` still gets the arm it
 * asked for. See `upgradesAsked`.
 */
export function applyUpgrades(settings: { upgrades?: boolean }): void {
  UPGRADES.enabled = settings.upgrades === true;
}

/** What a new game's settings should record: what was asked, else the lever. */
export function upgradesAsked(asked?: boolean): boolean {
  return asked ?? UPGRADES.enabled;
}
