import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import {
  CARAVANS,
  advanceCaravanWork,
  canBuildCaravan,
  caravansOf,
  hasCaravan,
  startCaravan,
  withinAsking,
} from '../src/sim/caravans';
import { canPillage, pillage } from '../src/sim/roads';
import { RECRUIT, recruitFailOdds, recruitUnit } from '../src/sim/recruiting';
import { buildOptions, foundCity } from '../src/sim/city';
import { TERRAIN, TERRAIN_IDS } from '../src/model/terrain';
import { fatCrossIndices, idx } from '../src/engine/grid';
import type { FactionId, GameState, Unit } from '../src/model/types';
import { FACTION_IDS, FACTIONS } from '../src/model/factions';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS } from '../src/model/techs';
import { unlockedUnits } from '../src/sim/research';
import { endingFor, isEndingPiece } from '../src/sim/endings';

/**
 * Section 145. The Caravan: somewhere to ask from.
 *
 * The Wandering Folk's signature structure, and the thing `caravan-building`
 * was held back for in section 142 -- the advance was written with
 * `buildings: ['caravan']` and there was no such building, because the Caravan
 * is a terrain improvement and the draft tech entry was a slip.
 */
let state: GameState;

/**
 * A patch of ground a Caravan is actually allowed to stand on.
 *
 * Picked off the map rather than written down. The first draft of this file
 * hard-coded (10, 10) and (5, 5), and seed 7 puts water on both -- six tests
 * failed saying the advance did not work, when what had happened is that the
 * worker was standing in the sea.
 */
function land(nth = 0): { x: number; y: number } {
  let seen = 0;
  for (let y = 2; y < state.height - 2; y++) {
    for (let x = 2; x < state.width - 2; x++) {
      if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
      if (state.cities.some((c) => Math.abs(c.x - x) < 3 && Math.abs(c.y - y) < 3)) continue;
      if (seen++ === nth) return { x, y };
    }
  }
  throw new Error('no dry ground on this map');
}

function wanderer(at = land()): Unit {
  return spawnUnit(state, 0, 'peon', at.x, at.y);
}

/** A standing Caravan at `at`, built the long way so nothing is faked. */
function caravanAt(at: { x: number; y: number }): void {
  const w = wanderer(at);
  startCaravan(state, w);
  for (let t = 0; t < CARAVANS.turns; t++) advanceCaravanWork(state, w);
  state.units = state.units.filter((u) => u !== w);
}

beforeEach(() => {
  state = createGame({ seed: 7, width: 30, height: 20 });
  state.players[0].faction = 'wandering';
  state.players[0].techs = ['first-wanderers', 'caravan-building'];
  state.players[0].gold = 5000;
});

describe('raising a Caravan', () => {
  it('needs the advance', () => {
    const u = wanderer();
    state.players[0].techs = ['first-wanderers'];
    expect(canBuildCaravan(state, u).ok).toBe(false);
    state.players[0].techs = ['first-wanderers', 'caravan-building'];
    expect(canBuildCaravan(state, u).ok).toBe(true);
  });

  /**
   * The gate is on the faction as well as the advance, because an advance can
   * change hands -- section 136's espionage steals them -- and a Horde peon who
   * has somehow learned Somewhere To Ask From still has nobody to ask for it.
   */
  it('is refused to anybody but the Wandering Folk, advance or no advance', () => {
    const u = wanderer();
    state.players[0].faction = 'orc';
    const check = canBuildCaravan(state, u);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/Wandering Folk/);
  });

  it('is refused to a soldier', () => {
    const soldier = spawnUnit(state, 0, 'goblin', land(1).x, land(1).y);
    expect(canBuildCaravan(state, soldier).ok).toBe(false);
  });

  it('takes its full count of worker-turns and then stands', () => {
    const u = wanderer();
    expect(startCaravan(state, u)).toBe(true);
    expect(u.order).toBe('caravan');
    expect(u.work).toBe(CARAVANS.turns);
    for (let t = 1; t < CARAVANS.turns; t++) {
      expect(advanceCaravanWork(state, u)).toBe('working');
      expect(hasCaravan(state, u.x, u.y), `done early on turn ${t}`).toBe(false);
    }
    expect(advanceCaravanWork(state, u)).toBe('done');
    expect(hasCaravan(state, u.x, u.y)).toBe(true);
    // And the worker is free again rather than left hammering.
    expect(u.order).toBe('none');
    expect(u.work).toBeUndefined();
  });

  it('will not stack two on one tile', () => {
    const u = wanderer();
    startCaravan(state, u);
    for (let t = 0; t < CARAVANS.turns; t++) advanceCaravanWork(state, u);
    expect(canBuildCaravan(state, u).ok).toBe(false);
  });

  it('frees a worker whose ground stopped being legal', () => {
    const u = wanderer();
    startCaravan(state, u);
    advanceCaravanWork(state, u);
    // Somebody founds a city on the spot mid-build.
    foundCity(state, spawnUnit(state, 0, 'peon', u.x, u.y));
    expect(advanceCaravanWork(state, u)).toBe('stopped');
    expect(u.order).toBe('none');
    expect(u.work).toBeUndefined();
  });

  it('will not go on water', () => {
    const u = wanderer();
    expect(canBuildCaravan(state, u).ok).toBe(true);
    // Whichever terrain the table says is wet, rather than one named here:
    // the map's grounds have changed twice and a hard-coded 'ocean' would be
    // the kind of thing that quietly stops testing anything.
    const sea = TERRAIN_IDS.find((t) => TERRAIN[t].water);
    expect(sea).toBeTruthy();
    state.terrain[idx(u.x, u.y, state.width)] = sea!;
    expect(canBuildCaravan(state, u).ok).toBe(false);
  });
});

