import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { playerCities, playerUnits } from '../src/sim/gamestate';
import { hostile } from '../src/sim/diplomacy';
import { attackTargets, visibleEnemies } from '../src/sim/movement';
import { AI_TRACE, attackOdds, PERSONALITIES } from '../src/ai/ai';
import { hivekinOf } from '../src/sim/hivekin';
import { unitType } from '../src/model/units';
import { TECHS } from '../src/model/techs';
import { endingFor, endingWorks } from '../src/sim/endings';
import { beakersPerTurn } from '../src/sim/turn';
import { idx } from '../src/engine/grid';
import { distance } from '../src/engine/grid';
import type { GameState, LogEntry } from '../src/model/types';
import { playGame, seedSet, TUNED_BASES } from './sweep';

/**
 * Section 125: what the Hive does with the army it now has.
 *
 * Three things have each closed part of the gap -- a research plan of their
 * own, siting the arrival by what the ground yields, a second founder -- and
 * none of them bought a win. The second Grub measured **0 of 108** while the
 * probe said it holds a fifth of the world, so the remaining deficit is not
 * about arriving. It is about what happens afterwards, and `wins: 0` cannot
 * tell the difference between an army that never swings, one that swings and
 * loses, and one that wins fights and never takes a city.
 *
 * So count the swings. Everything here is attributed as it happens, because a
 * three-hundred-turn game pushes its early fighting out of the 400-entry log
 * window long before the end -- the same reason `playGame` counts combats
 * itself.
 */

interface Tally {
  /** Half-turn observations in which this side was hostile to somebody. */
  war: number;
  attacks: number;
  attacksWon: number;
  defences: number;
  defencesHeld: number;
  /** Units that left the board, however they went. */
  lost: number;
  caps: number;
  capsLost: number;
  cities: number;
  pop: number;
  units: number;
  techs: number;
  /** Beakers a turn at the end, which is what the ending race is run on. */
  beakers: number;
  /** Did it ever research the advance that unlocks its own ending? */
  endingTech: number;
  /** Works towards that ending standing when the game ended, of three. */
  works: number;
  /** And did it finish the last one. */
  finished: number;
}

const blank = (): Tally => ({
  war: 0, attacks: 0, attacksWon: 0, defences: 0, defencesHeld: 0, lost: 0,
  caps: 0, capsLost: 0, cities: 0, pop: 0, units: 0, techs: 0,
  beakers: 0, endingTech: 0, works: 0, finished: 0,
});

function add(into: Tally, from: Tally): void {
  for (const k of Object.keys(into) as Array<keyof Tally>) into[k] += from[k];
}

/**
 * What the Hive knows and where it stands, which is the next question after
 * "it never swings": an army that cannot find anybody is a different fault
 * from one that finds them and declines the fight.
 */
interface Reach {
  /** Observations in which the Hive was on the board at all. */
  looks: number;
  /** Enemy cities inside its own explored map, at the end. */
  knownCities: number;
  /** Enemy units it could see, averaged over its looks. */
  seen: number;
  /** Looks in which some unit of its was next to an enemy unit or city. */
  adjacent: number;
  /** Distance from its nearest unit to the nearest enemy city, averaged. */
  nearest: number;
  /** Share of its units dug in rather than walking. */
  fortified: number;
  /** How far its units stand from their own nearest Hive, averaged. */
  fromHome: number;
  units: number;
  /**
   * Observations taken with the Hive's own turn about to run -- `playGame`
   * watches after `endPlayerTurn`, so the next player has already begun and its
   * units still have their moves. That makes these the AI's actual inputs
   * rather than the leftovers of a turn already spent.
   */
  itsTurn: number;
  /** Of those, the ones where some unit of its had something it could swing at. */
  couldSwing: number;
  /** And where the best odds on offer cleared the bar its personality sets. */
  worthIt: number;
  /** The best odds available, summed over the turns something was adjacent. */
  odds: number;
}

