import { describe, it } from 'vitest';
import { AI_TUNING, runAiTurn } from '../src/ai/ai';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, scoreBreakdown } from '../src/sim/turn';

/**
 * THROWAWAY. Delete after reading.
 *
 * Rush-buying emptied the treasury but cost both sides score. The bankruptcy
 * path was measured and cleared -- barely a building is sold either way -- so
 * the suspect is the spending policy itself: cheapest-first with a thin
 * reserve means buying a cheap unit every single turn and never letting a
 * building finish. A six-seed probe showed the Horde ending with 12.2
 * buildings at reserve 400 against 9.8 when it could not spend at all, and 8.3
 * at reserve 60.
 *
 * Four arms at full seed count to settle both levers at once.
 */

declare const process: { env: Record<string, string | undefined> };
const SEED_COUNT = Number(process.env.BALANCE_SEEDS ?? 18);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1 + i * 7919);

function play(seed: number) {
  const state = createGame({ seed });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);
  for (let i = 0; i < 700 && state.winner === null; i++) {
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
  return { winner: state.winner, sides: [per(0), per(1)] as const };
}

function arm(label: string, reserve: number, preferBuildings: boolean): void {
  AI_TUNING.goldReserve = reserve;
  AI_TUNING.preferBuildings = preferBuildings;
  const games = SEEDS.map(play);
  const avg = (pick: (g: (typeof games)[number]) => number) =>
    (games.reduce((s, g) => s + pick(g), 0) / games.length).toFixed(1);
  const orcWins = games.filter((g) => g.winner === 0).length;
  console.log(
    `\n=== ${label} ===\n` +
      `wins: orc ${orcWins} / human ${games.filter((g) => g.winner === 1).length}\n` +
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
  AI_TUNING.goldReserve = 60;
  AI_TUNING.preferBuildings = false;
}

describe('rush-buy spending policy', () => {
  const T = SEED_COUNT * 60_000;
  it('never spends', () => arm('OFF', Number.MAX_SAFE_INTEGER, false), T);
  it('thin reserve, cheapest first', () => arm('r60 cheapest', 60, false), T);
  it('fat reserve, cheapest first', () => arm('r400 cheapest', 400, false), T);
  it('fat reserve, buildings first', () => arm('r400 buildings', 400, true), T);
});
