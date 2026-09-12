import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cityGoldBonus, postedAround } from '../src/sim/city';
import { tryStep } from '../src/sim/movement';
import { BUILDINGS } from '../src/model/buildings';
import type { City, GameState } from '../src/model/types';
import { techsForFaction } from '../src/model/techs';
import {
  CALM,
  POSTING,
  assignWorkers,
  buildOptions,
  contentLimit,
  garrisonSize,
  isGarrisoned,
  militiaStrength,
} from '../src/sim/city';
import { unlockedBuildings } from '../src/sim/research';
import { defenseStrength } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';

/**
 * Section 102 turned the building off for good -- it was replaced by a hut on a
 * tile -- so these tests switch it back on. The rule they pin is still in the
 * game behind the lever, and it is the baseline section 102 had to beat.
 */
const savedPosting = { ...POSTING };
beforeEach(() => {
  POSTING.enabled = true;
});
afterEach(() => {
  Object.assign(POSTING, savedPosting);
});

function board(): GameState {
  const state = createGame({ seed: 20260910, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) p.visible.fill(2);
  // Nothing bought with trade, so the limit is the buildings and nothing else.
  state.players[0].rates = { coin: 6, beakers: 6, calm: 0 };
  return state;
}

function town(state: GameState, buildings: City['buildings'] = []): City {
  const c: City = {
    id: 1, owner: 0, name: 'Someplace', x: 10, y: 9, size: 4,
    food: 0, shields: 0, buildings, producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  };
  state.cities.push(c);
  assignWorkers(state, c);
  return c;
}

/**
 * Soldiers where play can actually put them: the first in the city, the rest on
 * the tiles around it.
 *
 * This used to stack every one of them on the city tile with `spawnUnit`, which
 * does not ask whether a tile is free. The game is one unit to a tile, so every
 * test of a Posting paying out was a test of something no game could produce --
 * which is how section 91 shipped a building nobody could switch on. Section 101.
 */
const AROUND: Array<[number, number]> = [
  [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
];
const soldiers = (state: GameState, city: City, n: number) => {
  for (let i = 0; i < n; i++) {
    const [dx, dy] = AROUND[i];
    spawnUnit(state, 0, 'goblin', city.x + dx, city.y + dy, false);
  }
};

/**
 * Section 70. Every other way out of a riot is bought with trade -- a Totem
 * costs shields and upkeep, Placating spends the city's whole production, and
 * the calm share spends empire-wide trade. All the same currency in different
 * hats.
 *
 * This one is bought with **soldiers**, and the opportunity cost is the
 * mechanic: two standing at home are two not standing on somebody else's city.
 */
describe('a posting, paid for in soldiers', () => {
  it('does nothing at all in an empty city', () => {
    const state = board();
    const bare = contentLimit(state, town(state));
    state.cities.length = 0;
    const posted = contentLimit(state, town(state, ['orcPosting']));
    expect(posted).toBe(bare);
  });

  it('does nothing with only the garrison every city already has', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    soldiers(state, city, 1);
    // One is what the AI keeps everywhere, so a bonus gated on one is a
    // discount rather than a cost.
    expect(garrisonSize(state, city)).toBe(1);
    expect(contentLimit(state, city)).toBe(CALM.base);
  });

  it('pays out on the second soldier', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    soldiers(state, city, 2);
    expect(contentLimit(state, city)).toBe(CALM.base + BUILDINGS.orcPosting.contentBonus!);
  });

  it('stops paying the moment they march out', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    soldiers(state, city, 2);
    const posted = contentLimit(state, city);

    state.units.pop();

    expect(contentLimit(state, city)).toBeLessThan(posted);
  });

  it('does not count a settler standing there', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    soldiers(state, city, 1);
    spawnUnit(state, 0, 'peon', city.x + 1, city.y, false);
    // A city is not held by somebody passing through with a shovel.
    expect(postedAround(state, city)).toBe(1);
    expect(contentLimit(state, city)).toBe(CALM.base);
  });

  it('stacks with a Totem, which asks for nothing', () => {
    const state = board();
    const city = town(state, ['orcPosting', 'totem']);
    soldiers(state, city, 2);
    expect(contentLimit(state, city)).toBe(
      CALM.base + BUILDINGS.orcPosting.contentBonus! + BUILDINGS.totem.contentBonus!,
    );
  });

  it('leaves the Totem working on its own when the soldiers leave', () => {
    const state = board();
    const city = town(state, ['orcPosting', 'totem']);
    expect(contentLimit(state, city)).toBe(CALM.base + BUILDINGS.totem.contentBonus!);
  });

  it('mirrors across the two sides at the same price', () => {
    const orc = BUILDINGS.orcPosting;
    const human = BUILDINGS.soldierPosting;
    for (const key of ['cost', 'upkeep', 'contentBonus', 'garrisonNeeded'] as const) {
      expect(orc[key], `${key} differs between the two postings`).toBe(human[key]);
    }
    expect(orc.faction).toBe('orc');
    expect(human.faction).toBe('human');
  });

  it('arrives with the advance that teaches you to have soldiers', () => {
    // Which is the joke: the same advance teaches you to point them inward.
    const orcBarracks = techsForFaction('orc').find((t) => t.buildings.includes('barracks'))!;
    expect(orcBarracks.buildings).toContain('orcPosting');
    const humanBarracks = techsForFaction('human').find((t) => t.buildings.includes('barracks'))!;
    expect(humanBarracks.buildings).toContain('soldierPosting');
  });

  it('is cheaper than the Totem, and earlier', () => {
    // It has to be worth considering, or the soldiers are never the better
    // trade and the whole thing is scenery.
    expect(BUILDINGS.orcPosting.cost).toBeLessThan(BUILDINGS.totem.cost);
    const posting = techsForFaction('orc').find((t) => t.buildings.includes('orcPosting'))!;
    const totem = techsForFaction('orc').find((t) => t.buildings.includes('totem'))!;
    expect(posting.cost).toBeLessThan(totem.cost);
  });

  it('still says a city with one soldier in it is garrisoned', () => {
    // `isGarrisoned` answers a different question -- whether anybody is home --
    // and militia and the defence bonus both lean on it.
    const state = board();
    const city = town(state);
    soldiers(state, city, 1);
    expect(isGarrisoned(state, city)).toBe(true);
  });
});