/**
 * Jeremy's ruling on the question `WANDERERS_PLAN.md` left open -- *"Can a
 * Caravan be destroyed or captured the way a fort or watchtower presumably
 * can? Assumed yes, not confirmed."* -- is that it is **pillaged, like a
 * post**. So a forward Caravan is a real risk, and it needed no new mechanism
 * to be one.
 */
describe('tearing a Caravan down', () => {
  function standing(): Unit {
    const u = wanderer();
    startCaravan(state, u);
    for (let t = 0; t < CARAVANS.turns; t++) advanceCaravanWork(state, u);
    return u;
  }

  it('is something an enemy soldier standing on it can do', () => {
    const u = standing();
    const raider = spawnUnit(state, 1, 'footman', u.x, u.y);
    expect(canPillage(state, raider).ok).toBe(true);
    expect(pillage(state, raider)).toBe(true);
    expect(hasCaravan(state, u.x, u.y)).toBe(false);
  });

  it('is named in the log, so nobody has to guess what was lost', () => {
    const u = standing();
    // The pillage log is written only for players who can see the tile, which
    // is the rule and not an oversight -- so the side that owns the Caravan is
    // given sight of its own Caravan before anybody tears it down.
    state.players[0].visible[idx(u.x, u.y, state.width)] = 1;
    const before = state.log.length;
    pillage(state, spawnUnit(state, 1, 'footman', u.x, u.y));
    const said = state.log.slice(before).map((e) => e.text).join(' ');
    expect(said).toMatch(/Caravan/);
  });

  it('is not something a tile with nothing on it offers', () => {
    const raider = spawnUnit(state, 1, 'footman', 20, 15);
    expect(canPillage(state, raider).ok).toBe(false);
  });
});

/**
 * The recruitment radius: *"any enemy or neutral unit within a Caravan's
 * sight-line is a valid recruit target"*. This is the geometry half; what it
 * is for lives in the Recruit slice.
 */
describe('how far a Caravan can ask', () => {
  function standing(x: number, y: number): void {
    const u = spawnUnit(state, 0, 'peon', x, y);
    startCaravan(state, u);
    for (let t = 0; t < CARAVANS.turns; t++) advanceCaravanWork(state, u);
  }

  it('reaches exactly its own sight and no further', () => {
    const { x, y } = land();
    standing(x, y);
    expect(withinAsking(state, 0, x, y)).toBe(true);
    expect(withinAsking(state, 0, x + CARAVANS.sight, y)).toBe(true);
    expect(withinAsking(state, 0, x + CARAVANS.sight + 1, y)).toBe(false);
    // Diagonals count as one step, the way every other range in this game does.
    expect(withinAsking(state, 0, x + CARAVANS.sight, y + CARAVANS.sight)).toBe(true);
  });

  it('answers for every Caravan the side holds, not just the first', () => {
    const a = land(0);
    const b = land(40);
    standing(a.x, a.y);
    standing(b.x, b.y);
    expect(caravansOf(state, 0)).toHaveLength(2);
    expect(withinAsking(state, 0, b.x, b.y)).toBe(true);
  });

  /**
   * `state.caravans` stores no owner, exactly as the posts and roads layers
   * store none, because only one side in the game can use one at all. That
   * makes "whose Caravan is this" a question about the faction rather than
   * about the tile -- and this is the test that says so out loud.
   */
  it('belongs to nobody who is not the Wandering Folk', () => {
    const { x, y } = land();
    standing(x, y);
    expect(caravansOf(state, 0)).toHaveLength(1);
    expect(caravansOf(state, 1)).toHaveLength(0);
    expect(withinAsking(state, 1, x, y)).toBe(false);
  });
});

