// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGame, recomputeVisibility, spawnUnit } from '../../src/sim/gamestate';
import { foundCity } from '../../src/sim/city';
import { FACTIONS, FACTION_IDS } from '../../src/model/factions';
import { checkContacts, haveMet, noteMeeting, openingBy, pairOpening } from '../../src/sim/contact';
import { closeModal, isModalOpen } from '../../src/ui/dom';
import type { GameState } from '../../src/model/types';

/**
 * Section 135 slice 3, through the interface.
 *
 * The sim tests say the meeting is recorded; this file says the player is
 * *told*. That is the half that cannot be checked from node, and the half the
 * complaint was about -- a third side turning up with no word at all.
 */

interface App {
  state: GameState;
  viewerId: number;
  adopt(state: GameState): void;
  promptPending(): void;
}

let app: App;

beforeAll(async () => {
  await import('../../src/main');
  app = (window as unknown as { game: App }).game;
  expect(app, 'main.ts exposes the running game in dev').toBeTruthy();
});

/**
 * A board with two sides on it, each with a town, fog on, and nobody having
 * met anybody. Fog on is the point: the whole question is what happens when it
 * lifts, so a board where everybody already sees everything has nothing to say.
 */
function board(): GameState {
  const state = createGame({ seed: 99, width: 30, height: 20, barbarians: false });
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  state.terrain.fill('grass');
  state.turn = 40;
  state.players.forEach((p, i) => {
    p.explored.fill(0);
    p.visible.fill(0);
    foundCity(state, spawnUnit(state, p.id, FACTIONS[p.faction].settlerUnit, 3 + i * 20, 16));
  });
  for (const p of state.players) recomputeVisibility(state, p.id);
  return state;
}

function dialog(): string {
  return document.querySelector('.modal')?.textContent ?? '';
}

