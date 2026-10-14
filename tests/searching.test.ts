import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import {
  RISK_BANDS,
  SPY,
  SPY_ACTIONS,
  canSearch,
  exposureOdds,
  findOdds,
  riskBand,
  searchFrom,
} from '../src/sim/spying';
import { appearsTo, wearDisguise } from '../src/sim/disguise';
import { idx } from '../src/engine/grid';
import type { GameState, Unit } from '../src/model/types';

/**
 * Section 136 slice 4: looking for somebody who is not what they appear.
 *
 * The counter to slice 1, and the thing that makes a disguise a gamble rather
 * than a free pass. Until this, a lie could only be broken by walking into it
 * -- a fight uncovers a spy to whoever was in it -- so the only way to find an
 * agent was to attack something that turned out to be one.
 */
function board(): { state: GameState; ours: Unit; theirs: Unit } {
  const state = createGame({ seed: 41, width: 30, height: 20, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const ours = spawnUnit(state, 0, 'skulker', 10, 10);
  // Theirs, standing two tiles off and wearing our colours.
  const theirs = spawnUnit(state, 1, 'factor', 12, 10);
  wearDisguise(state, theirs, 0);
  return { state, ours, theirs };
}

/** Run sweeps until one finds the hider, or give up. The dice are tested below. */
function sweepUntilFound(state: GameState, ours: Unit, tries = 200): boolean {
  for (let i = 0; i < tries; i++) {
    ours.moves = 1;
    if (searchFrom(state, ours).kind === 'found') return true;
  }
  return false;
}

describe('searching the ground', () => {
  it('is offered to a spy and to nobody else', () => {
    const { state, ours } = board();
    expect(canSearch(ours).ok).toBe(true);
    const soldier = spawnUnit(state, 0, 'goblin', 9, 10);
    expect(canSearch(soldier).ok).toBe(false);
    expect(canSearch(soldier).reason).toMatch(/only a spy/i);
    ours.moves = 0;
    expect(canSearch(ours).ok).toBe(false);
  });

  it('spends the turn whatever comes of it', () => {
    const { state, ours } = board();
    searchFrom(state, ours);
    expect(ours.moves).toBe(0);
  });

  it('sees through a disguise, and only for the side that looked', () => {
    const { state, ours, theirs } = board();
    expect(appearsTo(theirs, 0).owner, 'it should be passing for ours to start').toBe(0);

    expect(sweepUntilFound(state, ours), 'two hundred sweeps and never a find').toBe(true);

    expect(appearsTo(theirs, 0)).toEqual({ owner: 1, type: 'factor' });
    // Section 135's third party was not standing there and learns nothing.
    expect(appearsTo(theirs, 2).owner).not.toBe(1);
  });

  it('tells the side that was found precisely nothing', () => {
    const { state, ours, theirs } = board();
    const theirLog = () => state.log.filter((e) => e.player === theirs.owner).length;
    const before = theirLog();
    expect(sweepUntilFound(state, ours)).toBe(true);
    // The whole prize is that we know and they do not: they go on walking that
    // agent about believing it still passes. Telling them hands most of it back.
    expect(theirLog(), 'the hider was told it had been seen through').toBe(before);
  });

  it('cannot find what it cannot see', () => {
    const { state, ours, theirs } = board();
    // Out of sight is out of reach, whatever the dice say.
    theirs.x = 25;
    expect(sweepUntilFound(state, ours, 40)).toBe(false);

    // And fog counts, not merely distance: this goes through `seenBy`, the same
    // question every other rule asks.
    //
    // Tested by putting the tile back under fog rather than by burrowing the
    // hider, which was the first draft -- a spy cannot burrow, so `sink` was a
    // no-op and the test was asserting that an ordinary visible unit could not
    // be found. It failed, correctly, and the code was right all along.
    theirs.x = 12;
    state.players[0].visible[idx(theirs.x, theirs.y, state.width)] = 0;
    expect(sweepUntilFound(state, ours, 60), 'it found somebody it could not see').toBe(false);
  });

  it('never bothers with somebody wearing their own face', () => {
    const { state, ours } = board();
    const plain = spawnUnit(state, 1, 'footman', 11, 10);
    // Nothing to see through. A sweep is not a way of finding ordinary units --
    // those were never hidden, and the map already shows them.
    for (let i = 0; i < 40; i++) {
      ours.moves = 1;
      const out = searchFrom(state, ours);
      if (out.kind === 'found') expect(out.found).not.toContain(plain);
    }
  });

  it('is a separate roll per hider, so one find is not two', () => {
    const { state, ours, theirs } = board();
    const second = spawnUnit(state, 1, 'mimic', 10, 11);
    wearDisguise(state, second, 0);

    // One board, swept many times, with both hiders put back under cover
    // between sweeps. The first draft built a *fresh* board each time -- which
    // `createGame` seeds identically, so every iteration replayed the same
    // dice and two hundred tries were one try done two hundred times.
    let alone = 0;
    for (let i = 0; i < 200 && alone === 0; i++) {
      delete theirs.uncoveredBy;
      delete second.uncoveredBy;
      ours.moves = 1;
      const out = searchFrom(state, ours);
      if (out.kind === 'found' && out.found.length === 1) alone++;
    }
    expect(alone, 'two hiders were always found together or not at all').toBeGreaterThan(0);
  });

  it('gets better with rank, on both sides of the question', () => {
    const { ours, theirs } = board();
    const even = findOdds(ours, theirs);
    ours.rank = 3;
    expect(findOdds(ours, theirs), 'a veteran should find more').toBeGreaterThan(even);
    theirs.rank = 3;
    expect(findOdds(ours, theirs), 'and a veteran should be harder to find').toBeCloseTo(even, 6);
    ours.rank = 0;
    expect(findOdds(ours, theirs)).toBeLessThan(even);
  });

  it('leaves nobody certain and nobody impossible', () => {
    const { ours, theirs } = board();
    ours.rank = 50;
    expect(findOdds(ours, theirs)).toBeLessThanOrEqual(SPY.findCap);
    ours.rank = 0;
    theirs.rank = 50;
    expect(findOdds(ours, theirs)).toBeGreaterThanOrEqual(SPY.findFloor);
  });

  it('is the one order on the ladder that costs nothing to try', () => {
    const { ours } = board();
    // Everything else is done *to* somebody and can be traced back. Standing
    // still and paying attention cannot: there is nobody to notice you looking.
    expect(exposureOdds(ours, 'search')).toBe(0);
    expect(riskBand(ours, 'search')).toBe('no risk');
    // And it is said plainly rather than as the mildest band, which would be a
    // small lie about the only free thing here.
    expect(riskBand(ours, 'search')).not.toBe(RISK_BANDS[0].label);
    expect(SPY_ACTIONS.search.ready).toBe(true);
  });

  it('does nothing at all with the lever off', () => {
    const { state, ours, theirs } = board();
    SPY.enabled = false;
    try {
      expect(canSearch(ours).ok).toBe(false);
      const moves = ours.moves;
      expect(searchFrom(state, ours).kind).toBe('nothing');
      expect(ours.moves, 'it should not even have spent the turn').toBe(moves);
      expect(appearsTo(theirs, 0).owner).toBe(0);
    } finally {
      SPY.enabled = true;
    }
  });
});
