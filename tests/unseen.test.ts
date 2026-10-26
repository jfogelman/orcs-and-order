import { afterEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit, unitAt } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { seenBy } from '../src/sim/burrow';
import { appearsTo, canDisguise, uncover, wearDisguise } from '../src/sim/disguise';
import { SPY, searchFrom } from '../src/sim/spying';
import { UNSEEN, goesUnseen, hiddenFrom, townNotice, unseenOdds } from '../src/sim/unseen';
import { noticeStrangers } from '../src/sim/noticing';
import { FACTION_IDS } from '../src/model/factions';
import { beginPlayerTurn } from '../src/sim/turn';
import { checkContacts, haveMet } from '../src/sim/contact';
import { reachableTiles, tryStep, visibleEnemies } from '../src/sim/movement';
import { CREATURES, UNIT_TYPES, unitType } from '../src/model/units';
import { abilityNotes } from '../src/ui/pedia';
import { TECHS } from '../src/model/techs';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 138: the high tier of spies.
 *
 * The structurally different rung, and the reason it is worth having its own
 * file: every other thing a spy does is an answer to **what am I looking at**,
 * and these three are an answer to **can I see it at all**. That is `seenBy`
 * rather than `appearsTo`, and until now exactly one thing in this game had
 * ever made `seenBy` interesting -- a Burrower under the ground.
 *
 * The tests that matter most here are the ones about *leaks*. A unit nobody
 * can see is only unseen if nothing else on the screen quietly says where it
 * is, and a pathfinder that refuses to route through a patch of empty grass
 * says it very loudly indeed.
 */
function board(): { state: GameState; spy: Unit; city: City } {
  const state = createGame({ seed: 29, width: 30, height: 20 });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const city = foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10))!;
  state.units = state.units.filter((u) => u.owner !== 1 || u.x !== city.x || u.y !== city.y);
  const spy = spawnUnit(state, 0, 'nobody', 11, 10);
  return { state, spy, city };
}

afterEach(() => {
  UNSEEN.enabled = true;
});

describe('the three that are never drawn', () => {
  it('exists one per side, and every side can reach one', () => {
    const hidden = CREATURES.filter((c) => UNIT_TYPES[c.id].hidden);
    // **Every side, derived.** This named three, and section 147 found that
    // the Wandering Folk had neither of their two spies -- so espionage was
    // simply unavailable to them, and a test that listed the sides it knew
    // about could never have said so. One a side, whoever the sides are.
    expect(hidden.map((c) => c.faction).sort()).toEqual([...FACTION_IDS].sort());
    // And an advance actually unlocks each, or they are three creatures with
    // art and no way into the game -- which is how `nobody-in-particular` sat
    // in ART_PROMPTS for two sections.
    for (const c of hidden) {
      expect(
        TECHS.some((t) => t.units.includes(c.id)),
        `${c.name} is unlocked by nothing`,
      ).toBe(true);
    }
  });

  it('is a spy first, so every order on the ladder is already its own', () => {
    // The high tier is not a new set of actions. It is the same agent with a
    // different answer to whether anybody can see it, and this is the line
    // that keeps `canRead`, `canSabotage` and the rest working unchanged.
    for (const c of CREATURES.filter((x) => UNIT_TYPES[x.id].hidden)) {
      expect(UNIT_TYPES[c.id].spy, `${c.name} is hidden but not a spy`).toBe(true);
      expect(UNIT_TYPES[c.id].attack, `${c.name} can swing`).toBe(0);
    }
  });

  it('cannot be seen by anybody else, and is never a mystery to its owner', () => {
    const { state, spy } = board();
    expect(seenBy(state, spy, 0), 'its own side').toBe(true);
    expect(seenBy(state, spy, 1), 'the side it is standing next to').toBe(false);
    // The tile is lit -- this is not a fog-of-war result. The whole board is
    // revealed in `board()` on purpose, so a pass here cannot be the fog
    // answering for the mechanic.
    expect(state.players[1].visible[spy.y * state.width + spy.x]).toBe(1);
  });

  it('wears no colours, because there is nobody to show them to', () => {
    const { state, spy } = board();
    expect(canDisguise(spy)).toBe(false);
    expect(wearDisguise(state, spy, 1)).toBe(false);
    expect(appearsTo(spy, 1)).toEqual({ owner: 0, type: 'nobody' });
    // And the low tier still can, or this has been fixed by breaking it.
    const skulker = spawnUnit(state, 0, 'skulker', 10, 10);
    expect(canDisguise(skulker)).toBe(true);
  });

  it('stays out of the enemy’s sighting list entirely', () => {
    const { state, spy } = board();
    // The question the AI's target search and the sighting report both ask.
    expect(visibleEnemies(state, 1).has(spy.id)).toBe(false);
    uncover(spy, 1);
    expect(visibleEnemies(state, 1).has(spy.id), 'and is ordinary once found').toBe(true);
  });

  it('does nothing at all with the lever off', () => {
    const { state, spy } = board();
    UNSEEN.enabled = false;
    expect(goesUnseen(spy)).toBe(false);
    expect(seenBy(state, spy, 1)).toBe(true);
  });
});

