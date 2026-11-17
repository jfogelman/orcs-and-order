import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import type { Arm } from './sweep';
import { rawRows, report, runSweep, seedSet } from './sweep';
// The shipped game, shared with the probes. See the note at the top of it.
import { control } from './control';
import { TRIBUTE } from '../src/sim/diplomacy';

/**
 * The question this sweep is currently asking.
 *
 * **Edit `ARMS` and run `npm run sweep`.** This file is the question; `sweep.ts`
 * is the machinery, and there is no reason to touch it. It does not run with
 * the ordinary suite -- it plays hundreds of whole games -- so it lives behind
 * its own config.
 *
 * The rules that are not negotiable, and that `runSweep` enforces:
 *
 * - **At least two arms, and they must really differ.** Emulate a control by
 *   moving a constant, never by stashing the source: `git stash push --
 *   <paths>` rejects the entire pathspec when any one path is untracked, so a
 *   control arm that stashes `src/` next to a new file stashes nothing and runs
 *   the new code twice. Section 59.
 * - **Two seed sets.** One to tune against, one to decide with. Section 19's
 *   numbers reversed between them.
 *
 * The arms below are whatever is being asked right now. Replace them.
 */

// Declared rather than pulled in via @types/node, matching the balance suite.
declare const process: { env: Record<string, string | undefined> };

/**
 * Every arm sets **every** knob, including the ones it is not changing.
 *
 * An arm that only sets what it moves inherits whatever the previous arm left
 * behind, which is a different bug from section 59's and the same kind of wrong
 * answer.
 */
// The shipped game lives in `control.ts` now, so the probes can play it too.
// See the note at the top of that file: they were not, and it showed.

