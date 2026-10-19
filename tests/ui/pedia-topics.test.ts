// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/gamestate';
import { CREATURES, UNIT_TYPES } from '../../src/model/units';
import { BUILDINGS } from '../../src/model/buildings';
import { abilityNotes, openPedia } from '../../src/ui/pedia';
import { SPY_ACTIONS } from '../../src/sim/spying';
import { closeModal, isModalOpen } from '../../src/ui/dom';
import type { GameState } from '../../src/model/types';

/**
 * Section 137: the book as something you can look a thing up in.
 *
 * Two complaints, both found by playing. **The long panes were walls** --
 * Diplomacy was twenty-three consecutive paragraphs with no heading between
 * any of them, and two unrelated subjects in one scroll, so finding out what
 * sabotage costs meant reading about peace treaties until you got there.
 * **And several units' cards said nothing the unit does**: a spy showed A0 D1
 * and a joke, an Archer showed A4 D1 and the word "ranged" with no mechanism
 * attached anywhere, and the Burrower-caste's two abilities were written up in
 * the Hive's rules and not on the Burrower.
 *
 * The cards are swept rather than listed, because a list is the thing that
 * failed: every one of these gaps was a unit somebody forgot, not a rule
 * somebody got wrong.
 */
let state: GameState;

beforeAll(async () => {
  await import('../../src/main');
  state = createGame({ seed: 23, width: 30, height: 20 });
});

beforeEach(async () => {
  for (let i = 0; i < 20 && isModalOpen(); i++) {
    closeModal();
    await Promise.resolve();
  }
  document.getElementById('modal-root')!.innerHTML = '';
});

/** Everything a creature's card says beyond its four numbers, as one string. */
function notesFor(id: string): string {
  return abilityNotes(UNIT_TYPES[id]).join(' | ');
}

describe('a card says what the unit actually does', () => {
  it('explains every ranged unit, rather than leaving "ranged" as a label', () => {
    // An Archer does not shoot from a distance: it walks up and fights like
    // everything else, and the whole of the difference is a free opening
    // round. So its card read as a Footman with worse defence, which is
    // precisely backwards -- the free round is worth more than the point of
    // attack. Swept over the role rather than over the three names, so the
    // next ranged unit added without a mechanism fails here.
    const ranged = CREATURES.filter((c) => c.role === 'ranged');
    expect(ranged.length, 'no ranged units at all?').toBeGreaterThan(0);
    for (const c of ranged) {
      expect(
        notesFor(c.id),
        `${c.name} is labelled ranged and its card does not say what that means`,
      ).toMatch(/strikes first|strikes from/);
    }
  });

  it('says that two things which both strike first simply fight', () => {
    // Only the *difference* counts, which is the half a player cannot deduce
    // and the half that decides whether an archer is worth sending at an
    // archer.
    expect(notesFor('archer')).toMatch(/only the difference counts/i);
  });

  it('does not promise a group of them more opening blows than there are', () => {
    // First strikes do not scale with the count, the way health does not. The
    // instinct that three archers get three free blows is wrong in the
    // direction that loses battles.
    //
    // Asserted on the *single*, because that is the only card the book draws:
    // group entries are chips hanging off it. The first version of this note
    // was written for `count > 1`, which is true of no card that renders, and
    // this test passed against a string the player could never see.
    expect(notesFor('archer'), 'the Archer has a ladder, so the card should say').toMatch(
      /still the one opening blow/i,
    );
    expect(
      notesFor('spitter'),
      'and so does the Spitter-caste, which also comes in twos',
    ).toMatch(/still the one opening blow/i);
  });

  it('tells a spy what a spy is for, on the spy', () => {
    const spies = CREATURES.filter((c) => UNIT_TYPES[c.id].spy);
    expect(spies.length, 'every side builds one').toBeGreaterThan(0);
    for (const c of spies) {
      const notes = notesFor(c.id);
      expect(notes, `${c.name} does not say it cannot fight`).toMatch(/never fights/i);
      // Every rung that is built is named on the card, read off the same table
      // the buttons are read off -- so a rung wired up later cannot ship with
      // the card still listing the old ladder.
      for (const act of Object.values(SPY_ACTIONS)) {
        if (!act.ready || act.risk === 0) continue;
        expect(notes, `${c.name}'s card does not mention "${act.verb}"`).toContain(act.verb);
      }
      expect(notes, `${c.name} does not say what being caught costs`).toMatch(/caught/i);
    }
  });

  it('says a spy is seen the whole time, which is what the high tier will not be', () => {
    // The distinction worth drawing before there is anything to draw it
    // against: a disguise answers "what am I looking at", never "can I see it
    // at all". The one thing in the game that answers the second is a
    // Burrower under the ground.
    for (const c of CREATURES.filter((x) => UNIT_TYPES[x.id].spy)) {
      expect(notesFor(c.id), `${c.name} does not say it is visible`).toMatch(/in plain sight/i);
    }
    expect(notesFor('burrower'), 'and the one that genuinely is not').toMatch(
      /nobody else can see it/i,
    );
  });

  it('puts Sink and Burrow on the Burrower, not only in the Hive’s rules', () => {
    const notes = notesFor('burrower');
    expect(notes).toMatch(/Sink \(G\)/);
    expect(notes).toMatch(/Burrow \(Shift\+G\)/);
    expect(notes, 'the cost that stops it being a free dodge').toMatch(/whole turn/i);
    expect(notes, 'and what happens when somebody treads on it').toMatch(/pushed clear/i);
  });

  it('names advances by looking them up, so a rename cannot orphan the prose', () => {
    // Three of the Burrower's notes quote an advance by name. Read off the
    // tree rather than written out, so the fallback never reaches a player.
    expect(notesFor('burrower')).not.toMatch(/a later advance/);
  });
});

