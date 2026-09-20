import { describe, expect, it } from 'vitest';
import { RAIDER, RAIDER_TIERS, bountyFor, waveRoster } from '../src/sim/barbarians';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';
import { addRaiders } from '../src/sim/barbarians';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';

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
