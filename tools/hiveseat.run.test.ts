import { describe, it } from 'vitest';
import { HELD_OUT_BASES, NEW_GAME, TUNED_BASES, playGame, seedSet } from './sweep';
import { control } from './control';
import { FACTIONS } from '../src/model/factions';

declare const process: { env: Record<string, string | undefined> };
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 6);

/**
 * Is a Hive that starts on turn one competitive?
 *
 * The question before deciding whether to make the Hivekin playable. They are
 * kept out of the picker by one flag -- `startsOnMap: false` -- and the field's
 * own comment names the reason: *"it would need its own opening, and the whole
 * point of emergence was to leave the measured opening alone."*
 *
 * **A turn-one Hive is a two-contender game, and that is the thing to hold on
 * to while reading this.** `hivekinArrived` is already true at turn one when
 * seat 0 is the Hive, so `maybeEmerge` never fires and no third side arrives.
 * So the honest control is not the current three-sided game; it is the
 * *two-empire* game this project measured for a hundred sections, which is
 * what `startingRival` produces either way.
 *
 * Both arms are therefore seat 0 against one AI empire, on the same seeds,
 * differing only in who seat 0 is:
 *
 * - **control**: the Horde against the Kingdom, which is the measured game.
 * - **hive**: the Hive against the Horde, which is `startingRival`'s answer
 *   for a Hivekin seat once the flag is flipped.
 *
 * Fifty per cent would mean "enable it". Far below means their kit does not
 * work from a standing start and the opening needs designing, which is the
 * expensive answer and the one worth knowing before any of it is built.
 */
describe('a Hive that starts on the map', () => {
  it('counts whether it can hold its own from turn one', () => {
    // The flag, flipped here rather than in the source: this probe is asking
    // what would happen *if*, and leaving it off everywhere else means no
    // other measurement is disturbed by the question being asked.
    const was = FACTIONS.hivekin.startsOnMap;
    try {
      for (const [name, bases] of [
        ['tuned', TUNED_BASES],
        ['held-out', HELD_OUT_BASES],
      ] as const) {
        const set = seedSet(name, bases, PER_BASE);
        for (const arm of ['control', 'hive'] as const) {
          let seatWon = 0;
          let rivalWon = 0;
          let unfinished = 0;
          let turns = 0;
          let seatCities = 0;
          let rivalCities = 0;
          const how: Record<string, number> = {};

          for (const seed of set.seeds) {
            control();
            FACTIONS.hivekin.startsOnMap = arm === 'hive';
            NEW_GAME.playerFaction = arm === 'hive' ? 'hivekin' : undefined;
            const out = playGame(seed);
            turns += out.turns;
            seatCities += out.cities[0];
            rivalCities += out.cities[1];
            if (out.winner === 0) seatWon++;
            else if (out.winner === 1) rivalWon++;
            else unfinished++;
            if (out.victory) how[out.victory] = (how[out.victory] ?? 0) + 1;
          }

          const games = set.seeds.length;
          const pct = ((seatWon / games) * 100).toFixed(0);
          const endings = Object.entries(how)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${k} ${n}`)
            .join(', ');
          console.log(
            `${name} / ${arm.padEnd(7)}: seat 0 won ${seatWon}/${games} (${pct}%), ` +
              `rival ${rivalWon}, other ${unfinished} | ` +
              `${(turns / games).toFixed(0)} turns | ` +
              `cities ${(seatCities / games).toFixed(1)}/${(rivalCities / games).toFixed(1)} | ` +
              `${endings}`,
          );
        }
      }
    } finally {
      FACTIONS.hivekin.startsOnMap = was;
      NEW_GAME.playerFaction = undefined;
    }
  }, 1_800_000);
});