describe('what being found means', () => {
  it('is permanent, and is one side’s secret', () => {
    const state = createGame({ seed: 5, width: 30, height: 20 });
    state.terrain.fill('grass');
    state.units.length = 0;
    state.cities.length = 0;
    for (const p of state.players) {
      p.explored.fill(1);
      p.visible.fill(1);
    }
    const spy = spawnUnit(state, 0, 'nobody', 11, 10);
    expect(uncover(spy, 1)).toBe(true);
    expect(hiddenFrom(spy, 1)).toBe(false);
    // Every other side goes on not seeing it, which is the prize.
    for (const p of state.players) {
      if (p.id === 0 || p.id === 1) continue;
      expect(hiddenFrom(spy, p.id), `side ${p.id} was told as well`).toBe(true);
    }
    // And it does not wear off.
    expect(uncover(spy, 1), 'uncovering twice is not a thing').toBe(false);
    expect(hiddenFrom(spy, 1)).toBe(false);
  });

  it('uncovers the high tier at all, which the first version silently refused', () => {
    // `uncover` used to open with `if (!unit.disguise) return false`, which is
    // true of every hidden agent -- so the one function that finds them could
    // never find one, and nothing anywhere would have failed.
    const { spy } = board();
    expect(spy.disguise, 'the high tier wears nothing').toBeUndefined();
    expect(uncover(spy, 1)).toBe(true);
  });

  it('never uncovers an ordinary soldier, which would be a field on everything', () => {
    const { state } = board();
    const goblin = spawnUnit(state, 0, 'goblin', 9, 9);
    expect(uncover(goblin, 1)).toBe(false);
    expect(goblin.uncoveredBy).toBeUndefined();
  });
});

describe('it does not give itself away through the interface', () => {
  it('leaves the tile it stands on perfectly ordinary to walk to', () => {
    const { state, spy } = board();
    const soldier = spawnUnit(state, 1, 'footman', 10, 11);
    soldier.moves = 3;
    const reach = reachableTiles(state, soldier);
    // **The leak that would have thrown the mechanic away.** If a hidden agent
    // blocked, the one tile on an empty plain that the mover could not be sent
    // to would be the tile it was standing on, and any player would read that
    // in a heartbeat.
    expect(reach.has(spy.y * state.width + spy.x), 'a hole in the reachable set').toBe(true);
  });

  it('is still in the way of its own side, who can see it perfectly well', () => {
    const { state, spy } = board();
    const friend = spawnUnit(state, 0, 'goblin', 10, 10);
    friend.moves = 3;
    expect(reachableTiles(state, friend).has(spy.y * state.width + spy.x)).toBe(false);
  });

  it('is in the way again once that side has found it', () => {
    const { state, spy } = board();
    const soldier = spawnUnit(state, 1, 'footman', 10, 11);
    soldier.moves = 3;
    uncover(spy, 1);
    expect(reachableTiles(state, soldier).has(spy.y * state.width + spy.x)).toBe(false);
  });
});

describe('the book does not contradict itself about which tier it is', () => {
  it('never offers a disguise on a card for a unit that cannot wear one', () => {
    // It did. The disguise note was pushed for every spy and only the closing
    // line was branched, so the Nobody's entry advertised an order two lines
    // above the one explaining why that order does not exist for it. Found by
    // reading the rendered card rather than by any test.
    for (const c of CREATURES.filter((x) => UNIT_TYPES[x.id].spy)) {
      const notes = abilityNotes(UNIT_TYPES[c.id]).join(' | ');
      const wearsColours = /wear somebody|colours/.test(notes);
      expect(
        wearsColours,
        `${c.name}: the card and canDisguise disagree`,
      ).toBe(canDisguise({ type: c.id, owner: 0 } as Unit));
    }
  });
});

