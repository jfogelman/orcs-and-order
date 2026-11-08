import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { endingFor, endingWorks, workStanding } from '../src/sim/endings';
import { TECHS } from '../src/model/techs';
import type { FactionId, GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 154 item 2: do games reach an ending, and what stops them?
 *
 * The item asks whether an unreached ending is **a price problem** (the works
 * cost 600 to 1000 shields) or **a road problem** (the advance that opens them
 * sits too deep), and says to measure before building anything. The two are
 * cleanly separable:
 *
 * - **road**: the side never learns the advance that unlocks its works;
 * - **price**: it learns it and never finishes the works anyway.
 *
 * Also asks the prior question the item took for granted. *"Three quarters of
 * games end on the turn limit"* was section 3's figure, from a two-empire game
 * with one ending in it. Measured over eighteen games with five of each, it is
 * **two**. The endings arrived and closed it, and nobody had gone back to look.
 *
 * Kept rather than thrown away because it needs no instrumentation -- it reads
 * the advance off the tech table and the works off `endingWorks`, so it stays
 * right if an ending is ever re-rooted. `npm run endingsprobe`.
 */

/** The advance that opens this faction's works, read off the tech table. */
function openingAdvance(faction: FactionId): string | null {
  const kind = endingFor(faction);
  if (!kind) return null;
  const works = endingWorks(kind).map((w) => w.id);
  const t = TECHS.find((x) => x.buildings.some((b) => works.includes(b)));
  return t?.id ?? null;
}

describe('endings', () => {
  it('asks whether the road or the price stops them', () => {
    control();
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'tuned';
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, 3).seeds;

    let games = 0;
    const howItEnded: Record<string, number> = {};
    const reachedRoad: Record<string, number> = {};
    const builtAll: Record<string, number> = {};
    const worksHeld: Record<string, number[]> = {};
    const seats: Record<string, number> = {};

    for (const seed of seeds) {
      let last: GameState | null = null;
      playGame(seed, undefined, (s: GameState) => {
        last = s;
      });
      const end = last as GameState | null;
      if (!end) continue;
      games++;

      const win = end.winner ?? null;
      const by = end.victory ?? null;
      const who = win === null ? null : end.players[win]?.faction;
      const label =
        win === null ? 'nobody — the clock ran out' : `${who} by ${by ?? 'conquest'}`;
      howItEnded[label] = (howItEnded[label] ?? 0) + 1;

      for (const p of end.players) {
        if (p.barbarian) continue;
        seats[p.faction] = (seats[p.faction] ?? 0) + 1;
        const advance = openingAdvance(p.faction);
        if (advance && p.techs.includes(advance)) {
          reachedRoad[p.faction] = (reachedRoad[p.faction] ?? 0) + 1;
        }
        const kind = endingFor(p.faction);
        const works = kind ? endingWorks(kind) : [];
        const up = works.filter((w) => workStanding(end, p.id, w.id)).length;
        (worksHeld[p.faction] ??= []).push(up);
        if (works.length > 0 && up === works.length) {
          builtAll[p.faction] = (builtAll[p.faction] ?? 0) + 1;
        }
      }
    }

    const mean = (xs: number[] = []) =>
      xs.length === 0 ? 0 : xs.reduce((t, n) => t + n, 0) / xs.length;
    const sides = Object.keys(seats).sort();

    const report = [
      `# Why do games end on the clock? ${games} games (${which} seeds)`,
      '',
      '## how each game actually ended',
      ...Object.entries(howItEnded)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `- ${k}: **${n}** of ${games}`),
      '',
      '## road against price, by side',
      '',
      '`road` is learning the advance that opens the works at all. `price` is',
      'finishing them once it is learned. A side that never learns it is',
      'stopped by the road; one that learns it and builds none is stopped by',
      'the price.',
      '',
      '| side | games | learned the advance | built every work | works standing |',
      '|---|---|---|---|---|',
      ...sides.map((f) => {
        const n = seats[f] ?? 0;
        const kind = endingFor(f as FactionId);
        const total = kind ? endingWorks(kind).length : 0;
        return (
          `| ${f} | ${n} | **${reachedRoad[f] ?? 0}/${n}** | ` +
          `**${builtAll[f] ?? 0}/${n}** | ${mean(worksHeld[f]).toFixed(1)} of ${total} |`
        );
      }),
    ].join('\n');

    writeFileSync(
      held ? 'tools/out/endings-held-out.md' : 'tools/out/endings.md',
      `${report}\n`,
      'utf8',
    );
    console.log(report);
  }, 1_800_000);
});
