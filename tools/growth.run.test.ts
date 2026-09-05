import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import {
  FOOD_PER_CITIZEN,
  cityYield,
  contentLimit,
  foodToGrow,
  isRuined,
} from '../src/sim/city';
import { playerCities } from '../src/sim/gamestate';
import { HELD_OUT_BASES, TUNED_BASES, playGame, seedSet } from './sweep';

/**
 * Why Horde cities stay small.
 *
 * Section 82: the Horde founds more cities and holds fewer. Section 84: it
 * converts level research into half the army and half the buildings, which
 * makes it a production gap, and production comes from citizens -- 31.8 against
 * 47.4.
 *
 * A city grows when banked food passes `foodToGrow`, and there are exactly
 * three things that stop it:
 *
 * - **No surplus.** `yields.food - size * FOOD_PER_CITIZEN` at or below zero,
 *   which is about the ground it is standing on and how many mouths there are.
 * - **Disorder.** `size > contentLimit`, and a rioting city banks nothing.
 * - **Ruin.** A city taken or sacked bankes nothing while the rubble is being
 *   cleared, which is section 19's resettlement.
 *
 * All three are questions about the board, so all three can be counted from
 * outside every half-turn without touching the rules. Whichever one the Horde
 * spends its time in is the answer.
 */

declare const process: { env: Record<string, string | undefined> };

const OUT = 'sweep-results';
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 18);
const CHECK = [50, 75, 100, 150, 200, 250];

interface Side {
  cityTurns: number;
  size: number;
  /** Food the tiles actually produce, and what the citizens eat. */
  foodYield: number;
  eaten: number;
  surplus: number;
  /** City-turns where nothing could be banked, by reason. */
  noSurplus: number;
  rioting: number;
  ruined: number;
  /** Growing normally: surplus, not rioting, not ruined. */
  growing: number;
  /** How close to rioting: size against the limit. */
  headroom: number;
  atLimit: number;
  /** Turns of banked food still needed at the current rate, where it grows. */
  turnsToGrow: number;
  turnsToGrowSamples: number;
}

const blank = (): Side => ({
  cityTurns: 0, size: 0, foodYield: 0, eaten: 0, surplus: 0, noSurplus: 0,
  rioting: 0, ruined: 0, growing: 0, headroom: 0, atLimit: 0,
  turnsToGrow: 0, turnsToGrowSamples: 0,
});

function look(state: GameState, city: City, into: Side): void {
  into.cityTurns += 1;
  into.size += city.size;
  const food = cityYield(state, city).food;
  const eats = city.size * FOOD_PER_CITIZEN;
  const raw = food - eats;
  into.foodYield += food;
  into.eaten += eats;
  into.surplus += raw;

  const limit = contentLimit(state, city);
  into.headroom += limit - city.size;
  if (city.size >= limit) into.atLimit += 1;

  const rioting = city.disorder;
  const ruined = isRuined(state, city);
  if (rioting) into.rioting += 1;
  if (ruined) into.ruined += 1;
  if (raw <= 0) into.noSurplus += 1;

  if (raw > 0 && !rioting && !ruined) {
    into.growing += 1;
    into.turnsToGrow += (foodToGrow(city.size) - city.food) / raw;
    into.turnsToGrowSamples += 1;
  }
}

function measure(seeds: number[]) {
  const at = new Map<number, [Side, Side]>();
  for (const t of CHECK) at.set(t, [blank(), blank()]);
  const all: [Side, Side] = [blank(), blank()];
  /** Sizes at the moment a city changes hands, which resets its growth. */
  const captured: [number[], number[]] = [[], []];

  for (const seed of seeds) {
    const done = new Set<number>();
    const owner = new Map<number, number>();
    playGame(seed, undefined, (state) => {
      for (const p of [0, 1] as const) {
        for (const c of playerCities(state, p)) {
          look(state, c, all[p]);
        }
      }
      for (const t of CHECK) {
        if (state.turn >= t && !done.has(t)) {
          done.add(t);
          const pair = at.get(t)!;
          for (const p of [0, 1] as const) for (const c of playerCities(state, p)) look(state, c, pair[p]);
        }
      }
      for (const c of state.cities) {
        const was = owner.get(c.id);
        // Recorded against whoever just lost it: this is growth they no longer
        // have, and the new owner's clock starts from a smaller number.
        if (was !== undefined && was !== c.owner) captured[was].push(c.size);
        owner.set(c.id, c.owner);
      }
    });
  }
  return { at, all, captured, games: seeds.length };
}

