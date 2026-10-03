import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { endPlayerTurn } from '../src/sim/turn';
import { runAiTurn } from '../src/ai/ai';
import { hivekinOf } from '../src/sim/hivekin';

/**
 * Section 125: where the Hives go.
 *
 * The previous probe killed the obvious theory -- they emerge on good ground
 * with eighty to a hundred settleable tiles around them, and they build plenty
 * of Grubs. They found Hives and then do not have them any more. This asks
 * which of the three ways that happens, because they want three different
 * fixes: taken by somebody, given up for want of a Queen, or starved out.
 */
describe('where the hives go', () => {
  it('attributes every Hive lost', () => {
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
    const out: string[] = [
      'seed  founded  taken  abandoned  vanished  endHives  garrison@loss  hiveSize  empireSize',
    ];
    for (const seed of seeds) {
      const state = createGame({ seed, width: 64, height: 48, barbarians: true });
      const lostGarrisons: number[] = [];
      const sizeSum: number[] = [];
      const rivalSize: number[] = [];
      let founded = 0;
      let taken = 0;
      let abandoned = 0;
      let vanished = 0;
      const seen = new Set<number>();
      let held = new Map<number, number>();
      const killers = new Map<number, number>();
      for (let i = 0; i < 300 * 4 && state.turn <= 240; i++) {
        runAiTurn(state, state.activePlayer);
        endPlayerTurn(state);
        const hk = hivekinOf(state);
        if (!hk) continue;
        const mine = playerUnits(state, hk.id);
        const now = new Map(
          playerCities(state, hk.id).map(
            (c) => [c.id, mine.filter((u) => u.x === c.x && u.y === c.y).length] as const,
          ),
        );
        for (const c of playerCities(state, hk.id)) sizeSum.push(c.size);
        for (const p of [0, 1]) for (const c of playerCities(state, p)) rivalSize.push(c.size);
        for (const id of now.keys()) if (!seen.has(id)) { seen.add(id); founded++; }
        for (const [id, garrison] of held) {
          if (now.has(id)) continue;
          lostGarrisons.push(garrison);
          const still = state.cities.find((c) => c.id === id);
          if (!still) {
            // Gone from the board entirely: razed, or the seat given up for
            // want of a Queen. Matched on the line the abandonment writes,
            // and only on this turn's entries -- an older one would make every
            // later loss look like the same event.
            const givenUp = state.log.some(
              (e) => e.turn >= state.turn - 1 && /is given up/.test(e.text),
            );
            if (givenUp) abandoned++;
            else vanished++;
          } else {
            taken++;
            killers.set(still.owner, (killers.get(still.owner) ?? 0) + 1);
          }
        }
        held = now;
      }
      const hk = hivekinOf(state);
      const endHives = hk ? playerCities(state, hk.id).length : 0;
      const by = [...killers.entries()].map(([o, n]) => `p${o}:${n}`).join(' ') || '-';
      const avg = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
      void by;
      out.push(
        `${String(seed).padEnd(5)} ${String(founded).padEnd(8)} ${String(taken).padEnd(6)} ` +
          `${String(abandoned).padEnd(10)} ${String(vanished).padEnd(9)} ${String(endHives).padEnd(9)} ` +
          `${avg(lostGarrisons).padEnd(14)} ${avg(sizeSum).padEnd(9)} ${avg(rivalSize)}`,
      );
    }
    writeFileSync('hiveprobe.txt', out.join('\n'), 'utf8');
  }, 1_800_000);
});
