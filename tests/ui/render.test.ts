// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../../src/sim/gamestate';
import { foundCity } from '../../src/sim/city';
import { FACTIONS } from '../../src/model/factions';
import type { GameState } from '../../src/model/types';

/**
 * What the map asks the canvas to do.
 *
 * There are no pixels here to look at, and testing what a glow *looks* like is
 * what eyes are for. What can be asked is whether the renderer reaches for a
 * glow at all, and only in the one state that means it -- which is the thing
 * that was wrong: a woken ruin read as an undisturbed one across the map,
 * because the only difference was a small overlay at tile size.
 */
interface CanvasCalls {
  seen(): string[];
  clear(): void;
}

let app: { state: GameState; adopt(s: GameState): void; renderOnce(dt?: number): void };
let canvasCalls: CanvasCalls;

beforeAll(async () => {
  await import('../../src/main');
  app = (window as unknown as { game: typeof app }).game;
  canvasCalls = (globalThis as unknown as { canvasCalls: CanvasCalls }).canvasCalls;
});

function boardWithRuin(woke: number | undefined, taken?: number): GameState {
  const state = createGame({ seed: 5, width: 24, height: 16, barbarians: false });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  state.players.forEach((p, i) => {
    if (i === 0) return;
    foundCity(state, spawnUnit(state, p.id, FACTIONS[p.faction].settlerUnit, 2 + i * 3, 14));
  });
  foundCity(state, spawnUnit(state, 0, 'peon', 10, 8));
  state.ruins = [{ x: 11, y: 8, prize: 'gold', ...(woke === undefined ? {} : { wokeOn: woke }), ...(taken === undefined ? {} : { takenOn: taken }) }];
  return state;
}

/**
 * Gradients asked for in one frame, with the map layers already warm.
 *
 * The renderer caches terrain, so the *first* frame after a new state costs a
 * hundred and twenty-eight gradients and every frame after it costs none. A
 * test that rendered two different boards was comparing cache states and
 * nothing else -- it passed against a build with no glow in it at all. So the
 * board never changes here: one state, one warmed cache, and `wokeOn` is the
 * only thing that moves between counts.
 */
function gradientsInAFrame(state: GameState): number {
  app.renderOnce(16);
  canvasCalls.clear();
  app.renderOnce(16);
  void state;
  return canvasCalls.seen().filter((c) => c === 'createRadialGradient').length;
}

describe('a ruin on the map', () => {
  it('is lit when it wakes, and only then', () => {
    const state = boardWithRuin(undefined);
    app.adopt(state);
    const ruin = state.ruins![0];

    const asleep = gradientsInAFrame(state);
    ruin.wokeOn = 12;
    const awake = gradientsInAFrame(state);
    expect(awake, 'waking lights it').toBeGreaterThan(asleep);

    // Scenery once it is empty: a glow would go on claiming there is something
    // here to come back for.
    ruin.takenOn = 20;
    expect(gradientsInAFrame(state), 'emptied goes dark').toBe(asleep);

    // And it is a fact about what *this* player can see.
    delete ruin.takenOn;
    state.players[0].visible.fill(0);
    expect(gradientsInAFrame(state), 'unseen goes dark').toBe(asleep);
  });
});
