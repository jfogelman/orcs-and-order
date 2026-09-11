import { describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { deserialize, serialize } from '../src/persist/save';
import { tryStep } from '../src/sim/movement';
import { CREATURES, UNIT_TYPES } from '../src/model/units';
import { TECHS } from '../src/model/techs';
import type { City, GameState } from '../src/model/types';
import {
  BARBARIANS,
  RAIDER,
  SIGHTING,
  raidersActive,
  reportSightings,
  runRaiders,
  spawnWave,
  waveDue,
  waveSize,
} from '../src/sim/barbarians';
import { ADVISORS, advisorConcern, crises } from '../src/model/advisors';
import type { Situation } from '../src/model/advisors';
import { assignWorkers } from '../src/sim/city';
import {
  barbarianOf,
  contenders,
  createGame,
  playerUnits,
  recomputeVisibility,
  spawnUnit,
} from '../src/sim/gamestate';
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
    expect(state.log.map((e) => e.text).join(' ')).toMatch(/out of the wilds/i);
  });

  it('tells both sides, since it is nobody in particular arriving', () => {
    const state = game();
    spawnWave(state);
    const told = new Set(
      state.log.filter((e) => /out of the wilds/i.test(e.text)).map((e) => e.player),
    );
    expect(told).toEqual(new Set([0, 1]));
  });

  it('does not say where, because nobody saw it happen', () => {
    // A wave lands four tiles clear of every city, which is almost always
    // inside somebody's fog. The old message carried the spawn tile, so the
    // camera was asked to look at a place the player had never seen -- and
    // refused, leaving a warning pointing at nothing.
    const state = game();
    spawnWave(state);
    for (const entry of state.log.filter((e) => /out of the wilds/i.test(e.text))) {
      expect(entry.at, 'a rumour must not carry a position').toBeUndefined();
    }
  });
});

describe('spotting raiders, which is a different thing from them existing', () => {
  /** Put one raider where the given player can see it, and look. */
  function sight(state: GameState, viewerId: number): void {
    const me = playerUnits(state, viewerId)[0] ?? state.cities.find((c) => c.owner === viewerId)!;
    const wild = barbarianOf(state)!;
    spawnUnit(state, wild.id, RAIDER, me.x + 1, me.y, false);
    recomputeVisibility(state, viewerId);
    reportSightings(state, viewerId);
  }

  const sightings = (state: GameState, viewerId: number) =>
    state.log.filter((e) => e.player === viewerId && e.subject === SIGHTING);

  it('says nothing at all about raiders nobody can see', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    // Far side of the map from either city.
    spawnUnit(state, wild.id, RAIDER, 20, 14, false);
    recomputeVisibility(state, 0);
    reportSightings(state, 0);
    expect(sightings(state, 0)).toHaveLength(0);
  });

  it('reports one that walks into view, and says where', () => {
    const state = game();
    sight(state, 0);
    const seen = sightings(state, 0);
    expect(seen).toHaveLength(1);
    expect(seen[0].at, 'a sighting must say where, or it is not a sighting').toBeDefined();
    const [x, y] = seen[0].at!;
    expect(state.players[0].visible[y * state.width + x]).toBeGreaterThan(0);
  });

  it('does not say it again every turn the band stands there', () => {
    const state = game();
    sight(state, 0);
    reportSightings(state, 0);
    reportSightings(state, 0);
    expect(sightings(state, 0)).toHaveLength(1);
  });

  it('says it again if they go away and come back', () => {
    const state = game();
    sight(state, 0);
    const raider = playerUnits(state, barbarianOf(state)!.id)[0];

    raider.x = 20;
    raider.y = 14;
    recomputeVisibility(state, 0);
    reportSightings(state, 0);
    expect(sightings(state, 0), 'walking off is not a sighting').toHaveLength(1);

    const me = playerUnits(state, 0)[0] ?? state.cities.find((c) => c.owner === 0)!;
    raider.x = me.x + 1;
    raider.y = me.y;
    recomputeVisibility(state, 0);
    reportSightings(state, 0);
    expect(sightings(state, 0), 'coming back is a second sighting').toHaveLength(2);
  });

  it('tells only the side that saw them', () => {
    const state = game();
    sight(state, 0);
    recomputeVisibility(state, 1);
    reportSightings(state, 1);
    expect(sightings(state, 0)).toHaveLength(1);
    expect(sightings(state, 1)).toHaveLength(0);
  });

  it('keeps the remembered list the size of a war band, not of the game', () => {
    const state = game();
    sight(state, 0);
    const raider = playerUnits(state, barbarianOf(state)!.id)[0];
    raider.x = 20;
    raider.y = 14;
    recomputeVisibility(state, 0);
    reportSightings(state, 0);
    expect(state.players[0].sightedRaiders).toEqual([]);
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

describe('raiders think for themselves, which is to say barely', () => {
  it('are not handed to the empire AI once their own turn is done', () => {
    // Found while setting up the raiders-on sweep. `addRaiders` marks the band
    // `ai`, and both the game loop and the sweep hand every `ai` player to
    // `runAiTurn` -- so after `runRaiders` took its one step, the Horde's AI
    // spent the rest of their movement for them. Across four games it moved
    // them three times as often as their own brain did, and chose research for
    // them on 777 turns.
    const state = game();
    const wild = barbarianOf(state)!;
    const home = state.cities.find((c) => c.owner === 0)!;
    const raider = spawnUnit(state, wild.id, RAIDER, home.x + 6, home.y + 6, false);
    const before = { x: raider.x, y: raider.y, moves: raider.moves };

    runAiTurn(state, wild.id);

    expect({ x: raider.x, y: raider.y, moves: raider.moves }).toEqual(before);
    expect(wild.researching, 'a band that cannot study was given something to study').toBeNull();
  });
});

describe('raiders do not hold cities, whoever is steering them', () => {
  it('cannot walk onto an empty city, even when something else is moving them', () => {
    // Reported from play. Their own brain sacks instead of stepping in, but the
    // rule lived only in that brain; the empire AI walked them into cities.
    const state = game();
    const wild = barbarianOf(state)!;
    const city = state.cities.find((c) => c.owner === 0)!;
    const raider = spawnUnit(state, wild.id, RAIDER, city.x + 1, city.y, false);

    const outcome = tryStep(state, raider, city.x, city.y);

    expect(outcome.kind).toBe('blocked');
    expect(city.owner).toBe(0);
    expect([raider.x, raider.y]).toEqual([city.x + 1, city.y]);
  });

  it('gives a city back to whoever founded it when a save has raiders holding it', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const city = state.cities.find((c) => c.owner === 0)!;
    city.foundedBy = 0;
    city.owner = wild.id;

    const loaded = deserialize(serialize(state));

    expect(loaded.cities.find((c) => c.id === city.id)?.owner).toBe(0);
  });

  it('abandons one with nobody to give it back to, rather than leave a raider camp', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const city = state.cities.find((c) => c.owner === 1)!;
    city.foundedBy = undefined;
    city.owner = wild.id;

    const loaded = deserialize(serialize(state));

    expect(loaded.cities.some((c) => c.id === city.id)).toBe(false);
    expect(loaded.cities.some((c) => loaded.players[c.owner]?.barbarian)).toBe(false);
  });
});
