// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ADVISORS, ROLE_TITLES } from '../../src/model/advisors';
import type { AdvisorRole } from '../../src/model/advisors';

/**
 * Who each of them is, said where their name is said.
 *
 * The council showed a name and, under it, a category in small capitals --
 * "Blademaster / MILITARY". That files them; it does not introduce them. A new
 * player looking at six faces wants to know which one to listen to about what,
 * and the post belongs beside the name.
 */
describe('the council', () => {
  it('has a title for every role an advisor can hold', () => {
    const held = new Set<AdvisorRole>(ADVISORS.map((a) => a.role));
    for (const role of held) {
      expect(ROLE_TITLES[role], role).toBeTruthy();
      // A post, not a category: every one of them says what they advise *on*.
      expect(ROLE_TITLES[role]).toMatch(/Advisor$/);
    }
  });

  it('calls the military one the War Advisor, which is what he advises about', () => {
    expect(ROLE_TITLES.military).toBe('War Advisor');
    expect(ROLE_TITLES.diplomacy).toBe('Diplomacy Advisor');
  });

  it('gives every faction a full council, so nobody meets a blank', () => {
    const byFaction = new Map<string, Set<AdvisorRole>>();
    for (const a of ADVISORS) {
      if (!byFaction.has(a.faction)) byFaction.set(a.faction, new Set());
      byFaction.get(a.faction)!.add(a.role);
    }
    for (const [faction, roles] of byFaction) {
      for (const role of roles) expect(ROLE_TITLES[role], `${faction} ${role}`).toBeTruthy();
    }
  });
});
