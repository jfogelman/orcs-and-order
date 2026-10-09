# Section 125 — The Hivekin

The third faction. Picked up from the bible at
`art_src/factions/hivekin/hivekin.md` (second draft, 2026-10-01) and Jeremy's
answers across 2026-09-24 to 2026-10-01. **Nothing is implemented yet.** This
document is the agreed design and the order of work, so the slice can be put
down and picked back up without re-deriving any of it.

Art prompts for what is still missing live in `ART_PROMPTS.md`, under
"The Hivekin (section 125)". They are deliberately not repeated here.

---

## What the Hivekin are

Orcs answer "how many." Humans answer "how organised." Hivekin answer **"what
grows next."** No counting ladder and no committee ladder — one structure, the
Hive, and a tech tree that is entirely about which caste it is now capable of
producing. The register is flat and matter-of-fact throughout: everything was
always going to happen, nothing is remarkable, and the joke is that the most
remarkable thing in any given scene is the thing nobody in it has reacted to.

They are a **full third contender**. Score, dominance, elimination and their own
tech ending all count them, and they can win by any of the four.

---

## Jeremy's decisions

Logged in the order they were settled, so a later reading knows which are
settled and which are still placeholders.

### Settled 2026-09-24 (the first six answers)

1. **The joke is different for each new faction.** Three factions are designed;
   only the Hivekin ship now. The others are the **Unbound** and the
   **Wandering Folk**.
2. **Fought, not talked to.** No diplomacy with them in this slice.
3. **Emergence**, not a third start position.
4. **Jeremy provides the lists** — units, advances, buildings. The roster is not
   to be invented.
5. **Dominance needs adjusting**, and each new faction gets **its own tech
   ending** — section 110's pattern extends rather than being shared.
6. **Balance target: Horde against Kingdom must stay balanced.** Pure
   three-way evenness can wait.

### Settled 2026-09-25

7. The bible and art go in `art_src/factions/hivekin/`.
8. **Emergence is by turn, give or take** — a window around 90–120, on
   unclaimed ground well away from both empires, arriving with a settler and an
   escort and growing from there. Predictable enough to plan against, and one
   clean arm to measure.
9. **A full third contender.** This is the answer with the widest blast radius.

### Settled 2026-10-01

10. **The Queen appears in the first city (the capital), immobile.** That is
    what "starting unit" means here — she is spawned into the first Hive the
    moment it is founded, not at the moment of emergence.
11. **Terrain resources are ordinary specials with Hivekin flavour.** The
    bible's three bespoke effects are dropped; the tiles keep their names and
    their art and behave like every other special.
12. **Dominance share becomes a function of seat count.** Three quarters of the
    world is much harder with three contenders, so left alone the clock would
    simply stop firing and every game would decide on points.
13. **The Warden is held.** It ships as an ordinary defensive caste with no
    exorcism. The exorcism logic arrives for all factions when the Unbound do.
14. **Unit stats confirmed** — the table below.
15. **The Bloat-caste carries `ammo: 5`, `reloadsBy: 'labour'`.**
16. **Fodder-caste is `expendable`**, which gives the Hivekin the Horde's
    sacrifice economy if a siege train ever wants it.
17. **Costs are balance levers, not settled numbers** — the follies, the ending
    works and the new units can all move to make the measurement land.
18. **The Princess is a unit**, standing in the Hive, killable by an ordinary
    attack. That is what makes a succession plan fragile in an interesting way.
19. **The Undercity's "unaffected by pillaging"** means its +2 production stands
    even when the Hive's worked tiles have been pillaged.
20. **Ship it in slices and measure each one.**

---

## The roster

Fourteen castes. Stats confirmed 2026-10-01; the derivation from each one's
"rough equivalent" is in the right-hand column so a later tuning pass knows what
the number was reasoning about.

