import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { PERSONALITIES, chooseProduction, nearestEnemyTarget, runAiTurn } from '../src/ai/ai';
import { SPY, SPY_TRACE, lastReading, readCity } from '../src/sim/spying';
import { appearsTo, wearDisguise } from '../src/sim/disguise';
import { unitType } from '../src/model/units';
import { distance } from '../src/engine/grid';
import { TECHS } from '../src/model/techs';
import { BUILDINGS, BUILDING_IDS } from '../src/model/buildings';
import { isEndingPiece } from '../src/sim/endings';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 136 slice 3: the other side plays too.
 *
 * **This file exists because of section 125.** The Burrower-caste shipped with
 * no want of its own, and `worth()` ranks a unit on strength, health and price
 * -- so the AI built 0.2 a game and a sweep of the mechanic came back with
 * identical numbers on both arms, having never once put it on the board. A spy
 * has `attack: 0` and would have ranked last of everything, forever.
 *
 * So the question here is never "is the rule right". It is **does this ever
 * happen at all**, which is the question that was not asked last time.
 */
function board(opts: { spied?: boolean } = {}): {
  state: GameState;
  spy: Unit;
  near: { id: number; x: number; y: number };
  far: { id: number; x: number; y: number };
} {
  const state = createGame({ seed: 23, width: 40, height: 24, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(0);
  }
  // Two rival towns: one close and held, one further off and empty. Neither is
  // visible, so both are guesses until somebody reports.
  const near = foundCity(state, spawnUnit(state, 1, 'peasant', 14, 12))!;
  const far = foundCity(state, spawnUnit(state, 1, 'peasant', 24, 12))!;
  state.units.length = 0;
  spawnUnit(state, 1, 'footman', near.x, near.y);
  const spy = spawnUnit(state, 0, 'skulker', 6, 12);
  if (opts.spied) {
    // A report on the far town, which is empty: the thing eyes cannot tell you.
    const agent = spawnUnit(state, 0, 'skulker', far.x - 1, far.y);
    agent.rank = 3;
    for (let i = 0; i < 40 && !lastReading(state, 0, far.id); i++) {
      agent.moves = 1;
      readCity(state, agent, far);
    }
    state.units = state.units.filter((u) => u !== agent);
  }
  return { state, spy, near, far };
}

/**
 * A town of theirs with everything learned, so the yard offers the whole
 * catalogue. The spy then has to win a slot on its own want rather than on
 * being the only thing that can be built -- which is the only version of this
 * question worth asking.
 */
function yard(): { state: GameState; city: City } {
  const state = createGame({ seed: 5, width: 30, height: 20, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const p of state.players) {
    p.explored.fill(1);
    p.techs = TECHS.map((t) => t.id);
  }
  const city = foundCity(state, spawnUnit(state, 1, 'peasant', 10, 10))!;
  state.units.length = 0;
  city.size = 6;
  return { state, city };
}

describe('the other side builds an agent', () => {
  it('asks for a spy, which nothing else would ever rank highly', () => {
    const { state, city } = yard();
    const asked: string[] = [];
    for (let i = 0; i < 12; i++) {
      const want = chooseProduction(state, city, PERSONALITIES.human);
      if (want.kind === 'unit') asked.push(want.id);
      // Satisfy it, so the chooser moves on to its next want.
      if (want.kind === 'unit') spawnUnit(state, 1, want.id, city.x, city.y);
      else break;
    }
    expect(
      asked.some((id) => unitType(id).spy),
      `twelve wants and never an agent: ${asked.join(', ')}`,
    ).toBe(true);
  });

  it('builds none at all with the lever off', () => {
    const { state, city } = yard();
    SPY.ai = false;
    try {
      const asked: string[] = [];
      for (let i = 0; i < 12; i++) {
        const want = chooseProduction(state, city, PERSONALITIES.human);
        if (want.kind !== 'unit') break;
        asked.push(want.id);
        spawnUnit(state, 1, want.id, city.x, city.y);
      }
      expect(asked.some((id) => unitType(id).spy)).toBe(false);
    } finally {
      SPY.ai = true;
    }
  });
});

describe('the other side uses it', () => {
  it('walks it toward somebody else’s gate rather than at their army', () => {
    const { state, spy, near, far } = board();
    const before = { x: spy.x, y: spy.y };
    // Asked as "did it ever arrive", not "is it nearer now than it was". Once
    // an agent has read a town it moves on to the next one, so a test that
    // measured the distance at the end failed for the behaviour working.
    let arrived = false;
    for (let turn = 0; turn < 30; turn++) {
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
      if (!state.units.includes(spy)) break;
      arrived ||= [near, far].some((c) => distance(spy.x, spy.y, c.x, c.y) <= 1);
    }
    expect(state.units, 'the agent was marched into something and killed').toContain(spy);
    const moved = Math.abs(spy.x - before.x) + Math.abs(spy.y - before.y);
    expect(moved, 'the agent never left home').toBeGreaterThan(0);
    expect(arrived, 'thirty turns and it never reached anybody’s gate').toBe(true);
  });

  it('wears the colours of the side it is going to read', () => {
    const { state, spy } = board();
    spy.moves = unitType(spy.type).move;
    runAiTurn(state, 0);
    // Asked on the first turn, while it is still walking. Run for six and the
    // agent reaches a gate, gets caught and is uncovered -- which is correct,
    // and would have made this read as a disguise that was never put on.
    //
    // Its own colours hide it from nobody abroad. Theirs is how it survives the
    // walk -- and is the riskier of the two, which is the trade the player is
    // offered and so the one the AI should be taking.
    expect(appearsTo(spy, 1).owner).toBe(1);
    expect(appearsTo(spy, 0).owner, 'its own side is never fooled').toBe(0);
  });

  it('does not stand at one gate re-reading a file it already has', () => {
    const { state, spy, near } = board();
    for (let turn = 0; turn < 60; turn++) {
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
      if (!state.units.includes(spy)) break;
    }
    const filed = lastReading(state, 0, near.id);
    if (!filed) return; // it never got there; the walking test covers that

    // A fresh file is worth nothing to read again, and every reading carries a
    // chance of being caught. The first version read whatever it was next to
    // every turn: one probe game tried sixty-eight readings and filed two
    // towns, buying information the empire already had at a real price.
    const before = SPY_TRACE.attempts;
    for (let turn = 0; turn < 5; turn++) {
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
      if (!state.units.includes(spy)) return;
    }
    expect(
      SPY_TRACE.attempts - before,
      'the agent spent five turns re-reading a file it already had',
    ).toBeLessThan(5);
  });

  it('files what it finds, where the empire can act on it', () => {
    const { state, spy, near, far } = board();
    for (let turn = 0; turn < 40; turn++) {
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
      if (lastReading(state, 0, near.id) || lastReading(state, 0, far.id)) break;
    }
    expect(
      lastReading(state, 0, near.id) ?? lastReading(state, 0, far.id),
      'forty turns of walking and never a word filed',
    ).not.toBeNull();
  });
});

describe('what a report is actually worth', () => {
  it('replaces the guess about a town nobody can see', () => {
    const blind = board();
    const told = board({ spied: true });
    // Standing exactly between them, so distance separates nothing and the
    // only thing left to choose on is what the empire knows. The first draft
    // put the soldier at one end, where the near town won on distance by more
    // than any garrison could offset -- a test that could not have failed for
    // the reason it was about.
    const soldier = (b: typeof blind) => spawnUnit(b.state, 0, 'orc', 19, 12);

    // Unseen and unread, every town is assumed middling, so the near one wins
    // on distance alone.
    const guessing = nearestEnemyTarget(blind.state, 0, soldier(blind));
    expect(guessing).toEqual({ x: blind.near.x, y: blind.near.y });

    // Told that the far town is empty and the near one is held, it goes the
    // long way. This is the entire argument for paying thirty shields for a
    // unit that cannot fight.
    const knowing = nearestEnemyTarget(told.state, 0, soldier(told));
    expect(knowing).toEqual({ x: told.far.x, y: told.far.y });
  });

  it('is believed for a while and then is only a rumour', () => {
    const { state, far } = board({ spied: true });
    expect(lastReading(state, 0, far.id)).not.toBeNull();
    state.turn += SPY.remembers + 1;
    // An empire that planned off a year-old report would be worse off than one
    // that admitted it did not know.
    expect(lastReading(state, 0, far.id)).toBeNull();
  });

  it('loses to a pair of eyes, which are never out of date', () => {
    const { state, near, far } = board({ spied: true });
    // The far town is reported empty; now it is garrisoned and in plain sight.
    spawnUnit(state, 1, 'footman', far.x, far.y);
    spawnUnit(state, 1, 'footman', far.x, far.y - 1);
    state.players[0].visible.fill(1);
    const soldier = spawnUnit(state, 0, 'orc', 19, 12);
    expect(nearestEnemyTarget(state, 0, soldier)).toEqual({ x: near.x, y: near.y });
  });

  it('tells nobody anything with the lever off', () => {
    const { state, far } = board({ spied: true });
    SPY.enabled = false;
    try {
      expect(lastReading(state, 0, far.id)).toBeNull();
    } finally {
      SPY.enabled = true;
    }
  });
});

describe('the other side sweeps its own ground', () => {
  it('searches when it has no town worth reading, without peeking first', () => {
    const state = createGame({ seed: 61, width: 30, height: 20, barbarians: false });
    state.terrain.fill('grass');
    state.units.length = 0;
    state.cities.length = 0;
    state.ruins = [];
    for (const p of state.players) {
      p.explored.fill(1);
      p.visible.fill(1);
    }
    // No rival towns at all, so there is nothing anywhere worth walking to.
    const spy = spawnUnit(state, 0, 'skulker', 10, 10);
    const hider = spawnUnit(state, 1, 'factor', 11, 10);
    wearDisguise(state, hider, 0);

    // **The trigger is "no errand", not "somebody is there".** An AI that
    // checked for a disguised unit before deciding to search would be seeing
    // exactly what searching exists to find out.
    let found = false;
    for (let turn = 0; turn < 60 && !found; turn++) {
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
      found = appearsTo(hider, 0).owner === 1;
    }
    expect(found, 'sixty turns of an idle agent and it never swept').toBe(true);
  });

  it('prefers an errand to a sweep, because a report is worth more', () => {
    const { state, spy, far } = board();
    // A stale town somewhere is work; the ground underfoot can wait.
    let walked = false;
    for (let turn = 0; turn < 10 && !walked; turn++) {
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
      walked = spy.x !== 6 || spy.y !== 12;
    }
    expect(walked, 'it stood still with a town unread').toBe(true);
    void far;
  });
});

describe('the other side wrecks what would beat it', () => {
  /** Their town, mid-ending, with our agent standing beside it. */
  function atTheWorks(): { state: GameState; spy: Unit; city: City; work: string } {
    const state = createGame({ seed: 73, width: 30, height: 20, barbarians: false });
    state.terrain.fill('grass');
    state.units.length = 0;
    state.cities.length = 0;
    state.ruins = [];
    for (const p of state.players) {
      p.explored.fill(1);
      p.visible.fill(1);
    }
    const city = foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10))!;
    state.units = state.units.filter((u) => u.owner !== 1 || u.x !== city.x || u.y !== city.y);
    const work = BUILDING_IDS.find((id) => isEndingPiece(BUILDINGS[id]))!;
    city.producing = { kind: 'building', id: work };
    state.players[1].worksBanked = { [work]: 300 };
    const spy = spawnUnit(state, 0, 'skulker', 11, 10);
    spy.rank = 3; // clears the bar; a green one deliberately does not
    return { state, spy, city, work };
  }

  it('wrecks an ending it is standing beside', () => {
    const { state, spy, city, work } = atTheWorks();
    let gone = false;
    for (let turn = 0; turn < 30 && !gone; turn++) {
      if (!state.units.includes(spy)) break;
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
      gone = (state.players[1].worksBanked?.[work] ?? 0) === 0;
    }
    // The thing worth losing an agent over is the thing that would otherwise
    // lose the game.
    expect(gone, 'thirty turns beside somebody’s Portal and it never tried').toBe(true);
    void city;
  });

  it('will not spend its agent on a granary', () => {
    const { state, spy, city } = atTheWorks();
    // The same town, building something ordinary, with a full box.
    city.producing = { kind: 'building', id: 'granary' };
    delete state.players[1].worksBanked;
    city.shields = 48;
    for (let turn = 0; turn < 20; turn++) {
      if (!state.units.includes(spy)) break;
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
    }
    // A side that sabotaged whatever happened to be nearest would spend its one
    // agent on a granary. This is the bar doing its job.
    expect(city.shields, 'it wrecked an ordinary building site').toBe(48);
  });

  it('will not take a bet a green agent should refuse', () => {
    const { state, spy, city, work } = atTheWorks();
    spy.rank = 0;
    for (let turn = 0; turn < 20; turn++) {
      if (!state.units.includes(spy)) break;
      spy.moves = unitType(spy.type).move;
      runAiTurn(state, 0);
    }
    // Losing your only agent to delete somebody's Portal is a fine trade; doing
    // it at odds a veteran would refuse is not, and `aiOdds` is the bar.
    expect(state.players[1].worksBanked?.[work] ?? 0).toBe(300);
    void city;
  });
});
