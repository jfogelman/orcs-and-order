import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/model/buildings';
import { FACTIONS, FACTION_IDS } from '../src/model/factions';
import { TECHS, TECHS_BY_ID, techsForFaction } from '../src/model/techs';
import { UNIT_TYPES } from '../src/model/units';

/**
 * The tech tree is hand-written data, which is exactly the kind of thing that
 * rots silently. These tests are the guardrail: a typo in a prerequisite or a
 * unit id that no longer exists fails here rather than in a player's game.
 */
describe('tech graph integrity', () => {
  it('has unique ids', () => {
    const ids = TECHS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references only advances that exist', () => {
    for (const t of TECHS) {
      for (const p of t.prereqs) {
        expect(TECHS_BY_ID[p], `${t.id} requires unknown advance ${p}`).toBeDefined();
      }
    }
  });

  it('references only unit types that exist', () => {
    for (const t of TECHS) {
      for (const u of t.units) {
        expect(UNIT_TYPES[u], `${t.id} unlocks unknown unit ${u}`).toBeDefined();
      }
    }
  });

  it('references only buildings that exist', () => {
    for (const t of TECHS) {
      for (const b of t.buildings) {
        expect(BUILDINGS[b], `${t.id} unlocks unknown building ${b}`).toBeDefined();
      }
    }
  });

  it('only unlocks units its own faction can use', () => {
    for (const t of TECHS) {
      if (t.faction === 'both') continue;
      for (const u of t.units) {
        expect(UNIT_TYPES[u].faction, `${t.id} unlocks ${u} for the wrong faction`).toBe(
          t.faction,
        );
      }
    }
  });

  it('is acyclic', () => {
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string, trail: string[]): void => {
      const seen = state.get(id);
      if (seen === 'done') return;
      if (seen === 'visiting') {
        throw new Error(`Cycle in tech tree: ${[...trail, id].join(' -> ')}`);
      }
      state.set(id, 'visiting');
      for (const p of TECHS_BY_ID[id].prereqs) visit(p, [...trail, id]);
      state.set(id, 'done');
    };
    expect(() => TECHS.forEach((t) => visit(t.id, []))).not.toThrow();
  });

  it('leaves every advance reachable from a faction starting point', () => {
    for (const faction of FACTION_IDS) {
      const known = new Set<string>([FACTIONS[faction].startTech]);
      const pool = techsForFaction(faction);
      let progress = true;
      while (progress) {
        progress = false;
        for (const t of pool) {
          if (known.has(t.id)) continue;
          if (t.prereqs.every((p) => known.has(p))) {
            known.add(t.id);
            progress = true;
          }
        }
      }
      const stranded = pool.filter((t) => !known.has(t.id)).map((t) => t.id);
      expect(stranded, `unreachable for ${faction}`).toEqual([]);
    }
  });

  it('gives both factions a full counting ladder', () => {
    // The joke only works if you can actually climb it.
    const orcLadder = ['orc', 'orc_x2', 'orc_x3', 'orc_x4', 'orc_x6', 'orc_x8', 'orc_x10'];
    const humanLadder = ['footman', 'footman_x2', 'footman_x3', 'footman_x5', 'footman_x10'];
    const unlockedBy = (ids: string[]) =>
      ids.every((id) => TECHS.some((t) => t.units.includes(id)));
    expect(unlockedBy(orcLadder)).toBe(true);
    expect(unlockedBy(humanLadder)).toBe(true);
  });
});

describe('unit type generation', () => {
  it('scales stats linearly with the size of the group', () => {
    const one = UNIT_TYPES.orc;
    const ten = UNIT_TYPES.orc_x10;
    expect(ten.attack).toBe(one.attack * 10);
    expect(ten.defense).toBe(one.defense * 10);
    expect(ten.hp).toBe(one.hp * 10);
    expect(ten.cost).toBe(one.cost * 10);
  });

  it('names groups in words', () => {
    expect(UNIT_TYPES.orc.name).toBe('Orc');
    expect(UNIT_TYPES.orc_x2.name).toBe('Two Orcs');
    expect(UNIT_TYPES.orc_x10.name).toBe('Ten Orcs');
    expect(UNIT_TYPES.footman_x5.name).toBe('Five Footmen');
  });

  it('marks groups of five or more as crowded', () => {
    expect(UNIT_TYPES.orc_x4.crowded).toBe(false);
    expect(UNIT_TYPES.orc_x6.crowded).toBe(true);
    expect(UNIT_TYPES.footman_x5.crowded).toBe(true);
  });
});
