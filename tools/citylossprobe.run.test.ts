import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, NEW_GAME, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { playerCities } from '../src/sim/gamestate';
import { arrivalTurnFor, latecomers } from '../src/sim/arrivals';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 178: how does a faction lose its cities?
 *
 * The Unbound peak at 11-12 cities and finish with about three, and four
 * sections in a row improved how they *build* without anyone measuring how they
 * *lose*. This only measures; it changes nothing and moves no RNG.
 *
 * ## Every way a player stops owning a city
 *
 * Read off `src/sim`, by searching for `city.owner =` and for every splice of
 * `state.cities`. There are exactly four, and nothing else assigns an owner
 * (incitement sets an `unrest` timer and never transfers the town):
 *
 * 1. `captureCity` (movement.ts) -- a unit walks in; the owner becomes the
 *    unit's owner. The taker can be a contender or the raiders.
 * 2. `razeCity` (movement.ts) -- a capture that would leave no citizens; the
 *    city is removed from the map.
 * 3. `returnRaiderHeldCities` (barbarians.ts) -- a raider-held town reverts to
 *    its founder if it is alive, or is deleted if not.
 * 4. `abandonSeat` (hivekin.ts) -- a Hive that raised no Queen lets the seat go.
 *
 * ## How losses are detected
 *
 * By comparing owner maps between watch-hook calls, not from the log (which is
 * trimmed at 400 and undercounts busy games) and not with a counter in the
 * rules. Each call is one half-turn, so the only miss is a city changing hands
 * twice inside a single half-turn, which this cannot see. Classification:
 *
 * - owner changed, old owner an empire: captured by the new owner (a contender
 *   by faction, or "raiders" if the new owner is a barbarian seat);
 * - city gone, old owner an empire: abandoned if it was that side's
 *   `queenSeat`, otherwise razed (the only other deleter of a held city);
 * - city gone, old owner a barbarian seat: a raider-held town deleted with no
 *   founder to give it back to (not a loss for any faction, counted apart);
 * - barbarian to empire: a raider-held town handed back (a gain, counted apart).
 *
 * Distinct turns are never divided by hook-weighted sums; every figure is an
 * event count or a per-game mean.
 *
 * `npm run cityloss`, and `PROBE_SEEDS=held-out` for the other set.
 */

type Kind = 'captured' | 'razed' | 'abandoned';
interface Loss {
  turn: number;
  /** The game's last turn, to put the loss in a third of the game. */
  end: number;
  kind: Kind;
  taker: string;
  size: number;
  /** Was it founded by the side losing it (rather than itself captured)? */
  own: boolean;
}
interface Late {
  /** `arrivalTurnFor` for this faction's slot: when it is due. */
  due: number;
  /** First observation at which the faction's player existed; undefined if never. */
  came: number | undefined;
  eliminated: boolean;
  /** Turn it last went from holding a city to none; undefined if it never held one. */
  elimTurn: number | undefined;
}
interface Tally {
  games: number;
  peaks: number[];
  finals: number[];
  peakTurns: number[];
  founded: number;
  gainedByCapture: number;
  handedBack: number;
  eliminated: number;
  /** Per game: final and peak cities split by whether the side survived. */
  survFinals: number[];
  survPeaks: number[];
  elimPeaks: number[];
  /** Per eliminated game: the turn the side last dropped to zero cities. */
  elimTurns: number[];
  /** Eliminated games in which the side never held a city at any hook. */
  neverHeld: number;
  /** One row per game in which this faction was a latecomer (not on the map at turn 1). */
  late: Late[];
  losses: Loss[];
}
const blank = (): Tally => ({
  games: 0,
  peaks: [],
  finals: [],
  peakTurns: [],
  founded: 0,
  gainedByCapture: 0,
  handedBack: 0,
  eliminated: 0,
  survFinals: [],
  survPeaks: [],
  elimPeaks: [],
  elimTurns: [],
  neverHeld: 0,
  late: [],
  losses: [],
});
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