| id | Role | A | D | HP | M | Cost | Reasoning |
|---|---|---|---|---|---|---|---|
| `grub` | worker, settler | 0 | 1 | 10 | 1 | 20 | mirrors Peon/Peasant |
| `worker` | worker | 0 | 1 | 10 | 1 | 15 | cheaper than Grub; cannot found |
| `fodder` | melee | 1 | 1 | 10 | 1 | 10 | Goblin's price and numbers, but M1 |
| `soldier` | melee | 3 | 2 | 12 | 1 | 20 | mirrors the Orc |
| `elite` | melee | 5 | 4 | 16 | 1 | 40 | Knight's tier, M1 not M2, +1 D in exchange |
| `spitter` | ranged | 4 | 1 | 10 | 1 | 25 | Axethrower's profile without the thrown-weapon penalty |
| `burrower` | melee | 3 | 2 | 12 | 2 | 35 | dearer than the Sapper; the mobility is the value |
| `broodlord` | melee | 7 | 4 | 18 | 1 | 58 | just under the Ogre |
| `princess` | worker | 0 | 2 | 12 | 1 | 60 | expensive insurance, no combat |
| `warden` | melee | 4 | 7 | 18 | 1 | 65 | defensive specialist in the Paladin's slot |
| `queen` | melee | 0 | 6 | 25 | **0** | — | immobile, never built normally |
| `tidecaste` | naval | 0 | 1 | 10 | 3 | 30 | transport, `carries: 3` |
| `riptidecaste` | naval | 5 | 2 | 12 | 3 | 55 | attack ship |
| `bloatcaste` | siege | 8 | 1 | 12 | 1 | 45 | `range: 2`, `siegeBonus: 2`, `ammo: 5`, `reloadsBy: 'labour'` |

**Flags:** `grub` is `settler`. `fodder` is `expendable`. `queen` is `move: 0`.
`tidecaste` and `riptidecaste` are `sails`.

### Two deliberate weaknesses

**No scout caste.** Every other faction has a cheap fast explorer (Scout,
Outrider). The Hivekin do not, and the Fodder-caste is kept at **M1** rather
than the Goblin's M2 so that the cheap spam unit does not quietly become the
explorer as well. If exploration turns out to be crippling rather than merely
costly, Fodder M2 is the first dial to try.

**No caster and no flier.** Deliberate — nothing in the Hivekin roster casts
anything, which is the premise the Warden-caste exists to preserve.

### Three unit costs that undercut their counterparts

Worth watching in the sweep rather than fixing in advance: Tide 30 against the
Raft's 35, Riptide 55 against the Warboat's 60, and the Bloat's stat line is the
Ballista's exactly (8/1/12/1/45s). As written the Hivekin hold the best-value
transport *and* the best-value warship, on the map type section 114 found most
sensitive.

---

## The tech fork

The shared spine works for them exactly as it does for the other two sides
(`mapmaking`, `tree-hugging`, `bridge-building`, `wall-building`,
`tower-building`, `not-you-again`, `hammers-of-glory`, `joy-making`, `happiness`,
`insanity`, `pyromancy`, `cryomancy`). The fork is in the bible, verbatim and
ready to paste, plus two advances the second draft added:

| id | Cost | Prereqs | Grants |
|---|---|---|---|
| `first-hivekin` | 0 | — | Grub, Worker |
| `caste-fodder` | 20 | first-hivekin | Fodder-caste |
| `caste-soldier` | 45 | caste-fodder | Soldier-caste |
| `caste-spitter` | 50 | caste-fodder | Spitter-caste |
| `caste-burrower` | 65 | caste-fodder | Burrower-caste |
| `caste-riptide` | 70 | caste-soldier | Riptide-caste |
| `burrower-veteran` | 90 | caste-burrower | Sink no longer reveals last tile |
| `caste-bloat` | 95 | caste-spitter | Bloat-caste |
| `burrower-deep` | 120 | burrower-veteran | Burrow range 3, + The Undercity |
| `burrower-ambush` | 120 | burrower-veteran | First-strike on emerge |

**Deep and Ambush are both researchable, and that is the decision rather than
the omission it looked like.** The bible calls them "two mutually exclusive
specializations"; the tech tree has no way to say that, and nothing else in the
game has ever needed one. Jeremy's answer of 2026-10-06: allow both, because
exclusivity here would be guarding a line that is not under threat — both
branches sit inside the Burrower-caste's own idea, and nothing bleeds between
*castes*. Further Down is mobility and Already Waiting is damage; a Hive that
pays 90 + 240 beakers out of the ten advances it gets in a game has specialised
by paying, which is the sacrifice the exclusivity was there to create.

Reconsider only if a later caste wants branches that really are opposed. That is
when the tech tree earns an `excludes` field, and it would then be available to
everybody rather than invented for one pair.
| `caste-elite` | 85 | caste-soldier | Elite-caste |
| `caste-broodlord` | 130 | caste-elite | Broodlord-caste, + The Broodwarmth |
| `caste-warden` | 140 | caste-elite, hammers-of-glory | Warden-caste |
| `caste-princess` | 110 | caste-elite, happiness | Princess-caste, + The Old Queen's Shell |
| `all-is-the-hive` | 100 | caste-soldier | The ending's three works |

