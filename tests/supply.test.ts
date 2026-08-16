import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/model/buildings';
import type { City, GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { capitalOf, inSupply, SUPPLY, suppliesArmy } from '../src/sim/city';
import { attackStrength } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';
import { runAiTurn } from '../src/ai/ai';

/**
 * Supply.
 *
 * The rule that punishes wandering off. Its most interesting property is that
 * a captured city supplies its captor, so an advance that actually takes
 * ground pays for itself while a raid that takes nothing does not.
 */

function board(): GameState {
  const state = createGame({ seed: 909, width: 40, height: 30 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

function place(state: GameState, owner: number, x: number, y: number): City {
  const city: City = {
    id: state.cities.length + 1, owner, name: `C${state.cities.length}`, x, y, size: 4,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(city);
  return city;
}

describe('what actually supplies an army', () => {
  it('is the capital, which is the oldest city you still hold', () => {
    const state = board();
    const first = place(state, 0, 5, 5);
    const second = place(state, 0, 20, 20);
    second.foundedTurn = 40;
    expect(capitalOf(state, 0)?.id).toBe(first.id);
    expect(suppliesArmy(state, first)).toBe(true);
    expect(suppliesArmy(state, second)).toBe(false);
  });

  it('promotes the next oldest when the capital is lost', () => {
    const state = board();
    const first = place(state, 0, 5, 5);
    const second = place(state, 0, 20, 20);
    second.foundedTurn = 40;
    first.owner = 1;
    expect(capitalOf(state, 0)?.id).toBe(second.id);
  });

  it('does not scale with how many cities you own', () => {
    // The whole reason for the redesign: a bigger empire must not get a
    // denser supply network as a reward for already being bigger.
    const state = board();
    place(state, 0, 5, 5);
    for (let i = 0; i < 8; i++) {
      const c = place(state, 0, 10 + i * 2, 25);
      c.foundedTurn = 10 + i;
    }
    const supplying = state.cities.filter((c) => c.owner === 0 && suppliesArmy(state, c));
    expect(supplying).toHaveLength(1);
  });

  it('is extended by an outpost, and only by building one', () => {
    const state = board();
    place(state, 0, 5, 5);
    const taken = place(state, 0, 30, 20);
    taken.foundedTurn = 40;
    const unit = spawnUnit(state, 0, 'orc', 30, 20);
    expect(inSupply(state, unit)).toBe(false);
    taken.buildings.push('outpost');
    expect(inSupply(state, unit)).toBe(true);
  });

  it('gives each faction its own', () => {
    expect(BUILDINGS.outpost.faction).toBe('orc');
    expect(BUILDINGS.depot.faction).toBe('human');
    expect(BUILDINGS.outpost.suppliesArmy).toBe(true);
    expect(BUILDINGS.depot.suppliesArmy).toBe(true);
  });
});

describe('who is in supply', () => {
  it('counts anyone within range of a supplying city', () => {
    const state = board();
    place(state, 0, 10, 10);
    const near = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range, 10);
    const far = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range + 1, 10);
    expect(inSupply(state, near)).toBe(true);
    expect(inSupply(state, far)).toBe(false);
  });

  it('does not accept the enemy\u2019s cities as supply', () => {
    const state = board();
    place(state, 1, 10, 10);
    const orc = spawnUnit(state, 0, 'orc', 10, 10);
    expect(inSupply(state, orc)).toBe(false);
  });

  it('measures to the nearest supplying city, not merely the nearest one', () => {
    const state = board();
    place(state, 0, 5, 5);
    const forward = place(state, 0, 30, 20);
    forward.foundedTurn = 40;
    const unit = spawnUnit(state, 0, 'orc', 30, 20 + SUPPLY.range);
    // Standing next to a city of yours is not enough if it feeds nobody.
    expect(inSupply(state, unit)).toBe(false);
    forward.buildings.push('outpost');
    expect(inSupply(state, unit)).toBe(true);
  });

  it('does not supply a captor just for taking a city', () => {
    // Taking a city gives you the ground. Making it feed the army standing on
    // it costs shields, which is what stops a conquest paying for itself.
    const state = board();
    place(state, 0, 2, 2);
    const deep = place(state, 1, 30, 20);
    deep.foundedTurn = 30;
    const orc = spawnUnit(state, 0, 'orc', 30, 20);
    expect(inSupply(state, orc)).toBe(false);
    deep.owner = 0;
    expect(inSupply(state, orc), 'a captured city fed the army for free').toBe(false);
    deep.buildings.push('outpost');
    expect(inSupply(state, orc)).toBe(true);
  });
});

describe('what being out of supply costs', () => {
  it('weakens an attack', () => {
    const state = board();
    place(state, 0, 10, 10);
    const supplied = spawnUnit(state, 0, 'orc', 10, 10);
    const stranded = spawnUnit(state, 0, 'orc', 35, 25);
    const target = spawnUnit(state, 1, 'footman', 20, 15);
    const strong = attackStrength(state, supplied, target).total;
    const weak = attackStrength(state, stranded, target).total;
    expect(weak).toBeCloseTo(strong * SUPPLY.attackPenalty);
  });

  it('stops healing entirely, rather than slowing it', () => {
    // healUnits floors recovery at a point a turn, so "no healing" has to be
    // handled deliberately or it silently becomes "heals slowly".
    const state = board();
    place(state, 0, 2, 2);
    const stranded = spawnUnit(state, 0, 'orc', 35, 25);
    stranded.hp = 3;
    beginPlayerTurn(state, 0);
    expect(stranded.hp, 'a stranded unit healed anyway').toBe(3);
  });

  it('still heals a unit that is inside supply', () => {
    const state = board();
    place(state, 0, 10, 10);
    const home = spawnUnit(state, 0, 'orc', 12, 10);
    home.hp = 3;
    beginPlayerTurn(state, 0);
    expect(home.hp).toBeGreaterThan(3);
  });

  it('can be switched off entirely', () => {
    const state = board();
    place(state, 0, 2, 2);
    const stranded = spawnUnit(state, 0, 'orc', 35, 25);
    const before = SUPPLY.range;
    SUPPLY.range = 99;
    expect(inSupply(state, stranded)).toBe(true);
    const target = spawnUnit(state, 1, 'footman', 34, 25);
    expect(attackStrength(state, stranded, target).total).toBeCloseTo(
      unitType('orc').attack,
    );
    SUPPLY.range = before;
  });
});

describe('the AI keeps its army fed', () => {
  it('builds outposts in forward cities over a long game', () => {
    // Without this the whole mechanic is just a penalty nobody can answer:
    // the AI's build priorities have no other route to an outpost.
    const state = createGame({ seed: 4242 });
    state.players[0].controller = 'ai';
    beginPlayerTurn(state, 0);
    for (let i = 0; i < 400 && state.winner === null; i++) {
      runAiTurn(state, state.activePlayer);
      endPlayerTurn(state);
    }
    const built = state.cities.filter((c) =>
      c.buildings.some((b) => BUILDINGS[b]?.suppliesArmy),
    ).length;
    expect(built, 'neither AI ever built anywhere to supply from').toBeGreaterThan(0);
  });
});
