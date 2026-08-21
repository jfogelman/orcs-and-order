import { describe, expect, it } from 'vitest';
import { unitType } from '../src/model/units';
import type { City, GameState } from '../src/model/types';
import { resupply, resupplyBlocked } from '../src/sim/combat';
import { buildOptions, capitalOf, foundCity, productionCostIn } from '../src/sim/city';
import { createGame, playerCities, recomputeVisibility, spawnUnit } from '../src/sim/gamestate';
import { runAiTurn } from '../src/ai/ai';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

function arena(): GameState {
  const state = createGame({ seed: 20260821, width: 30, height: 24 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

function city(state: GameState, owner: number, x: number, y: number): City {
  const c: City = {
    id: state.cities.length + 1, owner, name: 'Hold', x, y, size: 3,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  return c;
}

/**
 * A thrower that has lost its axe fights at a quarter strength for the rest of
 * the game unless it kills something, which for a ranged unit is a poor bet.
 * Reaching a city of your own is the answer -- reaching, not entering, because
 * a garrison standing on the tile would otherwise lock it out of its own stores.
 */
describe('resupply', () => {
  it('works from beside a city, not only inside one', () => {
    const state = arena();
    city(state, 0, 10, 10);
    const thrower = spawnUnit(state, 0, 'axethrower', 11, 10, false);
    thrower.disarmed = true;

    expect(resupplyBlocked(state, thrower)).toBeNull();
    expect(resupply(state, thrower)).toBe(true);
    expect(thrower.disarmed).toBe(false);
  });

  it('costs the rest of the turn', () => {
    const state = arena();
    city(state, 0, 10, 10);
    const thrower = spawnUnit(state, 0, 'axethrower', 11, 10, false);
    thrower.disarmed = true;

    resupply(state, thrower);
    // Loose an axe or restock one, not both. Without this the reach a thrower
    // buys by being weak afterwards would cost it nothing at all.
    expect(thrower.moves).toBe(0);
  });

  it('refuses out of reach, when already armed, and to units with no axe', () => {
    const state = arena();
    city(state, 0, 10, 10);

    const far = spawnUnit(state, 0, 'axethrower', 20, 20, false);
    far.disarmed = true;
    expect(resupplyBlocked(state, far)).toMatch(/within reach/);

    const armed = spawnUnit(state, 0, 'axethrower', 11, 10, false);
    expect(resupplyBlocked(state, armed)).toMatch(/already has/);

    const orc = spawnUnit(state, 0, 'orc', 10, 11, false);
    expect(resupplyBlocked(state, orc)).toMatch(/nothing to restock/);
  });

  it('will not restock from somebody else city', () => {
    const state = arena();
    city(state, 1, 10, 10);
    const thrower = spawnUnit(state, 0, 'axethrower', 11, 10, false);
    thrower.disarmed = true;

    expect(resupplyBlocked(state, thrower)).toMatch(/within reach/);
  });
});

/**
 * Founding on top of an enemy stack with nothing to defend the place is a gift:
 * the city falls next turn and the settler was spent handing it over.
 */
describe('the AI settling near danger', () => {
  const aiId = 1;

  function settlerAt(state: GameState, x: number, y: number) {
    const peon = state.units.find((u) => u.owner === aiId && unitType(u.type).settler);
    const settler = peon ?? spawnUnit(state, aiId, 'peasant', x, y, false);
    settler.x = x;
    settler.y = y;
    return settler;
  }

  it('does not found beside a visible attacker it cannot defend against', () => {
    const state = arena();
    settlerAt(state, 10, 10);
    spawnUnit(state, 0, 'orc', 11, 10, false);
    recomputeVisibility(state, aiId);

    runAiTurn(state, aiId);

    const founded = playerCities(state, aiId).some((c) => c.x === 10 && c.y === 10);
    expect(founded).toBe(false);
  });

  it('will found beside an attacker when something of ours is stood there', () => {
    const state = arena();
    const settler = settlerAt(state, 10, 10);
    spawnUnit(state, 0, 'orc', 12, 10, false);
    // A guard of our own next door changes the answer, which is the point: the
    // rule is about being undefended rather than about danger as such.
    spawnUnit(state, aiId, 'footman', 10, 11, false);
    recomputeVisibility(state, aiId);

    runAiTurn(state, aiId);

    // Either it founded here, or it walked somewhere better -- what it must not
    // do is refuse to settle at all because an enemy exists somewhere.
    const settled = playerCities(state, aiId).length > 0;
    const moved = settler.x !== 10 || settler.y !== 10;
    expect(settled || moved).toBe(true);
  });

  it('founds anyway when it has no cities at all', () => {
    const state = arena();
    settlerAt(state, 10, 10);
    spawnUnit(state, 0, 'orc', 11, 10, false);
    recomputeVisibility(state, aiId);

    // Having no city is worse than having one that may be taken, so the
    // desperation case has to survive the new caution.
    for (let i = 0; i < 12; i++) {
      // beginPlayerTurn, not just runAiTurn: movement is handed out there, so
      // without it the settler spends its first turn and is frozen thereafter.
      beginPlayerTurn(state, aiId);
      runAiTurn(state, aiId);
    }

    expect(playerCities(state, aiId).length).toBeGreaterThan(0);
  });
});

/**
 * Taking somebody else's ancient capital used to move your own seat of
 * government into it, because the search was simply "oldest city you own".
 * That put the whole supply network on the front line on the turn you captured
 * a city, which is the reverse of what capturing one ought to do.
 */
describe('the capital', () => {
  it('does not move to a conquered city, however old it is', () => {
    const state = arena();
    const mine = city(state, 0, 10, 10);
    mine.foundedTurn = 20;
    mine.foundedBy = 0;

    const taken = city(state, 0, 16, 10);
    taken.foundedTurn = 2; // founded long before ours...
    taken.foundedBy = 1; // ...but by somebody else

    expect(capitalOf(state, 0)?.id).toBe(mine.id);
  });

  it('still finds one for a player living entirely in captured cities', () => {
    const state = arena();
    const taken = city(state, 0, 16, 10);
    taken.foundedTurn = 2;
    taken.foundedBy = 1;

    // Supply has to run from somewhere, so a fallback is required.
    expect(capitalOf(state, 0)?.id).toBe(taken.id);
  });

  it('takes the oldest of the cities a player actually founded', () => {
    const state = arena();
    const first = city(state, 0, 10, 10);
    first.foundedTurn = 5;
    first.foundedBy = 0;
    const later = city(state, 0, 14, 10);
    later.foundedTurn = 9;
    later.foundedBy = 0;

    expect(capitalOf(state, 0)?.id).toBe(first.id);
  });

  it('assumes the holder founded it when a save does not say', () => {
    const state = arena();
    const old = city(state, 0, 10, 10);
    old.foundedTurn = 3;
    delete old.foundedBy;

    expect(capitalOf(state, 0)?.id).toBe(old.id);
  });
});

/**
 * A settler is people, not equipment: the ones who walk out are the ones who
 * were living there. Without this a city of one could pump settlers forever
 * without ever shrinking, which made expansion very nearly free.
 */
describe('settlers cost a citizen', () => {
  function cityBuilding(size: number, id: string) {
    const state = createGame({ seed: 20260821, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const c = foundCity(state, settler)!;
    c.size = size;
    c.producing = { kind: 'unit', id } as never;
    c.shields = productionCostIn(state, c, c.producing);
    return { state, city: c };
  }

  it('takes one off the city when a settler is finished', () => {
    const { state, city } = cityBuilding(3, 'peon');
    beginPlayerTurn(state, 0);
    endPlayerTurn(state);
    expect(city.size).toBe(2);
  });

  it('leaves the city alone for anything that is not a settler', () => {
    const { state, city } = cityBuilding(3, 'goblin');
    beginPlayerTurn(state, 0);
    endPlayerTurn(state);
    expect(city.size).toBe(3);
  });

  it('will not let a city of one send its last citizen away', () => {
    const { state, city } = cityBuilding(1, 'peon');
    const shields = city.shields;
    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    // Holds the shields rather than destroying the city, the same way it holds
    // them when there is nowhere to put what it built.
    expect(city.size).toBe(1);
    expect(city.shields).toBeGreaterThanOrEqual(shields);
    expect(state.cities).toContain(city);
  });

  it('does not offer a settler to a city that cannot afford one', () => {
    const { state, city } = cityBuilding(1, 'goblin');
    const offered = buildOptions(state, city).units.filter((u) => u.settler);
    expect(offered).toHaveLength(0);

    city.size = 2;
    expect(buildOptions(state, city).units.some((u) => u.settler)).toBe(true);
  });
});
