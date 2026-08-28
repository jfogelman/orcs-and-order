import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { BUILDINGS } from '../src/model/buildings';
import {
  RESETTLE,
  buildOptions,
  buildingUpkeep,
  contentLimit,
  isRuined,
  resettleTurns,
  suppliesArmy,
  workingBuildings,
} from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';

function board(): GameState {
  const state = createGame({ seed: 20260827, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(1);
  return state;
}

function town(state: GameState, owner: number, size: number, x = 10, y = 10): City {
  const c: City = {
    id: state.cities.length + 1, owner, name: 'Someplace', x, y, size,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  return c;
}

/** Takes it, and hands back the city as it stands afterwards. */
function capture(state: GameState, city: City): City {
  const horde = spawnUnit(state, 0, 'orc_x10', city.x + 1, city.y, false);
  horde.moves = 2;
  tryStep(state, horde, city.x, city.y);
  return city;
}

/**
 * DESIGN_QUEUE section 19. An orc cannot walk into a human town and carry on.
 * The old population is leaving and the new one arriving, and until that is
 * done the place is ground you are holding rather than a city you own.
 */
describe('how long resettlement takes', () => {
  it('scales with how much of a place is left', () => {
    // The timer this replaced was flat, which said a sacked hamlet and a
    // sacked capital take the same time to repopulate.
    expect(resettleTurns(1)).toBeLessThan(resettleTurns(5));
    expect(resettleTurns(5)).toBeLessThan(resettleTurns(9));
  });

  it('stops climbing eventually', () => {
    // Otherwise a large city is worth less than the empty ground beside it.
    expect(resettleTurns(40)).toBe(RESETTLE.cap);
    expect(resettleTurns(9)).toBeLessThanOrEqual(RESETTLE.cap);
  });

  it('is the clock capture actually sets', () => {
    const state = board();
    const taken = capture(state, town(state, 1, 8));
    expect(isRuined(state, taken)).toBe(true);
    // Read off the size it was sacked down to, not the size it used to be.
    expect(taken.ruinedUntil).toBe(state.turn + resettleTurns(taken.size));
  });

  it('is one clock and not two', () => {
    // Section 19 is explicit: two overlapping penalties for one event is how a
    // captured city stops being worth capturing. Resettlement replaced the
    // ruin timer rather than running beside it.
    const state = board();
    const taken = capture(state, town(state, 1, 6));
    state.turn = taken.ruinedUntil!;
    expect(isRuined(state, taken)).toBe(false);
  });
});

describe('what a city being resettled can build', () => {
  function resettling(): { state: GameState; city: City } {
    const state = board();
    const city = town(state, 1, 8);
    capture(state, city);
    // Enough advances that there is something of its own to withhold. With no
    // techs at all the only unlocked buildings are the two shared ones, and
    // the test would pass without the rule existing.
    state.players[city.owner].techs.push('tree-hugging', 'wall-building');
    return { state, city };
  }

  it('raises nobody at all', () => {
    const { state, city } = resettling();
    // There is no population here yet that thinks of itself as yours.
    expect(buildOptions(state, city).units).toEqual([]);
  });

  it('offers shared infrastructure and nothing of its own', () => {
    const { state, city } = resettling();
    const offered = buildOptions(state, city).buildings;
    expect(offered.length, 'nothing was on offer either way').toBeGreaterThan(0);
    for (const b of offered) {
      expect(b.faction, `${b.id} is not shared infrastructure`).toBe('both');
    }
  });

  it('goes back to a full menu when the resettling is done', () => {
    const { state, city } = resettling();
    state.turn = city.ruinedUntil!;
    const after = buildOptions(state, city);
    expect(after.units.length).toBeGreaterThan(0);
    expect(after.buildings.some((b) => b.faction !== 'both')).toBe(true);
  });
});

describe('what the buildings already standing there do', () => {
  it('nothing, while the place is being resettled', () => {
    const state = board();
    const city = town(state, 1, 8);
    city.buildings = ['granary', 'barracks'];
    capture(state, city);
    // Capture destroys some at random, so only assert about what survived.
    const left = city.buildings.filter((b) => b !== 'walls');
    if (left.length === 0) return;
    expect(workingBuildings(state, city)).not.toContain(left[0]);
  });

  it('stands the masonry up regardless', () => {
    const state = board();
    const city = town(state, 1, 8);
    city.buildings = ['walls'];
    capture(state, city);
    // A wall does not need staffing to be in the way, and it is the one thing
    // that plainly does not care who lives behind it.
    expect(city.buildings).toContain('walls');
    expect(workingBuildings(state, city)).toContain('walls');
  });

  it('starts working again by itself, without being rebuilt', () => {
    const state = board();
    const city = town(state, 1, 8);
    city.buildings = ['granary', 'barracks'];
    capture(state, city);
    const survived = [...city.buildings];
    state.turn = city.ruinedUntil!;
    expect(workingBuildings(state, city)).toEqual(survived);
  });

  it('charges no upkeep for a building nobody is in', () => {
    const state = board();
    const city = town(state, 1, 8);
    city.buildings = ['granary', 'barracks'];
    capture(state, city);
    // A third penalty on the same event, on top of the wait and the shut door.
    expect(buildingUpkeep(state, city)).toBe(0);

    state.turn = city.ruinedUntil!;
    const owed = city.buildings.reduce((sum, b) => sum + BUILDINGS[b].upkeep, 0);
    expect(buildingUpkeep(state, city)).toBe(owed);
  });

  it('does not let a captured depot supply an army yet', () => {
    const state = board();
    const city = town(state, 1, 8);
    city.buildings = ['depot'];
    capture(state, city);
    if (!city.buildings.includes('depot')) return;
    expect(suppliesArmy(state, city)).toBe(false);
    state.turn = city.ruinedUntil!;
    expect(suppliesArmy(state, city)).toBe(true);
  });

  it('does not let a captured happiness building calm anybody yet', () => {
    const state = board();
    const city = town(state, 1, 8);
    city.buildings = ['cathedral'];
    capture(state, city);
    if (!city.buildings.includes('cathedral')) return;
    const during = contentLimit(state, city);
    state.turn = city.ruinedUntil!;
    expect(contentLimit(state, city)).toBeGreaterThan(during);
  });
});

/**
 * Reported from a real save at turn 238: a dragon stood beside an undefended
 * Duke's Rest and simply would not go in. The rule was right -- the Kingdom had
 * retaken the place nine turns earlier, and section 4i's protection was doing
 * exactly its job -- but the refusal did not say for how long, so it read as
 * the game declining a legal move for no reason.
 */
describe('being told why a city cannot be taken', () => {
  it('says how many turns are left, in words', () => {
    const state = board();
    const city = town(state, 1, 4);
    capture(state, city);
    // Undefended, exactly as in the save: the garrison has moved on.
    state.units = state.units.filter((u) => !(u.x === city.x && u.y === city.y));
    const dragon = spawnUnit(state, 1, 'dragon', city.x - 1, city.y, false);
    dragon.moves = 2;
    state.turn += 1;

    const out = tryStep(state, dragon, city.x, city.y);

    expect(out.kind).toBe('blocked');
    if (out.kind !== 'blocked') return;
    expect(out.reason).toMatch(/changed hands too recently/);
    // The count is the point of the change, and a bare digit in a line of
    // prose reads as a readout rather than a sentence.
    expect(out.reason).not.toMatch(/\d/);
    expect(out.reason).toMatch(/turns to go/);
  });

  it('lets the same unit walk in once the wait is over', () => {
    const state = board();
    const city = town(state, 1, 4);
    capture(state, city);
    state.units = state.units.filter((u) => !(u.x === city.x && u.y === city.y));
    const dragon = spawnUnit(state, 1, 'dragon', city.x - 1, city.y, false);
    state.turn = city.ruinedUntil!;
    dragon.moves = 2;

    // Which is what the player saw: a later unit, later on, went straight in.
    expect(tryStep(state, dragon, city.x, city.y).kind).not.toBe('blocked');
  });
});
