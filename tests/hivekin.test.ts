import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import {
  FACTIONS,
  FACTION_IDS,
  STARTING_FACTIONS,
  rivalFactions,
  talks,
} from '../src/model/factions';
import { CREATURES, UNIT_TYPES, unitType } from '../src/model/units';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS, TECHS_BY_ID } from '../src/model/techs';
import { ADVISORS } from '../src/model/advisors';
import { CITIZEN_RACES } from '../src/model/citizens';
import { createGame, playerUnits, spawnUnit } from '../src/sim/gamestate';
import { assignWorkers, cityYield, foundCity, productionCostIn } from '../src/sim/city';
import { atPeace, hostile, signPeace, PEACE } from '../src/sim/diplomacy';
import { attackStrength } from '../src/sim/combat';
import { dominanceShare } from '../src/sim/turn';
import { HIVEKIN, hivekinOf, placeQueen } from '../src/sim/hivekin';
import { endingFor } from '../src/sim/endings';

/**
 * Section 125 slice A: the third side exists, and is counted.
 *
 * Slice A deliberately adds no new mechanics -- no Sink, no Burrow, no Queen
 * succession. What it adds is a **seat**: a faction that emerges, settles,
 * researches, builds, and can win. These tests are about that seat being a real
 * one and about the places the engine used to say "the other side" and meant it.
 */

function board(): GameState {
  const state = createGame({ seed: 20261002, width: 30, height: 20, barbarians: false });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  state.log.length = 0;
  return state;
}

/** A Hivekin seat on a two-player board, as emergence would leave one. */
function withHive(state: GameState): number {
  const id = state.players.length;
  state.players.push({
    ...state.players[1],
    id,
    faction: 'hivekin',
    name: FACTIONS.hivekin.civName,
    leader: FACTIONS.hivekin.leader,
    alive: true,
    techs: ['first-hivekin'],
    explored: new Array(state.width * state.height).fill(1),
    visible: new Array(state.width * state.height).fill(1),
  });
  return id;
}

describe('the roster', () => {
  it('has no counting ladder anywhere, which is the whole of what they are', () => {
    const castes = CREATURES.filter((c) => c.faction === 'hivekin');
    expect(castes.length).toBe(14);
    for (const c of castes) {
      expect(c.counts, `${c.id} must not stack`).toEqual([1]);
    }
    // And the contrast is real rather than asserted: the Horde does stack.
    expect(CREATURES.some((c) => c.faction === 'orc' && c.counts.length > 1)).toBe(true);
  });

  it('covers every role the other two sides field, except the two it refuses', () => {
    const roles = new Set(CREATURES.filter((c) => c.faction === 'hivekin').map((c) => c.role));
    for (const needed of ['worker', 'melee', 'ranged', 'siege', 'naval']) {
      expect(roles.has(needed as never), `no ${needed}`).toBe(true);
    }
    // No caster and no flier, on purpose: nothing in the Hivekin casts
    // anything, which is the premise the Warden-caste exists to preserve.
    expect(roles.has('caster')).toBe(false);
    expect(roles.has('flying')).toBe(false);
  });

  it('gives the Queen no way to move and no way to be built', () => {
    expect(unitType('queen').move).toBe(0);
    expect(TECHS.every((t) => !t.units.includes('queen'))).toBe(true);
  });

  it('arms the Bloat-caste exactly as the other artillery is armed', () => {
    const bloat = unitType('bloatcaste');
    expect(bloat.range).toBe(2);
    expect(bloat.siegeBonus).toBe(2);
    expect(bloat.ammo).toBe(5);
    expect(bloat.reloadsBy).toBe('labour');
    // Which means the Spitter is the only thing that can reload it -- the same
    // shape as the Archer and the Ballista. Section 125 slice 0.
    expect(unitType('spitter').firstStrikes).toBeGreaterThan(0);
  });

  it('keeps the Fodder slower than the Goblin, since they have no scout', () => {
    expect(unitType('fodder').move).toBe(1);
    expect(unitType('goblin').move).toBe(2);
    const fastest = Math.max(
      ...CREATURES.filter((c) => c.faction === 'hivekin' && !c.sails).map((c) => c.move),
    );
    // The Burrower is the quickest thing they have on land, and it costs more
    // than three times what a Fodder does.
    expect(fastest).toBe(unitType('burrower').move);
  });
});

describe('the tree', () => {
  it('starts them with a founder and a gatherer, and no Queen', () => {
    const first = TECHS_BY_ID['first-hivekin'];
    expect(first.cost).toBe(0);
    expect(first.units).toEqual(['grub', 'worker']);
    expect(FACTIONS.hivekin.startTech).toBe('first-hivekin');
    expect(FACTIONS.hivekin.settlerUnit).toBe('grub');
  });

  it('hands them a boat off the shared advance, as it does the other two', () => {
    expect(TECHS_BY_ID['mapmaking'].units).toContain('tidecaste');
    expect(unitType('tidecaste').carries).toBe(3);
  });

  it('reaches an ending of its own, in section 110 shape', () => {
    expect(endingFor('hivekin')).toBe('hive');
    const works = Object.values(BUILDINGS).filter((b) => b.faction === 'hivekin');
    expect(works.filter((b) => b.endingPart === 'hive')).toHaveLength(2);
    expect(works.filter((b) => b.victory === 'hive')).toHaveLength(1);
    expect(TECHS_BY_ID['all-is-the-hive'].flags).toContain('ending');
  });

  it('never offers a caste to a side that cannot grow it', () => {
    for (const t of TECHS) {
      for (const u of t.units) {
        const def = UNIT_TYPES[u];
        if (!def || t.faction === 'both') continue;
        expect(def.faction, `${t.id} grants ${u}`).toBe(t.faction);
      }
    }
  });
});

