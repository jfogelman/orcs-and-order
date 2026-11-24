import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { cityYield, freeSupport, productionCostIn, unitUpkeep } from '../src/sim/city';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 189: **how much production does a one-town latecomer actually have?**
 *
 * The question every closed candidate in sections 185-188 was standing in
 * front of. The arc measured that in the games a latecomer is eliminated it
 * builds no settlers at all (186), that its chooser asks for them at the usual
 * rate anyway (187), and that taking a fifth off the price changes nothing
 * about those games (188). What nobody has looked at is the number all three
 * were arguing about.
 *
 * ## Two things read out of `city.ts` before this was written
 *
 * **Switching production is not lossy.** `city.shields` accumulates and is
 * never cleared when the chosen item changes, so the garrison-then-settler
 * alternation section 187 found costs nothing by itself. *Except* that the
 * standing choices -- coin, beakers, calm -- empty the box every turn, so a
 * detour through one of those is a detour through zero.
 *
 * **Production is net of upkeep, in shields.** `city.shields +=
 * cityYield().shields - unitUpkeep()`, floored at zero, and
 * `unitUpkeep = max(0, unitsHomedHere - max(2, size))`. A unit built in a town
 * is homed to it. So a small town that builds two defenders is paying for them
 * out of the same box the settler is accumulating in -- and if upkeep reaches
 * the gross yield, **the box never fills at any price**, which is exactly the
 * shape section 188's failed price arm implies.
 *
 * That is a mechanism, not a measurement, and the difference is what this
 * file is for.
 *
 * ## What is sampled
 *
 * Every half-turn inside a side's first `WINDOW` turns, for each town it
 * holds: size, gross shields, upkeep, the net the box actually receives, how
 * many units are homed there, and the free-support allowance. Classified
 * afterwards by whether the side ended holding nothing.
 *
 * Counting only: nothing here is read by a rule and no dice move.
 *
 * `npm run shields`, and `PROBE_SEEDS=held-out` for the other set.
 */

const WINDOW = 40;

interface Sample {
  faction: string;
  eliminated: boolean;
  towns: number;
  size: number;
  gross: number;
  upkeep: number;
  net: number;
  homed: number;
  free: number;
  /** What the town was building, and how far off it was. */
  item: string;
  banked: number;
  cost: number;
}

/**
 * Per side per game: the fullest the shield box ever got, and what the town
 * finished.
 *
 * **The decisive pair.** Production is not the constraint -- the smoke put a
 * one-town latecomer at 3.6 shields a turn net, which is a 25-shield settler
 * in seven turns -- so either the box reaches 25 and the settler is chosen
 * against, or it never reaches 25 because something cheaper keeps spending it.
 * A high-water mark separates those two in one number.
 */
