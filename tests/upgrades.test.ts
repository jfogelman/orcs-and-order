import { describe, expect, it } from 'vitest';
import {
  UPGRADES,
  UPGRADE_DEFS,
  UPGRADES_BY_ID,
  branchesFor,
  upgradesFor,
} from '../src/model/upgrades';
import { TECHS, TECHS_BY_ID } from '../src/model/techs';
import { UNIT_TYPES } from '../src/model/units';
import { FACTIONS } from '../src/model/factions';

/**
 * Section 155 slice 2: the thirty-six upgrades, as data.
 *
 * **This file is almost entirely a list-agreement test**, because that is the
 * failure this project actually has. Thirty-six upgrades, thirty-six advances
 * and thirty-six sprite names have to agree with each other and with tables
 * they do not live in, and sections 141, 144, 147 and 152 are all the same
 * story about what happens when one of them quietly does not.
 *
 * The data was transcribed by script from `art_src/unit upgrades/` rather
 * than retyped, and these assertions are what makes that transcription
 * trustworthy rather than merely convenient.
 */
describe('the unit upgrades, as data', () => {
  it('is off by default, because every balance number was measured without it', () => {
    // Same rule as the raiders. The question this has to answer is "does it
    // work", not "does it move the baseline" -- the baseline is the box
    // unticked, and it has to stay that way until a sweep says otherwise.
    expect(UPGRADES.enabled).toBe(false);
  });

  it('is twelve families of one linear upgrade and two branches', () => {
    const families = new Map<string, string[]>();
    for (const u of UPGRADE_DEFS) {
      const lines = families.get(u.base) ?? [];
      lines.push(u.line);
      families.set(u.base, lines);
    }
    expect(UPGRADE_DEFS).toHaveLength(36);
    expect(families.size).toBe(12);
    const malformed = [...families]
      .filter(([, lines]) => [...lines].sort().join() !== 'a,b,linear')
      .map(([base, lines]) => `${base}: ${lines.join('/')}`);
    expect(malformed, malformed.join('; ')).toEqual([]);
  });

  it('gives every id once, and never one a creature already has', () => {
    const ids = UPGRADE_DEFS.map((u) => u.id);
    expect(new Set(ids).size, 'duplicate upgrade id').toBe(ids.length);
    // An upgrade is a *variant* of a unit, not a new unit. If one of these
    // ever appears in UNIT_TYPES somebody has taken the bible's `units:
    // ['sapper-tunnel']` literally, which is the thirty-six-new-creatures
    // version this was written to avoid.
    const collisions = ids.filter((id) => id in UNIT_TYPES);
    expect(collisions, `these became real unit types: ${collisions.join(', ')}`).toEqual([]);
  });

  it('upgrades a creature that exists, and names its sprite after it', () => {
    const wrong: string[] = [];
    for (const u of UPGRADE_DEFS) {
      if (!(u.base in UNIT_TYPES)) wrong.push(`${u.id}: base ${u.base} is not a unit type`);
      // The renderer resolves art as `<base>-<variant>`, the way
      // `clubVariant()` already does for the ogre's clubs. The id *is* the
      // filename, so a base that is not a prefix of it would silently load
      // the wrong sprite.
      if (!u.id.startsWith(`${u.base}-`)) wrong.push(`${u.id}: not named after ${u.base}`);
      if (!(u.faction in FACTIONS)) wrong.push(`${u.id}: faction ${u.faction} does not exist`);
    }
    expect(wrong, wrong.join('; ')).toEqual([]);
  });

  /**
   * **Both directions**, which is the half that is usually missing.
   *
   * Checking that every upgrade points at a real advance catches a typo.
   * Checking that every upgrade advance is claimed catches the thing that
   * actually happens: somebody adds the thirty-seventh advance, forgets the
   * upgrade entry, and the tree grows a card that unlocks nothing.
   */
  it('pairs each upgrade with an advance, and each advance with an upgrade', () => {
    const problems: string[] = [];
    for (const u of UPGRADE_DEFS) {
      const tech = TECHS_BY_ID[u.needs];
      if (!tech) {
        problems.push(`${u.id}: needs ${u.needs}, which is not an advance`);
        continue;
      }
      if (!tech.flags.includes('upgrade')) {
        problems.push(`${u.id}: ${u.needs} is not flagged as an upgrade advance`);
      }
      if (tech.faction !== u.faction && tech.faction !== 'both') {
        problems.push(`${u.id}: ${u.faction}, but ${u.needs} belongs to ${tech.faction}`);
      }
      if (tech.units.length > 0) {
        problems.push(`${u.needs}: unlocks unit types ${tech.units.join(', ')}; an upgrade is not a creature`);
      }
    }
    const claimed = new Set(UPGRADE_DEFS.map((u) => u.needs));
    for (const t of TECHS) {
      if (t.flags.includes('upgrade') && !claimed.has(t.id)) {
        problems.push(`${t.id}: flagged as an upgrade advance but no upgrade needs it`);
      }
    }
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('can be researched: every upgrade advance roots in the real tree', () => {
    const unreachable: string[] = [];
    for (const u of UPGRADE_DEFS) {
      const seen = new Set<string>();
      const walk = (id: string, depth: number): boolean => {
        if (depth > 40) return false;
        if (seen.has(id)) return true;
        seen.add(id);
        const t = TECHS_BY_ID[id];
        if (!t) return false;
        return t.prereqs.every((p) => walk(p, depth + 1));
      };
      if (!walk(u.needs, 0)) unreachable.push(`${u.id}: ${u.needs} does not root in the tree`);
    }
    expect(unreachable, unreachable.join('; ')).toEqual([]);
  });

  it('offers the linear upgrade first and the two branches as the choice', () => {
    for (const base of new Set(UPGRADE_DEFS.map((u) => u.base))) {
      const all = upgradesFor(base);
      expect(all[0].line, base).toBe('linear');
      expect(branchesFor(base).map((u) => u.line).sort(), base).toEqual(['a', 'b']);
      // A branch is always reached through its family's linear upgrade, so
      // the linear one's advance is on both branches' road.
      const linear = all[0];
      for (const branch of branchesFor(base)) {
        expect(TECHS_BY_ID[branch.needs].prereqs, `${branch.id}`).toContain(linear.needs);
      }
    }
  });

  it('says what each one does, in words meant for a player', () => {
    // Not a length test. The Troll Brute's whole effect is "+2 HP." and that
    // is the right description of it; what would be wrong is a blank, or a
    // sentence the transcription truncated.
    const silent = UPGRADE_DEFS.filter(
      (u) => !u.name || !u.blurb || !u.blurb.endsWith('.') || !/[a-z0-9]/i.test(u.blurb),
    ).map((u) => `${u.id}: ${JSON.stringify(u.blurb)}`);
    expect(silent, `no usable description: ${silent.join('; ')}`).toEqual([]);
    expect(Object.keys(UPGRADES_BY_ID)).toHaveLength(36);
  });
});
