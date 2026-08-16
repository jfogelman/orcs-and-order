import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { UNIT_TYPES, unitType } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';
import {
  abilitiesOf,
  abilityReady,
  abilityTargets,
  RANGED_ROUNDS,
  useAbility,
} from '../src/sim/abilities';
import { createGame, recomputeVisibility, spawnUnit } from '../src/sim/gamestate';
import { runAiTurn } from '../src/ai/ai';
import { SFX_FILES } from '../src/audio/audio';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * Targeted abilities: who can be picked, and what happens when they are.
 *
 * The legality rules matter more than the damage here — they are what the
 * interface draws, so a mistake in them is a mistake the player can see and
 * click on.
 */

/**
 * The toughest unit in the game, whatever it happens to be. Picked at runtime
 * rather than named, so re-tuning a count ladder cannot quietly turn "survives
 * a volley" into a test of something much smaller.
 */
const TOUGHEST = Object.values(UNIT_TYPES).reduce((a, b) => (b.hp > a.hp ? b : a)).id;

/** An empty grass board with nothing on it but what a test puts there. */
function board(): GameState {
  const state = createGame({ seed: 31337, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

/** Everything the acting player could possibly see, so fog is not the variable. */
function revealAll(state: GameState, playerId: number): void {
  state.players[playerId].visible.fill(1);
  state.players[playerId].explored.fill(1);
}

describe('which units have a targeted ability', () => {
  it('gives reach to the four ranged creatures and nobody else', () => {
    const state = board();
    const ranged = ['archer', 'mage', 'ballista', 'axethrower'];
    for (const id of ranged) {
      expect(unitType(id).range, `${id} should strike at range`).toBe(2);
    }
    for (const id of ['orc', 'footman', 'knight', 'troll', 'peon']) {
      expect(unitType(id).range, `${id} should have to close`).toBe(1);
      expect(abilitiesOf(spawnUnit(state, 0, id, 1, 1))).toEqual([]);
    }
  });

  it('scales the paladin heal with the size of the group', () => {
    // One patches a unit up to half; two finish the job.
    expect(unitType('paladin').healsTo).toBeCloseTo(0.5);
    expect(unitType('paladin_x2').healsTo).toBeCloseTo(1);
  });
});

describe('legal targets', () => {
  it('is exactly two tiles for a ranged attack, not one and not three', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'archer', 10, 10);
    const adjacent = spawnUnit(state, 0, 'orc', 11, 10);
    const atReach = spawnUnit(state, 0, 'orc', 12, 10);
    const tooFar = spawnUnit(state, 0, 'orc', 13, 10);

    const ids = abilityTargets(state, archer, 'ranged').map((u) => u.id);
    expect(ids).toContain(atReach.id);
    expect(ids).not.toContain(adjacent.id);
    expect(ids).not.toContain(tooFar.id);
  });

  it('measures reach diagonally, the same way movement does', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'archer', 10, 10);
    const diagonal = spawnUnit(state, 0, 'orc', 12, 12);
    expect(abilityTargets(state, archer, 'ranged').map((u) => u.id)).toContain(diagonal.id);
  });

  it('never offers a target the acting player cannot see', () => {
    const state = board();
    const archer = spawnUnit(state, 1, 'archer', 10, 10);
    const hidden = spawnUnit(state, 0, 'orc', 12, 10);
    // Nothing revealed: the archer has no idea anyone is there.
    state.players[1].visible.fill(0);
    expect(abilityTargets(state, archer, 'ranged')).toEqual([]);

    // This is the fog-of-war leak the whole rule exists to prevent: an armed
    // ability must not light up a tile and confirm an enemy is standing on it.
    state.players[1].visible[idx(hidden.x, hidden.y, state.width)] = 1;
    expect(abilityTargets(state, archer, 'ranged').map((u) => u.id)).toEqual([hidden.id]);
  });

  it('will not let a ranged unit shoot its own side', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'archer', 10, 10);
    spawnUnit(state, 1, 'footman', 12, 10);
    expect(abilityTargets(state, archer, 'ranged')).toEqual([]);
  });

  it('offers healing only to wounded neighbours on your own side', () => {
    const state = board();
    revealAll(state, 1);
    const paladin = spawnUnit(state, 1, 'paladin', 10, 10);
    const hurtFriend = spawnUnit(state, 1, 'footman', 11, 10);
    const wellFriend = spawnUnit(state, 1, 'footman', 9, 10);
    const hurtEnemy = spawnUnit(state, 0, 'orc', 10, 11);
    const farFriend = spawnUnit(state, 1, 'footman', 12, 10);
    hurtFriend.hp = 1;
    hurtEnemy.hp = 1;
    farFriend.hp = 1;

    const ids = abilityTargets(state, paladin, 'heal').map((u) => u.id);
    expect(ids).toEqual([hurtFriend.id]);
    expect(ids).not.toContain(wellFriend.id);
    expect(ids).not.toContain(hurtEnemy.id);
    expect(ids).not.toContain(farFriend.id);
  });

  it('will not let a paladin heal itself', () => {
    const state = board();
    revealAll(state, 1);
    const paladin = spawnUnit(state, 1, 'paladin', 10, 10);
    paladin.hp = 1;
    expect(abilityTargets(state, paladin, 'heal')).toEqual([]);
  });

  it('offers nothing once the unit has spent its turn', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'archer', 10, 10);
    spawnUnit(state, 0, 'orc', 12, 10);
    expect(abilityTargets(state, archer, 'ranged')).toHaveLength(1);

    archer.moves = 0;
    expect(abilityReady(archer, 'ranged')).toMatch(/movement/i);
    expect(abilityTargets(state, archer, 'ranged')).toEqual([]);
  });
});