describe('cityloss', () => {
  it('asks how each faction loses its cities', () => {
    control();
    // `control()` pins raiders off (the quiet game every sweep measures). Raiders
    // are a game setting, so `PROBE_RAIDERS=1` plays the same seeds with them on
    // and the report name says so.
    const raiders = process.env.PROBE_RAIDERS === '1';
    if (raiders) NEW_GAME.barbarians = true;
    const held = process.env.PROBE_SEEDS === 'held-out';
    const which = held ? 'held-out' : 'tuned';
    const perBase = Number(process.env.PROBE_PER_BASE ?? 6);
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, perBase).seeds;

    const by: Record<string, Tally> = {};
    const of = (f: string): Tally => (by[f] ??= blank());
    const apart = { raiderDeleted: 0, handedBack: 0 };
    let games = 0;

    for (const seed of seeds) {
      games += 1;
      type Snap = { owner: number; size: number; foundedBy: number | undefined };
      let prev = new Map<number, Snap>();
      let prevSeat = new Map<number, number | undefined>();
      const peak: Record<string, { n: number; turn: number }> = {};
      const events: (Omit<Loss, 'end'> & { loser: string })[] = [];
      let lastTurn = 0;
      /** Turn each faction last went from holding a city to holding none. */
      const zeroAt: Record<string, number> = {};
      const heldBefore: Record<string, number> = {};
      const cameAt: Record<string, number> = {};
      let first = true;
      let end: GameState | null = null;

      playGame(seed, undefined, (s: GameState) => {
        end = s;
        for (const p of s.players) {
          if (!p.barbarian && cameAt[p.faction as string] === undefined) cameAt[p.faction as string] = s.turn;
        }
        lastTurn = s.turn;
        const faction = (id: number) => s.players[id]?.faction as string;
        const barb = (id: number) => !!s.players[id]?.barbarian;
        const now = new Map<number, Snap>();
        for (const c of s.cities) {
          now.set(c.id, { owner: c.owner, size: c.size, foundedBy: c.foundedBy });
        }
        if (!first) {
          for (const [id, was] of prev) {
            const is = now.get(id);
            if (is && is.owner === was.owner) continue;
            if (!is) {
              if (barb(was.owner)) {
                apart.raiderDeleted += 1;
              } else {
                const seat = prevSeat.get(was.owner) === id;
                events.push({
                  turn: s.turn,
                  kind: seat ? 'abandoned' : 'razed',
                  taker: '-',
                  size: was.size,
                  own: was.foundedBy === was.owner,
                  loser: faction(was.owner),
                });
              }
              continue;
            }
            // Changed hands.
            if (barb(was.owner)) {
              if (!barb(is.owner)) {
                apart.handedBack += 1;
                of(faction(is.owner)).handedBack += 1;
              }
              continue;
            }
            events.push({
              turn: s.turn,
              kind: 'captured',
              taker: barb(is.owner) ? 'raiders' : faction(is.owner),
              size: was.size,
              own: was.foundedBy === was.owner,
              loser: faction(was.owner),
            });
            if (!barb(is.owner)) of(faction(is.owner)).gainedByCapture += 1;
          }
          for (const [id, is] of now) {
            if (!prev.has(id) && !barb(is.owner) && is.foundedBy === is.owner) {
              of(faction(is.owner)).founded += 1;
            }
          }
        } else {
          for (const [, is] of now) {
            if (!barb(is.owner)) of(faction(is.owner)).founded += 1;
          }
        }
        first = false;
        prev = now;
        prevSeat = new Map(s.players.map((p) => [p.id, p.queenSeat]));
        for (const p of s.players) {
          if (p.barbarian) continue;
          const n = playerCities(s, p.id).length;
          const f = p.faction as string;
          if (!peak[f] || n > peak[f].n) peak[f] = { n, turn: s.turn };
          if (n === 0 && (heldBefore[f] ?? 0) > 0) zeroAt[f] = s.turn;
          heldBefore[f] = n;
        }
      });

      const fin = end as GameState | null;
      if (!fin) continue;
      // Slots, read from the game's own schedule rather than inferred from
      // when a city appeared: a side may arrive and fail to found.
      const slots = latecomers(fin);
      for (const p of fin.players) {
        if (p.barbarian) continue;
        const f = p.faction as string;
        const t = of(f);
        const slot = slots.indexOf(p.faction as never);
        if (slot >= 0) {
          t.late.push({
            due: arrivalTurnFor(fin, slot),
            came: cameAt[f],
            eliminated: playerCities(fin, p.id).length === 0,
            elimTurn: zeroAt[f],
          });
        }
        const n = playerCities(fin, p.id).length;
        t.games += 1;
        t.peaks.push(peak[f]?.n ?? 0);
        t.peakTurns.push(peak[f]?.turn ?? 0);
        t.finals.push(n);
        if (n === 0) {
          t.eliminated += 1;
          t.elimPeaks.push(peak[f]?.n ?? 0);
          if (zeroAt[f] === undefined) t.neverHeld += 1;
          else t.elimTurns.push(zeroAt[f]);
        } else {
          t.survFinals.push(n);
          t.survPeaks.push(peak[f]?.n ?? 0);
        }
      }
      for (const e of events) of(e.loser).losses.push({ ...e, end: lastTurn });
    }

    const sides = ['orc', 'human', 'hivekin', 'wandering', 'unbound'].filter((f) => by[f]);
    const f1 = (n: number) => n.toFixed(1);
    const kinds: Kind[] = ['captured', 'razed', 'abandoned'];
    void kinds;
    const takers = [...new Set(sides.flatMap((f) => by[f].losses.map((l) => l.taker)))]
      .filter((x) => x !== '-')
      .sort();
    const third = (l: Loss) => Math.min(2, Math.floor((3 * l.turn) / Math.max(1, l.end)));

    const report = [
      `# city losses, ${which}${raiders ? ', raiders on' : ''} (${games} games, ${perBase} a base)`,
      '',
      'Every way a player stops owning a city, found by reading `src/sim` for',
      'owner assignments and splices of `state.cities`: a capture, a raze (a capture',
      'that leaves nobody alive), a raider-held town returned or deleted, and a',
      'Hive abandoning its seat. Incitement never transfers a town. Losses were',
      'detected by comparing owner maps between watch-hook calls (one half-turn),',
      'not from the trimmed log and not by a counter in the rules; the one thing',
      'that cannot be seen is a town changing hands twice inside a single half-turn.',
      'Per-game figures are over games the faction was in; "games" is that count.',
      '',
      '## peak and final cities',
      '',
      '`peak` is the most cities held at any hook, averaged over games, with the',
      'largest single game after it. `founded` counts cities the side itself',
      'founded, per game. `eliminated` is games ending on zero cities.',
      '',
      '| side | games | mean peak | best peak | mean final | worst final | peak turn | founded | eliminated |',
      '|---|---|---|---|---|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        return (
          `| ${f} | ${t.games} | **${f1(mean(t.peaks))}** | ${max(t.peaks)} | ` +
          `**${f1(mean(t.finals))}** | ${Math.min(...t.finals)} | ${mean(t.peakTurns).toFixed(0)} | ` +
          `${f1(t.founded / Math.max(1, t.games))} | ${t.eliminated} |`
        );
      }),
      '',
      '## the same, split by whether the side survived',
      '',
      '`final` above is a mean over every game, including those a side ended with',
      'no city, so it mixes how big a side gets with how often it is wiped out.',
      'Here it is split. `n` is the number of games in each cell; several are small.',
      '`elim turn` is the turn a side last went from holding a city to holding none,',
      'over games where it held one at some point; `never had one` counts eliminated',
      'games in which the side held no city at any observation (it never settled,',
      'or arrived and was gone before the first look), which have no such turn.',
      '',
      '| side | survived n | final, survivors (mean / median) | peak, survivors (mean / median) | eliminated n | peak, eliminated (mean / median / max) | elim turn (mean / median / earliest / latest; n) | before turn 100 | never had one |',
      '|---|---|---|---|---|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        const e = t.elimTurns;
        return (
          `| ${f} | ${t.survFinals.length} | ${f1(mean(t.survFinals))} / ${f1(median(t.survFinals))} | ` +
          `${f1(mean(t.survPeaks))} / ${f1(median(t.survPeaks))} | ${e.length} | ` +
          `${f1(mean(t.elimPeaks))} / ${f1(median(t.elimPeaks))} / ${max(t.elimPeaks)} | ` +
          (e.length
            ? `${mean(e).toFixed(0)} / ${median(e).toFixed(0)} / ${Math.min(...e)} / ${max(e)}; n=${e.length}`
            : '--') +
          ` | ${e.filter((x) => x < 100).length} of ${e.length} | ${t.neverHeld} |`
        );
      }),
      '',
      '## arrival slot, and lifespan (section 160 asks whether this is the slot or the faction)',
      '',
      'A side that arrives late has a short life for free, so an elimination turn',
      'means nothing alone. `due` is `arrivalTurnFor` for the faction slot, read',
      'from the schedule the game itself keeps rather than inferred from when a city appeared;',
      '`came` is the first observation at which the side existed on the map. Only',
      'games in which the faction was a latecomer count, so a side that sometimes',
      'starts on the map has fewer games here than above. `lifespan` is',
      'elimination turn minus `due`, over eliminated games in which the side held a',
      'city at some point (n beside it); the figures are mean / median / minimum.',
      'Arrival is split by outcome in the last two columns, mean / median (n).',
      'Every n is small; these are numbers, not tested differences.',
      '',
      '| side | latecomer games | due (mean / median / min / max) | came, minus due (mean / max) | lifespan (mean / median / min; n) | due, survived (mean / median; n) | due, eliminated (mean / median; n) |',
      '|---|---|---|---|---|---|---|',
      ...sides
        .filter((f) => by[f].late.length > 0)
        .map((f) => {
          const L = by[f].late;
          const due = L.map((l) => l.due);
          const lag = L.filter((l) => l.came !== undefined).map((l) => (l.came as number) - l.due);
          const life = L.filter((l) => l.eliminated && l.elimTurn !== undefined).map(
            (l) => (l.elimTurn as number) - l.due,
          );
          const surv = L.filter((l) => !l.eliminated).map((l) => l.due);
          const dead = L.filter((l) => l.eliminated).map((l) => l.due);
          const cell = (xs: number[]) =>
            xs.length ? `${mean(xs).toFixed(0)} / ${median(xs).toFixed(0)} (n=${xs.length})` : `-- (n=0)`;
          return (
            `| ${f} | ${L.length} | ${mean(due).toFixed(0)} / ${median(due).toFixed(0)} / ${Math.min(...due)} / ${max(due)} | ` +
            `${lag.length ? `${f1(mean(lag))} / ${max(lag)}` : '--'} | ` +
            (life.length
              ? `${mean(life).toFixed(0)} / ${median(life).toFixed(0)} / ${Math.min(...life)}; n=${life.length}`
              : '--; n=0') +
            ` | ${cell(surv)} | ${cell(dead)} |`
          );
        }),
      '',
      ...(() => {
        // Generated from the same data, so the file says what the probe saw.
        const u = by.unbound;
        const e = u ? u.elimTurns : [];
        const early = e.filter((x) => x < 100).length;
        const lines = [
          '## reading the survival split',
          '',
          `Unbound: ${u ? u.survFinals.length : 0} games survived, ${e.length} eliminated after holding a city` +
            ` and ${u ? u.neverHeld : 0} eliminated having never held one. ` +
            `${early} of the ${e.length} eliminations came before turn 100` +
            (e.length && early * 2 > e.length
              ? ', which is the opening of the game rather than its late stages. '
              : '. ') +
            'Read that against the arrival table above before calling it about the faction: ' +
            'a late slot makes an early-looking turn a long life.',
          '',
          'Every cell here has n of 18 or fewer, and most of 10 or fewer.',
        ];
        return lines;
      })(),
      '',
      '## how cities leave, per game',
      '',
      '`captured` = taken by another player or by raiders. `razed` = destroyed by',
      'a sacking. `abandoned` = a Hive letting its seat go. `lost` is the three',
      'together; `own` is the share of lost cities the side had founded rather',
      'than captured itself.',
      '',
      '| side | lost | captured | razed | abandoned | own | gained by capture | handed back by raiders |',
      '|---|---|---|---|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        const g = Math.max(1, t.games);
        const n = (k: Kind) => t.losses.filter((l) => l.kind === k).length;
        const own = t.losses.filter((l) => l.own).length;
        return (
          `| ${f} | **${f1(t.losses.length / g)}** | ${f1(n('captured') / g)} | ` +
          `${f1(n('razed') / g)} | ${f1(n('abandoned') / g)} | ` +
          `${t.losses.length ? ((100 * own) / t.losses.length).toFixed(0) : 0}% | ` +
          `${f1(t.gainedByCapture / g)} | ${f1(t.handedBack / g)} |`
        );
      }),
      '',
      `Raider-held towns deleted with no founder to return them to (nobody's loss): ${apart.raiderDeleted}.`,
      `Raider-held towns handed back to a founder: ${apart.handedBack}.`,
      '',
      '## who takes them',
      '',
      'Captures only, per game, by the faction of the taker. A raze has no taker.',
      '',
      `| loser | ${takers.join(' | ')} |`,
      `|${'---|'.repeat(takers.length + 1)}`,
      ...sides.map((f) => {
        const t = by[f];
        const g = Math.max(1, t.games);
        const cells = takers.map((k) => {
          const c = t.losses.filter((l) => l.kind === 'captured' && l.taker === k).length;
          return f1(c / g);
        });
        return `| ${f} | ${cells.join(' | ')} |`;
      }),
      '',
      '## when',
      '',
      'Turn of each loss, and losses by third of the game (thirds of that game’s',
      'last turn, so a short game is divided as a long one is).',
      '',
      '| side | mean turn | median turn | first third | middle third | last third | mean size lost |',
      '|---|---|---|---|---|---|---|',
      ...sides.map((f) => {
        const L = by[f].losses;
        const ts = L.map((l) => l.turn).sort((a, b) => a - b);
        const th = [0, 1, 2].map((i) => L.filter((l) => third(l) === i).length);
        const tot = Math.max(1, L.length);
        return (
          `| ${f} | ${mean(ts).toFixed(0)} | ${ts.length ? ts[Math.floor(ts.length / 2)] : 0} | ` +
          th.map((x) => `${x} (${((100 * x) / tot).toFixed(0)}%)`).join(' | ') +
          ` | ${f1(mean(L.map((l) => l.size)))} |`
        );
      }),
    ].join('\n');

    writeFileSync(`tools/out/cityloss${held ? '-held-out' : ''}${raiders ? '-raiders' : ''}.md`, `${report}\n`, 'utf8');
    console.log('\n' + report + '\n');
  }, 1_800_000);
});
