import { it } from 'vitest';
import type { GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { TERRAFORM } from '../src/sim/terraform';
import { playGame } from './sweep';

// Scratch: why terraforming costs the Horde. Per side, with it off and on.
it('probes terraforming by side', { timeout: 900_000 }, () => {
  const seeds = [20, 21, 22, 23, 24, 25, 26, 27];
  const out: string[] = [];
  for (const on of [false, true]) {
    TERRAFORM.enabled = on;
    const sum = { riot: [0, 0], cityTurns: [0, 0], cities: [0, 0], ditches: [0, 0], mines: [0, 0], workers: [0, 0], starve: [0, 0], wins: [0, 0], lostAt: [] as number[] };
    for (const seed of seeds) {
      let end: GameState | null = null;
      let firstLoss = 0;
      playGame(seed, 620, (state: GameState) => {
        end = state;
        for (const c of state.cities) {
          if (c.owner > 1) continue;
          sum.cityTurns[c.owner]++;
          if (c.disorder) sum.riot[c.owner]++;
        }
        const hordeCities = state.cities.filter((c) => c.owner === 0).length;
        if (!firstLoss && state.turn > 60 && hordeCities <= 3) firstLoss = state.turn;
      });
      const s = end as unknown as GameState;
      for (const p of [0, 1]) {
        const mine = s.cities.filter((c) => c.owner === p);
        sum.cities[p] += mine.length;
        const owned = new Set<number>();
        for (const c of mine) for (const i of c.workedTiles) owned.add(i);
        for (const i of owned) {
          if (s.irrigation?.[i] === 1) sum.ditches[p]++;
          if (s.mines?.[i] === 1) sum.mines[p]++;
        }
        sum.workers[p] += s.units.filter((u) => u.owner === p && unitType(u.type).settler).length;
        if (s.winner === p) sum.wins[p]++;
      }
      if (firstLoss) sum.lostAt.push(firstLoss);
    }
    const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))}%`;
    out.push(
      `terraform ${on ? 'ON ' : 'OFF'} | wins H/K ${sum.wins.join('/')} | riot city-turns H ${pct(sum.riot[0], sum.cityTurns[0])} K ${pct(sum.riot[1], sum.cityTurns[1])} | ` +
        `cities at end H/K ${sum.cities.join('/')} | worked ditches H/K ${sum.ditches.join('/')} | mines H/K ${sum.mines.join('/')} | ` +
        `workers alive H/K ${sum.workers.join('/')} | Horde down to 3 cities at turns ${sum.lostAt.join(',') || '-'}`,
    );
  }
  TERRAFORM.enabled = true;
  console.log('\n' + out.join('\n'));
});
