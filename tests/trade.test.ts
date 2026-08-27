import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/model/types';
import {
  LUXURY_PER_CONTENT,
  baseTrade,
  contentLimit,
  foundCity,
  rushBlocked,
  rushBuy,
  rushCost,
} from '../src/sim/city';
import { EVEN_RATES, TRADE_STEPS, splitTrade, tradeRates } from '../src/sim/research';
import { createGame } from '../src/sim/gamestate';
import { runAiTurn } from '../src/ai/ai';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

function withCity(): { state: GameState; city: NonNullable<ReturnType<typeof foundCity>> } {
  const state = createGame({ seed: 20260826, width: 40, height: 30 });
  const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
  const city = foundCity(state, settler)!;
  return { state, city };
}

describe('an empire divides its trade three ways', () => {
  it('starts perfectly even', () => {
    const { state } = withCity();
    const rates = tradeRates(state.players[0]);
    expect(rates).toEqual(EVEN_RATES);
    expect(rates.coin + rates.beakers + rates.calm).toBe(TRADE_STEPS);
    expect(rates.coin).toBe(rates.beakers);
    expect(rates.beakers).toBe(rates.calm);
  });

  it('never loses or invents a point of trade in the rounding', () => {
    const { state } = withCity();
    const player = state.players[0];
    const arrangements = [
      EVEN_RATES,
      { coin: 7, beakers: 3, calm: 2 },
      { coin: 0, beakers: 0, calm: 12 },
    ];
    for (const rates of arrangements) {
      player.rates = rates;
      for (let trade = 0; trade < 40; trade++) {
        const { gold, beakers, luxury } = splitTrade(player, trade);
        // Rounded parts that each go their own way quietly gain or lose a
        // point; the whole has to add back up at every value.
        expect(gold + beakers + luxury, `trade ${trade} at ${JSON.stringify(rates)}`).toBe(trade);
      }
    }
  });

  it('reads an old save that only knew about tax', () => {
    const { state } = withCity();
    const player = state.players[0];
    delete player.rates;
    player.taxRate = 10;
    // The balance the game was actually being played with, rather than a
    // silent reset to even on the first load after an update.
    const rates = tradeRates(player);
    expect(rates.coin).toBe(TRADE_STEPS);
    expect(rates.calm).toBe(0);
  });
});

describe('spending on keeping people calm', () => {
  it('raises what a city will put up with', () => {
    const { state, city } = withCity();
    const player = state.players[0];
    // Only meaningful where there is trade to spend in the first place.
    if (baseTrade(state, city) < LUXURY_PER_CONTENT * 2) return;

    player.rates = { coin: TRADE_STEPS, beakers: 0, calm: 0 };
    const mean = contentLimit(state, city);
    player.rates = { coin: 0, beakers: 0, calm: TRADE_STEPS };

    expect(contentLimit(state, city)).toBeGreaterThan(mean);
  });

  it('is measured on a rioting city, which is the whole point', () => {
    const { state, city } = withCity();
    city.size = contentLimit(state, city) + 1;
    city.disorder = true;

    // Trade collected during a riot is zero, so a rule that read the collected
    // figure would do nothing at the one moment anybody wants it to.
    expect(baseTrade(state, city)).toBeGreaterThan(0);
  });
});

describe('rushing a build in a city that is rioting', () => {
  function rioting() {
    const { state, city } = withCity();
    city.producing = { kind: 'unit', id: 'goblin' };
    city.shields = 0;
    city.disorder = true;
    return { state, city };
  }

  it('is allowed, if the coin is there', () => {
    const { state, city } = rioting();
    state.players[0].gold = 9999;

    // A rioting city earns no shields, so buying the way out is the only exit
    // that does not depend on an advance turning up for other reasons.
    expect(rushBlocked(state, city)).toBeNull();
    expect(rushBuy(state, city)).toBe(true);
  });

  it('still refuses when the coin is not there', () => {
    const { state, city } = rioting();
    state.players[0].gold = 0;

    expect(rushBlocked(state, city)).toMatch(/gold/i);
    expect(rushBuy(state, city)).toBe(false);
  });

  it('delivers the thing that was paid for', () => {
    const { state, city } = rioting();
    state.players[0].gold = rushCost(state, city);
    const before = state.units.length;

    rushBuy(state, city);
    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    expect(state.units.length, 'the thing paid for never arrived').toBeGreaterThan(before);
  });
});

/**
 * The even default is the right place for a *human* to start, because they can
 * move off it. The AI never did, and a default nobody adjusts is not a default,
 * it is a rule -- measured, an even split cost the AI a fifth of its research
 * and took the Horde from 10-19 to 4-29. See DESIGN_QUEUE section 47.
 */
describe('the AI sets its own trade split', () => {
  function aiEmpire() {
    const state = createGame({ seed: 20260826, width: 40, height: 30 });
    for (const p of state.players) p.controller = 'ai';
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    return { state, city };
  }

  it('moves off the even default rather than sitting on it', () => {
    const { state } = aiEmpire();
    runAiTurn(state, 0);
    expect(state.players[0].rates).not.toEqual(EVEN_RATES);
  });

  it('always divides the whole twelve, whatever it decides', () => {
    const { state, city } = aiEmpire();
    for (const size of [1, 5, 9, 20]) {
      city.size = size;
      city.disorder = size > 8;
      runAiTurn(state, 0);
      const r = state.players[0].rates!;
      expect(r.coin + r.beakers + r.calm, `size ${size}`).toBe(TRADE_STEPS);
      expect(Math.min(r.coin, r.beakers, r.calm)).toBeGreaterThanOrEqual(0);
    }
  });

  it('buys calm when a city riots, and study when none does', () => {
    const { state, city } = aiEmpire();

    city.disorder = false;
    city.size = 1;
    runAiTurn(state, 0);
    const settled = state.players[0].rates!;

    city.disorder = true;
    runAiTurn(state, 0);
    const troubled = state.players[0].rates!;

    // Exactly as much calm as the cities are asking for, and the rest into
    // study, which is what wins games that are not already won.
    expect(troubled.calm).toBeGreaterThan(settled.calm);
    expect(settled.beakers).toBeGreaterThan(settled.coin);
  });
});
