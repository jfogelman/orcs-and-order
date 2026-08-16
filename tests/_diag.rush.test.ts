import { describe, it } from 'vitest';
import { AI_TUNING, runAiTurn } from '../src/ai/ai';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, scoreBreakdown } from '../src/sim/turn';

/**
 * THROWAWAY. Delete after reading.
 *
 * Does giving gold something to buy move the balance?
 *
 * The Horde was ending games on ~476 unspent gold to the Kingdom's ~190,
 * because gold had no sink at all outside upkeep. Population is 82% of the
 * score gap, so the question is whether converting that dead pile into
 * buildings and units closes any of it.
 *
 * Two arms. The OFF arm sets the AI's reserve absurdly high so it never buys,
 * which reproduces the old behaviour exactly without needing the old code.
 */

declare const process: { env: Record<string, string | undefined> };
const SEED_COUNT = Number(process.env.BALANCE_SEEDS ?? 18);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1 + i * 7919);
const HALF_TURNS = 700;
const BASE_RESERVE = AI_TUNING.goldReserve;

function play(seed: number) {
  const state = createGame({ seed });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);
  for (let i = 0; i < HALF_TURNS && state.winner === null; i++) {
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
  }
  const per = (p: number) => ({
    score: scoreBreakdown(state, p).total,
    cities: playerCities(state, p).length,
    population: playerCities(state, p).reduce((n, c) => n + c.size, 0),
    buildings: playerCities(state, p).reduce((n, c) => n + c.buildings.length, 0),
    techs: state.players[p].techs.length,
    units: playerUnits(state, p).length,
    gold: state.players[p].gold,
  });
  return { winner: state.winner, turns: state.turn, sides: [per(0), per(1)] as const };
}

function arm(label: string, reserve: number): void {
  AI_TUNING.goldReserve = reserve;
  const games = SEEDS.map(play);
  const avg = (pick: (g: (typeof games)[number]) => number) =>
    (games.reduce((s, g) => s + pick(g), 0) / games.length).toFixed(1);
  console.log(
    `\n=== ${label} === (gold reserve ${reserve})\n` +
      `wins: orc ${games.filter((g) => g.winner === 0).length} / human ${games.filter((g) => g.winner === 1).length}\n` +
      `decisive before the limit: ${games.filter((g) => g.turns <= 300).length}/${games.length}\n` +
      ['orc', 'human']
        .map(
          (n, i) =>
            `${n.padEnd(6)} score ${avg((g) => g.sides[i].score)} | cities ${avg((g) => g.sides[i].cities)} | ` +
            `pop ${avg((g) => g.sides[i].population)} | bldgs ${avg((g) => g.sides[i].buildings)} | ` +
            `techs ${avg((g) => g.sides[i].techs)} | units ${avg((g) => g.sides[i].units)} | ` +
            `gold left ${avg((g) => g.sides[i].gold)}`,
        )
        .join('\n'),
  );
  AI_TUNING.goldReserve = BASE_RESERVE;
}

describe('rush-buying', () => {
  it(
    'off: the AI never spends, as before',
    () => arm('OFF', Number.MAX_SAFE_INTEGER),
    SEED_COUNT * 60_000,
  );
  it('on: the AI spends its surplus', () => arm('ON', BASE_RESERVE), SEED_COUNT * 60_000);
});
