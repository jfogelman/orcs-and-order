import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { ARRIVALS } from '../src/sim/arrivals';
import { foundCity } from '../src/sim/city';
import { GOSSIP, askAround, canAsk, heardIsDistracted, lastGossip } from '../src/sim/gossip';
import { SPY } from '../src/sim/spying';
import { noteClash } from '../src/sim/diplomacy';
import { nearestEnemyTarget } from '../src/ai/ai';
import { TECHS } from '../src/model/techs';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 136 slice 7: asking a town what it thinks of everybody.
 *
 * The one rung about somebody who is not in the room, and the only one that
 * cannot fail. The thing worth testing hardest is that what it buys is kept
 * behind a *report*: an empire must not act on a war nobody told it about,
 * which is the failure the Burrowers and then the spies both fell into.
 */
/**
 * **Three sides, because the whole rung is about a third party.**
 *
 * A default board has two and the third arrives later, so side 1 has nobody
 * to have an opinion *about*. This used to be got by playing as the Hive,
 * which seated all three at turn one because `startsOnMap` was a fact about
 * the faction and both empires had it.
 *
 * **Section 139 took that away**, and rightly: arrival is now a fact about
 * the slot, so a Hive player faces one empire at turn one and the other on a
 * clock like anybody else. The board went to two seats, `state.players[2]`
 * became undefined, and three tests here died in `foundCity` rather than
 * anywhere that would explain why.
 *
 * So it asks for what it actually wants instead of arranging it by side
 * effect: everybody on the map at once, which is exactly what the `ARRIVALS`
 * lever is for. Restored in `afterEach`, because a lever left flipped is the
 * next file's mystery.
 */
afterEach(() => {
  ARRIVALS.enabled = true;
});

function board(): { state: GameState; spy: Unit; theirs: City } {
  ARRIVALS.enabled = false;
  const state = createGame({
    seed: 71,
    width: 40,
    height: 24,
    barbarians: false,
    playerFaction: 'hivekin',
  });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.techs = TECHS.map((t) => t.id);
  }
  const theirs = foundCity(state, spawnUnit(state, 1, 'peasant', 20, 12))!;
  state.units = state.units.filter((u) => u.owner !== 1 || u.x !== theirs.x || u.y !== theirs.y);
  const spy = spawnUnit(state, 0, 'mimic', 19, 12);
  return { state, spy, theirs };
}

describe('asking around', () => {
  it('is offered beside somebody else’s town, with the advance', () => {
    const { state, spy, theirs } = board();
    expect(canAsk(state, spy, theirs).ok).toBe(true);

    const mine = foundCity(state, spawnUnit(state, 0, 'grub', 5, 5))!;
    expect(canAsk(state, spy, mine).reason).toMatch(/at home/i);

    spy.x = 2;
    expect(canAsk(state, spy, theirs).reason).toMatch(/too far/i);
    spy.x = 19;

    state.players[0].techs = state.players[0].techs.filter((t) => t !== 'asking-around');
    expect(canAsk(state, spy, theirs).reason).toMatch(/asking around/i);
  });

  it('comes back with what they make of their neighbours, not of us', () => {
    const { state, spy, theirs } = board();
    // The Kingdom and the Hive fall out; we are not involved.
    noteClash(state, 1, 2);
    const reading = askAround(state, spy, theirs)!;
    expect(reading.about).toBe(1);
    const third = reading.rows.find((r) => r.other === 2);
    expect(third, 'it said nothing about the third party at all').toBeDefined();
    // `fighting`, not "hostile": every pair without a treaty is hostile, so
    // that would have been true of everybody and said nothing.
    expect(third!.fighting).toBe(true);
    const quiet = reading.rows.find((r) => r.other === 0);
    if (quiet) expect(quiet.fighting, 'nobody has shot at us').toBe(false);
    expect(typeof third!.mood).toBe('string');
  });

  it('says nothing about a side they have never met', () => {
    const state = createGame({
      seed: 71,
      width: 40,
      height: 24,
      barbarians: false,
      playerFaction: 'hivekin',
    });
    state.terrain.fill('grass');
    state.units.length = 0;
    state.cities.length = 0;
    state.ruins = [];
    for (const p of state.players) {
      p.explored.fill(1);
      p.visible.fill(1);
      p.techs = TECHS.map((t) => t.id);
    }
    const theirs = foundCity(state, spawnUnit(state, 1, 'peasant', 20, 12))!;
    state.units = state.units.filter((u) => u.owner !== 1 || u.x !== theirs.x || u.y !== theirs.y);
    const spy = spawnUnit(state, 0, 'mimic', 19, 12);
    // Nobody has met anybody: a row of zeroes for a stranger would read as
    // indifference, which is a different thing from never having heard of them.
    const reading = askAround(state, spy, theirs)!;
    expect(reading.rows).toEqual([]);
  });

  it('spends the turn and cannot fail', () => {
    const { state, spy, theirs } = board();
    // Every other rung is a gamble; this is not. You are not doing anything to
    // anybody, so there is nothing to be caught at.
    for (let i = 0; i < 20; i++) {
      spy.moves = 1;
      expect(askAround(state, spy, theirs)).not.toBeNull();
      expect(spy.moves).toBe(0);
    }
  });

  it('is filed, and keeps far longer than a note about a garrison', () => {
    const { state, spy, theirs } = board();
    askAround(state, spy, theirs);
    expect(lastGossip(state, 0, 1)).not.toBeNull();
    expect(GOSSIP.remembers, 'opinions move slower than garrisons').toBeGreaterThan(
      SPY.remembers,
    );
    state.turn += GOSSIP.remembers + 1;
    expect(lastGossip(state, 0, 1)).toBeNull();
  });
});

