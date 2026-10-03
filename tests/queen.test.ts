import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { FACTIONS } from '../src/model/factions';
import { createGame, playerUnits, spawnUnit } from '../src/sim/gamestate';
import { assignWorkers, cityYield, contentLimit, foundCity } from '../src/sim/city';
import { destroyUnit } from '../src/sim/combat';
import {
  QUEEN,
  broodBonus,
  chooseBrood,
  queenIn,
  queenSeat,
  queenless,
  successionLeft,
  tickSuccession,
} from '../src/sim/hivekin';

/**
 * Section 125 slice B: the Queen, and the plan for when she is not there.
 *
 * Losing her is deliberately **not** decisive. A single lucky raid ending a
 * faction outright is not a thing this game does anywhere else, and the bible's
 * whole argument for the Princess-caste is that redundancy ought to be a
 * strategy rather than a tax -- so the interesting half of these tests is what
 * happens to the player who *did* build spares.
 */

function board(): GameState {
  const state = createGame({ seed: 20261003, width: 24, height: 16, barbarians: false });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  state.log.length = 0;
  return state;
}

function withHive(state: GameState): number {
  const id = state.players.length;
  state.players.push({
    ...state.players[1],
    id,
    faction: 'hivekin',
    name: FACTIONS.hivekin.civName,
    alive: true,
    controller: 'ai',
    techs: ['first-hivekin'],
    explored: new Array(state.width * state.height).fill(1),
    visible: new Array(state.width * state.height).fill(1),
  });
  return id;
}

/** A Hive with a Queen in it, as founding one leaves it. */
function seatOf(state: GameState, hive: number): City {
  const city = foundCity(state, spawnUnit(state, hive, 'grub', 10, 8))!;
  city.size = 4;
  assignWorkers(state, city);
  return city;
}

describe('the seat', () => {
  it('is remembered, so a capital that moves is not the same event', () => {
    const state = board();
    const hive = withHive(state);
    const city = seatOf(state, hive);
    expect(state.players[hive].queenSeat).toBe(city.id);
    expect(queenSeat(state, state.players[hive])).toBe(city);
    expect(queenIn(state, city)).not.toBeNull();
  });

  it('makes nothing at all while she is not in it', () => {
    const state = board();
    const hive = withHive(state);
    const city = seatOf(state, hive);
    expect(cityYield(state, city).shields).toBeGreaterThan(0);
    expect(queenless(state, city)).toBe(false);

    destroyUnit(state, queenIn(state, city)!, 'is lost');

    expect(queenless(state, city)).toBe(true);
    // Production in her Hive is a thing she is doing, not a thing it is doing.
    expect(cityYield(state, city).shields).toBe(0);
  });

  it('leaves every other Hive working', () => {
    const state = board();
    const hive = withHive(state);
    const seat = seatOf(state, hive);
    const other = foundCity(state, spawnUnit(state, hive, 'grub', 15, 8))!;
    other.size = 4;
    assignWorkers(state, other);

    destroyUnit(state, queenIn(state, seat)!, 'is lost');

    expect(cityYield(state, seat).shields).toBe(0);
    expect(cityYield(state, other).shields).toBeGreaterThan(0);
  });
});