describe('the leaks that would have thrown it away', () => {
  it('does not introduce two empires to each other', () => {
    const { state, spy } = board();
    // **The subtlest one, and it was real.** `checkContacts` asked the
    // visibility *bitmap* -- "is that tile lit" -- rather than `seenBy`. A lit
    // tile is not a visible unit, so an invisible agent walking past somebody
    // announced its entire empire: a meeting reveals both ways and hands over
    // the bearing of the nearest town. Found by reading every consumer of
    // `seenBy` and noticing one subsystem that was not a consumer at all.
    // **Reset it properly.** The first draft of this assigned
    // `state.meetings = {}` and cleared a `met` on each player, neither of
    // which exists -- meetings live on `state.diplomacy.pairs` -- so the test
    // was asserting against whatever `createGame` happened to leave behind.
    // It passed, which is the only reason it was worth noticing: a test that
    // resets nothing and then checks the thing it did not reset is a test
    // about the fixture.
    if (state.diplomacy?.pairs) state.diplomacy.pairs = {};
    expect(haveMet(state, 0, 1), 'the board did not start unmet').toBe(false);
    // Nothing of side 1's is anywhere near, so the agent is the only thing
    // that could possibly introduce them.
    state.units = state.units.filter((u) => u.id === spy.id || u.owner === 1);
    for (const u of state.units) {
      if (u.owner === 1) {
        u.x = 28;
        u.y = 18;
      }
    }
    checkContacts(state, 1);
    expect(haveMet(state, 0, 1), 'an invisible agent made the introductions').toBe(false);

    // And an ordinary unit still does, or this has been fixed by breaking
    // first contact for everybody.
    const goblin = spawnUnit(state, 0, 'goblin', 11, 11);
    checkContacts(state, 1);
    expect(haveMet(state, 0, 1), 'first contact broken for ordinary units').toBe(true);
    expect(goblin.owner).toBe(0);
  });
});

describe('walking into one', () => {
  it('finds it, and does not fight it', () => {
    const { state, spy } = board();
    const soldier = spawnUnit(state, 1, 'footman', 10, 10);
    soldier.moves = 1;
    const before = spy.hp;

    const out = tryStep(state, soldier, spy.x, spy.y);
    expect(out.kind).toBe('blocked');
    // **Found, not fought.** You cannot aim at something you have not noticed,
    // and a step that killed it would collapse two decisions by the other side
    // into one accident.
    expect(spy.hp, 'it was attacked').toBe(before);
    expect(hiddenFrom(spy, 1), 'and it was not found').toBe(false);
    // Found *for now*. The probe is what argued for this: permanent, it was
    // the commonest end for the unit by a factor of five over both designed
    // counters together, and no amount of play can dodge somebody else's
    // marching orders.
    expect(spy.spottedBy, 'the mark is the temporary one').toEqual([1]);
    expect(spy.uncoveredBy ?? [], 'this should not be permanent').toEqual([]);
    // The walker stops where it was and the agent keeps the ground.
    expect([soldier.x, soldier.y]).toEqual([10, 10]);
    expect(unitAt(state, spy.x, spy.y)?.id).toBe(spy.id);
    expect(soldier.moves, 'the rest of the turn is gone').toBe(0);
  });

  it('tells the agent’s owner that they have been trodden on', () => {
    const { state, spy } = board();
    const soldier = spawnUnit(state, 1, 'footman', 10, 10);
    soldier.moves = 1;
    const theirs = () => state.log.filter((e) => e.player === 0).length;
    const before = theirs();
    tryStep(state, soldier, spy.x, spy.y);
    // The owner has to know: the decision of whether to walk it home is the
    // whole of what they do next, and it cannot be made in the dark.
    expect(theirs()).toBeGreaterThan(before);
  });

  it('slips out of sight again when its own turn comes round', () => {
    const { state, spy } = board();
    const soldier = spawnUnit(state, 1, 'footman', 10, 10);
    soldier.moves = 1;
    tryStep(state, soldier, spy.x, spy.y);
    expect(hiddenFrom(spy, 1)).toBe(false);

    // The agent's own side's turn is the clock. Whoever trod on it has had the
    // rest of their turn, and everybody in between, to bring something over.
    beginPlayerTurn(state, 0);
    expect(hiddenFrom(spy, 1), 'the mark outlived the turn it was made on').toBe(true);
  });

  it('is still found for good by the counters that are meant to find it', () => {
    // The point of making a collision temporary is that it is the *accident*
    // that stops being fatal. A town that notices, or an agent that searches,
    // still ends it permanently -- otherwise there would be no way to finish
    // one off at all.
    const { state, spy, city } = board();
    spy.x = city.x + 1;
    spy.y = city.y;
    for (let i = 0; i < 400 && hiddenFrom(spy, 1); i++) noticeStrangers(state, 1);
    expect(spy.uncoveredBy, 'a town noticing should be permanent').toContain(1);
    beginPlayerTurn(state, 0);
    expect(hiddenFrom(spy, 1), 'and should survive its own turn').toBe(false);
  });

  it('is an ordinary attack once that side has found it', () => {
    const { state, spy } = board();
    const soldier = spawnUnit(state, 1, 'footman', 10, 10);
    soldier.moves = 1;
    uncover(spy, 1);
    const out = tryStep(state, soldier, spy.x, spy.y);
    // Not blocked by the hidden branch -- it resolves as combat, and a spy
    // with one point of defence loses it.
    expect(out.kind === 'blocked' && /not there a moment ago|should not be/.test(out.reason)).toBe(
      false,
    );
  });
});

