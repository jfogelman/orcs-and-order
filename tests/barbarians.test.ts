import { describe, expect, it } from 'vitest';
import { CREATURES, UNIT_TYPES } from '../src/model/units';
import { TECHS } from '../src/model/techs';
import type { City, GameState } from '../src/model/types';
import {
  BARBARIANS,
  RAIDER,
  raidersActive,
  runRaiders,
  spawnWave,
  waveDue,
  waveSize,
} from '../src/sim/barbarians';
import { ADVISORS, advisorConcern, crises } from '../src/model/advisors';
import type { Situation } from '../src/model/advisors';
import { assignWorkers } from '../src/sim/city';
import { barbarianOf, contenders, createGame, playerUnits, spawnUnit } from '../src/sim/gamestate';
import { endPlayerTurn, isOver, playerScore } from '../src/sim/turn';

function game(over: { barbarians?: boolean; turn?: number } = {}): GameState {
  const state = createGame({
    seed: 20260913,
    width: 40,
    height: 30,
    barbarians: over.barbarians ?? true,
  });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const [i, at] of [[5, 5], [30, 22]].entries()) {
    const c: City = {
      id: i + 1, owner: i, name: `Place ${i}`, x: at[0], y: at[1], size: 4,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1,
    };
    state.cities.push(c);
    assignWorkers(state, c);
  }
  state.turn = over.turn ?? BARBARIANS.notBefore;
  state.log.length = 0;
  return state;
}

/**
 * Section 69 is emphatic about the thing to say out loud first: a third actor
 * is not a new unit type, it is a change to what a game *is*. Every measurement
 * in this project counts wins as orc-against-human across exactly two sides.
 *
 * So a raiding band holds a `Player` slot -- units are owned by index and the
 * whole game assumes that -- and is deliberately not a **contender**.
 */
describe('raiders are not a third empire', () => {
  it('is off unless a game asks for it', () => {
    const quiet = game({ barbarians: false });
    expect(raidersActive(quiet)).toBe(false);
    expect(barbarianOf(quiet)).toBeNull();
    expect(quiet.players).toHaveLength(2);
  });

  it('holds a player slot but is not a contender', () => {
    const state = game();
    const wild = barbarianOf(state);
    expect(wild).not.toBeNull();
    expect(state.players).toHaveLength(3);
    expect(contenders(state).map((p) => p.id)).toEqual([0, 1]);
  });

  it('cannot win by outlasting everybody', () => {
    const state = game();
    // Wipe out one empire. Conquest should go to the other, not be confused by
    // a third thing still standing on the map.
    state.cities = state.cities.filter((c) => c.owner !== 1);
    spawnUnit(state, barbarianOf(state)!.id, RAIDER, 20, 20, false);
    for (let i = 0; i < state.players.length; i++) endPlayerTurn(state);

    expect(isOver(state)).toBe(true);
    expect(state.winner).toBe(0);
    expect(state.victory).toBe('conquest');
  });

  it('is not scored, so it cannot be ahead on points', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    for (let i = 0; i < 4; i++) spawnUnit(state, wild.id, RAIDER, 18 + i, 18, false);
    // Nothing it owns is worth anything: it holds no cities and knows nothing.
    expect(playerScore(state, wild.id)).toBe(0);
  });

  it('never turns up in the count of who is left', () => {
    const state = game();
    // Both empires alive and a band on the map is still a two-sided game.
    for (let i = 0; i < state.players.length; i++) endPlayerTurn(state);
    expect(isOver(state)).toBe(false);
  });
});

