import { afterEach, describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_IDS } from '../src/model/buildings';
import { TECHS, TECHS_BY_ID } from '../src/model/techs';
import type { City, GameState } from '../src/model/types';
import { deserialize, serialize } from '../src/persist/save';
import { abilityTargets } from '../src/sim/abilities';
import { assignWorkers, buildOptions, contentLimit, rushBlocked } from '../src/sim/city';
import { attackStrength, defenseStrength } from '../src/sim/combat';
import { workBanked } from '../src/sim/endings';
import { FOLLIES } from '../src/sim/follyEffects';
import { createGame, recomputeVisibility, spawnUnit } from '../src/sim/gamestate';
import { researchableTechs } from '../src/sim/research';
import { effectiveSight } from '../src/sim/rules';
import { endPlayerTurn } from '../src/sim/turn';

/**
 * Section 111: the follies.
 *
 * The same empty board as the endings tests: two cities a side, far apart, nobody
 * in them. City 1 is the Horde's oldest and 2 its other; 3 is the Kingdom's oldest
 * and 4 its other.
 */
function game(): GameState {
  const state = createGame({ seed: 20260915, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  const place = (id: number, owner: number, x: number, y: number, foundedTurn: number) => {
    const c: City = {
      id, owner, name: `Place ${id}`, x, y, size: 4,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn,
    };
    state.cities.push(c);
    assignWorkers(state, c);
  };
  place(1, 0, 4, 4, 1);
  place(2, 0, 9, 4, 2);
  place(3, 1, 24, 15, 1);
  place(4, 1, 19, 15, 2);
  state.log.length = 0;
  return state;
}

const cityOf = (state: GameState, id: number) => state.cities.find((c) => c.id === id)!;
const ids = (state: GameState, c: City) => buildOptions(state, c).buildings.map((b) => b.id);
const follies = () => BUILDING_IDS.map((id) => BUILDINGS[id]).filter((b) => b.folly);

/** One whole calendar turn, both sides. */
function nextTurn(state: GameState): void {
  for (let i = 0; i < state.players.length; i++) endPlayerTurn(state);
}

/** Learn whatever advance carries this folly. */
function learnFor(state: GameState, playerId: number, folly: string): void {
  const tech = TECHS.find((t) => t.buildings.includes(folly))!;
  state.players[playerId].techs.push(tech.id, ...tech.prereqs);
}

afterEach(() => {
  FOLLIES.enabled = true;
});

describe('the roster', () => {
  it('has twelve: four shared, four a side, each on exactly one advance', () => {
    const all = follies();
    expect(all).toHaveLength(12);
    expect(all.filter((b) => b.folly === 'world' && b.faction === 'both')).toHaveLength(4);
    expect(all.filter((b) => b.folly === 'faction' && b.faction === 'orc')).toHaveLength(4);
    expect(all.filter((b) => b.folly === 'faction' && b.faction === 'human')).toHaveLength(4);
    for (const b of all) {
      expect(TECHS.filter((t) => t.buildings.includes(b.id)), b.id).toHaveLength(1);
    }
  });

  it('needs one new advance, off both kinds of magic', () => {
    const sky = TECHS_BY_ID['sky-argument'];
    expect(sky.prereqs.sort()).toEqual(['cryomancy', 'pyromancy']);
    expect(sky.buildings).toEqual(['skyArgumentSpire']);
  });
});

describe('who may build one', () => {
  it('offers a faction folly once per empire, one city at a time, never for gold', () => {
    const state = game();
    learnFor(state, 0, 'loudestRock');
    expect(ids(state, cityOf(state, 1))).toContain('loudestRock');
    cityOf(state, 2).producing = { kind: 'building', id: 'loudestRock' };
    expect(ids(state, cityOf(state, 1))).not.toContain('loudestRock');
    state.players[0].gold = 1_000_000;
    expect(rushBlocked(state, cityOf(state, 2))).not.toBeNull();
    cityOf(state, 2).buildings.push('loudestRock');
    cityOf(state, 2).producing = { kind: 'coin' };
    expect(ids(state, cityOf(state, 1))).not.toContain('loudestRock');
  });

  it('lets both sides race for a shared one, and nobody once it stands', () => {
    const state = game();
    learnFor(state, 0, 'firstLedger');
    learnFor(state, 1, 'firstLedger');
    cityOf(state, 1).producing = { kind: 'building', id: 'firstLedger' };
    expect(ids(state, cityOf(state, 3))).toContain('firstLedger');
    cityOf(state, 1).buildings.push('firstLedger');
    expect(ids(state, cityOf(state, 3))).not.toContain('firstLedger');
  });

  it('offers nothing, and not the new advance, while switched off', () => {
    const state = game();
    FOLLIES.enabled = false;
    learnFor(state, 0, 'loudestRock');
    expect(ids(state, cityOf(state, 1))).not.toContain('loudestRock');
    state.players[0].techs.push('insanity', 'pyromancy', 'cryomancy');
    expect(researchableTechs(state.players[0]).map((t) => t.id)).not.toContain('sky-argument');
    FOLLIES.enabled = true;
    expect(researchableTechs(state.players[0]).map((t) => t.id)).toContain('sky-argument');
  });
});

describe('the race', () => {
  it('keeps the shields through a switch, and hands the loser its shields back', () => {
    const state = game();
    learnFor(state, 0, 'firstLedger');
    learnFor(state, 1, 'firstLedger');
    const horde = cityOf(state, 1);
    const kingdom = cityOf(state, 3);
    kingdom.producing = { kind: 'building', id: 'firstLedger' };
    kingdom.shields = 60;
    nextTurn(state);
    const banked = workBanked(state, kingdom);
    expect(banked).toBeGreaterThanOrEqual(60);

    // A switch spends none of it.
    kingdom.producing = { kind: 'coin' };
    nextTurn(state);
    kingdom.producing = { kind: 'building', id: 'firstLedger' };
    expect(workBanked(state, kingdom)).toBe(banked);

    horde.producing = { kind: 'building', id: 'firstLedger' };
    horde.shields = BUILDINGS.firstLedger.cost;
    state.log.length = 0;
    nextTurn(state);

    expect(horde.buildings).toContain('firstLedger');
    expect(kingdom.buildings).not.toContain('firstLedger');
    expect(kingdom.producing.kind).toBe('coin');
    expect(state.players[1].worksBanked?.firstLedger).toBeUndefined();
    expect(kingdom.shields).toBeGreaterThanOrEqual(banked);
    expect(state.log.some((e) => e.player === 1 && /first/.test(e.text) && /go back/.test(e.text))).toBe(true);
    expect(state.log.some((e) => e.player === 1 && /There is only one\./.test(e.text))).toBe(true);
  });
});

describe('taking a city', () => {
  it('keeps a shared folly working for its new owner, and tears down a faction one', () => {
    const state = game();
    const place = cityOf(state, 2);
    place.buildings.push('firstLedger', 'loudestRock');
    place.owner = 1;
    nextTurn(state);
    expect(place.buildings).toContain('firstLedger');
    expect(place.buildings).not.toContain('loudestRock');
    expect(state.log.some((e) => /torn down by its new owners/.test(e.text))).toBe(true);
  });

  it('never sells one to cover a debt', () => {
    const state = game();
    cityOf(state, 1).buildings.push('bonepit', 'granary');
    state.players[0].gold = -1_000_000;
    nextTurn(state);
    expect(cityOf(state, 1).buildings).toContain('bonepit');
  });
});

describe('what they do', () => {
  it('The Long Peace calms every city of the empire holding it', () => {
    const state = game();
    const before = contentLimit(state, cityOf(state, 4));
    cityOf(state, 3).buildings.push('longPeaceMonument');
    expect(contentLimit(state, cityOf(state, 4))).toBe(before + 1);
    expect(contentLimit(state, cityOf(state, 2))).toBe(contentLimit(state, cityOf(state, 1)));
  });

  it('The Yelling Wall sees two rings further', () => {
    const state = game();
    const far = 9 * state.width + 24;
    recomputeVisibility(state, 1);
    expect(state.players[1].visible[far]).toBe(0);
    cityOf(state, 3).buildings.push('yellingWall');
    recomputeVisibility(state, 1);
    // Four rows up from Place 3, at (24, 15): out of reach before, in reach now.
    expect(state.players[1].visible[11 * state.width + 24]).toBe(1);
  });

  it('The Learned Committee lets every unit see further', () => {
    const state = game();
    const u = spawnUnit(state, 1, 'footman', 14, 10, false);
    const before = effectiveSight(state, state.players[1], u);
    cityOf(state, 4).buildings.push('learnedCommittee');
    expect(effectiveSight(state, state.players[1], u)).toBe(before + 1);
  });

  it('The Long Vigil stiffens only what rides', () => {
    const state = game();
    const knight = spawnUnit(state, 1, 'knight', 14, 12, false);
    const footman = spawnUnit(state, 1, 'footman', 15, 12, false);
    const k = defenseStrength(state, knight).total;
    const f = defenseStrength(state, footman).total;
    cityOf(state, 4).buildings.push('longVigilShrine');
    expect(defenseStrength(state, knight).total).toBeGreaterThan(k);
    expect(defenseStrength(state, footman).total).toBe(f);
  });

  it('The Loudest Rock and the Bonepit mark what is built beside them, for good', () => {
    const state = game();
    const city = cityOf(state, 1);
    city.buildings.push('loudestRock', 'bonepit');
    city.producing = { kind: 'unit', id: 'orc' };
    city.shields = 20;
    nextTurn(state);
    const orc = state.units.find((u) => u.owner === 0 && u.type === 'orc')!;
    expect(orc).toBeDefined();
    expect(orc.drilled).toBe(1);
    expect(orc.rank).toBe(1);

    const plain = spawnUnit(state, 0, 'orc', 12, 8, false);
    const target = spawnUnit(state, 1, 'footman', 13, 8, false);
    expect(attackStrength(state, orc, target).total).toBeGreaterThan(attackStrength(state, plain, target).total);

    const back = deserialize(serialize(state))!;
    expect(back.units.find((u) => u.id === orc.id)!.drilled).toBe(1);
  });

  it('The Long March hurries the Horde on its own land only', () => {
    const state = game();
    cityOf(state, 2).buildings.push('longMarchRoad');
    const home = spawnUnit(state, 0, 'orc', 5, 5, false);
    const away = spawnUnit(state, 0, 'orc', 15, 12, false);
    nextTurn(state);
    expect(home.moves).toBe(2);
    expect(away.moves).toBe(1);
  });

  it('The Rumbling Archive lets its mages strike from one further back', () => {
    const state = game();
    const mage = spawnUnit(state, 1, 'mage', 14, 10, false);
    const target = spawnUnit(state, 0, 'orc', 14, 7, false);
    recomputeVisibility(state, 1);
    expect(abilityTargets(state, mage, 'ranged').map((u) => u.id)).not.toContain(target.id);
    mage.reach = 1;
    expect(abilityTargets(state, mage, 'ranged').map((u) => u.id)).toContain(target.id);
  });
});
