import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS } from '../src/model/techs';
import { unitType } from '../src/model/units';
import { autoBuildOf, buildOptions, foundCity, nextProduction } from '../src/sim/city';
import { createGame, playerCities } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * A city that finishes something has to be given a new order by somebody.
 *
 * Before this setting existed the answer was always the same: a city sitting on
 * Coin was quietly handed the cheapest attacker it could build, on the turn
 * after it went idle, whoever owned it. That made "bank the shields" impossible
 * to ask for -- the game overrode it -- and it is the behaviour these tests pin
 * down as now being a choice rather than a rule.
 */
function humanCity(): { state: GameState; city: City } {
  const state = createGame({ seed: 20260821, width: 40, height: 30 });
  const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
  const city = foundCity(state, settler)!;
  city.producing = { kind: 'coin' };
  return { state, city };
}

/** Unlock everything, so the structure rules can be tested at all. */
function knowEverything(state: GameState, playerId = 0): void {
  state.players[playerId].techs = TECHS.map((t) => t.id);
}

/** One full turn of the owner's economy, which is where orders are handed out. */
function passATurn(state: GameState, playerId = 0): void {
  beginPlayerTurn(state, playerId);
  endPlayerTurn(state, playerId);
}

describe('auto-build', () => {
  it('defaults to asking, and an unset city is left alone', () => {
    const { state, city } = humanCity();
    expect(autoBuildOf(city)).toBe('ask');
    expect(city.autoBuild).toBeUndefined();

    passATurn(state);

    // The whole point: it used to be given something here whether or not the
    // player wanted it, which is what made the prompt impossible to build.
    expect(city.producing.kind).toBe('coin');
  });

  it('honours "coin", which could not previously be expressed', () => {
    const { state, city } = humanCity();
    city.autoBuild = 'coin';

    passATurn(state);
    passATurn(state);

    expect(city.producing.kind).toBe('coin');
  });

  it('gives an idle city something to do on "next"', () => {
    const { state, city } = humanCity();
    city.autoBuild = 'next';

    passATurn(state);

    expect(city.producing.kind).not.toBe('coin');
  });

  it('picks the cheapest structure the city has not got', () => {
    const { state, city } = humanCity();
    knowEverything(state);

    const chosen = nextProduction(state, city);
    expect(chosen.kind).toBe('building');
    const id = chosen.kind === 'building' ? chosen.id : null;

    // Nothing on offer is cheaper than what it picked.
    const offered = buildOptions(state, city).buildings;
    expect(BUILDINGS[id!].cost).toBe(Math.min(...offered.map((b) => b.cost)));

    // Having built it, it never offers the same one again -- which a "cheapest"
    // that ignored what the city already owns would do forever.
    city.buildings.push(id!);
    const second = nextProduction(state, city);
    if (second.kind === 'building') expect(second.id).not.toBe(id);
  });

  it('falls through to a unit rather than idling when no structure is left', () => {
    const { state, city } = humanCity();
    knowEverything(state);

    // Everything it could put up, already up.
    for (let i = 0; i < 40; i++) {
      const pick = nextProduction(state, city);
      if (pick.kind !== 'building') break;
      city.buildings.push(pick.id);
    }
    expect(buildOptions(state, city).buildings).toHaveLength(0);

    // The point of the fall-through: a built-out city keeps working. Buildings
    // are gated behind advances and none are unlocked at the start of a game,
    // so a structures-only rule left "next" doing nothing at all for the whole
    // opening -- which is how this rule was found to be wrong.
    expect(nextProduction(state, city).kind).toBe('unit');
  });

  it('leaves the AI exactly as it was', () => {
    const state = createGame({ seed: 20260821, width: 40, height: 30 });
    const ai = state.players.find((p) => p.controller === 'ai')!;
    const settler = state.units.find((u) => u.owner === ai.id && unitType(u.type).settler)!;
    const city = foundCity(state, settler)!;

    city.producing = { kind: 'coin' };
    // The AI never set this, and must not be governed by it: it has no
    // interface to be asked through, and its own chooser can return Coin.
    expect(city.autoBuild).toBeUndefined();

    passATurn(state, ai.id);

    expect(city.producing.kind).not.toBe('coin');
    expect(playerCities(state, ai.id).length).toBeGreaterThan(0);
  });
});