describe('waves, and what makes them bigger', () => {
  it('sends nobody before the game has started properly', () => {
    // A wave at turn three is a coin flip about who happened to start near it.
    expect(waveDue(game({ turn: BARBARIANS.notBefore - 1 }))).toBe(false);
    expect(waveDue(game({ turn: BARBARIANS.notBefore }))).toBe(true);
  });

  it('sends nobody at all in a game without them', () => {
    expect(waveDue(game({ barbarians: false }))).toBe(false);
    expect(spawnWave(game({ barbarians: false }))).toEqual([]);
  });

  it('grows with what the two empires know, not with the clock', () => {
    const early = game();
    const small = waveSize(early);

    const later = game();
    for (const p of contenders(later)) p.techs = TECHS.slice(0, 20).map((t) => t.id);

    expect(waveSize(later)).toBeGreaterThan(small);
  });

  it('averages the two, so beating the other side does not summon a horde', () => {
    const lopsided = game();
    lopsided.players[0].techs = TECHS.slice(0, 30).map((t) => t.id);

    const even = game();
    for (const p of contenders(even)) p.techs = TECHS.slice(0, 15).map((t) => t.id);

    // The same advances between them, spread differently. Being the one who is
    // ahead should not be the thing that makes it worse.
    expect(waveSize(lopsided)).toBe(waveSize(even));
  });

  it('stays something you can meet, however well the game goes', () => {
    const runaway = game();
    for (const p of contenders(runaway)) p.techs = TECHS.map((t) => t.id);
    expect(waveSize(runaway)).toBeLessThanOrEqual(BARBARIANS.cap);
  });

  it('lands well clear of anybody city, and says so', () => {
    const state = game();
    const born = spawnWave(state);
    expect(born.length).toBeGreaterThan(0);
    for (const raider of born) {
      for (const c of state.cities) {
        const away = Math.max(Math.abs(c.x - raider.x), Math.abs(c.y - raider.y));
        expect(away, 'a wave landed on somebody doorstep').toBeGreaterThanOrEqual(
          BARBARIANS.clearOfCities - 1,
        );
      }
    }
    expect(state.log.map((e) => e.text).join(' ')).toMatch(/raiders out of the wilds/i);
  });

  it('tells both sides, since it is nobody in particular arriving', () => {
    const state = game();
    spawnWave(state);
    const told = new Set(state.log.filter((e) => /raiders/i.test(e.text)).map((e) => e.player));
    expect(told).toEqual(new Set([0, 1]));
  });
});

describe('what a raiding party does', () => {
  it('walks at the nearest thing that is not theirs', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const raider = spawnUnit(state, wild.id, RAIDER, 15, 15, false);
    const before = Math.max(Math.abs(raider.x - 5), Math.abs(raider.y - 5));

    runRaiders(state, wild.id);

    const after = Math.max(Math.abs(raider.x - 5), Math.abs(raider.y - 5));
    expect(after).toBeLessThan(before);
  });

  it('sacks an undefended city rather than walking past it', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const city = state.cities[0];
    city.buildings = ['granary', 'walls'];
    spawnUnit(state, wild.id, RAIDER, city.x + 1, city.y, false);

    runRaiders(state, wild.id);

    // A band at an open gate that did nothing would not be a raid.
    expect(city.buildings).not.toContain('granary');
    // The walls stay, as they do on a capture: hand-sharpened spears do not
    // level a wall.
    expect(city.buildings).toContain('walls');
    expect(city.owner).toBe(0);
    expect(state.log.map((e) => e.text).join(' ')).toMatch(/raiders are in/i);
  });

  it('takes people only when there is nothing left to break', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const city = state.cities[0];
    city.buildings = [];
    const before = city.size;
    spawnUnit(state, wild.id, RAIDER, city.x + 1, city.y, false);

    runRaiders(state, wild.id);

    expect(city.size).toBeLessThan(before);
    expect(state.log.map((e) => e.text).join(' ')).toMatch(/took people/i);
  });

  it('never takes the last citizen, however often they come', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const city = state.cities[0];
    city.buildings = [];
    city.size = 1;
    spawnUnit(state, wild.id, RAIDER, city.x + 1, city.y, false);

    for (let visit = 0; visit < 5; visit++) {
      for (const u of playerUnits(state, wild.id)) u.moves = 3;
      runRaiders(state, wild.id);
    }

    // A thing with no plan should not be able to decide the game by erasing
    // somebody, which is what removing the last citizen would do.
    expect(city.size).toBe(1);
    expect(state.cities).toContain(city);
  });

  it('does not take cities, whatever it is standing next to', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const city = state.cities[0];
    spawnUnit(state, wild.id, RAIDER, city.x + 1, city.y, false);

    for (let turn = 0; turn < 6; turn++) {
      for (const p of state.players) p.alive && runRaiders(state, p.id);
      for (const u of playerUnits(state, wild.id)) u.moves = 3;
    }

    // The whole of section 69's cheapest version: they pressure the edges and
    // change no win condition.
    expect(city.owner).toBe(0);
    expect(state.cities.every((c) => c.owner !== wild.id)).toBe(true);
  });
});

