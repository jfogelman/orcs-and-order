import { beforeAll, describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * Balance regression.
 *
 * Two identical AIs, one per faction, played out over a spread of seeds. The
 * assertions are deliberately loose — this is here to catch a change that
 * makes one side hopeless, not to pin down an exact win rate.
 */

const SEEDS = [1, 42, 777, 12345, 20250813, 31337];
/** Enough to run past the turn limit, so every game reaches a verdict. */
const HALF_TURNS = 700;

interface Outcome {
  seed: number;
  turns: number;
  winner: number | null;
  combats: number;
  cities: [number, number];
  units: [number, number];
  techs: [number, number];
  ladder: [number, number];
}

function deepestGroup(types: string[]): number {
  return types.reduce((max, t) => Math.max(max, Number(t.split('_x')[1] ?? 1)), 1);
}

function play(seed: number): Outcome {
  const state = createGame({ seed });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);
  for (let i = 0; i < HALF_TURNS && state.winner === null; i++) {
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
  }
  const per = (p: number) => playerUnits(state, p).map((u) => u.type);
  return {
    seed,
    turns: state.turn,
    winner: state.winner,
    combats: state.log.filter((e) => e.kind === 'combat').length,
    cities: [playerCities(state, 0).length, playerCities(state, 1).length],
    units: [playerUnits(state, 0).length, playerUnits(state, 1).length],
    techs: [state.players[0].techs.length, state.players[1].techs.length],
    ladder: [deepestGroup(per(0)), deepestGroup(per(1))],
  };
}

describe('faction balance across seeds', () => {
  // Played once in setup rather than at import time, so vitest attributes the
  // cost to the suite and the summary actually reaches the console.
  let outcomes: Outcome[] = [];
  beforeAll(() => {
    outcomes = SEEDS.map(play);
  }, 300_000);

  it('reports the shape of a typical game', () => {
    const rows = outcomes.map(
      (o) =>
        `seed ${String(o.seed).padStart(9)} T${String(o.turns).padStart(4)} ` +
        `win=${o.winner === null ? '-' : o.winner} fights=${String(o.combats).padStart(4)} ` +
        `| orc c${o.cities[0]} u${o.units[0]} t${o.techs[0]} max×${o.ladder[0]} ` +
        `| human c${o.cities[1]} u${o.units[1]} t${o.techs[1]} max×${o.ladder[1]}`,
    );
    const avg = (pick: (o: Outcome) => number) =>
      (outcomes.reduce((s, o) => s + pick(o), 0) / outcomes.length).toFixed(1);
    console.log(
      [
        ...rows,
        `AVG  orc: cities ${avg((o) => o.cities[0])} techs ${avg((o) => o.techs[0])}`,
        `AVG  human: cities ${avg((o) => o.cities[1])} techs ${avg((o) => o.techs[1])}`,
        `decisive: ${outcomes.filter((o) => o.winner !== null).length}/${outcomes.length}`,
      ].join('\n'),
    );
    expect(outcomes.length).toBe(SEEDS.length);
  });

  it('always brings the two sides into contact', () => {
    for (const o of outcomes) {
      expect(o.combats, `seed ${o.seed} saw no fighting at all`).toBeGreaterThan(0);
    }
  });

  it('leaves neither faction hopeless on research', () => {
    const orc = outcomes.reduce((s, o) => s + o.techs[0], 0) / outcomes.length;
    const human = outcomes.reduce((s, o) => s + o.techs[1], 0) / outcomes.length;
    expect(orc).toBeGreaterThan(human * 0.45);
    expect(human).toBeGreaterThan(orc * 0.45);
  });

  it('gets somebody meaningfully up the counting ladder', () => {
    const best = Math.max(...outcomes.flatMap((o) => o.ladder));
    expect(best, 'nobody ever fielded a group larger than a pair').toBeGreaterThanOrEqual(3);
  });
});
