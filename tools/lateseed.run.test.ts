import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { playGame } from './sweep';
import { control } from './control';
import { playerCities } from '../src/sim/gamestate';

/**
 * Which seeds still reach turn 299 with both empires alive.
 *
 * `fixtures.test.ts` needs one for its late-game saves, and the endings keep
 * getting faster: section 125's Hivekin now win a quarter of their games off
 * their own ending around turn 240, so far fewer games run to the limit. The
 * list in that file is an ordering, not a set -- this is how it gets reordered
 * without an afternoon of guessing.
 */
it('finds seeds that still run long', () => {
  const found: number[] = [];
  const lines: string[] = [];
  for (let seed = 1; seed <= 60 && found.length < 6; seed++) {
    control();
    let last = 0;
    let bothAlive = false;
    playGame(seed, (300 + 10) * 4, (state) => {
      last = state.turn;
      if (state.turn >= 299 && !bothAlive) {
        bothAlive =
          state.players[0].alive &&
          state.players[1].alive &&
          playerCities(state, 0).length > 0 &&
          playerCities(state, 1).length > 0;
      }
    });
    lines.push(`seed ${seed}: last turn ${last}${bothAlive ? '  <-- usable' : ''}`);
    if (bothAlive) found.push(seed);
  }
  const text = `usable seeds: ${found.join(', ')}\n\n${lines.join('\n')}`;
  writeFileSync('lateseeds.txt', text, 'utf8');
  console.log('\n' + text + '\n');
}, 3_600_000);
