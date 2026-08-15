import { describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS } from '../src/model/techs';
import type { BuildingId, City, GameState } from '../src/model/types';
import { cityGoldBonus, cityScienceBonus, foundCity } from '../src/sim/city';
import { createGame, playerCities, spawnUnit } from '../src/sim/gamestate';
import { attackStrength, defenseStrength } from '../src/sim/combat';
import { unlockedBuildings } from '../src/sim/research';
import {
  beginPlayerTurn,
  endPlayerTurn,
  playerScore,
  scoreBreakdown,
  SCORE_WEIGHTS,
} from '../src/sim/turn';

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

describe('score', () => {
  /** A city with a given size and building count, on a throwaway map. */
  function empire(spec: Array<{ size: number; buildings: number }>): GameState {
    const state = createGame({ seed: 99, width: 40, height: 30 });
    state.cities.length = 0;
    spec.forEach((s, i) => {
      state.cities.push({
        id: i + 1,
        owner: 0,
        name: `City ${i}`,
        x: 5 + i * 3,
        y: 5,
        size: s.size,
        food: 0,
        shields: 0,
        buildings: (['barracks', 'granary', 'walls', 'totem'] as BuildingId[]).slice(
          0,
          s.buildings,
        ),
        producing: { kind: 'coin' },
        workedTiles: [],
        disorder: false,
        foundedTurn: 1,
      });
    });
    return state;
  }

  it('pays nothing for merely owning a city', () => {
    // Six empty size-1 outposts versus one of them. The difference must be
    // exactly the five extra citizens, with no per-city bonus on top.
    const sprawl = playerScore(empire(Array(6).fill({ size: 1, buildings: 0 })), 0);
    const single = playerScore(empire([{ size: 1, buildings: 0 }]), 0);
    expect(sprawl - single).toBe(5 * SCORE_WEIGHTS.population);
  });

  it('ranks a developed empire above a wider empty one', () => {
    // This is the behaviour the old formula got wrong: planting flags beat
    // building anything.
    const wide = playerScore(empire(Array(10).fill({ size: 1, buildings: 0 })), 0);
    const deep = playerScore(empire(Array(3).fill({ size: 8, buildings: 3 })), 0);
    expect(deep).toBeGreaterThan(wide);
  });

  it('counts structures and advances', () => {
    const bare = empire([{ size: 4, buildings: 0 }]);
    const built = empire([{ size: 4, buildings: 3 }]);
    expect(playerScore(built, 0) - playerScore(bare, 0)).toBe(3 * SCORE_WEIGHTS.building);

    const learned = empire([{ size: 4, buildings: 0 }]);
    learned.players[0].techs.push('mapmaking', 'not-you-again');
    expect(playerScore(learned, 0) - playerScore(bare, 0)).toBe(2 * SCORE_WEIGHTS.advance);
  });

  it('adds up to its own breakdown', () => {
    const state = empire([{ size: 5, buildings: 2 }, { size: 3, buildings: 1 }]);
    const s = scoreBreakdown(state, 0);
    expect(s.population + s.advances + s.buildings).toBe(s.total);
    expect(s.population).toBe(8 * SCORE_WEIGHTS.population);
    expect(s.buildings).toBe(3 * SCORE_WEIGHTS.building);
  });
});

describe('the Broken Catapult', () => {
  /** An orc city with the given buildings, and a defender parked next door. */
  function skirmish(buildings: BuildingId[]) {
    const state = createGame({ seed: 55, width: 30, height: 20 });
    state.units.length = 0;
    state.cities.length = 0;
    state.terrain.fill('grass');
    state.cities.push({
      id: 1, owner: 0, name: 'Skullgrind', x: 10, y: 10, size: 4,
      food: 0, shields: 0, buildings: [...buildings],
      producing: { kind: 'coin' }, workedTiles: [], disorder: false, foundedTurn: 1,
    });
    const garrison = spawnUnit(state, 0, 'orc', 10, 10);
    const besieger = spawnUnit(state, 1, 'footman', 11, 10);
    return { state, garrison, besieger };
  }

  it('is orc-only, and Walls are human-only', () => {
    expect(BUILDINGS.catapult.faction).toBe('orc');
    expect(BUILDINGS.walls.faction).toBe('human');
    const tech = TECHS.find((t) => t.id === 'wall-building')!;
    expect(tech.buildings).toEqual(expect.arrayContaining(['walls', 'catapult']));
  });

  it('does nothing at all for a defender standing still', () => {
    const bare = skirmish([]);
    const armed = skirmish(['catapult']);
    // The garrison is the one being attacked here, not attacking.
    expect(defenseStrength(armed.state, armed.garrison).total).toBe(
      defenseStrength(bare.state, bare.garrison).total,
    );
  });

  it('sharpens a garrison that comes out swinging', () => {
    const bare = skirmish([]);
    const armed = skirmish(['catapult']);
    const before = attackStrength(bare.state, bare.garrison, bare.besieger).total;
    const after = attackStrength(armed.state, armed.garrison, armed.besieger).total;
    expect(after).toBeCloseTo(before * (1 + BUILDINGS.catapult.sallyBonus!));
  });

  it('does not help a unit attacking from open ground', () => {
    const armed = skirmish(['catapult']);
    // Same orc, same target, but standing outside the city.
    armed.garrison.x = 9;
    armed.garrison.y = 11;
    armed.besieger.x = 10;
    armed.besieger.y = 11;
    const bare = skirmish([]);
    bare.garrison.x = 9;
    bare.garrison.y = 11;
    bare.besieger.x = 10;
    bare.besieger.y = 11;
    expect(attackStrength(armed.state, armed.garrison, armed.besieger).total).toBe(
      attackStrength(bare.state, bare.garrison, bare.besieger).total,
    );
  });
});