`tidecaste` is added to the shared `mapmaking` advance's `units` list, which is
how `raft` and `barge` already work — the per-faction filter happens where units
are offered.

### The one number that needed measuring, and what it said — 2026-10-04

The ending roads, computed from the actual tree, with the research rate that
has to pay for them:

| Side | Beakers to the ending advance | Beakers a turn | Turns of pure research | Works priced at |
|---|---|---|---|---|
| Horde | 430 over 7 advances | 19.1 | **23** | 300 / 300 / 400 |
| Kingdom | 965 over 12 advances | 32.4 | **30** | 360 / 360 / 480 |
| Hivekin as written | 860 over 11 advances | **9.9** | **87** | 300 / 300 / 400 |
| Hivekin as it now ships | **165 over 4 advances** | 9.9 | **17** | 180 / 180 / 240 |

The guess above this line was that the Hivekin had the Kingdom's long road at
the Horde's cheap works and the answer would turn on their research rate. The
rate was the answer, and it was worse than the question allowed for: **9.9
beakers a turn against 19.1 and 32.4**, so the road was 87 turns of pure
research in a life of about 140. In twelve games they reached the advance twice
and built, in total, no works at all, while thirty-eight of every fifty-four
games are decided by somebody finishing an ending.

The second thing it said is that **the price was not a lever**. Their advances
per game read 11.8 whatever the road costs — repricing buys no research, it only
changes what the research is spent on, so an eleven-advance road is their whole
game at any price. 860, 710 and 610 all gave zero wins; the works at forty per
cent gave zero wins.

So the road had to fit inside four of their twelve advances. It hangs off
`caste-soldier` now, 165 beakers over four advances they research anyway, asked
for fifth of twenty-five — the most aggressive ending priority of the three
sides, which is the asymmetry their research rate pays for. 4 wins in 12
probed, every one an ending win. Jeremy chose this over giving them a research
mechanic of their own, which stays on the table as the bigger-ceiling option:
beakers off total Hives or total population rather than per-city trade, which is
the one lever that moves the 9.9 itself.

---

## The ending: The Second Queen's Shell

Section 110's shape exactly — two lesser works buildable independently once
`all-is-the-hive` is researched, then the final work, which only becomes
buildable in a Hive already holding one of the two, once both stand somewhere.

| id | Cost | Kind |
|---|---|---|
| `moltingChamber` | 180 | `endingPart: 'hive'` |
| `secondFeeding` | 180 | `endingPart: 'hive'` |
| `secondQueenShell` | 240 | `victory: 'hive'` |

Six hundred shields against the other two endings' thousand, because of what it
is paid out of: 3.5 Hives of 5.5 citizens where an empire pays out of six cities
of eight. Worth double once the road was short — 2 wins in 12 at a thousand, 4
at six hundred — and worth nothing at all while it was long.

`VictoryKind` and `endingPart` both gain `'hive'`, and `checkEndings` gains a
third branch for the "work has begun" announcement that currently reads
`p.faction === 'orc' ? portal : object`.

---

## The three follies

The bible's civ/city split maps straight onto machinery that already exists:
`empireBonus` for a civ-wide effect and `cityFollyBonus` for one scoped to the
city the folly stands in (`src/sim/follyEffects.ts`). Restricting a bonus to
named creatures has a precedent in the Long Vigil and its `MOUNTED` set.

| id | Rides on | Scope | Effect |
|---|---|---|---|
| `oldQueensShell` | `caste-princess` | Civ | +1 attack, Princess-caste and Broodlord-caste |
| `broodwarmth` | `caste-broodlord` | City | caste units trained here cost 15% fewer shields |
| `undercity` | `burrower-deep` | City | +2 production here, and it stands through pillaging |

**Costs.** The stated convention — 150 behind an advance of 45 to 85 beakers,
200 behind 100 to 130, 250 beyond — puts all three at **200**, since they ride on
advances costing 110, 130 and 120. The other sides have a spread (150/150/200/250
and 150/200/200/250), so the Hivekin get a flatter and dearer set as well as one
fewer folly than everybody else. A lever, per decision 17.

---

## Engine work, and what is already safe

### Already N-side safe, and should be left alone

