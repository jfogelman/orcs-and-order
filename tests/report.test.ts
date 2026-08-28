import { describe, expect, it } from 'vitest';
import { buildingUpkeep, cityIncome, foundCity } from '../src/sim/city';
import { createGame, playerCities } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * The empire report is only worth having if its numbers are the real ones.
 *
 * It reports income per turn, which the turn also computes. Those were written
 * twice and agreed only by luck: two copies of a formula carrying two separate
 * percentage bonuses is a defect waiting for somebody to change one of them.
 * `cityIncome` is now the single definition, and this pins it to what actually
 * reaches the treasury.
 */
describe('reported income', () => {
  it('matches what a turn actually pays out', () => {
    const state = createGame({ seed: 20260821, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;

    // Anything but Coin: a city banking shields turns them into gold as well,
    // which is a different income and would muddy the comparison.
    city.producing = { kind: 'unit', id: 'goblin' };

    const player = state.players[0];
    const expected = playerCities(state, 0).reduce(
      (sum, c) => sum + cityIncome(state, c, player).gold - buildingUpkeep(state, c),
      0,
    );
    const before = player.gold;

    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    expect(player.gold - before).toBe(expected);
  });

  it('counts beakers the same way research does', () => {
    const state = createGame({ seed: 20260821, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    city.producing = { kind: 'unit', id: 'goblin' };

    const player = state.players[0];
    const expected = playerCities(state, 0).reduce(
      (sum, c) => sum + cityIncome(state, c, player).beakers,
      0,
    );
    const before = player.beakers;

    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    // Beakers reset when an advance lands, so this only holds while one has
    // not; with a single new city and a real tech cost, it has not.
    expect(player.beakers - before).toBe(expected);
  });
});