/** One game, watched. Returns a tally per side plus the Hive's final roster. */
function probe(seed: number): {
  sides: Record<string, Tally>;
  roster: Map<string, number>;
  alive: boolean;
  arrived: boolean;
  reach: Reach;
  wonByHive: boolean;
} {
  const sides: Record<string, Tally> = { orc: blank(), human: blank(), hive: blank() };
  const reach: Reach = {
    looks: 0, knownCities: 0, seen: 0, adjacent: 0, nearest: 0, fortified: 0, fromHome: 0,
    units: 0, itsTurn: 0, couldSwing: 0, worthIt: 0, odds: 0,
  };
  const roster = new Map<string, number>();
  // Who owned which unit at the last look. A unit that attacked and died this
  // half-turn is still in here, which is the whole reason it is kept.
  const owners = new Map<number, number>();
  const cityOwners = new Map<number, number>();
  // Anchored by identity, not by index. `log()` keeps only the last 400
  // entries, and once it saturates both the length and a saved index sit still
  // while entries scroll past underneath -- so an index-based reader counts
  // nothing at all from the moment the log fills, which is early. That is the
  // mistake `playGame`'s own comment warns about, made again here: it reported
  // zero attacks for a side that makes ninety-three.
  let anchor: LogEntry | null = null;
  let arrived = false;
  let alive = false;

  const nameFor = (state: GameState, owner: number | null): string | null => {
    if (owner === null || owner === undefined) return null;
    const p = state.players[owner];
    if (!p || p.barbarian) return null;
    return p.faction === 'hivekin' ? 'hive' : p.faction === 'orc' ? 'orc' : 'human';
  };

  const watch = (state: GameState): void => {
    const hive = hivekinOf(state);
    if (hive) arrived = true;

    // --- who is at war with whom
    for (const p of state.players) {
      const side = nameFor(state, p.id);
      if (!side || !p.alive) continue;
      const foes = state.players.filter((q) => q.id !== p.id && q.alive && !q.barbarian);
      if (foes.some((q) => hostile(state, p.id, q.id))) sides[side].war++;
    }

    // --- fights, attributed to the side that swung
    const from = anchor ? state.log.lastIndexOf(anchor) + 1 : 0;
    for (let i = from; i < state.log.length; i++) {
      const e = state.log[i];
      if (e.kind !== 'combat') continue;
      // The attacker's win is addressed to the attacker; the defender's hold is
      // addressed to the defender. `actor` is the swinger either way.
      const swinger = e.actor !== undefined ? nameFor(state, owners.get(e.actor) ?? null) : null;
      const addressed = nameFor(state, e.player);
      if (/\bdefeats\b|finishes off/.test(e.text)) {
        if (addressed) { sides[addressed].attacks++; sides[addressed].attacksWon++; }
      } else if (/holds against/.test(e.text)) {
        if (addressed) { sides[addressed].defences++; sides[addressed].defencesHeld++; }
        if (swinger) sides[swinger].attacks++;
      }
    }
    anchor = state.log[state.log.length - 1] ?? anchor;

    // --- losses, by diffing the roster
    const seen = new Set<number>();
    for (const u of state.units) {
      seen.add(u.id);
      owners.set(u.id, u.owner);
    }
    for (const [id, owner] of owners) {
      if (seen.has(id)) continue;
      const side = nameFor(state, owner);
      if (side) sides[side].lost++;
      owners.delete(id);
    }

    // --- cities changing hands
    for (const c of state.cities) {
      const was = cityOwners.get(c.id);
      if (was !== undefined && was !== c.owner) {
        const took = nameFor(state, c.owner);
        const lost = nameFor(state, was);
        if (took) sides[took].caps++;
        if (lost) sides[lost].capsLost++;
      }
      cityOwners.set(c.id, c.owner);
    }

    // --- what the Hive knows, and how close it ever gets
    if (hive && hive.alive) {
      reach.looks++;
      const mine = playerUnits(state, hive.id);
      const foes = state.units.filter(
        (u) => u.owner !== hive.id && !state.players[u.owner]?.barbarian,
      );
      const foeCities = state.cities.filter((c) => c.owner !== hive.id);
      reach.seen += visibleEnemies(state, hive.id).size;
      reach.units += mine.length;
      reach.fortified += mine.filter((u) => u.order === 'fortified').length;
      const close = mine.some(
        (u) =>
          foes.some((f) => distance(u.x, u.y, f.x, f.y) <= 1) ||
          foeCities.some((c) => distance(u.x, u.y, c.x, c.y) <= 1),
      );
      if (close) reach.adjacent++;
      let best = Infinity;
      for (const u of mine) {
        for (const c of foeCities) best = Math.min(best, distance(u.x, u.y, c.x, c.y));
      }
      if (best < Infinity) reach.nearest += best;
      const home = playerCities(state, hive.id);
      if (home.length && mine.length) {
        let sum = 0;
        for (const u of mine) {
          sum += Math.min(...home.map((c) => distance(u.x, u.y, c.x, c.y)));
        }
        reach.fromHome += sum / mine.length;
      }
      if (state.activePlayer === hive.id) {
        reach.itsTurn++;
        let best = 0;
        for (const u of mine) {
          for (const i of attackTargets(state, u)) {
            const x = i % state.width;
            const y = Math.floor(i / state.width);
            const defender = state.units.find((f) => f.x === x && f.y === y);
            best = Math.max(best, defender ? attackOdds(state, u, defender) : 1);
          }
        }
        if (best > 0) {
          reach.couldSwing++;
          reach.odds += best;
          if (best >= PERSONALITIES.hivekin.caution) reach.worthIt++;
        }
      }
      reach.knownCities = foeCities.filter(
        (c) => hive.explored[idx(c.x, c.y, state.width)],
      ).length;
    }

    // --- the end state, overwritten each look so the last one stands
    for (const p of state.players) {
      const side = nameFor(state, p.id);
      if (!side) continue;
      const mine = playerCities(state, p.id);
      const t = sides[side];
      t.cities = mine.length;
      t.pop = mine.reduce((n, c) => n + c.size, 0);
      t.units = playerUnits(state, p.id).length;
      t.techs = p.techs.length;
      // The race that actually decides these games. Thirty-eight of fifty-four
      // end on somebody completing an ending; seven on points, two on conquest.
      const kind = endingFor(p.faction);
      const unlocks = kind ? TECHS.find((x) => x.flags?.includes('ending') && x.faction === p.faction) : null;
      t.endingTech = unlocks && p.techs.includes(unlocks.id) ? 1 : 0;
      const works = kind ? endingWorks(kind) : [];
      t.works = works.filter((b) => mine.some((c) => c.buildings.includes(b.id))).length;
      t.finished = works.some((b) => b.victory && mine.some((c) => c.buildings.includes(b.id))) ? 1 : 0;
      t.beakers = beakersPerTurn(state, p.id);
      if (side === 'hive') {
        alive = p.alive;
        roster.clear();
        for (const u of playerUnits(state, p.id)) {
          const n = unitType(u.type).name;
          roster.set(n, (roster.get(n) ?? 0) + 1);
        }
      }
    }
  };

  const outcome = playGame(seed, undefined, watch);
  const wonByHive = outcome.winner !== null
    && outcome.winner !== 0 && outcome.winner !== 1;
  return { sides, roster, alive, arrived, reach, wonByHive };
}

