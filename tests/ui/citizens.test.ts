// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../../src/sim/gamestate';
import { contentLimit, foundCity } from '../../src/sim/city';
import { openCityPanel } from '../../src/ui/cityPanel';
import { closeModal, isModalOpen } from '../../src/ui/dom';
import { CITIZEN_MOODS, MOOD_LADDER } from '../../src/model/citizens';
import type { City, GameState } from '../../src/model/types';

/**
 * Section 143: the city panel's people, as drawn.
 *
 * The model half of this lives in `tests/citizen-mood.test.ts`. This is the
 * half that was never reachable from the suite before `tests/ui/` existed --
 * whether the panel actually *puts* the mood on the face and the bar on the
 * screen, which is the only part a player sees.
 */
let state: GameState;
/** Founded once per test, so repeated opens do not need fresh ground. */
let town: City | null = null;

beforeAll(async () => {
  await import('../../src/main');
});

beforeEach(async () => {
  for (let i = 0; i < 20 && isModalOpen(); i++) {
    closeModal();
    await Promise.resolve();
  }
  state = createGame({ seed: 31, width: 30, height: 20 });
  town = null;
});

/** The player's own town, resized and opened in the panel. */
function openTown(size: number, disorder = false): City {
  const city = town ?? foundCity(state, spawnUnit(state, 0, 'peon', 10, 10))!;
  town = city;
  city.size = size;
  // Cleared so the roster is filled from this size rather than the old one.
  city.citizens = undefined;
  city.disorder = disorder;
  openCityPanel(state, city, () => {});
  return city;
}

function faces(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#modal-root .citizen'));
}

/** Which mood each face is showing, read back off the sprite sheet offset. */
function moodsDrawn(): number[] {
  return faces().map((el) => {
    const found = /background-position:\s*-?(\d+)px/.exec(el.getAttribute('style') ?? '');
    return found ? Number(found[1]) / 32 : -1;
  });
}

describe('the faces in a city', () => {
  it('draws one per citizen', () => {
    openTown(5);
    expect(faces()).toHaveLength(5);
  });

  /**
   * The complaint this was built for. Every face wore the city's mood, so a
   * town of eight was eight identical pictures and the panel's own number --
   * "Content up to 6" -- had nothing on screen agreeing with it.
   */
  it('does not give everybody the same face', () => {
    const city = openTown(8);
    const limit = contentLimit(state, city);
    // A town of eight content up to six has to span at least two rungs, or the
    // whole thing has gone back to one mood for everybody.
    expect(limit).toBeLessThan(8);
    expect(new Set(moodsDrawn()).size).toBeGreaterThan(1);
  });

  it('walks from contented at the front to furious at the back', () => {
    openTown(9);
    const drawn = moodsDrawn();
    expect(drawn).not.toContain(-1);
    for (let i = 1; i < drawn.length; i++) {
      expect(drawn[i], `citizen ${i + 1} is happier than the one before`).toBeGreaterThanOrEqual(
        drawn[i - 1],
      );
    }
    expect(drawn[drawn.length - 1]).toBe(CITIZEN_MOODS - 1);
  });

  it('makes every face furious in a riot', () => {
    openTown(5, true);
    expect(moodsDrawn()).toEqual(new Array(5).fill(CITIZEN_MOODS - 1));
  });

  it('tells you who this is, how they feel and why', () => {
    const city = openTown(7);
    const limit = contentLimit(state, city);
    const tip = faces()[6].dataset.tip ?? '';
    // All three, rather than a name and a shrug.
    expect(tip).toMatch(/citizen 7 of 7/);
    expect(tip).toContain(`content up to ${limit}`);
    expect(MOOD_LADDER.some((m) => tip.includes(m.name)), tip).toBe(true);
  });

  it('says the riot is the reason when there is one', () => {
    openTown(4, true);
    expect(faces()[0].dataset.tip).toContain('rioting');
  });

  /**
   * `installOverflowTips` only ever showed a pop-up for text that had been cut
   * short, and a 32px portrait has no text at all -- so the hover would have
   * been written, attached and silently never shown.
   */
  it('gives every face a tip the pop-up will actually fire on', () => {
    openTown(6);
    for (const el of faces()) {
      expect(el.dataset.tip, 'data-tip is what the styled pop-up reads').toBeTruthy();
      expect(el.title, 'title is the fallback if the script never ran').toBe(el.dataset.tip);
    }
  });
});

describe('the mood bar', () => {
  it('is one segment per rung anybody is standing on', () => {
    openTown(9);
    const bar = document.querySelector('#modal-root .mood-bar');
    expect(bar, 'the bar is drawn at all').not.toBeNull();
    const segments = bar!.querySelectorAll('.mood-seg');
    expect(segments.length).toBe(new Set(moodsDrawn()).size);
  });

  it('weights each segment by how many people are on that rung', () => {
    openTown(9);
    const drawn = moodsDrawn();
    const widths = Array.from(
      document.querySelectorAll<HTMLElement>('#modal-root .mood-seg'),
    ).map((el) => Number(/flex-grow:\s*(\d+)/.exec(el.getAttribute('style') ?? '')?.[1] ?? 0));
    // The bar is a count: its segments add up to the population.
    expect(widths.reduce((a, b) => a + b, 0)).toBe(drawn.length);
  });

  it('is red end to end in a riot, and says so', () => {
    openTown(6, true);
    const segments = Array.from(
      document.querySelectorAll<HTMLElement>('#modal-root .mood-seg'),
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].getAttribute('style')).toContain(MOOD_LADDER[CITIZEN_MOODS - 1].color);
    expect(document.querySelector('#modal-root .mood-legend')?.textContent).toContain('Rioting');
  });

  it('counts the town in words under the bar', () => {
    openTown(9);
    const legend = document.querySelector('#modal-root .mood-legend')?.textContent ?? '';
    // Every rung named in the legend is one somebody is actually on.
    const named = MOOD_LADDER.filter((m) => legend.includes(m.name)).map((m) =>
      MOOD_LADDER.indexOf(m),
    );
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((m) => moodsDrawn().includes(m)), legend).toBe(true);
  });
});
