import { afterEach, describe, expect, it } from 'vitest';
import type { City, GameState, Unit } from '../src/model/types';
import { BARBARIANS, RAIDER } from '../src/sim/barbarians';
import { INTIMIDATE, RAIDER_TIERS } from '../src/sim/wilds';
import { COWED, applyStatus, hasStatus, statusTurns } from '../src/sim/status';
import { attackStrength } from '../src/sim/combat';
import { assignWorkers } from '../src/sim/city';
import { barbarianOf, createGame, spawnUnit } from '../src/sim/gamestate';
import { beginPlayerTurn } from '../src/sim/turn';

/**
 * Section 121: the Ogre Clan Brute's trick out of the raider bible -- units
 * next to it attack at -1 next turn.
 *
 * The first status in the game that touches a number rather than movement,
 * health or healing, which is what the queue said it was waiting on.
 */

const saved = { ...INTIMIDATE };
afterEach(() => {
  Object.assign(INTIMIDATE, saved);
});

function game(): GameState {
  const state = createGame({ seed: 20260924, width: 40, height: 30, barbarians: true });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const [i, at] of [[5, 5], [30, 22]].entries()) {
    const c: City = {
      id: i + 1, owner: i, name: `Place ${i}`, x: at[0], y: at[1], size: 4,
      food: 0, shields: 0, buildings: ['granary'], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: i,
    };
    state.cities.push(c);
    assignWorkers(state, c);
  }
  const blank = () => new Array(state.width * state.height).fill(0);
  state.roads = blank();
  state.posts = blank();
  state.irrigation = blank();
  state.mines = blank();
  state.turn = BARBARIANS.notBefore;
  state.log.length = 0;
  return state;
}

/**
 * A brute in open ground with one of ours beside it, at the top of our turn --
 * which is when the question is asked.
 */
function bellowed(): { state: GameState; orc: Unit; brute: Unit } {
  const state = game();
  const wild = barbarianOf(state)!;
  const brute = spawnUnit(state, wild.id, RAIDER_TIERS.elite.id, 15, 15, false);
  const orc = spawnUnit(state, 0, 'orc', 15, 16, false);
  beginPlayerTurn(state, 0);
  return { state, orc, brute };
}

describe('standing next to an ogre', () => {
  it('leaves you swinging softly', () => {
    const { orc } = bellowed();
    expect(hasStatus(orc, 'cowed')).toBe(true);
  });

  it('is what the fight actually uses', () => {
    const { state, orc, brute } = bellowed();
    const cowed = attackStrength(state, orc, brute);
    // The same unit, two tiles further out, over the shouting. Compared as a
    // ratio rather than a difference: everything else on the line -- supply,
    // rank, the ground -- multiplies, and it is the base this comes off.
    const clear = spawnUnit(state, 0, 'orc', 15, 13, false);
    const full = attackStrength(state, clear, brute);
    const base = full.base;
    expect(cowed.cowed).toBe(true);
    expect(full.cowed).toBe(false);
    expect(cowed.total / full.total).toBeCloseTo((base - COWED.attack) / base, 5);
  });

  it('lasts the turn it was given for, and is asked again the next', () => {
    const { state, orc, brute } = bellowed();
    expect(statusTurns(orc, 'cowed')).toBe(1);
    // Still standing there next morning: still cowed, freshly.
    beginPlayerTurn(state, 0);
    expect(hasStatus(orc, 'cowed')).toBe(true);
    // Ogre gone, and so is the shouting.
    state.units = state.units.filter((u) => u !== brute);
    beginPlayerTurn(state, 0);
    expect(hasStatus(orc, 'cowed')).toBe(false);
  });

  it('is over the moment you walk away from it', () => {
    const { state, orc } = bellowed();
    orc.y += 4;
    beginPlayerTurn(state, 0);
    expect(hasStatus(orc, 'cowed')).toBe(false);
  });

  it('never takes the cheapest unit below swinging at all', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const brute = spawnUnit(state, wild.id, RAIDER_TIERS.elite.id, 15, 15, false);
    // A Goblin attacks at one, and the floor is one: it is made no worse rather
    // than switched off. Section 120 is the standing warning about rules from
    // the wilds that land on whoever fields the cheap units, which is the Horde.
    const goblin = spawnUnit(state, 0, 'goblin', 15, 16, false);
    const spare = spawnUnit(state, 0, 'goblin', 15, 13, false);
    applyStatus(goblin, 'cowed', INTIMIDATE.turns);
    expect(attackStrength(state, goblin, brute).total).toBeGreaterThan(0);
    expect(attackStrength(state, goblin, brute).total).toBeCloseTo(
      attackStrength(state, spare, brute).total,
      5,
    );
  });

  it('does not make the brute itself swing any harder', () => {
    const { state, orc, brute } = bellowed();
    expect(hasStatus(brute, 'cowed')).toBe(false);
    expect(attackStrength(state, brute, orc).cowed).toBe(false);
  });

  it('says so, once, however many of ours are standing there', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    spawnUnit(state, wild.id, RAIDER_TIERS.elite.id, 15, 15, false);
    spawnUnit(state, 0, 'orc', 15, 16, false);
    spawnUnit(state, 0, 'orc', 16, 16, false);

    beginPlayerTurn(state, 0);

    const told = state.log.filter((e) => /bellow|shouting/i.test(e.text));
    expect(told).toHaveLength(1);
    expect(told[0].player).toBe(0);
  });

  it('does not bother marking somebody who cannot be made worse', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    spawnUnit(state, wild.id, RAIDER_TIERS.elite.id, 15, 15, false);
    // A Goblin swings at one, which is the floor: there is nothing to take off
    // it, and a panel reading "swings softly" over an unchanged number would be
    // the interface telling a lie.
    const goblin = spawnUnit(state, 0, 'goblin', 15, 16, false);
    const peon = spawnUnit(state, 0, 'peon', 16, 16, false);
    const orc = spawnUnit(state, 0, 'orc', 14, 16, false);

    beginPlayerTurn(state, 0);

    expect(hasStatus(goblin, 'cowed')).toBe(false);
    expect(hasStatus(peon, 'cowed')).toBe(false);
    expect(hasStatus(orc, 'cowed')).toBe(true);
    expect(state.log.filter((e) => /bellow|shouting/i.test(e.text))).toHaveLength(1);
  });

  it('is only the brute that does it', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    spawnUnit(state, wild.id, RAIDER, 15, 15, false);
    const orc = spawnUnit(state, 0, 'orc', 15, 16, false);

    beginPlayerTurn(state, 0);

    expect(hasStatus(orc, 'cowed')).toBe(false);
  });
});

describe('the lever', () => {
  it('off, a brute is just a hard unit again', () => {
    INTIMIDATE.enabled = false;
    const { orc } = bellowed();
    expect(hasStatus(orc, 'cowed')).toBe(false);
  });
});