/**
 * Close whatever is up, and keep closing until the chain stops answering.
 *
 * Two traps here, and the first draft fell into both.
 *
 * **Emptying `modal-root` is not closing a modal.** `dom.ts` keeps the open
 * dialog in a module variable, so wiping the HTML leaves `isModalOpen()`
 * answering yes to a dialog that is not there -- and every prompt in the chain
 * declines to open while one is up. Two tests got an empty document for
 * dialogs they had never opened.
 *
 * **And closing one opens the next.** `promptPending` is a chain: each
 * question registers the next through `afterModalCloses`, which `dom.ts` runs
 * in a *microtask* so the click that answered has finished first. So one
 * `closeModal()` closes one dialog and asynchronously opens another, and the
 * next test starts with a modal up and every prompt declining. Hence the loop
 * and the `await`.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20 && isModalOpen(); i++) {
    closeModal();
    await Promise.resolve();
  }
  document.getElementById('modal-root')!.innerHTML = '';
}

// Before rather than after, so a test starts from a known document whatever
// the one before it left asynchronously behind.
beforeEach(async () => {
  await settle();
});

describe('being told you have met somebody', () => {
  it('says nothing while nobody has been met', () => {
    const state = board();
    app.adopt(state);
    app.promptPending();
    expect(dialog()).not.toMatch(/You have met/);
  });

  it('opens a dialog naming the side, the mood and the number', () => {
    const state = board();
    // Two scouts standing next to each other in the middle of nowhere.
    spawnUnit(state, 0, 'orc', 15, 10);
    spawnUnit(state, 1, 'footman', 16, 10);
    recomputeVisibility(state, 0);
    app.adopt(state);
    checkContacts(state, 0);
    expect(haveMet(state, 0, 1)).toBe(true);

    app.promptPending();
    const said = dialog();
    expect(said).toMatch(/You have met/);
    expect(said).toContain(state.players[1].name);
    // The number and the scale with it, because the first question a player
    // asks about a number is what it is out of.
    expect(said).toMatch(/on a scale of -50 to \+50/);
    // And their envoy actually saying the thing, rather than the game
    // summarising it: the line is read back off the log the sim wrote.
    const theirs = state.log.find((e) => e.actor === 1 && e.subject === 'first-contact');
    expect(theirs, 'the sim wrote a line for them').toBeTruthy();
    expect(said).toContain(theirs!.text);
  });

  it('says it once, and not again the next time the turn is prompted', async () => {
    const state = board();
    spawnUnit(state, 0, 'orc', 15, 10);
    spawnUnit(state, 1, 'footman', 16, 10);
    recomputeVisibility(state, 0);
    app.adopt(state);
    checkContacts(state, 0);

    app.promptPending();
    expect(dialog()).toMatch(/You have met/);
    await settle();
    app.promptPending();
    expect(dialog()).not.toMatch(/You have met/);
  });

  /**
   * Caught in the browser, not here, which is the argument for looking at it.
   *
   * The dialog took the opening off the *pair* -- the harder of the two, kept
   * so the Talks screen could say one thing about the relationship -- and read
   * it as what the other side had said. With the Horde declaring war and the
   * Kingdom asking politely to be paid, the title said "They Declare War" over
   * the Herald's envoy and a gift basket's worth of invoice.
   */
  it('puts in their mouth what they said, and not what you said', async () => {
    const state = board();
    // A board hard enough that the Horde declares and the Kingdom does not:
    // crowded, the Kingdom the larger, and an ending visibly under way.
    foundCity(state, spawnUnit(state, 1, 'peasant', 8, 16));
    state.players[1].endingBegunAt = 30;
    // Adopted before the meeting, or `adopt` seeds the introductions from the
    // record and there is nothing left to introduce.
    app.adopt(state);
    // Both sides speaking takes two AI seats; the player's is handed back
    // straight after, because what is being tested is what they are shown.
    state.players[0].controller = 'ai';
    noteMeeting(state, 0, 1);
    state.players[0].controller = 'human';
    expect(openingBy(state, 0, 1, 0)).toBe('declaration');
    expect(openingBy(state, 0, 1, 1)).not.toBe('declaration');
    // The pair's own word for it is still the harder of the two.
    expect(pairOpening(state, 0, 1)).toBe('declaration');

    await settle();
    app.promptPending();
    const title = document.querySelector('.modal h2')?.textContent ?? '';
    expect(title, 'the meeting is what is on screen').toMatch(/You have met|Bram:/);
    expect(title).not.toMatch(/Declare War/);
    const theirs = state.log.find((e) => e.actor === 1 && e.subject === 'first-contact');
    expect(dialog()).toContain(theirs!.text);
  });

  it('does not re-introduce anybody when a save is loaded mid-game', () => {
    const state = board();
    spawnUnit(state, 0, 'orc', 15, 10);
    spawnUnit(state, 1, 'footman', 16, 10);
    recomputeVisibility(state, 0);
    checkContacts(state, 0);
    expect(haveMet(state, 0, 1)).toBe(true);

    // Adopted *after* the meeting, which is what loading a save looks like:
    // the record says it happened and the player was there when it did.
    app.adopt(state);
    app.promptPending();
    expect(dialog()).not.toMatch(/You have met/);
  });
});

/**
 * Section 181: the short list, which lives on the faction and is shown in two
 * places -- the new-game picker, before there is an Orcpedia to read, and here,
 * the moment somebody turns up.
 */
describe('the short list for a side you have just met', () => {
  it('shows theirs, not yours, and reads it off the faction rather than a copy', async () => {
    const state = board();
    spawnUnit(state, 0, 'orc', 15, 10);
    spawnUnit(state, 1, 'footman', 16, 10);
    recomputeVisibility(state, 0);
    app.adopt(state);
    checkContacts(state, 0);
    app.promptPending();

    const said = dialog();
    const theirs = FACTIONS[state.players[1].faction].differs;
    expect(theirs.length, 'every faction has a short list').toBeGreaterThan(1);
    for (const line of theirs) expect(said).toContain(line);

    // Meeting somebody tells you about *them*. Showing your own list here
    // would be the dialog talking to the wrong side of the table.
    for (const line of FACTIONS[state.players[0].faction].differs) {
      expect(said).not.toContain(line);
    }
  });

  it('keeps every line short enough for the picker panel to hold five of them', () => {
    // The panel under the faction row has a fixed floor so that sweeping the
    // cards does not shove the Begin button up and down under the cursor.
    // That only works while the lists stay about the same size, so the bound
    // is checked here rather than discovered by a sixth faction later.
    for (const id of FACTION_IDS) {
      const lines = FACTIONS[id].differs;
      expect(lines.length, `${id} has a short list`).toBeGreaterThan(1);
      expect(lines.length, `${id}'s list stays short`).toBeLessThanOrEqual(4);
      for (const line of lines) {
        expect(line.length, `${id}: "${line.slice(0, 40)}..." fits the panel`).toBeLessThanOrEqual(
          135,
        );
      }
    }
  });
});
