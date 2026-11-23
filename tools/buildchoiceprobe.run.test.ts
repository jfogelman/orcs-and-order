import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { PRODUCTION_TRACE } from '../src/ai/ai';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 187: **what is the one town building instead?**
 *
 * Section 186 measured that in the games a latecomer is eliminated, the median
 * one builds **no settlers at all** in the forty turns after it arrives --
 * against three or four in the games it survives, on both seed sets and for
 * both of the two factions this happens to. Not fewer. None.
 *
 * It also closed every standing explanation: not the map (185: ~810 legal
 * sites still free at turn 38), not lateness alone (the Hive arrives as late
 * and lives), not the arrival package (179c), not the settler price (25
 * against 20 buys one fewer, not zero), and not protection (losses differ by
 * 0.7 while the other column goes to zero).
 *
 * So the town is building *something*, and what it is, is a question about
 * `chooseProduction` -- an ordered list of steps where the first one that
 * answers wins. Section 174 built `PRODUCTION_TRACE` for exactly this shape of
 * question and the answer it gave then was worth the instrument: three
 * factions never raised a science building because an earlier step answered
 * first, every time.
 *
 * ## What this adds to the trace
 *
 * `PRODUCTION_TRACE` counts by faction and step for a whole run. That cannot
 * answer this, because the question is about **a window** (the forty turns
 * after arriving) and about **an outcome** (whether the side was eliminated),
 * and the trace knows about neither. So the counts are differenced between
 * half-turns and attributed to each faction's own window, and the game is
 * classified afterwards.
 *
 * Counting only: the trace increments integers and rolls no dice, so these are
 * the games every other probe plays.
 *
 * `npm run builds`, and `PROBE_SEEDS=held-out` for the other set.
 */

const WINDOW = 40;

interface Game {
  faction: string;
  eliminated: boolean;
  /** Step tag -> decisions taken inside this side's window. */
  steps: Record<string, number>;
  /** Most towns held at any look inside the window. */
  towns: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

describe('builds', () => {
  it('asks which step answers while a latecomer is failing to expand', () => {
    control();
    const raiders = process.env.PROBE_RAIDERS === '1';
    if (raiders) NEW_GAME.barbarians = true;
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'tuned';
    const perBase = Number(process.env.PROBE_PER_BASE ?? 6);
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, perBase).seeds;

    const games: Game[] = [];

    for (const seed of seeds) {
      PRODUCTION_TRACE.on = true;
      PRODUCTION_TRACE.counts = {};
      let prev: Record<string, number> = {};
      const arrived: Record<string, number> = {};
      const steps: Record<string, Record<string, number>> = {};
      const towns: Record<string, number> = {};
      let end: GameState | null = null;

      playGame(seed, undefined, (s: GameState) => {
        end = s;
        for (const p of s.players) {
          if (p.barbarian) continue;
          const f = p.faction as string;
          if (arrived[f] === undefined) arrived[f] = s.turn;
          const open = s.turn <= arrived[f] + WINDOW;
          if (open) {
            const held = s.cities.filter((c) => c.owner === p.id).length;
            towns[f] = Math.max(towns[f] ?? 0, held);
          }
        }
        // Difference the global counts and give each faction's share to its
        // own window. The key is `faction|tag`, so the split is already there.
        for (const [key, n] of Object.entries(PRODUCTION_TRACE.counts)) {
          const grew = n - (prev[key] ?? 0);
          if (grew <= 0) continue;
          const [f, tag] = key.split('|');
          if (arrived[f] === undefined || s.turn > arrived[f] + WINDOW) continue;
          (steps[f] ??= {})[tag] = ((steps[f] ?? {})[tag] ?? 0) + grew;
        }
        prev = { ...PRODUCTION_TRACE.counts };
      });

      const last = end as GameState | null;
      for (const f of Object.keys(arrived)) {
        const p = last?.players.find((q) => (q.faction as string) === f);
        games.push({
          faction: f,
          eliminated: !!last && !!p && last.cities.filter((c) => c.owner === p.id).length === 0,
          steps: steps[f] ?? {},
          towns: towns[f] ?? 0,
        });
      }
      PRODUCTION_TRACE.on = false;
    }

    const sides = [...new Set(games.map((g) => g.faction))];
    const tags = [...new Set(games.flatMap((g) => Object.keys(g.steps)))].sort();

    const out: string[] = [];
    out.push(`# what the step chose, first ${WINDOW} turns after arriving, ${which} (${seeds.length} games)${raiders ? ', raiders on' : ''}`);
    out.push('');
    out.push(
      'Section 186: in the games a latecomer is eliminated, the median one builds',
      '**no settlers at all** in this window, against three or four in the games it',
      'survives. So its town is building something else, and `chooseProduction` is',
      'an ordered list where the first step that answers wins.',
      '',
      "`PRODUCTION_TRACE` (section 174) counts by faction and step. Here the counts",
      "are differenced between half-turns and attributed to each faction's own",
      'window, and the game is classified afterwards by whether that side ended',
      'holding no city. Counting only; the trace rolls no dice.',
      '',
      'Figures are **decisions per game**, and the share of that side’s decisions',
      'in brackets. A decision is one call of the chooser, so a town that is told',
      'the same thing twenty turns running counts twenty times.',
      '',
    );

    const block = (title: string, pick: (g: Game) => boolean) => {
      out.push(`## ${title}`);
      out.push('');
      out.push(`| side | games | towns held | ${tags.join(' | ')} |`);
      out.push(`|---|---|---|${tags.map(() => '---').join('|')}|`);
      for (const f of sides) {
        const gs = games.filter((g) => g.faction === f && pick(g));
        if (!gs.length) continue;
        const total = mean(gs.map((g) => Object.values(g.steps).reduce((a, b) => a + b, 0)));
        const cells = tags.map((t) => {
          const m = mean(gs.map((g) => g.steps[t] ?? 0));
          if (m === 0) return '·';
          return `${m.toFixed(1)} (${total ? Math.round((m / total) * 100) : 0}%)`;
        });
        out.push(`| ${f} | ${gs.length} | ${mean(gs.map((g) => g.towns)).toFixed(1)} | ${cells.join(' | ')} |`);
      }
      out.push('');
    };

    block('every game', () => true);
    block('games the side survived', (g) => !g.eliminated);
    block('games the side was eliminated', (g) => g.eliminated);

    const report = out.join('\n');
    writeFileSync(`tools/out/builds${held ? '-held-out' : ''}${raiders ? '-raiders' : ''}.md`, `${report}\n`, 'utf8');
    console.log(report);
  });
});
