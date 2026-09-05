import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/model/buildings';
import type { City, GameState } from '../src/model/types';
import { techsForFaction } from '../src/model/techs';
import { CALM, assignWorkers, contentLimit, garrisonSize, isGarrisoned } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';

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

const soldiers = (state: GameState, city: City, n: number) => {
  for (let i = 0; i < n; i++) spawnUnit(state, 0, 'goblin', city.x, city.y, false);
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
    spawnUnit(state, 0, 'peon', city.x, city.y, false);
    // A city is not held by somebody passing through with a shovel.
    expect(garrisonSize(state, city)).toBe(1);
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
