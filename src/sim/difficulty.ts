import type { DifficultyId, GameSettings, Player } from '../model/types';

/**
 * Section 113: difficulty, five levels, chosen at the start and kept.
 *
 * Civ2's way: the AI plays the same game at every level, and the arithmetic
 * around it changes. The AI's tuning is measured by sweep and should not fork
 * per level, so nothing here touches how it decides -- only what things cost it,
 * how much patience the player's cities have, and how often the wilds send
 * somebody.
 *
 * Measured (section 113), for the player's seat played by the AI: 90%, 69%,
 * 53%, 38%, 18%. The hard side was first built one step steeper -- Crusade at
 * 85% prices *and* touchier cities won 18% -- so Crusade kept only the riots and
 * that combination became Doom.
 *
 * **Normal is today's game, exactly.** Every lever at Normal is the identity,
 * and a test pins that, so no earlier measurement moves.
 */
export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  /** One line for the new-game screen. */
  blurb: string;
  /** Added to how big the player's cities grow before they riot. */
  content: number;
  /** What the AI pays, as a share of the price: for its builds and its research. */
  aiCost: number;
  /** Turns between raider waves, when raiders are on. */
  raidEvery: number;
  /** No raiders before this turn. */
  raidNotBefore: number;
  /**
   * Turns between one opponent arriving and the next. Section 153.
   *
   * **The stagger is now the whole of the rule rather than a shift applied to
   * one.** Sections 136 and 139 had a fixed window -- around turn ninety for
   * the first latecomer, sixty turns apart after that -- which difficulty
   * nudged either way. At two opponents that worked. At four it does not: the
   * fifth faction arrived on turn 345 of a 300-turn game on A Picnic and 315
   * on A Skirmish, which is to say **it never arrived at all**, and on A War
   * it turned up on turn 285 and existed for fifteen turns.
   *
   * Jeremy settled it by making difficulty the only thing that staggers
   * anybody: *"no staggered entry except for the difficulty level increasing
   * -- meaning hardest level is everyone simultaneously, easiest is staggered
   * slightly."*
   *
   * So **zero at Doom**, where everybody is on the map from turn one and the
   * game is as crowded as it can be, rising to a modest gap at A Picnic,
   * where you get a little of the map to yourself before each new one. It
   * remains the difficulty dial section 136 argued for -- it changes how much
   * of the game you have to yourself rather than any number you play against
   * -- and it is now the *only* thing that decides when anybody turns up.
   *
   * **This moves the baseline, knowingly.** Section 139 went to some trouble
   * to keep the default game bit-identical to what a hundred sections had
   * been measured on, and a stagger of twenty-five at Normal does not. That
   * was Jeremy's call to make and he made it; what it costs is that every
   * measurement from before section 153 was taken on a different game.
   *
   * **The numbers are mine and unmeasured.** The shape -- zero at the hardest,
   * rising -- is his.
   */
  stagger: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'easiest',
    name: 'A Picnic',
    blurb: 'Patient cities, a slow rival, and raiders who mostly stay home.',
    content: 2,
    aiCost: 1.3,
    raidEvery: 25,
    raidNotBefore: 40,
    stagger: 40,
  },
  {
    id: 'easy',
    name: 'A Skirmish',
    blurb: 'Room to make mistakes, and one or two to spare.',
    content: 1,
    aiCost: 1.15,
    raidEvery: 20,
    raidNotBefore: 30,
    stagger: 30,
  },
  {
    id: 'normal',
    name: 'A War',
    blurb: 'The game as measured. Nobody is doing you any favours.',
    content: 0,
    aiCost: 1,
    raidEvery: 15,
    raidNotBefore: 25,
    stagger: 20,
  },
  {
    id: 'hard',
    name: 'A Crusade',
    blurb: 'Touchier cities, and raiders more often.',
    content: -1,
    aiCost: 1,
    raidEvery: 12,
    raidNotBefore: 22,
    stagger: 10,
  },
  {
    id: 'hardest',
    name: 'Doom',
    blurb: 'Touchier cities, and a rival who gets everything cheaper.',
    content: -1,
    aiCost: 0.85,
    raidEvery: 10,
    raidNotBefore: 20,
    stagger: 0,
  },
];

const NORMAL = DIFFICULTIES.find((d) => d.id === 'normal')!;

/**
 * This game's level. Anything unrecognised is Normal: every save written before
 * section 113 says `'normal'`, and the two unused names the old type allowed
 * (`'peaceful'`, `'nasty'`) were never offered or read by anything.
 */
export function difficultyOf(settings: Pick<GameSettings, 'difficulty'>): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === settings.difficulty) ?? NORMAL;
}

/**
 * What a seat is given at the start, from the level: the player's seat gets the
 * patience, the AI's gets the discount. Stored on the player rather than read
 * from the level each time so it is fixed with the game, and so a sweep -- where
 * both seats are the AI -- can still measure a level from the seat the person
 * would have had.
 */
export function handicapFor(level: DifficultyDef, controller: Player['controller']): Player['handicap'] {
  if (level.id === 'normal') return undefined;
  return controller === 'human' ? { content: level.content, cost: 1 } : { content: 0, cost: level.aiCost };
}

/** Extra patience in this player's cities. */
export function handicapContent(player: Player): number {
  return player.handicap?.content ?? 0;
}

/** Scale a price this player pays. Never below one. */
export function handicapCost(player: Player, cost: number): number {
  const scale = player.handicap?.cost ?? 1;
  return scale === 1 ? cost : Math.max(1, Math.round(cost * scale));
}
