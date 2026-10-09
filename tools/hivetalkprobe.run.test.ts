import { describe, it } from 'vitest';
import { HELD_OUT_BASES, TUNED_BASES, playGame, seedSet } from './sweep';
import { control } from './control';
import { DIPLOMACY_AI, wantPeace } from '../src/ai/diplomacy';
import { PEACE, atWarLately, pairKey, talksWith } from '../src/sim/diplomacy';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 3);

/**
 * Does the Hive ever actually reach the table?
 *
 * Slice 3b's sweep came back with **80 of 108 seeds byte-identical** and the
 * Hive's win count unchanged on every single seed -- 6/13 against 6/13, and
 * `fights` moving by exactly +0.000 across the paired set. A peace stops the
 * fighting, so a fight count that does not move at all is a very strong hint
 * that no peace involving the Hive was ever signed.
 *
 * That is the section 125 trap again: `BURROW.aiKnows` carries the note about
 * two arms reading identical numbers because the AI had no route to the
 * mechanic. The lever here is real and `aiDiplomacy` *is* called for the Hive
 * -- `runAiTurn` passes every non-barbarian AI through it -- so if nothing
 * happens, it is a precondition that never fires rather than a wire that was
 * never connected.
 *
 * So count the preconditions, in order, and find the one that is zero.
 */
describe('the Hive at the table', () => {
  it('counts how far down the chain it gets', () => {
    for (const [name, bases] of [
      ['tuned', TUNED_BASES],
      ['held-out', HELD_OUT_BASES],
    ] as const) {
      const set = seedSet(name, bases, PER_BASE);
      let games = 0;
      let hiveExisted = 0;
      // The chain, in the order `aiDiplomacy` walks it.
      let couldTalk = 0; // `talksWith` ever lists an empire for the Hive
      let everFought = 0; // `atWarLately` ever true for a Hive pair
      let everWantedEnough = 0; // wantPeace >= asks on a turn it had fought
      let everOffered = 0; // `lastOffer` holds a Hive pair
      let everSigned = 0; // a Hive pair ever held a peace
      let peaceTurns = 0; // turns a Hive pair spent at peace
      // And the question the sweep could not answer: a truce is supposed to
      // stop fighting, and `fights` moved by exactly zero in all 108 seeds.
      const signedOn: number[] = [];
      // **Attributed to the attacker.** `resolveCombat` logs with
      // `attacker.owner`, so a count keyed on the Hive's id answers "how often
      // does the Hive swing", not "how often is the Hive in a fight". The
      // first draft of this probe read it as the latter and would have
      // reported a war that does not exist as a Hive that is never touched.
      const swungBy = new Map<number, number>();
      let allCombats = 0;
      // So losses are counted directly, which is the only honest way to ask
      // whether a truce is binding anything.
      let hiveLost = 0;
      let hiveLostAtPeace = 0;

      for (const seed of set.seeds) {
        control();
        let sawHive = false;
        let sawTalk = false;
        let sawWar = false;
        let sawWant = false;
        let sawOffer = false;
        let sawPeace = false;
        let readLog = 0;
        let before = new Set<number>();
        playGame(seed, undefined, (s: GameState) => {
          const hive = s.players.find((p) => p.faction === 'hivekin' && p.alive);
          // Counted as it happens and from an index, because `log()` keeps only
          // the last 400 entries -- the warning `playGame` carries about
          // reading fights off the tail.
          for (let i = readLog; i < s.log.length; i++) {
            const e = s.log[i];
            if (e.kind !== 'combat') continue;
            allCombats++;
            if (e.player !== null && e.player !== undefined) {
              swungBy.set(e.player, (swungBy.get(e.player) ?? 0) + 1);
            }
          }
          readLog = s.log.length;
          if (hive) {
            const now = new Set(s.units.filter((u) => u.owner === hive.id).map((u) => u.id));
            let gone = 0;
            for (const id of before) if (!now.has(id)) gone++;
            hiveLost += gone;
            const bound = talksWith(s, hive.id).some(
              (id) => s.diplomacy?.pairs?.[pairKey(hive.id, id)]?.peace,
            );
            if (bound) hiveLostAtPeace += gone;
            before = now;
          }
          if (!hive) return;
          sawHive = true;
          const partners = talksWith(s, hive.id);
          if (partners.length > 0) sawTalk = true;
          for (const id of partners) {
            if (atWarLately(s, hive.id, id)) {
              sawWar = true;
              const want = wantPeace(s, hive, s.players[id]);
              if (want >= DIPLOMACY_AI.asks) sawWant = true;
            }
            const key = pairKey(hive.id, id);
            if (s.diplomacy?.lastOffer?.[key] !== undefined) sawOffer = true;
            const treaty = s.diplomacy?.pairs?.[key]?.peace;
            if (treaty) {
              if (!sawPeace) signedOn.push(treaty.since);
              sawPeace = true;
              peaceTurns++;
            }
          }
        });
        games++;
        if (sawHive) hiveExisted++;
        if (sawTalk) couldTalk++;
        if (sawWar) everFought++;
        if (sawWant) everWantedEnough++;
        if (sawOffer) everOffered++;
        if (sawPeace) everSigned++;
      }

      console.log(
        `${name}: ${games} games | hive existed ${hiveExisted} | could talk ${couldTalk} | ` +
          `fought lately ${everFought} | wanted >= ${DIPLOMACY_AI.asks} ${everWantedEnough} | ` +
          `offered ${everOffered} | signed ${everSigned} | ${peaceTurns} player-turns at peace ` +
          `(term is ${PEACE.term})`,
      );
      const mean = (xs: number[]) =>
        xs.length === 0 ? 'n/a' : (xs.reduce((t, n) => t + n, 0) / xs.length).toFixed(0);
      const swings = [...swungBy.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([id, n]) => `p${id} ${(n / games).toFixed(1)}`)
        .join(', ');
      console.log(
        `${name}: first Hive treaty on turn ${mean(signedOn)} | ` +
          `${(allCombats / Math.max(1, games)).toFixed(1)} fights a game, swung by [${swings}] | ` +
          `Hive units lost ${(hiveLost / Math.max(1, games)).toFixed(1)} a game, ` +
          `${(hiveLostAtPeace / Math.max(1, games)).toFixed(1)} of them while bound by a treaty`,
      );
    }
  }, 900_000);
});
