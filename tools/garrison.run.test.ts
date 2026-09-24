import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { GameState } from '../src/model/types';
import { unitType } from '../src/model/units';
import { playerCities, playerUnits } from '../src/sim/gamestate';
import { garrisonSize } from '../src/sim/city';
import { distance } from '../src/engine/grid';
import { RAIDER_TIERS } from '../src/sim/wilds';
import { HELD_OUT_BASES, NEW_GAME, TUNED_BASES, playGame, seedSet } from './sweep';

/**
 * Where each side's army actually stands, and what it costs them.
 *
 * Section 115 switched the chieftain's summons off with the reason written
 * down: extra raiders land hardest on whoever keeps the thinner garrisons, and
 * that is believed to be the Horde. Believed, not measured -- the sweep counts
 * sacks but never asked where the soldiers were when they happened.
 *
 * **With raiders on**, which is the only world where a garrison earns its keep,
 * this counts per side and per turn: towns standing with nobody on the tile,
 * soldiers at home against soldiers in the field, and the sacks that follow.
 */

declare const process: { env: Record<string, string | undefined> };

const OUT = 'sweep-results';
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 3);
const CHECK = [50, 100, 150, 200];

/** What a side lost, and to whom, counted as units vanish from the board. */
interface Losses {
  /** Settlers and peons killed with a raider standing beside them. */
  settlersToRaiders: number;
  /** Anything else of ours killed with a raider beside it. */
  soldiersToRaiders: number;
  /** Killed with the other empire beside it instead. */
  toTheEnemy: number;
  /** Cities founded over the whole game, which is what a dead settler costs. */
  founded: number;
}

interface Snap {
  cities: number;
  /** Cities with nobody standing on the tile. */
  open: number;
  /** Soldiers on or beside one of our own towns. */
  home: number;
  /** Soldiers anywhere else. */
  afield: number;
  samples: number;
}

const blank = (): Snap => ({ cities: 0, open: 0, home: 0, afield: 0, samples: 0 });

function sample(state: GameState, p: number, into: Snap): void {
  const cities = playerCities(state, p);
  into.cities += cities.length;
  into.open += cities.filter((c) => garrisonSize(state, c) === 0).length;
  for (const u of playerUnits(state, p)) {
    const t = unitType(u.type);
    if (t.settler || t.sails) continue;
    const near = cities.some((c) => distance(u.x, u.y, c.x, c.y) <= 1);
    if (near) into.home += 1;
    else into.afield += 1;
  }
  into.samples += 1;
}

/**
 * Who killed it, worked out from where it was standing when it went.
 *
 * There is no "unit died" event to read -- combat logs are written from the
 * attacker's side and trimmed to the last four hundred entries -- so this
 * watches the board instead: a unit that was there last half-turn and is not
 * there now, with a raider beside where it stood, was killed by raiders. A
 * settler standing where a city now is founded it rather than died.
 */
function track(
  state: GameState,
  prev: Map<number, { owner: number; x: number; y: number; settler: boolean }>,
  raiders: Array<[number, number]>,
  foes: Map<number, Array<[number, number]>>,
  into: [Losses, Losses],
): void {
  const now = new Set(state.units.map((u) => u.id));
  for (const [id, was] of prev) {
    if (now.has(id)) continue;
    if (was.owner !== 0 && was.owner !== 1) continue;
    const beside = (at: Array<[number, number]>) =>
      at.some(([x, y]) => distance(x, y, was.x, was.y) <= 1);
    // A settler on the tile of a city that now exists spent itself founding it.
    if (was.settler && state.cities.some((c) => c.x === was.x && c.y === was.y)) {
      into[was.owner].founded += 1;
      continue;
    }
    if (beside(raiders)) {
      if (was.settler) into[was.owner].settlersToRaiders += 1;
      else into[was.owner].soldiersToRaiders += 1;
    } else if (beside(foes.get(1 - was.owner) ?? [])) {
      into[was.owner].toTheEnemy += 1;
    }
  }
}

