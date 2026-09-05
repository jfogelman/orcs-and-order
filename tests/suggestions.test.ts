import { describe, expect, it } from 'vitest';
import { ADVISORS } from '../src/model/advisors';
import { advisorSuggestions } from '../src/model/suggestions';
import { techsForFaction } from '../src/model/techs';
import type { TechDef } from '../src/model/techs';
import { createGame } from '../src/sim/gamestate';
import { researchableTechs } from '../src/sim/research';
import { UNIT_TYPES } from '../src/model/units';

function orcs() {
  const state = createGame({ seed: 20260909, width: 24, height: 18 });
  const player = state.players[0];
  return { state, player };
}

/**
 * A Horde far enough along that several branches are open at once.
 *
 * At turn one exactly three advances are researchable and only two unlock
 * anything, so everybody sensibly wants the same one. That is the right answer
 * and a poor test of whether they can disagree.
 */
function grown() {
  const { state, player } = orcs();
  player.techs = techsForFaction('orc')
    .filter((t) => t.prereqs.length === 0 || t.cost <= 40)
    .map((t) => t.id);
  return { state, player };
}

const cost = (t: TechDef) => t.cost;

/**
 * Section 75: choosing what to research is the least supported decision in the
 * game. The council already exists and already refuses to agree with itself, so
 * the advances screen borrows it rather than inventing a recommender.
 *
 * They are not six attempts at the best advance. They are six people arguing
 * for their own department, and the value is that you can see them disagree.
 */
describe('what the council would research', () => {
  it('gives every advisor of the faction something to want', () => {
    const { player } = orcs();
    const open = researchableTechs(player);
    const picks = advisorSuggestions('orc', open, cost);

    expect(picks).toHaveLength(ADVISORS.filter((a) => a.faction === 'orc').length);
    expect(new Set(picks.map((p) => p.advisor.id)).size).toBe(picks.length);
  });

  it('only ever suggests something that can be started now', () => {
    const { player } = orcs();
    const open = researchableTechs(player);
    const ids = new Set(open.map((t) => t.id));

    // An advisor pointing at a locked advance is advice you cannot take, which
    // is worse than no advice.
    for (const p of advisorSuggestions('orc', open, cost)) {
      expect(ids.has(p.tech.id), `${p.advisor.name} wants the unreachable ${p.tech.name}`).toBe(true);
    }
  });

  it('never suggests the other side\'s advances', () => {
    const { player } = orcs();
    const theirs = new Set(techsForFaction('human').map((t) => t.id));
    const ours = new Set(techsForFaction('orc').map((t) => t.id));
    for (const p of advisorSuggestions('orc', researchableTechs(player), cost)) {
      // Shared advances are in both lists; what must not appear is one that is
      // only ever the Kingdom's.
      expect(theirs.has(p.tech.id) && !ours.has(p.tech.id)).toBe(false);
    }
  });

  it('disagrees once there is anything to disagree about', () => {
    const { player } = grown();
    const picks = advisorSuggestions('orc', researchableTechs(player), cost);
    // Six identical rows would be a recommendation wearing six hats.
    expect(new Set(picks.map((p) => p.tech.id)).size).toBeGreaterThan(1);
    expect(picks.filter((p) => p.stake).length).toBeGreaterThan(1);
  });

  it('admits when nothing on offer is its business', () => {
    // At turn one only one advance unlocks anything anybody wants, and five of
    // the six say so rather than inventing a reason. The screen collapses them
    // into one line; what matters here is that they are marked as shrugging.
    const { player } = orcs();
    const picks = advisorSuggestions('orc', researchableTechs(player), cost);
    const shrugging = picks.filter((p) => !p.stake);
    expect(shrugging.length).toBeGreaterThan(0);
    for (const p of shrugging) expect(p.why).toMatch(/nothing here is mine/i);
    // And everybody shrugging wants the same thing, which is why one line does.
    expect(new Set(shrugging.map((p) => p.tech.id)).size).toBe(1);
  });

  it('sends the soldier after the biggest weapon on offer', () => {
    const { player } = grown();
    const open = researchableTechs(player);
    const punch = (t: (typeof open)[number]) =>
      Math.max(0, ...t.units.map((u) => UNIT_TYPES[u]).filter((u) => u?.faction === 'orc').map((u) => u.attack));

    const soldier = advisorSuggestions('orc', open, cost).find((p) => p.advisor.role === 'military')!;
    expect(soldier).toBeDefined();
    // Nothing else available unlocks a harder hitter. He is not weighing it
    // against anything; that is the joke and also the specification.
    expect(punch(soldier.tech)).toBe(Math.max(...open.map(punch)));
  });

  it('says the same thing twice in a row', () => {
    // Advice that changes while you are reading it is not advice, and this
    // screen is re-rendered every time the Orcpedia closes over it.
    const { player } = orcs();
    const open = researchableTechs(player);
    const a = advisorSuggestions('orc', open, cost);
    const b = advisorSuggestions('orc', open, cost);
    expect(a.map((p) => `${p.advisor.id}:${p.tech.id}`)).toEqual(
      b.map((p) => `${p.advisor.id}:${p.tech.id}`),
    );
  });

  it('names the advance it is arguing for', () => {
    const { player } = orcs();
    for (const p of advisorSuggestions('orc', researchableTechs(player), cost)) {
      expect(p.why).toContain(p.tech.name);
    }
  });

  it('has nothing to say when there is nothing to study', () => {
    expect(advisorSuggestions('orc', [], cost)).toEqual([]);
  });

  it('speaks for the Kingdom too, in its own voice', () => {
    const state = createGame({ seed: 20260909, width: 24, height: 18, playerFaction: 'human' });
    const picks = advisorSuggestions('human', researchableTechs(state.players[0]), cost);
    expect(picks.length).toBeGreaterThan(0);
    // The Horde's lines are not the Kingdom's; "boss" is a Goblin Overseer word.
    expect(picks.map((p) => p.why).join(' ')).not.toMatch(/boss/i);
  });
});
