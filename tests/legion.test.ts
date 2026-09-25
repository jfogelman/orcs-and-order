import { afterEach, describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { BARBARIANS, spawnWave } from '../src/sim/barbarians';
import { LEGION, RAIDER_TIERS, bountyFor, lastWords, waveRoster } from '../src/sim/wilds';
import { canStandOn, tryStep } from '../src/sim/movement';
import { defenseStrength } from '../src/sim/combat';
import { UNIT_TYPES, unitType } from '../src/model/units';
import { assignWorkers } from '../src/sim/city';
import { barbarianOf, createGame, spawnUnit } from '../src/sim/gamestate';
import { idx } from '../src/engine/grid';

/**
 * Section 122: the Sunken Legion, the raider bible's coastal faction.
 *
 * They wade -- shallow water and dry land both, never the deep -- and a wave
 * that is due rolls for the sea where there is one, landing instead of a
 * Wildland wave rather than as well as.
 */

const saved = { ...LEGION };
afterEach(() => {
  Object.assign(LEGION, saved);
});

/** Dry land on the left, shallows in the middle, deep water on the right. */
function coast(): GameState {
  const state = createGame({ seed: 20260924, width: 40, height: 20, barbarians: true });
  state.units.length = 0;
  state.cities.length = 0;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const i = idx(x, y, state.width);
      state.terrain[i] = x < 15 ? 'grass' : x < 25 ? 'water' : 'deep';
    }
  }
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const city: City = {
    id: 1, owner: 0, name: 'Harbour', x: 5, y: 10, size: 4, food: 0, shields: 0,
    buildings: ['walls'], producing: { kind: 'coin' }, workedTiles: [], disorder: false,
    foundedTurn: 1, foundedBy: 0,
  };
  state.cities.push(city);
  assignWorkers(state, city);
  state.turn = BARBARIANS.notBefore;
  state.log.length = 0;
  return state;
}

describe('wading', () => {
  it('is shallow water and dry land, and never the deep', () => {
    const sailor = UNIT_TYPES[LEGION.grunt.id];
    expect(canStandOn(sailor, 'grass')).toBe(true);
    expect(canStandOn(sailor, 'water')).toBe(true);
    expect(canStandOn(sailor, 'deep')).toBe(false);
  });

  it('is theirs alone: an orc still cannot paddle', () => {
    expect(canStandOn(UNIT_TYPES.orc, 'water')).toBe(false);
    expect(canStandOn(UNIT_TYPES.raft, 'grass')).toBe(false);
  });

  it('walks a drowned sailor out of the surf and onto the beach', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const sailor = spawnUnit(state, wild.id, LEGION.grunt.id, 15, 10, false);

    expect(tryStep(state, sailor, 14, 10).kind).toBe('moved');
    expect([sailor.x, sailor.y]).toEqual([14, 10]);
  });

  it('refuses the deep, and says which', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const sailor = spawnUnit(state, wild.id, LEGION.grunt.id, 24, 10, false);

    const stopped = tryStep(state, sailor, 25, 10);
    expect(stopped.kind).toBe('blocked');
    expect(stopped.kind === 'blocked' && stopped.reason).toMatch(/shallows/i);
  });

  it('can be hit from the beach while it is still in the water', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    spawnUnit(state, wild.id, LEGION.grunt.id, 15, 10, false);
    const orc = spawnUnit(state, 0, 'orc', 14, 10, false);

    // A fight, not a refusal: the old rule was "nobody wades out to fight a
    // ship", and a thing standing in the surf is not a ship.
    const swung = tryStep(state, orc, 15, 10);
    expect(swung.kind).toBe('combat');
  });
});

describe('a wave out of the sea', () => {
  it('lands in the shallows, not on the sand', () => {
    const state = coast();
    LEGION.share = 1;
    const born = spawnWave(state);

    expect(born.length).toBeGreaterThan(0);
    for (const u of born) {
      expect(unitType(u.type).wades).toBe(true);
      expect(state.terrain[idx(u.x, u.y, state.width)]).toBe('water');
    }
  });

  it('is the wilds instead, not as well, when the roll goes the other way', () => {
    const state = coast();
    LEGION.share = 0;
    const born = spawnWave(state);

    expect(born.length).toBeGreaterThan(0);
    for (const u of born) expect(unitType(u.type).wades).toBe(false);
  });

  it('never rolls for the sea on a map that has none', () => {
    const state = coast();
    state.terrain.fill('grass');
    LEGION.share = 1;
    const born = spawnWave(state);

    expect(born.length).toBeGreaterThan(0);
    for (const u of born) expect(unitType(u.type).wades).toBe(false);
  });

  it('says so where somebody was watching', () => {
    const state = coast();
    LEGION.share = 1;
    spawnWave(state);
    expect(state.log.some((e) => e.subject === 'raiders-surfaced')).toBe(true);
  });

  it('grows its own tiers with the empires, like the wilds do', () => {
    const state = coast();
    for (const p of state.players) p.techs = new Array(20).fill('x');
    const roster = waveRoster(state, 5, true);
    expect(roster).toContain(LEGION.leader.id);
    expect(roster).toContain(LEGION.elite.id);
    // And the wilds' own roster is untouched by any of it.
    expect(waveRoster(state, 5, false)).toContain(RAIDER_TIERS.leader.id);
  });

  it('pays the same purses as the wilds for the two big ones', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    expect(bountyFor(spawnUnit(state, wild.id, LEGION.leader.id, 20, 5, false))).toBe(
      LEGION.leader.bounty,
    );
    expect(bountyFor(spawnUnit(state, wild.id, LEGION.elite.id, 20, 6, false))).toBe(
      LEGION.elite.bounty,
    );
    expect(bountyFor(spawnUnit(state, wild.id, LEGION.grunt.id, 20, 7, false))).toBe(0);
  });
});