describe('the countdown', () => {
  it('starts when she is lost and says how long there is', () => {
    const state = board();
    const hive = withHive(state);
    const seat = seatOf(state, hive);
    destroyUnit(state, queenIn(state, seat)!, 'is lost');

    tickSuccession(state, hive);

    expect(successionLeft(state, state.players[hive])).toBe(QUEEN.countdown);
    expect(state.log.some((e) => /Princess grown in it before then/i.test(e.text))).toBe(true);
  });

  it('gives the Hive up when it runs out, and what was in it goes feral', () => {
    const state = board();
    const hive = withHive(state);
    const seat = seatOf(state, hive);
    const stray = spawnUnit(state, hive, 'fodder', 12, 8);
    destroyUnit(state, queenIn(state, seat)!, 'is lost');

    tickSuccession(state, hive);
    state.turn += QUEEN.countdown;
    tickSuccession(state, hive);

    expect(state.cities).not.toContain(seat);
    // Feral rather than dead: the band that already exists takes them, which is
    // the bible's own answer and invents no third kind of owner.
    expect(playerUnits(state, hive)).toHaveLength(0);
    expect(state.units).toContain(stray);
    expect(stray.owner).not.toBe(hive);
  });

  it('is stopped by a Princess standing in the seat, even on the last turn', () => {
    const state = board();
    const hive = withHive(state);
    const seat = seatOf(state, hive);
    destroyUnit(state, queenIn(state, seat)!, 'is lost');
    tickSuccession(state, hive);

    // Walked in at the last moment. Growing her is checked before the clock,
    // so this works rather than being one turn too late.
    state.turn += QUEEN.countdown;
    spawnUnit(state, hive, 'princess', seat.x, seat.y);
    tickSuccession(state, hive);

    expect(state.cities).toContain(seat);
    expect(queenIn(state, seat), 'a Queen again').not.toBeNull();
    expect(successionLeft(state, state.players[hive])).toBeNull();
    expect(cityYield(state, seat).shields).toBeGreaterThan(0);
  });

  it('counts nothing at all while she is alive', () => {
    const state = board();
    const hive = withHive(state);
    seatOf(state, hive);
    tickSuccession(state, hive);
    expect(successionLeft(state, state.players[hive])).toBeNull();
  });
});

describe('the spare Princesses', () => {
  it('become something the Hive keeps, one apiece', () => {
    const state = board();
    const hive = withHive(state);
    const seat = seatOf(state, hive);
    destroyUnit(state, queenIn(state, seat)!, 'is lost');
    for (let n = 0; n < 3; n++) spawnUnit(state, hive, 'princess', seat.x, seat.y);

    tickSuccession(state, hive);

    // One became the Queen; the other two became part of the Hive.
    expect(queenIn(state, seat)).not.toBeNull();
    expect(playerUnits(state, hive).filter((u) => u.type === 'princess')).toHaveLength(0);
    expect(seat.brood).toHaveLength(2);
  });

  it('is decided at conversion and not at build time', () => {
    const state = board();
    const hive = withHive(state);
    state.players[hive].controller = 'human';
    const seat = seatOf(state, hive);
    destroyUnit(state, queenIn(state, seat)!, 'is lost');
    for (let n = 0; n < 2; n++) spawnUnit(state, hive, 'princess', seat.x, seat.y);

    tickSuccession(state, hive);

    // The player owes an answer -- which is the whole of Jeremy's note on it:
    // insurance you choose the use of after you know whether you needed it.
    expect(seat.brood).toEqual(['pending']);
    chooseBrood(seat, 0, 'calm');
    expect(seat.brood).toEqual(['calm']);
  });

  it('pays what was chosen, and nothing that was not', () => {
    const state = board();
    const hive = withHive(state);
    const seat = seatOf(state, hive);
    const shieldsBefore = cityYield(state, seat).shields;
    const calmBefore = contentLimit(state, seat);

    seat.brood = ['shields', 'shields'];
    expect(broodBonus(seat, 'shields')).toBe(2);
    expect(cityYield(state, seat).shields).toBe(shieldsBefore + 2);
    expect(contentLimit(state, seat)).toBe(calmBefore);

    seat.brood = ['calm'];
    expect(cityYield(state, seat).shields).toBe(shieldsBefore);
    expect(contentLimit(state, seat)).toBe(calmBefore + 1);
  });

  it('answers for itself when nobody is there to be asked', () => {
    const state = board();
    const hive = withHive(state);
    expect(state.players[hive].controller).toBe('ai');
    const seat = seatOf(state, hive);
    destroyUnit(state, queenIn(state, seat)!, 'is lost');
    for (let n = 0; n < 2; n++) spawnUnit(state, hive, 'princess', seat.x, seat.y);

    tickSuccession(state, hive);

    expect(seat.brood).toHaveLength(1);
    expect(seat.brood![0]).not.toBe('pending');
  });
});

describe('everybody else', () => {
  it('is untouched by any of this', () => {
    const state = board();
    const orcCity = foundCity(state, spawnUnit(state, 0, 'peon', 4, 4))!;
    orcCity.size = 4;
    assignWorkers(state, orcCity);

    expect(queenless(state, orcCity)).toBe(false);
    expect(cityYield(state, orcCity).shields).toBeGreaterThan(0);
    tickSuccession(state, 0);
    expect(successionLeft(state, state.players[0])).toBeNull();
  });
});
