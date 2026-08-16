import { describe, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { BUILDINGS } from '../src/model/buildings';
import { SUPPLY } from '../src/sim/city';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, scoreBreakdown } from '../src/sim/turn';

/**
 * THROWAWAY. Delete after reading.
 *
 * Supply drawn from the capital plus built outposts, rather than from every
 * city. The point of the redesign is that the base network no longer scales
 * with empire size -- everyone has exactly one capital -- so this is the first
 * lever tried that is neither per-city nor defensive.
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
  for (const c of state.cities) owners.set(c.id, c.owner);
  for (let i = 0; i < 700 && state.winner === null; i++) {
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
    for (const c of state.cities) {
      const prev = owners.get(c.id);
      if (prev !== undefined && prev !== c.owner) changes++;
      owners.set(c.id, c.owner);
    }
  }
  const per = (p: number) => {
    const cities = playerCities(state, p);
    return {
      score: scoreBreakdown(state, p).total,
      cities: cities.length,
      population: cities.reduce((n, c) => n + c.size, 0),
      buildings: cities.reduce((n, c) => n + c.buildings.length, 0),
      units: playerUnits(state, p).length,
      outposts: cities.filter((c) => c.buildings.some((b) => BUILDINGS[b]?.suppliesArmy)).length,
    };
  };
  return { winner: state.winner, turns: state.turn, changes, sides: [per(0), per(1)] as const };
}

function arm(label: string, range: number, penalty: number): void {
  SUPPLY.range = range;
  SUPPLY.attackPenalty = penalty;
  const games = SEEDS.map(play);
  const avg = (pick: (g: (typeof games)[number]) => number) =>
    (games.reduce((s, g) => s + pick(g), 0) / games.length).toFixed(1);
  console.log(
    `\n=== ${label} === (range ${range}, penalty ${penalty})\n` +
      `wins: orc ${games.filter((g) => g.winner === 0).length} / human ${games.filter((g) => g.winner === 1).length}\n` +
      `changes of hands ${avg((g) => g.changes)} | decided before the limit ${games.filter((g) => g.turns <= 300).length}/${games.length}\n` +
      ['orc', 'human']
        .map(
          (n, i) =>
            `${n.padEnd(6)} score ${avg((g) => g.sides[i].score)} | cities ${avg((g) => g.sides[i].cities)} | ` +
            `pop ${avg((g) => g.sides[i].population)} | bldgs ${avg((g) => g.sides[i].buildings)} | ` +
            `units ${avg((g) => g.sides[i].units)} | outposts ${avg((g) => g.sides[i].outposts)}`,
        )
        .join('\n'),
  );
  SUPPLY.range = 4;
  SUPPLY.attackPenalty = 0.6;
}

describe('capital-based supply', () => {
  const T = SEED_COUNT * 60_000;
  it('off', () => arm('OFF', 99, 1), T);
  it('generous', () => arm('range 6, x0.75', 6, 0.75), T);
  it('as built', () => arm('range 4, x0.6', 4, 0.6), T);
  it('harsh', () => arm('range 3, x0.45', 3, 0.45), T);
});
