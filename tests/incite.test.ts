import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { contentLimit, foundCity } from '../src/sim/city';
import { INCITE, canIncite, incite, talkingAlready, unrestBite } from '../src/sim/incite';
import { SPY } from '../src/sim/spying';
import { standing } from '../src/sim/diplomacy';
import { appearsTo } from '../src/sim/disguise';
import { TECHS } from '../src/model/techs';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 136 slice 8: setting a town talking against its own rulers.
 *
 * The thing worth testing hardest is that it takes away **patience** and does
 * not force a riot. A town with room to spare should shrug it off and a town
 * already stretched should tip over, because that difference is the whole
 * judgement the order asks for -- and it is the half that a flag-based
 * implementation would have quietly thrown away.
 */
function board(): { state: GameState; spy: Unit; city: City } {
  const state = createGame({ seed: 83, width: 30, height: 20, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.techs = TECHS.map((t) => t.id);
  }
  const city = foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10))!;
  state.units = state.units.filter((u) => u.owner !== 1 || u.x !== city.x || u.y !== city.y);
  const spy = spawnUnit(state, 0, 'skulker', 11, 10);
  return { state, spy, city };
}

/** Run it until it lands, since the dice are tested on their own below. */
function stirUntilItTakes(state: GameState, spy: Unit, city: City): boolean {
  for (let i = 0; i < 200; i++) {
    spy.moves = 1;
    delete city.unrest;
    if (incite(state, spy, city).kind === 'talking') return true;
  }
  return false;
}

describe('a word in the wrong ear', () => {
  it('needs a spy, the advance and somebody else’s town within reach', () => {
    const { state, spy, city } = board();
    expect(canIncite(state, spy, city).ok).toBe(true);

    const soldier = spawnUnit(state, 0, 'goblin', 11, 10);
    expect(canIncite(state, soldier, city).ok).toBe(false);

    const mine = foundCity(state, spawnUnit(state, 0, 'peon', 20, 10))!;
    expect(canIncite(state, spy, mine).reason).toMatch(/your own people/i);

    spy.x = 2;
    expect(canIncite(state, spy, city).reason).toMatch(/too far/i);
    spy.x = 11;

    state.players[0].techs = state.players[0].techs.filter((t) => t !== 'a-word-in-the-wrong-ear');
    expect(canIncite(state, spy, city).reason).toMatch(/knack/i);
  });

  it('will not be said twice to a town already saying it', () => {
    const { state, spy, city } = board();
    expect(stirUntilItTakes(state, spy, city)).toBe(true);
    spy.moves = 1;
    expect(canIncite(state, spy, city).ok).toBe(false);
    expect(canIncite(state, spy, city).reason).toMatch(/nothing else/i);
  });

  it('takes patience away rather than forcing a riot', () => {
    const { state, spy, city } = board();
    const before = contentLimit(state, city);
    expect(stirUntilItTakes(state, spy, city)).toBe(true);

    // **The half a flag would have thrown away.** It is a subtraction from the
    // limit, so what it does depends on how close the town already was.
    expect(contentLimit(state, city)).toBe(before - INCITE.bite);
    expect(unrestBite(state, city)).toBe(INCITE.bite);
  });

  it('tips a stretched town over and leaves a comfortable one alone', () => {
    const { state, spy, city } = board();
    const limit = contentLimit(state, city);

    // Comfortably inside its patience: it hears the talk and carries on.
    city.size = Math.max(1, limit - INCITE.bite);
    expect(stirUntilItTakes(state, spy, city)).toBe(true);
    expect(city.size > contentLimit(state, city), 'a comfortable town rioted').toBe(false);

    // One short of the edge: the same words tip it over.
    delete city.unrest;
    city.size = limit;
    expect(stirUntilItTakes(state, spy, city)).toBe(true);
    expect(city.size > contentLimit(state, city), 'a stretched town shrugged it off').toBe(true);
  });

  it('wears off, and the town forgets', () => {
    const { state, spy, city } = board();
    const before = contentLimit(state, city);
    expect(stirUntilItTakes(state, spy, city)).toBe(true);
    expect(talkingAlready(state, city)).toBe(true);

    state.turn += INCITE.lasts + 1;
    expect(talkingAlready(state, city)).toBe(false);
    expect(contentLimit(state, city)).toBe(before);
  });

  it('tells them it happened and never tells them whose it was', () => {
    const { state, spy, city } = board();
    expect(stirUntilItTakes(state, spy, city)).toBe(true);
    const theirs = state.log.filter((e) => e.player === city.owner).map((e) => e.text).join(' ');
    expect(theirs).toMatch(/grievances/i);
    // A name is the prize for catching somebody, and nobody was caught.
    expect(theirs).not.toContain(state.players[0].name);
  });
});

describe('being caught at it', () => {
  it('names us and costs their good opinion, but not the agent', () => {
    const { state, spy, city } = board();
    const before = standing(state, 0, 1);
    let caught = false;
    for (let i = 0; i < 300 && !caught; i++) {
      spy.moves = 1;
      delete city.unrest;
      caught = incite(state, spy, city).kind === 'caught';
    }
    expect(caught, 'three hundred attempts and never once noticed').toBe(true);

    expect(appearsTo(spy, 1)).toEqual({ owner: 0, type: spy.type });
    expect(standing(state, 0, 1)).toBeLessThan(before);
    // Unlike sabotage: being the stranger in the market is not being found in
    // somebody's works with your hands full.
    expect(state.units, 'the agent did not come home').toContain(spy);
  });
});

describe('the levers', () => {
  it('does nothing at all with the lever off', () => {
    const { state, spy, city } = board();
    INCITE.enabled = false;
    try {
      expect(canIncite(state, spy, city).ok).toBe(false);
      const moves = spy.moves;
      incite(state, spy, city);
      expect(spy.moves, 'it spent the turn while switched off').toBe(moves);
      expect(city.unrest).toBeUndefined();
    } finally {
      INCITE.enabled = true;
    }
  });

  it('leaves an existing unrest inert with the lever off', () => {
    const { state, spy, city } = board();
    expect(stirUntilItTakes(state, spy, city)).toBe(true);
    const stirred = contentLimit(state, city);
    INCITE.enabled = false;
    try {
      expect(unrestBite(state, city)).toBe(0);
      expect(contentLimit(state, city)).toBe(stirred + INCITE.bite);
    } finally {
      INCITE.enabled = true;
    }
  });

  it('is off with the whole of espionage, too', () => {
    const { state, spy, city } = board();
    SPY.enabled = false;
    try {
      expect(canIncite(state, spy, city).ok).toBe(false);
    } finally {
      SPY.enabled = true;
    }
  });
});
