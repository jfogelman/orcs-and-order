import { describe, expect, it } from 'vitest';
import { PERSONALITIES, runAiTurn } from '../src/ai/ai';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS_BY_ID } from '../src/model/techs';
import type { City, GameState } from '../src/model/types';
import { deserialize, serialize } from '../src/persist/save';
import { assignWorkers, buildOptions, capitalOf, rushBlocked } from '../src/sim/city';
import {
  ALT_VICTORY,
  endingOpen,
  endingTurnsLeft,
  endingWorks,
  isEndingPiece,
  workBanked,
  portalOpen,
} from '../src/sim/endings';
import type { EndingKind } from '../src/sim/endings';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { researchableTechs } from '../src/sim/research';
import { endPlayerTurn, isOver } from '../src/sim/turn';

/**
 * Section 110: the Demonic Portal and the Mysterious Object, each the last of
 * three works.
 *
 * A game with two cities a side, far apart and nobody in them, so nothing ends it
 * except the thing under test: too few cities for dominance, nowhere near the
 * deadline, and nobody close enough to be eliminated. City 1 is the Horde's
 * capital and 2 its other city; 3 is the Kingdom's capital and 4 its other.
 */
function game(): GameState {
  const state = createGame({ seed: 20260913, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  const place = (id: number, owner: number, x: number, y: number, foundedTurn: number) => {
    const c: City = {
      id, owner, name: `Place ${id}`, x, y, size: 4,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn,
    };
    state.cities.push(c);
    assignWorkers(state, c);
  };
  place(1, 0, 4, 4, 1);
  place(2, 0, 9, 4, 2);
  place(3, 1, 24, 15, 1);
  place(4, 1, 19, 15, 2);
  state.log.length = 0;
  return state;
}

const cityOf = (state: GameState, id: number) => state.cities.find((c) => c.id === id)!;
const ADVANCE = { portal: 'somebody-knocked', object: 'do-not-touch' } as const;
const SIDE = { portal: { owner: 0, capital: 1, other: 2 }, object: { owner: 1, capital: 3, other: 4 } };

/** One whole calendar turn, both sides. */
function nextTurn(state: GameState): void {
  for (let i = 0; i < state.players.length; i++) endPlayerTurn(state);
}

/** Put enough shields in the box and let the owner's economy finish the build. */
function finish(state: GameState, city: City, id: string): void {
  city.producing = { kind: 'building', id };
  city.shields = BUILDINGS[id].cost * 3;
  for (let t = 0; t < 3 && !city.buildings.includes(id); t++) nextTurn(state);
  expect(city.buildings, `${id} was not finished`).toContain(id);
}

/** Every work towards an ending: one lesser work in each city, and the last in the capital. */
function raise(state: GameState, kind: EndingKind): City {
  const side = SIDE[kind];
  state.players[side.owner].techs.push(ADVANCE[kind]);
  const [first, second, last] = endingWorks(kind);
  const capital = cityOf(state, side.capital);
  finish(state, capital, first.id);
  finish(state, cityOf(state, side.other), second.id);
  finish(state, capital, last.id);
  return capital;
}

describe('the far end of each tree', () => {
  it('has one advance a side, at the end of its own line, unlocking three works of its own', () => {
    // The Kingdom's road runs through Insanity; the Horde's does not, because the
    // Kingdom researches faster and the Portal landed a third as often (section 110).
    expect(TECHS_BY_ID['do-not-touch'].prereqs).toEqual(expect.arrayContaining(['lordship', 'insanity']));
    expect(TECHS_BY_ID['somebody-knocked'].prereqs).toEqual(['dead-messed-up']);
    for (const kind of ['portal', 'object'] as const) {
      const tech = TECHS_BY_ID[ADVANCE[kind]];
      const works = endingWorks(kind);
      expect(works).toHaveLength(3);
      expect(tech.buildings.sort()).toEqual(works.map((w) => w.id).sort());
      // Two lesser works and one final one, all the same side's.
      expect(works.filter((w) => w.victory === kind)).toHaveLength(1);
      expect(works[2].victory).toBe(kind);
      expect(new Set(works.map((w) => w.faction)).size).toBe(1);
    }
    // And the Kingdom's committee pays more for them: the Object landed more than twice
    // as often as the Portal at the same price (section 110).
    const total = (kind: EndingKind) => endingWorks(kind).reduce((n, w) => n + w.cost, 0);
    expect(total('object')).toBeGreaterThan(total('portal'));
  });

  it("does not offer a side the other side's advance", () => {
    const state = game();
    const horde = state.players[0];
    horde.techs.push('dead-messed-up', 'lordship', 'insanity');
    const offered = researchableTechs(horde).map((t) => t.id);
    expect(offered).toContain('somebody-knocked');
    expect(offered).not.toContain('do-not-touch');
  });
});

describe('where the works can be built', () => {
  const ids = (state: GameState, c: City) => buildOptions(state, c).buildings.map((b) => b.id);

  it('offers the lesser works in any city, one of each, and never for gold', () => {
    const state = game();
    state.players[0].techs.push('somebody-knocked');
    const [first, second] = endingWorks('portal');
    const capital = cityOf(state, 1);
    const other = cityOf(state, 2);

    expect(ids(state, capital)).toContain(first.id);
    expect(ids(state, other)).toContain(first.id);

    // Under way in one city, so not offered in the other.
    other.producing = { kind: 'building', id: first.id };
    expect(ids(state, capital)).not.toContain(first.id);
    expect(ids(state, capital)).toContain(second.id);

    state.players[0].gold = 1_000_000;
    expect(rushBlocked(state, other)).not.toBeNull();
  });

  it('offers the final work only in a city holding another, and only once both stand', () => {
    const state = game();
    state.players[0].techs.push('somebody-knocked');
    const [first, second, last] = endingWorks('portal');
    const capital = cityOf(state, 1);
    const other = cityOf(state, 2);

    expect(ids(state, other)).not.toContain(last.id);
    other.buildings.push(first.id);
    expect(ids(state, other)).not.toContain(last.id);
    other.buildings.push(second.id);
    // Not the capital: it holds neither.
    expect(ids(state, other)).toContain(last.id);
    expect(ids(state, capital)).not.toContain(last.id);
    // And not a second of anything once it stands.
    expect(ids(state, capital)).not.toContain(first.id);

    // Split between the two, either may build it.
    other.buildings = other.buildings.filter((b) => b !== second.id);
    capital.buildings.push(second.id);
    expect(ids(state, capital)).toContain(last.id);
    expect(ids(state, other)).toContain(last.id);
  });
});

describe('everybody is told', () => {
  it('the moment work begins, once, before anything is finished', () => {
    const state = game();
    state.players[1].techs.push('do-not-touch');
    const [first] = endingWorks('object');
    cityOf(state, 4).producing = { kind: 'building', id: first.id };

    nextTurn(state);
    const begun = state.log.filter((e) => /committee/i.test(e.text));
    expect(new Set(begun.map((e) => e.player))).toEqual(new Set([0, 1]));
    expect(state.players[1].endingBegunAt).toBeDefined();

    nextTurn(state);
    expect(state.log.filter((e) => /committee/i.test(e.text))).toHaveLength(begun.length);
  });

  it('as each lesser work is finished', () => {
    const state = game();
    state.players[0].techs.push('somebody-knocked');
    const [first] = endingWorks('portal');
    finish(state, cityOf(state, 2), first.id);

    const told = state.log.filter((e) => e.text.includes(first.name) && /finished/.test(e.text));
    expect(new Set(told.map((e) => e.player))).toEqual(new Set([0, 1]));
  });
});

describe('the Demonic Portal', () => {
  it('opens once its works stand, marks the city, and wins after the whole count', () => {
    const state = game();
    const capital = raise(state, 'portal');
    expect(portalOpen(capital)).toBe(true);

    for (let t = 1; t < ALT_VICTORY.portalTurns; t++) {
      nextTurn(state);
      expect(isOver(state), `over after ${t} turns`).toBe(false);
      expect(endingTurnsLeft(state, capital)).toBe(ALT_VICTORY.portalTurns - t);
    }
    nextTurn(state);
    expect(state.victory).toBe('portal');
    expect(state.winner).toBe(0);
  });

  it('closes if the city is taken first', () => {
    const state = game();
    const capital = raise(state, 'portal');
    capital.owner = 1;
    for (let t = 0; t <= ALT_VICTORY.portalTurns; t++) nextTurn(state);
    expect(state.victory).toBeUndefined();
    expect(capital.buildings.some((id) => isEndingPiece(BUILDINGS[id]))).toBe(false);
    expect(capital.endingSince).toBeUndefined();
    expect(state.log.some((e) => /closes behind its new owners/.test(e.text))).toBe(true);
  });

  it('keeps its count through a save', () => {
    const state = game();
    const capital = raise(state, 'portal');
    nextTurn(state);

    const back = deserialize(serialize(state));
    const again = cityOf(back, 1);
    expect(again.endingSince).toBe(capital.endingSince);
    expect(endingTurnsLeft(back, again)).toBe(endingTurnsLeft(state, capital));
    expect(back.players[0].endingBegunAt).toBe(state.players[0].endingBegunAt);
  });
});

describe('the Mysterious Object', () => {
  it('tells both sides it is there, and neither what the button does', () => {
    const state = game();
    const capital = raise(state, 'object');

    const told = state.log.filter((e) => /button/.test(e.text));
    expect(new Set(told.map((e) => e.player))).toEqual(new Set([0, 1]));
    for (const e of told) expect(e.text).not.toMatch(/win|victory|peace|empathy|end the war/i);
    expect(endingOpen(capital)).toBe(true);
    expect(portalOpen(capital)).toBe(false);
  });

  it('is pressed only once the city has been held for the whole count', () => {
    const state = game();
    raise(state, 'object');
    let ran = 0;
    while (!isOver(state) && ran < ALT_VICTORY.objectTurns + 2) {
      nextTurn(state);
      ran++;
    }
    expect(state.victory).toBe('object');
    expect(state.winner).toBe(1);
    expect(ran).toBeGreaterThanOrEqual(ALT_VICTORY.objectTurns);
  });
});

describe('taking a city', () => {
  it('tears down a lesser work standing in it', () => {
    const state = game();
    state.players[1].techs.push('do-not-touch');
    const [first] = endingWorks('object');
    const other = cityOf(state, 4);
    finish(state, other, first.id);

    other.owner = 0;
    nextTurn(state);
    expect(other.buildings).not.toContain(first.id);
    expect(state.log.some((e) => /torn down by its new owners/.test(e.text))).toBe(true);
  });
});

describe('what cannot take an ending down', () => {
  it('bankruptcy sells everything else first, and never a work', () => {
    // Found by playing whole games: selling the newest building sold a finished
    // Object two turns into its count, and the count ran on for ever.
    const state = game();
    const capital = raise(state, 'object');
    const other = cityOf(state, 4);
    capital.buildings.push('granary');
    state.players[1].gold = -1_000_000;

    nextTurn(state);
    expect(capital.buildings).not.toContain('granary');
    for (const work of endingWorks('object')) {
      expect(workStandingIn(state, 1, work.id), `${work.id} was sold`).toBe(true);
    }
    expect(state.players[1].gold).toBeGreaterThanOrEqual(0);
    expect(other.buildings.length).toBeGreaterThan(0);
  });

  it('clears a count whose final work has gone, and says so', () => {
    const state = game();
    const capital = raise(state, 'portal');
    capital.buildings = capital.buildings.filter((b) => !BUILDINGS[b].victory);

    nextTurn(state);
    expect(capital.endingSince).toBeUndefined();
    expect(state.log.some((e) => /is gone, and the count with it/.test(e.text))).toBe(true);
    for (let t = 0; t <= ALT_VICTORY.portalTurns; t++) nextTurn(state);
    expect(state.victory).toBeUndefined();
  });
});

/** Whether a work stands in any of a player's cities. */
function workStandingIn(state: GameState, owner: number, id: string): boolean {
  return state.cities.some((c) => c.owner === owner && c.buildings.includes(id));
}

describe('with the endings switched off', () => {
  it('offers neither the advance nor the works, and ends nothing', () => {
    const state = game();
    const horde = state.players[0];
    ALT_VICTORY.enabled = false;
    try {
      horde.techs.push('dead-messed-up', 'insanity');
      expect(researchableTechs(horde).map((t) => t.id)).not.toContain('somebody-knocked');

      horde.techs.push('somebody-knocked');
      const offered = buildOptions(state, cityOf(state, 1)).buildings;
      expect(offered.some((b) => isEndingPiece(b))).toBe(false);
    } finally {
      ALT_VICTORY.enabled = true;
    }
  });
});

describe('the AI', () => {
  it('starts on a work in a garrisoned city once it can', () => {
    const state = game();
    const horde = state.players[0];
    horde.controller = 'ai';
    horde.techs.push('somebody-knocked');
    const capital = capitalOf(state, 0)!;
    spawnUnit(state, 0, 'orc', capital.x, capital.y, false);

    // Expanding comes first, and this test board has two cities; the rule under
    // test is what happens once the Horde has all the towns it wants.
    const wanted = PERSONALITIES.orc.targetCities;
    PERSONALITIES.orc.targetCities = 2;
    try {
      runAiTurn(state, 0);
    } finally {
      PERSONALITIES.orc.targetCities = wanted;
    }
    const item = capital.producing;
    expect(item.kind).toBe('building');
    expect(item.kind === 'building' && isEndingPiece(BUILDINGS[item.id])).toBe(true);
  });

  it('keeps a soldier home in a city building a work, so the work keeps its shields', () => {
    // Found by playing whole games: an empty city is refilled first, and the
    // shields saved for the work paid for the new defender -- a Portal fell from
    // 168 of 240 to 24 in eight turns.
    const state = game();
    const horde = state.players[0];
    horde.controller = 'ai';
    horde.techs.push('somebody-knocked');
    const capital = capitalOf(state, 0)!;
    capital.producing = { kind: 'building', id: endingWorks('portal')[0].id };
    capital.shields = 150;
    const keeper = spawnUnit(state, 0, 'orc', capital.x, capital.y, false);

    // As above: with towns still to found, the capital would be told to build a
    // settler instead, and it is the work this test is about.
    const wanted = PERSONALITIES.orc.targetCities;
    PERSONALITIES.orc.targetCities = 2;
    try {
      runAiTurn(state, 0);
    } finally {
      PERSONALITIES.orc.targetCities = wanted;
    }
    expect([keeper.x, keeper.y]).toEqual([capital.x, capital.y]);
    expect(capital.shields).toBe(150);
  });

  it('does not start a lesser work in a town that will take for ever to build it', () => {
    // A Knocking Stones begun in a town of size one took forty turns while no
    // other city was allowed to start one.
    const state = game();
    const horde = state.players[0];
    horde.controller = 'ai';
    horde.techs.push('somebody-knocked');
    const town = cityOf(state, 2);
    town.size = 1;
    const big: City = {
      id: 5, owner: 0, name: 'Place 5', x: 4, y: 12, size: 8,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 3,
    };
    state.cities.push(big);
    assignWorkers(state, town);
    assignWorkers(state, big);
    for (const c of [cityOf(state, 1), town, big]) spawnUnit(state, 0, 'orc', c.x, c.y, false);

    const wanted = PERSONALITIES.orc.targetCities;
    PERSONALITIES.orc.targetCities = 3;
    try {
      runAiTurn(state, 0);
    } finally {
      PERSONALITIES.orc.targetCities = wanted;
    }
    const onWork = (c: City) => c.producing.kind === 'building' && isEndingPiece(BUILDINGS[c.producing.id]);
    expect(onWork(town)).toBe(false);
    expect(onWork(cityOf(state, 1)) || onWork(big)).toBe(true);
  });
});

describe('a work keeps its shields', () => {
  /** Orders the Horde's second city onto its first work with this many shields in the box. */
  function begun(shields: number): { state: GameState; city: City; id: string } {
    const state = game();
    state.players[0].techs.push(ADVANCE.portal);
    const city = cityOf(state, SIDE.portal.other);
    const id = endingWorks('portal')[0].id;
    city.producing = { kind: 'building', id };
    city.shields = shields;
    return { state, city, id };
  }

  it('banks the box with the empire, so switching away spends none of it', () => {
    const { state, city, id } = begun(120);
    nextTurn(state);
    const banked = state.players[0].worksBanked?.[id] ?? 0;
    expect(banked).toBeGreaterThanOrEqual(120);
    expect(city.shields).toBe(0);

    // A riot, a temple, a unit: whatever it switches to starts from its own box.
    city.producing = { kind: 'building', id: 'barracks' };
    nextTurn(state);
    expect(state.players[0].worksBanked?.[id]).toBe(banked);

    city.producing = { kind: 'building', id };
    expect(workBanked(state, city)).toBe(banked);
  });

  it('carries on in another city from where it stopped', () => {
    const { state, city, id } = begun(250);
    nextTurn(state);
    const banked = state.players[0].worksBanked![id];
    city.producing = { kind: 'coin' };
    const capital = cityOf(state, SIDE.portal.capital);
    capital.producing = { kind: 'building', id };
    expect(workBanked(state, capital)).toBe(banked);
    capital.shields = BUILDINGS[id].cost - banked;
    nextTurn(state);
    expect(capital.buildings).toContain(id);
    expect(state.players[0].worksBanked).toBeUndefined();
  });

  it('gives back what is over the cost, and survives a save', () => {
    const { state, id } = begun(100);
    nextTurn(state);
    const back = deserialize(serialize(state))!;
    const banked = back.players[0].worksBanked![id];
    expect(banked).toBe(state.players[0].worksBanked![id]);
    const again = cityOf(back, SIDE.portal.other);
    again.shields = BUILDINGS[id].cost - banked + 7;
    nextTurn(back);
    expect(again.buildings).toContain(id);
    expect(again.shields).toBeGreaterThanOrEqual(7);
  });
});
