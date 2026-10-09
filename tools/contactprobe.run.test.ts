import { describe, it } from 'vitest';
import { HELD_OUT_BASES, TUNED_BASES, playGame, seedSet } from './sweep';
import { control } from './control';
import { CONTACT, MEETINGS } from '../src/sim/contact';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 3);

/**
 * What a meeting actually tells anybody.
 *
 * Slice 3's sweep came back flat on every column the reveal was supposed to
 * move: paired over 108 seeds, fights -0.46 (t = -0.59), captures +0.10
 * (t = +0.21), turns -1.44 (t = -0.39). The *argument* for the reveal was
 * mechanical and specific -- `nearestEnemyTarget` refuses a tile the AI has
 * not explored, so handing it a town gives the war somewhere to go -- and a
 * mechanical argument that produces nothing is either wrong or not reaching.
 *
 * Telling those apart is one count, and it is a count nothing else in the game
 * keeps: **how many tiles does a meeting newly explore?** If the answer is
 * near zero, the reveal is landing on ground the AI had already walked, the
 * sweep measured a lever that does nothing, and the flat result is honest
 * rather than mysterious.
 *
 * The second question is the one the sweep raised rather than answered: the
 * Hive won 28 of 108 with contact off and 19 with it on, which paired is 13
 * seeds lost against 4 gained. So this also counts when the Hive is met and
 * what happens to it afterwards.
 */
describe('first contact', () => {
  it('counts what a meeting tells anybody', () => {
    for (const [name, bases] of [
      ['tuned', TUNED_BASES],
      ['held-out', HELD_OUT_BASES],
    ] as const) {
      const set = seedSet(name, bases, PER_BASE);
      let games = 0;
      let meetings = 0;
      let toldNothing = 0;
      let freshTiles = 0;
      const metOnTurn: number[] = [];
      // Split, because the two empires meeting and somebody meeting the Hive
      // are different events: one happens in the opening, the other cannot
      // happen before the Hive comes up around turn ninety.
      const empiresMetTurn: number[] = [];
      // The Hive's own story: met when, and holding how much afterwards.
      let hiveMet = 0;
      const hiveMetTurn: number[] = [];
      let hiveEverExisted = 0;
      const hiveCities: number[] = [0, 0, 0]; // turns 150, 200, end

      for (const seed of set.seeds) {
        control();
        CONTACT.enabled = true;
        CONTACT.trace = true;
        MEETINGS.length = 0;
        let last: GameState | null = null;
        let sawHive = false;
        playGame(seed, undefined, (s) => {
          last = s;
          const hive = s.players.find((p) => p.faction === 'hivekin');
          if (hive) sawHive = true;
          if (s.turn === 150) hiveCities[0] += s.cities.filter((c) => c.owner === hive?.id).length;
          if (s.turn === 200) hiveCities[1] += s.cities.filter((c) => c.owner === hive?.id).length;
        });
        CONTACT.trace = false;
        games++;
        if (sawHive) hiveEverExisted++;
        const end = last as GameState | null;
        if (end) {
          const hive = end.players.find((p) => p.faction === 'hivekin');
          hiveCities[2] += end.cities.filter((c) => c.owner === hive?.id).length;
          for (const m of MEETINGS) {
            meetings++;
            const got = Object.values(m.fresh).reduce((t, n) => t + n, 0);
            freshTiles += got;
            if (got === 0) toldNothing++;
            metOnTurn.push(m.turn);
            const hid = hive?.id;
            if (hid !== undefined && (m.a === hid || m.b === hid)) {
              hiveMet++;
              hiveMetTurn.push(m.turn);
            } else {
              empiresMetTurn.push(m.turn);
            }
          }
        }
      }

      const mean = (xs: number[]) =>
        xs.length === 0 ? 'n/a' : (xs.reduce((t, n) => t + n, 0) / xs.length).toFixed(0);
      const per = (n: number) => (n / games).toFixed(2);
      console.log(
        `${name}: ${games} games, ${per(meetings)} meetings a game ` +
          `(empires meet on turn ${mean(empiresMetTurn)}, all ${mean(metOnTurn)}) ` +
          `| ${((toldNothing / Math.max(1, meetings)) * 100).toFixed(0)}% told nobody anything ` +
          `| ${(freshTiles / Math.max(1, meetings)).toFixed(1)} fresh tiles a meeting`,
      );
      console.log(
        `${name}: hive existed in ${hiveEverExisted}, met ${per(hiveMet)} times a game ` +
          `on turn ${mean(hiveMetTurn)} | hive cities t150 ${per(hiveCities[0])} ` +
          `t200 ${per(hiveCities[1])} end ${per(hiveCities[2])}`,
      );

      // And the same game with the lever off, seed for seed. The sweep said
      // the Hive won 28 of 108 with contact off and 19 with it on, which
      // paired is 13 seeds lost against 4 gained -- but one seed set carried
      // nearly all of it and no column in the table moved with it. If being
      // found costs the Hive ground, it costs it *cities*, and that is a
      // number rather than a winner and so far less noisy.
      const off = [0, 0, 0];
      let offGames = 0;
      for (const seed of set.seeds) {
        control();
        CONTACT.enabled = false;
        let last: GameState | null = null;
        playGame(seed, undefined, (s) => {
          last = s;
          const hive = s.players.find((p) => p.faction === 'hivekin');
          if (s.turn === 150) off[0] += s.cities.filter((c) => c.owner === hive?.id).length;
          if (s.turn === 200) off[1] += s.cities.filter((c) => c.owner === hive?.id).length;
        });
        const end = last as GameState | null;
        if (end) {
          const hive = end.players.find((p) => p.faction === 'hivekin');
          off[2] += end.cities.filter((c) => c.owner === hive?.id).length;
        }
        offGames++;
      }
      CONTACT.enabled = true;
      const perOff = (n: number) => (n / offGames).toFixed(2);
      console.log(
        `${name}: hive cities with contact OFF  t150 ${perOff(off[0])} ` +
          `t200 ${perOff(off[1])} end ${perOff(off[2])}`,
      );
    }
  }, 1_800_000);
});