describe('firing at range', () => {
  /** An archer and a target two tiles apart, both fully visible. */
  function range2(targetType = 'orc'): { state: GameState; archer: Unit; target: Unit } {
    const state = board();
    revealAll(state, 0);
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'archer', 10, 10);
    const target = spawnUnit(state, 0, targetType, 12, 10);
    recomputeVisibility(state, 1);
    return { state, archer, target };
  }

  it('never lets the target hit back', () => {
    // The whole point of reach. Run it enough times that a retaliating
    // implementation could not get away with it by luck.
    for (let i = 0; i < 30; i++) {
      const { state, archer, target } = range2('ogre');
      const before = archer.hp;
      useAbility(state, archer, 'ranged', target);
      expect(archer.hp, 'the archer took damage from something it shot at').toBe(before);
    }
  });

  it('spends the whole turn on one shot', () => {
    const { state, archer, target } = range2();
    archer.moves = 3;
    useAbility(state, archer, 'ranged', target);
    expect(archer.moves).toBe(0);
  });

  it('does a few rounds of damage rather than fighting to the death', () => {
    // A big target must survive a single volley, or "3 rounds" means nothing.
    let survived = 0;
    for (let i = 0; i < 20; i++) {
      const { state, archer, target } = range2(TOUGHEST);
      useAbility(state, archer, 'ranged', target);
      if (target.hp > 0) survived++;
    }
    expect(survived, 'a volley wiped out a large unit every time').toBe(20);
  });

  it('caps the damage at the rounds it is allowed', () => {
    const { state, archer, target } = range2(TOUGHEST);
    const before = target.hp;
    const out = useAbility(state, archer, 'ranged', target);
    const perRound = Math.max(
      1,
      Math.round(Math.max(unitType('archer').hp, unitType(TOUGHEST).hp) / 15),
    );
    expect(out.ok).toBe(true);
    expect(before - target.hp).toBeLessThanOrEqual(perRound * RANGED_ROUNDS);
  });

  it('removes a target it kills', () => {
    const { state, archer, target } = range2();
    target.hp = 1;
    const out = useAbility(state, archer, 'ranged', target);
    if (out.killed) {
      expect(state.units.find((u) => u.id === target.id)).toBeUndefined();
    }
  });

  it('refuses a target that is not legal, and changes nothing', () => {
    const { state, archer } = range2();
    const adjacent = spawnUnit(state, 0, 'orc', 11, 10);
    archer.moves = 2;
    const out = useAbility(state, archer, 'ranged', adjacent);
    expect(out.ok).toBe(false);
    expect(adjacent.hp).toBe(unitType('orc').hp);
    expect(archer.moves, 'a refused ability still cost the turn').toBe(2);
  });
});