describe('what the report is worth', () => {
  it('only counts a war we have actually been told about', () => {
    const { state, spy, theirs } = board();
    noteClash(state, 1, 2);
    // **The whole point.** The war is real and on the board; until somebody
    // reports it, this side is not entitled to take advantage of it.
    expect(heardIsDistracted(state, 0, 1)).toBe(false);
    askAround(state, spy, theirs);
    expect(heardIsDistracted(state, 0, 1)).toBe(true);
  });

  it('does not count our own war with them as a distraction', () => {
    const { state, spy, theirs } = board();
    noteClash(state, 0, 1);
    askAround(state, spy, theirs);
    // A side fighting *us* is not a side looking the other way.
    expect(heardIsDistracted(state, 0, 1)).toBe(false);
  });

  it('pulls an army toward a side that is busy elsewhere', () => {
    // Its own board rather than `board()`, so it needs the same three seats
    // for the same reason -- see the note on `board()` about section 139.
    ARRIVALS.enabled = false;
    const state = createGame({
      seed: 71,
      width: 40,
      height: 24,
      barbarians: false,
      playerFaction: 'hivekin',
    });
    expect(state.players, 'three sides, or there is no third party').toHaveLength(3);
    state.terrain.fill('grass');
    state.units.length = 0;
    state.cities.length = 0;
    state.ruins = [];
    for (const p of state.players) {
      p.explored.fill(1);
      p.visible.fill(1);
      p.techs = TECHS.map((t) => t.id);
    }

    // **Distances chosen so the pull can actually change the answer.** The
    // first draft put both towns the same distance away, so the side that
    // would be picked anyway was the side the gossip was about, and the test
    // could not have failed for its own reason. `DISTRACTED_PULL` is 0.75, so
    // the far town has to be inside a quarter of the near one's distance:
    // thirteen against eleven leaves 9.75 against 11, which flips.
    const far = foundCity(state, spawnUnit(state, 1, 'peasant', 8, 12))!;
    const near = foundCity(state, spawnUnit(state, 2, 'peon', 32, 12))!;
    state.units.length = 0;
    const spy = spawnUnit(state, 0, 'mimic', 9, 12);
    const soldier = spawnUnit(state, 0, 'soldier', 21, 12);
    noteClash(state, 0, 1);
    noteClash(state, 0, 2);

    expect(nearestEnemyTarget(state, 0, soldier), 'the nearer town should win to start').toEqual({
      x: near.x,
      y: near.y,
    });

    // Now the far side turns out to have a war on its other flank, and we hear
    // about it.
    noteClash(state, 1, 2);
    askAround(state, spy, far);
    expect(
      nearestEnemyTarget(state, 0, soldier),
      'hearing about their other war changed nothing',
    ).toEqual({ x: far.x, y: far.y });
  });

  it('does nothing at all with the lever off', () => {
    const { state, spy, theirs } = board();
    noteClash(state, 1, 2);
    askAround(state, spy, theirs);
    GOSSIP.enabled = false;
    try {
      expect(canAsk(state, spy, theirs).ok).toBe(false);
      expect(lastGossip(state, 0, 1)).toBeNull();
      expect(heardIsDistracted(state, 0, 1)).toBe(false);
    } finally {
      GOSSIP.enabled = true;
    }
  });

  it('is off with the whole of espionage, too', () => {
    const { state, spy, theirs } = board();
    SPY.enabled = false;
    try {
      expect(canAsk(state, spy, theirs).ok).toBe(false);
    } finally {
      SPY.enabled = true;
    }
  });
});
