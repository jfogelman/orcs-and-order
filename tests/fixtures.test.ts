import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { City, GameState, Unit, UnitTypeId } from '../src/model/types';
import { FACTIONS } from '../src/model/factions';
import { assignWorkers } from '../src/sim/city';
import { createGame, playerCities, playerUnits, spawnUnit } from '../src/sim/gamestate';
import { deserialize, serialize } from '../src/persist/save';
import { playGame } from '../tools/sweep';

/**
 * Saved games that put the interface straight into a state worth looking at.
 *
 * Reaching some of these by playing is the problem: a unit promoted out of a
 * barracks is twenty turns in, so a bug that only shows up there gets reported
 * from a real game and then reproduced by hand, badly, or not at all. Each
 * scenario here lands on the situation in one load.
 *
 * Written as a test because a fixture nobody checks rots. Every one is
 * round-tripped through the real save format and then asserted to still be the
 * situation it claims to be, so a rules change that invalidates a scenario
 * fails here rather than producing a save that quietly loads into something
 * else.
 *
 * Load one with Save and load (Ctrl+S) and the Upload button.
 */

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** A fixed stamp, so regenerating does not churn the files in git. */
const SAVED_AT = '2026-01-01T00:00:00.000Z';

function write(name: string, state: GameState): void {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const file = JSON.parse(serialize(state)) as Record<string, unknown>;
  file.savedAt = SAVED_AT;
  writeFileSync(join(OUT, `${name}.w2c`), `${JSON.stringify(file)}\n`, 'utf8');
}

/**
 * A young game with one city on the board, ready to be bent into whatever the
 * scenario needs.
 *
 * The city is placed on a starting settler rather than walked to a good spot,
 * because where it sits matters to none of these and pathing there costs turns.
 */
function opening(seed: number): { state: GameState; city: City } {
  const state = createGame({ seed, width: 40, height: 30, maxTurns: 300 });
  state.turn = 12;
  const settlerType = FACTIONS[state.players[0].faction].settlerUnit;
  const settler = playerUnits(state, 0).find((u) => u.type === settlerType);
  if (!settler) throw new Error('no settler in the starting forces');
  const city: City = {
    id: state.nextCityId++,
    owner: 0,
    name: 'Fixture Hold',
    x: settler.x,
    y: settler.y,
    size: 4,
    food: 0,
    shields: 0,
    buildings: [],
    producing: { kind: 'coin' },
    workedTiles: [],
    disorder: false,
    foundedTurn: 2,
  };
  state.cities.push(city);
  state.units = state.units.filter((u) => u.id !== settler.id);
  assignWorkers(state, city);
  state.players[0].gold = 200;
  return { state, city };
}

/** Something standing in the city, for a scenario that is about one unit. */
function garrison(state: GameState, city: City): Unit {
  const type = FACTIONS[state.players[0].faction].starterUnit as UnitTypeId;
  return spawnUnit(state, 0, type, city.x, city.y);
}

/**
 * Real late games, played out rather than assembled.
 *
 * The hand-built openings above are fine for a question about one rule, and
 * useless for anything about the endgame: an empire at turn 269 has grown,
 * fought, built and lost things, and none of that can be faked by placing a
 * city and setting `turn`. Three separate throwaway saves were cut from a
 * player's own file during one session for want of these.
 *
 * One game, two snapshots, because playing it twice would cost twice as much
 * and give the same answer. Seed 22 was picked by scouting: most games end in
 * conquest well before the deadline, and this one has both sides alive at 299.
 */
const LATE_SEED = 22;

function lateSnapshots(): Map<number, GameState> {
  const want = [200, 269, 299];
  const found = new Map<number, GameState>();
  playGame(LATE_SEED, 620, (state) => {
    for (const turn of want) {
      if (state.turn >= turn && !found.has(turn)) {
        const snap = structuredClone(state);
        // `playGame` drives both sides, so the state it hands back has the
        // player's own seat set to `ai`. Saved like that, End Turn runs the
        // whole rest of the game by itself -- 269 straight to 301 on the first
        // click, which is how this was found.
        snap.players[0].controller = 'human';
        found.set(turn, snap);
      }
    }
  });
  return found;
}

