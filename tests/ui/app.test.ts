// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGame, spawnUnit } from '../../src/sim/gamestate';
import { foundCity } from '../../src/sim/city';
import { FACTIONS } from '../../src/model/factions';
import { beginPlayerTurn } from '../../src/sim/turn';
import type { GameState, Unit } from '../../src/model/types';

/**
 * The interface, booted and driven.
 *
 * Everything in `main.ts` used to be unreachable from the suite -- tests run in
 * node, so a rule living in the interface was only ever verified by somebody
 * clicking it, and two bugs reached a real game that way in a week. Both are
 * pinned here, driving the real `App` rather than a copy of its logic:
 * `main.ts` builds one on import and hangs it on `window.game` in dev, which is
 * the same handle a console uses.
 */

interface App {
  state: GameState;
  selected: Unit | null;
  viewerId: number;
  adopt(state: GameState): void;
  select(unit: Unit | null): void;
  actOn(x: number, y: number): void;
  orderFortify(): void;
  renderOnce(dt?: number): void;
  refreshSidebar(): void;
  overlay: { hover: { x: number; y: number } | null };
}

let app: App;

beforeAll(async () => {
  await import('../../src/main');
  app = (window as unknown as { game: App }).game;
  expect(app, 'main.ts exposes the running game in dev').toBeTruthy();
});

/**
 * A quiet board with nothing happening on it.
 *
 * Every side keeps a city, which is not decoration: clearing the board outright
 * eliminates the others, `checkElimination` ends the game inside
 * `beginPlayerTurn`, and `actOn` refuses to do anything at all once `isOver` --
 * so every test below passed its setup and then silently did nothing.
 */
function board(): GameState {
  const state = createGame({ seed: 99, width: 24, height: 16, barbarians: false });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  state.ruins = [];
  // Somewhere for everybody else to be alive, well out of the way.
  state.players.forEach((p, i) => {
    if (i === 0) return;
    foundCity(state, spawnUnit(state, p.id, FACTIONS[p.faction].settlerUnit, 2 + i * 3, 14));
  });
  return state;
}

function fortifyOffered(): boolean {
  return !!document.querySelector('[data-act="fortify"]');
}

/**
 * Let the interface's own hold finish.
 *
 * Moving on to the next unit is deliberately deferred by `ATTACK_HOLD_MS`, so a
 * swing has time to play before the camera leaves. A test that asserts straight
 * after the move is asserting before any of that has happened -- the first
 * version of the selection test below did exactly that, and **passed against
 * the bug it was written for**. It is only a test of this once the clock has
 * been run forward.
 */
function letTheHoldFinish(): void {
  vi.advanceTimersByTime(1000);
}

afterEach(() => {
  vi.useRealTimers();
  // One document for the whole file, so a dialog left open by one test is a
  // dialog the next one finds. That is not hypothetical: it made "never says
  // what the prize is" pass by reading the *previous* test's modal.
  document.getElementById('modal-root')!.innerHTML = '';
});

describe('the game, booted in a document', () => {
  it('starts, paints a frame, and has a turn to play', () => {
    expect(app.state.turn).toBeGreaterThan(0);
    // The renderer is the part most likely to object to a stubbed canvas, so
    // this is the line that proves the harness is honest about what it boots.
    expect(() => app.renderOnce(16)).not.toThrow();
  });
});

describe('a unit that has just spent its last move', () => {
  /**
   * Reported from a real game at turn 44: walk a freshly built unit into the
   * city whose garrison you have just walked out, and there was no way to tell
   * it to hold the place. It had spent its last point arriving, so it was not
   * idle, so the selection was cleared and the Fortify button went with it.
   */
  it('stays selected, and can still be told to hold the city', () => {
    const state = board();
    const city = foundCity(state, spawnUnit(state, 0, 'peon', 10, 8))!;
    const garrison = spawnUnit(state, 0, 'goblin', city.x, city.y);
    garrison.order = 'fortified';
    const arriving = spawnUnit(state, 0, 'peon', 11, 8);
    app.adopt(state);
    beginPlayerTurn(state, 0);

    // The garrison steps out; the new unit walks into the gate it left.
    vi.useFakeTimers();
    app.select(garrison);
    app.orderFortify();
    app.actOn(11, 9);
    app.select(arriving);
    app.actOn(city.x, city.y);
    letTheHoldFinish();

    expect(arriving.moves, 'it spent everything getting there').toBe(0);
    expect(app.selected?.id, 'and is still the thing in hand').toBe(arriving.id);
    expect(fortifyOffered(), 'with Fortify still on offer').toBe(true);

    app.orderFortify();
    expect(arriving.order).toBe('fortified');
  });

  it('is let go once it has an order, or once it is gone', () => {
    const state = board();
    foundCity(state, spawnUnit(state, 0, 'peon', 10, 8));
    const u = spawnUnit(state, 0, 'goblin', 4, 4);
    app.adopt(state);
    beginPlayerTurn(state, 0);

    app.select(u);
    u.order = 'sentry';
    state.units.splice(state.units.indexOf(u), 1);
    app.select(null);
    expect(app.selected, 'nothing in hand').toBeFalsy();
  });
});

