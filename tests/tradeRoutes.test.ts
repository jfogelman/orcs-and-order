import { afterEach, describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import type { City, GameState } from '../src/model/types';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import {
  TRADE,
  linkGold,
  linksForCity,
  tradeGold,
  tradeLinks,
  updateTradeLinks,
} from '../src/sim/trade';
import { beginPlayerTurn } from '../src/sim/turn';

/**
 * Section 106: a road between two cities that both have something to sell pays
 * gold every turn. Section 27's third step, and the first time a road is worth
 * anything to a side that never marches anywhere.
 */

const saved = { ...TRADE };
afterEach(() => {
  Object.assign(TRADE, saved);
});

/**
 * The Horde's cities in a row on open grass at y = 5, `apart` tiles between
 * each, every one with a Goblin Treasury and a soldier standing in it. Somebody
 * else stands far away so nobody is eliminated.
 */
function empire(count = 2, apart = 10): { state: GameState; cities: City[] } {
  const state = createGame({ seed: 20260913, width: 40, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const cities: City[] = [];
  for (let n = 0; n < count; n++) {
    const city: City = {
      id: n + 1,
      owner: 0,
      name: `Town ${n + 1}`,
      x: 3 + n * apart,
      y: 5,
      size: 4,
      food: 0,
      shields: 0,
      buildings: ['treasury'],
      producing: { kind: 'coin' },
      workedTiles: [],
      disorder: false,
      foundedTurn: 1 + n,
      foundedBy: 0,
    };
    state.cities.push(city);
    cities.push(city);
    spawnUnit(state, 0, 'orc', city.x, city.y, false).order = 'fortified';
  }
  spawnUnit(state, 1, 'footman', 38, 18, false);
  return { state, cities };
}

/** Road along y = 5 between two x positions, exclusive of the city tiles. */
function road(state: GameState, fromX: number, toX: number): void {
  state.roads ??= new Array(state.width * state.height).fill(0);
  for (let x = fromX; x <= toX; x++) state.roads[idx(x, 5, state.width)] = 1;
}

describe('trade routes', () => {
  it('pays for a road that joins two cities with something to sell', () => {
    const { state } = empire();
    road(state, 4, 12);
    const links = tradeLinks(state, 0);
    expect(links).toHaveLength(1);
    // Ten tiles apart on a 40x20 map: scale 30, so six gold a turn at full span
    // comes to two here.
    expect(links[0]).toMatchObject({ a: 1, b: 2, distance: 10, gold: 2, paying: true });
    expect(tradeGold(state, 0)).toBe(2);
  });

  it('is what the turn actually pays out', () => {
    const withRoad = empire();
    road(withRoad.state, 4, 12);
    const without = empire();

    const gained = (state: GameState) => {
      const before = state.players[0].gold;
      beginPlayerTurn(state, 0);
      return state.players[0].gold - before;
    };
    // Identical empires on the same seed, so the only difference between them is
    // the road. Two gold, exactly what the link says.
    expect(gained(withRoad.state) - gained(without.state)).toBe(2);
  });

  it('pays nothing across a gap in the road', () => {
    const { state } = empire();
    road(state, 4, 12);
    state.roads![idx(8, 5, state.width)] = 0;
    expect(tradeLinks(state, 0)).toHaveLength(0);
  });

  it('pays nothing when one end has nothing to sell', () => {
    const { state, cities } = empire();
    cities[1].buildings = [];
    road(state, 4, 12);
    expect(tradeLinks(state, 0)).toHaveLength(0);
  });

  it('lists the route but pays nothing while a treasury stands unguarded', () => {
    const { state, cities } = empire();
    road(state, 4, 12);
    state.units = state.units.filter((u) => !(u.x === cities[1].x && u.y === cities[1].y));
    const links = tradeLinks(state, 0);
    expect(links).toHaveLength(1);
    expect(links[0].paying).toBe(false);
    expect(tradeGold(state, 0)).toBe(0);
  });

  it('pays more for a longer road, and scales with the map', () => {
    const { state } = empire();
    expect(linkGold(state, 20)).toBeGreaterThan(linkGold(state, 10));
    // A link spanning the map's own scale is worth the same on any map size.
    const big = createGame({ seed: 1, width: 80, height: 40 });
    expect(linkGold(big, 60)).toBe(linkGold(state, 30));
  });

  it('pays nothing between cities that are nearly neighbours', () => {
    const { state } = empire(2, 3);
    road(state, 4, 5);
    expect(tradeLinks(state, 0)).toHaveLength(0);
  });

  it('pays a city for its best two links and no more', () => {
    const { state, cities } = empire(4, 6);
    road(state, 4, 3 + 3 * 6);
    const links = tradeLinks(state, 0);
    expect(links.length).toBeGreaterThan(0);
    for (const c of cities) {
      expect(linksForCity(state, c).length).toBeLessThanOrEqual(TRADE.maxLinksPerCity);
    }
    // Four cities in a row could make six pairs; the cap allows four.
    expect(links.length).toBeLessThanOrEqual(4);
  });

  it('does not join two different sides, however good the road', () => {
    const { state, cities } = empire();
    cities[1].owner = 1;
    cities[1].buildings = ['market'];
    road(state, 4, 12);
    expect(tradeLinks(state, 0)).toHaveLength(0);
    expect(tradeLinks(state, 1)).toHaveLength(0);
  });

  it('says so when a route opens, and again when it is lost', () => {
    const { state } = empire();
    road(state, 4, 12);

    expect(updateTradeLinks(state, state.players[0])).toBe(2);
    const opened = state.log.filter((e) => e.text.includes('trade route'));
    expect(opened).toHaveLength(1);
    expect(opened[0].text).toContain('Town 1');
    expect(opened[0].text).toContain('Town 2');
    expect(opened[0].kind).toBe('good');

    // A route that opens with a treasury unguarded says what it would pay, not
    // what it is paying, because the player cannot check the difference.
    const idle = empire();
    road(idle.state, 4, 12);
    idle.state.units = idle.state.units.filter(
      (u) => !(u.x === idle.cities[1].x && u.y === idle.cities[1].y),
    );
    updateTradeLinks(idle.state, idle.state.players[0]);
    const said = idle.state.log.find((e) => e.text.includes('trade route'))!;
    expect(said.text).toContain('once somebody stands guard');
    expect(said.kind).toBe('info');

    // Said once, not every turn for the rest of the game.
    updateTradeLinks(state, state.players[0]);
    expect(state.log.filter((e) => e.text.includes('trade route'))).toHaveLength(1);

    state.roads![idx(8, 5, state.width)] = 0;
    expect(updateTradeLinks(state, state.players[0])).toBe(0);
    const lost = state.log.filter((e) => e.text.includes('is no more'));
    expect(lost).toHaveLength(1);
    expect(lost[0].kind).toBe('bad');
    expect(state.players[0].tradeLinks).toBeUndefined();
  });

  it('pays nothing at all with the lever off, which is how it is measured', () => {
    TRADE.enabled = false;
    const { state } = empire();
    road(state, 4, 12);
    expect(tradeLinks(state, 0)).toHaveLength(0);
    expect(tradeGold(state, 0)).toBe(0);
  });

  it('costs nothing to ask about a game with no roads in it', () => {
    const { state } = empire();
    expect(state.roads).toBeUndefined();
    expect(tradeLinks(state, 0)).toHaveLength(0);
  });
});