describe('what the hive does with its army', () => {
  it('counts the swings, at each bar it might swing at', () => {
    // The sweep's own tuned set, so this explains the games that were measured
    // rather than a different population of games.
    const seeds = seedSet('probe', TUNED_BASES, 4).seeds;
    // The Hive's bar, as shipped, is 0.5 -- twice the Horde's -- and the best
    // odds on offer when something is standing next to it average 0.44. So it
    // declines nearly everything. These are the bars worth asking about: the
    // one it has, the midpoint, and the Horde's.
    // Measured at 0.5, 0.35 and 0.25; 0.35 won every column and has since been
    // swept, so only the shipped bar is run now. Put the three back to re-ask.
    const bars = [0.35];
    const summary: string[] = [
      'bar   attacks  won  caps  lost  cities  pop  units  alive  share',
      '-----------------------------------------------------------------',
    ];
    const was = PERSONALITIES.hivekin.caution;
    let detail = '';
    for (const bar of bars) {
    PERSONALITIES.hivekin.caution = bar;
    AI_TRACE.on = true;
    AI_TRACE.hits = {};
    const total: Record<string, Tally> = { orc: blank(), human: blank(), hive: blank() };
    const roster = new Map<string, number>();
    let alive = 0;
    let arrived = 0;
    const reach: Reach = {
      looks: 0, knownCities: 0, seen: 0, adjacent: 0, nearest: 0, fortified: 0, fromHome: 0,
      units: 0, itsTurn: 0, couldSwing: 0, worthIt: 0, odds: 0,
    };

    for (const seed of seeds) {
      const r = probe(seed);
      for (const side of ['orc', 'human', 'hive'] as const) add(total[side], r.sides[side]);
      if (r.alive) alive++;
      if (r.arrived) arrived++;
      for (const [name, n] of r.roster) roster.set(name, (roster.get(name) ?? 0) + n);
      for (const k of Object.keys(reach) as Array<keyof Reach>) reach[k] += r.reach[k];
    }

    const n = seeds.length;
    const avg = (v: number) => (v / n).toFixed(1);
    const out: string[] = [];
    out.push(`${seeds.length} games on the sweep's tuned bases. Hive arrived in ${arrived}, alive at the end in ${alive}.`);
    out.push('');
    out.push('side   war%  attacks  won   defences  held  lost  caps  lost  cities  pop  units techs');
    out.push('------------------------------------------------------------------------------------');
    for (const side of ['orc', 'human', 'hive'] as const) {
      const t = total[side];
      // War as a share of the looks in which anybody was at war, so the Hive's
      // late arrival does not read as pacifism.
      const warShare = total.orc.war ? (t.war / total.orc.war) * 100 : 0;
      out.push(
        `${side.padEnd(6)} ${warShare.toFixed(0).padStart(4)}  ` +
          `${avg(t.attacks).padStart(7)} ${avg(t.attacksWon).padStart(5)} ` +
          `${avg(t.defences).padStart(9)} ${avg(t.defencesHeld).padStart(5)} ` +
          `${avg(t.lost).padStart(5)} ${avg(t.caps).padStart(5)} ${avg(t.capsLost).padStart(5)} ` +
          `${avg(t.cities).padStart(7)} ${avg(t.pop).padStart(4)} ${avg(t.units).padStart(6)} ${avg(t.techs).padStart(5)}`,
      );
    }
    out.push('');
    out.push('The ending race, which is how these games are actually decided:');
    out.push('side    beakers/turn  advances  got the advance  works standing  finished');
    for (const side of ['orc', 'human', 'hive'] as const) {
      const t = total[side];
      out.push(
        `${side.padEnd(7)} ${avg(t.beakers).padStart(12)} ${avg(t.techs).padStart(9)} ` +
          `${(String(t.endingTech) + '/' + n).padStart(16)} ${avg(t.works).padStart(15)} ` +
          `${(String(t.finished) + '/' + n).padStart(9)}`,
      );
    }
    out.push('');
    out.push('What the Hive is holding at the end, per game:');
    for (const [name, count] of [...roster].sort((a, b) => b[1] - a[1])) {
      out.push(`  ${name.padEnd(22)} ${(count / n).toFixed(1)}`);
    }

    const per = (v: number) => (v / Math.max(1, reach.looks)).toFixed(2);
    out.push('');
    out.push('And what it can reach, per look while it is on the board:');
    out.push(`  enemy cities on its own map   ${(reach.knownCities / n).toFixed(1)}`);
    out.push(`  enemy units it can see        ${per(reach.seen)}`);
    out.push(`  looks with a foe next to it   ${((reach.adjacent / Math.max(1, reach.looks)) * 100).toFixed(0)}%`);
    out.push(`  nearest enemy city, tiles     ${per(reach.nearest)}`);
    out.push(`  its units dug in              ${((reach.fortified / Math.max(1, reach.units)) * 100).toFixed(0)}%`);
    out.push(`  how far they stand from home  ${per(reach.fromHome)}`);
    out.push('');
    out.push(`Its own turns, with its moves still in hand: ${reach.itsTurn}`);
    out.push(`  something it could swing at    ${((reach.couldSwing / Math.max(1, reach.itsTurn)) * 100).toFixed(0)}%`);
    out.push(`  best odds when there was       ${(reach.odds / Math.max(1, reach.couldSwing)).toFixed(2)} (its bar is ${PERSONALITIES.hivekin.caution})`);
    out.push(`  turns the bar was cleared      ${((reach.worthIt / Math.max(1, reach.itsTurn)) * 100).toFixed(0)}%`);

    out.push('');
    out.push('Where its soldiers spent their turns:');
    const wheres = [...new Set(Object.keys(AI_TRACE.hits).map((k) => k.split('|')[0]))].sort();
    const called = (f: string) => AI_TRACE.hits['00 called|' + f] ?? 0;
    out.push(`  ${'branch'.padEnd(24)} ${'orc'.padStart(7)} ${'human'.padStart(7)} ${'hive'.padStart(7)}   (share of its soldier-turns)`);
    for (const where of wheres) {
      const cell = (f: string) => {
        const n = AI_TRACE.hits[where + '|' + f] ?? 0;
        return `${((n / Math.max(1, called(f))) * 100).toFixed(0)}%`.padStart(7);
      };
      out.push(`  ${where.padEnd(24)} ${cell('orc')} ${cell('human')} ${cell('hivekin')}`);
    }
    out.push(`  ${'soldier-turns in all'.padEnd(24)} ${String(called('orc')).padStart(7)} ${String(called('human')).padStart(7)} ${String(called('hivekin')).padStart(7)}`);
    AI_TRACE.on = false;

    const share =
      total.hive.cities / Math.max(1, total.hive.cities + total.orc.cities + total.human.cities);
    summary.push(
      `${bar.toFixed(2)} ${avg(total.hive.attacks).padStart(8)} ${avg(total.hive.attacksWon).padStart(4)} ` +
        `${avg(total.hive.caps).padStart(5)} ${avg(total.hive.capsLost).padStart(5)} ` +
        `${avg(total.hive.cities).padStart(7)} ${avg(total.hive.pop).padStart(4)} ` +
        `${avg(total.hive.units).padStart(6)} ${String(alive + '/' + seeds.length).padStart(6)} ` +
        `${(share * 100).toFixed(0).padStart(4)}%`,
    );
    // The full table is kept for the bar it ships with, since that is the one
    // the last sweep measured; the others only need their headline row.
    if (bar === bars[0]) detail = out.join('\n');
    }
    PERSONALITIES.hivekin.caution = was;

    const text = detail + '\n\nWhat each bar is worth, per game:\n' + summary.join('\n');
    writeFileSync('hiveprobe.txt', text, 'utf8');
    console.log('\n' + text + '\n');
  }, 1_800_000);
});

