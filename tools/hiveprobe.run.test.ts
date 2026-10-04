import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import { runAiTurn } from '../src/ai/ai';
import { hivekinOf, HIVEKIN } from '../src/sim/hivekin';

/**
 * Section 125: what should they arrive with?
 *
 * The clock was not the lever -- seventy-eight turns earlier bought two wins in
 * a hundred and eight -- and the ground they stood on was worth a third of the
 * size gap. This asks the remaining question: an empire that has had ninety
 * turns is six cities deep by the time the Hive lands, so how many Hives should
 * the Hive land with.
 *
 * Probed before sweeping, which is now the rule rather than the exception.
 */
describe('what the hive should arrive with', () => {
  it('compares arrival packages', () => {
    const packages: Array<[number, number]> = [
      [1, 2],
      [2, 2],
      [2, 4],
      [3, 4],
      [4, 6],
    ];
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88, 99, 123];
    const out: string[] = [
      'arrive with       alive  hives  size  units  share of world  empires  biggest empire',
    ];
    const was = { founders: HIVEKIN.founders, escort: HIVEKIN.escort };
    for (const [founders, escort] of packages) {
      HIVEKIN.founders = founders;
      HIVEKIN.escort = escort;
      let alive = 0, hives = 0, size = 0, units = 0, share = 0, rivals = 0, biggest = 0, sized = 0;
      for (const seed of seeds) {
        const state = createGame({ seed, width: 64, height: 48, barbarians: true });
        for (let i = 0; i < 300 * 4 && state.turn <= 240; i++) {
          runAiTurn(state, state.activePlayer);
          endPlayerTurn(state);
        }
        const hk = hivekinOf(state);
        const rivalCities = [playerCities(state, 0).length, playerCities(state, 1).length];
        rivals += (rivalCities[0] + rivalCities[1]) / 2;
        biggest += Math.max(...rivalCities);
        if (!hk?.alive) continue;
        alive++;
        const mine = playerCities(state, hk.id);
        hives += mine.length;
        size += mine.length ? mine.reduce((a, c) => a + c.size, 0) / mine.length : 0;
        sized++;
        units += playerUnits(state, hk.id).length;
        share += state.cities.length ? mine.length / state.cities.length : 0;
      }
      // Averaged over **every** seed, with a dead Hive counting zero. Dividing
      // by survivors flattered whichever package died most: its failures simply
      // left the sample, and the row that looked best on the first run was the
      // one that lost three games of ten.
      const n = seeds.length;
      out.push(
        `${(founders + ' grub, ' + escort + ' fodder').padEnd(17)} ${String(alive + '/' + seeds.length).padEnd(6)} ` +
          `${(hives / n).toFixed(1).padEnd(6)} ${(size / Math.max(1, sized)).toFixed(1).padEnd(5)} ${(units / n).toFixed(1).padEnd(6)} ` +
          `${((share / n) * 100).toFixed(0).padStart(3)}%            ${(rivals / seeds.length).toFixed(1).padEnd(8)} ${(biggest / seeds.length).toFixed(1)}`,
      );
    }
    HIVEKIN.founders = was.founders;
    HIVEKIN.escort = was.escort;
    writeFileSync('hiveprobe.txt', out.join('\n'), 'utf8');
  }, 1_800_000);
});
