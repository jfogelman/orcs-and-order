// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openPedia } from '../../src/ui/pedia';
import { closeModal } from '../../src/ui/dom';
import { createGame } from '../../src/sim/gamestate';
import { UPGRADES, UPGRADES_BY_ID } from '../../src/model/upgrades';
import type { GameState } from '../../src/model/types';

/**
 * Clicking a picture in the Orcpedia pops it out. Section 162.
 *
 * Jeremy asked for it for the **upgrade sprites specifically**: section 155
 * puts three variants of a creature in a fold on its card at 26 pixels square,
 * which is enough to tell them apart and not enough to see what was drawn.
 *
 * The interesting part is not the overlay, it is **where** the overlay lives.
 * `openModal` allows exactly one modal at a time and closes whatever is up to
 * make room, so a second modal showing a picture from the book would have
 * closed the book. It is a child of the pedia's own backdrop instead -- which
 * is also the whole of *"closes when the Orcpedia closes"*, with no listener
 * to unhook and nothing to remember. That is what most of this pins.
 */

beforeEach(() => {
  document.body.innerHTML = '<div id="modal-root"></div>';
});

afterEach(() => {
  closeModal();
  UPGRADES.enabled = false;
  document.body.innerHTML = '';
});

function book(upgrades = true): HTMLElement {
  const state: GameState = createGame({
    seed: 157,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['human', 'hivekin'],
    upgrades,
  });
  openPedia(state, state.players[0], 'orc');
  return document.body;
}

const backdrop = (root: HTMLElement) => root.querySelector<HTMLElement>('.modal-backdrop')!;
const overlay = (root: HTMLElement) => root.querySelector<HTMLElement>('.pedia-zoom')!;
const shown = (root: HTMLElement) => root.querySelector<HTMLImageElement>('.pedia-zoom-art')!;
const caption = (root: HTMLElement) => root.querySelector<HTMLElement>('.pedia-zoom-caption')!;

/** A creature's card, by the name on it. */
function artFor(root: HTMLElement, name: string): HTMLImageElement {
  const card = [...root.querySelectorAll<HTMLElement>('.pedia-card')].find(
    (c) => c.querySelector('.pedia-name')?.textContent === name,
  );
  expect(card, `no card for ${name}`).toBeTruthy();
  return card!.querySelector<HTMLImageElement>('.pedia-art')!;
}

describe('the popout belongs to the book', () => {
  it('is in the pedia’s own backdrop, and starts out of the way', () => {
    const root = book();
    const zoom = overlay(root);
    expect(zoom, 'the overlay is built on mount').toBeTruthy();
    expect(zoom.hidden, 'and nothing is being looked at yet').toBe(true);
    expect(zoom.parentElement, 'a child of the backdrop, not a second modal').toBe(
      backdrop(root),
    );
    // The one that matters: a second modal would have replaced this one.
    expect(root.querySelectorAll('.modal-backdrop')).toHaveLength(1);
  });

  it('goes when the book goes, without being told', () => {
    const root = book();
    artFor(root, 'Peon').click();
    expect(overlay(root).hidden, 'open, so there is something to leave behind').toBe(false);
    backdrop(root).querySelector<HTMLButtonElement>('.modal-close')!.click();
    expect(root.querySelector('.pedia-zoom'), 'and it does not').toBeNull();
    expect(root.querySelector('.modal-backdrop')).toBeNull();
  });
});

describe('clicking a picture', () => {
  it('shows that picture, with the name underneath', () => {
    const root = book();
    const art = artFor(root, 'Peon');
    art.click();
    expect(overlay(root).hidden).toBe(false);
    expect(shown(root).getAttribute('src')).toBe(art.src);
    expect(caption(root).textContent).toBe('Peon');
    expect(caption(root).hidden).toBe(false);
  });

  it('names an upgrade by its own name and not the creature’s', () => {
    const root = book();
    // The reason this feature exists: 26 pixels in a fold on somebody's card.
    const sprite = [...root.querySelectorAll<HTMLImageElement>('.pedia-upgrade-art')].find((i) =>
      i.src.includes('orc-veteran'),
    );
    expect(sprite, 'the Horde’s plain improvement should be in the book').toBeTruthy();
    sprite!.click();
    // Read off the data rather than written down, so renaming an upgrade
    // cannot leave this test asserting a name nothing uses.
    expect(caption(root).textContent).toBe(UPGRADES_BY_ID['orc-veteran'].name);
    expect(caption(root).textContent).not.toBe('Orc');
  });

  it('closes on a second click, whether that lands on the picture or the overlay', () => {
    const root = book();
    const art = artFor(root, 'Peon');
    art.click();
    art.click();
    expect(overlay(root).hidden, 'the same picture again puts it away').toBe(true);

    art.click();
    overlay(root).click();
    expect(overlay(root).hidden, 'and so does the overlay itself').toBe(true);
    // Blanked rather than left pointing at the last thing looked at, and
    // *removed* rather than set to '', which would resolve to the page.
    expect(shown(root).getAttribute('src')).toBeNull();
  });

  it('swaps straight to a different picture rather than closing first', () => {
    const root = book();
    artFor(root, 'Peon').click();
    const goblin = artFor(root, 'Goblin');
    goblin.click();
    expect(overlay(root).hidden, 'still open').toBe(false);
    expect(shown(root).getAttribute('src')).toBe(goblin.src);
    expect(caption(root).textContent).toBe('Goblin');
  });
});

describe('Escape takes one thing at a time', () => {
  it('shuts the picture and leaves the book standing', () => {
    const root = book();
    artFor(root, 'Peon').click();
    const zoom = overlay(root);
    expect(document.activeElement, 'focused, or the key never reaches it').toBe(zoom);
    zoom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(zoom.hidden, 'the picture').toBe(true);
    expect(root.querySelector('.pedia-pane'), 'and not the book').toBeTruthy();
  });

  it('leaves any other key alone', () => {
    const root = book();
    artFor(root, 'Peon').click();
    const zoom = overlay(root);
    zoom.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(zoom.hidden).toBe(false);
  });
});

describe('what is and is not a picture to look at', () => {
  it('offers every picture in every pane, upgrades included', () => {
    const root = book();
    const images = root.querySelectorAll('.pedia-pane img');
    expect(images.length, 'the book has pictures in it').toBeGreaterThan(20);
    expect(root.querySelectorAll('.pedia-upgrade-art').length, 'all ninety').toBe(90);
    for (const img of images) {
      // Anything already inside a link or a button is somebody else's click.
      //
      // **Nothing in the book draws one today**, so this branch does not run
      // and is a guard rather than a fix. It is written here anyway because
      // the building chips in the city panel are exactly that shape -- an
      // icon inside an `<a>` -- and the day one of those is quoted in here is
      // the day following a link would quietly become looking at it. A test
      // for it in isolation would have passed against the code that has no
      // popout at all, so there is deliberately not one.
      if (img.closest('[data-see], [data-jump], a, button, summary')) {
        expect(img.classList.contains('pedia-zoomable'), `${img.className} is a control`).toBe(
          false,
        );
        continue;
      }
      expect(img.classList.contains('pedia-zoomable'), `${img.className}`).toBe(true);
    }
  });

});
