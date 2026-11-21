import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { MIN_CITY_SPACING } from '../src/sim/city';
import { TERRAIN } from '../src/model/terrain';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 185: **is there anywhere left to stand when a latecomer arrives?**
 *
 * Section 178's city-loss probe, re-run on today's game, says the Wandering
 * Folk are not ground down. They are **bimodal**: either they settle and
 * finish as the largest empire on the board (7.7 and 6.9 cities, the best
 * finals in the tuned set), or they never get a second town -- peak median
 * **1.0** -- and are gone, five games in thirty-six without ever holding one
 * at all. The Unbound are the same shape.
 *
 * And on both seed sets, for both of those factions, the games they are
 * eliminated in are the games they arrive **later** in: due 35 against 40,
 * and 25 against 43.
 *
 * ## Why that is not yet an answer
 *
 * **The Hive is the control that kills the easy version of it.** It arrives at
 * the same lateness -- due 45 and 39 against the Wandering Folk's 38 and 32 --
 * and is eliminated 3 times and once in eighteen, while founding *twice* as
 * many towns a game (8.9 and 12.1 against 5.6 and 6.3). So "late means dead"
 * is false as stated, and the question is what the lateness costs that the
 * Hive does not pay.
 *
 * Section 179c already closed the other easy version: a bigger arrival package
 * makes a weak latecomer larger while it lasts without saving it, agreed from
 * three directions. So this does not measure what they arrive *with*.
 *
 * ## What this measures
 *
 * **Room.** `canFoundCity` blocks a site for exactly three reasons -- water,
 * terrain nothing grows on, and being within `MIN_CITY_SPACING` of a city --
 * and nothing about borders or ownership. So "somewhere to put a town" is a
 * count anybody can take at any moment, and nobody ever has.
 *
 * At the first observation each side exists, per side:
 *
 * - `sites`: tiles a city could legally be founded on, anywhere on the map.
 * - `near`: the same, within `REACH` of one of that side's own units, which is
 *   the room it can actually walk to before somebody else takes it.
 * - `blocked`: land tiles that are legal terrain but too close to a city --
 *   the room that *was* there and has been taken, which is the half that moves
 *   as a game ages.
 *
 * Then, per side, how many towns it founded in its first `WINDOW` turns, and
 * whether it was eliminated. Measuring only: no rule reads any of this and no
 * dice are rolled, so the games are the ones every other probe plays.
 *
 * `npm run room`, and `PROBE_SEEDS=held-out` for the other set.
 */

/** How far from its own units a site counts as reachable. */
const REACH = 8;
/** How long after arriving the foundings are counted. */
const WINDOW = 40;

interface Arrival {
  faction: string;
  turn: number;
  sites: number;
  near: number;
  blocked: number;
  /** Towns held at arrival (zero for a true latecomer, more for a starter). */
  held: number;
  founded: number;
  eliminated: boolean;
  peak: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Legal founding sites, and the land that is only blocked by a neighbour. */
function roomIn(s: GameState, playerId: number): { sites: number; near: number; blocked: number } {
  const mine = s.units.filter((u) => u.owner === playerId);
  let sites = 0;
  let near = 0;
  let blocked = 0;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const def = TERRAIN[s.terrain[y * s.width + x]];
      if (def.water || def.noCity) continue;
      const tooClose = s.cities.some(
        (c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < MIN_CITY_SPACING,
      );
      if (tooClose) {
        blocked += 1;
        continue;
      }
      sites += 1;
      if (mine.some((u) => Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) <= REACH)) near += 1;
    }
  }
  return { sites, near, blocked };
}