Measured rather than assumed, 2026-09-29: `contenders()` is a list, and
dominance, elimination, points-at-deadline, scoring, the AI's target selection
(`hostile()`, `owner !== mine`) and `halfTurnsFor` all iterate it correctly.
`generateWorld` already takes a `playerCount`. `UnitTypeId`, `TechId` and
`BuildingId` are plain `string`, so no unions to widen.

### Two-side assumptions the compiler will find

Adding `'hivekin'` to `FactionId` produces exactly **eight** errors —
`FACTIONS`, `PALACE_CHASSIS`, the palace modules' `tiers` and `per`, perk names,
`REASONS` and `SHRUGS` in suggestions, and `VOICES` in talks — plus two in
`tools/` (`SIDE_NAME` and `ENDING` in `tech-tree.run.test.ts`).

### Two-side assumptions the compiler will not find

- **`otherFaction()`** is a coin flip (`id === 'orc' ? 'human' : 'orc'`). One
  call site, in `createGame`. Becomes a `rivals()` list.
- **Peace is global, not pairwise.** `atPeace(a, b)` checks only that both are
  contenders and that a single `state.diplomacy.peace` is running, so a
  Horde–Kingdom peace would silently make the Hivekin at peace with both the
  moment a third contender exists. **This is a live bug waiting on slice A**,
  and the "fought, not talked to" answer makes the fix cheap: gate `empires()`
  on whether a side talks at all.
- **`rival()` takes the first other living non-barbarian** — in
  `ai/diplomacy.ts`, in the talks chip in `main.ts`, and behind the advisors'
  `theirs` flag. With three sides, "they" is ambiguous.
- **The Orcpedia's roster is two tabs**, Yours and Theirs, with
  `other = faction === 'orc' ? 'human' : 'orc'`.
- **`hordeReport.ts`** titles itself on `faction === 'orc'`.
- **The sweep table is two columns** (`orcWins`/`humanWins`, `winner === 0|1`).

### Genuinely new systems

Only two, and both are in slice B:

1. **Sink has no precedent anywhere in the game.** Nothing is currently hidden
   from an enemy — the Sunken Legion *wades*, it does not hide. A unit on the
   board that enemies cannot see touches visibility, rendering, AI targeting,
   combat, and the one-unit-per-tile rule (can somebody walk onto a sunken
   Burrower?). This is the largest single item in the bible.
2. **Burrow through occupied tiles.** The pathfinder flatly refuses to enter
   enemy ground, and `ai.ts` carries a long comment about that having cost it
   every march it ever attempted. A move that passes *through* and may not land
   needs its own routine rather than a movement-cost tweak.

Plus the Queen, which is not conceptually new but has no precedent either:
nothing in the game is immobile (`move: 0` appears nowhere) and no city's
production currently depends on a unit standing in it.

---

## The slices

### Slice 0 — the siege documentation fix

Standalone, small, and first, so it is not tangled up in a faction.

Reported 2026-10-01: the Orcpedia never says that siege engines carry
ammunition. `abilityNotes()` reports the city multiplier, the two-tile strike,
the thrown axe, healing, breath, detonation, execution, regeneration and
crowding — and not one word about missiles. A player reading the Ballista card
cannot learn that it holds five, that it runs dry, or either way of reloading
it. The Goblin Catapult's rule, that it is reloaded by **eating a neighbouring
Goblin** (and that a group of three feeds it three shots), is one of the most
surprising rules in the game and is documented nowhere at all. There is also a
`Resupply` that refills the whole magazine beside one of your own cities for the
rest of the turn, likewise unmentioned.

Three notes in `abilityNotes()`, read off the data so they cannot drift: the
magazine size, the reload path (`'labour'` — a neighbour hands one over at the
cost of its whole turn; `'sacrifice'` — it eats that neighbour instead, a group
feeding it one shot per creature), and city resupply. Tests asserting the
Catapult's card says it eats its neighbours and the Ballista's does not.

### Slice A — the third seat exists — **DONE, measured**

Landed 2026-10-02 across three commits on `feat/hivekin-seat`. Everything in the
list below is built, 996 tests pass, and the two-sides-against-three sweep is the
only thing outstanding. Section 125 in `DESIGN_QUEUE.md` has the full account,
including the three bugs the probe found and the four fixtures that assumed two
seats. The one finding worth carrying forward on its own: **the first draw of a
fresh game is very nearly seed-independent**, because `state.rngState` starts as
`seed ^ 0x1d872b41` and one xorshift round does not mix the top bits that
`float()` reads. Left alone deliberately -- fixing it would change every seed's
worldgen -- but anything that wants one early roll should hash the seed instead.