const buildArms = (): Arm[] => {
  /**
   * Section 161: **the Hive wins more than anybody and only ever one way.**
   *
   * Of 108 games of the shipped arm: Hivekin 40, Kingdom 33, Horde 16,
   * Wandering Folk 3, Unbound 3, 13 unfinished. Five sides, so an even share
   * is about 20. Every one of the 40 is their own ending -- not one win by
   * conquest, dominance or points, in any arm -- and they finish it on turn
   * **193** against 270 for the Mysterious Object and 283 for the Portal.
   *
   * It is not a small side punching up. It is two games wearing one average:
   *
   * | | games | cities | pop | units | wins |
   * |---|---|---|---|---|---|
   * | it established | 52 | 5.92 | 40.1 | 29.7 | **40 (77%)** |
   * | it did not | 56 | 1.15 | 9.6 | 2.9 | **0** |
   *
   * Nothing drifted to get here. Section 125 gave them the shortest road to
   * an ending in the game and the cheapest ending, on purpose, because before
   * that they could not win at all -- and tuned it to 4 wins in 12, which in
   * a *three-sided* game was exactly even. Sections 142 and 152 then added
   * two more sides and nobody re-asked. Jeremy: *"hivekin shouldn't just be
   * the default winners, definitely not."*
   *
   * ## What the arms actually charge, which is not what they are named
   *
   * `buildings.ts` prices the three works at 180/180/240. **The Hive has not
   * paid that since section 153.** Section 136 made the price a lerp on how
   * early they arrive, anchored at turn `HIVEKIN.from` (90); section 153
   * replaced the single turn-90 arrival with one gap per slot, so on Normal
   * they land in turns 20-60 and pay **735-915**. Turn ninety is no longer
   * reachable at any level, so six hundred is a price the game cannot charge
   * and the control arm is not "six hundred".
   *
   * | arm | `works` | base | **effective, turns 20-60** |
   * |---|---|---|---|
   * | `as shipped` | 1 | 600 | **735-915** |
   * | `half again` | 4/3 | 800 | **980-1220** |
   * | `double-ish` | 5/3 | 1000 | **1225-1525** |
   *
   * For scale, the other four endings are flat: Portal, Caravan and Party at
   * 1000, the Mysterious Object at 1200.
   *
   * ## What would count
   *
   * The win column is the point here, which is unusual -- `attribution-
   * needs-the-same-bar` normally forbids reading rare-event counts, but 40 of
   * 108 is not a rare event and the three arms are a monotone ladder, so a
   * monotone fall across both seed sets is the thing to look for. The column
   * that should move with it is **the turn the Hive's ending lands**: if the
   * price bites, 193 moves toward the 270-283 the empires take, and the
   * ending race becomes a race.
   *
   * The failure mode to watch for is the lever being a cliff rather than a
   * slope -- section 125 found exactly that when it repriced the *road*
   * (860, 710 and 610 beakers all gave zero wins). If `half again` and
   * `double-ish` both give roughly nothing, the answer is "somewhere under
   * 800" and the next sweep is a narrower ladder, not a wider one.
   */
  /**
   * ## Section 171, and the arms above are spent
   *
   * The ladder above ran on 2026-10-28 and shipped `works` at 800. Section 169
   * then measured the column it never looked at: the **road** to each ending
   * advance, cumulative over prerequisites, runs 165 / 430 / 700 / 965 / 1035
   * for hive / orc / wandering / human / unbound, and how often a side learns
   * its ending advance is monotone in that number. The Hive learns its own in
   * **18 games of 18**; the Unbound learn theirs in **three**.
   *
   * Jeremy, 2026-11-08, given both directions: *"Hivekin lengthen to match the
   * others more closely."*
   *
   * ## Why these three numbers and not the obvious ones
   *
   * **Section 125 already swept this lever and found a cliff.** Roads of 860,
   * 710 and 610 beakers all returned **0 wins of 12**, and the column that
   * explains it is `advances`: **11.8 in every arm**. At 9.9 beakers a turn
   * against the Horde's 19.1 and the Kingdom's 32.4, a 610-beaker road is the
   * Hive's whole research life. Its words: *"860 to 710 to 610 are the same
   * answer wearing different numbers."* Only 165 produced a win at all.
   *
   * So the faithful minimal reading of the ruling -- parity with the nearest
   * other road, the Horde's 430 -- sits **above two settings already measured
   * at zero**, and a ladder reaching for 700 or 1035 would be three arms of
   * nothing. That is the sweep section 125 already paid for.
   *
   * **What is genuinely unknown is whether the cliff is still there.** Section
   * 125 probed a Hive arriving around turn 105 with 3.5 cities; section 153's
   * stagger lands it in turns 20-60, so it now has a much longer life and more
   * income than the 9.9/turn that made the cliff. The cliff is a fact about
   * throughput, and throughput moved.
   *
   * | arm | multiplier | road | what it tests |
   * |---|---|---|---|
   * | `as shipped` | 1 | **165** | the control, and section 161's 21% |
   * | `twice the road` | 2.35 | **300** | still well under the old cliff |
   * | `horde parity` | 3.65 | **430** | the ruling, at its gentlest |
   *
   * ## What would count
   *
   * `advances` is the column to read first, not wins. If it pins near 12 in
   * the two longer arms the way it did in section 125, the cliff has not moved
   * and the ruling cannot be delivered by this lever at any setting -- which is
   * a finding, and the one that sends this back to Jeremy with throughput or
   * depth as the alternative rather than price.
   *
   * If `advances` rises with the longer roads, the cliff has moved, the ladder
   * is a slope again, and the question becomes where on it 20% sits.
   *
   * The road is `65 + 100 x multiplier`: `all-is-the-hive` costs 100 of its
   * own and its prerequisites sum to 65.
   */
  /**
   * ## Section 176: the two halves of the build-choice fault, as a 2x2
   *
   * The road ladder above is spent -- section 172 measured it inert. Sections
   * 174 and 175 then found two faults in how a city decides what to build, and
   * they are in series:
   *
   * - **`BUILD_ORDER.cheapest`.** `unlockedBuildings` returns buildings in the
   *   order their advances were learned, because it fills a Set by walking
   *   `player.techs`. Five rules take the *first match* over that list, so
   *   research order silently decides which content building, ending work,
   *   supply house, economy building and barracks every AI builds. Measured in
   *   one of the five: cheap-learned-first is **45/45** for the three factions
   *   that build a library and **0/37** for the two that never do. The sibling
   *   `unlockedUnits` sorts by cost and this function never got the line.
   * - **`AI_TUNING.keepBuilding`.** Production is re-chosen every turn and step
   *   4 commits on a 40% roll, so a city holds a building two turns in five and
   *   a completing unit spends the shields in between. Section 174 measured the
   *   ceiling: 112 and 118 shields banked toward a 130-shield building, and the
   *   Hive stalling at 57 of 60.
   *
   * **Four arms rather than three, which is 432 games and the reason for it.**
   * The ordering fault points two factions at a 130-shield building; the churn
   * fault is what makes 130 unreachable. Fix the order alone and they are
   * pointed at a 60-shield building they can finish. Fix the churn alone and
   * they can finish the 130 one. Either arm alone would be credited with the
   * other's effect, and a three-arm ladder cannot separate them. `attribution-
   * needs-the-same-bar`, applied before the measurement instead of after.
   *
   * ## What would count
   *
   * `cheapest` is the one with a prediction attached: the Unbound and the
   * Wandering Folk should start building libraries at all, from 0 and 1 of 36.
   * If that column does not move, section 175's mechanism is wrong.
   *
   * `keepBuilding` has **no prediction and is the one to be suspicious of**.
   * Section 4e's rush-buying and section 53's forward bases were both repairs
   * this obvious and both measured as harmful or inert. A guard that makes
   * every empire finish more buildings also makes the Kingdom finish more
   * buildings, and the Kingdom is already on 31.5%.
   *
   * The column to watch beside the win shares is **unfinished games**: both
   * levers move shields out of soldiers and into buildings, and section 160
   * retired a measured gain for costing a third of all games to the turn limit.
   */
  /**
   * ## Section 177: the road-crew budget, counted by the flag that digs
   *
   * Step 3d builds `options.units.find((u) => u.works)` and then budgets
   * against units flagged `settler`. For the two empires and the Wandering
   * Folk that is one unit, and `ROAD_TRACE` measures the two counts as
   * identical to two decimals over 72 games on both seed sets: the budget
   * closes 98.5 to 99.6% of the time and the step fires about 1%. The Hive's
   * Worker (15, and the cheapest thing they own, so the cost sort always
   * reaches it first) and the Unbound's Effigy (20, declared before the
   * equally-priced Domovoi, so the tie-break takes it) are `works` and not
   * `settler`. Their budgets therefore count something they rarely build --
   * the Unbound's reads **0.8** while the field holds **11 to 14** diggers --
   * and step 3d answers **53 to 57%** of their production decisions against
   * everyone else's 1%.
   *
   * Two arms, not four: there is one lever and no second fault in series with
   * it.
   *
   * ## What would count
   *
   * The mechanism is already measured, so this arm is only about the
   * consequence. `ROAD_TRACE`'s `would be full` column is the prediction, and
   * it is a *different* prediction per faction:
   *
   * - **Unbound 99.7 and 99.3%.** Counted by `works` their budget lands
   *   exactly where the empires already sit, so step 3d should fall from 57%
   *   of their decisions to about 1% and roughly half their production should
   *   go somewhere else. That is a large redirection, not a tidy-up: section
   *   176 shipped on a change worth 0 to 2 wins in 108, and this is not that
   *   shape.
   * - **Hive 49.0 and 86.4%.** Their digger costs 15 and does not survive, so
   *   the budget would be full far less often. Expect step 3d roughly halved
   *   rather than ended.
   *
   * **No prediction on wins, and that is the point.** Section 4e's
   * rush-buying, section 53's forward bases and section 176's production guard
   * were all repairs this obvious, and all three measured harmful or inert to
   * the sides they were meant to help -- twice because the side with the least
   * slack valued flexibility over the thing the repair bought it. The Unbound
   * currently spend half their production on Effigies and finish 1 library in
   * 36; if the redirected shields go into soldiers that die, this will read as
   * harmful and should stay off.
   *
   * Columns to watch beside the win shares: **unfinished games** (shields
   * moving out of roads and into anything else), the Unbound's **cities** and
   * **routes** (roads are what their trade rides on, and 8 to 14 diggers do
   * lay a network), and **fights** -- the guard in section 176 bought fewer
   * fights for exactly the two factions it was meant to help.
   */
  /**
   * ## Section 179: what a latecomer arrives with
   *
   * Section 178 went looking for the Unbound being ground down and found the
   * opposite: their peak-to-final drop is the *smallest* in the game, and what
   * actually happens is that they are **wiped out in 8 or 9 games of 18**,
   * while when they survive they finish on 6 to 7 cities, second only to the
   * Kingdom. They are bimodal, and it is decided early -- median elimination
   * turn 72 to 79, and the games they lose have a median peak of **one or two
   * cities**. They never establish.
   *
   * Section 160 had already found the arrival *slot* beats the faction, and
   * section 178 confirmed it from a second direction: in all four
   * faction-by-set cells, the eliminated games drew later slots than the
   * survived ones, by 10 to 18 turns. But the slot cannot explain a lifespan
   * whose median is 25 turns and 14 and whose minimum is **5 on both sets**. A
   * side gone five turns after arriving is not dying of a late slot.
   *
   * ## The lever, and the arithmetic that makes it a candidate
   *
   * Every latecomer arrives through one routine, `maybeArrive`, governed by
   * constants that happen to live under `HIVEKIN`: `founders` is a count (2)
   * and the escort is a **shields budget** since section 157 -- deliberately,
   * so that "a dearer founder should not mean a lonelier one" while the escort
   * stays "what it costs". Divided by each faction's own starter:
   *
   * | faction | starter | cost | escort at 40 | at 60 | at 80 |
   * |---|---|---|---|---|---|
   * | hivekin | fodder | 10 | **4** | 6 | 8 |
   * | wandering | wf-skirmisher | 13 | **3** | 4 | 6 |
   * | unbound | revenant | 20 | **2** | 3 | 4 |
   *
   * So the faction with the dearest starter arrives with **half the guard the
   * Hive does** out of an identical budget -- and it is the one that dies
   * within 5 to 25 turns of arriving, half the time. The Hive, on four bodies,
   * is wiped out in 3 or 4 games of 18.
   *
   * **Three arms, a dose ladder rather than a switch.** 40 is the shipped
   * game; 60 and 80 are the two readings of "the dearest starter still gets
   * three or four". A ladder because a monotone response across three doses is
   * evidence and a single better arm is a coin landing the right way up --
   * section 172 spent a whole section learning that from a two-arm ladder that
   * turned out to be flat.
   *
   * ## What would count
   *
   * The column is **`gone`**, added to the report in this section: games a
   * side ended holding no city. The sweep has reported `cities` as a mean
   * since the beginning and could not see this at all, which is why section
   * 178 needed a probe of its own to find it. The Unbound sit at 8 or 9 of 18.
   * If a bigger guard is the answer, that falls and their `cities` mean rises
   * *because* the zeroes leave it, not because the survivors get bigger.
   *
   * **No prediction on wins, and a specific reason to distrust the obvious
   * one.** This is the fourth repair in this arc that looked obvious: section
   * 4e's rush-buying, 53's forward bases and 176's production guard all
   * measured harmful or inert to the sides they were built for, twice because
   * the side with the least slack valued flexibility over what the repair
   * bought it.
   *
   * **And the attribution is confounded by design, which has to be said
   * plainly.** A shared budget moves all three latecomers: the Hive goes from
   * four bodies to six and eight, and it is already on an even win share after
   * section 161. So an improvement in the Unbound cannot be cleanly separated
   * from a board where every latecomer arrives stronger. The design that
   * *would* isolate it is a floor on bodies rather than a bigger budget --
   * `Math.max(3, floor(shields / cost))` -- which leaves the cheap-starter
   * factions exactly where they are. That is a different design claim, so it
   * is not smuggled in here; if this ladder moves the `gone` column, the floor
   * is the arm that says whose guard did it.
   *
   * Columns to watch beside `gone`: the **Hive's** win share and cities, since
   * it gains most in absolute bodies; **unfinished games**, because a side
   * that survives instead of dying is a side still playing at the turn limit;
   * and **fights**, which rose the last time more soldiers appeared on the map.
   */
  /**
   * ## Section 179b: the same four bodies, bought the other way
   *
   * The ladder above ran. The column moved: the Unbound ended with no city in
   * **56 games of 108 at 40 shields and 41 at 80**, non-increasing in both
   * sets, paired by seed 21 rescued against 6 lost, exact McNemar **p =
   * 0.006**. Conditioned on surviving they end slightly *smaller*, so it is an
   * elimination result and not a strength one -- which is exactly what `gone`
   * was added to be able to say.
   *
   * **And the route to it was wasteful.** 80 shields takes the Hive from four
   * bodies to eight, and the Hive is the faction that moves least in the whole
   * run (`gone` 24 → 19 → 22, p = 0.87; wins 25 → 31 → 26). Meanwhile the
   * board stops resolving: games out of turns 16 → 22 → **28** of 108, paired
   * p = 0.023, and pooled over all 324 games the chance of running out is set
   * almost entirely by how many sides are still standing -- 0% at two, 5% at
   * three, 26% at four, **66% at five**.
   *
   * So this arm buys the same four Revenants with a **floor on bodies** at the
   * shipped budget, which is section 157's own reasoning about founders -- "a
   * dearer founder should not mean a lonelier one" -- applied to the escort,
   * and keeps what the budget was for: the class is priced, the dear end has a
   * minimum, faction six still needs no entry.
   *
   * | faction | starter | cost | **shipped** | floor 4 | floor 6 |
   * |---|---|---|---|---|---|
   * | hivekin | fodder | 10 | **4** | 4 | 6 |
   * | wandering | wf-skirmisher | 13 | **3** | 4 | 6 |
   * | unbound | revenant | 20 | **2** | 4 | 6 |
   *
   * **The middle arm is the one that discriminates**, and it does what 80
   * shields could not: it moves the Unbound to four and the Hive not at all.
   * Written down before the run, because it is the whole reason to spend
   * another 97 minutes:
   *
   * - If **four bodies** is what the Unbound were missing, floor 4 reproduces
   *   most of the `gone` drop -- 56 towards 41 of 108 -- while the unfinished
   *   column stays near 16 rather than going to 28.
   * - If what actually happened at 80 was **every latecomer arriving
   *   stronger**, floor 4 moves `gone` far less, because two of the three
   *   factions barely change.
   * - Either way the Hive is the control: it is on four in both of the first
   *   two arms, so anything that moves for it between them is noise, and the
   *   run carries its own noise estimate for once.
   *
   * Floor 6 is there because 80 shields was not a clean reading of "more is
   * better" either -- it is the dose arm, and if the unfinished cost comes
   * back at floor 6 with the Hive back up at six bodies, that is a second
   * pointer at whose guard was buying it.
   *
   * It also re-asks the one cell section 179 left unresolved. The Wandering
   * Folk's best arm there was 60 shields -- four bodies, `gone` 65 → 53 of
   * 108, p = 0.029, with cities, population and units up in both sets -- but
   * it broke monotonicity (3 → 6 bodies did nothing), section 159's own probe
   * found 2 and 6 bodies alike for them, and it was the best of six cells. It
   * was written up as unresolved. Floor 4 puts them on four again on the same
   * 108 maps, which is an independent test of that cell rather than a
   * re-reading of it.
   *
   * **Three bodies is not an arm**, and that is a saving rather than an
   * omission: a floor of 3 only changes the Unbound, from two to three, and
   * the 60-shield arm already measured the Unbound at three bodies as inert
   * (52 of 108 against 56, paired p = 0.56).
   */
  /**
   * ## Section 180: what a treaty is worth, and whether it is ever offered
   *
   * Section 154's item 1 measured where gold actually goes and found **one
   * sink that matters, and it is espionage**: turning a spy is the largest
   * outgoing for every side that spends anything. The Kingdom banks 728 and
   * spends 952 a game; the Hive banks 612 and spends 67; the Unbound bank 546
   * and spend 80. Gold is not dead, it is dead **for three of the five**.
   *
   * Section 180 built the one option that survived that item's own
   * re-measurement. Tribute is the only gold sink proposed here that cannot
   * compound a lead: a sink that buys *power* pays whoever has the most gold,
   * which is what retired rush-buying and killed the mercenary market, but a
   * sink that buys *peace* is worth most to whoever is losing.
   *
   * ## The two things that could be wrong, and they are different things
   *
   * `aiTerms` attaches gold to a treaty only when the strength ratio passes
   * **1.3 or 0.8**, and then a flat **25 or 30**. Section 168 measured the
   * result as peace terms moving 3 to 49 gold in a whole game. There are two
   * candidate explanations and the ladder is built to separate them:
   *
   * - **The figure.** 25 gold against a 600-gold treasury is not a term in
   *   anybody's decision, whatever the band does.
   * - **The band.** Most wars are not lopsided enough to open it, so most
   *   treaties carry nothing however large the payment would have been.
   *
   * Making the payment bigger does not make it more frequent, so these do not
   * substitute for each other and one arm cannot answer both.
   *
   * | arm | what a treaty carries | when it carries it |
   * |---|---|---|
   * | flat 25 and 30 | the game up to section 179 | 1.3 / 0.8 |
   * | a share of the purse | 0.2 of the payer, 0.25 demanded, cap 120 | 1.3 / 0.8 |
   * | and offered more often | the same share | **1.1 / 0.9** |
   *
   * Each step moves exactly one thing: arm 1 to 2 is the figure at the
   * shipped band, arm 2 to 3 is the band at the shipped share.
   *
   * ## The first arm is also a canary
   *
   * `TRIBUTE.proportional = false` is the old game *exactly* -- `tributeOf`
   * keeps that path floorless for this reason -- so arm 1 should reproduce
   * section 179c's shipped arm **bit for bit**, on the same seeds. Section
   * 179c established that a shared arm replays identically across runs, and
   * that is what let two three-arm ladders pool into one five-arm design.
   *
   * So check it before reading anything else. If arm 1 differs from 179c's
   * shipped rows, something unpinned has leaked into `control()` since, and
   * every comparison in both runs is void. It costs nothing and it is the only
   * cheap test of that there is.
   *
   * ## What would count, and what the risk is
   *
   * The sink works if the three hoarding sides **end with less banked**. That
   * is the point of the section.
   *
   * But banked gold alone cannot tell a drained hoard from a transfer, and the
   * risk was written into section 180 before it was built: **the coin flows to
   * whoever is winning the war**, who already has a working sink in espionage.
   * So read banked gold per side together with `wins` and `gone`. If the
   * Kingdom's banked gold rises while nobody else's falls, this is a transfer
   * to the strongest side wearing a sink's clothes and should come back out.
   *
   * A second thing to read rather than assume: the Hive may **never be
   * billed**. It wins by its own ending without contesting the military
   * dimension, so a band keyed to a lopsided war may simply never open for it
   * -- in which case the faction with the deadest gold is untouched by both
   * arms, and the band, not the share, is the whole lever. Arm 3 is the one
   * that can say so.
   */
  const tribute = (label: string, apply: () => void): Arm => ({
    label,
    apply: () => {
      control();
      apply();
    },
  });

  return [
    tribute('flat 25 and 30 (the old game)', () => {
      TRIBUTE.proportional = false;
    }),
    // `control()` already pins the shipped share, so this arm changes nothing
    // on purpose: it is the shipped game, named.
    tribute('a share of the purse', () => {}),
    tribute('and offered more often', () => {
      TRIBUTE.offersWhenOutmatched = 1.1;
      TRIBUTE.demandsWhenAhead = 0.9;
    }),
  ];
};

