import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim/gamestate';
import { contentLimit, foundCity, productionCostIn } from '../src/sim/city';
import { techCost } from '../src/sim/research';
import { BARBARIANS, raidPace } from '../src/sim/barbarians';
import { DIFFICULTIES, difficultyOf } from '../src/sim/difficulty';
import { deserialize, serialize } from '../src/persist/save';
import { TECHS } from '../src/model/techs';
import { unitType } from '../src/model/units';
import type { DifficultyId, GameState } from '../src/model/types';

const SEED = 20260826;

/** A game at this level with a city each, so both seats have prices and limits. */
function gameAt(difficulty: DifficultyId): GameState {
  const state = createGame({ seed: SEED, width: 40, height: 30, difficulty, barbarians: true });
  for (const owner of [0, 1]) {
    const settler = state.units.find((u) => u.owner === owner && unitType(u.type).settler)!;
    foundCity(state, settler);
  }
  return state;
}

function measure(state: GameState) {
  const tech = TECHS.find((t) => t.cost > 0)!;
  const item = { kind: 'unit', id: state.units.find((u) => u.owner === 1)!.type } as const;
  const [mine, theirs] = [0, 1].map((o) => state.cities.find((c) => c.owner === o)!);
  return {
    myLimit: contentLimit(state, mine),
    theirLimit: contentLimit(state, theirs),
    myTech: techCost(state.players[0], tech),
    theirTech: techCost(state.players[1], tech),
    myBuild: productionCostIn(state, mine, item),
    theirBuild: productionCostIn(state, theirs, item),
  };
}

describe('difficulty (section 113)', () => {
  it('has five levels, Normal in the middle', () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(['easiest', 'easy', 'normal', 'hard', 'hardest']);
  });

  it('leaves Normal exactly the game it was', () => {
    const state = gameAt('normal');
    expect(state.players.every((p) => p.handicap === undefined)).toBe(true);
    expect(raidPace(state)).toEqual({ notBefore: BARBARIANS.notBefore, every: BARBARIANS.every });
  });

  // Never easier on any lever, and harder on at least one. The two hard levels
  // share their riot step: the measured ladder asked Doom for a price, not more.
  it('gets harder at every step up', () => {
    const levels = DIFFICULTIES.map((d) => ({ d, m: measure(gameAt(d.id)), pace: raidPace(gameAt(d.id)) }));
    for (let i = 1; i < levels.length; i++) {
      const [a, b] = [levels[i - 1], levels[i]];
      expect(b.m.myLimit, `${b.d.name}: cities riot`).toBeLessThanOrEqual(a.m.myLimit);
      expect(b.m.theirTech, `${b.d.name}: their research`).toBeLessThanOrEqual(a.m.theirTech);
      expect(b.m.theirBuild, `${b.d.name}: their builds`).toBeLessThanOrEqual(a.m.theirBuild);
      expect(b.pace.every, `${b.d.name}: raids`).toBeLessThan(a.pace.every);
      expect(b.pace.notBefore).toBeLessThanOrEqual(a.pace.notBefore);
      expect(
        b.m.myLimit < a.m.myLimit || b.m.theirTech < a.m.theirTech,
        `${b.d.name} is no harder than ${a.d.name} at home`,
      ).toBe(true);
    }
  });

  it('touches only one side on each lever', () => {
    const normal = measure(gameAt('normal'));
    for (const d of DIFFICULTIES) {
      const m = measure(gameAt(d.id));
      // Your prices and their patience are the same at every level.
      expect(m.myTech).toBe(normal.myTech);
      expect(m.myBuild).toBe(normal.myBuild);
      expect(m.theirLimit).toBe(normal.theirLimit);
    }
  });

  it('keeps the level through a save', () => {
    const state = gameAt('hardest');
    const loaded = deserialize(serialize(state));
    expect(loaded.settings.difficulty).toBe('hardest');
    expect(measure(loaded)).toEqual(measure(state));
  });

  it('reads anything unknown as Normal', () => {
    expect(difficultyOf({ difficulty: 'peaceful' as DifficultyId }).id).toBe('normal');
    expect(difficultyOf({ difficulty: 'nasty' as DifficultyId }).id).toBe('normal');
  });
});
