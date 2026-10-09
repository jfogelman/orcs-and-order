import { describe, it } from 'vitest';
import { HELD_OUT_BASES, NEW_GAME, TUNED_BASES, playGame, seedSet } from './sweep';
import { control } from './control';
import { FACTIONS } from '../src/model/factions';
import { HIVEKIN } from '../src/sim/hivekin';

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
 * **A turn-one Hive is a two-contender game**, and the first draft of this
 * probe got that half right and the other half wrong. `hivekinArrived` is
 * already true at turn one when seat 0 is the Hive, so `maybeEmerge` never
 * fires and no third side arrives. True. But the control it was compared
 * against was *today's* game -- Horde seat, Kingdom rival, **and a Hive
 * emerging at turn ninety** -- which is three contenders against two.
 *
 * So the two arms differed in who seat 0 was *and* in how many sides were
 * playing, and seat 0's even share is 33% in one and 50% in the other. The
 * numbers came back 39% against 72-94% and the comparison could not carry it.
 *
 * Three arms now, and the middle one is the control that was missing:
 *
 * - **today**: the Horde, the Kingdom, and a Hive that emerges. Three
 *   contenders, and the game as it actually ships.
 * - **two sides**: the Horde against the Kingdom with emergence off. The
 *   like-for-like baseline, where an even game is 50%.
 * - **hive**: the Hive against the Horde from turn one. Also two contenders,
 *   so **this is the one to read against `two sides`**.
 *
 * Fifty per cent against `two sides` means enable it. Far below means their
 * kit does not work from a standing start and the opening needs designing.
 * Far above means it works too well, which is the likelier answer and the
 * cheaper one: their ending was priced in section 125 for a side that does not
 * exist until turn ninety.
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
        for (const arm of ['today', 'two sides', 'hive'] as const) {
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
            // The baseline arm is today's game with the third side taken out,
            // so seat 0 is one of two rather than one of three. **Assigned
            // every time rather than only when turning it off** -- `control()`
            // did not pin this, so the first draft left it off for every arm
            // after the first one that cleared it.
            HIVEKIN.enabled = arm !== 'two sides';
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
            `${name} / ${arm.padEnd(9)}: seat 0 won ${seatWon}/${games} (${pct}%), ` +
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
