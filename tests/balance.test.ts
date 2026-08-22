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

/**
 * Six seeds is enough to catch a faction being hopeless, but far too few to
 * read a win rate from -- four wins out of six is well inside chance. Set
 * BALANCE_SEEDS=20 when the question is actually "which side is stronger".
 */
// Declared rather than pulled in via @types/node: this is the only place the
// project touches `process`, and it is not worth a dependency for one env var.
declare const process: { env: Record<string, string | undefined> };

const SEED_COUNT = Number(process.env.BALANCE_SEEDS ?? 6);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1 + i * 7919);
/** Enough to run past the turn limit, so every game reaches a verdict. */
const HALF_TURNS = 700;

interface Outcome {
  seed: number;
  turns: number;
  winner: number | null;
  combats: number;
  /**
   * Cities that changed hands, counted by watching ownership rather than by
   * reading the log: `log()` keeps only the last 400 entries, so anything
   * counted from it over a 300-turn game is a floor and not a total.
   */
  captures: number;
  cities: [number, number];
  /** Total citizens. Weighted heavily by the score, so worth watching. */
  population: [number, number];
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

  const owners = new Map<number, number>();
  let captures = 0;
  // Counted as it happens, for the same reason captures are: `log()` keeps only
  // the last 400 entries, and a game that runs to the turn limit pushes its
  // early fighting straight out of the window. Read off the tail, a seed with
  // thirty-seven fights reports none.
  let combats = 0;
  let readLog = 0;
  const countCombat = () => {
    for (let i = readLog; i < state.log.length; i++) {
      if (state.log[i].kind === 'combat') combats++;
    }
    readLog = state.log.length;
  };
  const sweep = () => {
    for (const c of state.cities) {
      const was = owners.get(c.id);
      if (was !== undefined && was !== c.owner) captures++;
      owners.set(c.id, c.owner);
    }
  };
  sweep();
  for (let i = 0; i < HALF_TURNS && state.winner === null; i++) {
    const before = state.log.length;
    // The window slid if the log was trimmed while the turn ran; start again
    // from whatever is still there rather than from an index that has moved.
    if (before < readLog) readLog = 0;
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
    countCombat();
    sweep();
  }
  const per = (p: number) => playerUnits(state, p).map((u) => u.type);
  return {
    seed,
    turns: state.turn,
    winner: state.winner,
    combats,
    captures,
    cities: [playerCities(state, 0).length, playerCities(state, 1).length],
    population: [
      playerCities(state, 0).reduce((n, c) => n + c.size, 0),
      playerCities(state, 1).reduce((n, c) => n + c.size, 0),
    ],
    units: [playerUnits(state, 0).length, playerUnits(state, 1).length],
    techs: [state.players[0].techs.length, state.players[1].techs.length],
    ladder: [deepestGroup(per(0)), deepestGroup(per(1))],
  };
}

describe('faction balance across seeds', () => {
  // Played once in setup rather than at import time, so vitest attributes the
  // cost to the suite and the summary actually reaches the console.
  let outcomes: Outcome[] = [];
  beforeAll(
    () => {
      outcomes = SEEDS.map(play);
    },
    // Scale with the sample rather than hard-coding a number: an explicit
    // timeout here overrides vitest.config.ts entirely, so a fixed value
    // silently caps how many seeds can ever be run.
    // 60s a seed. Games got markedly longer once the AI started researching
    // to a plan and cities began changing hands ~70 times a game.
    Math.max(120_000, SEED_COUNT * 60_000),
  );

  it('reports the shape of a typical game', () => {
    const rows = outcomes.map(
      (o) =>
        `seed ${String(o.seed).padStart(9)} T${String(o.turns).padStart(4)} ` +
        `win=${o.winner === null ? '-' : o.winner} fights=${String(o.combats).padStart(4)} ` +
        `caps=${String(o.captures).padStart(2)} ` +
        `| orc c${o.cities[0]} p${o.population[0]} u${o.units[0]} t${o.techs[0]} max×${o.ladder[0]} ` +
        `| human c${o.cities[1]} p${o.population[1]} u${o.units[1]} t${o.techs[1]} max×${o.ladder[1]}`,
    );
    const avg = (pick: (o: Outcome) => number) =>
      (outcomes.reduce((s, o) => s + pick(o), 0) / outcomes.length).toFixed(1);
    console.log(
      [
        ...rows,
        `AVG  orc:   cities ${avg((o) => o.cities[0])} pop ${avg((o) => o.population[0])} ` +
          `units ${avg((o) => o.units[0])} techs ${avg((o) => o.techs[0])}`,
        `AVG  human: cities ${avg((o) => o.cities[1])} pop ${avg((o) => o.population[1])} ` +
          `units ${avg((o) => o.units[1])} techs ${avg((o) => o.techs[1])}`,
        `wins: orc ${outcomes.filter((o) => o.winner === 0).length} / human ${outcomes.filter((o) => o.winner === 1).length}`,
        `avg city captures per game: ${avg((o) => o.captures)}`,
        `reached the turn limit: ${outcomes.filter((o) => o.turns > 300).length}/${outcomes.length}`,
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
