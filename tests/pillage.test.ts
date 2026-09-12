import { afterEach, describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import type { City, GameState } from '../src/model/types';
import { AI_TUNING, runAiTurn } from '../src/ai/ai';
import { runRaiders } from '../src/sim/barbarians';
import { barbarianOf, createGame, spawnUnit } from '../src/sim/gamestate';
import { PILLAGE, canPillage, hasRoad, pillage } from '../src/sim/roads';
import { tradeLinks, updateTradeLinks } from '../src/sim/trade';

/**
 * Section 96: tearing up what somebody else built.
 *
 * It waited on section 27 for a stated reason -- there was nothing out on a tile
 * to ruin, and a land special is generated rather than chosen, so losing one
 * would be bad luck rather than a consequence of leaving a border unwatched.
 * Roads are the first thing anybody decided to put there, and section 106 made
 * them worth money.
 */

const saved = { ...PILLAGE };
const savedAi = { ...AI_TUNING };
afterEach(() => {
  Object.assign(PILLAGE, saved);
  Object.assign(AI_TUNING, savedAi);
});

/** Two of the Horde's cities with a treasury each, a road between them. */
function linked(withRaiders = false): { state: GameState; cities: City[] } {
  const state = createGame({
    seed: 20260916,
    width: 40,
    height: 20,
    barbarians: withRaiders,
  });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const cities: City[] = [];
  for (let n = 0; n < 2; n++) {
    const city: City = {
      id: n + 1,
      owner: 0,
      name: `Town ${n + 1}`,
      x: 3 + n * 10,
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
  state.roads = new Array(state.width * state.height).fill(0);
  for (let x = 4; x <= 12; x++) state.roads[idx(x, 5, state.width)] = 1;
  return { state, cities };
}

describe('tearing up a road', () => {
  it('takes the road and the rest of the turn with it', () => {
    const { state } = linked();
    const raider = spawnUnit(state, 1, 'footman', 8, 5, false);

    expect(pillage(state, raider)).toBe(true);

    expect(hasRoad(state, 8, 5)).toBe(false);
    expect(raider.moves).toBe(0);
  });

  it('tells everybody who can see the tile, and points at it', () => {
    const { state } = linked();
    const raider = spawnUnit(state, 1, 'footman', 8, 5, false);
    pillage(state, raider);

    const said = state.log.filter((e) => e.text.includes('tear up the road'));
    // One line each for the two sides that can see it -- bad news for the side
    // that did not do it.
    expect(said).toHaveLength(2);
    expect(said.find((e) => e.player === 0)?.kind).toBe('bad');
    expect(said.find((e) => e.player === 0)?.at).toEqual([8, 5]);
  });

  it('is refused where there is nothing to tear up', () => {
    const { state, cities } = linked();
    const away = spawnUnit(state, 1, 'footman', 20, 12, false);
    expect(canPillage(state, away).ok).toBe(false);

    // A city counts as a road for movement and trade, and is not one: wrecking a
    // city is sacking it, which is section 95 and a different rule.
    const inTown = spawnUnit(state, 1, 'footman', cities[0].x, cities[0].y + 1, false);
    inTown.x = cities[0].x;
    inTown.y = cities[0].y;
    expect(canPillage(state, inTown).ok).toBe(false);
  });

  it('is refused to workers, who build rather than wreck', () => {
    const { state } = linked();
    const peon = spawnUnit(state, 0, 'peon', 8, 5, false);
    expect(canPillage(state, peon).ok).toBe(false);
    expect(pillage(state, peon)).toBe(false);
    expect(hasRoad(state, 8, 5)).toBe(true);
  });

  it('is refused with the lever off, which is how it is measured', () => {
    PILLAGE.enabled = false;
    const { state } = linked();
    const raider = spawnUnit(state, 1, 'footman', 8, 5, false);
    expect(canPillage(state, raider).ok).toBe(false);
    expect(hasRoad(state, 8, 5)).toBe(true);
  });

  it('cuts the trade route that ran through it, and says which one', () => {
    const { state } = linked();
    expect(tradeLinks(state, 0)).toHaveLength(1);
    updateTradeLinks(state, state.players[0]);

    const raider = spawnUnit(state, 1, 'footman', 8, 5, false);
    pillage(state, raider);

    expect(tradeLinks(state, 0)).toHaveLength(0);
    expect(updateTradeLinks(state, state.players[0])).toBe(0);
    const lost = state.log.filter((e) => e.text.includes('is no more'));
    expect(lost).toHaveLength(1);
    expect(lost[0].text).toContain('Town 1');
    expect(lost[0].text).toContain('Town 2');
  });
});

describe('who does it without being asked', () => {
  it('has raiders wreck the road they are standing on, with nobody in reach', () => {
    const { state } = linked(true);
    // A raider band standing on the road, far enough from the towns that there
    // is nothing to hit.
    const wild = barbarianOf(state)!;
    const raider = spawnUnit(state, wild.id, 'footman', 8, 5, false);

    runRaiders(state, wild.id);

    expect(hasRoad(state, 8, 5)).toBe(false);
    expect([raider.x, raider.y]).toEqual([8, 5]);
  });

  it('has raiders walk on when there is something to hit instead', () => {
    const { state, cities } = linked(true);
    const wild = barbarianOf(state)!;
    spawnUnit(state, wild.id, 'footman', cities[1].x - 1, cities[1].y, false);

    runRaiders(state, wild.id);

    // Standing on road, one step from a city: the city is the point of a raid.
    expect(hasRoad(state, cities[1].x - 1, cities[1].y)).toBe(true);
  });

  it('has the AI wreck a road in enemy country but not one at home', () => {
    const { state } = linked();
    // The Kingdom's soldier deep in Horde country, standing on their road.
    const theirs = spawnUnit(state, 1, 'footman', 8, 5, false);
    // And one of the Horde's own, standing on the same road at home.
    const ours = spawnUnit(state, 0, 'orc', 6, 5, false);

    runAiTurn(state, 1);
    expect(hasRoad(state, 8, 5)).toBe(false);
    expect(theirs.moves).toBe(0);

    runAiTurn(state, 0);
    expect(hasRoad(state, 6, 5)).toBe(true);
    expect(ours.moves).toBeGreaterThanOrEqual(0);
  });
});
