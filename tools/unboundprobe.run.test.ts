import { describe, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { unitType } from '../src/model/units';
import { DISPERSAL, GUEST_LIST, REFORM_SITES, reformSites } from '../src/sim/dispersal';
import { couldExorcise } from '../src/sim/exorcism';
import { endingFor, endingWorks } from '../src/sim/endings';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };
import { HELD_OUT_BASES, NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
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
  // ---------------------------------------------------------- the doorway
  //
  // Section 155's probe found the site built in 12/12 games and **nothing
  // ever scattering with one open**, which is two different failures wearing
  // one number. These separate them: a Totem has no condition at all, so if
  // they are building Totems the doorway is open and something else is wrong;
  // a Circle works only while its city is empty, and this AI garrisons every
  // city.
  /** Games where an Anchor Totem ever stood, and the turn the first did. */
  everTotem: number;
  firstTotemTurn: number;
  /** Games where a Retrieval Circle ever stood, and the turn the first did. */
  everCircle: number;
  firstCircleTurn: number;
  /** Games where they ever learned the advance that grants the Totem. */
  everTotemTech: number;
  /** Turns sampled, turns with any site *built*, turns with one *usable*. */
  turns: number;
  turnsBuilt: number;
  turnsOpen: number;
  /**
   * **When** a spirit was lost, against when the doorway existed.
   *
   * The doorway turns out to be open on a third of all turns, so "nothing ever
   * scatters with one open" is not explained by the door being shut -- 0 of
   * ten deaths at 36% open is a 1.2% coincidence, which is small enough to
   * doubt and not small enough to call proof. The alternative is that spirits
   * die **early**, before the first Circle goes up around turn 38. This is the
   * number that tells those two apart.
   */
  lostBeforeAnySite: number;
  lostAfter: number;
  lostTurnSum: number;
  /**
   * **The open rate, split by which building is holding the door.**
   *
   * A Totem has no condition, so from the turn one stands the door is open for
   * ever. That makes the overall 36% an average of two different games, and if
   * the Totem games carry it then a Circle-only empire's door is open far less
   * than the average suggests -- which would explain 0 of 10 without needing
   * any correlation at all.
   */
  circleOnlyTurns: number;
  circleOnlyOpen: number;
  withTotemTurns: number;
  /** At the moment of a loss, who was standing on their Circle towns. */
  blockedByOwn: number;
  blockedByEnemy: number;
  lostWithNoCircleStanding: number;
  /**
   * **Every unit of theirs that left the board, by any means.**
   *
   * The question behind the question. `lost` counts only the spirits that went
   * through `scatter`'s no-site branch, so 0.8 a game could mean either *the
   * doorway is shut* or *they hardly ever lose anybody*. Counted by watching
   * units vanish, the way the ruin probe counts what a warden kills, because
   * a death is an event and this only ever sees states.
   */
  deaths: number;
  /** Of those, the ones an Effigy -- which never scatters -- accounts for. */
  effigyDeaths: number;
  /**
   * **Deaths of theirs that never reached `destroyUnit` at all.** Section 165.
   *
   * `detonate` and `clubEffects` splice their victims straight out of
   * `state.units`, so a spirit caught by a sapper going up or an ogre's club
   * never scatters, is never offered to a Spirit Party, and is logged *"is
   * caught in the blast"* or *"does not get up"* -- the second being the one
   * sentence this faction's rule exists to make untrue.
   *
   * Counted off those two messages, filtered to their seat, because the
   * messages are written with the victim's owner on them.
   */
  blasted: number;
  clubbed: number;
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
  everTotem: 0,
  firstTotemTurn: 0,
  everCircle: 0,
  firstCircleTurn: 0,
  everTotemTech: 0,
  turns: 0,
  turnsBuilt: 0,
  turnsOpen: 0,
  lostBeforeAnySite: 0,
  lostAfter: 0,
  lostTurnSum: 0,
  circleOnlyTurns: 0,
  circleOnlyOpen: 0,
  withTotemTurns: 0,
  blockedByOwn: 0,
  blockedByEnemy: 0,
  lostWithNoCircleStanding: 0,
  deaths: 0,
  effigyDeaths: 0,
  blasted: 0,
  clubbed: 0,
});

/** Exorcists standing, by side, which is the fairness promise as a number. */
const exorcistsOut = new Map<string, number>();

