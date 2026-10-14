// @vitest-environment jsdom
import { beforeEach, beforeAll, describe, expect, it } from 'vitest';
import { createGame } from '../../src/sim/gamestate';
import { CREATURES, UNIT_TYPES } from '../../src/model/units';
import { BUILDINGS, BUILDING_IDS } from '../../src/model/buildings';
import { openPedia } from '../../src/ui/pedia';
import { POSTING } from '../../src/sim/city';
import { closeModal, isModalOpen } from '../../src/ui/dom';
import type { GameState } from '../../src/model/types';

/**
 * A control on the Orcpedia, the way `art-present` is a control on the art.
 *
 * **The Bone Sentinel had no entry.** Every roster filters wild things out --
 * correctly, since a raiding party is not something the Horde can put in a
 * queue -- and nothing picked them up afterwards, so nine creatures a player
 * can be killed by were in the book nowhere. The ruin dialog's link to one
 * therefore did nothing at all, silently, and it took playing the game to find
 * out.
 *
 * This is the test that would have caught it the day it shipped: ask the book
 * for every creature and every building there is, and fail on the first one it
 * cannot show. It is deliberately a sweep over the data rather than a list
 * written out here -- a list would need remembering, which is the thing that
 * failed.
 */
let state: GameState;

beforeAll(async () => {
  await import('../../src/main');
  state = createGame({ seed: 11, width: 30, height: 20 });
});

beforeEach(async () => {
  for (let i = 0; i < 20 && isModalOpen(); i++) {
    closeModal();
    await Promise.resolve();
  }
  document.getElementById('modal-root')!.innerHTML = '';
});

/** Open the book at `focus` and say whether it actually found the entry. */
function entryFor(focus: string): { found: boolean; pane: string | null } {
  openPedia(state, state.players[0], focus);
  const card = document.querySelector(`#pedia-${CSS.escape(focus)}`);
  const pane = card?.closest('.pedia-pane')?.getAttribute('data-pane') ?? null;
  return { found: card !== null, pane };
}

describe('the book has an entry for everything in the game', () => {
  it('has a card for every creature, wild ones included', () => {
    const missing = CREATURES.filter((c) => !entryFor(c.id).found).map((c) => c.name);
    expect(missing, `creatures with no Orcpedia entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('puts wild things in the Wilds pane, where the link looks for them', () => {
    // Not merely "has a card". A wild creature carries a faction for its art --
    // a Bone Sentinel is `human` -- so an entry filed under the Kingdom would
    // satisfy the test above while the jump still landed on the wrong pane.
    const wrong = CREATURES.filter((c) => c.wild).filter((c) => entryFor(c.id).pane !== 'wilds');
    expect(
      wrong.map((c) => c.name),
      'wild creatures filed under somebody’s roster',
    ).toEqual([]);
  });

  it('has a card for every building somebody can actually build', () => {
    // Asked per faction, because the buildings pane is filtered to the reader's
    // own side and that is deliberate -- a Horde player is not shown the
    // Kingdom's Cathedral. The first draft asked one player about every
    // building in the game and reported twenty-four "missing" entries, all of
    // them somebody else's. The real question is whether anything is missing
    // from the book of the side that can build it.
    const missing: string[] = [];
    for (const player of state.players) {
      if (player.barbarian) continue;
      for (const id of BUILDING_IDS) {
        const b = BUILDINGS[id];
        if (b.faction !== 'both' && b.faction !== player.faction) continue;
        if (b.garrisonNeeded && b.contentBonus && !POSTING.enabled) continue;
        openPedia(state, player, id);
        if (document.querySelector(`#pedia-b-${CSS.escape(id)}`) === null) {
          missing.push(`${b.name} (${player.faction})`);
        }
      }
    }
    expect(missing, `buildings with no Orcpedia entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('writes one anchor per entry, so a jump is never ambiguous', () => {
    openPedia(state, state.players[0]);
    const twice = [...CREATURES, ...BUILDING_IDS.map((id) => ({ id: `b-${id}` }))]
      .filter((c) => document.querySelectorAll(`#pedia-${CSS.escape(c.id)}`).length > 1)
      .map((c) => c.id);
    // `scrollIntoView` goes to the first match, so a duplicate is a jump that
    // lands somewhere arbitrary. The sea legion had cards in the Wilds prose
    // and would have had a second set when the full roster was added.
    expect(twice, `entries written twice: ${twice.join(', ')}`).toEqual([]);
  });

  it('knows about every unit type, not only every creature', () => {
    // Group variants (`orc_x3`) resolve to their base creature's card. The
    // jump does that resolution itself, so this asks the question the way the
    // caller asks it.
    const missing = Object.keys(UNIT_TYPES).filter((id) => {
      openPedia(state, state.players[0], id);
      return document.querySelector('.pedia-highlight') === null;
    });
    expect(missing, `unit types the book cannot show: ${missing.join(', ')}`).toEqual([]);
  });
});
