import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import type { City, GameState } from '../src/model/types';
import {
  assignWorkers,
  clearChosenTiles,
  honouredChoices,
  tileWorkable,
  toggleChosenTile,
} from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function board(): GameState {
  const state = createGame({ seed: 20260903, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(2);
  return state;
}

function town(state: GameState, size = 3, x = 10, y = 9, owner = 0): City {
  const c: City = {
    id: state.cities.length + 1, owner, name: 'Someplace', x, y, size,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  assignWorkers(state, c);
  return c;
}

const at = (state: GameState, x: number, y: number) => idx(x, y, state.width);

/**
 * DESIGN_QUEUE section 16. Citizens were assigned greedily with no way to
 * overrule it, which was tolerable while every tile of a kind was worth the
 * same. Land specials ended that: the greedy pick now chooses between things
 * it cannot weigh, and choosing wrongly is invisible.
 */
describe('picking which tiles a city works', () => {
  it('leaves a city nobody has touched entirely to the game', () => {
    const state = board();
    const city = town(state);
    // The default has to stay "it sorts itself out", or everybody is made to
    // care about something most players will never open.
    expect(city.chosenTiles).toBeUndefined();
    expect(city.workedTiles).toHaveLength(city.size);
  });

  it('works a tile the player picks', () => {
    const state = board();
    const city = town(state);
    const corner = at(state, 8, 8);

    expect(toggleChosenTile(state, city, corner)).toBe(true);
    expect(city.workedTiles).toContain(corner);
    expect(city.workedTiles).toHaveLength(city.size);
  });

  it('gives it back when the player picks it again', () => {
    const state = board();
    const city = town(state);
    const corner = at(state, 8, 8);

    toggleChosenTile(state, city, corner);
    toggleChosenTile(state, city, corner);

    expect(city.chosenTiles ?? []).not.toContain(corner);
    expect(city.workedTiles).toHaveLength(city.size);
  });

  it('keeps the choice when the city grows', () => {
    const state = board();
    const city = town(state, 2);
    const corner = at(state, 8, 8);
    toggleChosenTile(state, city, corner);

    city.size = 5;
    assignWorkers(state, city);

    // The whole point: a choice that growth reshuffles was not a choice.
    expect(city.workedTiles).toContain(corner);
    expect(city.workedTiles).toHaveLength(5);
  });

  it('keeps the choice when the city starves back down', () => {
    const state = board();
    const city = town(state, 5);
    const corner = at(state, 8, 8);
    toggleChosenTile(state, city, corner);

    city.size = 2;
    assignWorkers(state, city);

    expect(city.workedTiles).toContain(corner);
    expect(city.workedTiles).toHaveLength(2);
  });

  it('falls back for that one citizen when an enemy stands on the tile', () => {
    const state = board();
    const city = town(state, 3);
    const corner = at(state, 8, 8);
    toggleChosenTile(state, city, corner);

    spawnUnit(state, 1, 'footman', 8, 8, false);
    assignWorkers(state, city);

    // Dropped for now, and the city is still fully employed.
    expect(city.workedTiles).not.toContain(corner);
    expect(city.workedTiles).toHaveLength(3);
    // But not forgotten: an enemy standing there is usually temporary.
    expect(city.chosenTiles).toContain(corner);
  });

  it('takes the tile back once the enemy leaves', () => {
    const state = board();
    const city = town(state, 3);
    const corner = at(state, 8, 8);
    toggleChosenTile(state, city, corner);
    const enemy = spawnUnit(state, 1, 'footman', 8, 8, false);
    assignWorkers(state, city);

    state.units = state.units.filter((u) => u.id !== enemy.id);
    assignWorkers(state, city);

    expect(city.workedTiles).toContain(corner);
  });

  it('will not take a tile another city is working', () => {
    const state = board();
    const mine = town(state, 3, 10, 9);
    const theirs = town(state, 3, 13, 9, 1);
    const contested = theirs.workedTiles[0];

    expect(tileWorkable(state, mine, contested)).toBe(false);
    expect(toggleChosenTile(state, mine, contested)).toBe(false);
  });

  it('will not put anybody on the city itself', () => {
    const state = board();
    const city = town(state);
    // The centre is worked for free and is not a citizen job.
    expect(tileWorkable(state, city, at(state, 10, 9))).toBe(false);
  });

  it('drops the oldest pick rather than refusing a new one', () => {
    const state = board();
    const city = town(state, 2);
    const first = at(state, 8, 8);
    const second = at(state, 12, 8);
    const third = at(state, 8, 10);

    toggleChosenTile(state, city, first);
    toggleChosenTile(state, city, second);
    toggleChosenTile(state, city, third);

    // Otherwise a player at full assignment has to solve a puzzle about the
    // interface before they can express a preference about the city.
    expect(city.chosenTiles).toEqual([second, third]);
    expect(city.workedTiles).toHaveLength(2);
  });

  it('hands the whole thing back when asked', () => {
    const state = board();
    const city = town(state);
    toggleChosenTile(state, city, at(state, 8, 8));

    clearChosenTiles(state, city);

    expect(city.chosenTiles).toBeUndefined();
    expect(city.workedTiles).toHaveLength(city.size);
  });

  it('never works more tiles than it has citizens, however many were picked', () => {
    const state = board();
    const city = town(state, 3);
    for (const [x, y] of [[8, 8], [12, 8], [8, 10], [12, 10]] as const) {
      toggleChosenTile(state, city, at(state, x, y));
    }
    expect(honouredChoices(state, city).length).toBeLessThanOrEqual(city.size);
    expect(city.workedTiles).toHaveLength(3);
  });
});