const ARMS: Arm[] = buildArms();


/**
 * Eighteen seeds a base is the full run. Set SWEEP_PER_BASE=1 to check the
 * plumbing of a new set of arms in a minute rather than finding out half an
 * hour in that one of them throws.
 */
const PER_BASE = Number(process.env.SWEEP_PER_BASE ?? 18);

/** Where each run is kept, so one sweep can be read against another. */
const OUT = 'sweep-results';

const SETS = [
  seedSet('tuned', [1, 1_000_003, 2_000_011], PER_BASE),
  seedSet('held-out', [7_654_321, 8_000_011, 9_000_017], PER_BASE),
];

describe('sweep', () => {
  it(
    'measures the arms in tools/sweep.run.test.ts',
    () => {
      const lines: string[] = [];
      const results = runSweep({
        arms: ARMS,
        sets: SETS,
        say: (line) => {
          lines.push(line);
          console.log(line);
        },
      });
      const table = report(results);
      console.log('\n' + table + '\n');

      // Kept as well as printed, because the comparison that matters is usually
      // against the sweep you ran last week and no longer have on screen.
      if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
      const file = join(OUT, `${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      writeFileSync(
        file,
        [
          `arms: ${ARMS.map((a) => a.label).join(' vs ')}`,
          `seeds per base: ${PER_BASE}`,
          '',
          ...lines,
          '',
          table,
          '',
          'seed by seed:',
          // **No hand-written header.** `rawRows` emits its own, built from
          // the same list it builds the rows from, so the two cannot drift.
          // The one that used to live here had drifted: it said `orcL/humL`
          // for a column pair that is the deepest counting-group reached, and
          // section 138 wrote a prediction against "Kingdom units" on the
          // strength of it. There was no units column at all.
          rawRows(results),
          '',
        ].join('\n'),
        'utf8',
      );
      console.log(`Written to ${file}`);
    },
    // Generous, and scaled: an explicit timeout overrides the config entirely,
    // so a fixed one silently caps how many seeds can ever be run.
    //
    // Twenty-five seconds a game, up from fifteen. Section 125's fight-bar
    // sweep took 15.7s a game over 216 games -- 56.6 minutes against a budget
    // of exactly 54 -- so it printed its whole table and *then* failed on the
    // timeout. A third seat makes games longer, and a measurement that has to
    // be read out of a failed test is one somebody will eventually throw away.
    //
    // **The floor was raised to twenty minutes in section 179b, because a
    // smoke run failed on it.** `SWEEP_PER_BASE=1` is 18 games, which scales
    // to 450s and so used to take the 600s floor -- and the three-arm floor
    // smoke took **705s, 39.2s a game** against the 18.0s the same code
    // averaged over 324. A short run pays all of the warm-up and none of the
    // amortisation, so the floor cannot be a per-game figure at all. It
    // printed its whole table and then failed, which is the one outcome this
    // comment already existed to prevent, and a failed smoke is worse than a
    // slow one: the next person reads it as a broken arm.
    Math.max(1_200_000, ARMS.length * SETS.length * PER_BASE * 3 * 25_000),
  );
});