describe('searching for one', () => {
  it('is harder than seeing through a disguise, at every rank', () => {
    const { state, spy } = board();
    const searcher = spawnUnit(state, 1, 'factor', 12, 11);
    // The low tier is a wrong answer you can catch. This is no answer at all.
    expect(unseenOdds(searcher, spy)).toBeLessThan(SPY.finds);
    searcher.rank = 3;
    expect(unseenOdds(searcher, spy)).toBeLessThan(SPY.finds + SPY.findPerRank * 3);
    // But rank still buys something, or there is no reason to keep one alive.
    const green = { ...searcher, rank: 0 } as Unit;
    expect(unseenOdds(searcher, spy)).toBeGreaterThan(unseenOdds(green, spy));
  });

  it('actually finds one, which needs the lit-tile rule rather than seenBy', () => {
    const { state, spy } = board();
    const searcher = spawnUnit(state, 1, 'factor', 12, 10);
    searcher.rank = 3;
    // **The trap this test exists for.** `searchFrom` filtered on `seenBy`,
    // which is now the very thing a hidden agent fails -- so asking it would
    // skip every one of them and the high tier would be unfindable by the one
    // unit built to find it. A search needs the *tile* lit, not the unit seen.
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      searcher.moves = 1;
      const out = searchFrom(state, searcher);
      found = out.kind === 'found' && out.found.some((u) => u.id === spy.id);
    }
    expect(found, 'two hundred sweeps beside it and never once found').toBe(true);
    expect(hiddenFrom(spy, 1)).toBe(false);
  });

  it('cannot find one standing in the dark', () => {
    const { state, spy } = board();
    const searcher = spawnUnit(state, 1, 'factor', 12, 10);
    searcher.rank = 3;
    state.players[1].visible[spy.y * state.width + spy.x] = 0;
    for (let i = 0; i < 100; i++) {
      searcher.moves = 1;
      searchFrom(state, searcher);
    }
    expect(hiddenFrom(spy, 1), 'found through the fog').toBe(true);
  });

  it('still finds a disguised one, which it was built for', () => {
    const { state } = board();
    const skulker = spawnUnit(state, 0, 'skulker', 12, 11);
    wearDisguise(state, skulker, 1);
    const searcher = spawnUnit(state, 1, 'factor', 12, 10);
    searcher.rank = 3;
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      searcher.moves = 1;
      const out = searchFrom(state, searcher);
      found = out.kind === 'found' && out.found.some((u) => u.id === skulker.id);
    }
    expect(found, 'section 136 broken by section 138').toBe(true);
  });
});

