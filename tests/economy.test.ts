import { describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS } from '../src/model/techs';
import type { BuildingId, City, GameState } from '../src/model/types';
import { cityGoldBonus, cityScienceBonus, foundCity } from '../src/sim/city';
import { createGame, playerCities } from '../src/sim/gamestate';
import { unlockedBuildings } from '../src/sim/research';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * The economy buildings multiply the city they stand in, not the empire, so
 * these tests drive a real city through real turns rather than checking the
 * data table in isolation.
 */

function cityGame(buildings: BuildingId[] = []): { state: GameState; city: City } {
  const state = createGame({ seed: 20250814, width: 40, height: 30 });
  // Give the human side a working city on known ground.
  const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
  const city = foundCity(state, settler)!;
  // Stay under the content limit: a rioting city yields nothing at all, which
  // silently reduces any income comparison to zero versus zero.
  city.size = 4;
  city.buildings = [...buildings];
  city.producing = { kind: 'coin' };
  return { state, city };
}

/** Gold and beakers gained by player 0 over one economy tick. */
function incomeOver(state: GameState, turns = 1): { gold: number; beakers: number } {
  const player = state.players[0];
  const beforeGold = player.gold;
  const beforeBeakers = player.beakers + player.techs.length * 100000;
  for (let i = 0; i < turns; i++) beginPlayerTurn(state, 0);
  const afterBeakers = player.beakers + player.techs.length * 100000;
  return { gold: player.gold - beforeGold, beakers: afterBeakers - beforeBeakers };
}

describe('economy buildings', () => {
  it('are defined for both factions, in matching pairs', () => {
    const gold = Object.values(BUILDINGS).filter((b) => b.goldBonus);
    const science = Object.values(BUILDINGS).filter((b) => b.scienceBonus);
    expect(gold.map((b) => b.faction).sort()).toEqual(['human', 'orc']);
    expect(science.map((b) => b.faction).sort()).toEqual(['human', 'orc']);
  });

  it('are each unlocked by an advance', () => {
    for (const b of Object.values(BUILDINGS)) {
      if (!b.goldBonus && !b.scienceBonus) continue;
      const tech = TECHS.find((t) => t.buildings.includes(b.id));
      expect(tech, `${b.id} is unbuildable: no advance unlocks it`).toBeDefined();
    }
  });

  it('only offers each faction its own', () => {
    const state = createGame({ seed: 1 });
    const orc = state.players[0];
    orc.techs.push('not-you-again', 'hammers-of-glory');
    const ids = unlockedBuildings(orc).map((b) => b.id);
    expect(ids).toContain('treasury');
    expect(ids).toContain('thinkingRock');
    expect(ids).not.toContain('market');
    expect(ids).not.toContain('scriptorium');
  });

  it('reports its bonus from the city that holds it', () => {
    const bare = cityGame().city;
    expect(cityGoldBonus(bare)).toBe(0);
    expect(cityScienceBonus(bare)).toBe(0);

    const rich = cityGame(['treasury', 'thinkingRock']).city;
    expect(cityGoldBonus(rich)).toBeCloseTo(BUILDINGS.treasury.goldBonus!);
    expect(cityScienceBonus(rich)).toBeCloseTo(BUILDINGS.thinkingRock.scienceBonus!);
  });

  it('raises gold income above the same city without one', () => {
    // Tax everything to gold so the comparison is not swallowed by rounding.
    const plain = cityGame();
    plain.state.players[0].taxRate = 10;
    const withTreasury = cityGame(['treasury']);
    withTreasury.state.players[0].taxRate = 10;

    const before = incomeOver(plain.state);
    const after = incomeOver(withTreasury.state);
    // Upkeep makes the net smaller, so compare against gross plus that upkeep.
    expect(after.gold + BUILDINGS.treasury.upkeep).toBeGreaterThan(before.gold);
  });

  it('raises research output above the same city without one', () => {
    const plain = cityGame();
    plain.state.players[0].taxRate = 0;
    plain.state.players[0].researching = 'mapmaking';
    const withRock = cityGame(['thinkingRock']);
    withRock.state.players[0].taxRate = 0;
    withRock.state.players[0].researching = 'mapmaking';

    expect(incomeOver(withRock.state).beakers).toBeGreaterThan(incomeOver(plain.state).beakers);
  });

  it('is actually built by the AI over a long game', () => {
    const state = createGame({ seed: 4242 });
    state.players[0].controller = 'ai';
    beginPlayerTurn(state, 0);
    for (let i = 0; i < 500 && state.winner === null; i++) {
      runAiTurn(state, state.activePlayer);
      endPlayerTurn(state);
    }
    const economic = new Set(
      Object.values(BUILDINGS)
        .filter((b) => b.goldBonus || b.scienceBonus)
        .map((b) => b.id),
    );
    const built = state.players.flatMap((p) =>
      playerCities(state, p.id).flatMap((c) => c.buildings.filter((b) => economic.has(b))),
    );
    expect(built.length, 'no economy building was ever put up').toBeGreaterThan(0);
  });
});
