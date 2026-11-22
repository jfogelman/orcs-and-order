import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 186: **a settler never built, or a settler built and killed?**
 *
 * Section 185 measured what separates a Wandering Folk game that survives from
 * one that ends: towns founded in the first forty turns after arriving --
 * survivors 3.0 and 3.1, the eliminated 1.7 and 0.9, on both seed sets. It
 * also killed the two explanations this arc had been carrying: the map is not
 * full (a side arriving on turn 38 still finds ~810 legal sites and ~150
 * within reach) and lateness alone is not fatal (the Hive arrives as late and
 * is eliminated 3 times in eighteen).
 *
 * **But `founded` is a count of towns that appeared**, and three different
 * games produce a low one:
 *
 * - the side never built the settlers;
 * - it built them and they were killed on the road;
 * - it built them and they walked about without ever founding.
 *
 * Those want opposite fixes -- a production change, a protection change, and a
 * decision change -- and nothing measured so far can tell them apart. Section
 * 185 explicitly left this open rather than guessing, because the arc has
 * twice been wrong by reasoning from a plausible mechanism.
 *
 * ## How a settler's end is classified
 *
 * By watching unit ids between half-turns, never from the log (trimmed at 400)
 * and never from a counter in the rules, so the games are the ones every other
 * probe plays and no dice move.
 *
 * - **built**: an id of a settler-type unit seen for the first time.
 * - **founded**: the id is gone, and a city of that side now stands on the
 *   tile it stood on. That is what founding does to a settler.
 * - **lost**: the id is gone and no city appeared there. Something killed it,
 *   or it was disbanded.
 * - **walking**: still alive when the window closes.
 *
 * `blamed` is a **guess and is labelled one**: the faction of the nearest
 * hostile unit within two tiles at the previous observation. A settler killed
 * by something that moved in and away inside one half-turn gets nobody, and a
 * raider camp that happened to be near a starving settler gets the credit it
 * did not earn. It is a hint about where to look, not evidence.
 *
 * `npm run settlers`, and `PROBE_SEEDS=held-out` for the other set.
 */

/** How long after arriving a side's settlers are followed. */
const WINDOW = 40;

interface Side {
  games: number;
  arrived: number[];
  built: number[];
  founded: number[];
  lost: number[];
  walking: number[];
  /** Half-turns each settler existed before founding. */
  beforeFounding: number[];
  /** Half-turns each lost settler existed before dying. */
  beforeDying: number[];
  blamed: Record<string, number>;
  /** Per game, split by whether the side was eliminated. */
  survBuilt: number[];
  elimBuilt: number[];
  survLost: number[];
  elimLost: number[];
}

const blank = (): Side => ({
  games: 0, arrived: [], built: [], founded: [], lost: [], walking: [],
  beforeFounding: [], beforeDying: [], blamed: {},
  survBuilt: [], elimBuilt: [], survLost: [], elimLost: [],
});

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

