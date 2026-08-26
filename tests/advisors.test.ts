import { describe, expect, it } from 'vitest';
import {
  ADVISORS,
  type Situation,
  advisorLine,
  advisorsFor,
  count,
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
    expect(advisorLine(overseer, { ...calm(), rioting: 1 })).toContain('one city ');
    expect(advisorLine(overseer, { ...calm(), rioting: 3 })).toContain('three cities ');
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
