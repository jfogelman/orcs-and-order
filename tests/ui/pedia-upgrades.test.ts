// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openPedia } from '../../src/ui/pedia';
import { createGame } from '../../src/sim/gamestate';
import { UPGRADES, UPGRADES_BY_ID, UPGRADE_DEFS, upgradesFor } from '../../src/model/upgrades';
import { TECHS_BY_ID } from '../../src/model/techs';
import type { GameState } from '../../src/model/types';

/**
 * Section 155: what a creature can become, on its own card in the Orcpedia.
 *
 * Jeremy asked for this after the effects landed, and he was right that the
 * bullet was not enough: it named the three and stopped. A player choosing a
 * branch wants to know what each one *does* and which advance buys it, and
 * until this the only place that existed was the tech tree, one card at a
 * time, with no way to see the pair side by side.
 */

beforeEach(() => {
  document.body.innerHTML = '<div id="modal-root"></div>';
});

afterEach(() => {
  UPGRADES.enabled = false;
  document.body.innerHTML = '';
});

function book(upgrades: boolean): HTMLElement {
  const state: GameState = createGame({
    seed: 155,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['human'],
    upgrades,
  });
  openPedia(state, state.players[0], 'orc');
  return document.body;
}

/** One creature's card, by the name on it. */
function cardFor(root: HTMLElement, name: string): HTMLElement {
  const card = [...root.querySelectorAll<HTMLElement>('.pedia-card')].find(
    (c) => c.querySelector('.pedia-name')?.textContent === name,
  );
  expect(card, `no card for ${name}`).toBeTruthy();
  return card!;
}

describe('the upgrade fold on a creature’s card', () => {
  it('appears for every creature with a road, on every side', () => {
    const root = book(true);
    const folds = root.querySelectorAll('.pedia-upgrades');
    // **Counted off the data, not written down.** This said twelve -- seven
    // of the Horde's families and five of the Kingdom's -- and slice 6 took
    // it to thirty without the fold changing at all. Every pane is in the
    // document at once, hidden, so this counts all five sides.
    const families = new Set(UPGRADE_DEFS.map((u) => u.base));
    expect(folds).toHaveLength(families.size);
  });

  it('is shut to begin with', () => {
    const root = book(true);
    const fold = cardFor(root, 'Orc').querySelector<HTMLDetailsElement>('.pedia-upgrades');
    // Three rows on twelve creatures is a lot of small print in front of
    // somebody who came to compare two units' attack.
    expect(fold?.open).toBe(false);
  });

  it('names the three, the advance each needs, and what each does', () => {
    const root = book(true);
    const text = cardFor(root, 'Orc').querySelector('.pedia-upgrades')!.textContent ?? '';
    for (const id of ['orc-veteran', 'orc-berserker', 'orc-guardian']) {
      const up = UPGRADES_BY_ID[id];
      expect(text, id).toContain(up.name);
      expect(text, `${id}: the advance that buys it`).toContain(TECHS_BY_ID[up.needs].name);
      // Read off the data, so a card can never describe an upgrade the game
      // does not offer -- and cannot drift when a blurb is reworded.
      expect(text, `${id}: the blurb, not a paraphrase`).toContain(up.blurb);
    }
  });

  it('says the branch is one of two, and for good', () => {
    const root = book(true);
    const text = cardFor(root, 'Orc').querySelector('.pedia-upgrades')!.textContent ?? '';
    expect(text).toMatch(/one of two/);
    expect(text, 'the thing a player most needs to know before picking').toMatch(
      /one of these, for the whole empire, for good/,
    );
  });

  it('shows each upgrade its own sprite', () => {
    const root = book(true);
    const card = cardFor(root, 'Orc');
    const art = [...card.querySelectorAll<HTMLImageElement>('.pedia-upgrade-art')];
    expect(art).toHaveLength(3);
    // The sprite *is* the id, which is the whole reason these are variants
    // rather than thirty-six new creatures: no lookup table, no second list
    // to keep in step.
    for (const id of ['orc-veteran', 'orc-berserker', 'orc-guardian']) {
      expect(
        art.some((img) => img.getAttribute('src')?.endsWith(`units/${id}.png`)),
        id,
      ).toBe(true);
    }
  });

  it('keeps the group-size ladder out of the fold', () => {
    /**
     * The ladder used to be spliced into the finished card HTML with a
     * `.replace` that matched its last two closing divs. The fold added some
     * of its own, so the ladder landed **inside** it -- a player would have
     * found "group sizes" by expanding a list of upgrades. It is passed in
     * now rather than spliced on.
     */
    const root = book(true);
    const card = cardFor(root, 'Orc');
    const ladder = card.querySelector('.pedia-ladder');
    const fold = card.querySelector('.pedia-upgrades');
    expect(ladder, 'an orc comes in group sizes').toBeTruthy();
    expect(fold!.contains(ladder!), 'and they are not an upgrade').toBe(false);
  });

  it('is not there at all with the box unticked', () => {
    const root = book(false);
    expect(root.querySelectorAll('.pedia-upgrades')).toHaveLength(0);
    expect(root.textContent).not.toContain('Orc Berserker');
  });

  it('gives no fold to a creature with no road', () => {
    const root = book(true);
    // The Goblin has no upgrades written: the bible covers twelve creatures a
    // side and this is not one of them.
    expect(upgradesFor('goblin')).toHaveLength(0);
    expect(cardFor(root, 'Goblin').querySelector('.pedia-upgrades')).toBeNull();
  });
});