/**
 * Section 125: can they get into the race that actually decides these games?
 *
 * Ten of twelve are won by an empire finishing an ending. The Hive has built
 * **no works at all, ever** -- 0.0 standing in twelve games -- and reached the
 * advance that unlocks them twice. It makes 9.9 beakers a turn against 19.1 and
 * 32.4, and pays 1,000 shields for three works out of 3.5 Hives where an empire
 * pays the same out of 6.
 *
 * Jeremy's standing answer is that the costs of ending works are balance levers
 * rather than settled numbers, and `techs.ts` already names this road as "the
 * first dial to turn if this lands too often or never". It lands never. So the
 * question is what price puts them in the race, and whether being in it is
 * enough when they join it a hundred turns late.
 */
describe('the road to their ending', () => {
  it('asks what would put them in the race at all', () => {
    const seeds = seedSet('probe', TUNED_BASES, 4).seeds;
    const works = endingWorks('hive');
    const road = TECHS.find((t) => t.id === 'all-is-the-hive')!;
    const plan = PERSONALITIES.hivekin;
    const shipped = {
      works: works.map((b) => b.cost),
      cost: road.cost,
      prereqs: [...road.prereqs],
      order: [...plan.techPriority],
    };

    /**
     * The price of the works was never the gate -- probed at forty per cent of
     * it, they still built 0.2 and reached the advance twice in twelve. The
     * gate is the **road**: 860 beakers over eleven advances at 9.9 beakers a
     * turn is eighty-seven turns of pure research, against the Horde's
     * twenty-three and the Kingdom's thirty, and the Hive only exists for about
     * a hundred and forty.
     *
     * Of that 860, 400 is the shared happiness-and-insanity branch and 460 is
     * theirs. Only theirs is touched here: dropping `insanity` as a prerequisite
     * removes a dependency rather than cheapening a shared advance, so the two
     * empires' own roads are untouched and the comparison stays honest.
     */
    const arms: Array<[string, () => void]> = [
      ['as shipped (road 860, 22nd of 25)', () => {}],
      [
        'road 710: insanity dropped',
        () => {
          road.prereqs = ['caste-princess'];
        },
      ],
      [
        'road 610, and asked for 13th',
        () => {
          road.prereqs = ['caste-princess'];
          road.cost = 100;
          plan.techPriority = shipped.order.filter((t) => t !== 'all-is-the-hive');
          plan.techPriority.splice(12, 0, 'all-is-the-hive');
        },
      ],
      [
        'that, and works at 60%',
        () => {
          road.prereqs = ['caste-princess'];
          road.cost = 100;
          plan.techPriority = shipped.order.filter((t) => t !== 'all-is-the-hive');
          plan.techPriority.splice(12, 0, 'all-is-the-hive');
          works.forEach((b, i) => (b.cost = [180, 180, 240][i]));
        },
      ],
      /**
       * The only shape the arithmetic actually permits.
       *
       * Their advances per game are **11.8 in every arm above** -- repricing the
       * road does not buy them any more research, it only changes what they
       * spend it on, and an eleven-advance road is their whole game. So the
       * road has to fit inside four or five of those twelve, leaving the rest
       * for castes. Off `caste-soldier` at 100 it is 165 beakers over four
       * advances, all of which they were going to research anyway.
       *
       * This is a change to the tree's shape rather than a price, and the bible
       * put the ending behind the Princess. Measured here so the question comes
       * with its answer attached, not applied.
       */
      [
        'road 165: off caste-soldier, 5th',
        () => {
          road.prereqs = ['caste-soldier'];
          road.cost = 100;
          plan.techPriority = shipped.order.filter((t) => t !== 'all-is-the-hive');
          plan.techPriority.splice(4, 0, 'all-is-the-hive');
        },
      ],
      [
        'that, and works at 60%',
        () => {
          road.prereqs = ['caste-soldier'];
          road.cost = 100;
          plan.techPriority = shipped.order.filter((t) => t !== 'all-is-the-hive');
          plan.techPriority.splice(4, 0, 'all-is-the-hive');
          works.forEach((b, i) => (b.cost = [180, 180, 240][i]));
        },
      ],
    ];

    const out: string[] = [
      'hive ending                          advance  works  finished  wins  advances  cities  pop  units',
      '-------------------------------------------------------------------------------------------------',
    ];
    for (const [label, apply] of arms) {
      works.forEach((b, i) => (b.cost = shipped.works[i]));
      road.cost = shipped.cost;
      road.prereqs = [...shipped.prereqs];
      plan.techPriority = [...shipped.order];
      apply();
      let advance = 0, standing = 0, finished = 0, wins = 0, techs = 0, cities = 0, pop = 0, units = 0;
      for (const seed of seeds) {
        const r = probe(seed);
        advance += r.sides.hive.endingTech;
        standing += r.sides.hive.works;
        finished += r.sides.hive.finished;
        wins += r.wonByHive ? 1 : 0;
        techs += r.sides.hive.techs;
        cities += r.sides.hive.cities;
        pop += r.sides.hive.pop;
        units += r.sides.hive.units;
      }
      const n = seeds.length;
      out.push(
        `${label.padEnd(36)} ${(advance + '/' + n).padStart(7)} ${(standing / n).toFixed(1).padStart(6)} ` +
          `${(finished + '/' + n).padStart(9)} ${(wins + '/' + n).padStart(5)} ` +
          `${(techs / n).toFixed(1).padStart(9)} ${(cities / n).toFixed(1).padStart(7)} ` +
          `${(pop / n).toFixed(1).padStart(4)} ${(units / n).toFixed(1).padStart(6)}`,
      );
    }
    works.forEach((b, i) => (b.cost = shipped.works[i]));
    road.cost = shipped.cost;
    road.prereqs = [...shipped.prereqs];
    plan.techPriority = [...shipped.order];

    const text = out.join('\n');
    writeFileSync('hiveprice.txt', text, 'utf8');
    console.log('\n' + text + '\n');
  }, 1_800_000);
});