describe('walking into a ruin', () => {
  /**
   * The first version of this asked before attacking the *guard*, which is
   * asking after the risk has been taken. Walking in is the step that wakes
   * what is inside and spends the turn, so walking in is the step that asks.
   */
  function withRuin(): { state: GameState; scout: Unit } {
    const state = board();
    foundCity(state, spawnUnit(state, 0, 'peon', 4, 4));
    state.ruins = [{ x: 10, y: 8, prize: 'gold' }];
    const scout = spawnUnit(state, 0, 'goblin', 11, 8);
    return { state, scout };
  }

  it('asks first, and takes nothing until the answer is yes', () => {
    const { state, scout } = withRuin();
    app.adopt(state);
    beginPlayerTurn(state, 0);
    app.select(scout);

    app.actOn(10, 8);

    expect(document.querySelector('.modal'), 'it asked').not.toBeNull();
    expect([scout.x, scout.y], 'and nobody moved').toEqual([11, 8]);
    expect(state.ruins![0].wokeOn, 'and nothing woke up').toBeUndefined();
  });

  it('leaves it alone for nothing when the answer is no', () => {
    const { state, scout } = withRuin();
    app.adopt(state);
    beginPlayerTurn(state, 0);
    app.select(scout);
    const had = scout.moves;

    app.actOn(10, 8);
    document.querySelector<HTMLElement>('[data-act="ruin-stay"]')!.click();

    expect(scout.moves, 'the turn is not spent').toBe(had);
    expect(state.ruins![0].wokeOn).toBeUndefined();
    expect(document.querySelector('.modal')).toBeNull();
  });

  it('goes in on yes, and says by name what stood up', () => {
    const { state, scout } = withRuin();
    app.adopt(state);
    beginPlayerTurn(state, 0);
    app.select(scout);

    app.actOn(10, 8);
    document.querySelector<HTMLElement>('[data-act="ruin-enter"]')!.click();

    expect([scout.x, scout.y], 'it went in').toEqual([10, 8]);
    expect(state.ruins![0].wokeOn, 'and woke it').toBeDefined();
    // The follow-up names the thing rather than leaving "something stands up"
    // in the log as the only account of it.
    const notice = document.querySelector('.modal')?.textContent ?? '';
    expect(notice).toMatch(/stands up/i);
    expect(notice, 'and says which').toMatch(/Sentinel|Guardian|Keeper/);
  });

  it('never says what the prize is', () => {
    const { state, scout } = withRuin();
    app.adopt(state);
    beginPlayerTurn(state, 0);
    app.select(scout);

    app.actOn(10, 8);
    const dialog = document.querySelector('.modal');
    // Asserted before the contents, or this passes for the wrong reason: no
    // dialog at all also fails to mention the prize.
    expect(dialog, 'there is a dialog to read').not.toBeNull();
    expect(state.ruins![0].prize, 'the record knows').toBe('gold');
    expect(dialog!.textContent!.toLowerCase(), 'the dialog does not').not.toContain('gold');
  });
});

describe('the hovered tile', () => {
  it('says a ruin is there, and which of its states it is in', () => {
    const state = board();
    state.ruins = [{ x: 10, y: 8, prize: 'advance' }];
    app.adopt(state);
    app.select(null);
    app.overlay.hover = { x: 10, y: 8 };
    app.refreshSidebar();

    const panel = document.getElementById('selection')!.textContent ?? '';
    expect(panel).toMatch(/Ruin/);
    expect(panel).toMatch(/undisturbed/i);
    expect(panel.toLowerCase(), 'and not what is in it').not.toContain('advance');
  });
});