/**
 * Section 146: the fourth road out.
 *
 * The Wandering Folk were the only side with no ending at all --
 * `EndingKind` read `'portal' | 'object' | 'hive'` and they were not in it,
 * so a game played as them could be won only by conquest, dominance or
 * points. Every other faction has a thing to build.
 */
describe('the Circling Caravan', () => {
  it('gives the Wandering Folk a road out like everybody else', () => {
    for (const faction of FACTION_IDS) {
      expect(endingFor(faction), `${faction} has nothing to build towards`).not.toBeNull();
    }
    expect(endingFor('wandering')).toBe('circle');
  });

  it('is three works, two lesser and one that ends it', () => {
    const theirs = Object.values(BUILDINGS).filter(
      (b) => b.faction === 'wandering' && isEndingPiece(b),
    );
    expect(theirs).toHaveLength(3);
    expect(theirs.filter((b) => b.victory)).toHaveLength(1);
    expect(theirs.filter((b) => b.endingPart && !b.victory)).toHaveLength(2);
  });

  /**
   * The bible's costs, and the one place this faction's premium is written
   * into the works rather than the units: a thousand shields against the
   * Hive's six hundred.
   */
  it('costs what the bible says, which is an empire price', () => {
    expect(BUILDINGS.lastMap.cost).toBe(300);
    expect(BUILDINGS.standingOrder.cost).toBe(300);
    expect(BUILDINGS.circlingCaravan.cost).toBe(400);
  });

  it('is unlocked by one advance that grants all three', () => {
    const tech = TECHS.find((t) => t.id === 'nowhere-left-but-up');
    expect(tech).toBeTruthy();
    expect(tech!.buildings.sort()).toEqual(
      ['circlingCaravan', 'lastMap', 'standingOrder'].sort(),
    );
  });

  /**
   * One type since section 146, after this union had been written out by hand
   * in four places across three files. The next faction's road should be one
   * edit, not four compile errors somebody has to go and find.
   */
  it('names every road out exactly once', () => {
    const roads = new Set(
      Object.values(BUILDINGS)
        .map((b) => b.victory)
        .filter((v): v is NonNullable<typeof v> => !!v),
    );
    expect(roads.size).toBe(FACTION_IDS.length);
  });
});

/**
 * Section 146: the three Follies, and what they are all about.
 *
 * The bible resolves its own open question -- a Create discount or a Recruit
 * boost -- in favour of Recruit, *"since that's the half of the faction's
 * whole identity this building's flavor is actually about"*. All three touch
 * what arrives rather than what is built.
 */
