import { describe, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { HIVEKIN } from '../src/sim/hivekin';
import { playerCities, playerUnits } from '../src/sim/gamestate';
import { unitType } from '../src/model/units';
import { FACTIONS } from '../src/model/factions';
import type { GameState } from '../src/model/types';
import { playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';

/**
 * Section 159: the escort budget made the Wandering Folk **smaller**. Why?
 *
 * The 324-game sweep found, with both seed sets agreeing on direction, that
 * raising `escortShields` from a count-equivalent 26 to the shipped 90 lifted
 * the Hive on every column and *lowered* the Wandering Folk on every column.
 * That is the opposite of what the change was written to do.
 *
 * Two stories fit those averages equally well, and they want different fixes:
 *
 * 1. **They are killed harder.** The budget is a fixed number of shields, so
 *    it buys the Hive nine Fodder at 10s and the Wandering Folk six
 *    Skirmishers at 13s -- and the Hive is `latecomers()[0]` while the
 *    Wandering Folk are `latecomers()[1]`, so the Hive lands **a full stagger
 *    gap earlier** with the larger package. On this story the Wandering Folk
 *    arrive into a bigger, older Hive and die sooner than they used to.
 * 2. **They waste it.** Six fighters and one founder may simply make their AI
 *    fight instead of settle, in which case the escort is fine and the
 *    behaviour is the fault.
 *
 * The sweep cannot separate these: it reports what sides *ended* with, and
 * both stories end with fewer cities. So this asks the two questions the
 * averages cannot answer -- **when do they die**, and **how big is the Hive
 * on the turn they appear** -- on the same seeds at both budgets.
 *
 * `attribution-needs-the-same-bar`: "the Hive ate them" off a column of
 * averages is a story. The turn they die, measured against a control, is not.
 *
 * Run with:
 *   npx vitest run --config vitest.sweep.config.ts tools/escortprobe.run.test.ts
 */

interface Row {
  seed: number;
  shields: number;
  /** Escort the budget actually bought them, counted on the board. */
  escort: number;
  arrived: number | null;
  /** The turn they lost their last city having had one, or null. */
  diedAt: number | null;
  aliveAtEnd: boolean;
  peakCities: number;
  founders: number;
  /** The Hive, measured on the turn the Wandering Folk appear. */
  hiveUnitsThen: number;
  hiveCitiesThen: number;
  /** And at the end, so a bigger Hive can be told from an earlier one. */
  hiveCitiesEnd: number;
}

const BUDGETS = [26, 90];

function hiveOf(state: GameState) {
  return state.players.find((p) => p.faction === 'hivekin');
}

describe('probe', () => {
  it('asks what the escort budget did to the Wandering Folk', () => {
    const seeds = seedSet('escort', TUNED_BASES, 6).seeds;
    const rows: Row[] = [];

    for (const shields of BUDGETS) {
      for (const seed of seeds) {
        control();
        HIVEKIN.escortShields = shields;

        let arrived: number | null = null;
        let escort = 0;
        let hiveUnitsThen = 0;
        let hiveCitiesThen = 0;
        let peakCities = 0;
        let everHadCity = false;
        let diedAt: number | null = null;
        const founderIds = new Set<number>();
        let last: GameState | null = null;

        playGame(seed, undefined, (state) => {
          last = state;
          const them = state.players.find((p) => p.faction === 'wandering');
          if (!them) return;
          if (arrived === null) {
            arrived = state.turn;
            // Counted off the board rather than computed from the budget, so
            // a cramped arrival spot that could not fit the whole package
            // shows up as the smaller escort it actually was.
            const starter = FACTIONS.wandering.starterUnit;
            escort = state.units.filter((u) => u.owner === them.id && u.type === starter).length;
            const hive = hiveOf(state);
            if (hive) {
              hiveUnitsThen = playerUnits(state, hive.id).length;
              hiveCitiesThen = playerCities(state, hive.id).length;
            }
          }
          const cities = playerCities(state, them.id).length;
          peakCities = Math.max(peakCities, cities);
          if (cities > 0) everHadCity = true;
          // The turn the last one went, not the turn the side was marked
          // dead: a side with no city is finished whatever the flag says.
          if (everHadCity && cities === 0 && diedAt === null) diedAt = state.turn;
          for (const u of state.units) {
            if (u.owner === them.id && unitType(u.type).settler) founderIds.add(u.id);
          }
        });

        const end = last as GameState | null;
        const them = end?.players.find((p) => p.faction === 'wandering');
        const hive = end ? hiveOf(end) : undefined;
        rows.push({
          seed,
          shields,
          escort,
          arrived,
          diedAt,
          aliveAtEnd: !!them?.alive && playerCities(end!, them!.id).length > 0,
          peakCities,
          founders: founderIds.size,
          hiveUnitsThen,
          hiveCitiesThen,
          hiveCitiesEnd: end && hive ? playerCities(end, hive.id).length : 0,
        });
      }
    }

    const lines: string[] = [`# The escort budget and the Wandering Folk, ${seeds.length} seeds each`, ''];

    for (const shields of BUDGETS) {
      const mine = rows.filter((r) => r.shields === shields);
      const n = mine.length;
      const avg = (pick: (r: Row) => number) =>
        (mine.reduce((a, r) => a + pick(r), 0) / n).toFixed(1);
      const died = mine.filter((r) => r.diedAt !== null);
      const neverFounded = mine.filter((r) => r.peakCities === 0);

      lines.push(
        `## ${shields} shields`,
        `escort actually placed: ${avg((r) => r.escort)}`,
        `arrived on turn ${avg((r) => r.arrived ?? 0)}`,
        `never founded anything: ${neverFounded.length}/${n}`,
        `had a city and lost the last one: ${died.length}/${n}` +
          (died.length
            ? `, on turn ${(died.reduce((a, r) => a + r.diedAt!, 0) / died.length).toFixed(0)} on average`
            : ''),
        `standing at the end: ${mine.filter((r) => r.aliveAtEnd).length}/${n}`,
        `cities at their best: ${avg((r) => r.peakCities)}, founders ever built: ${avg((r) => r.founders)}`,
        `the Hive on the turn they appeared: ${avg((r) => r.hiveUnitsThen)} units, ` +
          `${avg((r) => r.hiveCitiesThen)} cities (${avg((r) => r.hiveCitiesEnd)} at the end)`,
        '',
      );
    }

    lines.push('## by seed', '| seed | shields | escort | arrived | peak | died | founders | hive then |', '|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      lines.push(
        `| ${r.seed} | ${r.shields} | ${r.escort} | ${r.arrived ?? 'never'} | ${r.peakCities} | ` +
          `${r.diedAt ?? '-'} | ${r.founders} | ${r.hiveUnitsThen}u/${r.hiveCitiesThen}c |`,
      );
    }

    const report = lines.join('\n');
    if (!existsSync('tools/out')) mkdirSync('tools/out', { recursive: true });
    writeFileSync('tools/out/escort-probe.md', `${report}\n`, 'utf8');
    console.log(report);
  }, 1_800_000);
});
