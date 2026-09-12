import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/model/buildings';
import {
  PALACE_MODULES,
  PALACE_TIERS,
  palaceArt,
  palaceOf,
  palacePieces,
  prideOffer,
  takePride,
} from '../src/model/palace';
import type { City, GameState } from '../src/model/types';
import { runAiTurn } from '../src/ai/ai';
import { CIVIC_PRIDE, assignWorkers, buildOptions, civicPride } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { PRIDE, playerScore, prideDue } from '../src/sim/turn';
import { deserialize, serialize } from '../src/persist/save';

/**
 * Section 67: Civic Pride. The capital is a chassis with five modules hung on
 * it, and every one of them is **given** rather than bought -- the council asks
 * which piece to add when the empire is doing especially well, which is what
 * makes it a reward for doing well rather than a way of doing well.
 */

/** An empire doing well enough to be pleased with itself. */
function proud(cities = 3): { state: GameState; capital: City } {
  const state = createGame({ seed: 20260919, width: 40, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.gold = 200;
  }
  for (let n = 0; n < cities; n++) {
    state.cities.push({
      id: n + 1,
      owner: 0,
      name: `Town ${n + 1}`,
      x: 4 + n * 6,
      y: 6,
      size: 6,
      food: 0,
      shields: 0,
      buildings: [],
      producing: { kind: 'coin' },
      workedTiles: [],
      disorder: false,
      foundedTurn: 1 + n,
      foundedBy: 0,
    });
  }
  for (const c of state.cities) assignWorkers(state, c);
  spawnUnit(state, 1, 'footman', 38, 18, false);
  return { state, capital: state.cities[0] };
}

describe('the capital in pieces', () => {
  it('has five modules of three tiers, with art for both sides', () => {
    expect(PALACE_MODULES).toHaveLength(5);
    for (const module of PALACE_MODULES) {
      for (const faction of ['orc', 'human'] as const) {
        expect(module.tiers[faction]).toHaveLength(PALACE_TIERS);
        for (let tier = 1; tier <= PALACE_TIERS; tier++) {
          expect(palaceArt(faction, module.id, tier)).toBe(`${faction}-${module.id}-${tier}`);
        }
      }
    }
  });

  it('is not a building, and cannot be queued in any city', () => {
    const { state, capital } = proud();
    // Nothing in the table, so nothing in any list, so no shields anywhere.
    expect(Object.keys(BUILDINGS).some((id) => id.startsWith('palace'))).toBe(false);
    expect(buildOptions(state, capital).buildings.some((b) => b.id.startsWith('palace'))).toBe(
      false,
    );
  });

  it('offers every module until each is at the top, then nothing', () => {
    const { state } = proud();
    const player = state.players[0];
    expect(prideOffer(player)).toHaveLength(5);

    for (let tier = 1; tier <= PALACE_TIERS; tier++) takePride(player, 'tower');
    expect(prideOffer(player).some((o) => o.module.id === 'tower')).toBe(false);
    expect(prideOffer(player)).toHaveLength(4);
    expect(takePride(player, 'tower')).toBe(false);

    for (const module of PALACE_MODULES) {
      while (takePride(player, module.id)) {
        /* to the top */
      }
    }
    expect(prideOffer(player)).toHaveLength(0);
    expect(palacePieces(player)).toHaveLength(5);
  });

  it('raises a module one tier at a time', () => {
    const { state } = proud();
    const player = state.players[0];
    expect(takePride(player, 'gate')).toBe(true);
    expect(palaceOf(player).gate).toBe(1);
    expect(prideOffer(player).find((o) => o.module.id === 'gate')?.tier).toBe(2);
  });
});

describe('when the council asks', () => {
  it('asks once the score passes a milestone and the empire is content', () => {
    const { state } = proud();
    expect(civicPride(state, 0)).toBe(true);
    expect(playerScore(state, 0)).toBeGreaterThan(PRIDE.step);
    expect(prideDue(state, 0)).toBe(true);
  });

  it('does not ask again until the next milestone', () => {
    const { state } = proud();
    const player = state.players[0];
    const earned = Math.floor(playerScore(state, 0) / PRIDE.step);

    // Take everything this empire has earned so far.
    for (let n = 0; n < earned; n++) {
      takePride(player, 'tower');
      player.prideTaken = (player.prideTaken ?? 0) + 1;
    }
    expect(prideDue(state, 0)).toBe(false);

    // An empire that has learned something has earned another. Advances rather
    // than citizens: more citizens on the same land is a hungrier empire, and a
    // hungry empire is not offered anything at all.
    player.techs.push(
      'mapmaking',
      'tree-hugging',
      'bridge-building',
      'wall-building',
      'tower-building',
      'not-you-again',
    );
    expect(prideDue(state, 0)).toBe(true);
  });

  it('says nothing at all while anybody is rioting or hungry', () => {
    const { state, capital } = proud();
    capital.disorder = true;
    expect(prideDue(state, 0)).toBe(false);
    capital.disorder = false;
    expect(prideDue(state, 0)).toBe(true);

    // Earned but not deserved is not lost: the milestone is counted against what
    // has been taken, so it is still waiting when the riot stops.
    state.players[0].gold = CIVIC_PRIDE.gold - 1;
    expect(prideDue(state, 0)).toBe(false);
    state.players[0].gold = 200;
    expect(prideDue(state, 0)).toBe(true);
  });

  it('has nothing to say to a raider band, or to a finished palace', () => {
    const { state } = proud();
    const player = state.players[0];
    player.barbarian = true;
    expect(prideDue(state, 0)).toBe(false);
    delete player.barbarian;

    for (const module of PALACE_MODULES) {
      while (takePride(player, module.id)) {
        /* to the top */
      }
    }
    expect(prideDue(state, 0)).toBe(false);
  });
});

describe('what it costs, and what it does', () => {
  it('costs nothing: no shields, no gold, no turn', () => {
    const { state, capital } = proud();
    const player = state.players[0];
    const gold = player.gold;
    const shields = capital.shields;
    const producing = capital.producing;

    takePride(player, 'wing');

    expect(player.gold).toBe(gold);
    expect(capital.shields).toBe(shields);
    expect(capital.producing).toBe(producing);
    expect(capital.buildings).toHaveLength(0);
  });

  it('belongs to the empire, so it survives a save and a lost capital', () => {
    const { state } = proud();
    takePride(state.players[0], 'banners');
    takePride(state.players[0], 'banners');

    const back = deserialize(serialize(state));
    expect(palaceOf(back.players[0]).banners).toBe(2);

    // The capital falls; the empire still built all that.
    back.cities.shift();
    expect(palaceOf(back.players[0]).banners).toBe(2);
  });

  it('is never taken by the AI, which is not asked', () => {
    const { state } = proud(5);
    for (const p of state.players) p.controller = 'ai';
    for (let turn = 0; turn < 3; turn++) runAiTurn(state, 0);
    expect(state.players[0].palace).toBeUndefined();
  });
});
