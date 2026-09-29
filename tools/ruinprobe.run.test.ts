import { describe, it } from 'vitest';
import { playGame, seedSet, HELD_OUT_BASES, TUNED_BASES } from './sweep';
import type { GameState } from '../src/model/types';
import { isWarden } from '../src/sim/ruins';
import { distance } from '../src/engine/grid';

declare const process: { env: Record<string, string | undefined> };
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 3);

/**
 * Who pays for the ruins, and in what.
 *
 * Three hypotheses died measured: the prize (settler, then soldier), the guard
 * (flat, then proportional), and the AI's errand (it leans with the AI ignoring
 * them entirely). So this counts rather than guesses -- who wakes them, who
 * loses units beside them, and how many guardians are standing about.
 */
describe('ruins', () => {
  it('counts who pays', () => {
    for (const [name, bases] of [['tuned', TUNED_BASES], ['held-out', HELD_OUT_BASES]] as const) {
      const set = seedSet(name, bases, PER_BASE);
      const woke = [0, 0];
      const parked = [0, 0];
      let parkSamples = 0;
      const lostByWardens = [0, 0];
      const wardensAt = [0, 0, 0]; // turns 100, 200, end
      let samples = 0;
      for (const seed of set.seeds) {
        let prev = new Map<number, { owner: number; x: number; y: number }>();
        let wardens: Array<[number, number]> = [];
        const seen = new Set<number>();
        let last: GameState | null = null;
        playGame(seed, undefined, (s) => {
          last = s;
          // Anything of ours that vanished with a warden beside where it stood.
          const now = new Set(s.units.map((u) => u.id));
          for (const [id, was] of prev) {
            if (now.has(id)) continue;
            if (was.owner !== 0 && was.owner !== 1) continue;
            if (wardens.some(([x, y]) => distance(x, y, was.x, was.y) <= 1)) lostByWardens[was.owner]++;
          }
          prev = new Map(s.units.map((u) => [u.id, { owner: u.owner, x: u.x, y: u.y }]));
          wardens = s.units.filter(isWarden).map((u) => [u.x, u.y] as [number, number]);
          // Ours standing on or beside a ruin that still holds something: the
          // shape of an army that went to crack one and stayed.
          if (s.turn === 150) {
            parkSamples++;
            for (const u of s.units) {
              if (u.owner !== 0 && u.owner !== 1) continue;
              const atRuin = (s.ruins ?? []).some(
                (r) => r.takenOn === undefined && distance(r.x, r.y, u.x, u.y) <= 1,
              );
              if (atRuin) parked[u.owner]++;
            }
          }
          if (s.turn === 100) wardensAt[0] += wardens.length;
          if (s.turn === 200) wardensAt[1] += wardens.length;
          for (const r of s.ruins ?? []) {
            if (r.wokeOn !== undefined && r.wokenBy !== undefined && !seen.has(r.x * 1000 + r.y)) {
              seen.add(r.x * 1000 + r.y);
              if (r.wokenBy === 0 || r.wokenBy === 1) woke[r.wokenBy]++;
            }
          }
        });
        if (last) wardensAt[2] += (last as GameState).units.filter(isWarden).length;
        samples++;
      }
      const per = (n: number) => (n / samples).toFixed(2);
      console.log(
        `${name}: woke H${per(woke[0])}/K${per(woke[1])} | lost to wardens H${per(lostByWardens[0])}/K${per(lostByWardens[1])} | ` +
          `wardens standing t100 ${per(wardensAt[0])} t200 ${per(wardensAt[1])} end ${per(wardensAt[2])} | ` +
          `ours parked at a ruin on t150 H${(parked[0] / Math.max(1, parkSamples / set.seeds.length) / set.seeds.length).toFixed(2)}/K${(parked[1] / Math.max(1, parkSamples / set.seeds.length) / set.seeds.length).toFixed(2)}`,
      );
    }
  }, 900_000);
});
