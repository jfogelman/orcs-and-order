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
    gold: flat(400),
    tributePaid: flat(0),
    tributeGot: flat(0),
    tributeBilled: flat(0),
    tributeTook: flat(0),
    townsBought: flat(0),
    townsLost: flat(0),
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

  it('counts the games a side ended with no city, and shows them', () => {
    // Section 179, and the same lesson as the Hive's missing economy above.
    // `cities` is a mean, and section 178 found that for the two latecomers it
    // is mostly reporting how often they are wiped out rather than how big
    // they get: the Unbound end on zero in 8 or 9 games of 18, and on 6 or 7
    // when they do not. A mean cannot show a bimodal side, so the arm that
    // tries to fix it needs a column of its own to move.
    const rows = summarise([
      arm('a', [
        outcome({ sides: ['orc', 'unbound'], cities: { orc: 6, unbound: 0 } }),
        outcome({ sides: ['orc', 'unbound'], cities: { orc: 5, unbound: 4 } }),
      ]),
    ]);
    expect(rows[0].wipedOut.unbound).toBe(1);
    // Absent and nil are different facts here too: a side that played every
    // game and survived every one is a zero, and a side that was not in the
    // arm has no key at all.
    expect(rows[0].wipedOut.orc, 'played twice, never wiped out').toBe(0);
    expect(rows[0].wipedOut.hivekin, 'not in this arm').toBeUndefined();
    // And the mean it is there to disambiguate still folds the zero in, which
    // is the whole reason the column is needed rather than a nicety.
    expect(rows[0].cities.unbound).toBe(2);

    const text = report([
      arm('a', [outcome({ sides: ['orc', 'unbound'], cities: { orc: 6, unbound: 0 } })]),
    ]);
    expect(text, 'the column has to be on the page, not just in the data').toMatch(/gone/);
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

/**
 * Section 183: banked gold and the tribute tally, in the report.
 *
 * These are here because of the *way* section 180 failed. It wrote down what
 * to read before it ran, the reading named a quantity, and the quantity had
 * no column -- so 324 games came back unable to answer the question they were
 * run for. Nothing was broken, so nothing caught it. A test that the column
 * reaches the page is the cheapest thing that would have.
 */
describe('banked gold and what a treaty billed (section 183)', () => {
  it('puts banked gold on the same line as wins and gone, not in a table of its own', () => {
    const text = report([
      arm('a', [
        outcome({ sides: ['orc', 'human'], gold: { orc: 700, human: 200 } }),
        outcome({ sides: ['orc', 'human'], gold: { orc: 500, human: 100 } }),
      ]),
    ]);
    const block = text.split('\n\n').find((b) => b.startsWith('Orcs'))!;
    const [head, , row] = block.split('\n');
    // The reading section 180 asked for is gold *together with* wins and
    // gone, so the test is that one line carries all three.
    for (const col of ['wins', 'gone', 'gold']) {
      expect(head, `${col} is not on the side's line`).toContain(col);
    }
    expect(row, 'the mean of 700 and 500').toContain('600');
  });

  it('tells never-billed from rarely-billed, which a mean of treaties cannot', () => {
    // One game in fifty is 2%. As a mean number of treaties a game it is
    // 0.02, which prints as 0.0 and reads as never -- and "is the Hive ever
    // billed at all" is the question the column exists for.
    const once = outcome({ sides: ['hivekin'], tributeBilled: { hivekin: 1 } });
    const never = outcome({ sides: ['hivekin'], tributeBilled: { hivekin: 0 } });
    const text = report([arm('a', [once, ...Array.from({ length: 49 }, () => never)])]);
    const block = text.split('\n\n').find((b) => b.startsWith('Hivekin'))!;
    expect(block.split('\n')[0]).toContain('billed');
    expect(block, 'one game in fifty is 2%, not 0.0').toContain('2%');

    const none = report([arm('a', Array.from({ length: 50 }, () => never))]);
    expect(
      none.split('\n\n').find((b) => b.startsWith('Hivekin'))!,
      'and never billed reads 0%',
    ).toContain('0%');
  });

  it('gives the raw rows a gold column that cannot be mistaken for route income', () => {
    const rows = rawRows([arm('a', [outcome({ sides: ['orc', 'human'] })])]);
    const header = rows.split('\n')[0].split('\t');
    for (const col of ['orcGold', 'orcRouteGold', 'humanTributePaid', 'humanTributeBilled']) {
      expect(header, `${col} is missing`).toContain(col);
    }
    expect(header.indexOf('orcGold')).not.toBe(header.indexOf('orcRouteGold'));
  });
});

describe('who bought a town and who was bought from (section 184)', () => {
  it('prints towns bought and towns sold beside the gold they cost', () => {
    const text = report([
      arm('a', [
        outcome({ sides: ['human', 'wandering'], townsBought: { human: 2, wandering: 0 } }),
        outcome({ sides: ['human', 'wandering'], townsBought: { human: 1, wandering: 0 } }),
      ]),
    ]);
    const block = text.split('\n\n').find((b) => b.startsWith('Humans'))!;
    const [head, , row] = block.split('\n');
    for (const col of ['gold', 'bought', 'sold']) {
      expect(head, `${col} is not on the side's line`).toContain(col);
    }
    expect(row, 'the mean of 2 and 1').toContain('1.50');
  });

  /**
   * **The column the section was actually missing.** `captures` counts every
   * change of a city's owner however it happened, so a bought town is a
   * capture by that definition -- which is why "cities move but captures do
   * not" could not be read off the last run. Two sides can have identical
   * captures and opposite stories about why.
   */
  it('tells a side that buys from a side that is bought from', () => {
    const text = report([
      arm('a', [
        outcome({
          sides: ['human', 'wandering'],
          townsBought: { human: 1, wandering: 0 },
          townsLost: { human: 0, wandering: 1 },
        }),
      ]),
    ]);
    const buyer = text.split('\n\n').find((b) => b.startsWith('Humans'))!.split('\n')[2];
    const seller = text.split('\n\n').find((b) => b.startsWith('Wanderin'))!.split('\n')[2];
    expect(buyer, 'the buyer bought one and lost none').toMatch(/1\.00\s+0\.00/);
    expect(seller, 'the seller bought none and lost one').toMatch(/0\.00\s+1\.00/);
  });

  it('gives the raw rows both halves, per side', () => {
    const rows = rawRows([arm('a', [outcome({ sides: ['orc', 'human'] })])]);
    const header = rows.split('\n')[0].split('\t');
    for (const col of ['orcTownsBought', 'orcTownsLost', 'humanTownsBought', 'humanTownsLost']) {
      expect(header, `${col} is missing`).toContain(col);
    }
  });
});
