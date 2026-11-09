import { afterEach, describe, expect, it } from 'vitest';
import { ENDING_ROAD, techCost } from '../src/sim/research';
import { TECHS, TECHS_BY_ID } from '../src/model/techs';
import type { Player, TechId } from '../src/model/types';

/**
 * Section 171: the lever on how long each faction's road to its ending is.
 *
 * Section 169 measured the road -- the ending advance plus every prerequisite
 * -- at 165 beakers for the Hive and 1035 for the Unbound, and found that how
 * often a side learns its ending advance is monotone in that number. This is
 * the knob, and what matters about a knob is that **one** is the game that was
 * measured and that it reaches nothing it was not meant to.
 */

const was = { ...ENDING_ROAD };
afterEach(() => {
  for (const f of Object.keys(ENDING_ROAD)) ENDING_ROAD[f] = was[f] ?? 1;
});

/** A side that knows exactly one advance, so escalation is a no-op. */
function player(faction: string): Player {
  return {
    id: 1,
    faction,
    techs: ['mapmaking'] as TechId[],
    beakers: 0,
  } as unknown as Player;
}

const endings = TECHS.filter((t) => t.flags.includes('ending'));

describe('the ending-road lever', () => {
  it('has an ending advance for each of the five sides', () => {
    // The guard that makes the rest of this file mean something: if an ending
    // advance ever stops being flagged, the lever silently stops reaching it
    // and every arm built on it becomes a duplicate of its own control.
    expect(endings).toHaveLength(5);
    expect(new Set(endings.map((t) => t.faction))).toEqual(
      new Set(['orc', 'human', 'hivekin', 'unbound', 'wandering']),
    );
  });

  it('is the shipped game at one', () => {
    const hive = player('hivekin');
    const tech = TECHS_BY_ID['all-is-the-hive'];
    ENDING_ROAD.hivekin = 1;
    expect(techCost(hive, tech)).toBe(tech.cost);
  });

  it('scales the ending advance and nothing else on the same road', () => {
    const hive = player('hivekin');
    const ending = TECHS_BY_ID['all-is-the-hive'];
    const prereq = TECHS_BY_ID[ending.prereqs[0]];
    const prereqBefore = techCost(hive, prereq);

    ENDING_ROAD.hivekin = 3;
    expect(techCost(hive, ending), 'the ending advance triples').toBe(ending.cost * 3);
    expect(techCost(hive, prereq), 'its prerequisite does not move').toBe(prereqBefore);
  });

  it('reaches one faction without touching the other four', () => {
    ENDING_ROAD.hivekin = 4;
    for (const t of endings) {
      const p = player(t.faction);
      const expected = t.faction === 'hivekin' ? t.cost * 4 : t.cost;
      expect(techCost(p, t), `${t.faction}'s road`).toBe(expected);
    }
  });

  it('can shorten as well as lengthen, which is the open half of section 169', () => {
    // Section 169 deliberately did not choose between lengthening one road and
    // shortening three, so the lever has to do both or it has quietly chosen.
    const unbound = player('unbound');
    const tech = TECHS_BY_ID['arrangement-permanent'];
    ENDING_ROAD.unbound = 0.5;
    expect(techCost(unbound, tech)).toBe(Math.round(tech.cost * 0.5));
  });
});
