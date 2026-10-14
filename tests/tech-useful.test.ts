import { describe, expect, it } from 'vitest';
import { TECHS, techsForFaction } from '../src/model/techs';
import { BUILDINGS, BUILDING_IDS } from '../src/model/buildings';
import { UNIT_TYPES } from '../src/model/units';
import { FACTION_IDS } from '../src/model/factions';
import type { FactionId } from '../src/model/types';

/**
 * Every advance a side is offered is worth something to that side.
 *
 * Found in play: the Hivekin were offered Wall Building, Joy Making and
 * Hammers of Glory, each `faction: 'both'` and each unlocking only Horde or
 * Kingdom buildings. The cards rendered blank and cost ninety beakers apiece.
 *
 * `'both'` predates the Hive, and meant "the two sides" when there were two.
 * Nothing re-read those entries when a third arrived, and nothing could have
 * noticed -- which is what this file is for.
 *
 * The bar is deliberately "worth something", not "unlocks something". A
 * stepping stone is worth researching if it is the only road to something you
 * *can* use, and all three of these are exactly that. What is not allowed is an
 * advance that is neither.
 */
function givesDirectly(techId: string, faction: FactionId): boolean {
  const t = TECHS.find((x) => x.id === techId);
  if (!t) return false;
  if (t.flags.length > 0) return true;
  if (t.units.some((u) => UNIT_TYPES[u]?.faction === faction)) return true;
  return t.buildings.some((b) => {
    const f = BUILDINGS[b]?.faction;
    return f === 'both' || f === faction;
  });
}

/** Whether anything downstream of this advance is worth having, for this side. */
function leadsSomewhere(techId: string, faction: FactionId, seen = new Set<string>()): boolean {
  if (seen.has(techId)) return false;
  seen.add(techId);
  return TECHS.filter((n) => n.prereqs.includes(techId))
    .filter((n) => n.faction === 'both' || n.faction === faction)
    .some((n) => givesDirectly(n.id, faction) || leadsSomewhere(n.id, faction, seen));
}

describe('the research tree', () => {
  it('offers nobody an advance that is worth nothing to them', () => {
    const dead: string[] = [];
    for (const faction of FACTION_IDS) {
      for (const t of techsForFaction(faction)) {
        if (givesDirectly(t.id, faction)) continue;
        if (leadsSomewhere(t.id, faction)) continue;
        dead.push(`${t.name} (${faction})`);
      }
    }
    expect(dead, `advances that do nothing for the side offered them: ${dead.join(', ')}`).toEqual(
      [],
    );
  });

  it('gives every side something for the three that used to be blank', () => {
    // The ones found in play. Named rather than swept, because the general
    // test above is satisfied by a stepping stone and these three should now
    // hand the Hive a building of its own.
    for (const id of ['wall-building', 'joy-making', 'hammers-of-glory']) {
      for (const faction of FACTION_IDS) {
        expect(givesDirectly(id, faction), `${id} gives ${faction} nothing`).toBe(true);
      }
    }
  });

  it('matches each new Hive building to the cost of its opposite number', () => {
    // Closing a hole, not tuning a faction. If the Hive should be cheaper or
    // dearer at this than the Kingdom, that is a decision to make on purpose
    // and measure -- not one smuggled in through a building that had to exist.
    const pairs: [string, string][] = [
      ['theNarrowing', 'walls'],
      ['theHum', 'chapel'],
      ['theScentRecord', 'scriptorium'],
    ];
    for (const [hive, theirs] of pairs) {
      expect(BUILDINGS[hive].cost, `${hive} is not priced like ${theirs}`).toBe(
        BUILDINGS[theirs].cost,
      );
      expect(BUILDINGS[hive].upkeep).toBe(BUILDINGS[theirs].upkeep);
    }
  });
});

describe('the three sides are built out to the same shape', () => {
  /** Every ordinary building of a side: not a folly, not a work towards an ending. */
  function ordinary(faction: FactionId) {
    return BUILDING_IDS.map((id) => BUILDINGS[id]).filter(
      (b) =>
        b.faction === faction &&
        b.folly === undefined &&
        b.endingPart === undefined &&
        b.victory === undefined,
    );
  }

  it('gives every side the same count of ordinary buildings', () => {
    // **The Hive had two, against fourteen each.** Both of its were shared
    // ones -- a Barracks and a Granary -- and everything with a faction on it
    // belonged to somebody else. It could not keep a city calm, could not
    // study, could not trade and could not fortify, and nothing said so: the
    // blank advance cards found in play were the only visible symptom of it.
    const counts = Object.fromEntries(FACTION_IDS.map((f) => [f, ordinary(f).length]));
    const sizes = [...new Set(Object.values(counts))];
    expect(sizes, `ordinary buildings per side: ${JSON.stringify(counts)}`).toHaveLength(1);
  });

  it('lets every side do each of the jobs a city needs doing', () => {
    // Not slot for slot. The Horde's Wall Building deliberately produces a
    // *Broken Catapult* where the Kingdom gets Walls -- the Horde attempts the
    // advance and arrives somewhere else entirely, which is the joke and not a
    // defect. A test demanding matching slots would forbid exactly the kind of
    // asymmetry this game is made of.
    //
    // What a side must have is the ability to do each job at all, because a
    // side that cannot study or cannot keep a city calm is not asymmetric, it
    // is unfinished -- which is what the Hive was.
    const jobs: [string, (b: (typeof BUILDINGS)[string]) => boolean][] = [
      ['keep a city calm', (b) => (b.contentBonus ?? 0) > 0],
      ['study', (b) => (b.scienceBonus ?? 0) > 0],
      ['make gold', (b) => (b.goldBonus ?? 0) > 0],
      ['supply an army abroad', (b) => b.suppliesArmy === true],
      ['send units out hardened', (b) => (b.startingRank ?? 0) > 0],
    ];
    const cannot: string[] = [];
    for (const faction of FACTION_IDS) {
      for (const [job, test] of jobs) {
        if (!ordinary(faction).some(test)) cannot.push(`${faction} cannot ${job}`);
      }
    }
    expect(cannot, cannot.join('; ')).toEqual([]);
  });
});
