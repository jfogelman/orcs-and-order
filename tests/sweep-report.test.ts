import { describe, expect, it } from 'vitest';
import { FACTION_IDS } from '../src/model/factions';
import { rawRows, report, summarise } from '../tools/sweep';
import type { ArmResult, Outcome, PerSide } from '../tools/sweep';
import type { FactionId, VictoryKind } from '../src/model/types';

/**
 * Section 140: the sweep report, and the two-sidedness that outlived its
 * reason.
 *
 * Every per-side figure used to be `[number, number]` -- seat 0 and seat 1,
 * which meant the Horde and the Kingdom for as long as those were the only
 * seats there could be. Section 139 made the sides in a game a choice, so a
 * column headed `hum` reporting whatever sat in seat 1 would have been wrong
 * without ever looking wrong.
 *
 * **It was already losing data before that.** The Hivekin have been in the
 * game since section 125 and the report has never shown their cities, their
 * population, their units or their advances -- only their wins. Fourteen
 * sections of measurement with the third side's whole economy off the page.
 *
 * The machinery is exercised against hand-built outcomes rather than a played
 * game, because what is being tested is the arithmetic and the layout, and a
 * sweep takes an hour.
 */
function outcome(over: Partial<Outcome> & { sides: FactionId[] }): Outcome {
  const flat = (v: number): PerSide =>
    Object.fromEntries(over.sides.map((f) => [f, v])) as PerSide;
  return {
    seed: 1,
    turns: 200,
    winner: 0,
    winnerFaction: over.sides[0] ?? null,
    combats: 10,
    captures: 2,
    cities: flat(5),
    population: flat(40),
    units: flat(20),
    techs: flat(25),
    ladder: flat(3),
    victory: 'conquest',
    sacks: flat(0),
    map: 'abc',
    roadTiles: 50,
    joined: flat(0.5),
    links: flat(1),
    routeGold: flat(2),
    ...over,
  };
}

const arm = (label: string, outcomes: Outcome[]): ArmResult =>
  ({ arm: label, set: 'tuned', outcomes }) as ArmResult;

