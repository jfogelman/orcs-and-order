import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { HURT_LEVELS } from '../src/render/mapRenderer';
import { HELD_OUT_BASES, TUNED_BASES, playGame, seedSet } from './sweep';

/**
 * How often each weakened pose is actually seen.
 *
 * A weakened sheet holds two poses -- battered but upright, and down on one
 * knee. The renderer picks between them by health share: below
 * `HURT_LEVELS.hurt` for the first, below `HURT_LEVELS.dying` for the second.
 *
 * Which means the second has an arithmetic problem. The smallest share a living
 * unit can have is `1 / maxHp`, so `share < 0.1` needs `maxHp > 10`, and eight
 * of the base creatures have ten or fewer. For those the kneeling pose is
 * unreachable -- not rare, *unreachable*, on any turn of any game.
 *
 * That much is provable without playing anything. What playing settles is the
 * part that decides what to do about it: how much of the game is spent in each
 * band at all, whether the upright weakened pose is itself rare, and what a
 * different threshold would actually buy. "0.2 would double it" is worthless if
 * units are hardly ever seen hurt in the first place because they are killed
 * outright from full health.
 *
 * Counted from outside every half-turn, so an observation is a unit standing on
 * the board at the end of somebody's turn -- which is when a player looks at
 * it. A unit that drops to one hit point and dies inside the same turn is never
 * seen, and should not count as a pose that landed.
 *
 * `HURT_LEVELS` is imported from the renderer rather than restated here. The
 * whole question is about those two numbers, and a measurement holding its own
 * copy of them could answer confidently about a game that does not exist.
 */

declare const process: { env: Record<string, string | undefined> };

const OUT = 'sweep-results';
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 18);

/**
 * Thresholds worth pricing, including the one that ships.
 *
 * Not a sweep, and deliberately not: nothing is changed and no game is
 * replayed. Every candidate is scored against the same recorded observations,
 * which is cheaper and also fairer -- the arms cannot differ by anything except
 * the number, because there are no arms.
 */
const CANDIDATES = [HURT_LEVELS.dying, 0.15, 0.2, 0.25, 1 / 3];

interface Seen {
  type: string;
  maxHp: number;
  /** The worst it was ever *seen* at, which is not the worst it ever was. */
  lowest: number;
}

interface Tally {
  observations: number;
  healthy: number;
  hurt: number;
  kneeling: number;
  /** Observations in the kneeling band at each candidate threshold. */
  atThreshold: number[];
  /**
   * Every unit that ever stood on the board.
   *
   * Keyed by seed *and* id, because unit ids restart at the top of every game.
   * Keyed by id alone -- which is how this was first written -- 54 games do not
   * produce 54 populations, they produce one population of about 350 in which
   * "unit 7" is the minimum over every unit 7 in every game. Every
   * "ever weakened" figure comes out inflated and the count of units is really
   * the highest id anybody reached.
   */
  units: Map<string, Seen>;
}

function empty(): Tally {
  return {
    observations: 0,
    healthy: 0,
    hurt: 0,
    kneeling: 0,
    atThreshold: CANDIDATES.map(() => 0),
    units: new Map(),
  };
}

function observe(tally: Tally, seed: number, state: GameState): void {
  for (const u of state.units) {
    const def = unitType(u.type);
    const maxHp = Math.max(1, def.hp);
    const share = u.hp / maxHp;

    tally.observations++;
    if (share >= HURT_LEVELS.hurt) tally.healthy++;
    else if (share >= HURT_LEVELS.dying) tally.hurt++;
    else tally.kneeling++;

    CANDIDATES.forEach((t, i) => {
      if (share < t) tally.atThreshold[i]++;
    });

    const key = `${seed}:${u.id}`;
    const was = tally.units.get(key);
    if (was === undefined || share < was.lowest) {
      tally.units.set(key, { type: u.type, maxHp, lowest: share });
    }
  }
}

const pct = (n: number, of: number) => (of === 0 ? 'n/a' : `${((100 * n) / of).toFixed(2)}%`);

