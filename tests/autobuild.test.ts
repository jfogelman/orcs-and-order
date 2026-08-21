import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { autoBuildOf, foundCity, nextProduction, productionCostIn } from '../src/sim/city';
import { createGame, playerCities } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * A city that finishes something has to be given a new order by somebody.
 *
 * Before this setting existed the answer was always the same: a city sitting on
 * Coin was quietly handed the cheapest attacker it could build, on the turn
 * after it went idle, whoever owned it. That made "bank the shields" impossible
 * to ask for -- the game overrode it -- and it is that behaviour these tests
 * pin down as now being a choice rather than a rule.
 */
function humanCity(): { state: GameState; city: City } {
  const state = createGame({ seed: 20260821, width: 40, height: 30 });
  const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
  const city = foundCity(state, settler)!;
  city.producing = { kind: 'coin' };
  return { state, city };
}

/** One full turn of the owner's economy, which is where orders are handed out. */
function passATurn(state: GameState, playerId = 0): void {
  beginPlayerTurn(state, playerId);
  endPlayerTurn(state);
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

  it('remembers the unit a city finished', () => {
    const { state, city } = humanCity();
    const goblin = { kind: 'unit', id: 'goblin' } as const;
    city.producing = goblin;
    city.shields = productionCostIn(state, city, goblin);

    expect(city.lastUnit).toBeUndefined();
    passATurn(state);

    expect(city.lastUnit).toBe('goblin');
    // Finishing a unit does not clear production, so it is already making
    // another -- which is why the remembering has to happen there rather than
    // being read off `producing` when a standing order is finally consulted.
    expect(city.producing).toEqual(goblin);
  });

  it('goes back to the same unit on "repeat"', () => {
    const { state, city } = humanCity();
    city.autoBuild = 'repeat';
    // Deliberately not the cheapest thing available -- a Goblin costs less --
    // so this fails if the rule quietly reaches for cheapest instead of same.
    city.lastUnit = 'peon';

    passATurn(state);

    expect(city.producing).toEqual({ kind: 'unit', id: 'peon' });
  });

  it('never picks a structure on the player behalf', () => {
    const { state, city } = humanCity();
    city.autoBuild = 'repeat';
    city.lastUnit = 'goblin';

    passATurn(state);

    // Choosing buildings unasked is exactly what `ask` exists for.
    expect(city.producing.kind).toBe('unit');
  });

  it('falls back to the cheapest unit when the remembered one is gone', () => {
    const { state, city } = humanCity();
    city.autoBuild = 'repeat';
    // Something this city has no advance for, so it cannot be built again.
    city.lastUnit = 'deathknight';

    const pick = nextProduction(state, city);
    expect(pick.kind).toBe('unit');
    if (pick.kind === 'unit') {
      expect(pick.id).not.toBe('deathknight');
      expect(unitType(pick.id).cost).toBeGreaterThan(0);
    }
  });

  it('leaves the AI exactly as it was', () => {
    const state = createGame({ seed: 20260821, width: 40, height: 30 });
    const ai = state.players.find((p) => p.controller === 'ai')!;
    const settler = state.units.find((u) => u.owner === ai.id && unitType(u.type).settler)!;
    const city = foundCity(state, settler)!;

    city.producing = { kind: 'coin' };
    // The AI never sets this, and must not be governed by it: it has no
    // interface to be asked through, and its own chooser can return Coin.
    expect(city.autoBuild).toBeUndefined();

    passATurn(state, ai.id);

    expect(city.producing.kind).not.toBe('coin');
    expect(playerCities(state, ai.id).length).toBeGreaterThan(0);
  });
});
