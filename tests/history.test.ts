import { describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { createGame } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, playerScore } from '../src/sim/turn';
import { replayFrames, ROW } from '../src/sim/history';
import { deserialize, serialize } from '../src/persist/save';
import { momentsOf } from '../src/ui/replay';
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