/**
 * Every pane that is prose rather than a roster. Named here rather than swept
 * off the DOM, because the point of the list is that a pane which quietly
 * stops having topics should fail -- and a sweep over "panes that have topics"
 * would pass by definition.
 */
const LONG_PANES = ['espionage', 'diplomacy', 'wilds', 'buildings', 'terrain', 'controls'];

describe('a long pane is topics, not a wall', () => {
  /** Open the book and hand back the pane element. */
  function pane(name: string): HTMLElement {
    openPedia(state, state.players[0]);
    const el = document.querySelector<HTMLElement>(`.pedia-pane[data-pane="${name}"]`);
    expect(el, `no pane called ${name}`).not.toBeNull();
    return el!;
  }

  it('gives espionage a pane of its own, away from the peace treaties', () => {
    // They were never one subject: diplomacy is what you say to somebody who
    // knows you are saying it, and espionage is the whole of what you do
    // because they do not.
    const spy = pane('espionage');
    const diplo = pane('diplomacy');
    expect(spy.textContent).toMatch(/Sabotage/);
    expect(diplo.textContent, 'the ladder is not in here any more').not.toMatch(
      /wrecking whatever it is building/,
    );
    expect(diplo.textContent, 'and the peace rules did not come along with it').toMatch(/peace/i);
  });

  it('heads every topic and lists them at the top of the pane', () => {
    for (const name of LONG_PANES) {
      const el = pane(name);
      const heads = el.querySelectorAll('.pedia-topic > .pedia-head');
      const strip = el.querySelectorAll('.pedia-toc-item');
      expect(heads.length, `${name} has no topics`).toBeGreaterThan(2);
      // One entry per topic. A strip that has drifted from the sections is
      // worse than no strip, because it is a contents page that lies.
      expect(strip.length, `${name}'s contents strip does not match its topics`).toBe(heads.length);
    }
  });

  it('leads with who everybody is in the Hive’s pane too', () => {
    // Shown in whichever pane the Hive lives in for this reader -- here an
    // orc, so it is the pane about them.
    const el = pane('them-hivekin');
    const heads = el.querySelectorAll('.pedia-topic > .pedia-head');
    expect(heads.length, 'the Hive’s rules kept their topics').toBeGreaterThan(2);
    expect(heads[0].textContent, 'and still open by saying who everybody is').toMatch(/who they are/i);
  });

  it('has no dead cross-reference anywhere in the book', () => {
    openPedia(state, state.players[0]);
    const root = document.getElementById('modal-root')!;

    // A link to a topic: the anchor has to be in the document, and in a pane,
    // because the handler switches to whichever pane it finds it in.
    const dead: string[] = [];
    root.querySelectorAll<HTMLElement>('[data-jump]').forEach((link) => {
      const id = link.dataset.jump!;
      const target = root.querySelector(`#${CSS.escape(id)}`);
      if (target === null || target.closest('.pedia-pane') === null) dead.push(id);
    });
    expect(dead, `topic links pointing at nothing: ${dead.join(', ')}`).toEqual([]);

    // A link to an entry: the id has to be something the book can locate. This
    // is the prose version of the Bone Sentinel bug -- a link that silently
    // does nothing, found only by clicking it.
    const unknown: string[] = [];
    root.querySelectorAll<HTMLElement>('[data-see]').forEach((link) => {
      const id = link.dataset.see!;
      if (!UNIT_TYPES[id] && !BUILDINGS[id]) unknown.push(id);
    });
    expect(unknown, `entry links naming nothing: ${unknown.join(', ')}`).toEqual([]);
  });

  it('writes the ladder up in the words that are on the buttons', () => {
    // The sub-headings are built from the same table `main.ts` labels the
    // buttons from. A rung renamed in one place and not the other is the sort
    // of thing nobody notices until a player reads the book, looks for the
    // order, and cannot find it.
    const text = pane('espionage').textContent ?? '';
    for (const act of Object.values(SPY_ACTIONS)) {
      if (!act.ready) continue;
      expect(text, `the Espionage pane never says "${act.verb}"`).toContain(act.verb);
    }
  });

  it('names the advance a gated rung wants, and claims none for the free ones', () => {
    // Sabotage needs no advance -- it comes with the spy, like searching and
    // watching a town. The first draft of the pane said "the first two come
    // with the spy; the rest each want an advance of their own", which was a
    // confident sentence about a rule nobody had checked.
    const text = pane('espionage').textContent ?? '';
    for (const name of ['Asking Around', 'A Word In The Wrong Ear', 'Everyone Has A Price']) {
      expect(text, `the pane does not say which advance buys ${name}`).toContain(name);
    }
    expect(text, 'the three that come with the spy are named as such').toMatch(
      /come with the spy itself/i,
    );
  });

  it('never prints a lever it failed to look up', () => {
    // Every number in these panes is interpolated, so a renamed lever reads
    // "undefined" to the player and fails nowhere else.
    for (const name of LONG_PANES) {
      expect(pane(name).textContent, `${name}`).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});
