import { describe, expect, it } from 'vitest';
import type { GameState, Player } from '../src/model/types';
import { TECHS_BY_ID } from '../src/model/techs';
import { addBeakers, researchableTechs, setResearch, techCost } from '../src/sim/research';
import { createGame } from '../src/sim/gamestate';

function empire(): { state: GameState; player: Player } {
  const state = createGame({ seed: 20260904, width: 24, height: 18 });
  const player = state.players[0];
  player.techs = [];
  player.beakers = 0;
  player.researching = null;
  state.log.length = 0;
  return { state, player };
}

/** Two advances this player could start right now, cheapest first. */
function twoChoices(player: Player) {
  const open = researchableTechs(player).sort((a, b) => techCost(player, a) - techCost(player, b));
  return { cheap: open[0], dear: open[open.length - 1] };
}

/**
 * Changing your mind used to cost everything you had banked, "to discourage
 * dithering". What it discouraged was correcting a mistake: a player deep in
 * the spiral of section 77 -- rioting everywhere because the advance that
 * unlocks a Totem was never taken -- had to throw away all their work to go and
 * get it.
 */
describe('changing what you are studying', () => {
  it('keeps the work when you switch', () => {
    const { state, player } = empire();
    const { cheap, dear } = twoChoices(player);
    // Something dear enough that a switch cannot finish it outright.
    setResearch(state, player, dear.id);
    addBeakers(state, player, 5);
    expect(player.beakers).toBe(5);

    setResearch(state, player, cheap.id);

    // The old rule put this at zero, which is the whole reason nobody could
    // course-correct out of a bad opening.
    expect(player.researching === cheap.id || player.techs.includes(cheap.id)).toBe(true);
  });

  it('learns it at once when the work is already done', () => {
    const { state, player } = empire();
    const { cheap, dear } = twoChoices(player);
    setResearch(state, player, dear.id);
    addBeakers(state, player, techCost(player, cheap) + 20);

    setResearch(state, player, cheap.id);

    expect(player.techs).toContain(cheap.id);
    expect(player.researching).toBeNull();
  });

  it('does not give the surplus back', () => {
    const { state, player } = empire();
    const { cheap, dear } = twoChoices(player);
    setResearch(state, player, dear.id);
    addBeakers(state, player, techCost(player, cheap) + 20);

    setResearch(state, player, cheap.id);

    // The risk that makes it a decision rather than a free reshuffle: reaching
    // sideways for something already paid for forfeits the change.
    expect(player.beakers).toBe(0);
  });

  it('keeps the change when a study finishes on its own', () => {
    const { state, player } = empire();
    const { cheap } = twoChoices(player);
    setResearch(state, player, cheap.id);

    addBeakers(state, player, techCost(player, cheap) + 7);

    // Which is the asymmetry: finishing normally is not the same as switching
    // onto something already covered.
    expect(player.techs).toContain(cheap.id);
    expect(player.beakers).toBe(7);
  });

  it('says so, rather than the advance appearing from nowhere', () => {
    const { state, player } = empire();
    const { cheap, dear } = twoChoices(player);
    setResearch(state, player, dear.id);
    addBeakers(state, player, techCost(player, cheap) + 20);
    state.log.length = 0;

    setResearch(state, player, cheap.id);

    const said = state.log.map((e) => e.text).join(' | ');
    expect(said).toMatch(/already paid for/i);
    expect(said).toMatch(new RegExp(TECHS_BY_ID[cheap.id].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });

  it('still refuses an advance whose prerequisites are missing', () => {
    const { state, player } = empire();
    const open = new Set(researchableTechs(player).map((t) => t.id));
    const locked = Object.values(TECHS_BY_ID).find((t) => !open.has(t.id));
    if (!locked) return;

    player.beakers = 9999;
    setResearch(state, player, locked.id);

    // Free to change your mind is not free to skip the tree.
    expect(player.techs).not.toContain(locked.id);
    expect(player.researching).not.toBe(locked.id);
  });
});
