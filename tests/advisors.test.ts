import { describe, expect, it } from 'vitest';
import {
  ADVISORS,
  advisorConcern,
  objectionsTo,
  type Situation,
  advisorLine,
  advisorsFor,
  count,
  ratesUntouched,
  spell,
} from '../src/model/advisors';
import { situationOf } from '../src/ui/advisors';
import { createGame } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';

/** A quiet empire, which every test then makes noisy in one specific way. */
function calm(): Situation {
  return {
    turn: 10,
    faction: 'orc',
    // Turn 10 of 300: the deadline is not a thing anybody is thinking about.
    deadline: null,
    cities: 4,
    rioting: 0,
    restless: 0,
    starving: 0,
    gold: 120,
    goldPerTurn: 6,
    beakersPerTurn: 8,
    rates: { coin: 4, beakers: 4, calm: 4 },
    researching: 'Mapmaking',
    undefended: 0,
    enemiesSeen: 0,
    army: 12,
    magicUnits: 2,
    rankAndFile: 3,
    paladins: 2,
    walled: 4,
    wallsAvailable: true,
    barracks: 3,
    coinBuildings: 4,
    calmBuildings: 4,
    supplyPosts: 2,
    calmAvailable: true,
    calmNeedsAdvance: null,
    dominance: null,
  };
}

describe('counting things out loud', () => {
  it('never says "1 cities"', () => {
    expect(count(1, 'city', 'cities')).toBe('one city');
    expect(count(3, 'city', 'cities')).toBe('three cities');
    // Zero is plural and reads as "no", which is what somebody would say.
    expect(count(0, 'city', 'cities')).toBe('no cities');
  });

  it('adds an s by itself when that is all it takes', () => {
    expect(count(1, 'soldier')).toBe('one soldier');
    expect(count(2, 'soldier')).toBe('two soldiers');
  });

  it('writes numbers up to twenty as words, and larger ones as figures', () => {
    // These are people talking. A digit in the middle of a spoken line reads
    // as a readout rather than a sentence, which is the difference between an
    // advisor and a status bar.
    expect(spell(0)).toBe('no');
    expect(spell(1)).toBe('one');
    expect(spell(19)).toBe('nineteen');
    expect(spell(20)).toBe('twenty');
    // Past twenty it stops being something anybody says aloud.
    expect(spell(21)).toBe('21');
    expect(spell(450)).toBe('450');
  });

  it('leaves no bare digit in any line it can reach', () => {
    const quiet = calm();
    const loud: Situation = {
      ...quiet,
      rioting: 2,
      starving: 1,
      restless: 3,
      undefended: 4,
      enemiesSeen: 5,
      army: 7,
      magicUnits: 0,
      paladins: 0,
      walled: 0,
      barracks: 0,
      coinBuildings: 0,
      calmBuildings: 0,
      supplyPosts: 0,
      goldPerTurn: -6,
      beakersPerTurn: 2,
      gold: 8,
      researching: null,
      rates: { coin: 1, beakers: 1, calm: 10 },
    };
    for (const advisor of ADVISORS) {
      for (const s of [quiet, loud]) {
        const line = advisorLine(advisor, { ...s, faction: advisor.faction });
        expect(line, `${advisor.id} used a digit: ${line}`).not.toMatch(/\d/);
      }
    }
  });
});

describe('who advises whom', () => {
  it('gives each side six, with the same six jobs', () => {
    const orc = advisorsFor('orc');
    const human = advisorsFor('human');
    expect(orc).toHaveLength(6);
    expect(human).toHaveLength(6);
    // Mirrored by role, which is the part that makes them a pair of councils
    // rather than twelve separate characters.
    expect(orc.map((a) => a.role).sort()).toEqual(human.map((a) => a.role).sort());
  });

  it('gives everybody a distinct id, since the portrait is keyed on it', () => {
    const ids = ADVISORS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has something for everyone to say when nothing is wrong', () => {
    const quiet = calm();
    for (const advisor of ADVISORS) {
      const line = advisorLine(advisor, { ...quiet, faction: advisor.faction });
      expect(line, `${advisor.id} said nothing`).toBeTruthy();
    }
  });
});

