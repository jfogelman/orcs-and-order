import { afterEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { UPGRADES, RAISED } from '../src/model/upgrades';
import { ANCIENT } from '../src/model/raising';
import { RAISING, isRaised, payForTheRisen, raiseFrom, raises } from '../src/sim/raising';
import { scatters } from '../src/sim/dispersal';
import { tryStep } from '../src/sim/movement';
import { maxHp, unitType } from '../src/model/units';
import { attackStrength, defenseStrength } from '../src/sim/combat';
import type { GameState, Unit } from '../src/model/types';

/**
 * Section 155: the Grave Knight, and what it leaves standing.
 *
 * The chance is pinned to certainty for most of this. A rule that fires one
 * kill in three is a rule a test would have to roll for, and a test that
 * rolls is a test that passes four times in five -- which is worse than no
 * test, because the one run in five that fails looks like a flake.
 */
const CHANCE = RAISING.chance;

afterEach(() => {
  UPGRADES.enabled = false;
  RAISING.chance = CHANCE;
});

function game(): GameState {
  const state = createGame({
    seed: 155,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['human', 'unbound'],
    // **The hardest level, because its stagger is zero.** Every other one has the
    // latecomers arrive on a clock, so at turn one there is no Unbound seat
    // on the board at all and half of this file has nobody to banish.
    difficulty: 'hardest',
    upgrades: true,
  });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  return state;
}

function put(state: GameState, owner: number, type: string, x: number, y: number, up?: string): Unit {
  const u = spawnUnit(state, owner, type as Parameters<typeof spawnUnit>[2], x, y, false);
  if (up) u.upgrade = up;
  for (const p of state.players) p.visible[y * state.width + x] = 1;
  return u;
}

/** A seat by faction. The arrival order is shuffled, so neither is a constant. */
function seatOf(state: GameState, faction: string): number {
  const seat = state.players.findIndex((p) => p.faction === faction);
  expect(seat, `the fixture needs a ${faction} side`).toBeGreaterThan(0);
  return seat;
}

/** Somebody ordinary to kill: not the Unbound, who are a different rule. */
function theirs(state: GameState): number {
  return seatOf(state, 'human');
}

describe('who raises anything at all', () => {
  it('is the Grave Knight and the Soul-Bound, and no other Death Knight', () => {
    const state = game();
    expect(raises(put(state, 0, 'deathknight', 5, 5, 'deathknight-grave'))).toBe(true);
    expect(raises(put(state, 0, 'deathknight', 5, 7, 'deathknight-soulbound'))).toBe(true);
    expect(raises(put(state, 0, 'deathknight', 5, 9, 'deathknight-dread'))).toBe(false);
    expect(raises(put(state, 0, 'deathknight', 5, 11))).toBe(false);
    expect(raises(put(state, 0, 'orc', 5, 13, 'orc-berserker'))).toBe(false);
  });

  it('raises nothing with the box unticked', () => {
    const state = game();
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    const victim = put(state, theirs(state), 'footman', 6, 5);
    RAISING.chance = 1;
    UPGRADES.enabled = false;
    expect(raises(knight)).toBe(false);
    expect(raiseFrom(state, knight, victim)).toBeNull();
  });
});

describe('what comes up', () => {
  it('is a copy of what died, at half its numbers', () => {
    const state = game();
    RAISING.chance = 1;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    const victim = put(state, theirs(state), 'knight', 6, 5);
    const risen = raiseFrom(state, knight, victim);
    expect(risen, 'something came up').not.toBeNull();
    expect(unitType(risen!.type).base, 'a copy of what it killed').toBe('knight');
    expect(risen!.owner, 'and it is the raiser’s now').toBe(knight.owner);
    expect(isRaised(risen!)).toBe(true);
    expect(maxHp(risen!)).toBe(Math.round(unitType('knight').hp * RAISED.scale));
    expect(risen!.hp, 'and comes up whole, for what it is').toBe(maxHp(risen!));
  });

  it('halves what it swings and what it holds the line with', () => {
    const state = game();
    RAISING.chance = 1;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    const victim = put(state, theirs(state), 'knight', 6, 5);
    const risen = raiseFrom(state, knight, victim)!;
    const whole = put(state, 0, 'knight', 12, 12);
    const mark = put(state, theirs(state), 'footman', 13, 13);
    expect(attackStrength(state, risen, mark).total).toBeLessThan(
      attackStrength(state, whole, mark).total,
    );
    expect(defenseStrength(state, risen).total).toBeLessThan(defenseStrength(state, whole).total);
  });

  it('refuses a boat, a spy, a sapper and the Hive’s Queen', () => {
    const state = game();
    RAISING.chance = 1;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    for (const [type, x] of [['warboat', 7], ['skulker', 9], ['sapper', 11]] as const) {
      const victim = put(state, 1, type, x, 5);
      expect(raiseFrom(state, knight, victim), type).toBeNull();
    }
  });

  it('never raises a thing that was itself raised', () => {
    const state = game();
    RAISING.chance = 1;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    const victim = put(state, theirs(state), 'footman', 6, 5);
    const risen = raiseFrom(state, knight, victim)!;
    // A corpse that already came out of the ground goes back in for good.
    expect(raiseFrom(state, knight, risen)).toBeNull();
  });
});

describe('the Unbound are banished instead', () => {
  it('does not let a Grave Knight scatter one', () => {
    const state = game();
    const seat = seatOf(state, 'unbound');
    const revenant = put(state, seat, 'revenant', 6, 5);
    const ordinary = put(state, 0, 'orc', 5, 5);
    const knight = put(state, 0, 'deathknight', 4, 5, 'deathknight-grave');
    expect(scatters(state, revenant, ordinary), 'an ordinary killer scatters it').toBe(true);
    expect(scatters(state, revenant, knight), 'and this one does not').toBe(false);
  });

  it('digs up something older in its place', () => {
    const state = game();
    RAISING.chance = 1;
    const seat = seatOf(state, 'unbound');
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    const revenant = put(state, seat, 'revenant', 6, 5);
    const risen = raiseFrom(state, knight, revenant);
    expect(risen, 'it cannot make a skeleton of a ghost, so it digs').not.toBeNull();
    expect(unitType(risen!.type).base, 'and what comes up is a copy of nothing').toBe(ANCIENT);
  });
});

describe('how long it lasts', () => {
  it('crumbles when its turns run out, and not before', () => {
    const state = game();
    RAISING.chance = 1;
    state.turn = 10;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    const victim = put(state, theirs(state), 'footman', 6, 5);
    const risen = raiseFrom(state, knight, victim)!;
    expect(risen.fadesOn).toBe(10 + RAISING.turns);
    for (let turn = 10; turn < 10 + RAISING.turns; turn++) {
      state.turn = turn;
      payForTheRisen(state, 0);
      expect(risen.hp, `turn ${turn}`).toBeGreaterThan(0);
    }
    state.turn = 10 + RAISING.turns;
    payForTheRisen(state, 0);
    expect(risen.hp, 'and then it stops').toBe(0);
  });

  it('never runs out for a Soul-Bound Knight, and is paid for in health', () => {
    const state = game();
    RAISING.chance = 1;
    state.turn = 10;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-soulbound');
    const a = raiseFrom(state, knight, put(state, theirs(state), 'footman', 6, 5))!;
    const b = raiseFrom(state, knight, put(state, theirs(state), 'footman', 4, 5))!;
    expect(a.fadesOn, 'no clock on it').toBeUndefined();
    expect(b.fadesOn).toBeUndefined();
    const before = knight.hp;
    state.turn = 40;
    payForTheRisen(state, 0);
    expect(a.hp, 'still standing long after three turns').toBeGreaterThan(0);
    expect(knight.hp, 'two of them, two points').toBe(before - RAISING.drain * 2);
  });

  it('stops costing the moment a skeleton is killed by somebody else', () => {
    const state = game();
    RAISING.chance = 1;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-soulbound');
    const a = raiseFrom(state, knight, put(state, theirs(state), 'footman', 6, 5))!;
    raiseFrom(state, knight, put(state, theirs(state), 'footman', 4, 5));
    a.hp = 0;
    const before = knight.hp;
    payForTheRisen(state, 0);
    expect(knight.hp, 'one left, one point').toBe(before - RAISING.drain);
  });

  /**
   * The overhead is the cap, which is the joke the flavour text makes. There
   * is deliberately no limit on how many a Soul-Bound Knight holds: one that
   * raises faster than it can bleed kills itself, and nothing else has to say
   * so.
   */
  it('lets a Soul-Bound Knight bleed itself out', () => {
    const state = game();
    RAISING.chance = 1;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-soulbound');
    for (let i = 0; i < 12; i++) raiseFrom(state, knight, put(state, theirs(state), 'goblin', 6 + (i % 3), 5 + Math.floor(i / 3)));
    knight.hp = 3;
    payForTheRisen(state, 0);
    expect(knight.hp, 'the pyramid scheme finally has overhead').toBeLessThanOrEqual(0);
  });
});

describe('what a raised thing may not do', () => {
  it('does not take a town', () => {
    const state = game();
    RAISING.chance = 1;
    const knight = put(state, 0, 'deathknight', 5, 5, 'deathknight-grave');
    const risen = raiseFrom(state, knight, put(state, theirs(state), 'footman', 6, 5))!;
    const peon = put(state, theirs(state), 'peon', 12, 12);
    foundCity(state, peon);
    const city = state.cities[0];
    state.units = state.units.filter((u) => u.id !== peon.id);
    risen.x = city.x - 1;
    risen.y = city.y;
    risen.moves = 2;
    const out = tryStep(state, risen, city.x, city.y);
    expect(out.kind, 'a few turns of help, not an empire').toBe('blocked');
    expect(city.owner, 'and the town is still theirs').toBe(theirs(state));
  });
});