function measure(seeds: number[]) {
  const at = new Map<number, [Snap, Snap]>();
  for (const t of CHECK) at.set(t, [blank(), blank()]);
  const sacks: [number, number] = [0, 0];
  const lost: [Losses, Losses] = [
    { settlersToRaiders: 0, soldiersToRaiders: 0, toTheEnemy: 0, founded: 0 },
    { settlersToRaiders: 0, soldiersToRaiders: 0, toTheEnemy: 0, founded: 0 },
  ];
  let wins: [number, number] = [0, 0];

  for (const seed of seeds) {
    const done = new Set<number>();
    let prev = new Map<number, { owner: number; x: number; y: number; settler: boolean }>();
    let raiders: Array<[number, number]> = [];
    let foes = new Map<number, Array<[number, number]>>();
    const outcome = playGame(seed, undefined, (state) => {
      track(state, prev, raiders, foes, lost);
      prev = new Map(
        state.units.map((u) => [
          u.id,
          { owner: u.owner, x: u.x, y: u.y, settler: unitType(u.type).settler },
        ]),
      );
      raiders = state.units
        .filter((u) => state.players[u.owner]?.barbarian)
        .map((u) => [u.x, u.y] as [number, number]);
      foes = new Map(
        [0, 1].map((p) => [
          p,
          state.units.filter((u) => u.owner === p).map((u) => [u.x, u.y] as [number, number]),
        ]),
      );
      for (const t of CHECK) {
        if (state.turn >= t && !done.has(t)) {
          done.add(t);
          const pair = at.get(t)!;
          sample(state, 0, pair[0]);
          sample(state, 1, pair[1]);
        }
      }
    });
    sacks[0] += outcome.sacks[0];
    sacks[1] += outcome.sacks[1];
    if (outcome.winner === 0) wins = [wins[0] + 1, wins[1]];
    else if (outcome.winner === 1) wins = [wins[0], wins[1] + 1];
  }
  return { at, sacks, lost, wins, games: seeds.length };
}

function row(name: string, a: string, b: string): string {
  return `  ${name.padEnd(26)}${a.padStart(11)}${b.padStart(11)}`;
}

function report(label: string, m: ReturnType<typeof measure>): string {
  const avg = (s: Snap, pick: (s: Snap) => number) =>
    s.samples ? (pick(s) / s.samples).toFixed(2) : '-';
  const pct = (s: Snap) => (s.cities ? `${Math.round((s.open / s.cities) * 100)}%` : '-');
  const out: string[] = [`${label} (${m.games} games)`, row('', 'Horde', 'Kingdom')];
  for (const t of CHECK) {
    const [o, h] = m.at.get(t)!;
    out.push(`  --- turn ${t} ---`);
    out.push(row('towns', avg(o, (s) => s.cities), avg(h, (s) => s.cities)));
    out.push(row('towns standing open', pct(o), pct(h)));
    out.push(row('soldiers at home', avg(o, (s) => s.home), avg(h, (s) => s.home)));
    out.push(row('soldiers afield', avg(o, (s) => s.afield), avg(h, (s) => s.afield)));
  }
  out.push('  --- over the whole game ---');
  out.push(
    row(
      'sacks a game',
      (m.sacks[0] / m.games).toFixed(2),
      (m.sacks[1] / m.games).toFixed(2),
    ),
  );
  const per = (pick: (l: Losses) => number): [string, string] => [
    (pick(m.lost[0]) / m.games).toFixed(2),
    (pick(m.lost[1]) / m.games).toFixed(2),
  ];
  out.push(row('towns founded', ...per((l) => l.founded)));
  out.push(row('settlers to raiders', ...per((l) => l.settlersToRaiders)));
  out.push(row('soldiers to raiders', ...per((l) => l.soldiersToRaiders)));
  out.push(row('units to the enemy', ...per((l) => l.toTheEnemy)));
  out.push(row('wins', String(m.wins[0]), String(m.wins[1])));
  return out.join('\n');
}

describe('garrisons', () => {
  it(
    'asks where each side keeps its army, and who gets sacked for it',
    () => {
      NEW_GAME.barbarians = true;
      const sets = [
        seedSet('tuned', TUNED_BASES, PER_BASE),
        seedSet('held-out', HELD_OUT_BASES, PER_BASE),
      ];
      // The two worlds the question is about: the wilds as they ship, and the
      // wilds with the chieftain calling people up.
      const arms: Array<[string, boolean]> = [
        ['summons off', false],
        ['summons on', true],
      ];
      const games = sets.reduce((n, s) => n + s.seeds.length, 0) * arms.length;
      console.log(`Instrumenting ${games} games, about ${Math.round((games * 15) / 60)} minutes.`);

      const out: string[] = [];
      for (const [name, summons] of arms) {
        RAIDER_TIERS.leader.summons = summons;
        for (const set of sets) {
          const t = Date.now();
          out.push(report(`${name} / ${set.name}`, measure(set.seeds)));
          console.log(
            `${name} / ${set.name}: ${set.seeds.length} games in ${((Date.now() - t) / 60000).toFixed(1)} min`,
          );
        }
      }
      RAIDER_TIERS.leader.summons = false;
      const text = out.join('\n\n');
      console.log('\n' + text + '\n');

      if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
      const file = join(OUT, `garrison-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      writeFileSync(file, text + '\n', 'utf8');
      console.log(`Written to ${file}`);
    },
    Math.max(600_000, PER_BASE * 3 * 2 * 30_000),
  );
});
