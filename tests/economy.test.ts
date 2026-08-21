import { describe, expect, it } from 'vitest';
import { AI_TUNING, runAiTurn } from '../src/ai/ai';
import { BUILDINGS } from '../src/model/buildings';
import type { BuildingDef } from '../src/model/buildings';
import { TECHS } from '../src/model/techs';
import type { BuildingId, City, GameState } from '../src/model/types';
import {
  cityGoldBonus,
  cityScienceBonus,
  foundCity,
  rushBlocked,
  rushBuy,
  rushCost,
} from '../src/sim/city';
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
    // Matching pairs rather than exactly one each: there are two tiers now,
    // and what has to hold is that neither side has a tier the other lacks.
    const byFaction = (list: BuildingDef[]) => ({
      orc: list.filter((b) => b.faction === 'orc').length,
      human: list.filter((b) => b.faction === 'human').length,
    });
    expect(byFaction(gold).orc).toBe(byFaction(gold).human);
    expect(byFaction(science).orc).toBe(byFaction(science).human);
    expect(byFaction(gold).orc).toBeGreaterThan(0);
    expect(byFaction(science).orc).toBeGreaterThan(0);
  });

  it('gate every second tier behind its first', () => {
    for (const b of Object.values(BUILDINGS)) {
      if (!b.needs) continue;
      const first = BUILDINGS[b.needs];
      expect(first, `${b.id} needs ${b.needs}, which does not exist`).toBeDefined();
      // Otherwise a city could hold a Cathedral it never built a Chapel for.
      expect(first.faction === b.faction || first.faction === 'both').toBe(true);
    }
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
    const plain = cityGame();
    expect(cityGoldBonus(plain.state, plain.city)).toBe(0);
    expect(cityScienceBonus(plain.state, plain.city)).toBe(0);

    const rich = cityGame(['treasury', 'thinkingRock']);
    // The treasury wants guarding; the thinking rock does not.
    spawnUnit(rich.state, 0, 'orc', rich.city.x, rich.city.y);
    expect(cityGoldBonus(rich.state, rich.city)).toBeCloseTo(BUILDINGS.treasury.goldBonus!);
    expect(cityScienceBonus(rich.state, rich.city)).toBeCloseTo(
      BUILDINGS.thinkingRock.scienceBonus!,
    );
  });

  it('raises gold income above the same city without one', () => {
    // Tax everything to gold so the comparison is not swallowed by rounding.
    const plain = cityGame();
    plain.state.players[0].taxRate = 10;
    const withTreasury = cityGame(['treasury']);
    withTreasury.state.players[0].taxRate = 10;
    // The treasury pays only while it is being watched, so post somebody.
    spawnUnit(withTreasury.state, 0, 'orc', withTreasury.city.x, withTreasury.city.y);

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

  it('is actually built by the AI, given a game that lasts', () => {
    // Spread over several maps rather than one. This used to run a single
    // seed for five hundred turns, which stopped working once games started
    // ending by conquest -- the loop exits at the win and the economy never
    // gets built, which says nothing about whether the AI would have built it.
    const economic = new Set(
      Object.values(BUILDINGS)
        .filter((b) => b.goldBonus || b.scienceBonus)
        .map((b) => b.id),
    );
    const built = [4242, 1, 7919, 31337].map((seed) => {
      const state = createGame({ seed });
      state.players[0].controller = 'ai';
      beginPlayerTurn(state, 0);
      for (let i = 0; i < 500 && state.winner === null; i++) {
        runAiTurn(state, state.activePlayer);
        endPlayerTurn(state);
      }
      return state.players.flatMap((p) =>
        playerCities(state, p.id).flatMap((c) => c.buildings.filter((b) => economic.has(b))),
      ).length;
    });
    expect(
      built.some((n) => n > 0),
      'no AI on any map ever put up an economy building',
    ).toBe(true);
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

  it('helps a defender a little, but far less than a wall would', () => {
    const bare = skirmish([]);
    const armed = skirmish(['catapult']);
    const plain = defenseStrength(bare.state, bare.garrison).total;
    const behindCatapult = defenseStrength(armed.state, armed.garrison).total;
    expect(behindCatapult).toBeCloseTo(plain * BUILDINGS.catapult.defenseMult!);
    // The point of the thing is offence; the defence is a consolation.
    expect(BUILDINGS.catapult.defenseMult!).toBeLessThan(BUILDINGS.walls.defenseMult!);
  });

  it('keeps its defence against siege, where a wall would not', () => {
    const armed = skirmish(['catapult']);
    const ram = spawnUnit(armed.state, 1, 'ballista', 9, 10);
    // A ballista knocks walls down. There is nothing here to knock down.
    expect(defenseStrength(armed.state, armed.garrison, ram).total).toBeCloseTo(
      defenseStrength(armed.state, armed.garrison).total,
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

describe('buildings that want somebody standing in them', () => {
  /** A city with the given buildings, and optionally a unit posted in it. */
  function guarded(buildings: BuildingId[], post: boolean) {
    const g = cityGame(buildings);
    g.state.players[0].taxRate = 10;
    if (post) spawnUnit(g.state, 0, 'orc', g.city.x, g.city.y);
    return g;
  }

  it('pays nothing while the city stands empty', () => {
    const empty = guarded(['treasury'], false);
    expect(BUILDINGS.treasury.needsGarrison).toBe(true);
    expect(cityGoldBonus(empty.state, empty.city)).toBe(0);
  });

  it('pays in full the moment somebody is posted there', () => {
    const held = guarded(['treasury'], true);
    expect(cityGoldBonus(held.state, held.city)).toBeCloseTo(BUILDINGS.treasury.goldBonus!);
  });

  it('does not count a settler as cover', () => {
    // A peon wandering through is not a garrison, and letting it count would
    // make the whole condition trivial to satisfy by accident.
    const g = cityGame(['treasury']);
    spawnUnit(g.state, 0, 'peon', g.city.x, g.city.y);
    expect(cityGoldBonus(g.state, g.city)).toBe(0);
  });

  it('does not count a unit merely standing next door', () => {
    const g = cityGame(['treasury']);
    spawnUnit(g.state, 0, 'orc', g.city.x + 1, g.city.y);
    expect(cityGoldBonus(g.state, g.city)).toBe(0);
  });

  it('does not count somebody else\u2019s soldier', () => {
    const g = cityGame(['treasury']);
    spawnUnit(g.state, 1, 'footman', g.city.x, g.city.y);
    expect(cityGoldBonus(g.state, g.city)).toBe(0);
  });

  it('leaves unconditional buildings alone', () => {
    // The thinking rock asks nothing of anybody.
    const g = cityGame(['thinkingRock']);
    expect(BUILDINGS.thinkingRock.needsGarrison).toBeUndefined();
    expect(cityScienceBonus(g.state, g.city)).toBeCloseTo(BUILDINGS.thinkingRock.scienceBonus!);
  });

  it('shows up as real income over a turn, not just in the helper', () => {
    const empty = guarded(['treasury'], false);
    const held = guarded(['treasury'], true);
    expect(incomeOver(held.state).gold).toBeGreaterThan(incomeOver(empty.state).gold);
  });

  it('is a trade, not a tax: it pays better than an unconditional building would', () => {
    // Both factions' garrison-gated buildings pay double what the old flat
    // 50% did, so posting a unit is worth doing rather than merely avoided.
    for (const id of ['treasury', 'market'] as const) {
      expect(BUILDINGS[id].needsGarrison).toBe(true);
      expect(BUILDINGS[id].goldBonus).toBeGreaterThan(0.5);
    }
  });
});

describe('rush-buying', () => {
  /** A city part-way through building something, and a treasury to spend. */
  function shop(gold: number, shields = 0) {
    const g = cityGame();
    g.city.producing = { kind: 'building', id: 'granary' };
    g.city.shields = shields;
    g.state.players[0].gold = gold;
    return g;
  }

  it('costs more the further there is to go', () => {
    const near = shop(999, BUILDINGS.granary.cost - 5);
    const far = shop(999, BUILDINGS.granary.cost - 40);
    expect(rushCost(near.state, near.city)).toBeLessThan(rushCost(far.state, far.city));
  });

  it('charges a penalty for starting from nothing', () => {
    // Otherwise gold simply replaces having a city worth building in.
    const fromNothing = shop(999, 0);
    const barelyStarted = shop(999, 1);
    expect(rushCost(fromNothing.state, fromNothing.city)).toBeGreaterThan(rushCost(barelyStarted.state, barelyStarted.city) * 1.5);
  });

  it('fills the shield box and takes the gold', () => {
    const g = shop(999, 10);
    const price = rushCost(g.state, g.city);
    expect(rushBuy(g.state, g.city)).toBe(true);
    expect(g.city.shields).toBe(BUILDINGS.granary.cost);
    expect(g.state.players[0].gold).toBe(999 - price);
  });

  it('actually produces the thing on the next turn', () => {
    const g = shop(999, 10);
    rushBuy(g.state, g.city);
    beginPlayerTurn(g.state, 0);
    expect(g.city.buildings).toContain('granary');
  });

  it('refuses when the gold is not there, and changes nothing', () => {
    const g = shop(1, 10);
    expect(rushBlocked(g.state, g.city)).toMatch(/needs \d+ gold/i);
    expect(rushBuy(g.state, g.city)).toBe(false);
    expect(g.state.players[0].gold).toBe(1);
    expect(g.city.shields).toBe(10);
  });

  it('cannot be used on Coin, which is not a thing being built', () => {
    const g = shop(999);
    g.city.producing = { kind: 'coin' };
    expect(rushCost(g.state, g.city)).toBe(0);
    expect(rushBuy(g.state, g.city)).toBe(false);
  });

  it('cannot be used on something already paid for', () => {
    const g = shop(999, BUILDINGS.granary.cost);
    expect(rushCost(g.state, g.city)).toBe(0);
    expect(rushBuy(g.state, g.city)).toBe(false);
  });

  it('never drives a player into debt', () => {
    const g = shop(999, 5);
    rushBuy(g.state, g.city);
    expect(g.state.players[0].gold).toBeGreaterThanOrEqual(0);
  });

  it('is used by the AI when switched on, and stops it hoarding', () => {
    // Off by default: measured over eighteen seeds, an AI that spends gold
    // well makes the balance markedly worse, because rush-buying scales with
    // how many cities you have to spend it in. The machinery still has to
    // work, though, so the test turns it on.
    AI_TUNING.rushBuying = true;
    const state = createGame({ seed: 4242 });
    state.players[0].controller = 'ai';
    beginPlayerTurn(state, 0);
    let everBought = false;
    for (let i = 0; i < 240 && state.winner === null; i++) {
      const before = state.log.length;
      runAiTurn(state, state.activePlayer);
      endPlayerTurn(state);
      if (state.log.slice(before).some((e) => /gold to have/.test(e.text))) everBought = true;
    }
    AI_TUNING.rushBuying = false;
    expect(everBought, 'the AI never once spent gold on production').toBe(true);
  });

  it('leaves the AI alone by default', () => {
    const state = createGame({ seed: 4242 });
    state.players[0].controller = 'ai';
    beginPlayerTurn(state, 0);
    for (let i = 0; i < 120 && state.winner === null; i++) {
      runAiTurn(state, state.activePlayer);
      endPlayerTurn(state);
    }
    expect(AI_TUNING.rushBuying).toBe(false);
    expect(state.log.some((e) => /gold to have/.test(e.text))).toBe(false);
  });
});
