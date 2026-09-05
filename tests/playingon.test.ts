import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { assignWorkers } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { continuePlaying, endPlayerTurn, isOver } from '../src/sim/turn';
import { deserialize, serialize } from '../src/persist/save';

function game(turn = 100, maxTurns = 300): GameState {
  const state = createGame({ seed: 20260908, width: 24, height: 18, maxTurns });
  state.terrain.fill('grass');
  state.units.length = 0;
  for (const [i, at] of [[5, 5], [18, 12]].entries()) {
    const c: City = {
      id: i + 1, owner: i, name: `Place ${i}`, x: at[0], y: at[1], size: 4,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1,
    };
    state.cities.push(c);
    assignWorkers(state, c);
  }
  state.turn = turn;
  state.log.length = 0;
  return state;
}

/** One whole calendar turn, both sides. */
function nextTurn(state: GameState): void {
  for (let i = 0; i < state.players.length; i++) endPlayerTurn(state);
}

/** Wipe a player out, which is how conquest is decided. */
function eliminate(state: GameState, playerId: number): void {
  state.cities = state.cities.filter((c) => c.owner !== playerId);
  state.units = state.units.filter((u) => u.owner !== playerId);
}

/**
 * The classic third option on a victory screen. Section 83 queued it because
 * `isOver` gates the whole turn pipeline, so carrying on means deciding what a
 * game with no win condition left is for.
 *
 * What it is for: the board. The result is cleared rather than remembered,
 * because a state with a winner in it is one the turn pipeline stops dead, and
 * `playingOn` is what stops anybody winning a second time.
 */
describe('carrying on after winning', () => {
  it('does nothing at all while the game is still live', () => {
    const state = game();
    continuePlaying(state);
    expect(state.playingOn).toBeUndefined();
  });

  it('clears the result so the turn pipeline runs again', () => {
    const state = game();
    eliminate(state, 1);
    nextTurn(state);
    expect(isOver(state)).toBe(true);
    expect(state.victory).toBe('conquest');

    continuePlaying(state);

    expect(isOver(state)).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.victory).toBeUndefined();
    expect(state.playingOn).toBe(true);
  });

  it('lets turns pass again', () => {
    const state = game();
    eliminate(state, 1);
    nextTurn(state);
    const stuck = state.turn;
    // `endPlayerTurn` returns immediately while a game is over, so this is the
    // whole point of clearing the result rather than flagging it.
    nextTurn(state);
    expect(state.turn).toBe(stuck);

    continuePlaying(state);
    nextTurn(state);
    expect(state.turn).toBeGreaterThan(stuck);
  });

  it('never declares a winner again, however the game goes', () => {
    const state = game();
    eliminate(state, 1);
    nextTurn(state);
    continuePlaying(state);

    for (let i = 0; i < 20; i++) nextTurn(state);

    // The other side is gone and conquest would fire every single turn.
    expect(isOver(state)).toBe(false);
    expect(state.victory).toBeUndefined();
  });

  it('does not end again at the turn limit', () => {
    const state = game(280, 300);
    eliminate(state, 1);
    nextTurn(state);
    continuePlaying(state);

    for (let i = 0; i < 30; i++) nextTurn(state);

    // Without this the option would last exactly until the deadline and then
    // hand back the ending it was asked to dismiss.
    expect(state.turn).toBeGreaterThan(300);
    expect(isOver(state)).toBe(false);
  });

  it('says so, rather than the ending merely vanishing', () => {
    const state = game();
    eliminate(state, 1);
    nextTurn(state);
    state.log.length = 0;

    continuePlaying(state);

    expect(state.log.map((e) => e.text).join(' ')).toMatch(/keep going|carry/i);
  });

  it('survives a save and a load', () => {
    const state = game();
    eliminate(state, 1);
    nextTurn(state);
    continuePlaying(state);

    const back = deserialize(serialize(state));

    // A game reloaded without this would declare its winner again on the next
    // turn, which is the ending the player already dismissed.
    expect(back.playingOn).toBe(true);
    expect(isOver(back)).toBe(false);
  });

  it('still lets the board play out, whoever is left', () => {
    const state = game();
    eliminate(state, 1);
    nextTurn(state);
    continuePlaying(state);
    const mine = spawnUnit(state, 0, 'goblin', 6, 6, false);

    nextTurn(state);

    // Elimination still runs; it is the verdict that is suppressed, not the
    // board. The surviving side keeps its units and its turns.
    expect(state.units.some((u) => u.id === mine.id)).toBe(true);
    expect(state.players[0].alive).toBe(true);
  });
});
