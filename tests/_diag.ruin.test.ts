import { describe, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { RUIN } from '../src/sim/city';
import { createGame, playerCities } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, scoreBreakdown } from '../src/sim/turn';

/**
 * THROWAWAY. Delete after reading.
 *
 * Razing only fired 0.9 times a game because a city sacked to size 2 regrew
 * to 8 before anyone returned. A sacked city now stays a ruin, and nothing
 * grows there while it is one. Does that let repeated capture finish the job?
 *
 * The number to watch is games ending before turn 300, currently 4 in 18.
 */

declare const process: { env: Record<string, string | undefined> };
const SEED_COUNT = Number(process.env.BALANCE_SEEDS ?? 18);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1 + i * 7919);

function play(seed: number) {
  const state = createGame({ seed });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);
  const owners = new Map<number, number>();
  let changes = 0;
  let razed = 0;
  let seen = 0;
  for (const c of state.cities) owners.set(c.id, c.owner);

  for (let i = 0; i < 700 && state.winner === null; i++) {
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
    for (const c of state.cities) {
      const prev = owners.get(c.id);
      if (prev !== undefined && prev !== c.owner) changes++;
      owners.set(c.id, c.owner);
    }
    for (const e of state.log.slice(seen)) {
      if (/ceases to be a place/.test(e.text)) razed++;
    }
    seen = state.log.length;
  }
  const score = [scoreBreakdown(state, 0).total, scoreBreakdown(state, 1).total] as const;
  return {
    turns: state.turn,
    winner: state.winner,
    endedEarly: state.turn <= 300,
    changes,
    razed,
    onMap: state.cities.length,
    cities: [playerCities(state, 0).length, playerCities(state, 1).length] as const,
    population: [
      playerCities(state, 0).reduce((n, c) => n + c.size, 0),
      playerCities(state, 1).reduce((n, c) => n + c.size, 0),
    ] as const,
    gap: score[1] - score[0],
  };
}

function arm(label: string, turns: number): void {
  RUIN.turns = turns;
  const games = SEEDS.map(play);
  const avg = (pick: (g: (typeof games)[number]) => number) =>
    (games.reduce((s, g) => s + pick(g), 0) / games.length).toFixed(1);
  console.log(
    `\n=== ${label} ===\n` +
      `ENDED BEFORE THE LIMIT: ${games.filter((g) => g.endedEarly).length}/${games.length}` +
      ` | wins orc ${games.filter((g) => g.winner === 0).length} / human ${games.filter((g) => g.winner === 1).length}\n` +
      `changes of hands ${avg((g) => g.changes)} | razed ${avg((g) => g.razed)} | ` +
      `cities left ${avg((g) => g.onMap)}\n` +
      `pop ${avg((g) => g.population[0])} v ${avg((g) => g.population[1])} | ` +
      `gap ${avg((g) => g.gap)} | end ${avg((g) => g.cities[0])} v ${avg((g) => g.cities[1])}`,
  );
  RUIN.turns = 15;
}

describe('ruined cities', () => {
  const T = SEED_COUNT * 60_000;
  it('no ruin at all', () => arm('RUIN 0 (as before)', 0), T);
  it('ten turns', () => arm('RUIN 10', 10), T);
  it('fifteen, as built', () => arm('RUIN 15', 15), T);
  it('thirty', () => arm('RUIN 30', 30), T);
});