Everything needed for a Hivekin game to run and be counted, and nothing with a
new mechanic in it. That is the whole point of the split: if the numbers move,
they moved for a reason that is in this list.

- `FactionId` gains `'hivekin'`; the eight compile errors; `otherFaction()`
  becomes `rivals()`.
- `FACTIONS.hivekin` — civName, leader, blurb, 24 Hive names, colour amber
  `#e08a2e`, checked on screen against the raiders' tan `#a8894e`. Generated to
  the bible's register for Jeremy to tweak, per his answer of 2026-10-01.
- The fourteen castes as data, with the stats and flags above.
- The tech fork, plus `tidecaste` onto `mapmaking`.
- The ending's three buildings; `VictoryKind` and `endingPart` gain `'hive'`;
  the third branch in `checkEndings`.
- The three follies.
- Six advisors — Bladeguard, Tender, Voice, Cultivator, Heir, Harvester —
  matching the six existing roles, at roughly eight lines each, written from the
  bible's samples. The Voice keeps the diplomacy role and uses it to explain
  that the Queen will not be talking, which is funnier than a table.
- **Peace made pairwise-safe.**
- Emergence: a seat appearing in the turn 90–120 window on unclaimed ground away
  from both empires, with a Grub and an escort. The wilds slot already proves a
  player can be added mid-game (`makePlayer(state.players.length)`), and
  `halfTurnsFor` already budgets for a seat that may not exist yet — section
  123 learned that one the hard way.
- The Queen spawned into the first Hive the moment it is founded, immobile.
- Dominance share as a function of seat count.
- Orcpedia: a third roster tab.
- `prepare_art.py` learns the `art_src/factions/hivekin/` layout, and everything
  already dropped is processed.
- Sweep: a third column; `tools/tech-tree.run.test.ts` extended.

**Measure A** at 216 games an arm — control is two sides, arm is three. Read the
**Horde-against-Kingdom split inside the three-way arm**, because that is the
stated balance target; the Hivekin's own win rate is information, not yet a
target. Section 123 established that 108 an arm can get the *sign* wrong, so 216
is the floor for anything that matters.

### Slice B — the castes do what they are for

- Sink, and the visibility concept it needs.
- Burrow, and its three upgrades (`burrower-veteran`, `burrower-deep`,
  `burrower-ambush`).
- The Queen's production dependency.
- The succession countdown — **5 turns is a placeholder**, not balanced.
- Princess conversion into a city bonus, with the choice made **at conversion**,
  which means the UI has to raise it then rather than at build time.
- Feral units and an abandoned Hive when the countdown expires with no Princess,
  reusing the existing barbarian system rather than adding one.
- The three terrain resources as ordinary flavoured specials.

**Measure B** against slice A as the control, so any shift is attributable to
one half or the other.

Landed 2026-10-03. The measurement said the two arms were **identical**, which
was not a null result but an instrument reading zero -- the AI never sinks and
never burrows because nothing teaches it to, and it had never built a Burrower
either. See `DESIGN_QUEUE.md`.

### Slice C — they have to be able to fight — **in progress**

Not planned as a slice. It is what three measurements in a row asked for: every
fix to how the Hivekin *arrive* bought them ground and none of it bought a win.

Done, each probed before it was swept:

- **A research plan of their own.** `PERSONALITIES[faction] ?? PERSONALITIES.orc`
  handed them the Horde's list, made entirely of advances they cannot have, so
  they never grew a caste. One Grub to a full roster; still 0 of 108 wins.
- **Siting the arrival by yield rather than emptiness.** `emergenceSpot` scored
  land count, so they founded on ground that could not feed them: 4.6 citizens
  against the empires' 9.7. Now 5.7, and site score 152 to 168.
- **A second founder.** 2.8 Hives to 3.5 and 17% of the world to 21%. Bought no
  win, and moved Horde against Kingdom nine points on both seed sets, which is
  deliberately left uncorrected for now.
- **The bar they will swing at**, `caution` 0.5 to 0.35. The one that was
  actually about fighting: with something standing next to them the best odds on
  offer average 0.44, so a bar of 0.5 declined eleven adjacent fights in twelve
  and they attacked eight times a game against the empires' hundred. Swept: the
  mechanism moved -- captures up and both empires' populations down on both seed
  sets -- and the win rate did not. Still 0 of 108.
