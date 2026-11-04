import { describe, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { distance } from '../src/engine/grid';
import { EXORCISTS, exorcises } from '../src/sim/exorcism';
import { PHYSICAL, dispersingSide } from '../src/sim/dispersal';
import { unitType } from '../src/model/units';
import type { GameState } from '../src/model/types';
import { HELD_OUT_BASES, NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
// **Call this before measuring anything.** See the note at the top of
// `control.ts`: `playGame` reads the levers as they stand, and the levers as
// they stand are not the game the sweeps measure.
import { control } from './control';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 164: the hard counter has never once fired. Why?
 *
 * `UNBOUND_PLAN.md` builds the faction on one rule and makes **one promise
 * about it**: *"there is always a hard counter (exorcism), so 'hard to kill'
 * never quietly becomes 'impossible to kill.'"* Section 150 shipped the
 * counter first, explicitly for that reason.
 *
 * Section 163 counted, inside `scatters()`, how often it was used across
 * twelve games: **0 of 1535.** Not a log-reader artefact -- that section is
 * about one of those -- and not for want of the units existing, since an
 * exorcist stands in most games.
 *
 * So this asks the chain of questions between "the unit exists" and "a spirit
 * was sent back", and asks every one of them **off game state** rather than
 * off the log:
 *
 * 1. **Is the advance ever learned?** Four sides have an exorcist and each is
 *    behind an advance that costs between 100 and 140 beakers.
 * 2. **Is one ever built?** This is the fifth instance of the pattern
 *    `src/ai/wants.ts` exists to retire -- `chooseProduction` ranks a Paladin
 *    as an expensive soldier and cannot see the one property it is for.
 * 3. **Does it ever get near a spirit?** One exorcist in an empire cannot be
 *    at the fight that matters, and nothing routes it towards the Unbound.
 * 4. **Does it ever kill one?** Counted the way the ruin probe counts what a
 *    warden kills: a unit of theirs that vanished with an enemy exorcist
 *    standing beside where it stood. An upper bound, and an upper bound is
 *    enough when the thing being bounded is nought.
 *
 * Whichever link is the broken one is where section 164's fix goes. **Do not
 * build the fix from this file's guesses** -- read the numbers.
 *
 * Run as:
 *   npx vitest run --config vitest.sweep.config.ts tools/exorcistprobe.run.test.ts
 *   PROBE_SEEDS=held-out npx vitest run --config vitest.sweep.config.ts \
 *     tools/exorcistprobe.run.test.ts
 */

/**
 * `exorcises` here is the **capability** question -- is this unit, owned by
 * this player, an exorcist right now -- because on this branch it is still a
 * boolean. Section 155 turns it into a roll and splits the capability out as
 * `isExorcist`; when that merges, this file wants the split one, since a probe
 * must never move the game's random stream. See `exorcistsOf`, which is the
 * same trap.
 */

/** The advance each exorcist waits behind, and the Mystic's second one. */
const UNLOCKS: Record<string, string> = {
  paladin: 'run-you-through',
  warden: 'caste-warden',
  mystic: 'signature-mystic',
  'orc-shaman': 'bone-speaker',
  archon: 'archon-tech',
};

/** Which side each one belongs to, so a column is headed by the faction. */
const WHOSE: Record<string, string> = {
  paladin: 'human',
  warden: 'hivekin',
  mystic: 'wandering',
  'orc-shaman': 'orc',
  archon: 'unbound',
};

interface Row {
  /** Games where that side learned the advance that unlocks the unit. */
  learned: number;
  /** Games where the Mystic also learned the flag that lets it exorcise. */
  learnedFlag: number;
  /** Games where one was ever standing. */
  everBuilt: number;
  /** Turn the first one appeared, summed over the games that built one. */
  firstTurn: number;
  /** Distinct units of that kind seen over the whole game, summed. */
  everSeen: number;
  /** Most standing at once, summed over games. */
  mostAtOnce: number;
  /** Half-turns one of theirs was an exorcist *right now* (flag included). */
  armedTurns: number;
}

const blankRow = (): Row => ({
  learned: 0,
  learnedFlag: 0,
  everBuilt: 0,
  firstTurn: 0,
  everSeen: 0,
  mostAtOnce: 0,
  armedTurns: 0,
});

describe('the hard counter', () => {
  it('asks why it has never once fired', () => {
    control();
    NEW_GAME.playerFaction = 'unbound';
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'unbound';
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, 4).seeds;

    const rows: Record<string, Row> = {};
    for (const id of Object.keys(EXORCISTS)) rows[id] = blankRow();

    // The chain's last two links, which are about the pair rather than a side.
    let turnsSampled = 0;
    let turnsAnyExorcistAlive = 0;
    let turnsWithinThree = 0;
    let turnsAdjacent = 0;
    let spiritsLostBesideOne = 0;
    let spiritDeaths = 0;
    const lines: string[] = [];

    try {
      for (const seed of seeds) {
        const seen: Record<string, Set<number>> = {};
        const first: Record<string, number> = {};
        const most: Record<string, number> = {};
        for (const id of Object.keys(EXORCISTS)) {
          seen[id] = new Set();
          most[id] = 0;
        }
        let sampled = -1;
        let near3 = 0;
        let near1 = 0;
        let aliveTurns = 0;
        let turns = 0;
        let lostBeside = 0;
        let deaths = 0;
        let prev = new Map<number, { owner: number; x: number; y: number }>();
        let exorcistsAt: Array<[number, number, number]> = [];
        let last: GameState | null = null;

        playGame(seed, undefined, (state) => {
          last = state;
          const spiritSeats = new Set(
            state.players.filter((p) => dispersingSide(p)).map((p) => p.id),
          );

          // A unit of theirs that was on the board last look and is not now,
          // with an enemy exorcist beside where it stood. Measured against the
          // *previous* look, so `exorcistsAt` is where they were then.
          const now = new Set(state.units.map((u) => u.id));
          for (const [id, was] of prev) {
            if (now.has(id)) continue;
            if (!spiritSeats.has(was.owner)) continue;
            deaths++;
            if (exorcistsAt.some(([x, y, o]) => o !== was.owner && distance(x, y, was.x, was.y) <= 1)) {
              lostBeside++;
            }
          }
          prev = new Map(state.units.map((u) => [u.id, { owner: u.owner, x: u.x, y: u.y }]));
          exorcistsAt = state.units
            .filter((u) => exorcises(state, u))
            .map((u) => [u.x, u.y, u.owner] as [number, number, number]);

          if (state.turn === sampled) return;
          sampled = state.turn;
          turns++;

          // Who is standing, and who is standing *armed* -- the Mystic is an
          // exorcist only once its side has been taught, which is the one
          // place `EXORCISTS` holds a flag rather than null.
          const standing: Record<string, number> = {};
          for (const u of state.units) {
            const base = unitType(u.type).base;
            if (!(base in EXORCISTS)) continue;
            seen[base].add(u.id);
            if (first[base] === undefined) first[base] = state.turn;
            if (exorcises(state, u)) {
              standing[base] = (standing[base] ?? 0) + 1;
              rows[base].armedTurns++;
            }
          }
          for (const [base, n] of Object.entries(standing)) {
            if (n > most[base]) most[base] = n;
          }

          // The two sides in the same place at the same time. Spirits only --
          // an Effigy is not one and the rule says so.
          const spirits = state.units.filter(
            (u) => spiritSeats.has(u.owner) && !PHYSICAL.has(unitType(u.type).base),
          );
          const armed = state.units.filter((u) => exorcises(state, u));
          if (armed.length > 0) aliveTurns++;
          let any3 = false;
          let any1 = false;
          for (const e of armed) {
            for (const s of spirits) {
              if (e.owner === s.owner) continue;
              const d = distance(e.x, e.y, s.x, s.y);
              if (d <= 3) any3 = true;
              if (d <= 1) any1 = true;
              if (any1) break;
            }
            if (any1) break;
          }
          if (any3) near3++;
          if (any1) near1++;
        });

        turnsSampled += turns;
        turnsAnyExorcistAlive += aliveTurns;
        turnsWithinThree += near3;
        turnsAdjacent += near1;
        spiritsLostBesideOne += lostBeside;
        spiritDeaths += deaths;

        const end = last as GameState | null;
        for (const [id, row] of Object.entries(rows)) {
          const whose = WHOSE[id];
          const side = end?.players.find((p) => p.faction === whose);
          if (side?.techs.includes(UNLOCKS[id])) row.learned++;
          if (id === 'mystic' && side?.techs.includes('mystic-exorcism')) row.learnedFlag++;
          if (seen[id].size > 0) {
            row.everBuilt++;
            row.firstTurn += first[id] ?? 0;
          }
          row.everSeen += seen[id].size;
          row.mostAtOnce += most[id];
        }

        lines.push(
          `seed ${seed}: ${Object.entries(seen)
            .map(([id, s]) => `${id} ${s.size}`)
            .join(', ')} | within 3: ${near3}/${turns} turns, adjacent: ${near1} | ` +
            `spirits lost beside one: ${lostBeside}/${deaths}`,
        );
      }
    } finally {
      NEW_GAME.playerFaction = undefined;
    }

    const n = seeds.length;
    const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;
    const report = [
      `# The hard counter, ${n} games (${which} seeds)`,
      '',
      'Section 150 shipped exorcism as the promise that the Unbound are never',
      'unkillable. Section 163 counted it used **0 times in 1535** of their',
      'deaths. This asks which link in the chain is broken.',
      '',
      '## 1 and 2: is it learned, is it built',
      '',
      '| who | side | advance learned | ever built | first | seen a game | most at once |',
      '|---|---|---|---|---|---|---|',
      ...Object.entries(rows).map(([id, r]) => {
        const first = r.everBuilt ? (r.firstTurn / r.everBuilt).toFixed(0) : '—';
        return (
          `| ${id} | ${WHOSE[id]} | ${r.learned}/${n}` +
          `${id === 'mystic' ? ` (flag ${r.learnedFlag}/${n})` : ''}` +
          ` | ${r.everBuilt}/${n} | ${first} | ${(r.everSeen / n).toFixed(1)} | ` +
          `${(r.mostAtOnce / n).toFixed(1)} |`
        );
      }),
      '',
      '## 3: does one ever get near a spirit',
      '',
      `turns sampled: ${turnsSampled}`,
      `turns an armed exorcist was on the board at all: ${turnsAnyExorcistAlive} ` +
        `(${pct(turnsAnyExorcistAlive, turnsSampled)})`,
      `turns one was within 3 of an enemy spirit: ${turnsWithinThree} ` +
        `(${pct(turnsWithinThree, turnsSampled)})`,
      `turns one was **adjacent** to an enemy spirit: ${turnsAdjacent} ` +
        `(${pct(turnsAdjacent, turnsSampled)})`,
      '',
      '## 4: does it ever kill one',
      '',
      `spirit deaths seen: ${spiritDeaths}`,
      `of those, with an enemy exorcist beside where it stood: ${spiritsLostBesideOne}`,
      '',
      '(An upper bound — beside it is not the same as killed by it — and an',
      'upper bound is enough when the thing being bounded is nought.)',
      '',
      '## by seed',
      ...lines,
    ].join('\n');

    if (!existsSync('tools/out')) mkdirSync('tools/out', { recursive: true });
    writeFileSync(
      held ? 'tools/out/exorcist-probe-held-out.md' : 'tools/out/exorcist-probe.md',
      `${report}\n`,
      'utf8',
    );
    console.log(report);
  }, 1_800_000);
});
