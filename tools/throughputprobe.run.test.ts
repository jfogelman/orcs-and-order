import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HELD_OUT_BASES, playGame, seedSet, TUNED_BASES } from './sweep';
import { control } from './control';
import { PRODUCTION_TRACE } from '../src/ai/ai';
import {
  cityIncome,
  cityScienceBonus,
  cityYield,
  contentLimit,
  productionCostIn,
} from '../src/sim/city';
import { BUILD_ORDER, researchableTechs, TRADE_STEPS } from '../src/sim/research';
import { buildOptions } from '../src/sim/city';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS } from '../src/model/techs';
import { playerCities } from '../src/sim/gamestate';
import type { GameState } from '../src/model/types';

declare const process: { env: Record<string, string | undefined> };

/**
 * Section 173: where does a faction's research actually go?
 *
 * Section 172 ruled out the road, for the Hive and by the same mechanism for
 * the Wandering Folk at 2.8% and the Unbound at 9.3%. What has never been
 * measured for either is **throughput**, which section 125 named for the Hive
 * and nobody carried forward: *"9.9 beakers a turn against 19.1 and 32.4"*.
 *
 * ## What this decomposes
 *
 * `manageRates` is **faction-neutral**: two parts study to one coin, out of
 * whatever `TRADE_STEPS` is left after `calm`.
 *
 * ```ts
 * const calm = Math.min(TRADE_STEPS - 2, wanted);
 * const rest = TRADE_STEPS - calm;
 * const coin = Math.max(1, Math.round(rest / 3));
 * player.rates = { coin, beakers: rest - coin, calm };
 * ```
 *
 * So there are only four ways a side can end up short of advances, and this
 * separates them rather than guessing between them:
 *
 * 1. **Fewer cities.** Nothing to tax.
 * 2. **Less trade per city.** Small or badly placed towns.
 * 3. **`calm` eating the split.** `wanted` climbs with every city rioting or
 *    sitting at its content limit, and it is capped only at `TRADE_STEPS - 2`
 *    -- so a side whose towns are all at the limit can be left with **two
 *    steps** to divide between coin and study, whatever its trade.
 * 4. **A thinner science bonus**, from buildings it never built.
 *
 * Hypothesis worth naming before the run, so it cannot be fitted afterwards:
 * **(3)**. Section 85 found exactly this for the Horde -- *"Horde cities are
 * not small. They are on fire"* -- and a latecomer arriving into a crowded map
 * has every reason to be at its content limit. If `calm` is the answer the fix
 * is content, not research; if it is (2), the fix is where they settle; if it
 * is (1), section 160 already half-fixed it and the rest is expansion.
 *
 * ## Why an observer and not a counter
 *
 * `cityYield`, `cityIncome` and `contentLimit` are all pure reads, so sampling
 * them from `playGame`'s watch hook moves no RNG and changes no game. Sampled
 * per half-turn and divided by the samples, so a side that dies early is not
 * credited with the turns it did not live -- the mistake that would make a
 * dead faction look efficient.
 *
 * Run with:
 *   npx vitest run --config vitest.sweep.config.ts tools/throughputprobe.run.test.ts
 * and `PROBE_SEEDS=held-out` for the other set. `npm run throughput`.
 */