- **The counting ladder, inverted** — Jeremy's answer of 2026-10-04 that he is
  not beholden to the first bible, which had the Hivekin refuse the game's
  oldest joke entirely. Five castes stack: Fodder `[1,2,3,5]`, Soldier
  `[1,2,3]`, Worker, Spitter and Elite `[1,2]`. The Queen and the Princess never
  will, because the whole faction is built on there being one of each.

  Nothing needed calibrating. **The Fodder-caste is the Goblin** — 1/1/10 at ten
  shields, to the last number — so it took the Goblin's ladder as it stands, and
  **the Soldier-caste is the Orc** at 3/2/12 for twenty, so it took three rungs
  of the Orc's seven.

  The tech half is where their version lives. The Horde's ladder is six
  advances and 590 beakers — *Let's Orc Together*, *Idiots Stick Together*, *The
  Next Level of Stupid*, *Beyond Stupid*, *Not Just Stupid Anymore*, *And
  Stupidity for All* — one painful realisation about numbers at a time. The Hive
  gets **two, at 120 beakers, each raising every shape at once**: *There Were
  Always This Many* and *You Had Assumed Fewer*. That is the better joke, since
  a hive never had to learn to count and being counted is something that happens
  *to* it — and it is the only affordable shape, because they research 11.8
  advances in a whole game and a six-advance ladder would be half of it. The
  same arithmetic that made their ending road unwalkable.

  No `coordination` advance, and they want none: every caste with a ladder moves
  one and `effectiveMove` floors at one, so the movement penalty that costs the
  Horde a point until it learns to walk in a line cannot reach them. Ten of them
  were always one thought.

  **No art needed.** Group sprites are composed by stamping the base creature N
  times, so the castes already drawn cover every rung.
- **A short road to their ending**, which is the one that finally produced a
  win. Thirty-eight of fifty-four games are decided by somebody finishing an
  ending; the Hive had built **no works in any game, ever**, because its road
  cost 860 beakers over eleven advances at 9.9 beakers a turn. Repricing was
  measured and does nothing -- their advances per game read 11.8 whatever it
  costs. `all-is-the-hive` now hangs off `caste-soldier` at 100 (165 over four
  advances), is asked for fifth of twenty-five, and its works cost 180/180/240
  against the other endings' 300/300/400. Probed at 4 wins in 12, every one an
  ending win; Jeremy chose this over a research mechanic on 2026-10-04.
  **Swept at 216: 0 of 108 to 27 of 108**, 16 of 54 tuned and 11 of 54 held-out,
  with portals and objects thinning to make room. Every one of the 27 is their
  own ending. An equal third would be 36 and they are at 27, which for a side
  arriving on turn a hundred is about right.

Still outstanding on this, and both are in `DESIGN_QUEUE.md`:

- **The garrison treadmill**, which is not a Hivekin problem. Half of every
  Hivekin soldier-turn and a third of each empire's goes on walking to one of
  its own undefended cities, and the branch that would make a unit *stay* in one
  has never fired in 77,000 turns because it cannot. Shared code, and the
  obvious repair is the one already measured as a disaster. **Jeremy's answer of
  2026-10-04: its own measured section after 125 closes**, since it changes all
  three sides and wants 216 games and both seed sets.
- **Teaching the AI to sink and burrow**, which is the other half of what makes
  them them and is currently inert.

---

## Still open

- **Queen countdown length.** 5 turns is the bible's placeholder.
- **Citizen weights.** Four kinds are specified (see `ART_PROMPTS.md`); the
  weights default to 4 / 4 / 2 / 1 unless Jeremy says otherwise.
- **Upgrade lines for the other castes.** Only the Burrower's is specified. The
  rest want the same linear-plus-two-branch treatment eventually — and when they
  arrive, the question of whether two branches may be taken together is worth
  asking per caste rather than globally. It was answered "both" for the
  Burrower's on the grounds that its two branches do not compete with anything
  outside itself.
- **Biomass as a fifth resource** was floated and the bible assumes it away, in
  favour of the ordinary shields/gold/beakers/happiness four. Taken as settled
  unless Jeremy revisits it.
- **Playing as the Hivekin from turn one** rather than only emerging as a third
  side. Out of scope here; the bible's "Queen is a starting unit" language was
  written for that world, and decision 10 reinterprets it for this one.