interface Peak {
  faction: string;
  eliminated: boolean;
  maxBanked: number;
  /** Units and buildings that completed inside the window. */
  finished: number;
  looks: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const share = (xs: boolean[]) => (xs.length ? Math.round((xs.filter(Boolean).length / xs.length) * 100) : 0);

describe('shields', () => {
  it('asks what a latecomer’s town actually earns, net of what it feeds', () => {
    control();
    const raiders = process.env.PROBE_RAIDERS === '1';
    if (raiders) NEW_GAME.barbarians = true;
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'tuned';
    const perBase = Number(process.env.PROBE_PER_BASE ?? 6);
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, perBase).seeds;

    const rows: Sample[] = [];
    const peaks: Peak[] = [];

    for (const seed of seeds) {
      const arrived: Record<string, number> = {};
      const mine: Sample[] = [];
      const peak: Record<string, Peak> = {};
      /** Last seen box per city, to spot a completion as a fall. */
      const lastBox = new Map<number, number>();
      let end: GameState | null = null;

      playGame(seed, undefined, (s: GameState) => {
        end = s;
        for (const p of s.players) {
          if (p.barbarian) continue;
          const f = p.faction as string;
          if (arrived[f] === undefined) arrived[f] = s.turn;
          if (s.turn > arrived[f] + WINDOW) continue;
          const towns = s.cities.filter((c) => c.owner === p.id);
          const pk = (peak[f] ??= {
            faction: f,
            eliminated: false,
            maxBanked: 0,
            finished: 0,
            looks: 0,
          });
          pk.looks += 1;
          for (const c of towns) {
            // A completion empties the box, so a fall of more than the net is
            // something finishing rather than upkeep eating it. Counted as a
            // fall to a lower figure while the town was building a real item.
            const was = lastBox.get(c.id);
            if (was !== undefined && c.shields < was) pk.finished += 1;
            lastBox.set(c.id, c.shields);
            pk.maxBanked = Math.max(pk.maxBanked, c.shields);
          }
          for (const c of towns) {
            const gross = cityYield(s, c).shields;
            const upkeep = unitUpkeep(s, c);
            mine.push({
              faction: f,
              eliminated: false,
              towns: towns.length,
              size: c.size,
              gross,
              upkeep,
              net: gross - upkeep,
              homed: s.units.filter((u) => u.homeCity === c.id).length,
              free: freeSupport(c),
              item: c.producing.kind,
              banked: c.shields,
              cost:
                c.producing.kind === 'unit' || c.producing.kind === 'building'
                  ? productionCostIn(s, c, c.producing)
                  : 0,
            });
          }
        }
      });

      const last = end as GameState | null;
      for (const pk of Object.values(peak)) {
        const p = last?.players.find((q) => (q.faction as string) === pk.faction);
        pk.eliminated = !!last && !!p && last.cities.filter((c) => c.owner === p.id).length === 0;
        peaks.push(pk);
      }
      for (const r of mine) {
        const p = last?.players.find((q) => (q.faction as string) === r.faction);
        r.eliminated = !!last && !!p && last.cities.filter((c) => c.owner === p.id).length === 0;
        rows.push(r);
      }
    }

    const sides = [...new Set(rows.map((r) => r.faction))];
    const out: string[] = [];
    out.push(`# what a town earns in its first ${WINDOW} turns, ${which} (${seeds.length} games)${raiders ? ', raiders on' : ''}`);
    out.push('');
    out.push(
      'One row per town per half-turn inside the window, so a side holding three',
      'towns contributes three rows a look. `gross` is `cityYield().shields`;',
      '`upkeep` is `max(0, units homed here - max(2, size))`, which is subtracted',
      'in shields before anything is banked; `net` is what the box actually',
      'receives. A unit built in a town is homed to it, so a town pays for its own',
      'garrison out of the same box its settler is accumulating in.',
      '',
      'Read `net <= 0` against the 20 to 25 a settler costs. At a net of zero the',
      'box never fills **at any price**, which is what section 188’s failed price',
      'arm would look like from here.',
      '',
    );

    const table = (title: string, pick: (r: Sample) => boolean) => {
      out.push(`## ${title}`);
      out.push('');
      out.push('| side | looks | towns | size | gross | upkeep | homed (free) | **net** | net ≤ 0 | turns for a 25-settler |');
      out.push('|---|---|---|---|---|---|---|---|---|---|');
      for (const f of sides) {
        const rs = rows.filter((r) => r.faction === f && pick(r));
        if (!rs.length) continue;
        const net = mean(rs.map((r) => r.net));
        out.push(
          `| ${f} | ${rs.length} | ${mean(rs.map((r) => r.towns)).toFixed(1)} | ` +
            `${mean(rs.map((r) => r.size)).toFixed(1)} | ${mean(rs.map((r) => r.gross)).toFixed(1)} | ` +
            `${mean(rs.map((r) => r.upkeep)).toFixed(1)} | ` +
            `${mean(rs.map((r) => r.homed)).toFixed(1)} (${mean(rs.map((r) => r.free)).toFixed(1)}) | ` +
            `**${net.toFixed(2)}** | ${share(rs.map((r) => r.net <= 0))}% | ` +
            `${net > 0 ? Math.ceil(25 / net) : '∞'} |`,
        );
      }
      out.push('');
    };

    table('every latecomer town', () => true);
    table('games the side survived', (r) => !r.eliminated);
    table('games the side was eliminated', (r) => r.eliminated);

    out.push('## the one-town case on its own');
    out.push('');
    out.push('Only looks where the side held exactly one town, which is the state');
    out.push('sections 186 and 187 describe.');
    out.push('');
    out.push('| side | looks | size | gross | upkeep | **net** | net ≤ 0 | median banked |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const f of sides) {
      const rs = rows.filter((r) => r.faction === f && r.towns === 1);
      if (!rs.length) continue;
      out.push(
        `| ${f} | ${rs.length} | ${mean(rs.map((r) => r.size)).toFixed(1)} | ` +
          `${mean(rs.map((r) => r.gross)).toFixed(1)} | ${mean(rs.map((r) => r.upkeep)).toFixed(1)} | ` +
          `**${mean(rs.map((r) => r.net)).toFixed(2)}** | ${share(rs.map((r) => r.net <= 0))}% | ` +
          `${median(rs.map((r) => r.banked)).toFixed(0)} |`,
      );
    }
    out.push('');

    out.push('## did the box ever reach a settler?');
    out.push('');
    out.push(
      'Per side per game: the fullest the shield box ever got inside the window,',
      'and how many times it fell (which is something finishing). A settler costs',
      '20, or 25 for a Wanderer. If the high-water mark sits below that while the',
      'net is three or four a turn, the box is being **spent** before it gets',
      'there -- and the thing spending it is cheaper than a settler.',
      '',
    );
    out.push('| side | games | max banked (mean / median / best) | reached 20 | reached 25 | things finished |');
    out.push('|---|---|---|---|---|---|');
    for (const f of sides) {
      for (const [label, pick] of [
        ['survived', (p: Peak) => !p.eliminated],
        ['eliminated', (p: Peak) => p.eliminated],
      ] as const) {
        const ps = peaks.filter((p) => p.faction === f && pick(p));
        if (!ps.length) continue;
        out.push(
          `| ${f}, ${label} | ${ps.length} | ` +
            `${mean(ps.map((p) => p.maxBanked)).toFixed(1)} / ${median(ps.map((p) => p.maxBanked)).toFixed(0)} / ` +
            `${Math.max(...ps.map((p) => p.maxBanked))} | ` +
            `${share(ps.map((p) => p.maxBanked >= 20))}% | ${share(ps.map((p) => p.maxBanked >= 25))}% | ` +
            `${mean(ps.map((p) => p.finished)).toFixed(1)} |`,
        );
      }
    }
    out.push('');

    const report = out.join('\n');
    writeFileSync(`tools/out/shields${held ? '-held-out' : ''}${raiders ? '-raiders' : ''}.md`, `${report}\n`, 'utf8');
    console.log(report);
  });
});
