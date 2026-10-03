import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createGame } from '../src/sim/gamestate';
import { playerCities, playerUnits } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import { runAiTurn } from '../src/ai/ai';
import { hivekinOf, HIVEKIN, queenSeat, queenIn } from '../src/sim/hivekin';
import { isSunk } from '../src/sim/burrow';

/** Section 125: what actually happens to the third side once it comes up. */
describe('the hive, observed', () => {
  it('reports one line per seed', () => {
    const out: string[] = [
      `window ${HIVEKIN.from}-${HIVEKIN.until}, clearOf ${HIVEKIN.clearOf}, escort ${HIVEKIN.escort}`,
      '',
      'seed  arrived  hives  techs  built                              researching',
    ];
    for (const seed of [11, 22, 33, 44, 55, 66]) {
      const state = createGame({ seed, width: 64, height: 48, barbarians: true });
      let arrived = 0;
      let firstHive = 0;
      let sunkTurns = 0;
      let burrowers = 0;
      let queenlessTurns = 0;
      for (let i = 0; i < 230 * 4 && state.turn <= 200; i++) {
        runAiTurn(state, state.activePlayer);
        endPlayerTurn(state);
        const hk = hivekinOf(state);
        if (hk && !arrived) arrived = state.turn;
        if (hk && !firstHive && playerCities(state, hk.id).length > 0) firstHive = state.turn;
        if (hk) {
          const mine = playerUnits(state, hk.id);
          burrowers = Math.max(burrowers, mine.filter((u) => u.type === 'burrower').length);
          if (mine.some(isSunk)) sunkTurns++;
          const seat = queenSeat(state, hk);
          if (seat && !queenIn(state, seat)) queenlessTurns++;
        }
      }
      const hk = hivekinOf(state);
      const cities = hk ? playerCities(state, hk.id).length : 0;
      const mine = hk ? playerUnits(state, hk.id) : [];
      const kinds = [...new Set(mine.map((u) => u.type))].sort().join(',') || '(nothing)';
      const hkTechs = hk ? hk.techs.filter((t) => /caste|burrower|hive/.test(t)).length : 0;
      out.push(
        `${String(seed).padEnd(5)} ${String(arrived || '-').padEnd(8)} ${String(cities).padEnd(6)} ` +
          `${String(hkTechs).padEnd(6)} ${kinds.padEnd(34)} ${hk?.researching ?? '-'}`,
      );
    }
    writeFileSync('hiveprobe.txt', out.join('\n'), 'utf8');
  }, 900_000);
});