## Two stale lines in the bible

Harmless, noted so a later reader is not confused: the summary tech table omits
`caste-riptide` and `caste-bloat`, and the "Not yet covered" note at the end
still says `oldQueensShell` is not attached to an advance, which the Follies
section above it has since fixed.


## Section 136: priced for the time they have had

Section 125 priced the Hive's ending at six hundred shields against the other
two endings' thousand, for a stated and correct reason: *"the thing it is paid
out of: 3.5 Hives of 5.5 citizens, where an empire pays out of six cities of
eight."* That is the right price for a side that does not exist until turn
ninety.

It is the wrong price for one that has been there all along, and the question
of making the Hivekin playable is exactly that question. Measured first, over
108 games, three arms -- today's three-sided game, a two-sided baseline with
emergence off, and a Hive in seat 0 from turn one:

```
                  before repricing        after
today        7/18 (39%)  238 turns   7/18 (39%)  238 turns
two sides   11/18 (61%)  235 turns  11/18 (61%)  235 turns
hive        13/18 (72%)  152 turns  11/18 (61%)  186 turns
---
today        7/18 (39%)  218 turns   7/18 (39%)  218 turns
two sides   12/18 (67%)  224 turns  12/18 (67%)  224 turns
hive        17/18 (94%)  130 turns  11/18 (61%)  185 turns
```

Read `hive` against `two sides`: both are two contenders, and seat 0's
empirical share there is 64% rather than the 50% one would assume, because that
seat keeps the player's side of the difficulty. A turn-one Hive took **83%**
and finished in 141 turns. After the repricing it takes **61%** against that
64% -- three points under, which is as close to "the same side as anybody else"
as a number gets.

**The anchors were both facts, which is why it landed first time.** A Hive that
arrives when section 125 says it arrives pays what section 125 measured; a Hive
with the whole game pays what an empire pays. The price interpolates on
`joinedAt` between those two, so every game ever measured is unchanged by
construction and the new case is anchored to the other endings rather than to a
guess.

The endings column is the other half of it. Before: ten of thirteen wins and
thirteen of seventeen were the Hive's own ending, at 130-152 turns. After:
eight of eleven and seven of eleven, at 185-186, mixed with conquest, points
and -- in one arm -- five portals. They still finish about forty turns faster
than two empires do, which is what being a Hive is for.

### And a staggered arrival, which this makes possible

`DifficultyDef.hiveArrives` shifts the whole window: +60 on A Picnic, +30 on A
Skirmish, zero on A War, -25 on A Crusade, -60 on Doom. Jeremy: *"later is
easier, same time is harder."*

It is a good dial because it changes **how much of the game you get to
yourself** rather than any number you are playing against -- and it only works
because the ending is priced off arrival. Without that, an early Hive would
simply be a free win, which is precisely what the 94% above was.

### And they are in the picker

The paragraph that stood here said a playable Hive forces a two-contender game,
so either that is the Hivekin game or something else has to come out of the
ground -- "a new faction's worth of design rather than a flag". That was wrong,
and checking it took thirty seconds: `generateWorld(seed, settings, 2)` has
always taken a player count, and the two was how many seats there were rather
than a constraint.

**Seat 0 is on the map because it is seat 0.** The rivals are whoever would
ordinarily start, which for a Hive is both empires. Three contenders either
way, no new faction, and an empire's game untouched by construction.

`startsOnMap` was answering two questions -- does this side exist before
somebody digs it up, and does the menu offer it -- and reading the second off
the first is what made this look like a design problem. Split into
`startsOnMap` and `playable`.

Measured in the shape that now exists, three contenders on both sides of the
comparison:

```
today  (empire seat)   7/18 (39%)  238 turns      7/18 (39%)  218 turns
hive   (Hive seat)     6/18 (33%)  215 turns      7/18 (39%)  210 turns
```

Thirty-six per cent pooled against thirty-nine, where an even share of three is
thirty-three. The held-out set is exact. **The Hivekin are a playable side at
the same strength as an empire**, and the repricing anchored on an empire's
thousand shields turned out to be right for the three-sided game as well as the
two-sided one it was measured in -- which was the open risk and is now closed.

They hold fewer towns doing it: 4.2 and 3.6 against an empire seat's 6.1 and
5.2. Fewer, smaller, and just as likely to win, which is the whole of what the
Hive was supposed to be.