describe('room', () => {
  it('asks whether there is anywhere left to stand when a side arrives', () => {
    control();
    const raiders = process.env.PROBE_RAIDERS === '1';
    if (raiders) NEW_GAME.barbarians = true;
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'tuned';
    const perBase = Number(process.env.PROBE_PER_BASE ?? 6);
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, perBase).seeds;

    const rows: Arrival[] = [];
    let games = 0;

    for (const seed of seeds) {
      games += 1;
      const seen: Record<string, Arrival> = {};
      const peak: Record<string, number> = {};
      let last: GameState | null = null;

      playGame(seed, undefined, (s: GameState) => {
        last = s;
        for (const p of s.players) {
          if (p.barbarian) continue;
          const f = p.faction as string;
          const held = s.cities.filter((c) => c.owner === p.id).length;
          peak[f] = Math.max(peak[f] ?? 0, held);
          if (seen[f] === undefined) {
            const room = roomIn(s, p.id);
            seen[f] = {
              faction: f,
              turn: s.turn,
              sites: room.sites,
              near: room.near,
              blocked: room.blocked,
              held,
              founded: 0,
              eliminated: false,
              peak: held,
            };
          }
          // Towns founded in the window after arriving: counted as a rise in
          // the number held, so a town taken from somebody is not a founding.
          const a = seen[f];
          if (s.turn <= a.turn + WINDOW) {
            const founded = s.cities.filter(
              (c) => c.owner === p.id && (c.foundedBy ?? c.owner) === p.id && c.foundedTurn > a.turn,
            ).length;
            a.founded = Math.max(a.founded, founded);
          }
        }
      });

      const end = last as GameState | null;
      for (const [f, a] of Object.entries(seen)) {
        a.peak = peak[f] ?? 0;
        const p = end?.players.find((q) => (q.faction as string) === f);
        a.eliminated = !!end && !!p && end.cities.filter((c) => c.owner === p.id).length === 0;
        rows.push(a);
      }
    }

    const sides = [...new Set(rows.map((r) => r.faction))];
    const out: string[] = [];
    out.push(`# room at arrival, ${which} (${games} games, ${perBase} a base)${raiders ? ', raiders on' : ''}`);
    out.push('');
    out.push(
      'Measured at the first observation each side exists. `sites` is every tile',
      '`canFoundCity` would allow -- land, not a terrain nothing grows on, and not',
      `within ${MIN_CITY_SPACING} of a city -- which is the whole rule; borders and`,
      'ownership do not block founding. `near` is the same count within',
      `${REACH} tiles of one of that side's own units, which is the room it can`,
      'reach before somebody else takes it. `blocked` is land of legal terrain that',
      'a neighbouring city rules out: the room that was there and has gone.',
      '',
      `\`founded\` counts towns the side founded within ${WINDOW} turns of arriving,`,
      'read as a rise in towns it founded itself, so a captured town is not a',
      'founding. Nothing here is read by any rule and no dice are rolled.',
      '',
    );

    out.push('## at arrival, by side');
    out.push('');
    out.push('| side | n | arrives | sites | near | blocked | founded in window | eliminated |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const f of sides) {
      const rs = rows.filter((r) => r.faction === f);
      out.push(
        `| ${f} | ${rs.length} | ${mean(rs.map((r) => r.turn)).toFixed(0)} | ` +
          `**${mean(rs.map((r) => r.sites)).toFixed(0)}** | **${mean(rs.map((r) => r.near)).toFixed(0)}** | ` +
          `${mean(rs.map((r) => r.blocked)).toFixed(0)} | ${mean(rs.map((r) => r.founded)).toFixed(1)} | ` +
          `${rs.filter((r) => r.eliminated).length} |`,
      );
    }
    out.push('');

    out.push('## the same, split by whether the side survived');
    out.push('');
    out.push('Mean / median in each cell. Small n everywhere; these are numbers, not tested differences.');
    out.push('');
    out.push('| side | survived n | arrives | sites | near | founded | eliminated n | arrives | sites | near | founded |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const f of sides) {
      const rs = rows.filter((r) => r.faction === f);
      const cell = (xs: number[], dp = 0) => `${mean(xs).toFixed(dp)} / ${median(xs).toFixed(dp)}`;
      const s = rs.filter((r) => !r.eliminated);
      const e = rs.filter((r) => r.eliminated);
      out.push(
        `| ${f} | ${s.length} | ${cell(s.map((r) => r.turn))} | ${cell(s.map((r) => r.sites))} | ` +
          `${cell(s.map((r) => r.near))} | ${cell(s.map((r) => r.founded), 1)} | ` +
          `${e.length} | ${cell(e.map((r) => r.turn))} | ${cell(e.map((r) => r.sites))} | ` +
          `${cell(e.map((r) => r.near))} | ${cell(e.map((r) => r.founded), 1)} |`,
      );
    }
    out.push('');

    out.push('## every arrival, so the spread is visible');
    out.push('');
    out.push('| side | turn | sites | near | founded | peak | end |');
    out.push('|---|---|---|---|---|---|---|');
    for (const r of rows
      .filter((r) => r.turn > 1)
      .sort((a, b) => a.faction.localeCompare(b.faction) || a.turn - b.turn)) {
      out.push(
        `| ${r.faction} | ${r.turn} | ${r.sites} | ${r.near} | ${r.founded} | ${r.peak} | ` +
          `${r.eliminated ? '**gone**' : 'survived'} |`,
      );
    }
    out.push('');

    const report = out.join('\n');
    writeFileSync(`tools/out/room${held ? '-held-out' : ''}${raiders ? '-raiders' : ''}.md`, `${report}\n`, 'utf8');
    console.log(report);
  });
});
