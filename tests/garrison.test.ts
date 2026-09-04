import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { assignWorkers, garrisonOf, unitsInCity } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function board(): GameState {
  const state = createGame({ seed: 20260905, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(2);
  return state;
}

function town(state: GameState, owner = 0, x = 10, y = 9): City {
  const c: City = {
    id: state.cities.length + 1, owner, name: 'Someplace', x, y, size: 3,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  assignWorkers(state, c);
  return c;
}

/**
 * Clicking your own city opens the city, whatever is standing on the tile. It
 * used to take the first click to select the unit and a second to reach the
 * city, which began exactly when a city finished building something -- what a
 * city builds stands on the tile awake, and only resting units were handled.
 *
 * That makes the panel's list the only way back to a unit standing in a city,
 * so it has to list all of them and not only the ones tucked out of sight.
 */
describe('what a city says is standing in it', () => {
  it('lists a unit that has just been built and has no orders yet', () => {
    const state = board();
    const city = town(state);
    const fresh = spawnUnit(state, 0, 'goblin', city.x, city.y, false);

    // The case the whole change is about: nothing else can reach this unit by
    // clicking, so leaving it out would strand it.
    expect(unitsInCity(state, city).map((u) => u.id)).toContain(fresh.id);
    expect(fresh.order).toBe('none');
  });

  it('lists the ones resting out of sight as well', () => {
    const state = board();
    const city = town(state);
    const dug = spawnUnit(state, 0, 'goblin', city.x, city.y, false);
    dug.order = 'fortified';
    const watching = spawnUnit(state, 0, 'goblin', city.x, city.y, false);
    watching.order = 'sentry';

    expect(unitsInCity(state, city)).toHaveLength(2);
  });

  it('leaves the number drawn on the city counting only the hidden ones', () => {
    const state = board();
    const city = town(state);
    const dug = spawnUnit(state, 0, 'goblin', city.x, city.y, false);
    dug.order = 'fortified';
    spawnUnit(state, 0, 'goblin', city.x, city.y, false);

    // The badge exists because a garrison you cannot see is how a city is lost
    // while you thought it was held. A unit drawn on the tile is already
    // visible, so counting it there would say two where one is hidden.
    expect(garrisonOf(state, city)).toHaveLength(1);
    expect(unitsInCity(state, city)).toHaveLength(2);
  });

  it('does not count somebody else standing on the tile', () => {
    const state = board();
    const city = town(state);
    spawnUnit(state, 1, 'footman', city.x, city.y, false);

    expect(unitsInCity(state, city)).toHaveLength(0);
  });

  it('does not count your own units standing next door', () => {
    const state = board();
    const city = town(state);
    spawnUnit(state, 0, 'goblin', city.x + 1, city.y, false);

    expect(unitsInCity(state, city)).toHaveLength(0);
  });

  it('says nobody is there when nobody is', () => {
    const state = board();
    expect(unitsInCity(state, town(state))).toHaveLength(0);
  });
});
