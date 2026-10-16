import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import {
  TURNING,
  askingPrice,
  canTurn,
  collectDebts,
  turnOdds,
  turnUnit,
} from '../src/sim/turning';
import { SPY } from '../src/sim/spying';
import { standing } from '../src/sim/diplomacy';
import { appearsTo, wearDisguise } from '../src/sim/disguise';
import { TECHS } from '../src/model/techs';
import type { GameState, Unit } from '../src/model/types';

/**
 * Section 136 slice 6: buying somebody else's soldier.
 *
 * The rung with a price on it. Everything else a spy does is paid for in
 * turns; this is paid for in gold, and the gold is the dial.
 *
 * The two halves worth testing hardest are the ones that are easy to get
 * subtly wrong: a **delayed** betrayal must leave the unit *entirely theirs*
 * until the day comes, and a **refusal** must always name us, which is the
 * one place in this section where the victim learns who.
 */
function board(): { state: GameState; spy: Unit; target: Unit } {
  const state = createGame({ seed: 53, width: 30, height: 20, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    // Everybody has thought of simply asking.
    p.techs = TECHS.map((t) => t.id);
    p.gold = 2000;
  }
  const spy = spawnUnit(state, 0, 'skulker', 10, 10);
  const target = spawnUnit(state, 1, 'footman', 11, 10);
  return { state, spy, target };
}

/** Force the dice one way or the other without touching the odds model. */
function rig(take: boolean, body: () => void): void {
  const asking = TURNING.atAsking;
  const best = TURNING.best;
  const worst = TURNING.worst;
  TURNING.atAsking = take ? 100 : 0;
  TURNING.best = take ? 1 : 0;
  TURNING.worst = take ? 1 : 0;
  try {
    body();
  } finally {
    TURNING.atAsking = asking;
    TURNING.best = best;
    TURNING.worst = worst;
  }
}

describe('making an offer', () => {
  it('needs a spy, an advance, somebody else’s soldier and a short walk', () => {
    const { state, spy, target } = board();
    expect(canTurn(state, spy, target).ok).toBe(true);

    const soldier = spawnUnit(state, 0, 'goblin', 9, 10);
    expect(canTurn(state, soldier, target).ok).toBe(false);

    const ours = spawnUnit(state, 0, 'orc', 10, 11);
    expect(canTurn(state, spy, ours).reason).toMatch(/already yours/i);

    target.x = 25;
    expect(canTurn(state, spy, target).reason).toMatch(/too far/i);
    target.x = 11;

    state.players[0].techs = state.players[0].techs.filter((t) => t !== 'everyone-has-a-price');
    expect(canTurn(state, spy, target).reason).toMatch(/simply asking/i);
  });

  it('will not try to buy another spy, which is a different decision', () => {
    const { state, spy } = board();
    const theirs = spawnUnit(state, 1, 'factor', 11, 10);
    // Turning somebody's agent is the double, and its own rung.
    expect(canTurn(state, spy, theirs).ok).toBe(false);
    expect(canTurn(state, spy, theirs).reason).toMatch(/same trade/i);
  });

  it('prices the unit, not the agent', () => {
    const { state, spy, target } = board();
    const plain = askingPrice(target);
    target.rank = 3;
    expect(askingPrice(target), 'a veteran knows its own worth').toBeGreaterThan(plain);

    // The agent's rank moves the *odds*, never the asking price: two agents
    // get quoted the same, and what a player turns is what they offer.
    const asked = askingPrice(target);
    spy.rank = 3;
    expect(askingPrice(target)).toBe(asked);
    expect(turnOdds(spy, target, asked)).toBeGreaterThan(turnOdds({ ...spy, rank: 0 }, target, asked));
    void state;
  });

  it('is cheaper if the bill is some other week’s problem', () => {
    const { target } = board();
    expect(askingPrice(target, TURNING.maxDelay)).toBeLessThan(askingPrice(target));
  });

  it('pays more for better odds, and never buys a certainty', () => {
    const { spy, target } = board();
    const ask = askingPrice(target);
    expect(turnOdds(spy, target, ask * 2)).toBeGreaterThan(turnOdds(spy, target, ask));
    expect(turnOdds(spy, target, ask)).toBeGreaterThan(turnOdds(spy, target, ask / 4));
    // Gold is not a win condition.
    expect(turnOdds(spy, target, 99999)).toBeLessThanOrEqual(TURNING.best);
    expect(TURNING.best).toBeLessThan(1);
  });

  it('spends the gold whether they say yes or no', () => {
    const { state, spy, target } = board();
    const ask = askingPrice(target);
    rig(false, () => {
      const purse = state.players[0].gold;
      const out = turnUnit(state, spy, target, ask);
      expect(out.kind).toBe('refused');
      // A refusal is not a refund. A free attempt would be a button to press
      // every turn until it worked.
      expect(state.players[0].gold).toBe(purse - ask);
    });
  });

  it('spends the turn, and never more gold than we have', () => {
    const { state, spy, target } = board();
    state.players[0].gold = 5;
    rig(true, () => {
      turnUnit(state, spy, target, 9999);
      expect(state.players[0].gold).toBe(0);
      expect(spy.moves).toBe(0);
    });
  });
});

describe('what being bought does', () => {
  it('hands the unit over where it stands, when bought outright', () => {
    const { state, spy, target } = board();
    rig(true, () => {
      const out = turnUnit(state, spy, target, askingPrice(target));
      expect(out.kind).toBe('bought');
      expect(target.owner).toBe(0);
      expect(target.moves, 'it does not also get a free turn').toBe(0);
    });
  });

  it('leaves a delayed one entirely theirs until the day comes', () => {
    const { state, spy, target } = board();
    rig(true, () => {
      const out = turnUnit(state, spy, target, askingPrice(target, 6), 6);
      expect(out.kind === 'bought' && out.on).toBe(state.turn + 6);
    });

    // **The half that is easy to get subtly wrong.** It fights for them, is
    // supplied by them and holds their gate, right up until it does not.
    expect(target.owner).toBe(1);
    expect(appearsTo(target, 0).owner).toBe(1);

    collectDebts(state, 1);
    expect(target.owner, 'it turned early').toBe(1);

    state.turn += 6;
    collectDebts(state, 1);
    expect(target.owner, 'the day came and nothing happened').toBe(0);
  });

  it('cannot be bought twice', () => {
    const { state, spy, target } = board();
    rig(true, () => {
      turnUnit(state, spy, target, askingPrice(target, 6), 6);
    });
    expect(canTurn(state, spy, target).ok).toBe(false);
    expect(canTurn(state, spy, target).reason).toMatch(/already bought/i);
  });

  it('forgets whatever it was pretending to be', () => {
    const { state, spy } = board();
    const target = spawnUnit(state, 1, 'footman', 11, 10);
    wearDisguise(state, target, 0);
    rig(true, () => {
      turnUnit(state, spy, target, askingPrice(target));
    });
    // A disguise and the sides that saw through it were facts about somebody
    // else's unit.
    expect(target.disguise).toBeUndefined();
    expect(appearsTo(target, 1)).toEqual({ owner: 0, type: target.type });
  });
});

describe('being refused', () => {
  it('always names us, which nothing else in this section does', () => {
    const { state, spy, target } = board();
    const before = standing(state, 0, 1);
    rig(false, () => {
      turnUnit(state, spy, target, askingPrice(target));
    });

    // Every other rung is anonymous unless caught. This one is not: the thing
    // being bought is a person, and a person who says no has somebody to tell.
    const theirs = state.log.filter((e) => e.player === 1).map((e) => e.text).join(' ');
    expect(theirs).toMatch(/change sides/i);
    expect(theirs, 'they were not told whose offer it was').toContain(state.players[0].name);
    expect(appearsTo(spy, 1)).toEqual({ owner: 0, type: spy.type });
    expect(standing(state, 0, 1)).toBeLessThan(before);
  });

  it('leaves the soldier exactly where it was', () => {
    const { state, spy, target } = board();
    rig(false, () => {
      turnUnit(state, spy, target, askingPrice(target));
    });
    expect(target.owner).toBe(1);
    expect(target.bought).toBeUndefined();
  });
});

describe('the levers', () => {
  it('does nothing at all with turning off', () => {
    const { state, spy, target } = board();
    TURNING.enabled = false;
    try {
      expect(canTurn(state, spy, target).ok).toBe(false);
      const purse = state.players[0].gold;
      expect(turnUnit(state, spy, target, 100).kind).toBe('refused');
      expect(state.players[0].gold, 'it spent money while switched off').toBe(purse);
      expect(spy.moves).toBeGreaterThan(0);
    } finally {
      TURNING.enabled = true;
    }
  });

  it('is off with the whole of espionage, too', () => {
    const { state, spy, target } = board();
    SPY.enabled = false;
    try {
      expect(canTurn(state, spy, target).ok).toBe(false);
    } finally {
      SPY.enabled = true;
    }
  });

  it('collects nothing with the lever off', () => {
    const { state, spy, target } = board();
    rig(true, () => {
      turnUnit(state, spy, target, askingPrice(target, 6), 6);
    });
    state.turn += 6;
    TURNING.enabled = false;
    try {
      collectDebts(state, 1);
      expect(target.owner).toBe(1);
    } finally {
      TURNING.enabled = true;
    }
  });
});
