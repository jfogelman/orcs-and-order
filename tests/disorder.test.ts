import { describe, expect, it } from 'vitest';
import type { City, GameState, Unit } from '../src/model/types';
import {
  BASE_CONTENT,
  CALM_BONUS,
  cityYield,
  contentLimit,
  foundCity,
  isRuined,
  RUIN,
  rushBlocked,
} from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * Disorder used to be a trap rather than a setback.
 *
 * A rioting city produces no shields, so it could not build the very building
 * that would end its disorder; growth is capped at zero in the same breath, so
 * it could not shrink out either. The only escape was an empire-wide advance
 * arriving for unrelated reasons. Measured at a third of all Horde city-turns
 * against a fifth of the Kingdom's -- see DESIGN_QUEUE section 20.
 */
function riotingCity(): { state: GameState; city: City } {
  const state = createGame({ seed: 20260822, width: 40, height: 30 });
  const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
  const city = foundCity(state, settler)!;
  city.size = BASE_CONTENT + 4; // comfortably over any limit it can reach
  city.disorder = true;
  return { state, city };
}

describe('a rioting city', () => {
  it('produces nothing while it works on anything else', () => {
    const { state, city } = riotingCity();
    city.producing = { kind: 'unit', id: 'goblin' } as never;
    expect(cityYield(state, city).shields).toBe(0);
    expect(cityYield(state, city).trade).toBe(0);
  });

  it('may work on the thing that would calm it', () => {
    const { state, city } = riotingCity();
    state.players[0].techs.push('joy-making');
    city.producing = { kind: 'building', id: 'totem' } as never;

    // The whole fix: without this the shields are zero and the building can
    // never be finished, so the riot is permanent.
    expect(cityYield(state, city).shields).toBeGreaterThan(0);
  });

  it('can always fall back on placating, which needs nothing built', () => {
    const { state, city } = riotingCity();
    const before = contentLimit(state, city);
    city.producing = { kind: 'calm' } as never;

    expect(contentLimit(state, city)).toBe(before + CALM_BONUS);
  });

  it('stops rioting once placating is enough', () => {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    city.size = BASE_CONTENT + 1; // one over the bare limit
    city.producing = { kind: 'calm' } as never;

    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    expect(city.disorder).toBe(false);
  });
});

describe('the standing production choices', () => {
  it('turn production into research when set to Study', () => {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    city.producing = { kind: 'beakers' } as never;
    const player = state.players[0];
    player.researching = player.researching ?? null;
    const before = player.beakers;

    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    // More than trade alone would have given, since shields are going in too.
    expect(player.beakers).toBeGreaterThan(before);
  });

  it('never finish, so none of them can be rushed', () => {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    for (const kind of ['coin', 'beakers', 'calm'] as const) {
      city.producing = { kind } as never;
      expect(rushBlocked(state, city)).toMatch(/not building anything/);
    }
  });
});

/**
 * The see-saw fix from DESIGN_QUEUE section 4i.
 *
 * The war there is reciprocal: whoever loses a city takes it straight back,
 * because the army that lost it is still standing next to it. Captures after
 * turn 150 outnumbered those before it two to one and settled nothing, so no
 * lead ever compounded into a win and every game ran to the turn limit.
 */
describe('a city still being resettled', () => {
  function taken(): { state: GameState; city: City; retaker: Unit } {
    const state = createGame({ seed: 20260822, width: 30, height: 24 });
    state.units.length = 0;
    state.cities.length = 0;
    state.terrain.fill('grass');
    const city: City = {
      id: 1, owner: 0, name: 'Hold', x: 10, y: 10, size: 8,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: 0,
    };
    state.cities.push(city);
    const raider = spawnUnit(state, 1, 'orc', 11, 10, false);
    raider.moves = 2;
    tryStep(state, raider, 10, 10);
    // The raider marches on. What is left is an empty city mid-resettlement,
    // which is exactly the case the see-saw was made of: the army that lost it
    // is still next door and walks straight back in.
    state.units = state.units.filter((u) => u.id !== raider.id);
    // Big enough that the townsfolk cannot see it off, so the test is about
    // the resettlement rule rather than about a militia roll.
    const retaker = spawnUnit(state, 0, 'orc_x3', 9, 10, false);
    retaker.moves = 2;
    return { state, city, retaker };
  }

  it('cannot be taken straight back', () => {
    const { state, city, retaker } = taken();
    expect(city.owner).toBe(1);
    expect(isRuined(state, city)).toBe(true);

    const result = tryStep(state, retaker, 10, 10);

    expect(result.kind).toBe('blocked');
    expect(city.owner).toBe(1);
  });

  it('can be taken once the resettling is over', () => {
    const { state, city, retaker } = taken();
    state.turn += RUIN.turns + 1;
    retaker.moves = 2;

    tryStep(state, retaker, 10, 10);

    expect(city.owner).toBe(0);
  });

  it('leaves a city nobody has touched perfectly takeable', () => {
    const { state } = taken();
    const quiet: City = {
      id: 2, owner: 0, name: 'Quiet', x: 20, y: 10, size: 5,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: 0,
    };
    state.cities.push(quiet);
    const raider = spawnUnit(state, 1, 'orc', 21, 10, false);
    raider.moves = 2;

    tryStep(state, raider, 20, 10);

    expect(quiet.owner).toBe(1);
  });
});
