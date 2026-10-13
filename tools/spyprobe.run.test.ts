import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { playerUnits } from '../src/sim/gamestate';
import { unitType } from '../src/model/units';
import { SPY } from '../src/sim/spying';
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
  built: number;
  read: number;
  caught: number;
  filed: number;
  lived: number;
}

function tallyOf(state: GameState): Tally {
  const t: Tally = { built: 0, read: 0, caught: 0, filed: 0, lived: 0 };
  for (const p of state.players) {
    if (p.barbarian) continue;
    t.filed += Object.keys(p.readings ?? {}).length;
    t.lived += playerUnits(state, p.id).filter((u) => unitType(u.type).spy).length;
  }
  // The log is a 400-entry window on a three-hundred-turn game, so these are a
  // floor and not a count. Being caught is the only spy event that logs at all.
  t.caught += state.log.filter((e) => /noticed|taking an interest/i.test(e.text)).length;
  return t;
}

describe('is espionage ever on the board', () => {
  it('counts agents, readings and incidents across a set of games', () => {
    control();
    const lines: string[] = [];
    const totals: Tally = { built: 0, read: 0, caught: 0, filed: 0, lived: 0 };
    const seeds = seedSet('spy probe', TUNED_BASES, 8).seeds;

    for (const seed of seeds) {
      // `playGame` returns an Outcome and not the board. The observer it takes
      // is handed the same state object every half-turn, so holding the last
      // one is how a probe gets to look at the game it just played.
      let last: GameState | null = null;
      const out = playGame(seed, undefined, (s) => {
        last = s;
      });
      const t = tallyOf(last!);
      for (const k of Object.keys(totals) as (keyof Tally)[]) totals[k] += t[k];
      lines.push(
        `seed ${String(seed).padStart(9)} T${String(out.turns).padStart(4)} ` +
          `agents alive ${t.lived} | towns on file ${t.filed} | incidents ${t.caught}`,
      );
    }

    const n = seeds.length;
    lines.push('');
    lines.push(`games                 ${n}`);
    lines.push(`agents alive at end   ${(totals.lived / n).toFixed(2)} per game`);
    lines.push(`towns on file at end  ${(totals.filed / n).toFixed(2)} per game`);
    lines.push(`incidents logged      ${(totals.caught / n).toFixed(2)} per game`);
    lines.push('');
    lines.push(
      totals.filed === 0
        ? '**ZERO.** Nothing was ever read. A sweep of SPY would measure the same game twice.'
        : 'Espionage happens. A sweep of it is measuring something.',
    );
    lines.push(`(SPY.ai ${SPY.ai}, SPY.aiWants ${SPY.aiWants}, remembers ${SPY.remembers})`);

    const report = lines.join('\n');
    console.log(report);
    writeFileSync('tools/out/spyprobe.txt', report + '\n', 'utf8');
  }, 1_800_000);
});
