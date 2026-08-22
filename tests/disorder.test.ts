import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import {
  BASE_CONTENT,
  CALM_BONUS,
  cityYield,
  contentLimit,
  foundCity,
  rushBlocked,
} from '../src/sim/city';
import { createGame } from '../src/sim/gamestate';
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