describe('the six who report', () => {
  it('fills the same roles as everybody else', () => {
    const mine = ADVISORS.filter((a) => a.faction === 'hivekin');
    expect(mine).toHaveLength(6);
    const roles = mine.map((a) => a.role).sort();
    const human = ADVISORS.filter((a) => a.faction === 'human')
      .map((a) => a.role)
      .sort();
    expect(roles).toEqual(human);
  });

  it('never exclaims, asks a rhetorical question, or calls anything a disaster', () => {
    // The register is the hardest thing to keep and the easiest to check: if a
    // line would sound right in the Blademaster's mouth, it is wrong in theirs.
    const forbidden = /!|\?|disaster|terrible|wonderful|excellent|brilliant|catastroph/i;
    for (const a of ADVISORS.filter((x) => x.faction === 'hivekin')) {
      for (const line of a.idle) {
        expect(line, `${a.id} idle`).not.toMatch(forbidden);
      }
    }
  });
});

describe('the people in the Hives', () => {
  it('has the fewest sorts of anybody, which is the joke', () => {
    const count = (f: string) => CITIZEN_RACES.filter((r) => r.faction === f).length;
    expect(count('hivekin')).toBe(4);
    expect(count('hivekin')).toBeLessThan(count('orc'));
  });

  it('asks for advances the Hivekin can actually learn', () => {
    for (const r of CITIZEN_RACES.filter((x) => x.faction === 'hivekin')) {
      if (!r.needs) continue;
      const tech = TECHS_BY_ID[r.needs];
      expect(tech, `${r.id} needs ${r.needs}`).toBeDefined();
      expect(['both', 'hivekin']).toContain(tech.faction);
    }
  });
});

describe('a side that does not come to the table', () => {
  it('says so in one place, and the rest of the game reads it', () => {
    expect(talks('orc')).toBe(true);
    expect(talks('human')).toBe(true);
    expect(talks('hivekin')).toBe(false);
  });

  it('is not quietly included in somebody else’s peace', () => {
    const state = board();
    const hive = withHive(state);
    expect(PEACE.enabled).toBe(true);
    signPeace(state, { from: 0, to: 1, gold: 0 });

    // The two who signed it are at peace and may not fight.
    expect(atPeace(state, 0, 1)).toBe(true);
    expect(hostile(state, 0, 1)).toBe(false);

    // The third side signed nothing. Before this rule the peace was a single
    // global flag, so both of these came back the wrong way round and nobody
    // could attack the Hivekin at all.
    expect(atPeace(state, 0, hive)).toBe(false);
    expect(atPeace(state, 1, hive)).toBe(false);
    expect(hostile(state, 0, hive)).toBe(true);
    expect(hostile(state, 1, hive)).toBe(true);
  });

  it('leaves exactly one rival for each side that does talk', () => {
    expect(rivalFactions('orc')).toEqual(['human', 'hivekin']);
    expect(rivalFactions('orc').filter(talks)).toEqual(['human']);
    expect(rivalFactions('human').filter(talks)).toEqual(['orc']);
  });
});

describe('a new Hive', () => {
  it('opens by building something it can actually build', () => {
    const state = board();
    const hive = withHive(state);
    const grub = spawnUnit(state, hive, 'grub', 10, 10);
    const city = foundCity(state, grub);
    expect(city).not.toBeNull();
    // The bug this replaces said `orc ? goblin : footman`, so a Hive would have
    // opened by trying to grow a Footman. Section 123's settler-prize bug again.
    expect(city!.producing).toEqual({ kind: 'unit', id: 'fodder' });
    expect(UNIT_TYPES['fodder'].faction).toBe('hivekin');
  });

  it('has her in it, immobile, and only the first one does', () => {
    const state = board();
    const hive = withHive(state);
    const first = foundCity(state, spawnUnit(state, hive, 'grub', 10, 10))!;
    const queens = playerUnits(state, hive).filter((u) => u.type === 'queen');
    expect(queens).toHaveLength(1);
    expect(queens[0].x).toBe(first.x);
    expect(queens[0].y).toBe(first.y);

    // A second Hive is a second Hive, not a second Queen. That is the ending.
    foundCity(state, spawnUnit(state, hive, 'grub', 14, 10));
    expect(playerUnits(state, hive).filter((u) => u.type === 'queen')).toHaveLength(1);
  });

  it('puts nobody in anybody else’s city', () => {
    const state = board();
    const orc = foundCity(state, spawnUnit(state, 0, 'peon', 6, 6))!;
    placeQueen(state, orc);
    expect(state.units.some((u) => u.type === 'queen')).toBe(false);
  });
});

