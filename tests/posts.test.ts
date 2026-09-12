import { afterEach, describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import type { City, GameState } from '../src/model/types';
import { AI_TUNING, PERSONALITIES, runAiTurn } from '../src/ai/ai';
import { CALM, contentLimit } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { POSTS, canBuildPost, hasPost, mannedPosts, startPost } from '../src/sim/posts';
import { PILLAGE, pillage } from '../src/sim/roads';
import { deserialize, serialize } from '../src/persist/save';
import { beginPlayerTurn } from '../src/sim/turn';

/**
 * Section 102: a garrison post is a hut on a tile rather than a building inside
 * the walls, which is what section 101 could not arrange -- the game is one unit
 * to a tile, so two soldiers could never stand in a city. Two huts, two
 * soldiers.
 */

const saved = { ...POSTS };
const savedAi = { ...AI_TUNING };
const savedCalm = { ...CALM };
afterEach(() => {
  Object.assign(POSTS, saved);
  Object.assign(AI_TUNING, savedAi);
  Object.assign(CALM, savedCalm);
});

/**
 * One city of the Horde's on open grass, with room beside it.
 *
 * `expanded` adds enough other cities to put the side past its target, which is
 * what the AI waits for before it spends a worker on anything but founding --
 * the same gate roads sit behind, and section 28's entanglement is the reason.
 */
function town(size = 8, expanded = false): { state: GameState; city: City } {
  const state = createGame({ seed: 20260918, width: 40, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.controller = 'ai';
  }
  const city: City = {
    id: 1,
    owner: 0,
    name: 'Grubhollow',
    x: 10,
    y: 10,
    size,
    food: 0,
    shields: 0,
    buildings: [],
    producing: { kind: 'coin' },
    workedTiles: [],
    disorder: false,
    foundedTurn: 1,
    foundedBy: 0,
  };
  state.cities.push(city);
  if (expanded) {
    for (let n = 0; n < PERSONALITIES.orc.targetCities; n++) {
      state.cities.push({
        ...city,
        id: n + 2,
        name: `Elsewhere ${n}`,
        x: 2 + n * 4,
        y: 2,
        size: 2,
      });
    }
  }
  spawnUnit(state, 1, 'footman', 38, 18, false);
  return { state, city };
}

/** A post on a tile, without waiting the turns out. */
function post(state: GameState, x: number, y: number): void {
  state.posts ??= new Array(state.width * state.height).fill(0);
  state.posts[idx(x, y, state.width)] = 1;
}

describe('building a post', () => {
  it('takes a worker the turns it takes, and then there is a post', () => {
    const { state } = town();
    const peon = spawnUnit(state, 0, 'peon', 11, 10, false);

    expect(startPost(state, peon)).toBe(true);
    expect(peon.order).toBe('post');
    expect(peon.work).toBe(POSTS.turns);

    for (let turn = 0; turn < POSTS.turns; turn++) beginPlayerTurn(state, 0);

    expect(hasPost(state, 11, 10)).toBe(true);
    expect(peon.order).toBe('none');
  });

  it('is refused on water, on a city, and where one already stands', () => {
    const { state, city } = town();
    const peon = spawnUnit(state, 0, 'peon', 11, 10, false);
    post(state, 11, 10);
    expect(canBuildPost(state, peon).ok).toBe(false);

    peon.x = city.x;
    peon.y = city.y;
    expect(canBuildPost(state, peon).ok).toBe(false);

    peon.x = 12;
    peon.y = 10;
    state.terrain[idx(12, 10, state.width)] = 'water';
    expect(canBuildPost(state, peon).ok).toBe(false);
  });

  it('is refused to soldiers, who have nothing to build with', () => {
    const { state } = town();
    const orc = spawnUnit(state, 0, 'orc', 11, 10, false);
    expect(canBuildPost(state, orc).ok).toBe(false);
  });

  it('is refused with the lever off, which is how it is measured', () => {
    POSTS.enabled = false;
    const { state } = town();
    const peon = spawnUnit(state, 0, 'peon', 11, 10, false);
    expect(canBuildPost(state, peon).ok).toBe(false);
  });
});

describe('what a post is worth', () => {
  it('is nothing at all until somebody stands on it', () => {
    const { state, city } = town();
    const before = contentLimit(state, city);
    post(state, 11, 10);
    expect(mannedPosts(state, city)).toBe(0);
    expect(contentLimit(state, city)).toBe(before);

    spawnUnit(state, 0, 'orc', 11, 10, false);
    expect(mannedPosts(state, city)).toBe(1);
    expect(contentLimit(state, city)).toBe(before + POSTS.contentBonus);
  });

  it('counts two soldiers, which the building it replaces never could', () => {
    const { state, city } = town();
    post(state, 11, 10);
    post(state, 9, 10);
    spawnUnit(state, 0, 'orc', 11, 10, false);
    spawnUnit(state, 0, 'orc', 9, 10, false);
    expect(mannedPosts(state, city)).toBe(2);
    expect(contentLimit(state, city)).toBe(CALM.base + 2 * POSTS.contentBonus);
  });

  it('does not count a Peon standing in the hut', () => {
    const { state, city } = town();
    post(state, 11, 10);
    spawnUnit(state, 0, 'peon', 11, 10, false);
    expect(mannedPosts(state, city)).toBe(0);
  });

  it('does not count somebody else standing on it, or a post across the map', () => {
    const { state, city } = town();
    post(state, 11, 10);
    spawnUnit(state, 1, 'footman', 11, 10, false);
    expect(mannedPosts(state, city)).toBe(0);

    post(state, 30, 4);
    spawnUnit(state, 0, 'orc', 30, 4, false);
    expect(mannedPosts(state, city)).toBe(0);
  });

  it('pays for no more than the cap, however many huts there are', () => {
    const { state, city } = town();
    for (const [x, y] of [[11, 10], [9, 10], [10, 11], [10, 9]] as Array<[number, number]>) {
      post(state, x, y);
      spawnUnit(state, 0, 'orc', x, y, false);
    }
    expect(mannedPosts(state, city)).toBe(POSTS.maxPerCity);
  });
});

describe('a post is something to lose', () => {
  it('can be torn down, which is section 96 finding its third customer', () => {
    const { state } = town();
    post(state, 11, 10);
    const raider = spawnUnit(state, 1, 'footman', 11, 10, false);

    expect(PILLAGE.enabled).toBe(true);
    expect(pillage(state, raider)).toBe(true);
    expect(hasPost(state, 11, 10)).toBe(false);
    expect(state.log.some((e) => e.text.includes('tear down the garrison post'))).toBe(true);
  });

  it('survives a save and comes back on the same tile', () => {
    const { state } = town();
    post(state, 11, 10);
    const back = deserialize(serialize(state));
    expect(hasPost(back, 11, 10)).toBe(true);
    expect(hasPost(back, 12, 10)).toBe(false);
  });
});

describe('the AI and its posts', () => {
  it('sends a worker to build one for a city that is about to riot', () => {
    const { state, city } = town(CALM.base + 1, true);
    const peon = spawnUnit(state, 0, 'peon', 13, 10, false);

    for (let turn = 0; turn < 3; turn++) {
      runAiTurn(state, 0);
      for (const u of state.units) u.moves = 1;
    }

    expect(city.size).toBeGreaterThanOrEqual(contentLimit(state, city) - 1);
    expect(peon.order === 'post' || hasPost(state, peon.x, peon.y)).toBe(true);
  });

  it('leaves a calm city alone, which is the narrowness the measurement wants', () => {
    const { state } = town(2, true);
    const peon = spawnUnit(state, 0, 'peon', 13, 10, false);

    runAiTurn(state, 0);

    expect(peon.order).not.toBe('post');
  });

  it('stands a soldier on the post, and keeps it there', () => {
    const { state } = town(CALM.base + 2);
    post(state, 11, 10);
    const orc = spawnUnit(state, 0, 'orc', 13, 10, false);

    for (let turn = 0; turn < 3; turn++) {
      runAiTurn(state, 0);
      for (const u of state.units) u.moves = 1;
    }

    expect([orc.x, orc.y]).toEqual([11, 10]);
    expect(orc.order).toBe('fortified');
  });

  it('does none of it with the lever off', () => {
    AI_TUNING.buildPosts = false;
    const { state } = town(CALM.base + 2);
    post(state, 11, 10);
    const orc = spawnUnit(state, 0, 'orc', 13, 10, false);
    const peon = spawnUnit(state, 0, 'peon', 13, 11, false);

    runAiTurn(state, 0);

    expect([orc.x, orc.y]).not.toEqual([11, 10]);
    expect(peon.order).not.toBe('post');
  });
});
