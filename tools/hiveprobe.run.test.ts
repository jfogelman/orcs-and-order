import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createGame, playerCities } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import { runAiTurn, siteScore } from '../src/ai/ai';
import { cityYield, foodSurplus } from '../src/sim/city';
import { hivekinOf } from '../src/sim/hivekin';

/**
 * Section 125: why a Hive is three citizens where an empire city is nine.
 *
 * The garrison theory died too -- they hold their cities *better* than either
 * empire. What is left is that their cities do not grow, and the obvious
 * suspect is the ground they were put on: `emergenceSpot` scores a site by how
 * much land is near it and how far it is from everybody, and **not by what the
 * land yields**. Lots of land and nothing to eat is exactly what that would
 * pick.
 */
describe('what the hive is standing on', () => {
  it('compares the ground each side works', () => {
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
    const rows: Record<string, { size: number[]; food: number[]; yield_: number[]; site: number[] }> = {
      Horde: { size: [], food: [], yield_: [], site: [] },
      Kingdom: { size: [], food: [], yield_: [], site: [] },
      Hive: { size: [], food: [], yield_: [], site: [] },
    };
    for (const seed of seeds) {
      const state = createGame({ seed, width: 64, height: 48, barbarians: true });
      for (let i = 0; i < 300 * 4 && state.turn <= 240; i++) {
        runAiTurn(state, state.activePlayer);
        endPlayerTurn(state);
      }
      const hk = hivekinOf(state);
      for (const [label, id] of [['Horde', 0], ['Kingdom', 1], ['Hive', hk?.id]] as const) {
        if (id === undefined) continue;
        for (const c of playerCities(state, id)) {
          rows[label].size.push(c.size);
          rows[label].food.push(foodSurplus(state, c));
          rows[label].yield_.push(cityYield(state, c).food);
          rows[label].site.push(siteScore(state, c.x, c.y));
        }
      }
    }
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const out = ['side      cities  size   food made  food surplus  siteScore of the ground'];
    for (const [label, r] of Object.entries(rows)) {
      out.push(
        `${label.padEnd(9)} ${String(r.size.length).padEnd(7)} ${avg(r.size).toFixed(1).padEnd(6)} ` +
          `${avg(r.yield_).toFixed(1).padEnd(10)} ${avg(r.food).toFixed(2).padEnd(13)} ${avg(r.site).toFixed(0)}`,
      );
    }
    writeFileSync('hiveprobe.txt', out.join('\n'), 'utf8');
  }, 1_800_000);
});
