// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FACTIONS } from '../../src/model/factions';
import { openNewGameMenu } from '../../src/ui/menus';
import { closeModal, isModalOpen } from '../../src/ui/dom';

/**
 * Section 181: the short list on the new-game picker.
 *
 * The point of this file is the *wiring*, not the words. The words are
 * checked where they live, in `tests/ui/contact.test.ts`; what can only break
 * here is the note showing the wrong side -- the hovered card and the chosen
 * one are two different answers and the panel has to know which it is giving.
 */

beforeAll(async () => {
  // Builds the document the modal mounts into. Without it `openModal` has no
  // `#modal-root` and every test here opens into nothing.
  await import('../../src/main');
});

beforeEach(async () => {
  for (let i = 0; i < 20 && isModalOpen(); i++) {
    closeModal();
    await Promise.resolve();
  }
  document.getElementById('modal-root')!.innerHTML = '';
});

function note(): string {
  return document.querySelector('.faction-note')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function card(faction: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.choice-card.faction[data-faction="${faction}"]`);
  expect(found, `the picker offers ${faction}`).toBeTruthy();
  return found!;
}

describe('the short list on the picker', () => {
  it('opens on the side already chosen, and says so', () => {
    openNewGameMenu('unbound', () => {});
    expect(note()).toContain(FACTIONS.unbound.civName);
    expect(note()).toContain('your pick');
    for (const line of FACTIONS.unbound.differs) expect(note()).toContain(line);
  });

  it('follows the cursor, and goes back to the chosen side when it leaves', () => {
    openNewGameMenu('orc', () => {});
    expect(note()).toContain(FACTIONS.orc.civName);

    card('hivekin').dispatchEvent(new MouseEvent('mouseenter'));
    expect(note()).toContain(FACTIONS.hivekin.civName);
    expect(note()).toContain(FACTIONS.hivekin.differs[0]);
    // Somebody else's card is not your pick, and must not claim to be.
    expect(note()).not.toContain('your pick');

    card('hivekin').dispatchEvent(new MouseEvent('mouseleave'));
    expect(note()).toContain(FACTIONS.orc.civName);
    expect(note()).toContain('your pick');
  });

  it('follows the choice when the choice changes', () => {
    openNewGameMenu('orc', () => {});
    const box = document.querySelector<HTMLInputElement>('input[name="faction"][value="wandering"]');
    expect(box).toBeTruthy();
    box!.checked = true;
    box!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(note()).toContain(FACTIONS.wandering.civName);
    expect(note()).toContain('your pick');
  });
});