interface Tally {
  /**
   * Observations, **not turns.** `playGame`'s watch hook fires about four
   * times per game turn, so this is roughly 4x the life of the side. It is the
   * right divisor for a rate -- each observation reads a per-turn income, so
   * the mean of them is a per-turn figure, which is why the Hive comes out at
   * the 9.9 section 125 measured -- and the wrong one for a total. Use
   * `turnsAlive` for anything cumulative.
   */
  samples: number;
  /** Distinct game turns on which this side held at least one city. */
  turnsAlive: number;
  beakers: number;
  trade: number;
  cities: number;
  pop: number;
  /** The three headings, summed over player-turns, out of TRADE_STEPS each. */
  rateCoin: number;
  rateBeakers: number;
  rateCalm: number;
  /** City-turns rioting, and city-turns at or over the content limit. */
  rioting: number;
  atLimit: number;
  cityTurns: number;
  /** Science bonus, summed over city-turns. */
  sciBonus: number;
  /**
   * Beakers still in the bank at the end, and observations spent with nothing
   * researchable at all. A side earning beakers it cannot turn into advances
   * is a different fault from a side earning too few, and the smoke run
   * suggested one of them: the Unbound took 2441 beakers for 11.7 advances
   * where the Hive took 2169 for 20.3.
   */
  banked: number[];
  idle: number;
  /**
   * The science buildings, which both sets say the three newest factions never
   * have: 0.0% bonus for hivekin and unbound and 0.0/0.1% for wandering,
   * against 3.3/6.9% and 6.7/3.9% for the Kingdom and the Horde.
   *
   * Every faction has two, at the same 130 and 60 shields for the same 0.5,
   * and **the cheap one comes off the same shared advance for all five** --
   * `hammers-of-glory`, depth 3, road 155. So neither the price nor the road
   * can explain it, and the failure is at one of exactly two steps. These two
   * counters say which, instead of leaving it to be reasoned about:
   *
   * - never learns the advance -> a research-priority problem;
   * - learns it and never builds -> `chooseProduction`, which is section 125's
   *   pattern and has now cost four sections.
   */
  knewAdvance: number;
  builtScience: number;
  heldScienceAtEnd: number;
  /**
   * Section 175, split cheap against dear. Each is: knew the unlocking
   * advance, had the building offered in a city's yard, and raised one.
   * `offered` is the column section 174 could not see -- it is the difference
   * between "never learned it" and "learned it and it still never appeared".
   */
  cheapKnew: number;
  cheapOffered: number;
  cheapBuilt: number;
  dearKnew: number;
  dearOffered: number;
  dearBuilt: number;
  /**
   * Games where both advances were learned, and of those, how often the
   * **cheap** one was learned first.
   *
   * `unlockedBuildings` walks `player.techs` in the order they were learned and
   * fills a Set in that order, so `options.buildings` is ordered by *when the
   * advance arrived*, not by cost -- and step 4's `find` stops at the first
   * match. A faction that learns its 130-shield economy advance first is
   * locked onto that building forever, even after the 60-shield one reaches
   * the yard. This is the counter for that.
   */
  bothKnown: number;
  cheapFirst: number;
  /**
   * City-turns with a science building selected, and the most shields any of
   * their cities ever banked. Section 174: step 4 picks their science building
   * 100% of the time and they finish it in 1 game of 36, so the question is
   * whether it is ever selected for long enough to pay for itself.
   */
  sciSelected: number;
  peakShields: number;
  /**
   * The most shields ever seen in a city **while that city had a science
   * building selected**, and the cost it was working toward.
   *
   * `peakShields` across all cities was the wrong comparison and briefly
   * looked like a refutation: the richest city peaking at 180 says nothing
   * when it is building something else. This is the number the question was
   * always about.
   */
  peakShieldsWhileSci: number;
  sciCost: number;
  /** End-of-game figures, one per game. */
  techs: number[];
  wins: number;
  games: number;
}