describe('what the Unbound actually do', () => {
  it('plays a dozen of them and counts the rule happening', () => {
    control();
    NEW_GAME.playerFaction = 'unbound';
    const tally = blank();
    // Section 163: the held-out set on demand, because a figure from one set
    // is a figure nobody should act on -- what this project believes is a
    // swing **both** sets agree about. Run as:
    //   PROBE_SEEDS=held-out npx vitest run --config vitest.sweep.config.ts \
    //     tools/unboundprobe.run.test.ts
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'unbound';
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, 4).seeds;
    const lines: string[] = [];

    try {
      for (const seed of seeds) {
        let hadSite = false;
        let firstSite = 0;
        let firstTotem = 0;
        let firstCircle = 0;
        let totemTech = false;
        // Sampled once a game-turn rather than once a half-turn: `watch` runs
        // per side still to move, and a ratio of half-turns would be the same
        // ratio counted six times.
        let sampledTurn = -1;
        let turns = 0;
        let turnsBuilt = 0;
        let turnsOpen = 0;
        let lostBefore = 0;
        let lostAfter = 0;
        let lostTurnSum = 0;
        let anySiteYet = false;
        let circleOnlyTurns = 0;
        let circleOnlyOpen = 0;
        let withTotemTurns = 0;
        let blockedByOwn = 0;
        let blockedByEnemy = 0;
        let lostNoCircle = 0;
        let deaths = 0;
        let effigyDeaths = 0;
        let blasted = 0;
        let clubbed = 0;
        let before = new Map<number, string>();
        let archon = false;
        let scattered = 0;
        let gathered = 0;
        let lost = 0;
        let guests = 0;
        // What each side's answer to them is worth is counted by sighting
        // rather than by killing: a Paladin that exists is the promise kept,
        // and a Paladin that never meets one is a separate question.
        const seen = new Map<string, number>();

        // **Read forward through the log, anchored on the last line seen.**
        //
        // The first version scanned the last six entries every half-turn and
        // filtered on the current turn, which counted the same line once per
        // side still to move: 179 spirits lost a game out of an army of 21.
        //
        // The second remembered an **index** -- `read = state.log.length` --
        // and its comment said a trim "a 400-entry window and a handful of
        // lines a turn never reaches". **That was wrong, and wrong silently.**
        // `log()` splices the front off at 400, so in a six-player war the
        // length pins at 400, `read` pins at 400, and `slice(read)` returns
        // nothing for the rest of the game. Every log-derived figure stopped
        // counting partway through and reported a number near zero -- which
        // is where "scattered 0.0 a game" came from, and that figure reached
        // the design queue, a memory and a pull request before a counter
        // placed *inside* the rule disagreed with it by three orders of
        // magnitude.
        //
        // Anchored on the last entry **by reference** instead. A trim drops
        // the oldest, never the newest, so the anchor is still in the window
        // on the next half-turn and everything after it is new.
        let anchor: GameState['log'][number] | null = null;
        const watch = (state: GameState) => {
          const at = anchor ? state.log.indexOf(anchor) : -1;
          const fresh = at >= 0 ? state.log.slice(at + 1) : state.log;
          for (const entry of fresh) {
            // Section 165: the two doors that are not `destroyUnit`.
            if (entry.player === 0) {
              if (/is caught in the blast/.test(entry.text)) blasted++;
              if (/does not get up\./.test(entry.text)) clubbed++;
            }
            if (/scatters rather than falling/.test(entry.text)) scattered++;
            if (/gathers again in/.test(entry.text)) gathered++;
            if (/nowhere for it to gather|does not gather/.test(entry.text)) {
              lost++;
              lostTurnSum += state.turn;
              if (anySiteYet) lostAfter++;
              else lostBefore++;
              // Who shut it. Asked of every Circle town they hold at the
              // moment the message was written, which is the same half-turn.
              const circleTowns = state.cities.filter(
                (c) => c.owner === 0 && c.buildings.includes(REFORM_SITES[1]),
              );
              if (circleTowns.length === 0) lostNoCircle++;
              for (const c of circleTowns) {
                const on = state.units.filter((u) => u.x === c.x && u.y === c.y);
                if (on.some((u) => u.owner !== 0)) blockedByEnemy++;
                else if (on.length > 0) blockedByOwn++;
              }
            }
            if (/is counted as having attended/.test(entry.text)) guests++;
          }
          anchor = state.log[state.log.length - 1] ?? anchor;

          // Anything of theirs that was on the board last look and is not now.
          const now = new Set(state.units.map((u) => u.id));
          for (const [id, type] of before) {
            if (now.has(id)) continue;
            deaths++;
            if (unitType(type).base === 'effigy') effigyDeaths++;
          }
          before = new Map(
            state.units.filter((u) => u.owner === 0).map((u) => [u.id, u.type as string]),
          );

          if (state.turn !== sampledTurn) {
            sampledTurn = state.turn;
            turns++;
            const mine = state.cities.filter((c) => c.owner === 0);
            const totems = mine.filter((c) => c.buildings.includes(REFORM_SITES[0])).length;
            const circles = mine.filter((c) => c.buildings.includes(REFORM_SITES[1])).length;
            if (totems > 0 && firstTotem === 0) firstTotem = state.turn;
            if (circles > 0 && firstCircle === 0) firstCircle = state.turn;
            if (totems + circles > 0) {
              turnsBuilt++;
              anySiteYet = true;
              if (totems > 0) withTotemTurns++;
              else {
                circleOnlyTurns++;
                if (reformSites(state, 0).length > 0) circleOnlyOpen++;
              }
            }
            // The whole question, as one comparison: a site that is *built*
            // against a site a spirit could actually gather in today.
            if (reformSites(state, 0).length > 0) turnsOpen++;
            if (!totemTech && state.players[0]?.techs.includes('anchor-totem')) totemTech = true;
          }

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
        if (firstTotem > 0) {
          tally.everTotem++;
          tally.firstTotemTurn += firstTotem;
        }
        if (firstCircle > 0) {
          tally.everCircle++;
          tally.firstCircleTurn += firstCircle;
        }
        if (totemTech) tally.everTotemTech++;
        tally.turns += turns;
        tally.turnsBuilt += turnsBuilt;
        tally.turnsOpen += turnsOpen;
        tally.lostBeforeAnySite += lostBefore;
        tally.lostAfter += lostAfter;
        tally.lostTurnSum += lostTurnSum;
        tally.circleOnlyTurns += circleOnlyTurns;
        tally.circleOnlyOpen += circleOnlyOpen;
        tally.withTotemTurns += withTotemTurns;
        tally.blockedByOwn += blockedByOwn;
        tally.blockedByEnemy += blockedByEnemy;
        tally.lostWithNoCircleStanding += lostNoCircle;
        tally.deaths += deaths;
        tally.effigyDeaths += effigyDeaths;
        tally.blasted += blasted;
        tally.clubbed += clubbed;
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
      `# The Unbound, ${n} games (${which} seeds)`,
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
      '## the doorway: built, against actually open',
      `a Totem ever stood: ${tally.everTotem}/${n}` +
        (tally.everTotem
          ? `, first on turn ${(tally.firstTotemTurn / tally.everTotem).toFixed(0)}`
          : ''),
      `a Circle ever stood: ${tally.everCircle}/${n}` +
        (tally.everCircle
          ? `, first on turn ${(tally.firstCircleTurn / tally.everCircle).toFixed(0)}`
          : ''),
      `ever learned the Totem's advance: ${tally.everTotemTech}/${n}`,
      `turns with a site built: ${tally.turnsBuilt}/${tally.turns}` +
        ` (${((100 * tally.turnsBuilt) / Math.max(1, tally.turns)).toFixed(0)}%)`,
      `turns with one a spirit could use: ${tally.turnsOpen}/${tally.turns}` +
        ` (${((100 * tally.turnsOpen) / Math.max(1, tally.turns)).toFixed(0)}%)`,
      `so the doorway is shut on ${(
        100 - (100 * tally.turnsOpen) / Math.max(1, tally.turnsBuilt)
      ).toFixed(0)}% of the turns it exists`,
      '',
      '## which building was holding the door',
      `turns with only Circles: ${tally.circleOnlyTurns}, of which open ` +
        `${tally.circleOnlyOpen} (${(
          (100 * tally.circleOnlyOpen) / Math.max(1, tally.circleOnlyTurns)
        ).toFixed(0)}%)`,
      `turns with a Totem standing: ${tally.withTotemTurns} (open by definition)`,
      '',
      '## how often they lose anybody at all',
      `units of theirs that left the board: ${avg(tally.deaths)} a game ` +
        `(${tally.deaths} over ${n})`,
      `of those, Effigies, which never scatter: ${tally.effigyDeaths}`,
      `of those, killed by a path that skips \`destroyUnit\` entirely: ` +
        `${tally.blasted} blasted, ${tally.clubbed} clubbed ` +
        `(${(((tally.blasted + tally.clubbed) * 100) / Math.max(1, tally.deaths)).toFixed(1)}%)`,
      `against ${avg(tally.lost)} a game that reached the no-site branch`,
      '',
      '## and when the spirits actually died',
      `at a loss, Circle towns blocked by one of their own: ${tally.blockedByOwn}`,
      `at a loss, Circle towns blocked by somebody else's: ${tally.blockedByEnemy}`,
      `losses with no Circle standing at all: ${tally.lostWithNoCircleStanding}`,
      `lost before any site had ever been built: ${tally.lostBeforeAnySite}`,
      `lost after one existed: ${tally.lostAfter}`,
      `average turn of a loss: ${
        tally.lost ? (tally.lostTurnSum / tally.lost).toFixed(0) : 'n/a'
      }, against the first Circle around turn ${
        tally.everCircle ? (tally.firstCircleTurn / tally.everCircle).toFixed(0) : 'n/a'
      }`,
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
    writeFileSync(
      held ? 'tools/out/unbound-probe-held-out.md' : 'tools/out/unbound-probe.md',
      `${report}\n`,
      'utf8',
    );
    console.log(report);
  }, 1_800_000);
});
