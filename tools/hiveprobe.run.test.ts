import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import { runAiTurn } from '../src/ai/ai';
import { hivekinOf, HIVEKIN } from '../src/sim/hivekin';

/**
 * Section 125: what actually happens to the third side once it comes up.
 *
 * Written when a sweep could not say why the Hivekin never win, and kept
 * because it answered in forty seconds what ninety minutes of sweeping could
 * not. It counts **mechanism** -- what they built, how far they got -- where a
 * sweep counts outcomes, and an outcome never explains itself.
 */
describe('the hive, observed', () => {
  it('reports what each arrival window is worth', () => {
    const windows: Array<[number, number]> = [
      [90, 120],
      [60, 90],
      [35, 65],
      [15, 40],
    ];
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
    const out: string[] = ['window     seeds  alive  hives  units  share of the world  vs empires'];

    const was = { from: HIVEKIN.from, until: HIVEKIN.until };
    for (const [from, until] of windows) {
      HIVEKIN.from = from;
      HIVEKIN.until = until;
      let alive = 0;
      let hives = 0;
      let units = 0;
      let share = 0;
      let rivals = 0;
      for (const seed of seeds) {
        const state = createGame({ seed, width: 64, height: 48, barbarians: true });
        for (let i = 0; i < 300 * 4 && state.turn <= 240; i++) {
          runAiTurn(state, state.activePlayer);
          endPlayerTurn(state);
        }
        const hk = hivekinOf(state);
        if (!hk?.alive) continue;
        alive++;
        const mine = playerCities(state, hk.id).length;
        hives += mine;
        units += playerUnits(state, hk.id).length;
        share += state.cities.length > 0 ? mine / state.cities.length : 0;
        rivals += (playerCities(state, 0).length + playerCities(state, 1).length) / 2;
      }
      const n = Math.max(1, alive);
      out.push(
        `${String(from + '-' + until).padEnd(10)} ${String(seeds.length).padEnd(6)} ` +
          `${String(alive).padEnd(6)} ${(hives / n).toFixed(1).padEnd(6)} ${(units / n).toFixed(1).padEnd(6)} ` +
          `${((share / n) * 100).toFixed(0).padStart(3)}%                ${(rivals / n).toFixed(1)} each`,
      );
    }
    HIVEKIN.from = was.from;
    HIVEKIN.until = was.until;
    writeFileSync('hiveprobe.txt', out.join('\n'), 'utf8');
  }, 1_800_000);
});
