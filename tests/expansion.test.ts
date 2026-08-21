import { describe, expect, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { createGame, playerCities } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';

/**
 * Where do a faction's cities actually come from?
 *
 * Counted by diffing city ownership every half-turn rather than by reading the
 * log: `log()` keeps only the last 400 entries, so anything derived from it
 * over a 300-turn game is a floor rather than a count.
 */
describe('expansion accounting', () => {
  it('splits city count into founded, captured and lost', () => {
    const rows: string[] = [];
    const totals = [0, 1].map(() => ({ founded: 0, captured: 0, lost: 0, final: 0 }));
    const seeds = [1, 7920, 15839, 23758, 31677, 39596];

    for (const seed of seeds) {
      const state = createGame({ seed });
      state.players[0].controller = 'ai';
      beginPlayerTurn(state, 0);

      const owners = new Map<number, number>();
      const tally = [0, 1].map(() => ({ founded: 0, captured: 0, lost: 0 }));
      const sweep = () => {
        for (const c of state.cities) {
          const was = owners.get(c.id);
          if (was === undefined) tally[c.owner].founded++;
          else if (was !== c.owner) {
            tally[c.owner].captured++;
            tally[was].lost++;
          }
          owners.set(c.id, c.owner);
        }
      };
      sweep();
      for (let i = 0; i < 700 && state.winner === null; i++) {
        runAiTurn(state, state.activePlayer);
        endPlayerTurn(state);
        sweep();
      }

      for (const p of [0, 1]) {
        totals[p].founded += tally[p].founded;
        totals[p].captured += tally[p].captured;
        totals[p].lost += tally[p].lost;
        totals[p].final += playerCities(state, p).length;
      }
      rows.push(
        `seed ${String(seed).padStart(6)}  ` +
          [0, 1]
            .map(
              (p) =>
                `${p === 0 ? 'orc' : 'hum'} f${String(tally[p].founded).padStart(2)} ` +
                `c${String(tally[p].captured).padStart(2)} l${String(tally[p].lost).padStart(2)} ` +
                `=${String(playerCities(state, p).length).padStart(2)}`,
            )
            .join('  |  '),
      );
    }

    const n = seeds.length;
    rows.push('');
    for (const p of [0, 1]) {
      const t = totals[p];
      rows.push(
        `AVG ${p === 0 ? 'orc  ' : 'human'}: founded ${(t.founded / n).toFixed(1)} ` +
          `captured ${(t.captured / n).toFixed(1)} lost ${(t.lost / n).toFixed(1)} ` +
          `final ${(t.final / n).toFixed(1)}`,
      );
    }
    console.log(rows.join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);
});