describe('a Bilge Wraith at the wall', () => {
  it('is not slowed by one', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const town = state.cities[0];
    const garrison = spawnUnit(state, 0, 'orc', town.x, town.y, false);
    const wraith = spawnUnit(state, wild.id, LEGION.elite.id, town.x + 1, town.y, false);
    const sailor = spawnUnit(state, wild.id, LEGION.grunt.id, town.x, town.y + 1, false);

    const throughWalls = defenseStrength(state, garrison, wraith);
    const overThem = defenseStrength(state, garrison, sailor);

    expect(throughWalls.wallsMult).toBe(1);
    expect(overThem.wallsMult).toBeGreaterThan(1);
    expect(throughWalls.total).toBeLessThan(overThem.total);
  });

  it('takes nothing off the ground or the fortifying, only the buildings', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const town = state.cities[0];
    town.buildings = [];
    const garrison = spawnUnit(state, 0, 'orc', town.x, town.y, false);
    const wraith = spawnUnit(state, wild.id, LEGION.elite.id, town.x + 1, town.y, false);
    const sailor = spawnUnit(state, wild.id, LEGION.grunt.id, town.x, town.y + 1, false);

    expect(defenseStrength(state, garrison, wraith).total).toBeCloseTo(
      defenseStrength(state, garrison, sailor).total,
      5,
    );
  });
});

describe('a Drowned Captain, going down', () => {
  it('leaves his crew standing where he fell', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const captain = spawnUnit(state, wild.id, LEGION.leader.id, 15, 10, false);
    const killer = spawnUnit(state, 0, 'orc', 14, 10, false);
    state.units = state.units.filter((u) => u !== captain);

    lastWords(state, killer, captain);

    const crew = state.units.filter((u) => u.type === LEGION.grunt.id);
    expect(crew).toHaveLength(LEGION.leader.lastWords);
  });

  it('pulls a boat under with him, if one came close enough', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const captain = spawnUnit(state, wild.id, LEGION.leader.id, 16, 10, false);
    const killer = spawnUnit(state, 0, 'orc', 14, 10, false);
    const boat = spawnUnit(state, 0, 'raft', 17, 10, false);
    state.units = state.units.filter((u) => u !== captain);

    lastWords(state, killer, captain);

    expect(state.units).not.toContain(boat);
    expect(state.log.some((e) => /pulled under/i.test(e.text))).toBe(true);
  });

  it('cannot reach a boat that stayed out of it', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const captain = spawnUnit(state, wild.id, LEGION.leader.id, 16, 10, false);
    const killer = spawnUnit(state, 0, 'orc', 14, 10, false);
    // Jeremy's constraint: within two, not any. This one is five away.
    const boat = spawnUnit(state, 0, 'raft', 21, 10, false);
    state.units = state.units.filter((u) => u !== captain);

    lastWords(state, killer, captain);

    expect(state.units).toContain(boat);
  });

  it('does none of it for a sailor or a wildland chieftain', () => {
    const state = coast();
    const wild = barbarianOf(state)!;
    const sailor = spawnUnit(state, wild.id, LEGION.grunt.id, 16, 10, false);
    const killer = spawnUnit(state, 0, 'orc', 14, 10, false);
    const boat = spawnUnit(state, 0, 'raft', 17, 10, false);
    state.units = state.units.filter((u) => u !== sailor);

    lastWords(state, killer, sailor);

    expect(state.units).toContain(boat);
    expect(state.units.filter((u) => u.type === LEGION.grunt.id)).toHaveLength(0);
  });
});

describe('the lever', () => {
  it('off, the sea is quiet and the wilds are as they were', () => {
    LEGION.enabled = false;
    const state = coast();
    LEGION.share = 1;
    const born = spawnWave(state);
    expect(born.length).toBeGreaterThan(0);
    for (const u of born) expect(unitType(u.type).wades).toBe(false);
  });
});
