import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { BUILDINGS } from '../src/model/buildings';
import type { GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { playerCities, playerUnits } from '../src/sim/gamestate';
import { HELD_OUT_BASES, TUNED_BASES, playGame, seedSet } from './sweep';

/**
 * What the two sides research *into*, and what they end up standing behind.
 *
 * Section 82 found the Horde ahead at turn 75 and behind from turn 100, with
 * research volume level -- 24.1 advances against 23.4 -- and left the question
 * of composition open.
 *
 * There is a specific thing to check. The two building rosters are mirrored
 * item for item, at matching prices, in every respect **except defence**:
 *
 * | | cost | defence |
 * |---|---|---|
 * | Walls (human) | 60 | **x2**, falls to siege |
 * | Broken Catapult (orc) | 60 | **x1.35**, survives siege, sends the garrison out |
 *
 * Section 24 priced that difference and then discounted it, on the grounds that
 * "neither this nor a wall is ever actually built in a played-out game, so
 * those numbers were theory". That was true when it was written. Whether it is
 * still true is exactly the sort of claim section 55 says to re-measure rather
 * than inherit, and a rollback beginning at turn 100 is the right shape for
 * defences going up.
 */

declare const process: { env: Record<string, string | undefined> };

const OUT = 'sweep-results';
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 18);
const CHECK = [75, 100, 150, 200, 250];

interface Snap {
  cities: number;
  advances: number;
  units: number;
  attack: number;
  defence: number;
  siege: number;
  /** Buildings standing, by id. */
  buildings: Map<string, number>;
  samples: number;
}

const blank = (): Snap => ({
  cities: 0, advances: 0, units: 0, attack: 0, defence: 0, siege: 0,
  buildings: new Map(), samples: 0,
});

function sample(state: GameState, p: number, into: Snap): void {
  const cities = playerCities(state, p);
  const units = playerUnits(state, p);
  into.cities += cities.length;
  into.advances += state.players[p].techs.length;
  into.units += units.length;
  for (const u of units) {
    const t = unitType(u.type);
    into.attack += t.attack;
    into.defence += t.defense;
    if (t.siegeBonus > 1) into.siege += 1;
  }
  for (const c of cities) {
    for (const b of c.buildings) into.buildings.set(b, (into.buildings.get(b) ?? 0) + 1);
  }
  into.samples += 1;
}

function measure(seeds: number[]) {
  const at = new Map<number, [Snap, Snap]>();
  for (const t of CHECK) at.set(t, [blank(), blank()]);
  const end: [Snap, Snap] = [blank(), blank()];

  for (const seed of seeds) {
    const done = new Set<number>();
    let last: GameState | null = null;
    playGame(seed, undefined, (state) => {
      last = state;
      for (const t of CHECK) {
        if (state.turn >= t && !done.has(t)) {
          done.add(t);
          const pair = at.get(t)!;
          sample(state, 0, pair[0]);
          sample(state, 1, pair[1]);
        }
      }
    });
    if (last) {
      sample(last, 0, end[0]);
      sample(last, 1, end[1]);
    }
  }
  return { at, end, games: seeds.length };
}

function row(name: string, a: string, b: string): string {
  return `  ${name.padEnd(28)}${a.padStart(11)}${b.padStart(11)}`;
}

function report(label: string, m: ReturnType<typeof measure>): string {
  const avg = (s: Snap, pick: (s: Snap) => number) => (s.samples ? (pick(s) / s.samples).toFixed(2) : '-');
  const out: string[] = [`${label} (${m.games} games)`, row('', 'orc', 'human')];

  for (const t of CHECK) {
    const [o, h] = m.at.get(t)!;
    out.push(`  --- turn ${t} ---`);
    out.push(row('cities', avg(o, (s) => s.cities), avg(h, (s) => s.cities)));
    out.push(row('advances', avg(o, (s) => s.advances), avg(h, (s) => s.advances)));
    out.push(row('units', avg(o, (s) => s.units), avg(h, (s) => s.units)));
    out.push(row('paper attack', avg(o, (s) => s.attack), avg(h, (s) => s.attack)));
    out.push(row('paper defence', avg(o, (s) => s.defence), avg(h, (s) => s.defence)));
    out.push(row('siege units', avg(o, (s) => s.siege), avg(h, (s) => s.siege)));
    // The one that matters: is anybody actually behind a wall by now.
    const def = (s: Snap) =>
      s.samples
        ? (((s.buildings.get('walls') ?? 0) + (s.buildings.get('catapult') ?? 0)) / s.samples).toFixed(2)
        : '-';
    out.push(row('cities defended', def(o), def(h)));
  }

  out.push('  --- at the end, buildings standing per game ---');
  const ids = [...new Set([...m.end[0].buildings.keys(), ...m.end[1].buildings.keys()])].sort();
  for (const id of ids) {
    const name = BUILDINGS[id]?.name ?? id;
    out.push(
      row(
        name,
        m.end[0].samples ? ((m.end[0].buildings.get(id) ?? 0) / m.end[0].samples).toFixed(2) : '-',
        m.end[1].samples ? ((m.end[1].buildings.get(id) ?? 0) / m.end[1].samples).toFixed(2) : '-',
      ),
    );
  }
  return out.join('\n');
}

describe('research composition', () => {
  it(
    'asks what the two sides build, and whether anybody defends',
    () => {
      const sets = [
        seedSet('tuned', TUNED_BASES, PER_BASE),
        seedSet('held-out', HELD_OUT_BASES, PER_BASE),
      ];
      const games = sets.reduce((n, s) => n + s.seeds.length, 0);
      console.log(`Instrumenting ${games} games, about ${Math.round((games * 7) / 60)} minutes.`);

      const out: string[] = [];
      for (const set of sets) {
        const t = Date.now();
        out.push(report(set.name, measure(set.seeds)));
        console.log(`${set.name}: ${set.seeds.length} games in ${((Date.now() - t) / 60000).toFixed(1)} min`);
      }
      const text = out.join('\n\n');
      console.log('\n' + text + '\n');

      if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
      const file = join(OUT, `composition-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      writeFileSync(file, text + '\n', 'utf8');
      console.log(`Written to ${file}`);
    },
    Math.max(600_000, PER_BASE * 3 * 2 * 20_000),
  );
});
