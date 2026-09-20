import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RAIDER,
  RAIDER_TIERS,
  bandSize,
  bountyFor,
  runRaiders,
  summonDue,
  trySummon,
  watchedFromATown,
  waveRoster,
} from '../src/sim/barbarians';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';
import { addRaiders } from '../src/sim/barbarians';
import { unitType } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';

/** A game with the wilds in it, and both empires at a chosen number of advances. */
function wilds(advances: number): GameState {
  const state = createGame({ seed: 4, width: 24, height: 18, barbarians: true });
  state.terrain.fill('grass');
  state.units.length = 0;
  for (const p of state.players) {
    if (p.barbarian) continue;
    p.techs = Array.from({ length: advances }, (_, i) => `t${i}` as never);
  }
  return state;
}

describe('the wilds grow with the empires (section 115)', () => {
  it('sends grunts only while the world is young', () => {
    const roster = waveRoster(wilds(3), 4);
    expect(roster).toEqual([RAIDER, RAIDER, RAIDER, RAIDER]);
  });

  it('adds a brute once both sides are some way along', () => {
    const roster = waveRoster(wilds(RAIDER_TIERS.elite.from), 4);
    expect(roster).toContain(RAIDER_TIERS.elite.id);
    expect(roster.filter((r) => r === RAIDER_TIERS.leader.id)).toHaveLength(0);
    // Still mostly grunts: the wave gets harder, not replaced.
    expect(roster.filter((r) => r === RAIDER).length).toBeGreaterThanOrEqual(2);
  });

  it('puts a chieftain at the head of a late wave, and only ever one', () => {
    const state = wilds(RAIDER_TIERS.leader.from);
    const roster = waveRoster(state, 4);
    expect(roster[0]).toBe(RAIDER_TIERS.leader.id);
    // One already out there means the next wave has none.
    spawnUnit(state, 0, RAIDER_TIERS.leader.id, 5, 5);
    expect(waveRoster(state, 4)).not.toContain(RAIDER_TIERS.leader.id);
  });

  it('never sends more than the wave holds', () => {
    for (const size of [1, 2, 3, 5]) {
      expect(waveRoster(wilds(40), size)).toHaveLength(size);
    }
  });

  it('is switched off in one place, for a sweep', () => {
    RAIDER_TIERS.enabled = false;
    try {
      expect(waveRoster(wilds(40), 3)).toEqual([RAIDER, RAIDER, RAIDER]);
      expect(bountyFor({ type: RAIDER_TIERS.leader.id } as never)).toBe(0);
    } finally {
      RAIDER_TIERS.enabled = true;
    }
  });
});

describe('what a dead raider was carrying', () => {
  function fight(raiderType: string): { gold: number; before: number } {
    const state = createGame({ seed: 4, width: 24, height: 18, barbarians: true });
    state.terrain.fill('grass');
    state.units.length = 0;
    addRaiders(state, state.width * state.height, (id) => ({
      ...state.players[0],
      id,
      techs: [],
      units: [],
    }) as never);
    const wild = state.players.find((p) => p.barbarian)!;
    const hero = spawnUnit(state, 0, 'ogre', 5, 5);
    const victim = spawnUnit(state, wild.id, raiderType as never, 6, 5);
    victim.hp = 1;
    const before = state.players[0].gold;
    hero.moves = 9;
    for (let i = 0; i < 12 && state.units.includes(victim); i++) {
      hero.moves = 9;
      hero.hp = unitType(hero.type).hp;
      tryStep(state, hero, 6, 5);
    }
    expect(state.units.includes(victim)).toBe(false);
    return { gold: state.players[0].gold, before };
  }

  it('pays for a chieftain, and less for a brute', () => {
    const chief = fight(RAIDER_TIERS.leader.id);
    expect(chief.gold - chief.before).toBe(RAIDER_TIERS.leader.bounty);
    const brute = fight(RAIDER_TIERS.elite.id);
    expect(brute.gold - brute.before).toBe(RAIDER_TIERS.elite.bounty);
  });

  it('pays nothing for a grunt', () => {
    const grunt = fight(RAIDER);
    expect(grunt.gold).toBe(grunt.before);
  });
});

