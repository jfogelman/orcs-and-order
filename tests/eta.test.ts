import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/model/types';
import { foundCity } from '../src/sim/city';
import { createGame } from '../src/sim/gamestate';
import { researchableTechs, setResearch, techCost } from '../src/sim/research';
import { TECHS_BY_ID } from '../src/model/techs';
import { beakersPerTurn, turnsToLearn } from '../src/sim/turn';

/**
 * "Turns left" on the advances screen. The complaint it answers is that the
 * number was there all along -- beakers over cost -- but you had to do the
 * division yourself every turn to know whether a study landed before the thing
 * you were dreading did.
 */
function studying(): GameState {
  const state = createGame({ seed: 20260907, width: 40, height: 30 });
  const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
  foundCity(state, settler);
  // A new empire is studying nothing; the question only has an answer once
  // somebody has picked something.
  const player = state.players[0];
  setResearch(state, player, researchableTechs(player)[0].id);
  return state;
}

describe('how long the current study has to run', () => {
  it('is the work left over what the empire earns, rounded up', () => {
    const state = studying();
    const player = state.players[0];
    const rate = beakersPerTurn(state, 0);
    expect(rate).toBeGreaterThan(0);

    const def = TECHS_BY_ID[player.researching!];
    const left = techCost(player, def) - player.beakers;
    expect(turnsToLearn(state, 0)).toBe(Math.ceil(left / rate));
  });

  it('says nothing at all when nothing is being studied', () => {
    const state = studying();
    state.players[0].researching = null;
    expect(turnsToLearn(state, 0)).toBeNull();
  });

  it('reads as zero once the study is already paid for', () => {
    const state = studying();
    const player = state.players[0];
    player.beakers = techCost(player, TECHS_BY_ID[player.researching!]) + 5;
    expect(turnsToLearn(state, 0)).toBe(0);
  });

  it('is null, not infinity, for an empire earning nothing', () => {
    const state = studying();
    // Every city in disorder produces no trade, which is a different answer
    // rather than a longer wait.
    state.cities = [];
    expect(beakersPerTurn(state, 0)).toBe(0);
    expect(turnsToLearn(state, 0)).toBeNull();
  });
});