/**
 * A posting needs somewhere to put the soldiers.
 *
 * The Barracks was doing very little -- section 84 measured it standing in 0.37
 * and 0.07 games out of one -- and it is the obvious place to keep soldiers who
 * are standing about on purpose. So it gates the Posting, using the `needs`
 * field the Cathedral already uses to sit behind a Chapel.
 */
describe('a posting needs a barracks', () => {
  const withTech = (state: GameState) => {
    state.players[0].techs = techsForFaction('orc').map((t) => t.id);
    return state;
  };

  it('is not offered to a city with no barracks', () => {
    const state = withTech(board());
    const city = town(state);
    expect(unlockedBuildings(state.players[0]).map((b) => b.id)).toContain('orcPosting');
    // Known, and still not offered here: the advance is empire-wide and the
    // barracks is a thing standing in this particular city.
    expect(buildOptions(state, city).buildings.map((b) => b.id)).not.toContain('orcPosting');
  });

  it('is offered once the barracks stands', () => {
    const state = withTech(board());
    const city = town(state, ['barracks']);
    expect(buildOptions(state, city).buildings.map((b) => b.id)).toContain('orcPosting');
  });

  it('keeps working if the barracks is later sacked', () => {
    const state = withTech(board());
    const city = town(state, ['barracks', 'orcPosting']);
    soldiers(state, city, 2);
    const before = contentLimit(state, city);

    city.buildings = city.buildings.filter((b) => b !== 'barracks');

    // `needs` gates building the thing, not owning it, which is how the
    // Cathedral already behaves. Losing a building to a sack should not
    // silently switch another one off.
    expect(contentLimit(state, city)).toBe(before);
  });
});

/**
 * The Posting must not become the price of having a guard.
 *
 * It buys *content*. Everything else a soldier standing in a city does -- hold
 * it, defend it, raise militia, count as garrisoned -- has nothing to do with
 * whether anybody built a Posting, and would be a strange rule if it did.
 */
