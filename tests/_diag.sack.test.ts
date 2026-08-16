import { describe, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { MILITIA } from '../src/sim/city';
import { SACKING } from '../src/sim/movement';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, scoreBreakdown } from '../src/sim/turn';

/**
 * THROWAWAY. Delete after reading.
 *
 * The militia sweep's control arm came in at 8-10 where the same eighteen
 * seeds had previously given 6-12. The only other thing that changed was
 * sacking: a capture now costs up to three citizens and three buildings
 * instead of one of each, scaled by who turned up.
 *
 * That was never a controlled arm, so this is one. Militia is held at its
 * chosen 0.3 throughout; only the sacking cap moves.
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
  const per = (p: number) => {
    const cities = playerCities(state, p);
    return {
      score: scoreBreakdown(state, p).total,
      cities: cities.length,
      population: cities.reduce((n, c) => n + c.size, 0),
      buildings: cities.reduce((n, c) => n + c.buildings.length, 0),
      units: playerUnits(state, p).length,
    };
  };
  return { winner: state.winner, turns: state.turn, sides: [per(0), per(1)] as const };
}

function arm(label: string, cap: number): void {
  MILITIA.perCitizen = 0.3;
  SACKING.cap = cap;
  const games = SEEDS.map(play);
  const avg = (pick: (g: (typeof games)[number]) => number) =>
    (games.reduce((s, g) => s + pick(g), 0) / games.length).toFixed(1);
  console.log(
    `\n=== ${label} === (sack cap ${cap})\n` +
      `wins: orc ${games.filter((g) => g.winner === 0).length} / human ${games.filter((g) => g.winner === 1).length}\n` +
      `decided before the limit ${games.filter((g) => g.turns <= 300).length}/${games.length}\n` +
      ['orc', 'human']
        .map(
          (n, i) =>
            `${n.padEnd(6)} score ${avg((g) => g.sides[i].score)} | cities ${avg((g) => g.sides[i].cities)} | ` +
            `pop ${avg((g) => g.sides[i].population)} | bldgs ${avg((g) => g.sides[i].buildings)} | ` +
            `units ${avg((g) => g.sides[i].units)}`,
        )
        .join('\n'),
  );
  SACKING.cap = 3;
}

describe('how hard a sacking should be', () => {
  const T = SEED_COUNT * 60_000;
  it('one citizen, one building, as it was', () => arm('cap 1', 1), T);
  it('up to two', () => arm('cap 2', 2), T);
  it('up to three, as built', () => arm('cap 3', 3), T);
  it('up to five', () => arm('cap 5', 5), T);
});
