// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openTechPanel } from '../../src/ui/techPanel';
import { createGame } from '../../src/sim/gamestate';
import { UPGRADES } from '../../src/model/upgrades';
import type { GameState } from '../../src/model/types';

/**
 * Section 155 slice 5: what an upgrade advance's card says.
 *
 * Two things a player cannot find out any other way without closing the
 * screen, and both were wrong before this slice.
 *
 * The first is **what the advance actually does**. Thirty-six of them carried
 * the flag label "Improves a unit you already have", which is true of all
 * thirty-six and useful about none of them.
 *
 * The second is worse. A branch the empire gave up **has every prerequisite
 * met and will never be researchable again**, so it drew an ordinary locked
 * card with no "needs" line and no explanation -- a player would come back to
 * it every few turns waiting for it to open. Nothing was broken; the game just
 * silently declined to say what it had done.
 */

beforeEach(() => {
  // `openModal` mounts into a root the real page carries in its HTML.
  document.body.innerHTML = '<div id="modal-root"></div>';
});

afterEach(() => {
  UPGRADES.enabled = false;
  document.body.innerHTML = '';
});

function open(techs: string[]): string {
  const state: GameState = createGame({
    seed: 155,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['human'],
    upgrades: true,
  });
  const player = state.players[0];
  player.techs = [...player.techs, ...techs];
  openTechPanel(state, player, () => {});
  return document.body.textContent ?? '';
}

describe('an upgrade advance says what it gives you', () => {
  it('names the upgrade and quotes its blurb, rather than the flag label', () => {
    const text = open(['doing-this-before']);
    expect(text).toContain('Orc Berserker');
    expect(text, 'the blurb a player will act on').toContain(
      '+2 attack, -1 defense below half HP.',
    );
  });

  it('is the same sentence the creature card shows, because it is the same string', () => {
    // Read off `UPGRADE_BY_TECH` rather than written out here, which is the
    // only way the two can be guaranteed not to drift.
    const text = open(['doing-this-before']);
    expect(text).toContain('+2 defense, -1 movement.');
  });
});

describe('a branch given up says so', () => {
  it('explains the closed door, and names the road taken instead', () => {
    const text = open(['doing-this-before', 'losing-it']);
    expect(text).toContain('Standing Still On Purpose');
    expect(text, 'the card that would otherwise be a silent dead end').toMatch(
      /not any more.*took Orc Berserker/s,
    );
  });

  it('says nothing of the sort while both roads are still open', () => {
    const text = open(['doing-this-before']);
    expect(text).not.toMatch(/not any more/);
  });

  it('says nothing of the sort in a game without upgrades', () => {
    const state = createGame({ seed: 155, width: 30, height: 20, barbarians: false });
    const player = state.players[0];
    player.techs = [...player.techs, 'doing-this-before', 'losing-it'];
    openTechPanel(state, player, () => {});
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/not any more/);
    expect(text, 'the advances are not in this tree at all').not.toContain('Orc Berserker');
  });
});
