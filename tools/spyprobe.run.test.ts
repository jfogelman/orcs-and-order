import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { playerUnits } from '../src/sim/gamestate';
import { unitType } from '../src/model/units';
import { SPY, SPY_TRACE } from '../src/sim/spying';
import type { GameState } from '../src/model/types';
import { playGame, seedSet, TUNED_BASES } from './sweep';
// The shipped game, not the levers as they stand. See the note in sweep.run.
import { control } from './control';

/**
 * Section 136 slice 3: does any of this ever happen?
 *
 * **The only question worth asking first**, and the one section 125 did not
 * ask. The Burrower-caste shipped, a sweep measured Sink against Burrow, and
 * the two arms came back byte-identical -- because `worth()` ranks a unit on
 * strength and price and the AI had built 0.2 diggers a game. A whole mechanic
 * measured as no mechanic at all, and the measurement was not wrong: there was
 * nothing on the board to measure.
 *
 * A spy has `attack: 0`. It is the worst soldier in every yard by every number
 * the chooser looks at. So before any sweep of espionage is believed, this
 * counts the things that have to be non-zero for such a sweep to mean
 * anything: agents built, towns read, agents caught, and reports acted on.
 *
 * A zero here is not a finding about espionage. It is a finding about the
 * instrument.
 */
interface Tally {
  /** Times an agent stood at a gate and tried. Counted as it happens. */
  attempts: number;
  read: number;
  missed: number;
  caught: number;
  swept: number;
  found: number;
  wrecks: number;
  wrecked: number;
  lostAtWorks: number;
  wreckedEndings: number;
  /** Distinct towns ever filed. A floor on reads, not a count of them. */
  filed: number;
  /** Agents still alive at the end -- the rest were caught out and killed. */
  lived: number;
}

function tallyOf(state: GameState): Tally {
  const t: Tally = {
    attempts: SPY_TRACE.attempts,
    read: SPY_TRACE.read,
    missed: SPY_TRACE.missed,
    caught: SPY_TRACE.caught,
    swept: SPY_TRACE.swept,
    found: SPY_TRACE.found,
    wrecks: SPY_TRACE.wrecks,
    wrecked: SPY_TRACE.wrecked,
    lostAtWorks: SPY_TRACE.lostAtWorks,
    wreckedEndings: SPY_TRACE.wreckedEndings,
    filed: 0,
    lived: 0,
  };
  for (const p of state.players) {
    if (p.barbarian) continue;
    // Keyed by city, so an agent that read one gate forty times files one
    // entry. Kept as a cross-check on the counters, never as the measurement.
    t.filed += Object.keys(p.readings ?? {}).length;
    t.lived += playerUnits(state, p.id).filter((u) => unitType(u.type).spy).length;
  }
  return t;
}

describe('is espionage ever on the board', () => {
  it('counts agents, readings and incidents across a set of games', () => {
    control();
    const lines: string[] = [];
    const zero = (): Tally => ({
      attempts: 0, read: 0, missed: 0, caught: 0, swept: 0, found: 0,
      wrecks: 0, wrecked: 0, lostAtWorks: 0, wreckedEndings: 0, filed: 0, lived: 0,
    });
    const totals: Tally = zero();
    const seeds = seedSet('spy probe', TUNED_BASES, 8).seeds;

    for (const seed of seeds) {
      // `playGame` returns an Outcome and not the board. The observer it takes
      // is handed the same state object every half-turn, so holding the last
      // one is how a probe gets to look at the game it just played.
      let last: GameState | null = null;
      // Zeroed per game, or every row would be the running total of the ones
      // before it and the last game would look like the busiest.
      for (const k of Object.keys(SPY_TRACE) as (keyof typeof SPY_TRACE)[]) SPY_TRACE[k] = 0;
      const out = playGame(seed, undefined, (s) => {
        last = s;
      });
      const t = tallyOf(last!);
      for (const k of Object.keys(totals) as (keyof Tally)[]) totals[k] += t[k];
      lines.push(
        `seed ${String(seed).padStart(9)} T${String(out.turns).padStart(4)} ` +
          `tried ${String(t.attempts).padStart(3)} | read ${String(t.read).padStart(3)} ` +
          `| quiet ${String(t.missed).padStart(3)} | caught ${String(t.caught).padStart(3)} ` +
          `| swept ${String(t.swept).padStart(3)} found ${t.found} ` +
          `| wrecks ${String(t.wrecks).padStart(2)} (${t.wrecked} done, ${t.wreckedEndings} endings, ${t.lostAtWorks} lost) ` +
          `| alive ${t.lived}`,
      );
    }

    const n = seeds.length;
    lines.push('');
    lines.push(`games                 ${n}`);
    lines.push(`readings attempted    ${(totals.attempts / n).toFixed(2)} per game`);
    lines.push(`  of which read       ${(totals.read / n).toFixed(2)}`);
    lines.push(`  quiet failures      ${(totals.missed / n).toFixed(2)}`);
    lines.push(`  caught              ${(totals.caught / n).toFixed(2)}`);
    lines.push(`distinct towns filed  ${(totals.filed / n).toFixed(2)} per game`);
    lines.push(`agents alive at end   ${(totals.lived / n).toFixed(2)} per game`);
    lines.push('');
    lines.push(`sweeps run            ${(totals.swept / n).toFixed(2)} per game`);
    lines.push(`  disguises seen thru ${(totals.found / n).toFixed(2)}`);
    lines.push(`sabotage attempted    ${(totals.wrecks / n).toFixed(2)} per game`);
    lines.push(`  works wrecked       ${(totals.wrecked / n).toFixed(2)}`);
    lines.push(`  of those, endings   ${(totals.wreckedEndings / n).toFixed(2)}`);
    lines.push(`  agents lost at them ${(totals.lostAtWorks / n).toFixed(2)}`);
    if (totals.wrecks === 0) {
      // The whole reason this file exists. A sweep of SABOTAGE with this at
      // zero would be measuring the same game twice and calling it balance.
      lines.push('  **NO SABOTAGE EVER HAPPENED.** Any arm of it measures nothing.');
    }
    if (totals.attempts > 0) {
      // The shape the rules predict at rank 0: three readings in four, and one
      // in eight of the whole attempts caught. A measured shape far off that
      // means agents are not surviving long enough to be promoted, or are
      // dying before they ever reach a gate.
      lines.push('');
      lines.push(
        `read ${((100 * totals.read) / totals.attempts).toFixed(0)}% ` +
          `quiet ${((100 * totals.missed) / totals.attempts).toFixed(0)}% ` +
          `caught ${((100 * totals.caught) / totals.attempts).toFixed(0)}% ` +
          `(rank 0 predicts 75 / 12.5 / 12.5)`,
      );
    }
    lines.push('');
    lines.push(
      totals.attempts === 0
        ? '**ZERO.** No agent ever tried. A sweep of SPY would measure the same game twice.'
        : 'Espionage happens. A sweep of it is measuring something.',
    );
    lines.push(`(SPY.ai ${SPY.ai}, SPY.aiWants ${SPY.aiWants}, remembers ${SPY.remembers})`);

    const report = lines.join('\n');
    console.log(report);
    writeFileSync('tools/out/spyprobe.txt', report + '\n', 'utf8');
  }, 1_800_000);
});