describe('a town looking for itself', () => {
  it('is worth more when the town is happy and worth least when it is rioting', () => {
    const calm = townNotice({ celebrating: false, disorder: false, guards: 0 });
    const happy = townNotice({ celebrating: true, disorder: false, guards: 0 });
    const guarded = townNotice({ celebrating: false, disorder: false, guards: 2 });
    const rioting = townNotice({ celebrating: true, disorder: true, guards: 2 });
    expect(happy).toBeGreaterThan(calm);
    expect(guarded).toBeGreaterThan(calm);
    // A town in disorder has other things on its mind, whatever else is true
    // of it -- including a garrison standing in it.
    expect(rioting).toBeLessThan(guarded);
    expect(rioting).toBe(UNSEEN.notice);
  });

  it('never pays for a third soldier, or a stack would be a wall', () => {
    const two = townNotice({ celebrating: false, disorder: false, guards: 2 });
    const five = townNotice({ celebrating: false, disorder: false, guards: 5 });
    expect(five).toBe(two);
  });

  it('is capped, so no town is ever a certainty', () => {
    const best = townNotice({ celebrating: true, disorder: false, guards: 2 });
    expect(best).toBeLessThanOrEqual(UNSEEN.noticeCap);
    expect(best).toBeLessThan(1);
  });

  it('finds an agent parked at its gate, given long enough', () => {
    const { state, spy, city } = board();
    spy.x = city.x + 1;
    spy.y = city.y;
    let turns = 0;
    for (; turns < 400 && hiddenFrom(spy, 1); turns++) noticeStrangers(state, 1);
    expect(hiddenFrom(spy, 1), 'four hundred turns at the gate unnoticed').toBe(false);
    // And not instantly: it is a clock, not a wall. An agent passing through
    // should almost always be fine.
    expect(turns, 'noticed far too readily').toBeGreaterThan(1);
  });

  it('never notices one standing a long way off', () => {
    const { state, spy, city } = board();
    spy.x = city.x + UNSEEN.noticeReach + 3;
    spy.y = city.y;
    for (let i = 0; i < 300; i++) noticeStrangers(state, 1);
    expect(hiddenFrom(spy, 1)).toBe(true);
  });

  it('never notices one of its own', () => {
    const { state, city } = board();
    const mine = spawnUnit(state, 1, 'intelligencer', city.x + 1, city.y);
    for (let i = 0; i < 300; i++) noticeStrangers(state, 1);
    expect(mine.uncoveredBy ?? [], 'a town found its own agent').toEqual([]);
  });

  it('finds a disguised agent too, which is the defence for a side with none', () => {
    const { state, city } = board();
    const skulker = spawnUnit(state, 0, 'skulker', city.x + 1, city.y);
    wearDisguise(state, skulker, 1);
    let turns = 0;
    for (; turns < 400 && !skulker.uncoveredBy?.includes(1); turns++) noticeStrangers(state, 1);
    expect(
      skulker.uncoveredBy?.includes(1),
      'a town can be stood in indefinitely by somebody wearing its own colours',
    ).toBe(true);
  });

  it('does nothing at all with the lever off', () => {
    const { state, spy, city } = board();
    spy.x = city.x + 1;
    spy.y = city.y;
    UNSEEN.enabled = false;
    for (let i = 0; i < 300; i++) noticeStrangers(state, 1);
    // `hiddenFrom` is false with the lever off because nothing is hidden at
    // all, so the question worth asking is whether anything was *recorded*.
    expect(spy.uncoveredBy ?? []).toEqual([]);
  });
});

describe('the high tier runs the rest of the ladder unchanged', () => {
  it('reads a town exactly as the low tier does', async () => {
    const { state, spy, city } = board();
    const { canRead, readCity } = await import('../src/sim/spying');
    expect(canRead(spy, city).ok).toBe(true);
    spy.rank = 3;
    let read = false;
    for (let i = 0; i < 40 && !read; i++) {
      spy.moves = 1;
      read = readCity(state, spy, city).kind === 'read';
    }
    expect(read).toBe(true);
  });

  it('is not uncovered merely by doing its job', () => {
    // Being *caught* at an order is a separate matter and is the low tier's
    // rule too. What must not happen is the act of reading quietly revealing
    // an agent that was never noticed.
    const { spy, city } = board();
    expect(unitType(spy.type).hidden).toBe(true);
    expect(hiddenFrom(spy, city.owner)).toBe(true);
  });
});
