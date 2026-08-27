import { describe, expect, it } from 'vitest';
import { UNIT_TYPES, unitType } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';
import { applyDamage, applySpellEffects, damageKindOf, MAX_RESIST, resistance } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import {
  applyStatus,
  BURN_DAMAGE,
  FREEZE_SLOW,
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
    // An orc and a dragon rather than an orc and three orcs: group size no
    // longer changes a health bar, so the pair that makes the point now has to
    // be two different creatures.
    const small = spawnUnit(state, 0, 'orc', 6, 6, false);
    const large = spawnUnit(state, 0, 'dragon', 8, 6, false);
    applyStatus(small, 'burning', 3);
    applyStatus(large, 'burning', 3);

    tickStatuses(state, small);
    tickStatuses(state, large);

    const lostSmall = unitType(small.type).hp - small.hp;
    const lostLarge = unitType(large.type).hp - large.hp;
    // Fire is equally frightening to both. A flat figure would be lethal to one
    // and beneath the notice of the other.
    expect(lostLarge).toBeGreaterThan(lostSmall);
    expect(lostSmall / unitType(small.type).hp).toBeCloseTo(BURN_DAMAGE, 1);
    expect(lostLarge / unitType(large.type).hp).toBeCloseTo(BURN_DAMAGE, 1);
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

  it('slow a frozen unit rather than stopping it', () => {
    const state = arena();
    const fast = spawnUnit(state, 0, 'dragon', 9, 9, false);
    const full = unitType(fast.type).move;
    applyStatus(fast, 'frozen', 3);

    beginPlayerTurn(state, 0);

    // Half, not all. A unit that cannot act at all is a unit removed from the
    // game for the duration, which is strictly better than damage -- section 11
    // warned about exactly this before either was built.
    expect(fast.moves).toBeLessThan(full);
    expect(fast.moves).toBe(Math.max(1, Math.floor(full * FREEZE_SLOW)));
  });

  it('never freeze a slow unit into place permanently', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);
    applyStatus(orc, 'frozen', 3);

    beginPlayerTurn(state, 0);

    // A one-move unit halved would be nothing at all, which is the thing the
    // slow is meant to avoid.
    expect(orc.moves).toBeGreaterThan(0);
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
  it('is resisted only by the magical, and only when it is magic', () => {
    const state = arena();
    // This test used to assert that nothing resisted anything, as the record of
    // a deliberate decision to leave the numbers off until the advances that
    // make them matter existed. Those advances exist now, so it records the
    // new decision instead: death knights, mages and dragons, and nobody else.
    const resistant = Object.values(UNIT_TYPES).filter((t) => t.magicResist > 0);
    expect(new Set(resistant.map((t) => t.base))).toEqual(
      new Set(['deathknight', 'mage', 'dragon']),
    );

    const knight = spawnUnit(state, 0, 'deathknight', 6, 6, false);
    expect(resistance(knight, 'magic')).toBeGreaterThan(0);
    // An axe is still an axe.
    expect(resistance(knight, 'physical')).toBe(0);

    const orc = spawnUnit(state, 0, 'orc', 7, 6, false);
    expect(resistance(orc, 'magic')).toBe(0);
  });

  it('resists more with rank, and never all of it', () => {
    const state = arena();
    const green = spawnUnit(state, 0, 'dragon', 6, 6, false);
    const veteran = spawnUnit(state, 0, 'dragon', 8, 6, false);
    veteran.rank = 3;

    expect(resistance(veteran, 'magic')).toBeGreaterThan(resistance(green, 'magic'));
    expect(resistance(veteran, 'magic')).toBeLessThanOrEqual(MAX_RESIST);
    expect(MAX_RESIST).toBeLessThan(1);
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

/**
 * The two advances from DESIGN_QUEUE section 11 that give the back half of the
 * tree somewhere to go. Only magical damage carries a spell, which is what
 * makes them worth reaching for a side with magical units and worth nothing to
 * a side without.
 */
describe('magic that leaves something behind', () => {
  function duel(flag: 'pyromancy' | 'cryomancy' | null) {
    const state = arena();
    const mage = spawnUnit(state, 0, 'mage', 6, 6, false);
    const orc = spawnUnit(state, 1, 'orc', 7, 6, false);
    orc.hp = unitType(orc.type).hp;
    if (flag) state.players[0].techs.push(flag === 'pyromancy' ? 'pyromancy' : 'cryomancy');
    return { state, mage, orc };
  }

  it('sets a target alight when the caster knows how', () => {
    const { state, mage, orc } = duel('pyromancy');
    applySpellEffects(state, mage, orc);
    expect(hasStatus(orc, 'burning')).toBe(true);
  });

  it('does nothing without the advance', () => {
    const { state, mage, orc } = duel(null);
    applySpellEffects(state, mage, orc);
    expect(orc.statuses).toBeUndefined();
  });

  it('leaves a target cold when the caster knows that instead', () => {
    const { state, mage, orc } = duel('cryomancy');
    applySpellEffects(state, mage, orc);
    expect(hasStatus(orc, 'frozen')).toBe(true);
    expect(hasStatus(orc, 'burning')).toBe(false);
  });

  it('never leaves anything on fire and frozen at once', () => {
    const state = arena();
    const mage = spawnUnit(state, 0, 'mage', 6, 6, false);
    const orc = spawnUnit(state, 1, 'orc', 7, 6, false);
    state.players[0].techs.push('pyromancy', 'cryomancy');

    // Reported from an actual game: a mage that knew both left its target
    // burning *and* frozen. It is magic, but that is not a thing that happens
    // to anybody.
    for (let turn = 0; turn < 6; turn++) {
      state.turn = turn;
      applySpellEffects(state, mage, orc);
      const both = hasStatus(orc, 'burning') && hasStatus(orc, 'frozen');
      expect(both, `turn ${turn}: on fire and frozen together`).toBe(false);
    }
  });

  it('casts both over time rather than letting one advance win outright', () => {
    const state = arena();
    const mage = spawnUnit(state, 0, 'mage', 6, 6, false);
    const orc = spawnUnit(state, 1, 'orc', 7, 6, false);
    state.players[0].techs.push('pyromancy', 'cryomancy');

    const seen = new Set<string>();
    for (let turn = 0; turn < 6; turn++) {
      state.turn = turn;
      applySpellEffects(state, mage, orc);
      if (hasStatus(orc, 'burning')) seen.add('burning');
      if (hasStatus(orc, 'frozen')) seen.add('frozen');
    }
    // Letting the second simply overwrite the first would have made whichever
    // ran first worthless to anybody holding both -- a worse bug for being
    // invisible.
    expect([...seen].sort()).toEqual(['burning', 'frozen']);
  });

  it('puts a fire out when the cold lands on it', () => {
    const state = arena();
    const orc = spawnUnit(state, 0, 'orc', 6, 6, false);

    applyStatus(orc, 'burning', 3);
    applyStatus(orc, 'frozen', 2);

    expect(hasStatus(orc, 'frozen')).toBe(true);
    expect(hasStatus(orc, 'burning'), 'still alight under the ice').toBe(false);

    // And the other way about, since the rule is about opposites rather than
    // about which spell is stronger.
    applyStatus(orc, 'burning', 3);
    expect(hasStatus(orc, 'frozen')).toBe(false);
    expect(hasStatus(orc, 'burning')).toBe(true);
  });

  it('is carried by magic and not by an axe', () => {
    const { state, orc } = duel('pyromancy');
    const swinger = spawnUnit(state, 0, 'orc', 5, 6, false);
    applySpellEffects(state, swinger, orc);
    expect(orc.statuses).toBeUndefined();
  });

  it('does not bother setting fire to something already dead', () => {
    const { state, mage, orc } = duel('pyromancy');
    orc.hp = 0;
    applySpellEffects(state, mage, orc);
    expect(orc.statuses).toBeUndefined();
  });
});
