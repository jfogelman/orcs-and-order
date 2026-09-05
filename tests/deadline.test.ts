import { describe, expect, it } from 'vitest';
import type { Situation } from '../src/model/advisors';
import type { City } from '../src/model/types';
import { ADVISORS, advisorConcern } from '../src/model/advisors';
import { assignWorkers } from '../src/sim/city';
import { createGame } from '../src/sim/gamestate';
import { CLOCK_WARNINGS, endPlayerTurn, turnsLeft } from '../src/sim/turn';

/**
 * A game both sides are still alive in.
 *
 * A player with no cities is eliminated, so a bare `createGame` ends on the
 * first turn and never reaches any of this -- which is what the first version
 * of these tests measured.
 */
function game(turn: number, maxTurns = 300) {
  const state = createGame({ seed: 20260907, width: 24, height: 18, maxTurns });
  state.terrain.fill('grass');
  for (const [i, at] of [[5, 5], [18, 12]].entries()) {
    const c: City = {
      id: i + 1, owner: i, name: `Place ${i}`, x: at[0], y: at[1], size: 4,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1,
    };
    state.cities.push(c);
    assignWorkers(state, c);
  }
  state.turn = turn;
  state.log.length = 0;
  return state;
}

/** Run one whole calendar turn, both sides. */
function nextTurn(state: ReturnType<typeof game>): void {
  for (let i = 0; i < state.players.length; i++) endPlayerTurn(state);
}

const said = (state: ReturnType<typeof game>) => state.log.map((e) => e.text).join(' | ');

/**
 * Reported from play: turn 300 arrives and decides the game on points, and
 * nothing ever mentions it is coming. The dominance clock had exactly this
 * complaint made about it once already -- a countdown nobody can see is
 * indistinguishable from the game stopping for no reason.
 */
describe('the deadline announcing itself', () => {
  it('says so with thirty turns to go', () => {
    const state = game(300 - CLOCK_WARNINGS[0] - 1);
    nextTurn(state);
    expect(turnsLeft(state)).toBe(CLOCK_WARNINGS[0]);
    expect(said(state)).toMatch(/30 turns to the deadline/);
  });

  it('says so again at ten, when the advice changes', () => {
    const state = game(300 - CLOCK_WARNINGS[1] - 1);
    nextTurn(state);
    expect(said(state)).toMatch(/10 turns to the deadline/);
    // Thirty is time to change the standing; ten is time to finish something.
    expect(said(state)).toMatch(/not to start one/);
  });

  it('tells each side where it stands', () => {
    const state = game(300 - CLOCK_WARNINGS[0] - 1);
    nextTurn(state);
    const forEach = state.log.filter((e) => /deadline/.test(e.text));
    expect(forEach).toHaveLength(state.players.length);
    expect(new Set(forEach.map((e) => e.player)).size).toBe(state.players.length);
  });

  it('says it once, not once per player', () => {
    const state = game(300 - CLOCK_WARNINGS[0] - 1);
    nextTurn(state);
    const mine = state.log.filter((e) => e.player === 0 && /deadline/.test(e.text));
    // The dominance countdown said itself six times a turn until it was moved
    // out of `beginPlayerTurn`, which runs once per player.
    expect(mine).toHaveLength(1);
  });

  it('keeps quiet on an ordinary turn', () => {
    const state = game(120);
    nextTurn(state);
    expect(said(state)).not.toMatch(/deadline/);
  });

  it('counts against the limit the game was actually set up with', () => {
    const short = game(150 - CLOCK_WARNINGS[0] - 1, 150);
    nextTurn(short);
    expect(said(short)).toMatch(/30 turns to the deadline/);
  });
});

/** The advisors get the same clock, since being told twice is how it lands. */
describe('what the advisors make of the deadline', () => {
  const base = (over: Partial<Situation>): Situation =>
    ({
      turn: 275, faction: 'orc', deadline: null, cities: 4, rioting: 0, restless: 0,
      starving: 0, gold: 100, goldPerTurn: 2, beakersPerTurn: 5,
      rates: { coin: 4, beakers: 4, calm: 4 }, researching: 'Axes', undefended: 0,
      enemiesSeen: 0, army: 4, magicUnits: 0, rankAndFile: 2, paladins: 0, walled: 0,
      wallsAvailable: false, barracks: 1, coinBuildings: 1, calmBuildings: 1,
      calmAvailable: true, calmNeedsAdvance: null, dominance: null,
      ...over,
    }) as Situation;

  const quartermaster = ADVISORS.find((a) => a.id === 'ogre-quartermaster')!;

  it('has something to say once the clock is close', () => {
    const s = base({ deadline: { turnsLeft: 30, ahead: false, level: false } });
    expect(advisorConcern(quartermaster, s)?.say(s)).toMatch(/30 turns/);
  });

  it('tells you to build rather than fight when you are behind', () => {
    const s = base({ deadline: { turnsLeft: 10, ahead: false, level: false } });
    // Points are citizens, advances and structures; a battle wins none of them.
    expect(advisorConcern(quartermaster, s)?.say(s)).toMatch(/citizens|advances|buildings/i);
  });

  it('says something different when you are ahead', () => {
    const b = base({ deadline: { turnsLeft: 10, ahead: false, level: false } });
    const a = base({ deadline: { turnsLeft: 10, ahead: true, level: false } });
    expect(advisorConcern(quartermaster, a)?.say(a)).not.toBe(advisorConcern(quartermaster, b)?.say(b));
  });

  it('outranks the dominance clock, which is somebody winning rather than time running out', () => {
    const s = base({
      deadline: { turnsLeft: 10, ahead: false, level: false },
      dominance: { turnsLeft: 3, theirs: true },
    });
    // Spoken, so "ten" rather than "10": numbers up to twenty are words here.
    expect(advisorConcern(quartermaster, s)?.say(s)).toMatch(/^Ten turns/i);
  });

  it('stays quiet while the deadline is far off', () => {
    const s = base({ deadline: null, goldPerTurn: 2, gold: 100 });
    expect(advisorConcern(quartermaster, s)?.say(s) ?? '').not.toMatch(/until the ledger|left and we/i);
  });
});
