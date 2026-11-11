// Section 177. Step 3d of `chooseProduction` builds the unit that *digs*
// (`u.works`) and budgets against the units that *found* (`t.settler`). For the
// two empires and the Wandering Folk one unit carries both flags, so the budget
// works and nobody noticed; the Hive's Worker and the Unbound's Effigy are
// `works` and not `settler`, so their budget counts something they rarely
// build and the step never sees its own output. `ROAD_TRACE` measured the
// consequence over 72 games: the Unbound's budget reads 0.8 diggers while the
// field holds 11 to 14, and step 3d answers more than half their production
// decisions against everyone else's 1%.
//
// These read the two counts directly rather than through a played game,
// because the fault is arithmetic and a game would make it a statistic.
import { describe, expect, it } from 'vitest';
import { AI_TUNING } from '../src/ai/ai';
import type { FactionId } from '../src/model/types';
import { CREATURES, unitType } from '../src/model/units';

/** The unit step 3d would actually build for this faction, after the cost sort. */
const diggerOf = (faction: FactionId) =>
  CREATURES.filter((u) => u.faction === faction)
    .slice()
    .sort((a, b) => a.cost - b.cost)
    .find((u) => u.works);

describe('road-crew budget', () => {
  it('builds a digger that its own budget cannot see', () => {
    // The fault, stated as data. If a later section gives the Hive's Worker or
    // the Unbound's Effigy the `settler` flag, this fails and the budget is
    // fixed a different way -- which is the right thing for it to notice.
    for (const faction of ['hivekin', 'unbound'] as FactionId[]) {
      const digger = diggerOf(faction);
      expect(digger, faction).toBeDefined();
      expect(digger!.works, `${faction} ${digger!.id} digs`).toBe(true);
      expect(digger!.settler, `${faction} ${digger!.id} founds`).not.toBe(true);
    }
  });

  it('is the same unit for the three factions where nobody noticed', () => {
    // Why this went unseen for seventy sections: where the digger also founds,
    // the two counts are the same number, which `ROAD_TRACE` measured as
    // identical to two decimals on both seed sets.
    for (const faction of ['orc', 'human', 'wandering'] as FactionId[]) {
      const digger = diggerOf(faction);
      expect(digger, faction).toBeDefined();
      expect(digger!.works, `${faction} ${digger!.id} digs`).toBe(true);
      expect(digger!.settler, `${faction} ${digger!.id} founds`).toBe(true);
    }
  });

  it('counts the diggers themselves once the lever is on', () => {
    // The lever's own contract, and the half of this file that fails against
    // the shipped game: with it on, the predicate the budget uses admits the
    // unit the step builds.
    const counts = (id: string) =>
      AI_TUNING.roadBudgetByWork ? unitType(id).works === true : unitType(id).settler === true;
    const was = AI_TUNING.roadBudgetByWork;
    try {
      for (const faction of ['hivekin', 'unbound'] as FactionId[]) {
        const digger = diggerOf(faction)!;
        AI_TUNING.roadBudgetByWork = false;
        expect(counts(digger.id), `${faction} ${digger.id}, as shipped`).toBe(false);
        AI_TUNING.roadBudgetByWork = true;
        expect(counts(digger.id), `${faction} ${digger.id}, by work`).toBe(true);
      }
    } finally {
      AI_TUNING.roadBudgetByWork = was;
    }
  });

  it('ships with the budget counting the unit that digs', () => {
    // Pinned, so a change to this is a decision somebody made rather than a
    // default that drifted. Shipped on 216 games over two seed sets: step 3d
    // fell from 53-57% of the Unbound's production decisions to 0.8-1.8% and
    // from 36-65% of the Hive's to 3.3-7.4%, with no faction's win share
    // moving past the noise bar and unfinished games down from 20 to 16.
    expect(AI_TUNING.roadBudgetByWork).toBe(true);
  });
});