function blank(): Tally {
  return {
    samples: 0,
    turnsAlive: 0,
    beakers: 0,
    trade: 0,
    cities: 0,
    pop: 0,
    rateCoin: 0,
    rateBeakers: 0,
    rateCalm: 0,
    rioting: 0,
    atLimit: 0,
    cityTurns: 0,
    sciBonus: 0,
    banked: [],
    idle: 0,
    knewAdvance: 0,
    builtScience: 0,
    heldScienceAtEnd: 0,
    cheapKnew: 0,
    cheapOffered: 0,
    cheapBuilt: 0,
    dearKnew: 0,
    dearOffered: 0,
    dearBuilt: 0,
    bothKnown: 0,
    cheapFirst: 0,
    sciSelected: 0,
    peakShields: 0,
    peakShieldsWhileSci: 0,
    sciCost: 0,
    techs: [],
    wins: 0,
    games: 0,
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** This faction's science buildings, read off the data rather than listed. */
function sciIds(faction: string): Set<string> {
  return new Set(sciBuildings(faction).map((b) => b.id));
}

/** Both of them, cheapest first. Every faction has exactly two. */
function sciBuildings(faction: string) {
  return Object.values(BUILDINGS)
    .filter((b) => (b.faction === faction || b.faction === 'both') && !!b.scienceBonus)
    .sort((a, b) => a.cost - b.cost);
}

/**
 * Section 175: the advance that opens one, if any one advance does.
 *
 * Section 174 left exactly one step inferred rather than measured. It found the
 * Unbound and the Wandering Folk picking their **130-shield** science building
 * 100% of the time and never finishing it, and reasoned that the 60-shield one
 * must therefore not be in their options -- which, for a plain building with no
 * ending or folly handling to divert it, can only mean the advance is unlearned.
 *
 * All five factions' cheap one comes off `hammers-of-glory`, a shared advance at
 * depth 3 and road 155, which the two empires learn in 18 games of 18. If the
 * latecomers do not, the fix is research priority. If they do, then something
 * else keeps a learned building out of the yard and section 174's reasoning was
 * wrong.
 */
function unlockOf(buildingId: string): string | null {
  return TECHS.find((t) => t.buildings.includes(buildingId))?.id ?? null;
}

describe('throughput', () => {
  it('asks where each faction’s research goes', () => {
    control();
    // Section 174. After `control()`, which pins it off and empties it.
    PRODUCTION_TRACE.on = true;
    // Section 176. Cheapest-first shipped, so the default run is the shipped
    // game and `PROBE_FIRST_MATCH=1` replays the fault for comparison. The
    // report name says which, because two runs of this probe over the same
    // seeds differ only in these counters and are otherwise indistinguishable.
    if (process.env.PROBE_FIRST_MATCH === '1') BUILD_ORDER.cheapest = false;
    const held = process.env.PROBE_SEEDS === 'held-out';
    const arm = BUILD_ORDER.cheapest ? '' : '-firstmatch';
    // `which` is the seed salt as well as the label, so the arm must not touch
    // it: both arms have to play the same games to be comparable at all.
    const which = held ? 'held-out' : 'tuned';
    const title = `${which}${BUILD_ORDER.cheapest ? '' : ', first match (section 175)'}`;
    const perBase = Number(process.env.PROBE_PER_BASE ?? 6);
    const seeds = seedSet(which, held ? HELD_OUT_BASES : TUNED_BASES, perBase).seeds;

    const by: Record<string, Tally> = {};
    const of = (f: string): Tally => (by[f] ??= blank());
    let games = 0;

    for (const seed of seeds) {
      games += 1;
      let last: GameState | null = null;
      const seen = new Set<string>();
      /** Factions that held a science building at any point this game. */
      const everBuilt = new Set<string>();
      /** Section 175, per game: `<faction>|cheap|offered` and friends. */
      const sawIt = new Set<string>();
      // Distinct game turns each side held a city, because the hook fires
      // several times a turn and a total built from observations is that many
      // times too big.
      const liveTurns = new Map<string, Set<number>>();

      playGame(seed, undefined, (s: GameState) => {
        last = s;
        for (const p of s.players) {
          if (p.barbarian) continue;
          const f = p.faction as string;
          seen.add(f);
          const cities = playerCities(s, p.id);
          // Alive-with-a-city only. A side with nothing to tax has no
          // throughput to explain, and averaging its zeroes into the rate
          // columns would make every other number mean something else.
          if (cities.length === 0) continue;
          const t = of(f);
          t.samples += 1;
          if (!liveTurns.has(f)) liveTurns.set(f, new Set());
          liveTurns.get(f)!.add(s.turn);
          // Nothing left to learn, so every beaker from here is banked and
          // wasted. A pure read, like everything else sampled in here.
          if (researchableTechs(p).length === 0) t.idle += 1;

          // Section 175. Cheap and dear, separately, at the three steps that
          // can fail: the advance, the yard, the building. `buildOptions` is
          // the authority on what a city is actually offered -- asking the
          // tech list would re-derive the same guess section 174 made.
          const pair = sciBuildings(f);
          for (let i = 0; i < pair.length; i += 1) {
            const which = i === 0 ? 'cheap' : 'dear';
            const def = pair[i];
            const unlock = unlockOf(def.id);
            if (unlock && p.techs.includes(unlock)) sawIt.add(`${f}|${which}|knew`);
            if (cities.some((c) => c.buildings.includes(def.id))) {
              sawIt.add(`${f}|${which}|built`);
            }
            // Last and guarded: `buildOptions` does real work, and this would
            // otherwise run per city, per faction, four times a turn. Once the
            // answer is yes for this game it cannot become no.
            const key = `${f}|${which}|offered`;
            if (
              !sawIt.has(key) &&
              cities.some((c) => buildOptions(s, c).buildings.some((b) => b.id === def.id))
            ) {
              sawIt.add(key);
            }
          }
          // **Ever built, watched as it happens.** The first version of this
          // asked the end state, which only sees cities the side still holds
          // -- and the two factions it was asked about are the two that lose
          // theirs, 120 to 157 turns alive against 233 to 260. A library built
          // and then captured read as never built.
          if (!everBuilt.has(f) && cities.some((c) => c.buildings.some((b) => sciIds(f).has(b)))) {
            everBuilt.add(f);
          }
          t.cities += cities.length;
          t.rateCoin += p.rates?.coin ?? 0;
          t.rateBeakers += p.rates?.beakers ?? 0;
          t.rateCalm += p.rates?.calm ?? 0;
          for (const c of cities) {
            t.cityTurns += 1;
            t.pop += c.size;
            t.trade += cityYield(s, c).trade;
            t.beakers += cityIncome(s, c, p).beakers;
            t.sciBonus += cityScienceBonus(s, c);
            if (c.producing.kind === 'building' && sciIds(f).has(c.producing.id)) {
              t.sciSelected += 1;
              if (c.shields > t.peakShieldsWhileSci) t.peakShieldsWhileSci = c.shields;
              t.sciCost = productionCostIn(s, c, c.producing);
            }
            if (c.shields > t.peakShields) t.peakShields = c.shields;
            if (c.disorder) t.rioting += 1;
            else if (c.size >= contentLimit(s, c)) t.atLimit += 1;
          }
        }
      });

      for (const [f, turns] of liveTurns) of(f).turnsAlive += turns.size;

      const end = last as GameState | null;
      if (!end) continue;
      for (const p of end.players) {
        if (p.barbarian) continue;
        const t = of(p.faction as string);
        t.games += 1;
        t.techs.push(p.techs.length);
        t.banked.push(p.beakers);
        // Read off the data rather than hard-coded: whichever buildings carry
        // a science bonus for this faction, and whichever advances unlock
        // them. A building renamed or re-rooted keeps this honest.
        const ids = sciIds(p.faction as string);
        const unlocks = TECHS.filter((x) => x.buildings.some((b) => ids.has(b)));
        if (unlocks.some((x) => p.techs.includes(x.id))) t.knewAdvance += 1;
        // Watched during play, not read off the end state -- see the note at
        // the sampling site.
        if (everBuilt.has(p.faction as string)) t.builtScience += 1;
        // Section 175's nine counters, folded in once per game.
        const fx = p.faction as string;
        if (sawIt.has(`${fx}|cheap|knew`)) t.cheapKnew += 1;
        if (sawIt.has(`${fx}|cheap|offered`)) t.cheapOffered += 1;
        if (sawIt.has(`${fx}|cheap|built`)) t.cheapBuilt += 1;
        if (sawIt.has(`${fx}|dear|knew`)) t.dearKnew += 1;
        if (sawIt.has(`${fx}|dear|offered`)) t.dearOffered += 1;
        if (sawIt.has(`${fx}|dear|built`)) t.dearBuilt += 1;
        // Learned-order, off the end state: `p.techs` is the order they came.
        const two = sciBuildings(fx);
        if (two.length === 2) {
          const ci = p.techs.indexOf(unlockOf(two[0].id) as never);
          const di = p.techs.indexOf(unlockOf(two[1].id) as never);
          if (ci >= 0 && di >= 0) {
            t.bothKnown += 1;
            if (ci < di) t.cheapFirst += 1;
          }
        }
        if (playerCities(end, p.id).some((c) => c.buildings.some((b) => ids.has(b)))) {
          t.heldScienceAtEnd += 1;
        }
        if (end.winner === p.id) t.wins += 1;
      }
    }

    const sides = Object.keys(by).sort();
    const per = (f: string, n: number) => (by[f].samples ? n / by[f].samples : 0);
    const perCity = (f: string, n: number) => (by[f].cityTurns ? n / by[f].cityTurns : 0);

    const report = [
      `# throughput, ${title} (${games} games, ${perBase} a base)`,
      '',
      `Sampled per half-turn, over player-turns in which the side held at least`,
      `one city. Rates are out of ${TRADE_STEPS} steps.`,
      '',
      '## the number section 125 named, and never followed up',
      '',
      '`turns with a city` is why the rate and the advance count cannot be read',
      'against each other without it: a side that arrives on turn 60 earns a',
      'high rate over a short life. `beakers all told` is the two multiplied,',
      'and it is the column that should track advances.',
      '',
      '`banked at the end` and `nothing to learn` separate earning too few',
      'beakers from earning beakers that cannot become advances.',
      '',
      '| side | beakers a turn | turns with a city | beakers all told | advances | banked | nothing to learn | wins | cities | trade a turn |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        const alive = t.games ? t.turnsAlive / t.games : 0;
        const idle = t.samples ? (100 * t.idle) / t.samples : 0;
        return (
          `| ${f} | **${per(f, t.beakers).toFixed(1)}** | ` +
          `${alive.toFixed(0)} | **${(per(f, t.beakers) * alive).toFixed(0)}** | ` +
          `**${mean(t.techs).toFixed(1)}** | ${mean(t.banked).toFixed(0)} | ` +
          `${idle.toFixed(0)}% | ${t.wins}/${t.games} | ` +
          `${per(f, t.cities).toFixed(2)} | ${per(f, t.trade).toFixed(1)} |`
        );
      }),
      '',
      '## where the trade split goes',
      '',
      '| side | coin | study | **calm** | city-turns rioting | at the limit |',
      '|---|---|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        const riot = t.cityTurns ? (100 * t.rioting) / t.cityTurns : 0;
        const lim = t.cityTurns ? (100 * t.atLimit) / t.cityTurns : 0;
        return (
          `| ${f} | ${per(f, t.rateCoin).toFixed(1)} | ` +
          `${per(f, t.rateBeakers).toFixed(1)} | ` +
          `**${per(f, t.rateCalm).toFixed(1)}** | ` +
          `${riot.toFixed(1)}% | ${lim.toFixed(1)}% |`
        );
      }),
      '',
      '## and per city, which separates small towns from many towns',
      '',
      '| side | pop a city | trade a city | science bonus |',
      '|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        return (
          `| ${f} | ${perCity(f, t.pop).toFixed(2)} | ` +
          `${perCity(f, t.trade).toFixed(2)} | ` +
          `${(100 * perCity(f, t.sciBonus)).toFixed(1)}% |`
        );
      }),
      '',
      '## the science buildings: learned against built',
      '',
      'Every faction has two, at the same prices for the same bonus, and the',
      'cheap one comes off the same shared advance for all five. So a side that',
      'learns the advance and never builds is `chooseProduction`, and a side',
      'that never learns it is research priority.',
      '',
      '| side | ever built one | city-turns building one | peak shields in THAT city | what it costs there | peak anywhere |',
      '|---|---|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        return (
          `| ${f} | **${t.builtScience}/${t.games}** | ` +
          `${t.cityTurns ? ((100 * t.sciSelected) / t.cityTurns).toFixed(1) : 0}% | ` +
          `**${t.peakShieldsWhileSci}** | **${t.sciCost}** | ${t.peakShields} |`
        );
      }),
      '',
      '## the cheap one against the dear one (section 175)',
      '',
      'Each faction has two science buildings. The **cheap** one costs 60 and',
      'comes off `hammers-of-glory`, one shared advance at depth 3 for all five',
      'factions; the **dear** one costs 130 and comes off that faction’s own.',
      'Three steps can fail -- learning the advance, the building appearing in a',
      'city’s yard, and raising it -- and `offered` is read from',
      '`buildOptions`, which is what the city is actually shown.',
      '',
      '| side | cheap: knew / offered / built | dear: knew / offered / built | cheap learned first |',
      '|---|---|---|---|',
      ...sides.map((f) => {
        const t = by[f];
        return (
          `| ${f} | **${t.cheapKnew}** / **${t.cheapOffered}** / ` +
          `**${t.cheapBuilt}** | ${t.dearKnew} / ${t.dearOffered} / ` +
          `${t.dearBuilt} | **${t.cheapFirst}/${t.bothKnown}** | (of ${t.games})`
        );
      }),
      '',
      '## which step of chooseProduction answered (section 174)',
      '',
      'Every decision each side made, by the step that made it. Step 4 is the',
      'one that would build a science building, and it is last of the ones that',
      'can: anything above it answering first is a decision step 4 never sees.',
      '',
      (() => {
        // Step 4 carries the chosen building's id, so collapse it back to the
        // step for this table and break it out underneath.
        const tags = [
          ...new Set(
            Object.keys(PRODUCTION_TRACE.counts).map((k) => k.split('|')[1].split(':')[0]),
          ),
        ].sort();
        const countOf = (f: string, tag: string) =>
          Object.entries(PRODUCTION_TRACE.counts)
            .filter(([k]) => k.split('|')[0] === f && k.split('|')[1].split(':')[0] === tag)
            .reduce((a, [, n]) => a + n, 0);
        const head = `| side | ${tags.join(' | ')} |`;
        const rule = `|${'---|'.repeat(tags.length + 1)}`;
        const rows = sides.map((f) => {
          const total = tags.reduce((a, tag) => a + countOf(f, tag), 0);
          const cells = tags.map((tag) => {
            const pc = total ? (100 * countOf(f, tag)) / total : 0;
            const txt = `${pc.toFixed(1)}%`;
            return tag.startsWith('4') ? `**${txt}**` : txt;
          });
          return `| ${f} | ${cells.join(' | ')} |`;
        });

        // And what step 4 actually bought, which is the question the step
        // alone could not answer.
        const picks = sides.map((f) => {
          const mine = Object.entries(PRODUCTION_TRACE.counts)
            .filter(([k]) => k.startsWith(`${f}|4 economy/defence:`))
            .map(([k, n]) => [k.split(':')[1], n] as const)
            .sort((a, b) => b[1] - a[1]);
          const tot = mine.reduce((a, [, n]) => a + n, 0) || 1;
          const sci = sciIds(f);
          const shown = mine
            .slice(0, 6)
            .map(
              ([id, n]) =>
                `${sci.has(id) ? `**${id}**` : id} ${((100 * n) / tot).toFixed(0)}%`,
            );
          return `| ${f} | ${shown.join(', ') || '--'} |`;
        });

        return [
          head,
          rule,
          ...rows,
          '',
          '### and what step 4 bought, commonest first (science buildings bold)',
          '',
          '| side | picks |',
          '|---|---|',
          ...picks,
        ].join('\n');
      })(),
    ].join('\n');

    writeFileSync(
      `tools/out/throughput${held ? '-held-out' : ''}${arm}.md`,
      `${report}\n`,
      'utf8',
    );
    console.log('\n' + report + '\n');
  }, 1_800_000);
});
