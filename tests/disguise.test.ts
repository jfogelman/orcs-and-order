import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';
import { nearestEnemyTarget } from '../src/ai/ai';
import {
  DISGUISE,
  appearsTo,
  canDisguise,
  couldWear,
  isDisguised,
  plausibleAs,
  uncover,
  wearDisguise,
} from '../src/sim/disguise';
import { deserialize, serialize } from '../src/persist/save';
import type { GameState } from '../src/model/types';

/**
 * Section 136, slice 1: a unit that is not what it appears to be.
 *
 * The twin of `seenBy`, which answers *can I see it*. This answers *what am I
 * looking at*. Nothing here does anything yet -- a spy cannot read a city or
 * search for anybody -- which is deliberate: the seam is the part with the most
 * ways to go wrong, since every reader of somebody else's unit has to go
 * through it, and a slice that changes what is *shown* and not what is *true*
 * can be checked by finding the truth unmoved.
 */
/** Three sides on the board, so "somebody else" is a real third party. */
function board(): GameState {
  const state = createGame({ seed: 31, width: 30, height: 20, playerFaction: 'hivekin' });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  return state;
}

describe('a unit that is not what it appears to be', () => {
  it('is only offered to spies', () => {
    const state = board();
    expect(canDisguise(spawnUnit(state, 0, 'mimic', 5, 5))).toBe(true);
    expect(canDisguise(spawnUnit(state, 0, 'fodder', 6, 5))).toBe(false);
    expect(canDisguise(spawnUnit(state, 0, 'grub', 7, 5))).toBe(false);
  });

  it('shows the owner the truth and everybody else the lie', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 5, 5);
    expect(wearDisguise(state, spy, 1)).toBe(true);

    // Its own side is never fooled.
    expect(appearsTo(spy, 0)).toEqual({ owner: 0, type: 'mimic' });
    // The side it is pretending to belong to sees one of its own.
    expect(appearsTo(spy, 1).owner).toBe(1);
    expect(appearsTo(spy, 1).type).not.toBe('mimic');
  });

  it('leaves owner and type honest, because every rule is keyed off them', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 5, 5);
    wearDisguise(state, spy, 1);
    // The lie is told to viewers; the unit itself does not move house.
    expect(spy.owner).toBe(0);
    expect(spy.type).toBe('mimic');
  });

  it('takes a side off the AI’s list of things to march at', () => {
    const state = board();
    for (const p of state.players) p.explored.fill(1);
    const soldier = spawnUnit(state, 1, 'goblin', 10, 10);
    const spy = spawnUnit(state, 0, 'mimic', 14, 10);

    // Undisguised, it is the only enemy on the board and so the target.
    expect(nearestEnemyTarget(state, 1, soldier)).toEqual({ x: 14, y: 10 });
    // Wearing their colours, there is nothing to march at.
    wearDisguise(state, spy, 1);
    expect(nearestEnemyTarget(state, 1, soldier)).toBeNull();
  });

  it('is uncovered by contact, and only to the side that touched it', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 10, 10);
    wearDisguise(state, spy, 1);
    const attacker = spawnUnit(state, 1, 'goblin', 9, 10);
    expect(appearsTo(spy, 1).owner).toBe(1);

    tryStep(state, attacker, 10, 10);

    // Whether it survived or not, the Kingdom now knows.
    expect(appearsTo(spy, 1)).toEqual({ owner: 0, type: 'mimic' });
    // And the Hive, who was not there, does not.
    expect(appearsTo(spy, 2).owner).not.toBe(0);
  });

  it('forgets who saw through it when it changes clothes', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 5, 5);
    wearDisguise(state, spy, 1);
    uncover(spy, 1);
    expect(appearsTo(spy, 1).owner).toBe(0);

    // A new disguise is a new lie: what they learned was that *that* goblin
    // was a fake, and it is not a goblin any more.
    wearDisguise(state, spy, 2);
    expect(appearsTo(spy, 1).owner).toBe(2);
  });

  it('can be taken off again, leaving nothing behind', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 5, 5);
    wearDisguise(state, spy, 1);
    expect(isDisguised(spy)).toBe(true);
    expect(wearDisguise(state, spy, null)).toBe(true);
    expect(isDisguised(spy)).toBe(false);
    expect(appearsTo(spy, 1)).toEqual({ owner: 0, type: 'mimic' });
  });

  it('wears something ordinary, never the best thing on the board', () => {
    const state = board();
    const as = plausibleAs(state, 1);
    expect(as).not.toBeNull();
    // The cheapest fighting unit that side can field. A Paladin standing in a
    // border town is not camouflage.
    expect(as).toBe('goblin');
    // And never another spy, which would be a disguise nobody could wear.
    expect(as).not.toBe('skulker');
  });

  it('offers every side worth passing for, including its own', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 5, 5);
    const sides = couldWear(state, spy);
    expect(sides).toContain(0);
    expect(sides).toContain(1);
  });

  it('survives a save and a load, both halves of it', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 5, 5);
    wearDisguise(state, spy, 1);
    uncover(spy, 2);

    const back = deserialize(serialize(state));
    const same = back.units.find((u) => u.id === spy.id)!;
    expect(appearsTo(same, 1).owner).toBe(1);
    expect(appearsTo(same, 2).owner).toBe(0);
  });

  it('is the game as it was with the lever off', () => {
    const state = board();
    const spy = spawnUnit(state, 0, 'mimic', 5, 5);
    wearDisguise(state, spy, 1);
    DISGUISE.enabled = false;
    try {
      expect(appearsTo(spy, 1)).toEqual({ owner: 0, type: 'mimic' });
      expect(isDisguised(spy)).toBe(false);
      expect(canDisguise(spy)).toBe(false);
    } finally {
      DISGUISE.enabled = true;
    }
  });
});