describe('what they notice', () => {
  it('takes the first concern that applies, so the order is the character', () => {
    const marshal = advisorsFor('human').find((a) => a.id === 'knight-marshal')!;
    // Both true at once. He is a soldier: the enemy wins over the masonry,
    // every time, and that ordering is the whole of him.
    const both = { ...calm(), faction: 'human' as const, enemiesSeen: 3, walled: 0 };
    expect(advisorLine(marshal, both)).toMatch(/Orcs/);

    const wallsOnly = { ...both, enemiesSeen: 0 };
    expect(advisorLine(marshal, wallsOnly)).toMatch(/walls/i);
  });

  it('does not change its mind while you are looking at it', () => {
    const quiet = calm();
    for (const advisor of ADVISORS) {
      const s = { ...quiet, faction: advisor.faction };
      // Idle lines are picked by turn rather than at random, so opening the
      // panel twice on one turn cannot get two opinions out of one person.
      expect(advisorLine(advisor, s)).toBe(advisorLine(advisor, s));
    }
  });

  it('counts a lone rioting city as one city', () => {
    const overseer = advisorsFor('orc').find((a) => a.id === 'goblin-overseer')!;
    expect(advisorLine(overseer, { ...calm(), rioting: 1 })).toContain('One city ');
    expect(advisorLine(overseer, { ...calm(), rioting: 3 })).toContain('Three cities ');
  });

  it('starts every line with a capital', () => {
    // Spelling numbers out put words like "one" and "no" at the front, and
    // "one city rioting, boss" reads as a fragment somebody interrupted.
    const quiet = calm();
    for (const advisor of ADVISORS) {
      for (const rioting of [0, 1, 4]) {
        const line = advisorLine(advisor, { ...quiet, faction: advisor.faction, rioting });
        expect(line[0], `${advisor.id}: ${line}`).toBe(line[0].toUpperCase());
      }
    }
  });
});