describe('the report counts sides rather than seats', () => {
  it('credits a win to the faction that won, not to whoever sat in seat one', () => {
    // **The bug this replaces.** `hiveWins` was `winner > 1` -- "anything past
    // seat one is the Hive" -- which held only while the Hive could never be
    // picked. Section 139 lets it be the first opponent, which puts it in
    // seat 1, where that test counted its wins as the Kingdom's.
    const rows = summarise([
      arm('a', [
        outcome({ sides: ['orc', 'hivekin'], winner: 1, winnerFaction: 'hivekin' }),
        outcome({ sides: ['orc', 'hivekin'], winner: 0, winnerFaction: 'orc' }),
      ]),
    ]);
    expect(rows[0].wins.hivekin).toBe(1);
    expect(rows[0].wins.orc).toBe(1);
    expect(rows[0].wins.human, 'the Kingdom was not in this game at all').toBeUndefined();
  });

  it('gives a side that played and never won a zero, not a blank', () => {
    // Absent and nil are different facts and the report must not merge them.
    const rows = summarise([
      arm('a', [outcome({ sides: ['orc', 'human'], winner: 0, winnerFaction: 'orc' })]),
    ]);
    expect(rows[0].wins.human).toBe(0);
    expect(rows[0].wins.hivekin).toBeUndefined();
  });

  it('averages a side over the games it was in, not over the whole arm', () => {
    // **The half of this that is not cosmetic.** Dividing by every game would
    // report a faction present in half of them at half its real size, which
    // reads as a weak side rather than a rare one -- and with the opponents
    // now a choice, "in half the games" is an ordinary thing for an arm to be.
    const rows = summarise([
      arm('a', [
        outcome({ sides: ['orc', 'human'] }),
        outcome({ sides: ['orc', 'human', 'hivekin'], cities: { orc: 5, human: 5, hivekin: 8 } }),
      ]),
    ]);
    expect(rows[0].cities.hivekin, 'halved by the game it was not in').toBe(8);
    expect(rows[0].cities.orc).toBe(5);
  });

  it('shows the third side’s economy at all, which it never has', () => {
    // Not merely "has a key": the rendered report has to carry it, because the
    // report is the thing anybody reads. The Hivekin have had cities since
    // section 125 and no column to put them in.
    const text = report([
      arm('a', [outcome({ sides: ['orc', 'human', 'hivekin'], cities: { orc: 4, human: 6, hivekin: 9 } })]),
    ]);
    expect(text).toMatch(/Hivekin/);
    expect(text, 'the Hive’s cities should be on the page').toMatch(/9\.00/);
  });

  /**
   * Section 156, and it is section 140's own finding arriving a second time.
   *
   * The summary row named six victory kinds by hand. That was right with
   * three factions and silently wrong with five: section 153's sweep won
   * **sixteen games by Spirit Party** and reported them nowhere, and the
   * Wandering Folk's Circling Caravan had no column at all. The data was
   * never missing -- `routes` counts every kind -- only the printing.
   *
   * Asked of `VictoryKind` rather than of a list here, so the next faction's
   * road out appears in the report on the day it compiles.
   */
  it('gives every road out a column, including the ones added last', () => {
    const ends: VictoryKind[] = ['portal', 'object', 'hive', 'circle', 'party'];
    const text = report([
      arm(
        'a',
        ends.map((victory) => outcome({ sides: ['orc', 'unbound'], victory })),
      ),
    ]);
    const row = text.split('\n').find((l) => /^a\s/.test(l))!;
    expect(row, 'one game of each kind should be five ones').toMatch(/1\/1\/1\/1\/1/);
    // And the header has to name as many columns as the row prints numbers.
    const header = text.split('\n').find((l) => /^arm\s/.test(l))!;
    expect(header.trim().split(/\s+/).pop()!.split('/')).toHaveLength(
      row.trim().split(/\s+/).pop()!.split('/').length,
    );
  });

  it('prints a block per side that was there, and none for one that was not', () => {
    const text = report([arm('a', [outcome({ sides: ['orc', 'hivekin'] })])]);
    expect(text).toMatch(/Orcs/);
    expect(text).toMatch(/Hivekin/);
    expect(text, 'a side nobody played should not get a table of dashes').not.toMatch(/Humans/);
  });

  it('keeps the columns lined up when one arm has a side and another does not', () => {
    // Taken across all the arms rather than per arm, so a reader comparing
    // two rows down the page is comparing the same column.
    const text = report([
      arm('with', [outcome({ sides: ['orc', 'human', 'hivekin'] })]),
      arm('without', [outcome({ sides: ['orc', 'human'] })]),
    ]);
    const hive = text.split('\n').filter((l) => /^without/.test(l) && / - /.test(`${l} `));
    expect(text).toMatch(/Hivekin/);
    // The arm that had no Hive still gets a row in the Hive block, dashed.
    expect(hive.length, 'the arm without a Hive should still have a row').toBeGreaterThan(0);
  });
});

describe('the raw rows name their own columns', () => {
  it('writes a header built from the same list as the rows', () => {
    // The old header was written out by hand in `sweep.run.test.ts`, some
    // distance from the code that produced the columns, and had drifted: it
    // called the deepest-group pair `orcL/humL` and offered no units column
    // at all. Section 138 then wrote a prediction about "Kingdom units"
    // against it, which could not be tested.
    const rows = rawRows([arm('a', [outcome({ sides: ['orc', 'human', 'hivekin'] })])]);
    const [header, first] = rows.split('\n');
    expect(header).toContain('hivekinCities');
    expect(header).toContain('orcUnits');
    expect(header, 'the winner is a faction now, not a seat').toContain('winner');
    expect(
      header.split('\t').length,
      'every column in the header has a value under it',
    ).toBe(first.split('\t').length);
  });

  it('names the winner by faction, so a column can be grouped on it', () => {
    const rows = rawRows([
      arm('a', [outcome({ sides: ['orc', 'hivekin'], winner: 1, winnerFaction: 'hivekin' })]),
    ]);
    const header = rows.split('\n')[0].split('\t');
    const line = rows.split('\n')[1].split('\t');
    expect(line[header.indexOf('winner')]).toBe('hivekin');
  });

  it('has a column for every faction in the table, and no more', () => {
    const rows = rawRows([arm('a', [outcome({ sides: FACTION_IDS })])]);
    const header = rows.split('\n')[0];
    for (const f of FACTION_IDS) {
      expect(header, `${f} has no columns`).toContain(`${f}Cities`);
    }
  });
});