describe('the three follies', () => {
  function hiveCity(state: GameState, owner: number): City {
    const city = foundCity(state, spawnUnit(state, owner, 'grub', 10, 10))!;
    city.size = 4;
    assignWorkers(state, city);
    return city;
  }

  it('makes the Undercity’s shields survive a pillaging, by not being on a tile', () => {
    const state = board();
    const hive = withHive(state);
    const city = hiveCity(state, hive);
    const before = cityYield(state, city).shields;

    city.buildings.push('undercity');
    expect(cityYield(state, city).shields).toBe(before + BUILDINGS['undercity'].cityShields!);

    // The whole of Jeremy's rule: take every worked tile away -- which is worse
    // than any pillaging could manage -- and the Undercity still pays.
    city.workedTiles = [];
    expect(cityYield(state, city).shields).toBeGreaterThanOrEqual(
      BUILDINGS['undercity'].cityShields!,
    );
  });

  it('discounts castes grown in a Broodwarmth Hive, and nothing else', () => {
    const state = board();
    const hive = withHive(state);
    const city = hiveCity(state, hive);
    const unit = { kind: 'unit', id: 'soldier' } as const;
    const building = { kind: 'building', id: 'granary' } as const;
    const unitBefore = productionCostIn(state, city, unit);
    const buildingBefore = productionCostIn(state, city, building);

    city.buildings.push('broodwarmth');

    expect(productionCostIn(state, city, unit)).toBeLessThan(unitBefore);
    // A building costs what it costs. It is a warm place to grow things in, not
    // a tax break.
    expect(productionCostIn(state, city, building)).toBe(buildingBefore);
  });

  it('sharpens two named castes with the Shell, and leaves the rest alone', () => {
    const state = board();
    const hive = withHive(state);
    const city = hiveCity(state, hive);
    const foe = spawnUnit(state, 0, 'footman', 11, 10);
    const lord = spawnUnit(state, hive, 'broodlord', 10, 11);
    const grunt = spawnUnit(state, hive, 'soldier', 9, 10);
    const lordBefore = attackStrength(state, lord, foe).total;
    const gruntBefore = attackStrength(state, grunt, foe).total;

    city.buildings.push('oldQueensShell');

    expect(attackStrength(state, lord, foe).total).toBeGreaterThan(lordBefore);
    expect(attackStrength(state, grunt, foe).total).toBe(gruntBefore);
  });
});

describe('three sides, counted', () => {
  it('asks the same dominance of each rival however many there are', () => {
    // 0.75 means "three times what the other side has". With two rivals that is
    // three fifths of the map, not three quarters -- and three quarters with two
    // rivals is an ending that can never fire.
    expect(dominanceShare(2)).toBeCloseTo(0.75, 5);
    expect(dominanceShare(3)).toBeCloseTo(0.6, 5);
    expect(dominanceShare(4)).toBeCloseTo(0.5, 5);
  });

  it('knows three factions and gives each one a full definition', () => {
    expect(FACTION_IDS).toHaveLength(3);
    for (const id of FACTION_IDS) {
      const def = FACTIONS[id];
      expect(def.cityNames.length, `${id} names`).toBe(24);
      expect(def.blurb.length, `${id} blurb`).toBeGreaterThan(20);
      expect(UNIT_TYPES[def.settlerUnit]?.settler, `${id} settler`).toBe(true);
      expect(UNIT_TYPES[def.starterUnit]?.faction, `${id} starter`).toBe(id);
    }
  });

  it('is not offered as a side to play, having no opening of its own', () => {
    // Out of scope for this slice and deliberately so: emergence exists to
    // leave the measured opening alone, and a Hivekin opening would be a new
    // one that nobody has measured. The picker reads the field rather than
    // guessing from `talks`, because a later faction could emerge and
    // negotiate, or start on the map and refuse to.
    expect(STARTING_FACTIONS).toEqual(['orc', 'human']);
    expect(FACTIONS.hivekin.startsOnMap).toBe(false);
  });

  it('does not put the Hivekin on the map at turn one', () => {
    const state = createGame({ seed: 7, width: 30, height: 20 });
    expect(state.players).toHaveLength(2);
    expect(hivekinOf(state)).toBeNull();
    expect(state.players.map((p) => p.faction).sort()).toEqual(['human', 'orc']);
  });

  it('draws an arrival turn inside its window, from the seed rather than the stream', () => {
    // Taking nothing from the shared stream is what lets an arm with the
    // Hivekin switched off be the same game as before this section, rather than
    // a differently-shuffled one.
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const a = createGame({ seed, width: 30, height: 20 });
      const b = createGame({ seed, width: 30, height: 20 });
      expect(a.rngState).toBe(b.rngState);
      const at = a.hivekinAt;
      if (at !== undefined) seen.add(at);
    }
    for (const at of seen) {
      expect(at).toBeGreaterThanOrEqual(HIVEKIN.from);
      expect(at).toBeLessThanOrEqual(HIVEKIN.until);
    }
  });
});
