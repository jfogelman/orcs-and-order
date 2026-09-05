import { describe, expect, it } from 'vitest';
import type { Situation } from '../src/model/advisors';
import { ADVISORS, advisorConcern, councilConcerns, crises, newCrises } from '../src/model/advisors';

const base = (over: Partial<Situation>): Situation =>
  ({
    turn: 120, faction: 'orc', deadline: null, cities: 4, rioting: 0, restless: 0,
    starving: 0, gold: 200, goldPerTurn: 5, beakersPerTurn: 5,
    rates: { coin: 4, beakers: 4, calm: 4 }, researching: 'Axes', undefended: 0,
    enemiesSeen: 0, army: 4, magicUnits: 0, rankAndFile: 2, paladins: 0, walled: 0,
    wallsAvailable: false, barracks: 1, coinBuildings: 1, calmBuildings: 1,
    calmAvailable: true, calmNeedsAdvance: null, dominance: null,
    ...over,
  }) as Situation;

const ids = (s: Situation) => crises(s).map((c) => c.id);

/**
 * The council has always had opinions and no way to raise them: you pressed A
 * and went looking. Fine for an opinion, useless for a crisis, because the
 * player who most needs the council is the one who does not know anything is
 * wrong.
 */
describe('what the council will interrupt for', () => {
  it('says nothing about a quiet empire', () => {
    expect(crises(base({}))).toEqual([]);
  });

  it('raises somebody else being one clock from winning', () => {
    expect(ids(base({ dominance: { turnsLeft: 4, theirs: true } }))).toContain('dominance-theirs');
  });

  it('does not raise us being one clock from winning', () => {
    // Good news is not a crisis, and the advisors already mention it if asked.
    expect(ids(base({ dominance: { turnsLeft: 4, theirs: false } }))).toEqual([]);
  });

  it('tells the spiral apart from ordinary unrest', () => {
    // Section 77: rioting with nothing buildable that would stop it is a
    // different problem from rioting, because waiting does not fix it.
    const spiral = base({ rioting: 1, calmAvailable: false, calmNeedsAdvance: 'Joy Making' });
    expect(ids(spiral)).toContain('calm-spiral');
    expect(crises(spiral)[0].headline).toMatch(/Joy Making/);
  });

  it('does not cry spiral over one riot it can build its way out of', () => {
    expect(ids(base({ rioting: 1, calmAvailable: true }))).toEqual([]);
    expect(ids(base({ rioting: 2, calmAvailable: true }))).toContain('riots');
  });

  it('raises the treasury on runway, not on losing money', () => {
    // Section 76 asked for this specifically: losing five a turn on a thousand
    // is a rounding error, and losing five a turn on nine is a crisis.
    expect(ids(base({ gold: 1000, goldPerTurn: -5 }))).not.toContain('bankrupt');
    expect(ids(base({ gold: 9, goldPerTurn: -5 }))).toContain('bankrupt');
  });

  it('raises the deadline only when it can still be lost', () => {
    expect(ids(base({ deadline: { turnsLeft: 10, ahead: true, level: false } }))).not.toContain('deadline-behind');
    expect(ids(base({ deadline: { turnsLeft: 10, ahead: false, level: false } }))).toContain('deadline-behind');
    // Thirty turns out is a warning, not an emergency; the log already says it.
    expect(ids(base({ deadline: { turnsLeft: 30, ahead: false, level: false } }))).not.toContain('deadline-behind');
  });

  it('puts the worst thing first, because the first line decides whether anybody clicks', () => {
    const bad = base({
      dominance: { turnsLeft: 2, theirs: true },
      rioting: 3,
      gold: 1,
      goldPerTurn: -10,
    });
    expect(crises(bad)[0].id).toBe('dominance-theirs');
    expect(crises(bad).length).toBeGreaterThan(1);
  });

  it('says what is wrong and not what to do', () => {
    // The advice is the thing the player is choosing to hear; a headline that
    // gives it away makes the audience pointless.
    for (const c of crises(base({ rioting: 3, starving: 2 }))) {
      expect(c.headline).not.toMatch(/should|build|research|try/i);
    }
  });
});