describe('settlers', () => {
  it('asks whether the towns were never built or never arrived', () => {
    control();
    const raiders = process.env.PROBE_RAIDERS === '1';
    if (raiders) NEW_GAME.barbarians = true;
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'tuned';
    const perBase = Number(process.env.PROBE_PER_BASE ?? 6);
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, perBase).seeds;

    const by: Record<string, Side> = {};
    const of = (f: string): Side => (by[f] ??= blank());
    let games = 0;

    for (const seed of seeds) {
      games += 1;
      /** Settler id -> what we know about it. */
      type Walk = { owner: number; faction: string; x: number; y: number; since: number; near: string | null };
      let walkers = new Map<number, Walk>();
      let cityTiles = new Set<string>();
      const arrived: Record<string, number> = {};
      const tally: Record<string, { arrived: number; built: number; founded: number; lost: number; walking: number }> = {};
      /** Settlers dropped because their side's window shut while they lived. */
      const shut: Record<string, number> = {};
      const row = (f: string) => (tally[f] ??= { arrived: 0, built: 0, founded: 0, lost: 0, walking: 0 });
      let end: GameState | null = null;
      let first = true;

      playGame(seed, undefined, (s: GameState) => {
        end = s;
        for (const p of s.players) {
          if (!p.barbarian && arrived[p.faction as string] === undefined) {
            arrived[p.faction as string] = s.turn;
          }
        }

        const now = new Map<number, Walk>();
        for (const u of s.units) {
          const p = s.players[u.owner];
          if (!p || p.barbarian || !unitType(u.type).settler) continue;
          const f = p.faction as string;
          const open = arrived[f] !== undefined && s.turn <= arrived[f] + WINDOW;
          const was = walkers.get(u.id);
          if (!was && !open) continue;
          // The nearest hostile within two tiles, kept for the blame guess.
          let near: string | null = null;
          for (const o of s.units) {
            if (o.owner === u.owner) continue;
            if (Math.max(Math.abs(o.x - u.x), Math.abs(o.y - u.y)) > 2) continue;
            near = (s.players[o.owner]?.barbarian ? 'raiders' : (s.players[o.owner]?.faction as string)) ?? null;
            break;
          }
          // **What it walked in with is not what it made.** Every latecomer
          // arrives with `HIVEKIN.founders` settlers -- a count, the same for
          // every faction -- and the first cut counted those as built, so a
          // side that produced *nothing at all* in forty turns read as having
          // built two. That is the difference between "they build fewer" and
          // "they build none", which are not the same finding.
          if (!was) {
            if (s.turn === arrived[f]) row(f).arrived += 1;
            else row(f).built += 1;
          }
          now.set(u.id, {
            owner: u.owner,
            faction: f,
            x: u.x,
            y: u.y,
            since: was?.since ?? s.turn,
            near,
          });
        }

        // **The window closes on the following as well as on the building.**
        // The first cut kept a settler under observation until it died, which
        // put a death on turn 202 inside a figure headed "the first forty
        // turns" -- so a side whose settlers live long read as a side that
        // loses them late. One still walking when its window shuts is counted
        // as walking, because that is what it was doing.
        for (const [id, w] of [...walkers]) {
          if (now.has(id)) continue;
          const stillOpen = arrived[w.faction] !== undefined && s.turn <= arrived[w.faction] + WINDOW;
          if (!stillOpen && s.units.some((u) => u.id === id)) {
            shut[w.faction] = (shut[w.faction] ?? 0) + 1;
            walkers.delete(id);
          }
        }
        if (!first) {
          const here = new Set(s.cities.map((c) => `${c.owner}:${c.x},${c.y}`));
          for (const [id, was] of walkers) {
            if (now.has(id)) continue;
            const f = was.faction;
            // Founding is what a settler's disappearance usually means: the
            // city standing on the tile it stood on is the same event.
            if (here.has(`${was.owner}:${was.x},${was.y}`) && !cityTiles.has(`${was.x},${was.y}`)) {
              row(f).founded += 1;
              of(f).beforeFounding.push(s.turn - was.since);
            } else {
              row(f).lost += 1;
              of(f).beforeDying.push(s.turn - was.since);
              const who = was.near ?? 'nobody in sight';
              of(f).blamed[who] = (of(f).blamed[who] ?? 0) + 1;
            }
          }
        }
        cityTiles = new Set(s.cities.map((c) => `${c.x},${c.y}`));
        walkers = now;
        first = false;
      });

      for (const [id, w] of walkers) {
        void id;
        row(w.faction).walking += 1;
      }
      for (const [f, n] of Object.entries(shut)) row(f).walking += n;
      const last = end as GameState | null;
      for (const [f, t] of Object.entries(tally)) {
        const side = of(f);
        side.games += 1;
        side.arrived.push(t.arrived);
        side.built.push(t.built);
        side.founded.push(t.founded);
        side.lost.push(t.lost);
        side.walking.push(t.walking);
        const p = last?.players.find((q) => (q.faction as string) === f);
        const gone = !!last && !!p && last.cities.filter((c) => c.owner === p.id).length === 0;
        (gone ? side.elimBuilt : side.survBuilt).push(t.built);
        (gone ? side.elimLost : side.survLost).push(t.lost);
      }
    }

    const sides = Object.keys(by);
    const out: string[] = [];
    out.push(`# settlers in the first ${WINDOW} turns, ${which} (${games} games, ${perBase} a base)${raiders ? ', raiders on' : ''}`);
    out.push('');
    out.push(
      'Section 185 found that what separates a surviving latecomer from an',
      'eliminated one is towns founded in its first forty turns, with the map not',
      'full and lateness not fatal on its own. A low count of towns has three very',
      'different causes -- never built, built and killed, built and still walking --',
      'and they want opposite fixes. This separates them.',
      '',
      '`arrived with` is settlers standing there at the first look -- every',
      'latecomer is given `HIVEKIN.founders` of them, the same count for every',
      'faction -- and `built` is what the side produced after that. They are kept',
      'apart because "builds fewer" and "builds none" are different findings.',
      '',
      'Settlers are followed by unit id between half-turns. A settler that vanishes',
      'leaving a city of its own side on the tile it stood on **founded**; one that',
      'vanishes otherwise was **lost**. `blamed` is a guess and is labelled one: the',
      'nearest hostile within two tiles at the previous look.',
      '',
    );

    out.push('## per game, in the window');
    out.push('');
    out.push('| side | games | arrived with | built | founded | lost | still walking | turns before founding | turns before dying |');
    out.push('|---|---|---|---|---|---|---|---|---|');
    for (const f of sides) {
      const s = by[f];
      out.push(
        `| ${f} | ${s.games} | ${mean(s.arrived).toFixed(1)} | **${mean(s.built).toFixed(1)}** | **${mean(s.founded).toFixed(1)}** | ` +
          `**${mean(s.lost).toFixed(1)}** | ${mean(s.walking).toFixed(1)} | ` +
          `${mean(s.beforeFounding).toFixed(0)} | ${mean(s.beforeDying).toFixed(0)} |`,
      );
    }
    out.push('');

    out.push('## built and lost, split by whether the side survived');
    out.push('');
    out.push('Mean / median. Small n; these are numbers, not tested differences.');
    out.push('');
    out.push('| side | survived n | built | lost | eliminated n | built | lost |');
    out.push('|---|---|---|---|---|---|---|');
    for (const f of sides) {
      const s = by[f];
      const cell = (xs: number[]) => `${mean(xs).toFixed(1)} / ${median(xs).toFixed(1)}`;
      out.push(
        `| ${f} | ${s.survBuilt.length} | ${cell(s.survBuilt)} | ${cell(s.survLost)} | ` +
          `${s.elimBuilt.length} | ${cell(s.elimBuilt)} | ${cell(s.elimLost)} |`,
      );
    }
    out.push('');

    out.push('## who was standing nearby when one was lost (a guess, not evidence)');
    out.push('');
    const blamers = [...new Set(sides.flatMap((f) => Object.keys(by[f].blamed)))].sort();
    out.push(`| side | ${blamers.join(' | ')} |`);
    out.push(`|---|${blamers.map(() => '---').join('|')}|`);
    for (const f of sides) {
      out.push(`| ${f} | ${blamers.map((b) => by[f].blamed[b] ?? 0).join(' | ')} |`);
    }
    out.push('');

    const report = out.join('\n');
    writeFileSync(`tools/out/settlers${held ? '-held-out' : ''}${raiders ? '-raiders' : ''}.md`, `${report}\n`, 'utf8');
    console.log(report);
  });
});
