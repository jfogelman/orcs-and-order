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

  /**
   * A band, and the reason it is a band on means rather than on wins.
   *
   * Six games is a deterministic sample, not a random one -- the same seeds
   * give the same games every run. What it is *sensitive* to is any change that
   * shifts the RNG stream, which is most changes to the simulation. So a tight
   * assertion on six win/loss results would not flake, it would simply break on
   * work that had nothing to do with balance, and get widened until it meant
   * nothing.
   *
   * Means are far steadier under that shuffling than a binary count, so the
   * bands sit on cities, population and advances. Wins are checked too, but
   * only once there are enough of them to mean anything.
   *
   * **The authoritative measurement is the sweep, not this.** Section 86 ran
   * 432 games across two seed sets to move `CALM.base`; this is the cheap guard
   * that runs on every commit and notices if a side starts collapsing.
   */
  const HOPELESS_BELOW = 0.45;

  /**
   * Enough wins to be worth asserting on.
   *
   * At eighteen, a side has to lose fifteen of eighteen to trip the band, which
   * is 0.4% under an even matchup and unmissable if something has actually
   * broken. At six it would trip on chance alone often enough to be noise, so
   * it is not asserted there -- and saying so is more honest than pretending a
   * six-game win count means something.
   */
  const WINS_NEED = 18;
  const WIN_SHARE = { min: 0.15, max: 0.85 };

  const meanOf = (pick: (o: Outcome) => number) =>
    outcomes.reduce((s, o) => s + pick(o), 0) / outcomes.length;

  /**
   * Measured on the seeds below after section 86, for whoever reads a failure.
   *
   *   6 seeds:  wins 4-2   cities 5.8/5.5  pop 40.2/39.7  advances 25.5/22.2
   *  18 seeds:  wins 10-8  cities 6.0/6.4  pop 46.2/44.7  advances 28.4/24.4
   *
   * The bands are nowhere near these numbers on purpose. They are there to
   * catch a side being crushed, not to pin a balance nobody has agreed to.
   */
  it.each([
    ['cities', (o: Outcome) => o.cities[0], (o: Outcome) => o.cities[1]],
    ['population', (o: Outcome) => o.population[0], (o: Outcome) => o.population[1]],
    ['advances', (o: Outcome) => o.techs[0], (o: Outcome) => o.techs[1]],
  ])('leaves neither faction hopeless on %s', (what, orcOf, humanOf) => {
    const orc = meanOf(orcOf);
    const human = meanOf(humanOf);
    expect(orc, `the Horde has almost no ${what} left`).toBeGreaterThan(human * HOPELESS_BELOW);
    expect(human, `the Kingdom has almost no ${what} left`).toBeGreaterThan(orc * HOPELESS_BELOW);
  });

  it('does not let either side win nearly everything', () => {
    const decided = outcomes.filter((o) => o.winner !== null);
    if (decided.length < WINS_NEED) {
      // Not asserted at this sample. `BALANCE_SEEDS=18` turns it on; the sweep
      // is what actually measures a win rate.
      expect(decided.length).toBeGreaterThan(0);
      return;
    }
    const orcShare = decided.filter((o) => o.winner === 0).length / decided.length;
    expect(orcShare, `the Horde won ${(orcShare * 100).toFixed(0)}% of ${decided.length}`)
      .toBeGreaterThan(WIN_SHARE.min);
    expect(orcShare, `the Horde won ${(orcShare * 100).toFixed(0)}% of ${decided.length}`)
      .toBeLessThan(WIN_SHARE.max);
  });

  it('gets somebody meaningfully up the counting ladder', () => {
    const best = Math.max(...outcomes.flatMap((o) => o.ladder));
    expect(best, 'nobody ever fielded a group larger than a pair').toBeGreaterThanOrEqual(3);
  });
});
