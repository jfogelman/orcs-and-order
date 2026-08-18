import { describe, expect, it } from 'vitest';
import { availableRaces, CITIZEN_RACES } from '../src/model/citizens';
import type { GameState } from '../src/model/types';
import { foodToGrow, rollCitizen, syncCitizens } from '../src/sim/city';
import { createGame, playerCities } from '../src/sim/gamestate';
import { beginPlayerTurn } from '../src/sim/turn';

/**
 * Who lives in your cities.
 *
 * Descriptive only -- nothing here feeds back into yields or contentment --
 * but the rule that matters is that people already living somewhere are never
 * re-rolled when you learn to attract somebody new.
 */

function game(): GameState {
  return createGame({ seed: 8080, width: 30, height: 20 });
}

describe('which sorts of people will live with you', () => {
  it('starts each side with exactly one sort', () => {
    const state = game();
    for (const p of state.players) {
      const open = availableRaces(p);
      expect(open, `${p.faction} should start with one sort`).toHaveLength(1);
    }
  });

  it('gives the Horde more sorts than the Kingdom, once everything is known', () => {
    // The joke: it is less an empire than an accident that keeps acquiring
    // participants.
    const horde = CITIZEN_RACES.filter((r) => r.faction === 'orc');
    const kingdom = CITIZEN_RACES.filter((r) => r.faction === 'human');
    expect(horde.length).toBeGreaterThan(kingdom.length);
  });

  it('opens up a sort only once its advance is in', () => {
    const state = game();
    const orcs = state.players[0];
    const gated = CITIZEN_RACES.find((r) => r.faction === 'orc' && r.needs)!;
    expect(availableRaces(orcs).map((r) => r.id)).not.toContain(gated.id);
    orcs.techs.push(gated.needs!);
    expect(availableRaces(orcs).map((r) => r.id)).toContain(gated.id);
  });

  it('names an advance that actually exists for every gated sort', () => {
    // A typo here would silently make a race unreachable forever.
    for (const race of CITIZEN_RACES) {
      if (!race.needs) continue;
      const state2 = game();
      state2.players[0].techs.push(race.needs);
      state2.players[1].techs.push(race.needs);
      const reachable = state2.players.some((p) =>
        availableRaces(p).some((r) => r.id === race.id),
      );
      expect(reachable, `${race.id} needs '${race.needs}', which unlocks nothing`).toBe(true);
    }
  });
});

describe('rolling a new citizen', () => {
  it('only ever produces a sort the owner can attract', () => {
    const state = game();
    const city = playerCities(state, 0)[0] ?? null;
    const target = city ?? {
      id: 1, owner: 0, name: 'X', x: 5, y: 5, size: 1, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' as const }, workedTiles: [],
      disorder: false, foundedTurn: 1, citizens: [],
    };
    if (!city) state.cities.push(target);
    const allowed = new Set(availableRaces(state.players[0]).map((r) => r.id));
    for (let i = 0; i < 50; i++) {
      expect(allowed.has(rollCitizen(state, target))).toBe(true);
    }
  });

  it('keeps the people already there when a new sort becomes available', () => {
    // The rule the whole feature turns on.
    const state = game();
    const city = {
      id: 99, owner: 0, name: 'Old Town', x: 5, y: 5, size: 4, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' as const }, workedTiles: [],
      disorder: false, foundedTurn: 1, citizens: [] as string[],
    };
    state.cities.push(city);
    const before = [...syncCitizens(state, city)];
    expect(before).toHaveLength(4);

    const gated = CITIZEN_RACES.find((r) => r.faction === 'orc' && r.needs)!;
    state.players[0].techs.push(gated.needs!);
    city.size = 6;
    const after = syncCitizens(state, city);
    expect(after.slice(0, 4), 'existing residents were re-rolled').toEqual(before);
    expect(after).toHaveLength(6);
  });

  it('matches the roster to the size in both directions', () => {
    const state = game();
    const city = {
      id: 98, owner: 0, name: 'Flux', x: 6, y: 6, size: 3, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' as const }, workedTiles: [],
      disorder: false, foundedTurn: 1, citizens: [] as string[],
    };
    state.cities.push(city);
    expect(syncCitizens(state, city)).toHaveLength(3);
    city.size = 1;
    expect(syncCitizens(state, city)).toHaveLength(1);
  });

  it('gives a growing city somebody new', () => {
    const state = game();
    state.players[0].controller = 'ai';
    const city = playerCities(state, 0)[0];
    if (!city) return;
    city.citizens = [];
    syncCitizens(state, city);
    const before = city.citizens.length;
    city.food = foodToGrow(city.size);
    beginPlayerTurn(state, 0);
    if (city.size > before) {
      expect(city.citizens).toHaveLength(city.size);
    }
  });
});
