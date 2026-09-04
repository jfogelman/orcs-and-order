import { describe, expect, it } from 'vitest';
import { BEAKERS_PER_TRADE } from '../src/sim/research';
import { MILITIA } from '../src/sim/city';
import {
  HELD_OUT,
  LEVERS,
  TUNED,
  estimate,
  playGame,
  report,
  runSweep,
  seedSet,
  settingsSnapshot,
  summarise,
} from '../tools/sweep';

/** A sweep small enough to run in a test: two seeds, six half-turns. */
const tiny = (name: string, base: number) => seedSet(name, [base], 2);
const quiet = () => {};
const SETS = [tiny('a', 11), tiny('b', 22)];

describe('the sweep harness', () => {
  it('refuses two arms that leave every setting the same', () => {
    // Section 59, as code. Two arms that stash nothing and run the same build
    // produce output identical to the decimal, which reads as a real result
    // saying the change did nothing.
    expect(() =>
      runSweep({
        arms: [
          { label: 'control', apply: () => { MILITIA.perCitizen = 0.3; } },
          { label: 'treatment', apply: () => { MILITIA.perCitizen = 0.3; } },
        ],
        sets: SETS,
        halfTurns: 4,
        say: quiet,
      }),
    ).toThrow(/same arm run twice|leave every setting the same/i);
  });

  it('runs when the arms actually differ', () => {
    const results = runSweep({
      arms: [
        { label: 'control', apply: () => { MILITIA.perCitizen = 0.3; } },
        { label: 'treatment', apply: () => { MILITIA.perCitizen = 0.6; } },
      ],
      sets: SETS,
      halfTurns: 4,
      say: quiet,
    });

    expect(results).toHaveLength(4);
    expect(results.map((r) => `${r.arm}/${r.set}`)).toEqual([
      'control/a', 'control/b', 'treatment/a', 'treatment/b',
    ]);
    for (const r of results) expect(r.outcomes).toHaveLength(2);
  });

  it('will not decide anything off one seed set', () => {
    // Section 19: the tuned seeds said the rule cost the Horde three games and
    // the held-out seeds said the opposite.
    expect(() =>
      runSweep({
        arms: [
          { label: 'a', apply: () => { MILITIA.perCitizen = 0.3; } },
          { label: 'b', apply: () => { MILITIA.perCitizen = 0.6; } },
        ],
        sets: [SETS[0]],
        halfTurns: 4,
        say: quiet,
      }),
    ).toThrow(/two seed sets/i);
  });

  it('takes a single set when it is asked to, for a look', () => {
    const results = runSweep({
      arms: [
        { label: 'a', apply: () => { MILITIA.perCitizen = 0.3; } },
        { label: 'b', apply: () => { MILITIA.perCitizen = 0.6; } },
      ],
      sets: [SETS[0]],
      halfTurns: 4,
      allowOneSet: true,
      say: quiet,
    });
    expect(results).toHaveLength(2);
  });

  it('refuses a sweep with nothing to compare against', () => {
    expect(() =>
      runSweep({ arms: [{ label: 'only', apply: quiet }], sets: SETS, halfTurns: 4, say: quiet }),
    ).toThrow(/two arms/i);
  });

  it('puts every lever back, even when it throws', () => {
    const before = settingsSnapshot();
    try {
      runSweep({
        arms: [
          { label: 'a', apply: () => { BEAKERS_PER_TRADE.multiplier = 9; } },
          { label: 'b', apply: () => { BEAKERS_PER_TRADE.multiplier = 9; } },
        ],
        sets: SETS,
        halfTurns: 4,
        say: quiet,
      });
    } catch {
      // The refusal is the point of the test above; here it is the cleanup.
    }
    // A sweep that left a constant moved would quietly poison every test that
    // ran after it in the same process.
    expect(settingsSnapshot()).toBe(before);
  });

  it('puts every lever back after a sweep that worked', () => {
    const before = settingsSnapshot();
    runSweep({
      arms: [
        { label: 'a', apply: () => { BEAKERS_PER_TRADE.multiplier = 1.25; } },
        { label: 'b', apply: () => { BEAKERS_PER_TRADE.multiplier = 2.5; } },
      ],
      sets: SETS,
      halfTurns: 4,
      say: quiet,
    });
    expect(settingsSnapshot()).toBe(before);
  });

  it('watches every lever a sweep is likely to move', () => {
    // The identity check can only see what is in the table, so a lever missing
    // from it makes a real comparison look like a duplicate arm.
    for (const name of ['AI_TUNING', 'RESETTLE', 'DOMINANCE', 'SUPPLY', 'MILITIA', 'BEAKERS_PER_TRADE']) {
      expect(Object.keys(LEVERS)).toContain(name);
    }
  });

  it('builds the seed sets it promises', () => {
    expect(TUNED.seeds).toHaveLength(54);
    expect(HELD_OUT.seeds).toHaveLength(54);
    // Three bases rather than 54 off one, so a single odd continent cannot be
    // mistaken for a result.
    expect(new Set(TUNED.seeds).size).toBe(54);
    expect(TUNED.seeds.some((s) => HELD_OUT.seeds.includes(s))).toBe(false);
  });

  it('gives the same seed the same game', () => {
    // Every measurement here rests on this. If it stops being true, nothing
    // above is worth reading.
    expect(playGame(4242, 8)).toEqual(playGame(4242, 8));
  });

  it('says what it will cost before it runs', () => {
    const said: string[] = [];
    runSweep({
      arms: [
        { label: 'a', apply: () => { MILITIA.perCitizen = 0.3; } },
        { label: 'b', apply: () => { MILITIA.perCitizen = 0.6; } },
      ],
      sets: SETS,
      halfTurns: 4,
      say: (l) => said.push(l),
    });
    expect(said[0]).toMatch(/2 arms x 2 sets/);
    expect(said[0]).toMatch(/8 games/);
    expect(estimate(54)).toMatch(/54 games/);
  });

  it('never pools the two seed sets into one number', () => {
    const results = runSweep({
      arms: [
        { label: 'a', apply: () => { MILITIA.perCitizen = 0.3; } },
        { label: 'b', apply: () => { MILITIA.perCitizen = 0.6; } },
      ],
      sets: SETS,
      halfTurns: 4,
      say: quiet,
    });
    const rows = summarise(results);
    // Pooling is how a result that exists only on the tuned seeds survives into
    // an average that still looks like evidence.
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.set))).toEqual(new Set(['a', 'b']));
    const table = report(results);
    for (const arm of ['a', 'b']) expect(table).toContain(arm);
  });
});
