// @vitest-environment jsdom
import { beforeEach, beforeAll, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../../src/sim/gamestate';
import { foundCity } from '../../src/sim/city';
import { SPY } from '../../src/sim/spying';
import { wearDisguise } from '../../src/sim/disguise';
import { closeModal, isModalOpen } from '../../src/ui/dom';
import type { City, GameState, Unit } from '../../src/model/types';

/**
 * Section 136 slice 2, through the interface.
 *
 * The sim tests say what a reading *is*; this file says what the player is
 * **shown**, which is where the complaint was. A quiet failure used to go
 * through `flash`, and `flash` writes an entry straight into the log box -- so
 * it arrived one line under the *caught* entry from an earlier attempt, with no
 * turn marker between them, and the two read as one self-contradicting
 * sentence: they know whose it was, and nobody seems to have minded.
 *
 * Three outcomes, three dialogs. Nothing a spy comes back with is log
 * furniture.
 */
interface App {
  state: GameState;
  viewerId: number;
  adopt(state: GameState): void;
  select(unit: Unit | null): void;
  refreshSidebar(): void;
  orderRead(cityId: number): void;
}

let app: App;

beforeAll(async () => {
  await import('../../src/main');
  app = (window as unknown as { game: App }).game;
  expect(app, 'main.ts exposes the running game in dev').toBeTruthy();
});

/** A spy of ours standing beside somebody else's town, and nothing else. */
function board(): { state: GameState; spy: Unit; city: City } {
  const state = createGame({ seed: 17, width: 30, height: 20, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const city = foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10))!;
  state.units = state.units.filter((u) => u.owner !== 1 || u.x !== city.x || u.y !== city.y);
  const spy = spawnUnit(state, 0, 'skulker', 11, 10);
  app.adopt(state);
  app.select(spy);
  return { state, spy, city };
}

/** The odds, forced, so each outcome can be asked for by name. */
function force(outcome: 'read' | 'missed' | 'caught'): void {
  SPY.reads = outcome === 'read' ? 1 : 0;
  SPY.readsPerRank = 0;
  SPY.noticed = outcome === 'caught' ? 1 : 0;
  SPY.noticedPerRank = 0;
}

const settled = { reads: SPY.reads, perRank: SPY.readsPerRank, noticed: SPY.noticed, nrank: SPY.noticedPerRank };

function dialog(): string {
  return document.querySelector('.modal')?.textContent ?? '';
}

function logText(): string {
  return document.getElementById('logbox')?.textContent ?? '';
}

/**
 * Put the spy back in a state where it can be given a second order.
 *
 * Two things stand in the way and both bit. `orderRead` ends on
 * `selectNextIdle`, which moves the selection off a unit that has spent its
 * turn -- so a second `orderRead` finds `this.selected` is somebody else and
 * returns having done nothing. And `closeModal` runs its chain in a microtask,
 * so a dialog opened in the same tick as a close is opened into a document that
 * is about to be cleared.
 */
async function again(spy: Unit): Promise<void> {
  closeModal();
  await Promise.resolve();
  spy.moves = 1;
  app.select(spy);
}

beforeEach(async () => {
  for (let i = 0; i < 20 && isModalOpen(); i++) {
    closeModal();
    await Promise.resolve();
  }
  document.getElementById('modal-root')!.innerHTML = '';
  SPY.reads = settled.reads;
  SPY.readsPerRank = settled.perRank;
  SPY.noticed = settled.noticed;
  SPY.noticedPerRank = settled.nrank;
});

describe('what a spy is shown to have come back with', () => {
  it('offers the order by its name, not a verb that means four things', () => {
    const { city } = board();
    app.refreshSidebar();
    const panel = document.getElementById('selection')!.innerHTML;
    expect(panel).toContain(`Spy on ${city.name}`);
    // "Read Highmarch" could be a book, a map or a mood.
    expect(panel).not.toContain(`Read ${city.name}`);
  });

  it('prices the order on the button, and marks it down as the spy ranks', () => {
    const { spy, city } = board();
    app.refreshSidebar();
    const green = document.getElementById('selection')!.textContent ?? '';
    expect(green).toMatch(new RegExp(`Spy on ${city.name}\\s*·\\s*\\w`));

    spy.rank = 3;
    app.select(spy);
    app.refreshSidebar();
    const veteran = document.getElementById('selection')!.textContent ?? '';
    // The whole argument for promoting a spy is that it gets safer. If the
    // button said the same thing at rank 3 as at rank 0, the player would have
    // no way to see that happening.
    expect(veteran).not.toBe(green);
  });

  it('sets the noticed verdict apart in every dialog, in the same place', async () => {
    const { spy, city } = board();
    const boxes: { cls: string; text: string }[] = [];
    const capture = () => {
      const box = document.querySelector('.spy-notice');
      expect(box, 'a spy dialog with no verdict box in it').not.toBeNull();
      boxes.push({ cls: box!.className, text: box!.textContent ?? '' });
    };

    for (const outcome of ['read', 'missed', 'caught'] as const) {
      await again(spy);
      force(outcome);
      app.orderRead(city.id);
      capture();
    }

    // Whether the agent got away with it decides whether it still exists as an
    // asset and whether somebody is now holding a grudge. It was a clause at
    // the end of a flavour paragraph; it is a box of its own now, and it is
    // there whatever happened.
    expect(boxes.map((b) => (b.cls.includes('blown') ? 'blown' : 'safe'))).toEqual([
      'safe',
      'safe',
      'blown',
    ]);
    expect(boxes[2].text).toMatch(/noticed/i);
  });

  it('names the great work instead of calling it “their ending”', () => {
    const { city } = board();
    force('read');
    app.orderRead(city.id);
    const said = dialog();
    expect(said).not.toMatch(/their ending/i);
    expect(said).toMatch(/Portal|Object|Shell/);
  });

  it('opens a dialog when the reading succeeds', () => {
    const { city } = board();
    force('read');
    app.orderRead(city.id);
    expect(isModalOpen()).toBe(true);
    expect(dialog()).toContain(city.name);
  });

  it('opens a dialog when it is caught, and says they now know', () => {
    const { city } = board();
    force('caught');
    app.orderRead(city.id);
    expect(isModalOpen()).toBe(true);
    expect(dialog()).toMatch(/noticed/i);
    expect(dialog()).toMatch(/whose it was/i);
  });

  it('opens a dialog when it quietly fails, instead of a line in the log', () => {
    const { city } = board();
    const before = logText();
    force('missed');
    app.orderRead(city.id);

    // The regression. Against the old code this is where it failed: the result
    // was a `flash`, which is an entry in the log box and no dialog at all.
    expect(isModalOpen(), 'a quiet failure told the player nothing but a log line').toBe(true);
    expect(dialog()).toMatch(/nothing/i);
    expect(logText(), 'the result of a spy action does not belong in the log').toBe(before);
  });

  it('never says the two opposite things at once', async () => {
    const { state, spy, city } = board();
    // Caught on one turn, a quiet failure on the next: the exact sequence that
    // produced "they know whose it was" and "nobody seems to have minded" as
    // neighbouring lines in one log strip.
    force('caught');
    app.orderRead(city.id);
    const caught = dialog();
    expect(caught).toMatch(/noticed/i);

    state.log.length = 0;
    await again(spy);
    force('missed');
    app.orderRead(city.id);
    const quiet = dialog();

    // Asserted positively first. The draft of this test only checked that the
    // second dialog did *not* say "whose it was" and was not identical to the
    // first -- both of which an empty string satisfies, and an empty string is
    // exactly what a second order gets when nothing re-selected the spy. A
    // test for an absence needs a presence beside it.
    expect(quiet).toMatch(/nothing/i);
    expect(quiet).not.toMatch(/whose it was/i);
  });

  it('does not promise a disguise is blown when there was none to blow', async () => {
    const { state, spy, city } = board();
    force('caught');
    app.orderRead(city.id);
    expect(dialog()).toMatch(/noticed/i);
    expect(dialog()).not.toMatch(/wearing/i);

    // Wearing something, and it says so.
    await again(spy);
    wearDisguise(state, spy, 1);
    app.orderRead(city.id);
    expect(dialog()).toMatch(/wearing/i);
  });
});