describe('healing', () => {
  function pair(healer = 'paladin'): { state: GameState; medic: Unit; patient: Unit } {
    const state = board();
    revealAll(state, 1);
    const medic = spawnUnit(state, 1, healer, 10, 10);
    const patient = spawnUnit(state, 1, 'footman', 11, 10);
    return { state, medic, patient };
  }

  it('brings a wounded friend up to half with one paladin', () => {
    const { state, medic, patient } = pair();
    const max = unitType('footman').hp;
    patient.hp = 1;
    useAbility(state, medic, 'heal', patient);
    expect(patient.hp).toBe(Math.round(max * 0.5));
  });

  it('brings them all the way with two', () => {
    const { state, medic, patient } = pair('paladin_x2');
    const max = unitType('footman').hp;
    patient.hp = 1;
    useAbility(state, medic, 'heal', patient);
    expect(patient.hp).toBe(max);
  });

  it('does not injure someone already healthier than the ceiling', () => {
    const { state, medic, patient } = pair();
    const max = unitType('footman').hp;
    patient.hp = max - 1;
    const out = useAbility(state, medic, 'heal', patient);
    expect(out.amount).toBe(0);
    expect(patient.hp, 'healing pulled a healthy unit back down').toBe(max - 1);
  });

  it('costs the healer its turn either way', () => {
    const { state, medic, patient } = pair();
    patient.hp = 1;
    medic.moves = 2;
    useAbility(state, medic, 'heal', patient);
    expect(medic.moves).toBe(0);
  });
});

describe('every sound the simulation asks for actually exists', () => {
  it('emits no cue that is not a real sound id', () => {
    // Two cues were invented while writing the abilities above -- 'combat' and
    // 'heal' -- and neither is a sound the game has. Nothing failed; they just
    // silently did nothing. This is the cheapest possible guard against that,
    // and it covers every cue any rule emits, not only the new ones.
    const known = new Set(Object.keys(SFX_FILES));
    const state = createGame({ seed: 606 });
    state.players[0].controller = 'ai';
    beginPlayerTurn(state, 0);
    for (let i = 0; i < 120 && state.winner === null; i++) {
      runAiTurn(state, state.activePlayer);
      endPlayerTurn(state);
    }
    const bogus = [...new Set(state.log.map((e) => e.cue).filter(Boolean))].filter(
      (c) => !known.has(c as string),
    );
    expect(bogus, `these cues name no sound file: ${bogus.join(', ')}`).toEqual([]);
  });

  it('covers the cues the targeted abilities emit', () => {
    const known = new Set(Object.keys(SFX_FILES));
    // A short AI game will not fire an arrow or heal anyone, so check these
    // two directly rather than hoping the sweep above happened to reach them.
    const state = board();
    revealAll(state, 1);
    const medic = spawnUnit(state, 1, 'paladin', 10, 10);
    const patient = spawnUnit(state, 1, 'footman', 11, 10);
    patient.hp = 1;
    const archer = spawnUnit(state, 1, 'archer', 5, 5);
    const foe = spawnUnit(state, 0, 'orc', 7, 5);
    useAbility(state, medic, 'heal', patient);
    useAbility(state, archer, 'ranged', foe);
    for (const entry of state.log) {
      if (entry.cue) expect(known.has(entry.cue), `no sound named ${entry.cue}`).toBe(true);
    }
  });
});