function report(label: string, tally: Tally): string[] {
  const lines: string[] = [];
  const obs = tally.observations;
  const units = [...tally.units.values()];
  const small = units.filter((u) => u.maxHp <= 10);
  const big = units.filter((u) => u.maxHp > 10);

  lines.push(`--- ${label} ---`);
  lines.push(`${obs} unit-turns seen, across ${units.length} units that ever stood on the board`);
  lines.push('');
  lines.push('What is on screen, per unit-turn:');
  lines.push(`  healthy              ${pct(tally.healthy, obs)}`);
  lines.push(`  weakened, upright    ${pct(tally.hurt, obs)}`);
  lines.push(`  weakened, kneeling   ${pct(tally.kneeling, obs)}`);
  lines.push('');

  const everHurt = units.filter((u) => u.lowest < HURT_LEVELS.hurt);
  const everKneel = units.filter((u) => u.lowest < HURT_LEVELS.dying);
  lines.push('Units seen in each state at least once in their life:');
  lines.push(
    `  ever weakened        ${everHurt.length} of ${units.length}  (${pct(everHurt.length, units.length)})`,
  );
  lines.push(
    `  ever kneeling        ${everKneel.length} of ${units.length}  (${pct(everKneel.length, units.length)})`,
  );
  lines.push('');

  lines.push('Split by whether the kneeling pose is arithmetically reachable at all:');
  const sHurt = small.filter((u) => u.lowest < HURT_LEVELS.hurt).length;
  const sKneel = small.filter((u) => u.lowest < HURT_LEVELS.dying).length;
  const bHurt = big.filter((u) => u.lowest < HURT_LEVELS.hurt).length;
  const bKneel = big.filter((u) => u.lowest < HURT_LEVELS.dying).length;
  lines.push(`  maxHp <= 10   ${small.length} units, ${sHurt} ever weakened, ${sKneel} ever kneeling`);
  lines.push(`  maxHp >  10   ${big.length} units, ${bHurt} ever weakened, ${bKneel} ever kneeling`);
  lines.push('');

  lines.push('What each candidate threshold would put on screen:');
  CANDIDATES.forEach((t, i) => {
    const reach = units.filter((u) => u.lowest < t);
    const mark = t === HURT_LEVELS.dying ? '   <- ships today' : '';
    lines.push(
      `  dying < ${t.toFixed(3)}   ${pct(tally.atThreshold[i], obs)} of unit-turns, ` +
        `${pct(reach.length, units.length)} of units ever${mark}`,
    );
  });
  lines.push('');

  const byType = new Map<string, { n: number; hurt: number; kneel: number; maxHp: number }>();
  for (const u of units) {
    const row = byType.get(u.type) ?? { n: 0, hurt: 0, kneel: 0, maxHp: u.maxHp };
    row.n++;
    if (u.lowest < HURT_LEVELS.hurt) row.hurt++;
    if (u.lowest < HURT_LEVELS.dying) row.kneel++;
    byType.set(u.type, row);
  }
  lines.push('By creature, units that ever reached each state:');
  for (const [type, row] of [...byType].sort((a, b) => b[1].n - a[1].n).slice(0, 16)) {
    lines.push(
      `  ${type.padEnd(18)} hp ${String(row.maxHp).padStart(3)}  ${String(row.n).padStart(5)} units  ` +
        `weakened ${pct(row.hurt, row.n).padStart(7)}  kneeling ${pct(row.kneel, row.n).padStart(7)}`,
    );
  }
  return lines;
}

describe('how often each weakened pose lands', () => {
  it(
    'counts what is on screen, over two seed sets',
    () => {
      const sets = [
        seedSet('tuned', TUNED_BASES, PER_BASE),
        seedSet('held-out', HELD_OUT_BASES, PER_BASE),
      ];
      const games = sets.reduce((n, s) => n + s.seeds.length, 0);
      console.log(
        `\n${games} games at roughly 7-8s each: about ${Math.round((games * 7.5) / 60)} minutes.\n`,
      );

      const lines: string[] = [
        `HURT_LEVELS as shipped: upright below ${HURT_LEVELS.hurt}, kneeling below ${HURT_LEVELS.dying}`,
        '',
      ];
      const both = empty();

      for (const set of sets) {
        const tally = empty();
        for (const seed of set.seeds) {
          playGame(seed, undefined, (state) => {
            observe(tally, seed, state);
            observe(both, seed, state);
          });
        }
        lines.push(...report(set.name, tally), '');
      }
      lines.push(...report('both sets pooled', both));

      const text = lines.join('\n');
      console.log(text);
      if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, 'poses.txt'), `${text}\n`, 'utf8');
    },
    Math.max(600_000, PER_BASE * 3 * 2 * 25_000),
  );
});
