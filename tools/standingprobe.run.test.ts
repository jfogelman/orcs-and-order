import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { MOODS, peek, standing } from '../src/sim/diplomacy';
import { DIPLOMACY_AI } from '../src/ai/diplomacy';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 168's one open item: **what does standing actually reach?**
 *
 * Section 168 measured 213 refusals and found the standing gate fired in none
 * of them. `willTalkTo` is `standing(state, a, b) > DIPLOMACY_AI.refuses`, so
 * it opens the floor at **-30 or below** -- inside the Angered band, which
 * runs from -50 to -29. Eighteen games of six-sided war never got there.
 *
 * But that measured **refusals**, not standing. "The gate never fired" is
 * consistent with two completely different games: standing hovering near zero
 * and never souring at all, or standing souring hard between the pairs that
 * never happen to ask each other for peace. Section 168 could not tell them
 * apart and said so. This can.
 *
 * **An observer, not a counter in the rule.** `standing` is a pure read
 * through `peek`, so sampling it from `playGame`'s watch hook moves no RNG and
 * changes no game -- which is the one thing that would invalidate the answer.
 * `peek` is also what says whether a pair has *met*: it is undefined until
 * first contact, and an unmet pair reads 0 from `standing`, which would
 * otherwise pile a mountain of fake zeroes into the middle band.
 *
 * Two numbers decide whether the Angered band is mechanism or flavour:
 *
 * - **how deep any pair ever got**, which says whether -30 is reachable;
 * - **where pairs spend their time**, which says whether the ladder's lower
 *   rungs describe anything at all.
 *
 * Run with:
 *   npx vitest run --config vitest.sweep.config.ts tools/standingprobe.run.test.ts
 * and `PROBE_SEEDS=held-out` for the other set.
 */

/** The band a number falls in, by the same walk `moodOf` does. */
function bandOf(n: number): string {
  let name = MOODS[0].name as string;
  for (const band of MOODS) if (n >= band.from) name = band.name;
  return name;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** The value at a percentile of a sorted-on-demand list. */
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

describe('standing', () => {
  it('asks how far standing actually falls', () => {
    control();
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'tuned';
    const perBase = Number(process.env.PROBE_PER_BASE ?? 6);
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, perBase).seeds;

    /** Pair-turns in each band, which is where the pairs spend their lives. */
    const bandTurns: Record<string, number> = {};
    /** The worst each pair ever reached, one entry per pair per game. */
    const worstPerPair: number[] = [];
    /** And where those worsts land, which is the shape the ladder describes. */
    const worstBand: Record<string, number> = {};
    /** Pair-games that crossed the gate, and games containing one. */
    let pairsBelowGate = 0;
    let gamesWithGate = 0;
    /** How often a pair that met ever went negative at all. */
    let pairsEverNegative = 0;
    let pairGames = 0;
    let games = 0;
    let everMet = 0;
    let possiblePairs = 0;
    const byFaction: Record<string, number[]> = {};

    for (const seed of seeds) {
      games += 1;
      /** The worst seen so far for each pair key, this game. */
      const worst = new Map<string, number>();
      const seen = new Map<string, { a: string; b: string }>();
      let last: GameState | null = null;

      playGame(seed, undefined, (s: GameState) => {
        last = s;
        const live = s.players.filter((p) => !p.barbarian);
        for (let i = 0; i < live.length; i += 1) {
          for (let j = i + 1; j < live.length; j += 1) {
            const a = live[i];
            const b = live[j];
            // **Met only.** Before first contact `peek` is undefined and
            // `standing` reads 0, and counting those would drown the real
            // distribution in zeroes from pairs that have never seen a war.
            if (!peek(s, a.id, b.id)) continue;
            const n = standing(s, a.id, b.id);
            const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
            seen.set(key, { a: a.faction as string, b: b.faction as string });
            const w = worst.get(key);
            if (w === undefined || n < w) worst.set(key, n);
            bandTurns[bandOf(n)] = (bandTurns[bandOf(n)] ?? 0) + 1;
          }
        }
      });

      const end = last as GameState | null;
      if (end) {
        const live = end.players.filter((p) => !p.barbarian);
        possiblePairs += (live.length * (live.length - 1)) / 2;
      }
      everMet += seen.size;

      let gated = false;
      for (const [key, w] of worst) {
        pairGames += 1;
        worstPerPair.push(w);
        worstBand[bandOf(w)] = (worstBand[bandOf(w)] ?? 0) + 1;
        if (w < 0) pairsEverNegative += 1;
        // The gate is `> refuses`, so it opens at refuses or below.
        if (w <= DIPLOMACY_AI.refuses) {
          pairsBelowGate += 1;
          gated = true;
        }
        const names = seen.get(key);
        if (names) {
          for (const f of [names.a, names.b]) {
            byFaction[f] = byFaction[f] ?? [];
            byFaction[f].push(w);
          }
        }
      }
      if (gated) gamesWithGate += 1;
    }

    const allTurns = Object.values(bandTurns).reduce((a, b) => a + b, 0);
    const report = [
      `# standing, ${which} (${games} games, ${perBase} a base)`,
      '',
      `The gate is \`standing > ${DIPLOMACY_AI.refuses}\`, so it opens at ` +
        `**${DIPLOMACY_AI.refuses} or below**.`,
      '',
      '## did it ever reach the gate?',
      '',
      `- pairs that met: **${everMet}** of ${possiblePairs} possible`,
      `- pair-games reaching ${DIPLOMACY_AI.refuses} or below: ` +
        `**${pairsBelowGate}** of ${pairGames}`,
      `- games containing one: **${gamesWithGate}** of ${games}`,
      `- pair-games that ever went negative at all: **${pairsEverNegative}** of ${pairGames}`,
      '',
      '## how deep a pair ever got, over pair-games',
      '',
      `| n | worst | p5 | p25 | median | p75 | mean |`,
      '|---|---|---|---|---|---|---|',
      `| ${pairGames} | **${pct(worstPerPair, 0)}** | ${pct(worstPerPair, 5)} | ` +
        `${pct(worstPerPair, 25)} | **${pct(worstPerPair, 50)}** | ` +
        `${pct(worstPerPair, 75)} | ${mean(worstPerPair).toFixed(1)} |`,
      '',
      '## where the worst landed, by band',
      '',
      '| band | from | pair-games |',
      '|---|---|---|',
      ...[...MOODS]
        .slice()
        .reverse()
        .map((b) => `| ${b.name} | ${b.from} | **${worstBand[b.name] ?? 0}** |`),
      '',
      '## where pairs spend their time, by band',
      '',
      '| band | pair-turns | share |',
      '|---|---|---|',
      ...[...MOODS]
        .slice()
        .reverse()
        .map((b) => {
          const n = bandTurns[b.name] ?? 0;
          const share = allTurns ? ((100 * n) / allTurns).toFixed(1) : '0.0';
          return `| ${b.name} | ${n} | **${share}%** |`;
        }),
      '',
      '## the worst a side was ever held in, by faction',
      '',
      '| side | pair-games | worst | mean worst |',
      '|---|---|---|---|',
      ...Object.keys(byFaction)
        .sort()
        .map(
          (f) =>
            `| ${f} | ${byFaction[f].length} | **${pct(byFaction[f], 0)}** | ` +
            `${mean(byFaction[f]).toFixed(1)} |`,
        ),
    ].join('\n');

    writeFileSync(
      held ? 'tools/out/standing-held-out.md' : 'tools/out/standing.md',
      `${report}\n`,
      'utf8',
    );
    console.log('\n' + report + '\n');
  }, 1_800_000);
});