describe('the raider itself', () => {
  it('belongs to no roster and no advance unlocks it', () => {
    const raider = CREATURES.find((c) => c.id === RAIDER)!;
    expect(raider.wild).toBe(true);
    // Nobody can build one: it is on no advance anywhere.
    expect(TECHS.some((t) => t.units.includes(RAIDER))).toBe(false);
  });

  it('loses to one garrisoned unit most of the time, which is the teaching moment', () => {
    // The bible's grunt: low individual threat, dangerous in numbers.
    const raider = UNIT_TYPES[RAIDER];
    const footman = UNIT_TYPES.footman;
    expect(raider.attack).toBeLessThanOrEqual(footman.attack);
    expect(raider.hp).toBeLessThan(footman.hp);
  });

  it('is fast, so an undefended border gets found', () => {
    expect(UNIT_TYPES[RAIDER].move).toBeGreaterThan(UNIT_TYPES.footman.move);
  });
});

/**
 * The council notices them, and says the useful part: they are not us.
 *
 * Reported as the shape the line should take. A raid is a military problem and
 * the military advisor owns the topic, so a crisis about raiders puts the
 * soldier on it rather than whoever happens to be first in the list.
 */
describe('what the council makes of raiders', () => {
  const base = (over: Partial<Situation>): Situation =>
    ({
      turn: 40, faction: 'orc', deadline: null, raiders: null, cities: 4, rioting: 0,
      restless: 0, starving: 0, gold: 200, goldPerTurn: 5, beakersPerTurn: 5,
      rates: { coin: 4, beakers: 4, calm: 4 }, researching: 'Axes', undefended: 0,
      enemiesSeen: 0, army: 4, magicUnits: 0, rankAndFile: 2, paladins: 0, walled: 0,
      wallsAvailable: false, barracks: 1, coinBuildings: 1, calmBuildings: 1,
      calmAvailable: true, calmNeedsAdvance: null, dominance: null,
      ...over,
    }) as Situation;

  const soldier = ADVISORS.find((a) => a.faction === 'orc' && a.role === 'military')!;

  it('says nothing at all in a game without raiders', () => {
    const s = base({ raiders: null });
    expect(advisorConcern(soldier, s)?.about).not.toBe('raiders');
    expect(crises(s).map((c) => c.id)).not.toContain('raiders');
  });

  it('says nothing about raiders nobody has seen', () => {
    // A wave lands clear of anybody city, which means it lands in fog. The
    // Blademaster reporting a sighting he has not had would be worse than
    // silence.
    const s = base({ raiders: { seen: 0, atTheGate: false } });
    expect(advisorConcern(soldier, s)?.about).not.toBe('raiders');
  });

  it('reports them the moment one is spotted', () => {
    const s = base({ raiders: { seen: 3, atTheGate: false } });
    const said = advisorConcern(soldier, s);
    expect(said?.about).toBe('raiders');
    expect(said?.say(s)).toMatch(/they ain't us/i);
  });

  it('interrupts only once one is at the door', () => {
    // Seen is a thing to mention. Standing next to something of ours is a thing
    // to be interrupted for.
    expect(crises(base({ raiders: { seen: 4, atTheGate: false } })).map((c) => c.id))
      .not.toContain('raiders');
    expect(crises(base({ raiders: { seen: 4, atTheGate: true } })).map((c) => c.id))
      .toContain('raiders');
  });
});
