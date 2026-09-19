import { describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { createGame } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, playerScore } from '../src/sim/turn';
import { replayFrames, ROW } from '../src/sim/history';
import { deserialize, serialize } from '../src/persist/save';
import { momentsOf } from '../src/ui/replay';
import { BUILDINGS } from '../src/model/buildings';
import { foundCity, processCity } from '../src/sim/city';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';

/** An AI-against-AI game played to the start of `turn`. */
function playTo(turn: number): GameState {
  const state = createGame({ seed: 20260918, width: 40, height: 30 });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);
  while (state.turn < turn && state.winner === null) {
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
  }
  return state;
}

const score = (state: GameState) => (id: number) => playerScore(state, id);

describe('the replay record (section 15)', () => {
  it('keeps one entry a finished turn, from the first', () => {
    const state = playTo(21);
    expect(state.history?.map((r) => r.turn)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('records what the game actually held', () => {
    const state = playTo(21);
    const last = state.history!.at(-1)!;
    // Nothing has happened since turn 20 closed, bar the new turn's start.
    for (const p of state.players) {
      const row = last.players[p.id];
      expect(row[ROW.advances]).toBeLessThanOrEqual(p.techs.length);
      expect(row[ROW.cities]).toBeGreaterThan(0);
    }
    // Every city in the record has somewhere to stand.
    for (let i = 0; i < last.cities.length; i += 3) {
      expect(state.sites?.[last.cities[i]]).toBeDefined();
    }
  });

  it('survives a save', () => {
    const state = playTo(12);
    const loaded = deserialize(serialize(state));
    expect(loaded.history).toEqual(state.history);
    expect(loaded.sites).toEqual(state.sites);
  });

  it('replays to the moment the game ended, not the turn before', () => {
    const state = playTo(12);
    const frames = replayFrames(state, score(state));
    expect(frames.length).toBe(state.history!.length + 1);
    expect(frames.at(-1)!.turn).toBe(state.turn);
  });

  it('names a city that changes hands', () => {
    const state = playTo(12);
    const city = state.cities.find((c) => c.owner === 0)!;
    const before = replayFrames(state, score(state));
    city.owner = 1;
    const after = replayFrames(state, score(state));
    const moments = momentsOf(state, [...before.slice(0, -1), after.at(-1)!]);
    expect(moments.at(-1)?.text).toContain(city.name);
    expect(moments.at(-1)?.text).toContain(state.players[1].name);
  });
});

/**
 * Asked for after a played game: the replay without the follies is a list of
 * towns changing hands, and the folly is often the reason the game went the
 * way it did. There is one of each in the world, so they are what a game is
 * remembered by.
 */
describe('the great works in the record', () => {
  function cityBuilding(id: 'loudestRock' | 'granary'): GameState {
    const state = createGame({ seed: 20260919, width: 30, height: 20 });
    state.terrain.fill('grass');
    const settler = state.units.find((u) => u.owner === 0 && unitType(u.type).settler)!;
    const city = foundCity(state, settler)!;
    city.size = 6;
    state.turn = 42;
    city.producing = { kind: 'building', id };
    city.shields = BUILDINGS[id].cost + 10;
    processCity(state, city);
    return state;
  }

  it('remembers a folly, where it stands and whose it is', () => {
    const state = cityBuilding('loudestRock');
    expect(state.cities[0].buildings).toContain('loudestRock');
    expect(state.landmarks).toEqual([
      { turn: 42, city: state.cities[0].id, owner: 0, id: 'loudestRock' },
    ]);
  });

  it('does not remember an ordinary building', () => {
    const state = cityBuilding('granary');
    expect(state.cities[0].buildings).toContain('granary');
    expect(state.landmarks ?? []).toEqual([]);
  });

  it('puts it in the replay, by name and in order', () => {
    const state = cityBuilding('loudestRock');
    const frames = replayFrames(state, score(state));
    const said = momentsOf(state, frames).map((m) => m.text);
    expect(said.some((t) => t.includes('The Loudest Rock'))).toBe(true);
    expect(said.some((t) => t.includes(state.cities[0].name))).toBe(true);
  });

  it('survives a save', () => {
    const state = cityBuilding('loudestRock');
    expect(deserialize(serialize(state)).landmarks).toEqual(state.landmarks);
  });
});