describe('the Wandering Folk follies', () => {
  it('is one civ-wide and two city-wide, each on its own advance', () => {
    const theirs = Object.values(BUILDINGS).filter((b) => b.folly && b.faction === 'wandering');
    expect(theirs).toHaveLength(3);
    for (const b of theirs) {
      expect(TECHS.filter((t) => t.buildings.includes(b.id)), b.id).toHaveLength(1);
    }
  });

  it('makes the First Caravan improve the odds everywhere, not in one town', () => {
    const here = land();
    caravanAt(here);
    const them = spawnUnit(state, 1, 'footman', here.x, here.y + 1);
    const before = recruitFailOdds(state, 0, them);
    const city = foundCity(state, spawnUnit(state, 0, 'peon', land(30).x, land(30).y))!;
    city.buildings.push('firstCaravan');
    const after = recruitFailOdds(state, 0, them);
    // A town on the far side of the map, and the odds still move: that is
    // what civ-wide means, and it is the thing a city-scoped reading would
    // have got wrong.
    expect(after).toBeLessThan(before);
    expect(before - after).toBeCloseTo(BUILDINGS.firstCaravan.recruitOdds!, 5);
  });

  /**
   * *"Units trained or Recruited in this settlement start at +1 experience
   * level."* A recruit is not made in a settlement at all -- it is made where
   * it was standing. The honest reading for something a Caravan does is the
   * land that settlement works.
   */
  it('makes the Head Count reach the recruits its town can see', () => {
    const here = land();
    caravanAt(here);
    const them = spawnUnit(state, 1, 'footman', here.x, here.y + 1);
    // **One tile over, not two.** A city's land is the fat cross -- the 5x5
    // minus its four far corners -- so a Caravan at offset (-2, -2) is a
    // corner and is *outside* the town's land. The first draft of this test
    // put the city there and failed, which is the rule working rather than
    // the folly being broken.
    const city = foundCity(state, spawnUnit(state, 0, 'peon', here.x + 1, here.y))!;
    expect(
      fatCrossIndices(city.x, city.y, state.width, state.height),
      'the Caravan has to be on this town land for the folly to reach it',
    ).toContain(idx(here.x, here.y, state.width));
    city.buildings.push('headCount');
    const was = RECRUIT.failBase;
    const wasFloor = RECRUIT.failFloor;
    RECRUIT.failBase = 0;
    RECRUIT.failFloor = 0;
    try {
      expect(recruitUnit(state, 0, them).kind).toBe('joined');
      expect(them.rank).toBe(1);
    } finally {
      RECRUIT.failBase = was;
      RECRUIT.failFloor = wasFloor;
    }
  });

  it('leaves recruits alone where no town of ours is watching', () => {
    const here = land(60);
    caravanAt(here);
    const them = spawnUnit(state, 1, 'footman', here.x, here.y + 1);
    const was = RECRUIT.failBase;
    const wasFloor = RECRUIT.failFloor;
    RECRUIT.failBase = 0;
    RECRUIT.failFloor = 0;
    try {
      expect(recruitUnit(state, 0, them).kind).toBe('joined');
      expect(them.rank).toBe(0);
    } finally {
      RECRUIT.failBase = was;
      RECRUIT.failFloor = wasFloor;
    }
  });
});

/**
 * Section 148: every side can build something on turn one.
 *
 * **The third time this exact gap has shipped.** Section 136 found it for the
 * Hivekin -- *"turn one offered a choice between a Grub it could not afford
 * and research"* -- and left a note on `first-hivekin` saying every side opens
 * with a settler *and* something that can hold a tile. Section 142 then wrote
 * `first-wanderers` straight out of the bible, which grants the Wanderer
 * alone, and the note was not read.
 *
 * What a player saw: a first town with an **empty Units list**, and a
 * production box already set to a Skirmisher they could not have chosen,
 * because `FACTIONS.wandering.starterUnit` names one and nothing checks that
 * the start advance unlocks it.
 *
 * So this is the rule rather than the instance, swept over `FACTION_IDS`.
 */
describe('a side can do something with its first town', () => {
  function opening(faction: FactionId): GameState {
    const s = createGame({ seed: 3, width: 30, height: 20, playerFaction: faction });
    s.players[0].techs = [FACTIONS[faction].startTech];
    return s;
  }

  it('offers every faction something to build in a city of one', () => {
    for (const faction of FACTION_IDS) {
      const s = opening(faction);
      const town = foundCity(s, spawnUnit(s, 0, FACTIONS[faction].settlerUnit, 10, 10));
      expect(town, `${faction} could not found`).toBeTruthy();
      town!.size = 1;
      const options = buildOptions(s, town!);
      expect(
        options.units.length + options.buildings.length,
        `${faction} opens with nothing it can build`,
      ).toBeGreaterThan(0);
      // And specifically something that can hold a tile, which is the half
      // section 136 had to say out loud.
      expect(
        options.units.some((u) => u.attack > 0 || u.defense > 1),
        `${faction} opens with nothing that can hold ground`,
      ).toBe(true);
    }
  });

  /**
   * The other half of the same bug: the unit a faction is *placed* with has
   * to be one it could also build, or the production box opens on something
   * the player cannot choose again after switching away from it.
   */
  it('lets every faction build the unit it is given to start with', () => {
    for (const faction of FACTION_IDS) {
      const s = opening(faction);
      const buildable = new Set(unlockedUnits(s.players[0]).map((u) => u.id));
      expect(
        buildable.has(FACTIONS[faction].starterUnit),
        `${faction} starts with a ${FACTIONS[faction].starterUnit} it cannot build`,
      ).toBe(true);
    }
  });
});
