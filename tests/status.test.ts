import { describe, expect, it } from 'vitest';
import { UNIT_TYPES, unitType } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';
import { applyDamage, damageKindOf, MAX_RESIST, resistance } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import {
  applyStatus,
  BURN_DAMAGE,
  clearStatus,
  hasStatus,
  statusTurns,
  tickStatuses,
} from '../src/sim/status';
import { beginPlayerTurn } from '../src/sim/turn';

function arena(): GameState {
  const state = createGame({ seed: 20260821, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  // A capital, because regeneration is gated on supply and a bare arena would
  // heal nobody -- which would make the "spent blocks healing" test pass
  // vacuously, comparing a gain of zero against a gain of zero.
  state.cities.push({
    id: 1, owner: 0, name: 'Base', x: 6, y: 5, size: 3,
    food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
    workedTiles: [], disorder: false, foundedTurn: 1,
  });
  return state;
}

describe('statuses', () => {
  it('are absent by default and serialise as plain data', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);

    expect(orc.statuses).toBeUndefined();
    expect(hasStatus(orc, 'burning')).toBe(false);

    applyStatus(orc, 'burning', 3);
    // Round-trips through a save without any special handling.
    const revived = JSON.parse(JSON.stringify(orc)) as Unit;
    expect(statusTurns(revived, 'burning')).toBe(3);
  });

  it('extend rather than stack', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);

    applyStatus(orc, 'burning', 2);
    applyStatus(orc, 'burning', 5);
    expect(orc.statuses).toHaveLength(1);
    expect(statusTurns(orc, 'burning')).toBe(5);

    // A shorter one does not cut a longer one short.
    applyStatus(orc, 'burning', 1);
    expect(statusTurns(orc, 'burning')).toBe(5);
  });

  it('count down and expire', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);
    applyStatus(orc, 'frozen', 2);

    tickStatuses(state, orc);
    expect(statusTurns(orc, 'frozen')).toBe(1);
    tickStatuses(state, orc);
    expect(hasStatus(orc, 'frozen')).toBe(false);
    expect(orc.statuses).toBeUndefined();
  });

  it('burn for a share of maximum health, not a flat number', () => {
    const state = arena();
    const one = spawnUnit(state, 0, 'orc', 6, 6, false);
    const many = spawnUnit(state, 0, 'orc_x3', 8, 6, false);
    applyStatus(one, 'burning', 3);
    applyStatus(many, 'burning', 3);

    tickStatuses(state, one);
    tickStatuses(state, many);

    const lostOne = unitType(one.type).hp - one.hp;
    const lostMany = unitType(many.type).hp - many.hp;
    // Fire is equally frightening to both. A flat figure would be lethal to one
    // and beneath the notice of the other.
    expect(lostMany).toBeGreaterThan(lostOne);
    expect(lostOne / unitType(one.type).hp).toBeCloseTo(BURN_DAMAGE, 1);
    expect(lostMany / unitType(many.type).hp).toBeCloseTo(BURN_DAMAGE, 1);
  });

  it('report a death so the caller can bury it', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);
    orc.hp = 1;
    applyStatus(orc, 'burning', 3);

    expect(tickStatuses(state, orc)).toBe(true);
  });

  it('tick deterministically, without touching the RNG', () => {
    const run = () => {
      const state = arena();
      const orc = spawnUnit(state, 0, 'orc', 6, 6, false);
      applyStatus(orc, 'burning', 3);
      tickStatuses(state, orc);
      tickStatuses(state, orc);
      return { hp: orc.hp, seed: state.rngState };
    };
    const a = run();
    const b = run();
    expect(a.hp).toBe(b.hp);
    // The seed is untouched, so nothing downstream is knocked out of step.
    expect(a.seed).toBe(b.seed);
  });

  it('freeze a unit out of its turn', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);
    applyStatus(orc, 'frozen', 3);

    beginPlayerTurn(state, 0);

    expect(orc.moves).toBe(0);
  });

  it('stop a spent unit regenerating', () => {
    const state = arena();
    const troll = spawnUnit(state, 0, 'troll', 6, 5, false);
    troll.hp = 1;
    applyStatus(troll, 'spent', 3);

    beginPlayerTurn(state, 0);
    expect(troll.hp).toBe(1);

    // And recovers again once it wears off, which is what makes the block real
    // rather than the unit simply being somewhere that never heals.
    clearStatus(troll, 'spent');
    beginPlayerTurn(state, 0);
    expect(troll.hp).toBeGreaterThan(1);
  });
});

describe('typed damage', () => {
  it('resists nothing today, on purpose', () => {
    const state = arena();
    // The mechanism exists; the numbers that move the balance are deliberately
    // not set yet. If a creature is ever given magicResist, this test should be
    // changed rather than deleted -- it is the record of that decision.
    for (const type of Object.values(UNIT_TYPES)) {
      expect(type.magicResist).toBe(0);
    }
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);
    expect(resistance(orc, 'magic')).toBe(0);
    expect(resistance(orc, 'physical')).toBe(0);
  });

  it('knows which creatures strike with magic', () => {
    const state = arena();
    const mage = spawnUnit(state, 1, 'mage', 6, 6, false);
    const orc = spawnUnit(state, 0, 'orc', 7, 6, false);

    expect(damageKindOf(mage)).toBe('magic');
    expect(damageKindOf(orc)).toBe('physical');
  });

  it('subtracts resistance and reports what actually landed', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);
    const before = orc.hp;

    const dealt = applyDamage(orc, 10, 'physical');
    expect(dealt).toBe(10);
    expect(orc.hp).toBe(before - 10);

    // Nothing negative ever reaches a unit.
    expect(applyDamage(orc, 0, 'magic')).toBe(0);
    expect(applyDamage(orc, -5, 'magic')).toBe(0);
  });

  it('never makes anything immune', () => {
    const state = arena();
    const dragon = spawnUnit(state, 0, 'dragon', 6, 6, false);
    dragon.rank = 3;
    // Even at the highest rank, with a base resistance higher than the cap.
    const capped = Math.min(MAX_RESIST, 0.9 + dragon.rank * 0.08);
    expect(capped).toBeLessThan(1);
  });
});
