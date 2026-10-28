import { describe, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { unitType } from '../src/model/units';
import { DISPERSAL, GUEST_LIST, REFORM_SITES, reformSites } from '../src/sim/dispersal';
import { couldExorcise } from '../src/sim/exorcism';
import { endingFor, endingWorks } from '../src/sim/endings';
import type { GameState } from '../src/model/types';
import { NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
// **Call this before measuring anything.** `playGame` reads the levers as they
// stand, and the levers as they stand are not the game the sweeps measure. A
// probe that skips it is answering a question about a different game -- see
// the note at the top of `control.ts`, which is where that afternoon went.
import { control } from './control';

/**
 * Section 152: does the Unbound's rule ever actually happen?
 *
 * **Not a balance measurement.** Every number in `DISPERSAL` is a guess and
 * the faction has never been played by anybody, so asking "do they win" of a
 * dozen seeds would be asking a question nothing is ready to answer.
 *
 * What this asks is the question section 147 made a memory of: *check it
 * exists before fixing it.* A zero counter usually means the thing never
 * happens, and four of the last six sections found a rule that was shipped,
 * correct, reachable in a test and never once reached in a played game -- the
 * Hive's garrison post, the Wandering Folk's advisors, the Build Post key, the
 * high tier of spies. So: does anything scatter, does anything gather again,
 * does anybody build a Retrieval Circle, does any side ever field the unit
 * that is its only answer to all of it.
 *
 * Run with:
 *   npx vitest run --config vitest.sweep.config.ts tools/unboundprobe.run.test.ts
 */

interface Tally {
  /** Games in which this empire was alive at the end. */
  alive: number;
  cities: number;
  units: number;
  techs: number;
  /** Did it ever learn the advance that unlocks its own ending? */
  endingTech: number;
  /** Works towards that ending standing at the end, of three. */
  works: number;
  /** Spirits that came apart rather than dying, over the whole game. */
  scattered: number;
  /** Spirits that stood up again. */
  gathered: number;
  /** Spirits that came apart and never came back, for any reason. */
  lost: number;
  /** Games in which a Retrieval Circle or an Anchor Totem ever stood. */
  everHadASite: number;
  /** Turn the first one went up, averaged over the games that built one. */
  firstSiteTurn: number;
  /** Games in which an Archon was ever fielded. */
  everArchon: number;
  /** Guests the Spirit Party ever took in. */
  guests: number;
}

const blank = (): Tally => ({
  alive: 0,
  cities: 0,
  units: 0,
  techs: 0,
  endingTech: 0,
  works: 0,
  scattered: 0,
  gathered: 0,
  lost: 0,
  everHadASite: 0,
  firstSiteTurn: 0,
  everArchon: 0,
  guests: 0,
});

/** Exorcists standing, by side, which is the fairness promise as a number. */
const exorcistsOut = new Map<string, number>();

describe('what the Unbound actually do', () => {
  it('plays a dozen of them and counts the rule happening', () => {
    control();
    NEW_GAME.playerFaction = 'unbound';
    const tally = blank();
    const seeds = seedSet('unbound', TUNED_BASES, 4).seeds;
    const lines: string[] = [];

    try {
      for (const seed of seeds) {
        let hadSite = false;
        let firstSite = 0;
        let archon = false;
        let scattered = 0;
        let gathered = 0;
        let lost = 0;
        let guests = 0;
        // What each side's answer to them is worth is counted by sighting
        // rather than by killing: a Paladin that exists is the promise kept,
        // and a Paladin that never meets one is a separate question.
        const seen = new Map<string, number>();

        // **Read forward through the log rather than off its tail.** The
        // first version scanned the last six entries on every half-turn and
        // filtered on the current turn, which counts the same line once per
        // side still to move: it reported 179 spirits lost a game out of an
        // army of 21. `log()` keeps the last 400 entries and this watcher runs
        // every half-turn, so nothing is missed by simply remembering how far
        // it has read -- except across a trim, which a 400-entry window and a
        // handful of lines a turn never reaches.
        let read = 0;
        const watch = (state: GameState) => {
          for (const entry of state.log.slice(read)) {
            if (/scatters rather than falling/.test(entry.text)) scattered++;
            if (/gathers again in/.test(entry.text)) gathered++;
            if (/nowhere for it to gather|does not gather/.test(entry.text)) lost++;
            if (/is counted as having attended/.test(entry.text)) guests++;
          }
          read = state.log.length;
          if (!hadSite && reformSites(state, 0).length > 0) {
            hadSite = true;
            firstSite = state.turn;
          }
          if (
            !archon &&
            state.units.some((u) => u.owner === 0 && unitType(u.type).base === 'archon')
          ) {
            archon = true;
          }
          // Counted as a high-water mark per side rather than summed over
          // half-turns, which was the same double-counting one row down: a
          // Paladin standing for eighty turns is one Paladin.
          for (const p of state.players) {
            const theirs = state.units.filter(
              (u) => u.owner === p.id && couldExorcise(u.type),
            ).length;
            if (theirs > (seen.get(p.faction) ?? 0)) seen.set(p.faction, theirs);
          }
        };

        // `watch` is also where the end state is read from, because `playGame`
        // hands back columns rather than the state: the last call it makes is
        // the game as it finished.
        let last: GameState | null = null;
        const out = playGame(seed, undefined, (state) => {
          watch(state);
          last = state;
        });
        tally.cities += out.cities.unbound ?? 0;
        tally.units += out.units.unbound ?? 0;
        tally.techs += out.techs.unbound ?? 0;
        const end = last as GameState | null;
        const them = end?.players.find((p) => p.faction === 'unbound');
        if (them?.alive) tally.alive++;
        if (end && them) {
          const kind = endingFor('unbound');
          const theirWorks = kind ? endingWorks(kind) : [];
          tally.works += theirWorks.filter((w) =>
            end.cities.some((c) => c.owner === them.id && c.buildings.includes(w.id)),
          ).length;
          if (them.techs.includes('arrangement-permanent')) tally.endingTech++;
        }
        tally.scattered += scattered;
        tally.gathered += gathered;
        tally.lost += lost;
        tally.guests += guests;
        if (hadSite) {
          tally.everHadASite++;
          tally.firstSiteTurn += firstSite;
        }
        if (archon) tally.everArchon++;
        for (const [side, n] of seen) {
          exorcistsOut.set(side, (exorcistsOut.get(side) ?? 0) + n);
        }

        lines.push(
          `seed ${seed}: ${scattered} scattered, ${gathered} back, ${lost} lost, ` +
            `${guests} guests, site ${hadSite ? `turn ${firstSite}` : 'never'}, ` +
            `archon ${archon ? 'yes' : 'no'}`,
        );
      }
    } finally {
      NEW_GAME.playerFaction = undefined;
    }

    const n = seeds.length;
    const avg = (x: number) => (x / n).toFixed(1);
    const report = [
      `# The Unbound, ${n} games`,
      '',
      `Levers as measured: failBase ${DISPERSAL.failBase}, sigil ${DISPERSAL.sigil}, ` +
        `ankh ${DISPERSAL.ankh}, floor ${DISPERSAL.failFloor}, party reach ${GUEST_LIST.reach}.`,
      '',
      `alive at the end: ${tally.alive}/${n}`,
      `cities ${avg(tally.cities)}  units ${avg(tally.units)}  advances ${avg(tally.techs)}`,
      `ending advance reached: ${tally.endingTech}/${n}, works standing ${avg(tally.works)}/3`,
      '',
      '## the rule itself',
      `scattered ${avg(tally.scattered)} a game, gathered again ${avg(tally.gathered)}, ` +
        `lost ${avg(tally.lost)}`,
      `ever had somewhere to gather: ${tally.everHadASite}/${n}` +
        (tally.everHadASite
          ? `, first on turn ${(tally.firstSiteTurn / tally.everHadASite).toFixed(0)}`
          : ''),
      `${REFORM_SITES.join(' / ')} are the two sites`,
      `ever fielded an Archon: ${tally.everArchon}/${n}`,
      `guests taken in by a Spirit Party: ${tally.guests}`,
      '',
      '## the answer to them, by side',
      ...[...exorcistsOut].map(
        ([side, count]) => `${side}: ${(count / n).toFixed(1)} standing at once, at the most`,
      ),
      '',
      '## by seed',
      ...lines,
    ].join('\n');

    if (!existsSync('tools/out')) mkdirSync('tools/out', { recursive: true });
    writeFileSync('tools/out/unbound-probe.md', `${report}\n`, 'utf8');
    console.log(report);
  }, 1_800_000);
});
