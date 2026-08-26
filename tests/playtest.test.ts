import { describe, expect, it } from 'vitest';
import { unitType } from '../src/model/units';
import type { City, GameState } from '../src/model/types';
import { resupply, resupplyBlocked } from '../src/sim/combat';
import { REARM_TURNS } from '../src/sim/abilities';
import { SETTLER, buildOptions, capitalOf, foundCity, productionCostIn } from '../src/sim/city';
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

  /**
   * A single throw per game was priced for a unit with three times the health
   * this one now has -- flat health and the one-way disarm landed on the same
   * creature in the same week, and the AI never built one again. The axe was
   * always lying over there; now it gets fetched. See DESIGN_QUEUE section 38.
   */
  it('fetches its own axe back after a couple of turns', () => {
    const state = arena();
    city(state, 0, 10, 10);
    const thrower = spawnUnit(state, 0, 'axethrower', 20, 20, false);
    thrower.disarmed = true;
    thrower.rearmIn = REARM_TURNS;

    for (let i = 0; i < REARM_TURNS - 1; i++) {
      beginPlayerTurn(state, 0);
      expect(thrower.disarmed, 'rearmed too early').toBe(true);
    }
    beginPlayerTurn(state, 0);

    // Nowhere near a city of ours: this is the slow way, and it has to work
    // out in the field or it does not solve anything.
    expect(thrower.disarmed).toBe(false);
    expect(thrower.rearmIn).toBeUndefined();
  });

  it('does not fetch one for a unit that never threw anything', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 10, 11, false);
    beginPlayerTurn(state, 0);
    expect(orc.rearmIn).toBeUndefined();
    expect(orc.disarmed).toBe(false);
  });

  it('drops the pending fetch when it restocks at a city instead', () => {
    const state = arena();
    city(state, 0, 10, 10);
    const thrower = spawnUnit(state, 0, 'axethrower', 11, 10, false);
    thrower.disarmed = true;
    thrower.rearmIn = REARM_TURNS;

    expect(resupply(state, thrower)).toBe(true);
    expect(thrower.disarmed).toBe(false);
    // Left behind, this would rearm a unit that is already armed and log a
    // second message for the same axe.
    expect(thrower.rearmIn).toBeUndefined();
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
 * Sending settlers out is gated on how big the city is, rather than charged per
 * settler. The charge was measured first and rejected: it braked expansion no
 * more reliably than nothing at all, and cost the Horde about half its wins,
 * because a cost denominated in citizens is regressive against whoever builds
 * small cities. See DESIGN_QUEUE section 17.
 */
describe('settlers need a city big enough to spare them', () => {
  function cityBuilding(size: number, id: string) {
    const state = createGame({ seed: 20260821, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const c = foundCity(state, settler)!;
    c.size = size;
    c.producing = { kind: 'unit', id } as never;
    c.shields = productionCostIn(state, c, c.producing);
    return { state, city: c };
  }

  it('lets a city at the threshold send one, and keeps its citizens', () => {
    const { state, city } = cityBuilding(SETTLER.minCitySize, 'peon');
    const before = city.size;
    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    // No per-settler charge: that was the version that hurt the small-city side.
    expect(city.size).toBe(before);
    expect(state.units.filter((u) => u.owner === 0 && u.type === 'peon').length).toBeGreaterThan(1);
  });

  it('holds the shields when the city is below the threshold', () => {
    const { state, city } = cityBuilding(SETTLER.minCitySize - 1, 'peon');
    const shields = city.shields;
    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    expect(city.size).toBe(SETTLER.minCitySize - 1);
    expect(city.shields).toBeGreaterThanOrEqual(shields);
    expect(state.cities).toContain(city);
  });

  it('does not offer a settler to a city too small for one', () => {
    const { state, city } = cityBuilding(1, 'goblin');
    expect(buildOptions(state, city).units.some((u) => u.settler)).toBe(false);

    city.size = SETTLER.minCitySize;
    expect(buildOptions(state, city).units.some((u) => u.settler)).toBe(true);
  });

  it('leaves anything that is not a settler alone', () => {
    const { state, city } = cityBuilding(1, 'goblin');
    beginPlayerTurn(state, 0);
    endPlayerTurn(state);
    expect(city.size).toBe(1);
  });
});