describe('the situation it all reads from', () => {
  it('is gathered from a real game without inventing anything', () => {
    const state = createGame({ seed: 20260826, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    foundCity(state, settler);

    const s = situationOf(state, 0);
    expect(s.cities).toBe(1);
    expect(s.faction).toBe(state.players[0].faction);
    expect(s.rates.coin + s.rates.beakers + s.rates.calm).toBe(12);
    // Only what this player can see. An advisor alarmed about an enemy the
    // viewer has not found would be a fog-of-war leak with a face on it.
    expect(s.enemiesSeen).toBe(0);
  });

  it('never reports more rioting cities than there are cities', () => {
    const state = createGame({ seed: 4242, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    foundCity(state, settler);
    const s = situationOf(state, 0);
    expect(s.rioting).toBeLessThanOrEqual(s.cities);
    expect(s.undefended).toBeLessThanOrEqual(s.cities);
    expect(s.walled).toBeLessThanOrEqual(s.cities);
  });
});

/**
 * DESIGN_QUEUE section 64. A side left on the even default loses about seven
 * games in a hundred and eight, a quarter of its population and a fifth of its
 * army. Section 47 taught the AI to manage its own split and told the player
 * nothing, so the game shipped a default its opponent automatically improves
 * on. The advisors are where the game explains itself, so they explain this.
 */
describe('nobody has touched the trade split', () => {
  function untouched(faction: 'orc' | 'human'): Situation {
    return { ...calm(), faction, turn: 30, rates: { coin: 4, beakers: 4, calm: 4 } };
  }

  it('is noticed by whoever handles the money, on both sides', () => {
    for (const faction of ['orc', 'human'] as const) {
      const trade = advisorsFor(faction).find((a) => a.role === 'trade')!;
      const line = advisorLine(trade, untouched(faction));
      // Says where to go and does not merely grumble about it.
      expect(line, `${trade.id} said nothing useful: ${line}`).toMatch(/empire report/i);
    }
  });

  it('says nothing while the empire is still being founded', () => {
    // An opening where nothing has been built yet is not a state anybody has
    // failed to manage, and an advisor who says it every turn from turn one is
    // an advisor people learn to close.
    for (const faction of ['orc', 'human'] as const) {
      const early = { ...untouched(faction), turn: 3 };
      expect(ratesUntouched(early)).toBe(false);
      const trade = advisorsFor(faction).find((a) => a.role === 'trade')!;
      expect(advisorLine(trade, early)).not.toMatch(/empire report/i);
    }
  });

  it('stops once the split has been set to anything at all', () => {
    for (const faction of ['orc', 'human'] as const) {
      const moved = { ...untouched(faction), rates: { coin: 3, beakers: 6, calm: 3 } };
      expect(ratesUntouched(moved)).toBe(false);
      const trade = advisorsFor(faction).find((a) => a.role === 'trade')!;
      expect(advisorLine(trade, moved)).not.toMatch(/empire report/i);
    }
  });

  it('gives way to actually running out of money', () => {
    // The order of a list of concerns is the character. Somebody whose treasury
    // is draining should mention that first, however untidy the split is.
    for (const faction of ['orc', 'human'] as const) {
      const broke = { ...untouched(faction), goldPerTurn: -9 };
      const trade = advisorsFor(faction).find((a) => a.role === 'trade')!;
      expect(advisorLine(trade, broke)).not.toMatch(/empire report/i);
    }
  });

  it('keeps its digits spelled out like everybody else', () => {
    for (const faction of ['orc', 'human'] as const) {
      const trade = advisorsFor(faction).find((a) => a.role === 'trade')!;
      expect(advisorLine(trade, untouched(faction))).not.toMatch(/\d/);
    }
  });
});

/**
 * DESIGN_QUEUE section 46. Six opinions in a list is not an argument, and six
 * faces all talking at once is a lot of movement on a screen somebody is
 * reading. So you ask one, and only those who *disagree* say anything back.
 */
describe('advisors who talk back', () => {
  const quiet = calm();

  it('objects by topic rather than by naming names', () => {
    // Six people who each disagree with two or three others is thirty-odd
    // relationships to maintain, and every new advisor multiplies it. A topic
    // is one word on the line and one word on whoever objects.
    for (const a of ADVISORS) {
      for (const c of a.concerns) {
        if (!c.about) continue;
        expect(typeof c.about).toBe('string');
      }
    }
    expect(ADVISORS.some((a) => a.retorts && Object.keys(a.retorts).length > 0)).toBe(true);
  });

  it('lets somebody argue with the arcane advisor about magic', () => {
    const arcane = advisorsFor('orc').find((a) => a.role === 'arcane')!;
    // The state that puts his magic line on top: an army, and nobody in it who
    // can do anything interesting.
    const s: Situation = { ...quiet, faction: 'orc', army: 12, magicUnits: 0, researching: 'Axes' };
    const line = advisorConcern(arcane, s);
    expect(line?.about, 'the arcane advisor was not talking about magic').toBe('magic');

    const said = objectionsTo(arcane, line);
    expect(said.length, 'nobody disagreed about magic').toBeGreaterThan(0);
    expect(said.every((o) => o.advisor.faction === 'orc')).toBe(true);
  });

  it('never lets an advisor heckle themselves', () => {
    for (const a of ADVISORS) {
      for (const c of a.concerns) {
        expect(objectionsTo(a, c).some((o) => o.advisor.id === a.id)).toBe(false);
      }
    }
  });

  it('never lets the two councils hear each other', () => {
    // The sides never meet. An orc heckling the Kingdom's Archmage would be a
    // fog-of-war leak in the shape of a joke.
    for (const a of ADVISORS) {
      for (const c of a.concerns) {
        for (const o of objectionsTo(a, c)) {
          expect(o.advisor.faction).toBe(a.faction);
        }
      }
    }
  });

  it('says nothing at all about an untagged line', () => {
    for (const a of ADVISORS) {
      for (const c of a.concerns) {
        if (c.about) continue;
        expect(objectionsTo(a, c)).toEqual([]);
      }
    }
    // And nothing when the advisor has no concern at all, which is the common
    // case: most turns most of them are idle.
    expect(objectionsTo(ADVISORS[0], null)).toEqual([]);
  });

  it('keeps every retort to a topic somebody actually raises', () => {
    // A retort about a subject no line is tagged with can never be heard, which
    // is a dead line in a file of jokes rather than a bug that shows up.
    const raised = new Set(
      ADVISORS.flatMap((a) => a.concerns.map((c) => c.about).filter(Boolean)),
    );
    for (const a of ADVISORS) {
      for (const topic of Object.keys(a.retorts ?? {})) {
        expect(raised.has(topic as never), `${a.id} answers "${topic}", which nobody raises`).toBe(true);
      }
    }
  });
});