const row = (name: string, a: string, b: string) => `  ${name.padEnd(30)}${a.padStart(10)}${b.padStart(10)}`;
const per = (s: Side, pick: (s: Side) => number) => (s.cityTurns ? (pick(s) / s.cityTurns).toFixed(2) : '-');
const pct = (s: Side, pick: (s: Side) => number) =>
  s.cityTurns ? ((pick(s) / s.cityTurns) * 100).toFixed(1) + '%' : '-';

function report(label: string, m: ReturnType<typeof measure>): string {
  const out: string[] = [`${label} (${m.games} games)`, row('', 'orc', 'human')];
  const [O, H] = m.all;
  out.push('  --- over every city-turn of every game ---');
  out.push(row('mean city size', per(O, (s) => s.size), per(H, (s) => s.size)));
  out.push(row('food grown', per(O, (s) => s.foodYield), per(H, (s) => s.foodYield)));
  out.push(row('food eaten', per(O, (s) => s.eaten), per(H, (s) => s.eaten)));
  out.push(row('food surplus', per(O, (s) => s.surplus), per(H, (s) => s.surplus)));
  out.push(row('headroom to riot', per(O, (s) => s.headroom), per(H, (s) => s.headroom)));
  out.push('  why a city banked nothing:');
  out.push(row('  no surplus', pct(O, (s) => s.noSurplus), pct(H, (s) => s.noSurplus)));
  out.push(row('  rioting', pct(O, (s) => s.rioting), pct(H, (s) => s.rioting)));
  out.push(row('  still smoking', pct(O, (s) => s.ruined), pct(H, (s) => s.ruined)));
  out.push(row('  at the content limit', pct(O, (s) => s.atLimit), pct(H, (s) => s.atLimit)));
  out.push(row('growing normally', pct(O, (s) => s.growing), pct(H, (s) => s.growing)));
  out.push(
    row(
      'turns to next citizen',
      O.turnsToGrowSamples ? (O.turnsToGrow / O.turnsToGrowSamples).toFixed(1) : '-',
      H.turnsToGrowSamples ? (H.turnsToGrow / H.turnsToGrowSamples).toFixed(1) : '-',
    ),
  );
  const cap = (n: number[]) => (n.length ? (n.reduce((a, b) => a + b, 0) / n.length).toFixed(2) : '-');
  out.push(row('cities lost per game', (m.captured[0].length / m.games).toFixed(2), (m.captured[1].length / m.games).toFixed(2)));
  out.push(row('  their size when lost', cap(m.captured[0]), cap(m.captured[1])));

  for (const t of CHECK) {
    const [o, h] = m.at.get(t)!;
    out.push(`  --- turn ${t} ---`);
    out.push(row('mean city size', per(o, (s) => s.size), per(h, (s) => s.size)));
    out.push(row('food surplus', per(o, (s) => s.surplus), per(h, (s) => s.surplus)));
    out.push(row('headroom to riot', per(o, (s) => s.headroom), per(h, (s) => s.headroom)));
    out.push(row('rioting', pct(o, (s) => s.rioting), pct(h, (s) => s.rioting)));
    out.push(row('still smoking', pct(o, (s) => s.ruined), pct(h, (s) => s.ruined)));
  }
  return out.join('\n');
}

describe('why cities stay small', () => {
  it(
    'counts every gate on growth, for both sides',
    () => {
      const sets = [
        seedSet('tuned', TUNED_BASES, PER_BASE),
        seedSet('held-out', HELD_OUT_BASES, PER_BASE),
      ];
      const games = sets.reduce((n, s) => n + s.seeds.length, 0);
      console.log(`Instrumenting ${games} games, about ${Math.round((games * 8) / 60)} minutes.`);

      const out: string[] = [];
      for (const set of sets) {
        const t = Date.now();
        out.push(report(set.name, measure(set.seeds)));
        console.log(`${set.name}: ${set.seeds.length} games in ${((Date.now() - t) / 60000).toFixed(1)} min`);
      }
      const text = out.join('\n\n');
      console.log('\n' + text + '\n');

      if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
      const file = join(OUT, `growth-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      writeFileSync(file, text + '\n', 'utf8');
      console.log(`Written to ${file}`);
    },
    Math.max(600_000, PER_BASE * 3 * 2 * 25_000),
  );
});
