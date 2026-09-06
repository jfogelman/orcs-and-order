import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import {
  CALM,
  CELEBRATION,
  assignWorkers,
  cityCondition,
  contentLimit,
  foodSurplus,
  isCelebrating,
  isIdle,
} from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function board(): GameState {
  const state = createGame({ seed: 20260911, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  // Grass everywhere, so a city of any size has food to spare.
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(2);
  state.players[0].rates = { coin: 6, beakers: 6, calm: 0 };
  return state;
}

/**
 * A second city, so the subject is not the capital.
 *
 * `suppliesArmy` is true for the capital, and the supply mark outranks both new
 * ones -- so a lone city can never celebrate, which is correct and made the
 * first version of these tests measure the wrong thing.
 */
function seat(state: GameState): City {
  const c: City = {
    id: 1, owner: 0, name: 'Capital', x: 3, y: 3, size: 4, food: 0, shields: 0,
    buildings: [], producing: { kind: 'coin' }, autoBuild: 'coin',
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  assignWorkers(state, c);
  return c;
}

function town(state: GameState, over: Partial<City> = {}): City {
  if (state.cities.length === 0) seat(state);
  const c: City = {
    id: 2, owner: 0, name: 'Someplace', x: 10, y: 9, size: CELEBRATION.minSize,
    food: 0, shields: 0, buildings: ['totem'], producing: { kind: 'unit', id: 'goblin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
    ...over,
  };
  state.cities.push(c);
  assignWorkers(state, c);
  return c;
}

/**
 * Section 72: `celebration`, `idle` and `damaged` were drawn, processed and
 * unused, because the game had no state that meant any of them. It said
 * celebration was the one to take **if the happiness work in section 70
 * happened** -- which it now has.
 */
describe('a city worth being pleased about', () => {
  it('celebrates when it is content, sizeable and still growing', () => {
    const state = board();
    const city = town(state);
    // Sanity on the fixture rather than trust: this really is comfortable.
    expect(contentLimit(state, city) - city.size).toBeGreaterThanOrEqual(CELEBRATION.headroom);
    expect(foodSurplus(state, city)).toBeGreaterThan(0);
    expect(isCelebrating(state, city)).toBe(true);
  });

  it('does not celebrate merely for not rioting', () => {
    const state = board();
    // No Totem, so the headroom is only what the base limit gives.
    const city = town(state, { buildings: [], size: CALM.base });
    expect(city.disorder).toBe(false);
    expect(isCelebrating(state, city)).toBe(false);
  });

  it('does not celebrate while rioting', () => {
    const state = board();
    expect(isCelebrating(state, town(state, { disorder: true }))).toBe(false);
  });

  it('does not celebrate at a standstill', () => {
    const state = board();
    const city = town(state);
    // A city sitting comfortably and not growing is fine, which is not the
    // same as pleased with itself.
    city.workedTiles = [];
    expect(foodSurplus(state, city)).toBeLessThanOrEqual(0);
    expect(isCelebrating(state, city)).toBe(false);
  });

  it('does not celebrate for being new and tiny', () => {
    const state = board();
    // Two citizens with headroom to spare is an empty city, not a happy one.
    const city = town(state, { size: 2 });
    expect(contentLimit(state, city) - city.size).toBeGreaterThanOrEqual(CELEBRATION.headroom);
    expect(isCelebrating(state, city)).toBe(false);
  });

  it('does not celebrate while still smoking', () => {
    const state = board();
    const city = town(state);
    city.ruinedUntil = state.turn + 5;
    expect(isCelebrating(state, city)).toBe(false);
  });
});

/**
 * Section 72 called `idle` "a real state but a thin one", on the grounds that
 * `autoBuild` means a city always has something queued. What it always has is
 * *coin*, which is the city banking shields because nobody has told it what to
 * do -- and that is the state worth finding.
 */
describe('a city waiting to be told', () => {
  it('is idle when it banks shields because nobody has said otherwise', () => {
    const state = board();
    expect(isIdle(town(state, { producing: { kind: 'coin' } }))).toBe(true);
  });

  it('is not idle when it was told to bank them', () => {
    const state = board();
    // A city set to coin on purpose is doing its job. Marking it would train
    // the player to ignore the marker on the ones that matter.
    expect(isIdle(town(state, { producing: { kind: 'coin' }, autoBuild: 'coin' }))).toBe(false);
  });

  it('is not idle when it is building something', () => {
    const state = board();
    expect(isIdle(town(state))).toBe(false);
    expect(isIdle(town(state, { producing: { kind: 'building', id: 'granary' } }))).toBe(false);
  });

  it('is not idle on a standing order, even between things', () => {
    const state = board();
    expect(isIdle(town(state, { producing: { kind: 'coin' }, autoBuild: 'repeat' }))).toBe(false);
  });

  it('is not idle while placating a riot, which is a decision', () => {
    const state = board();
    expect(isIdle(town(state, { producing: { kind: 'calm' } }))).toBe(false);
  });
});

/**
 * One badge at a time, worst news first. Two new states join a list that was
 * entirely bad news, so the thing to check is that neither of them can hide
 * something the player needs to see.
 */
describe('which badge a city wears', () => {
  it('shows the new ones when nothing is wrong', () => {
    const state = board();
    expect(cityCondition(state, town(state))).toBe('celebration');
    state.cities.length = 0;
    expect(cityCondition(state, town(state, { producing: { kind: 'coin' } }))).toBe('idle');
    // And the capital keeps its supply mark, which outranks both.
    state.cities.length = 0;
    const capital = seat(state);
    expect(cityCondition(state, capital)).toBe('supplied');
  });

  it('never hides a riot behind an idle marker', () => {
    const state = board();
    // Both true at once: rioting and waiting for orders. Only one can show.
    const city = town(state, { disorder: true, producing: { kind: 'coin' } });
    expect(isIdle(city)).toBe(true);
    expect(cityCondition(state, city)).toBe('unrest');
  });

  it('never hides a siege behind a celebration', () => {
    const state = board();
    const city = town(state);
    expect(isCelebrating(state, city)).toBe(true);
    spawnUnit(state, 1, 'footman', city.x + 1, city.y, false);
    expect(cityCondition(state, city)).toBe('besieged');
  });

  it('never hides starvation behind either', () => {
    const state = board();
    const city = town(state, { size: 12, producing: { kind: 'coin' } });
    // Nobody out working: twelve citizens fed by the centre tile alone.
    city.workedTiles = [];
    expect(foodSurplus(state, city)).toBeLessThan(0);
    expect(cityCondition(state, city)).toBe('starving');
  });

  it('prefers being asked for orders over being pleased with itself', () => {
    const state = board();
    // A city can be both; the one that wants something from the player wins.
    const city = town(state, { producing: { kind: 'coin' } });
    expect(isCelebrating(state, city)).toBe(true);
    expect(cityCondition(state, city)).toBe('idle');
  });
});
