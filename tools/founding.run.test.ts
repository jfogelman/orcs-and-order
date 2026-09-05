import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { distance } from '../src/engine/grid';
import type { GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { PERSONALITIES } from '../src/ai/ai';
import { playerCities, playerUnits } from '../src/sim/gamestate';
import { HELD_OUT_BASES, TUNED_BASES, playGame, seedSet } from './sweep';

/**
 * Why the Horde ends games with five cities and the Kingdom with eight.
 *
 * Section 61 measured the founding gap and named its visible driver -- settlers
 * are only built while `cities + settlers < targetCities`, and the Horde sits at
 * or over that line more of the time -- but explicitly left a remainder:
 *
 * > The remainder is production priority when below target, where a defender
 * > for an undefended city is chosen first, and that has not been isolated.
 *
 * This isolates it. Rule 1 of `chooseProduction` builds a defender whenever a
 * city has fewer than `garrisonPerCity` units on or beside it, and it runs
 * **before** the settler rule. So a city that is below the expansion target but
 * standing empty does not build a settler -- it builds a guard.
 *
 * Nothing here hooks the AI. The condition rule 1 tests is a question about the
 * board, so it can be asked from outside every half-turn, which keeps the
 * measurement honest about measuring today's code rather than a copy of it.
 */

declare const process: { env: Record<string, string | undefined> };

const OUT = 'sweep-results';
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 18);

interface Side {
  /** City-turns: one city, one half-turn of its owner's. */
  cityTurns: number;
  /** Of those, how many had nobody on or beside them. */
  ungarrisoned: number;
  /** Of those, how many were also below the expansion target. */
  belowTarget: number;
  /** Both at once: the settler rule was reached but pre-empted by rule 1. */
  preempted: number;
  /** Distinct settlers that ever existed. */
  settlersBuilt: number;
  /** Distinct cities that ever existed under this owner. */
  founded: number;
  lost: number;
  /** Cities held, summed over every half-turn, with the divisor beside it. */
  cityTurnsHeld: number;
  observations: number;
  finalCities: number;
}

const blank = (): Side => ({
  cityTurns: 0, ungarrisoned: 0, belowTarget: 0, preempted: 0,
  settlersBuilt: 0, founded: 0, lost: 0, cityTurnsHeld: 0, observations: 0, finalCities: 0,
});

/** Exactly what rule 1 of `chooseProduction` counts. */
function garrisonOfCity(state: GameState, owner: number, x: number, y: number): number {
  return state.units.filter(
    (u) => u.owner === owner && distance(u.x, u.y, x, y) <= 1 && !unitType(u.type).settler,
  ).length;
}

function measure(seeds: number[]): { sides: [Side, Side]; games: number; checkpoints: Map<number, [number, number]> } {
  const sides: [Side, Side] = [blank(), blank()];
  const checkpoints = new Map<number, [number, number]>();
  const CHECK = [25, 50, 75, 100, 150, 200, 250];
  for (const t of CHECK) checkpoints.set(t, [0, 0]);

  for (const seed of seeds) {
    const seenSettlers = new Set<number>();
    const seenCities = new Set<number>();
    const cityOwner = new Map<number, number>();
    const sampledAt = new Set<number>();

    const outcome = playGame(seed, undefined, (state) => {
      for (const p of [0, 1] as const) {
        const side = sides[p];
        const cities = playerCities(state, p);
        const units = playerUnits(state, p);
        const settlers = units.filter((u) => unitType(u.type).settler);
        // `targetCities` is the same 6 for both, but read it rather than assume.
        const target = PERSONALITIES[state.players[p].faction].targetCities;
        const below = cities.length + settlers.length < target;

        side.cityTurnsHeld += cities.length;
        side.observations += 1;
        for (const c of cities) {
          side.cityTurns += 1;
          const empty = garrisonOfCity(state, p, c.x, c.y) < 1;
          if (empty) side.ungarrisoned += 1;
          if (below) side.belowTarget += 1;
          if (empty && below) side.preempted += 1;
        }
        for (const u of settlers) {
          if (!seenSettlers.has(u.id)) {
            seenSettlers.add(u.id);
            side.settlersBuilt += 1;
          }
        }
      }
      for (const c of state.cities) {
        if (!seenCities.has(c.id)) {
          seenCities.add(c.id);
          sides[c.owner].founded += 1;
        }
        const was = cityOwner.get(c.id);
        if (was !== undefined && was !== c.owner) sides[was].lost += 1;
        cityOwner.set(c.id, c.owner);
      }
      for (const t of CHECK) {
        if (state.turn >= t && !sampledAt.has(t)) {
          sampledAt.add(t);
          const at = checkpoints.get(t)!;
          at[0] += playerCities(state, 0).length;
          at[1] += playerCities(state, 1).length;
        }
      }
    });
    sides[0].finalCities += outcome.cities[0];
    sides[1].finalCities += outcome.cities[1];
  }
  return { sides, games: seeds.length, checkpoints };
}

