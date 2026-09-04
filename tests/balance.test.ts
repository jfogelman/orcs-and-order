import { beforeAll, describe, expect, it } from 'vitest';
import type { Outcome } from '../tools/sweep';
import { playGame } from '../tools/sweep';

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
/**
 * The game runner lives in `tools/sweep` now, so this regression and every
 * balance sweep count fights and captures the same way. It was private here,
 * and each sweep grew its own near-copy that disagreed in small ways.
 */

describe('faction balance across seeds', () => {
  // Played once in setup rather than at import time, so vitest attributes the
  // cost to the suite and the summary actually reaches the console.
  let outcomes: Outcome[] = [];
  beforeAll(
    () => {
      outcomes = SEEDS.map((seed) => playGame(seed));
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
