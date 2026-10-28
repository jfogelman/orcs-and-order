import { describe, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { canFoundCity } from '../src/sim/city';
import { caravansOf } from '../src/sim/caravans';
import { RECRUIT_TRACE } from '../src/sim/recruiting';
import { arrivalTurnFor, latecomers } from '../src/sim/arrivals';
import { playerCities, playerUnits, spawnUnit } from '../src/sim/gamestate';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import { NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';

/**
 * Section 157: why do the Wandering Folk win nothing?
 *
 * Section 156 measured them at **0 wins of 324** and 0.44 to 1.80 cities.
 * Jeremy put two hypotheses at once -- that the AI under-uses Recruit, and
 * that they need a better gold supply -- and both are theories about
 * *behaviour*.
 *
 * **At half a city, behaviour is downstream.** A side with one town has
 * almost no shields, almost no trade and therefore almost no gold, so "they
 * are short of gold" and "they never founded anything" predict the same
 * observation. The rule this project keeps is that an extreme number wants an
 * instrumented probe and not a story.
 *
 * So this asks, in order of how early it could go wrong:
 *
 * 1. **Do they arrive at all**, and alive?
 * 2. **Do they build founders**, and do the founders survive?
 * 3. **Is there anywhere to found** when they get there? Counted as legal
 *    sites inside the fat cross of where they appear.
 * 4. **Do they have gold**, and does it grow?
 * 5. **Do they raise Caravans**, and is anybody ever inside one?
 * 6. **Do they ask**, can they afford to, and does anybody come?
 *
 * Only (6) is Jeremy's first hypothesis and only (4) is his second. If the
 * answer is (2) or (3), both are symptoms.
 *
 * Run with:
 *   npx vitest run --config vitest.sweep.config.ts tools/wandererprobe.run.test.ts
 */

interface Row {
  seed: number;
  /** When they were due, and when they actually appeared. */
  due: number;
  arrived: number | null;
  aliveAtEnd: boolean;
  /** Most cities they ever held, and what they had at the end. */
  peakCities: number;
  endCities: number;
  /** Founders that ever existed, and founders that died without founding. */
  founders: number;
  /** Legal founding sites near where they appeared, the turn they appeared. */
  roomOnArrival: number;
  /** Gold at the end, and the most they ever had. */
  peakGold: number;
  endGold: number;
  caravans: number;
  techs: number;
  units: number;
}

const blank = () => ({ ...RECRUIT_TRACE });
const reset = () => {
  for (const k of Object.keys(RECRUIT_TRACE) as (keyof typeof RECRUIT_TRACE)[]) {
    RECRUIT_TRACE[k] = 0;
  }
};

/**
 * How many tiles near here a founder could legally take.
 *
 * Asked with a real settler through `canFoundCity`, which is the function the
 * game asks, rather than by re-reading the terrain rules -- a second copy of
 * "can a city go here" is the mistake this project has made six times with
 * lists and would make again with a predicate.
 */
function roomAround(state: GameState, x: number, y: number, reach = 6): number {
  const probe = spawnUnit(state, 0, 'peon', x, y);
  let room = 0;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      probe.x = nx;
      probe.y = ny;
      if (canFoundCity(state, probe, nx, ny).ok) room++;
    }
  }
  const i = state.units.indexOf(probe);
  if (i >= 0) state.units.splice(i, 1);
  return room;
}

describe('probe', () => {
  it('asks why the Wandering Folk win nothing', () => {
    control();
    reset();
    const seeds = seedSet('wanderers', TUNED_BASES, 6).seeds;
    const rows: Row[] = [];

    for (const seed of seeds) {
      let due = 0;
      let arrived: number | null = null;
      let peakCities = 0;
      let peakGold = 0;
      let roomOnArrival = -1;
      const founderIds = new Set<number>();
      let last: GameState | null = null;

      playGame(seed, undefined, (state) => {
        last = state;
        if (!due) {
          const n = latecomers(state).indexOf('wandering');
          if (n >= 0) due = arrivalTurnFor(state, n);
        }
        const them = state.players.find((p) => p.faction === 'wandering');
        if (!them) return;
        if (arrived === null) {
          arrived = state.turn;
          // Where they came up, measured before anybody has moved.
          const first = state.units.find((u) => u.owner === them.id);
          if (first) roomOnArrival = roomAround(state, first.x, first.y);
        }
        peakCities = Math.max(peakCities, playerCities(state, them.id).length);
        peakGold = Math.max(peakGold, them.gold);
        for (const u of state.units) {
          if (u.owner === them.id && unitType(u.type).settler) founderIds.add(u.id);
        }
      });

      const end = last as GameState | null;
      const them = end?.players.find((p) => p.faction === 'wandering');
      rows.push({
        seed,
        due,
        arrived,
        aliveAtEnd: !!them?.alive,
        peakCities,
        endCities: end && them ? playerCities(end, them.id).length : 0,
        founders: founderIds.size,
        roomOnArrival,
        peakGold,
        endGold: them?.gold ?? 0,
        caravans: end && them ? caravansOf(end, them.id).length : 0,
        techs: them?.techs.length ?? 0,
        units: end && them ? playerUnits(end, them.id).length : 0,
      });
    }

    const trace = blank();
    const n = rows.length;
    const avg = (pick: (r: Row) => number) =>
      (rows.reduce((a, r) => a + pick(r), 0) / n).toFixed(1);

    const report = [
      `# The Wandering Folk, ${n} games`,
      '',
      '## 1-3. do they arrive, build founders, and find room',
      `arrived in ${rows.filter((r) => r.arrived !== null).length}/${n}, ` +
        `alive at the end in ${rows.filter((r) => r.aliveAtEnd).length}/${n}`,
      `founders ever built: ${avg((r) => r.founders)}`,
      `cities: ${avg((r) => r.peakCities)} at their best, ${avg((r) => r.endCities)} at the end`,
      `legal founding sites within 6 of where they appeared: ${avg((r) => r.roomOnArrival)}`,
      '',
      '## 4-5. gold and Caravans',
      `gold: ${avg((r) => r.peakGold)} at their best, ${avg((r) => r.endGold)} at the end`,
      `Caravans standing at the end: ${avg((r) => r.caravans)}`,
      `half-turns with a Caravan up at all: ${trace.withCaravan}`,
      '',
      '## 6. asking',
      `targets inside a ring, summed: ${trace.targets}  (affordable: ${trace.affordable})`,
      `asked ${trace.asked}, came ${trace.came}, refused ${trace.refused}, spent ${trace.spent}g`,
      '',
      `advances ${avg((r) => r.techs)}, units ${avg((r) => r.units)}`,
      '',
      '## by seed',
      ...rows.map(
        (r) =>
          `seed ${r.seed}: due ${r.due}, arrived ${r.arrived ?? 'never'}, ` +
          `founders ${r.founders}, cities ${r.peakCities}->${r.endCities}, ` +
          `room ${r.roomOnArrival}, gold ${r.peakGold}->${r.endGold}, ` +
          `caravans ${r.caravans}, techs ${r.techs}`,
      ),
    ].join('\n');

    if (!existsSync('tools/out')) mkdirSync('tools/out', { recursive: true });
    writeFileSync('tools/out/wanderer-probe.md', `${report}\n`, 'utf8');
    console.log(report);
    void NEW_GAME;
  }, 1_800_000);
});
