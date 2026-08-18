import { describe, expect, it } from 'vitest';
import type { BuildingId, City, GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { MILITIA, militiaStrength } from '../src/sim/city';
import { stormEmptyCity } from '../src/sim/combat';
import { isRuined, processCity, RUIN } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { sackSeverity, tryStep } from '../src/sim/movement';

/**
 * Cities that nobody is guarding.
 *
 * Measured over four games, 228 of 237 captures were walk-ins into an empty
 * city — which made every defensive rule in the game a bonus applied to a
 * defender who was not there. These are the rules that changed that.
 */

function board(): GameState {
  const state = createGame({ seed: 777, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

function town(state: GameState, size: number, buildings: BuildingId[] = []): City {
  const city: City = {
    id: 1, owner: 1, name: 'Tuppence', x: 10, y: 10, size,
    food: 0, shields: 0, buildings: [...buildings],
    producing: { kind: 'coin' }, workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(city);
  return city;
}

describe('the citizens put up a fight', () => {
  it('scales with how many of them there are', () => {
    const state = board();
    expect(militiaStrength(town(state, 1))).toBeCloseTo(MILITIA.perCitizen);
    state.cities.length = 0;
    expect(militiaStrength(town(state, 8))).toBeCloseTo(8 * MILITIA.perCitizen);
  });

  it('costs a weak attacker health on the way in', () => {
    // Over enough tries a goblin must take *some* damage from a large town.
    let hurt = 0;
    for (let i = 0; i < 40; i++) {
      const state = board();
      const city = town(state, 8);
      const goblin = spawnUnit(state, 0, 'goblin', 11, 10);
      stormEmptyCity(state, goblin, city);
      if (goblin.hp < unitType('goblin').hp) hurt++;
    }
    expect(hurt, 'a lone goblin walked into a town of eight entirely unscathed').toBeGreaterThan(0);
  });

  it('sometimes throws a weak attacker back altogether', () => {
    let repelled = 0;
    for (let i = 0; i < 60; i++) {
      const state = board();
      town(state, 10);
      const goblin = spawnUnit(state, 0, 'goblin', 11, 10);
      goblin.hp = 2;
      goblin.moves = 2;
      const outcome = tryStep(state, goblin, 10, 10);
      if (outcome.kind === 'blocked') repelled++;
    }
    expect(repelled, 'a mob never once stopped a nearly-dead goblin').toBeGreaterThan(0);
  });

  it('does not stop a real army', () => {
    // The point is a toll, not a wall. A big group must still get in.
    let taken = 0;
    for (let i = 0; i < 20; i++) {
      const state = board();
      const city = town(state, 6);
      const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
      horde.moves = 2;
      tryStep(state, horde, 10, 10);
      if (city.owner === 0) taken++;
    }
    expect(taken, 'Ten Orcs were held off by townsfolk').toBe(20);
  });

  it('leaves a defended city to the normal rules', () => {
    // A garrisoned city goes through combat, not the mob.
    const state = board();
    const city = town(state, 8);
    spawnUnit(state, 1, 'footman', 10, 10);
    const orc = spawnUnit(state, 0, 'orc', 11, 10);
    orc.moves = 2;
    const outcome = tryStep(state, orc, 10, 10);
    expect(outcome.kind).toBe('combat');
    expect(city.owner, 'a defended city fell without the defender being beaten').toBe(1);
  });
});

describe('sacking a captured city', () => {
  it('gets worse the bigger the army that turns up', () => {
    const state = board();
    const goblin = spawnUnit(state, 0, 'goblin', 1, 1);
    const horde = spawnUnit(state, 0, 'orc_x10', 2, 2);
    expect(sackSeverity(horde)).toBeGreaterThan(sackSeverity(goblin));
  });

  it('is capped, so a city is still worth taking', () => {
    const state = board();
    const biggest = spawnUnit(state, 0, 'orc_x10', 1, 1);
    expect(sackSeverity(biggest)).toBeLessThanOrEqual(3);
  });

  it('costs citizens and structures in proportion', () => {
    const state = board();
    const city = town(state, 10, ['granary', 'barracks', 'totem']);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    const severity = sackSeverity(horde);
    tryStep(state, horde, 10, 10);
    expect(city.owner).toBe(0);
    expect(city.size).toBe(10 - severity);
    expect(city.buildings.length).toBe(3 - severity);
  });

  it('never empties a city entirely', () => {
    const state = board();
    const city = town(state, 1);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    expect(city.size).toBeGreaterThanOrEqual(1);
  });

  it('leaves the walls standing, whoever takes it', () => {
    // Levelling them made a taken city easier to retake than it was to take.
    const state = board();
    const city = town(state, 8, ['walls', 'granary']);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    expect(city.buildings).toContain('walls');
  });
});

describe('a city sacked to nothing', () => {
  it('is wiped off the map rather than handed over', () => {
    const state = board();
    town(state, 1);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    expect(state.cities).toHaveLength(0);
  });

  it('survives if there are citizens left over', () => {
    const state = board();
    const city = town(state, 8);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    expect(state.cities).toHaveLength(1);
    expect(city.owner).toBe(0);
    expect(city.size).toBe(8 - sackSeverity(horde));
  });

  it('takes a small city two sackings to erase, not one', () => {
    // A goblin sacks one citizen at a time, so a town of three survives the
    // first two visits and goes on the third.
    const state = board();
    town(state, 3);
    for (let round = 0; round < 3; round++) {
      const raider = spawnUnit(state, round % 2 === 0 ? 0 : 1, 'goblin', 11, 10);
      raider.moves = 2;
      tryStep(state, raider, 10, 10);
      state.units = state.units.filter((u) => u.id !== raider.id);
    }
    expect(state.cities, 'a city ground down by repeated capture should be gone').toHaveLength(0);
  });

  it('orphans anything that was homed there', () => {
    const state = board();
    const city = town(state, 1);
    const garrisonedElsewhere = spawnUnit(state, 1, 'footman', 15, 15);
    garrisonedElsewhere.homeCity = city.id;
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    expect(garrisonedElsewhere.homeCity, 'a unit kept a home that no longer exists').toBeNull();
  });
});

describe('a sacked city stays a ruin', () => {
  /**
   * Age the world without playing it.
   *
   * The fixtures here leave one side with no cities, so the elimination check
   * ends the game and `endPlayerTurn` stops advancing the calendar. These
   * tests are about the ruin timer, not the turn pipeline, so they move the
   * clock directly and run the city's own economy against it.
   */
  function age(state: GameState, city: City, turns: number): void {
    for (let i = 0; i < turns; i++) {
      state.turn += 1;
      processCity(state, city);
    }
  }

  it('marks a captured city as ruined for a while', () => {
    const state = board();
    const city = town(state, 8);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    expect(isRuined(state, city)).toBe(true);
    expect(city.ruinedUntil).toBe(state.turn + RUIN.turns);
  });

  it('does not grow while it is one', () => {
    // The measured problem: a city sacked to size 2 was back to 8 long before
    // anyone returned, so razing almost never fired.
    const state = board();
    const city = town(state, 8);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    const sackedTo = city.size;
    age(state, city, RUIN.turns - 2);
    expect(city.size, 'a smoking ruin grew anyway').toBe(sackedTo);
  });

  it('grows again once the rubble is cleared', () => {
    const state = board();
    const city = town(state, 8);
    const horde = spawnUnit(state, 0, 'orc_x10', 11, 10);
    horde.moves = 2;
    tryStep(state, horde, 10, 10);
    const sackedTo = city.size;
    age(state, city, RUIN.turns + 40);
    expect(isRuined(state, city)).toBe(false);
    expect(city.size, 'a recovered city never grew back').toBeGreaterThan(sackedTo);
  });

  it('leaves a city that has never been taken alone', () => {
    const state = board();
    const city = town(state, 4);
    expect(city.ruinedUntil).toBeUndefined();
    expect(isRuined(state, city)).toBe(false);
  });
});