interface Scenario {
  name: string;
  /** What it is for. Repeated into the fixture list. */
  about: string;
  build: () => GameState;
  /** What has to still be true after a save and a load. */
  check: (state: GameState) => void;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'owed-one-perk',
    about: 'A promoted unit that has not chosen a perk. Ending the turn asks what it has learned.',
    build: () => {
      const { state, city } = opening(4001);
      const unit = garrison(state, city);
      unit.rank = 1;
      unit.perks = [];
      return state;
    },
    check: (state) => {
      const unit = playerUnits(state, 0).find((u) => u.rank === 1);
      expect(unit).toBeDefined();
      expect(unit?.perks ?? []).toHaveLength(0);
    },
  },
  {
    name: 'owed-two-perks',
    about: 'A twice-promoted unit owed two choices, asked one after the other.',
    build: () => {
      const { state, city } = opening(4002);
      const unit = garrison(state, city);
      unit.rank = 2;
      unit.perks = [];
      return state;
    },
    check: (state) => {
      const unit = playerUnits(state, 0).find((u) => u.rank === 2);
      expect(unit).toBeDefined();
      expect(unit?.perks ?? []).toHaveLength(0);
    },
  },
  {
    name: 'barracks-promotion',
    about:
      'A barracks a turn from finishing a unit. What it builds arrives already promoted, so the ' +
      'question comes through the end-of-turn chain rather than from a fight.',
    build: () => {
      const { state, city } = opening(4003);
      city.buildings = ['barracks'];
      city.size = 6;
      city.producing = { kind: 'unit', id: FACTIONS[state.players[0].faction].starterUnit as UnitTypeId };
      // Paid for several times over, so one End Turn finishes it whatever the
      // tiles around this particular seed happen to yield.
      city.shields = 400;
      assignWorkers(state, city);
      return state;
    },
    check: (state) => {
      const city = playerCities(state, 0)[0];
      expect(city.buildings).toContain('barracks');
      expect(city.producing.kind).toBe('unit');
      expect(city.shields).toBeGreaterThan(0);
    },
  },
  {
    name: 'city-asks-what-to-build',
    about:
      'A city set to ask, banking shields with nothing on order. Ending the turn opens its panel ' +
      'with the build list live.',
    build: () => {
      const { state, city } = opening(4004);
      city.autoBuild = 'ask';
      city.producing = { kind: 'coin' };
      city.size = 5;
      city.shields = 30;
      assignWorkers(state, city);
      return state;
    },
    check: (state) => {
      const city = playerCities(state, 0)[0];
      expect(city.producing.kind).toBe('coin');
      expect(city.autoBuild ?? 'ask').toBe('ask');
      expect(city.size).toBeGreaterThan(0);
    },
  },
  {
    name: 'rioting-city',
    about: 'A large city in disorder with nothing calming it, for the unrest overlay and advisors.',
    build: () => {
      const { state, city } = opening(4005);
      city.size = 9;
      city.disorder = true;
      city.buildings = [];
      assignWorkers(state, city);
      return state;
    },
    check: (state) => {
      const city = playerCities(state, 0)[0];
      expect(city.disorder).toBe(true);
      expect(city.size).toBeGreaterThanOrEqual(7);
    },
  },
  {
    name: 'rich-and-idle',
    about: 'Gold to burn and something part-built, for rush buying and the treasury.',
    build: () => {
      const { state, city } = opening(4006);
      state.players[0].gold = 2000;
      city.size = 6;
      city.producing = { kind: 'building', id: 'granary' };
      city.shields = 10;
      assignWorkers(state, city);
      return state;
    },
    check: (state) => {
      expect(state.players[0].gold).toBeGreaterThan(1000);
      expect(playerCities(state, 0)[0].producing.kind).toBe('building');
    },
  },
];

/**
 * The late-game set, described the same way but built from one played game.
 *
 * `at` is the turn to snapshot; the state is otherwise untouched, so these are
 * a real board rather than a constructed one.
 */
const LATE: { name: string; about: string; at: number; check: (s: GameState) => void }[] = [
  {
    name: 'late-game',
    about: 'Turn 200 of a real game, both sides alive, empires grown and fighting.',
    at: 200,
    check: (state) => {
      expect(state.turn).toBeGreaterThanOrEqual(200);
      expect(state.players.every((p) => p.alive)).toBe(true);
      expect(playerCities(state, 0).length).toBeGreaterThan(0);
      expect(playerCities(state, 1).length).toBeGreaterThan(0);
    },
  },
  {
    name: 'deadline-in-thirty',
    about:
      'Turn 269 of 300. Ending one turn crosses the thirty-turn mark, so this is the ' +
      'save for anything about the deadline warning or the advisors noticing it.',
    at: 269,
    check: (state) => {
      expect(state.turn).toBe(269);
      // The seat has to be the player's, or End Turn plays the game for them.
      expect(state.players[0].controller).toBe('human');
      expect(state.settings.maxTurns - state.turn).toBe(31);
      expect(state.players.every((p) => p.alive)).toBe(true);
    },
  },
  {
    name: 'about-to-end-on-points',
    about:
      'Turn 299 of 300 with both sides alive, so ending a turn decides it on points ' +
      'rather than conquest. The save for the victory screen and for carrying on.',
    at: 299,
    check: (state) => {
      expect(state.turn).toBe(299);
      expect(state.players.every((p) => p.alive)).toBe(true);
      // Both still standing is the whole point: a conquest ending is a
      // different screen and is reachable from almost any save.
      expect(playerCities(state, 0).length).toBeGreaterThan(0);
      expect(playerCities(state, 1).length).toBeGreaterThan(0);
    },
  },
];

describe('saved games for reproducing interface bugs', () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.name}: ${scenario.about}`, () => {
      const state = scenario.build();
      // True of the state that comes back out of a save, not merely of the one
      // that went in.
      scenario.check(deserialize(serialize(state)));
      write(scenario.name, state);
    });
  }

  it('plays one real game and keeps three late positions from it', () => {
    const snaps = lateSnapshots();
    for (const scenario of LATE) {
      const state = snaps.get(scenario.at);
      expect(state, `seed ${LATE_SEED} never reached turn ${scenario.at}`).toBeDefined();
      scenario.check(deserialize(serialize(state!)));
      write(scenario.name, state!);
    }
  }, 120_000);

  it('lists what each one is for', () => {
    const lines = [
      '# Fixture saves',
      '',
      'Generated by `tests/fixtures.test.ts`, which runs with the suite. Load one',
      'through Save and load (Ctrl+S), then Upload.',
      '',
      ...SCENARIOS.map((s) => `- **${s.name}.w2c** — ${s.about}`),
      ...LATE.map((s) => `- **${s.name}.w2c** — ${s.about}`),
      '',
    ];
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'README.md'), lines.join('\n'), 'utf8');
    expect(SCENARIOS.length).toBeGreaterThan(0);
  });
});
