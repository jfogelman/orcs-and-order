import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/model/buildings';
import type { City, GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import {
  capitalOf,
  inSupply,
  productionCostIn,
  supplyChain,
  supplyQuality,
  SUPPLY,
  suppliesArmy,
} from '../src/sim/city';
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
    // Close enough to link back to the capital, which an outpost must be.
    const taken = place(state, 0, 5 + SUPPLY.linkRange, 5);
    taken.foundedTurn = 40;
    const unit = spawnUnit(state, 0, 'orc', taken.x, taken.y);
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
    const forward = place(state, 0, 5 + SUPPLY.linkRange, 5);
    forward.foundedTurn = 40;
    const unit = spawnUnit(state, 0, 'orc', forward.x, forward.y + SUPPLY.range);
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
    const taken = place(state, 1, 2 + SUPPLY.linkRange, 2);
    taken.foundedTurn = 30;
    const orc = spawnUnit(state, 0, 'orc', taken.x, taken.y);
    expect(inSupply(state, orc)).toBe(false);
    taken.owner = 0;
    expect(inSupply(state, orc), 'a captured city fed the army for free').toBe(false);
    taken.buildings.push('outpost');
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
  it('builds outposts in forward cities, given a map that calls for one', () => {
    // Without this the whole mechanic is just a penalty nobody can answer:
    // the AI's build priorities have no other route to an outpost.
    //
    // Tried across several maps rather than one. Whether a game ever produces
    // a city far enough out to need a depot depends on the shape of the map
    // and how the war goes -- deeper sacking keeps fronts closer to home, and
    // pinning this to a single seed made it fail for a reason that had
    // nothing to do with the machinery under test.
    const seeds = [4242, 1, 7919, 31337, 909];
    const built = seeds.map((seed) => {
      const state = createGame({ seed });
      state.players[0].controller = 'ai';
      beginPlayerTurn(state, 0);
      for (let i = 0; i < 400 && state.winner === null; i++) {
        runAiTurn(state, state.activePlayer);
        endPlayerTurn(state);
      }
      return state.cities.filter((c) =>
        c.buildings.some((b) => BUILDINGS[b]?.suppliesArmy),
      ).length;
    });
    expect(
      built.some((n) => n > 0),
      `no AI on any of ${seeds.length} maps ever built anywhere to supply from`,
    ).toBe(true);
  });
});

describe('supply as a chain rather than a switch', () => {
  it('carries supply along a run of outposts', () => {
    const state = board();
    place(state, 0, 5, 5);
    const near = place(state, 0, 5 + SUPPLY.linkRange, 5);
    const far = place(state, 0, 5 + SUPPLY.linkRange * 2, 5);
    for (const c of [near, far]) {
      c.foundedTurn = 50;
      c.buildings.push('outpost');
    }
    const chain = supplyChain(state, 0);
    expect(chain.get(near.id)).toBe(1);
    expect(chain.get(far.id), 'the far post should link through the near one').toBe(2);
  });

  it('leaves a lone distant depot out of the chain entirely', () => {
    // The whole point of the redesign: one outpost planted deep in somebody
    // else's country supplies nothing, because there is nothing behind it.
    const state = board();
    place(state, 0, 5, 5);
    const stranded = place(state, 0, 5 + SUPPLY.linkRange * 2, 5);
    stranded.foundedTurn = 50;
    stranded.buildings.push('outpost');
    expect(supplyChain(state, 0).has(stranded.id)).toBe(false);

    const bridge = place(state, 0, 5 + SUPPLY.linkRange, 5);
    bridge.foundedTurn = 60;
    bridge.buildings.push('outpost');
    expect(supplyChain(state, 0).has(stranded.id)).toBe(true);
  });

  it('fades with distance instead of stopping dead', () => {
    const state = board();
    place(state, 0, 10, 10);
    const inside = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range, 10);
    const justPast = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range + 1, 10);
    const wayOut = spawnUnit(state, 0, 'orc', 10 + SUPPLY.range * 3, 10);
    expect(supplyQuality(state, inside)).toBe(1);
    const edge = supplyQuality(state, justPast);
    expect(edge, 'a step past the line should not be total collapse').toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(supplyQuality(state, wayOut)).toBe(0);
  });

  it('charges more for an outpost the further out it is', () => {
    const state = board();
    place(state, 0, 5, 5);
    const near = place(state, 0, 8, 5);
    const far = place(state, 0, 30, 5);
    for (const c of [near, far]) c.foundedTurn = 50;
    const item = { kind: 'building', id: 'outpost' } as const;
    expect(productionCostIn(state, near, item)).toBeGreaterThan(BUILDINGS.outpost.cost);
    expect(
      productionCostIn(state, far, item),
      'distance should cost something',
    ).toBeGreaterThan(productionCostIn(state, near, item));
  });

  it('does not inflate the price of anything else', () => {
    const state = board();
    place(state, 0, 5, 5);
    const far = place(state, 0, 30, 5);
    far.foundedTurn = 50;
    const granary = { kind: 'building', id: 'granary' } as const;
    expect(productionCostIn(state, far, granary)).toBe(BUILDINGS.granary.cost);
  });
});
