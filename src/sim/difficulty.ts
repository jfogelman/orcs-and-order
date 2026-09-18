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
  },
  {
    id: 'easy',
    name: 'A Skirmish',
    blurb: 'Room to make mistakes, and one or two to spare.',
    content: 1,
    aiCost: 1.15,
    raidEvery: 20,
    raidNotBefore: 30,
  },
  {
    id: 'normal',
    name: 'A War',
    blurb: 'The game as measured. Nobody is doing you any favours.',
    content: 0,
    aiCost: 1,
    raidEvery: 15,
    raidNotBefore: 25,
  },
  {
    id: 'hard',
    name: 'A Crusade',
    blurb: 'Touchier cities, a quicker rival, raiders more often.',
    content: -1,
    aiCost: 0.85,
    raidEvery: 12,
    raidNotBefore: 22,
  },
  {
    id: 'hardest',
    name: 'Doom',
    blurb: 'Everything is on fire, and the rival brought more fire.',
    content: -2,
    aiCost: 0.7,
    raidEvery: 10,
    raidNotBefore: 20,
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
