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
| `caste-elite` | 85 | caste-soldier | Elite-caste |
| `caste-broodlord` | 130 | caste-elite | Broodlord-caste, + The Broodwarmth |
| `caste-warden` | 140 | caste-elite, hammers-of-glory | Warden-caste |
| `caste-princess` | 110 | caste-elite, happiness | Princess-caste, + The Old Queen's Shell |
| `all-is-the-hive` | 200 | caste-princess, insanity | The ending's three works |

`tidecaste` is added to the shared `mapmaking` advance's `units` list, which is
how `raft` and `barge` already work — the per-faction filter happens where units
are offered.

### The one number that needs measuring, not guessing

The ending roads, computed from the actual tree:

| Side | Beakers to the ending advance | Works priced at |
|---|---|---|
| Horde | **430** | 300 / 300 / 400 |
| Kingdom | **965** | 360 / 360 / 480 |
| Hivekin as written | **860** | 300 / 300 / 400 |

So the Hivekin get essentially the Kingdom's long road to the Horde's cheap
works — a combination neither side has ever been measured at. Section 110 priced
the Kingdom's works a fifth higher *because* its Object was landing nearly three
times as often as the Portal despite the longer road, since the Kingdom
researches faster. Which way the Hivekin fall out depends on their research rate
and nothing else will tell us. This is the first dial to turn if the ending
lands too often or never.

---

## The ending: The Second Queen's Shell

Section 110's shape exactly — two lesser works buildable independently once
`all-is-the-hive` is researched, then the final work, which only becomes
buildable in a Hive already holding one of the two, once both stand somewhere.

| id | Cost | Kind |
|---|---|---|
| `moltingChamber` | 300 | `endingPart: 'hive'` |
| `secondFeeding` | 300 | `endingPart: 'hive'` |
| `secondQueenShell` | 400 | `victory: 'hive'` |

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

### Slice A — the third seat exists

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

---

## Still open

- **Queen countdown length.** 5 turns is the bible's placeholder.
- **Citizen weights.** Four kinds are specified (see `ART_PROMPTS.md`); the
  weights default to 4 / 4 / 2 / 1 unless Jeremy says otherwise.
- **Upgrade lines for the other castes.** Only the Burrower's is specified. The
  rest want the same linear-plus-two-branch treatment eventually.
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
