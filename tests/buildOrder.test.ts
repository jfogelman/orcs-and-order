// Section 176. `unlockedBuildings` walked `player.techs` in the order the
// advances were learned and filled an insertion-ordered Set from it, so
// `options.buildings` came back in research order. Five first-match reads in
// `ai.ts` take the head of that list, which made research order into build
// priority permanently: a side that learned its 130-shield advance before
// `hammers-of-glory` could never reach the 60-shield building, because `find`
// stopped first. Measured in section 175, shipped sorted in section 176.
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/gamestate';
import { unlockedBuildings, unlockedUnits } from '../src/sim/research';

describe('build order', () => {
  it('offers the cheap building first even when its advance was learned last', () => {
    const state = createGame({ seed: 1 });
    const orc = state.players[0];
    // Learned dear-first, which is what the two latecomers did in every game
    // of section 175's table: 0 of 17 and 0 of 20 the other way round.
    orc.techs.push('suicidal-goblins', 'underground-smarts', 'not-you-again', 'hammers-of-glory');

    const ids = unlockedBuildings(orc).map((b) => b.id);
    expect(ids).toContain('thinkingRock'); // 60
    expect(ids).toContain('biggerRock'); // 130
    expect(ids.indexOf('thinkingRock')).toBeLessThan(ids.indexOf('biggerRock'));
  });

  it('is in cost order whichever order the advances arrived', () => {
    const forwards = createGame({ seed: 1 }).players[0];
    const backwards = createGame({ seed: 1 }).players[0];
    forwards.techs.push('not-you-again', 'hammers-of-glory', 'suicidal-goblins', 'underground-smarts');
    backwards.techs.push('suicidal-goblins', 'underground-smarts', 'not-you-again', 'hammers-of-glory');

    const a = unlockedBuildings(forwards).map((b) => b.id);
    const b = unlockedBuildings(backwards).map((b) => b.id);
    expect(a).toEqual(b);

    const costs = unlockedBuildings(backwards).map((x) => x.cost);
    expect([...costs].sort((m, n) => m - n)).toEqual(costs);
  });

  it('matches its sibling, which was sorted all along', () => {
    const state = createGame({ seed: 1 });
    const orc = state.players[0];
    orc.techs.push('suicidal-goblins', 'underground-smarts', 'not-you-again', 'hammers-of-glory');
    const unitCosts = unlockedUnits(orc).map((u) => u.cost);
    expect([...unitCosts].sort((m, n) => m - n)).toEqual(unitCosts);
  });

  it('does not reorder anything shared, so a second call agrees with the first', () => {
    const state = createGame({ seed: 1 });
    const orc = state.players[0];
    orc.techs.push('not-you-again', 'hammers-of-glory');
    expect(unlockedBuildings(orc).map((b) => b.id)).toEqual(
      unlockedBuildings(orc).map((b) => b.id),
    );
  });
});