describe('asking once, not every turn', () => {
  it('raises a new crisis and remembers it', () => {
    const s = base({ rioting: 3 });
    const first = newCrises(s, []);
    expect(first.raise.map((c) => c.id)).toEqual(['riots']);
    expect(first.warned).toEqual(['riots']);
  });

  it('stays quiet while the same crisis continues', () => {
    const s = base({ rioting: 3 });
    const again = newCrises(s, ['riots']);
    // A council that demanded an audience every turn of a long riot would be
    // trained away in three turns.
    expect(again.raise).toEqual([]);
    expect(again.warned).toEqual(['riots']);
  });

  it('forgets a crisis that clears, so it can raise again', () => {
    const calm = newCrises(base({ rioting: 0 }), ['riots']);
    expect(calm.raise).toEqual([]);
    expect(calm.warned).toEqual([]);

    const back = newCrises(base({ rioting: 3 }), calm.warned);
    expect(back.raise.map((c) => c.id)).toEqual(['riots']);
  });

  it('raises a second crisis while the first is still running', () => {
    const s = base({ rioting: 3, gold: 2, goldPerTurn: -4 });
    const next = newCrises(s, ['riots']);
    expect(next.raise.map((c) => c.id)).toEqual(['bankrupt']);
    expect(next.warned).toEqual(['riots', 'bankrupt']);
  });

  it('copes with a save that never knew about any of this', () => {
    // `warnedOf` is optional, so an old save means "nothing said yet".
    expect(newCrises(base({ rioting: 3 })).raise.map((c) => c.id)).toEqual(['riots']);
  });
});

/**
 * Reported from play with a screenshot: the council interrupted about the
 * treasury and the deadline, and then discussed farms, walls and the dead. Only
 * one advisor addressed one of the two.
 *
 * The lines existed -- the Quartermaster has one about losing money -- but each
 * advisor says their *first* applicable concern, and something else was above
 * it. Ordering is the character, so it is not the ordering that gives way: a
 * crisis names a topic, and an advisor summoned about that topic leads with
 * whatever they have on it.
 */
describe('the council addressing what it interrupted for', () => {
  const orcs = ADVISORS.filter((a) => a.faction === 'orc');
  /** What the room actually says, decided across the whole room. */
  const room = (s: Situation) => [...councilConcerns(orcs, s, crises(s)).values()];
  const topicsSaid = (s: Situation) => room(s).map((c) => c?.about);

  it('gives every crisis somebody who talks about it', () => {
    const s = base({ rioting: 3, gold: 2, goldPerTurn: -4 });
    const raised = crises(s);
    expect(raised.length).toBeGreaterThan(1);

    const covered = new Set(topicsSaid(s));
    for (const c of raised) {
      expect(covered.has(c.topic), `nobody speaks to ${c.id}`).toBe(true);
    }
  });

  it('is the exact case that was reported: money and the clock at once', () => {
    const s = base({
      gold: 2,
      goldPerTurn: -4,
      deadline: { turnsLeft: 0, ahead: false, level: false },
    });
    const topics = crises(s).map((c) => c.topic);
    expect(topics).toContain('the-treasury');
    expect(topics).toContain('the-clock');

    // The naive version put the Quartermaster on the clock and left the
    // treasury unspoken, because he owns both and his clock line comes first.
    const said = topicsSaid(s);
    expect(said).toContain('the-treasury');
    expect(said).toContain('the-clock');
  });

  it('does not put the whole room on one subject', () => {
    const s = base({ gold: 2, goldPerTurn: -4 });
    const said = topicsSaid(s);
    // One voice per crisis. Six advisors all reciting the treasury would be a
    // worse screen than the one that was reported.
    expect(said.filter((t) => t === 'the-treasury').length).toBe(1);
  });

  it('does not redirect anybody when nothing was raised', () => {
    const s = base({ rioting: 3, gold: 2, goldPerTurn: -4 });
    const asked = councilConcerns(orcs, s, []);
    for (const a of orcs) {
      expect(asked.get(a.id)).toBe(advisorConcern(a, s));
    }
  });

  it('never says "no turns" on a turn you can still act in', () => {
    // `turnsLeft` is zero on the final turn, and `count(0, "turn")` is "no
    // turns" -- which is what the screenshot showed.
    const s = base({ deadline: { turnsLeft: 0, ahead: false, level: false } });
    const line = crises(s).find((c) => c.id === 'deadline-behind')!.headline;
    expect(line).not.toMatch(/no turns/i);
    expect(line).toMatch(/one last turn/i);
  });
});
