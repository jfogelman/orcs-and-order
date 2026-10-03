import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createGame } from '../src/sim/gamestate';
import { playerCities, playerUnits } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import { runAiTurn } from '../src/ai/ai';
import { hivekinOf, HIVEKIN } from '../src/sim/hivekin';

/** Section 125: what actually happens to the third side once it comes up. */
describe('the hive, observed', () => {
  it('reports one line per seed', () => {
    const out: string[] = [
      `window ${HIVEKIN.from}-${HIVEKIN.until}, clearOf ${HIVEKIN.clearOf}, escort ${HIVEKIN.escort}`,
      '',
      'seed  drawn  arrived  firstHive  cities@200  units@200  alive  queen',
    ];
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      const state = createGame({ seed, width: 64, height: 48, barbarians: true });
      let arrived = 0;
      let firstHive = 0;
      for (let i = 0; i < 230 * 4 && state.turn <= 200; i++) {
        runAiTurn(state, state.activePlayer);
        endPlayerTurn(state);
        const hk = hivekinOf(state);
        if (hk && !arrived) arrived = state.turn;
        if (hk && !firstHive && playerCities(state, hk.id).length > 0) firstHive = state.turn;
      }
      const hk = hivekinOf(state);
      const cities = hk ? playerCities(state, hk.id).length : 0;
      const units = hk ? playerUnits(state, hk.id).length : 0;
      const queen = hk ? playerUnits(state, hk.id).filter((u) => u.type === 'queen').length : 0;
      out.push(
        `${String(seed).padEnd(5)} ${String(state.hivekinAt ?? '-').padEnd(6)} ${String(arrived || '-').padEnd(8)} ${String(firstHive || '-').padEnd(10)} ` +
          `${String(cities).padEnd(11)} ${String(units).padEnd(10)} ${String(hk?.alive ?? '-').padEnd(6)} ${queen}`,
      );
    }
    writeFileSync('hiveprobe.txt', out.join('\n'), 'utf8');
  }, 900_000);
});