function table(label: string, m: ReturnType<typeof measure>): string {
  const { sides, games } = m;
  const per = (n: number) => (n / games).toFixed(2);
  const pct = (n: number, of: number) => (of ? ((n / of) * 100).toFixed(1) + '%' : '-');
  // Averaged over half-turns, which is what section 61's row meant.
  const held = (s: Side) => (s.observations ? (s.cityTurnsHeld / s.observations).toFixed(2) : '-');
  const row = (name: string, a: string, b: string) =>
    `  ${name.padEnd(34)}${a.padStart(10)}${b.padStart(10)}`;
  const [orc, hum] = sides;
  return [
    `${label} (${games} games)`,
    row('', 'orc', 'human'),
    row('settlers built', per(orc.settlersBuilt), per(hum.settlersBuilt)),
    row('cities founded', per(orc.founded), per(hum.founded)),
    row('cities lost', per(orc.lost), per(hum.lost)),
    row('mean cities held', held(orc), held(hum)),
    row('cities at the end', per(orc.finalCities), per(hum.finalCities)),
    row('city-turns ungarrisoned', pct(orc.ungarrisoned, orc.cityTurns), pct(hum.ungarrisoned, hum.cityTurns)),
    row('city-turns below target', pct(orc.belowTarget, orc.cityTurns), pct(hum.belowTarget, hum.cityTurns)),
    row('  ...and pre-empted by a guard', pct(orc.preempted, orc.cityTurns), pct(hum.preempted, hum.cityTurns)),
    row('  ...as a share of below-target', pct(orc.preempted, orc.belowTarget), pct(hum.preempted, hum.belowTarget)),
    '',
    '  cities held, by turn',
    ...[...m.checkpoints.entries()].map(([t, [a, b]]) =>
      row(`    turn ${t}`, (a / games).toFixed(2), (b / games).toFixed(2)),
    ),
  ].join('\n');
}

describe('the founding gap', () => {
  it(
    'isolates what section 61 left unfinished',
    () => {
      // Built the same way the sweep builds them, rather than sliced off the
      // front: the seeds of a set run base by base, so the first eighteen are
      // all one map base and a slice is a sample of one continent.
      const sets = [
        seedSet('tuned', TUNED_BASES, PER_BASE),
        seedSet('held-out', HELD_OUT_BASES, PER_BASE),
      ];
      const games = sets.reduce((n, s) => n + s.seeds.length, 0);
      console.log(`Instrumenting ${games} games, about ${Math.round((games * 7) / 60)} minutes.`);

      const out: string[] = [];
      for (const set of sets) {
        const at = Date.now();
        const m = measure(set.seeds);
        out.push(table(set.name, m));
        console.log(`${set.name}: ${set.seeds.length} games in ${((Date.now() - at) / 60000).toFixed(1)} min`);
      }
      const text = out.join('\n\n');
      console.log('\n' + text + '\n');

      if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
      const file = join(OUT, `founding-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      writeFileSync(file, text + '\n', 'utf8');
      console.log(`Written to ${file}`);
    },
    Math.max(600_000, PER_BASE * 3 * 2 * 20_000),
  );
});