/**
 * Jeremy's design for the chieftain's summons (2026-09-20): the tile limit caps
 * it, it may only call somebody onto free land beside it, and never where a
 * *city* can see it -- so it has to retreat to grow. A unit walking past does
 * not stop it; a town does.
 */
describe('the chieftain calls somebody up', () => {
  // Switched off in the shipped game -- three sweeps put it on the Horde's side
  // of the scales -- so these turn it on to test the rule itself. The switch
  // being obeyed is its own test, below.
  beforeEach(() => {
    RAIDER_TIERS.leader.summons = true;
  });
  afterEach(() => {
    RAIDER_TIERS.leader.summons = false;
  });

  function lair(): { state: GameState; chief: Unit } {
    const state = createGame({ seed: 9, width: 30, height: 20, barbarians: true });
    state.terrain.fill('grass');
    state.units.length = 0;
    state.cities.length = 0;
    const wild = state.players.find((p) => p.barbarian) ?? state.players[0];
    const chief = spawnUnit(state, wild.id, RAIDER_TIERS.leader.id, 15, 10);
    state.turn = 40;
    return { state, chief };
  }

  it('calls one up out in the wilds, then waits its turns', () => {
    const { state, chief } = lair();
    expect(trySummon(state, chief)).not.toBeNull();
    expect(state.units.filter((u) => u.type === RAIDER).length).toBe(1);
    // Not again the very next turn.
    state.turn += 1;
    expect(summonDue(state, chief)).toBe(false);
    expect(trySummon(state, chief)).toBeNull();
    state.turn += RAIDER_TIERS.leader.summonEvery;
    expect(trySummon(state, chief)).not.toBeNull();
  });

  it('will not do it where a town can see it', () => {
    const { state, chief } = lair();
    state.cities.push({
      id: 1, owner: 0, name: 'Watchpost', x: chief.x + 2, y: chief.y, size: 3, food: 0,
      shields: 0, buildings: [], producing: { kind: 'coin' }, workedTiles: [],
      disorder: false, foundedTurn: 1,
    } as never);
    expect(watchedFromATown(state, chief.x, chief.y)).toBe(true);
    expect(trySummon(state, chief)).toBeNull();
    // It backs off, and once it is clear of the town it can call somebody.
    runRaiders(state, chief.owner);
    expect(watchedFromATown(state, chief.x, chief.y)).toBe(false);
    chief.moves = 2;
    expect(trySummon(state, chief)).not.toBeNull();
  });

  it('is not stopped by a unit standing next to it', () => {
    const { state, chief } = lair();
    spawnUnit(state, 0, 'outrider', chief.x + 1, chief.y);
    expect(trySummon(state, chief)).not.toBeNull();
  });

  it('is capped by the tiles around it', () => {
    const { state, chief } = lair();
    // Hemmed in on all eight sides: nowhere for anybody to stand.
    for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      spawnUnit(state, chief.owner, RAIDER, chief.x + dx, chief.y + dy);
    }
    expect(trySummon(state, chief)).toBeNull();
  });

  it('stops calling once the wilds already have a band', () => {
    const { state, chief } = lair();
    // The cap counts every raider in the world, not this chieftain's own.
    for (let i = 0; i < RAIDER_TIERS.leader.bandCap; i++) {
      spawnUnit(state, chief.owner, RAIDER, 2 + i, 2);
    }
    expect(bandSize(state, chief.owner)).toBeGreaterThanOrEqual(RAIDER_TIERS.leader.bandCap);
    expect(trySummon(state, chief)).toBeNull();
    // Cut them down and it starts again: this is a cap, not a one-off.
    state.units = state.units.filter((u) => u.type !== RAIDER || u.id === chief.id);
    expect(trySummon(state, chief)).not.toBeNull();
  });

  it('calls nobody at all while the summons are switched off', () => {
    const { state, chief } = lair();
    RAIDER_TIERS.leader.summons = false;
    expect(summonDue(state, chief)).toBe(false);
    expect(trySummon(state, chief)).toBeNull();
  });

  it('calls nobody while the tiers are switched off', () => {
    const { state, chief } = lair();
    RAIDER_TIERS.enabled = false;
    try {
      expect(trySummon(state, chief)).toBeNull();
    } finally {
      RAIDER_TIERS.enabled = true;
    }
  });
});
