import { describe, it } from 'vitest';
import { playGame, seedSet, HELD_OUT_BASES, TUNED_BASES } from './sweep';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 3);

/** Who actually opens the ruins, and what they find. */
describe('ruins', () => {
  it('asks which side cracks them', () => {
    for (const [name, bases] of [['tuned', TUNED_BASES], ['held-out', HELD_OUT_BASES]] as const) {
    const set = seedSet(name, bases, PER_BASE);
    const took = [0, 0];
    const cities = [0, 0];
    const prizes = new Map<string, number>();
    let placed = 0;
    let woken = 0;
    for (const seed of set.seeds) {
      let last: GameState | null = null;
      playGame(seed, undefined, (s) => { last = s; });
      const state = last as GameState | null;
      if (!state) continue;
      cities[0] += state.cities.filter((c) => c.owner === 0).length;
      cities[1] += state.cities.filter((c) => c.owner === 1).length;
      for (const r of state.ruins ?? []) {
        placed++;
        if (r.wokeOn !== undefined) woken++;
        if (r.takenBy === 0 || r.takenBy === 1) {
          took[r.takenBy]++;
          const key = `${r.takenBy}:${r.prize}`;
          prizes.set(key, (prizes.get(key) ?? 0) + 1);
        }
      }
    }
    const games = set.seeds.length;
    console.log(
      `${name}: games ${games} | ruins placed ${(placed / games).toFixed(1)} a game | woken ${(woken / games).toFixed(1)} | ` +
        `taken Horde ${(took[0] / games).toFixed(2)} Kingdom ${(took[1] / games).toFixed(2)}`,
    );
    console.log(`${name}: ` + [...prizes].sort().map(([k, v]) => `${k}=${(v / games).toFixed(2)}`).join(' '));
    // Cities each side ended with, so a free settler can be told from a free soldier.
    console.log(`${name}: cities ${(cities[0] / games).toFixed(2)}/${(cities[1] / games).toFixed(2)}`);
    }
  }, 900_000);
});