describe('guarding a city, with or without a posting', () => {
  it('counts as garrisoned on one soldier and no posting at all', () => {
    const state = board();
    const city = town(state);
    soldiers(state, city, 1);
    expect(isGarrisoned(state, city)).toBe(true);
  });

  it('raises militia the same either way', () => {
    const bare = board();
    const one = town(bare);
    const posted = board();
    const two = town(posted, ['barracks', 'orcPosting']);
    soldiers(posted, two, 2);
    // Militia is about citizens, and a Posting is not a militia building.
    expect(militiaStrength(one)).toBe(militiaStrength(two));
  });

  it('defends the same either way', () => {
    const bare = board();
    const plain = town(bare);
    const guard = spawnUnit(bare, 0, 'goblin', plain.x, plain.y, false);

    const posted = board();
    const withPosting = town(posted, ['barracks', 'orcPosting']);
    const guard2 = spawnUnit(posted, 0, 'goblin', withPosting.x, withPosting.y, false);
    spawnUnit(posted, 0, 'goblin', withPosting.x + 1, withPosting.y, false);
    // Actually paying, or this compares two cities without a working Posting.
    expect(postedAround(posted, withPosting)).toBe(2);

    // A Posting has no `defenseMult`; it buys patience, not walls.
    expect(defenseStrength(posted, guard2).total).toBe(defenseStrength(bare, guard).total);
  });
});

/**
 * Section 101. A city tile holds one unit, so a Posting that wanted two soldiers
 * *in* the city could not be switched on by anybody. It counts the ones posted
 * around it instead -- and only a building that asks for a number reaches out.
 */
describe('two soldiers, and room for only one in the city', () => {
  it('cannot fit a second soldier into the city by walking one in', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    soldiers(state, city, 1);
    const second = spawnUnit(state, 0, 'goblin', city.x + 2, city.y, false);
    second.moves = 3;

    tryStep(state, second, city.x + 1, city.y);
    const inside = tryStep(state, second, city.x, city.y);

    expect(inside.kind).toBe('blocked');
    expect(garrisonSize(state, city)).toBe(1);
  });

  it('pays out with one in the city and one at the gate', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    spawnUnit(state, 0, 'goblin', city.x, city.y, false);
    spawnUnit(state, 0, 'goblin', city.x + 1, city.y + 1, false);
    expect(contentLimit(state, city)).toBe(CALM.base + BUILDINGS.orcPosting.contentBonus!);
  });

  it('pays out with nobody inside, as long as two stand around it', () => {
    // The consequence of counting around the city, stated rather than
    // discovered: the Posting buys content, and whether the city is held is
    // still asked of the tile.
    const state = board();
    const city = town(state, ['orcPosting']);
    spawnUnit(state, 0, 'goblin', city.x - 1, city.y, false);
    spawnUnit(state, 0, 'goblin', city.x + 1, city.y, false);
    expect(contentLimit(state, city)).toBe(CALM.base + BUILDINGS.orcPosting.contentBonus!);
    expect(isGarrisoned(state, city)).toBe(false);
  });

  it('does not count a soldier two tiles out', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    spawnUnit(state, 0, 'goblin', city.x, city.y, false);
    spawnUnit(state, 0, 'goblin', city.x + 2, city.y, false);
    expect(contentLimit(state, city)).toBe(CALM.base);
  });

  it('does not count somebody else standing at the gate', () => {
    const state = board();
    const city = town(state, ['orcPosting']);
    spawnUnit(state, 0, 'goblin', city.x, city.y, false);
    spawnUnit(state, 1, 'footman', city.x + 1, city.y, false);
    expect(contentLimit(state, city)).toBe(CALM.base);
  });

  it('still asks a treasury whether anybody is actually home', () => {
    // Only a count reaches out. A soldier beside the walls is not home, and the
    // gold buildings ask whether anyone is.
    const state = board();
    const city = town(state, ['treasury']);
    spawnUnit(state, 0, 'goblin', city.x + 1, city.y, false);
    expect(cityGoldBonus(state, city)).toBe(0);
    spawnUnit(state, 0, 'goblin', city.x, city.y, false);
    expect(cityGoldBonus(state, city)).toBeGreaterThan(0);
  });
});
