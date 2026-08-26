# Design Queue

Agreed but not yet built, with enough mechanical detail to implement without
re-deciding anything. Nothing here is in the game yet.

---

## 1. Special unit capabilities

The big one. Turns units from "numbers that collide" into things with behaviour, and
gives health a reason to exist between fights.

### Ordering — build it in this sequence

Each step is shippable on its own, and the later ones depend on machinery the earlier
ones introduce.

| # | Feature | Needs |
|---|---|---|
| 1 | Regeneration | nothing new |
| 2 | Troll regeneration | (1) |
| 3 | Sapper death blast | a hook in `destroyUnit` |
| 4 | Ranged attack | ~~target-select mode~~ — **done** |
| 5 | Axethrower disarm | ~~(4), plus a new `Unit` field~~ — **done**, `SAVE_VERSION` now 2 |
| 6 | Death Knight execution | nothing new |
| 7 | Dragon line attack | ~~(4)~~ — **done** (needed no target select in the end) |
| 8 | Paladin heal | ~~(4), plus friendly targeting~~ — **done** |

~~**Steps 4–8 all hang off one piece of UI that does not exist yet:**~~ **Built.**
`src/sim/abilities.ts` holds the rules and `arm`/`disarm`/`clickWhileArmed` in
`main.ts` hold the mode. Ranged (4) and heal (8) are in and playable; 5 and 7 are now
small, as predicted.

What the mode does, for whatever plugs in next: `abilitiesOf` says what a unit could
ever do, `abilityReady` says why it cannot right now, `abilityTargets` returns the
legal targets **filtered by what the acting player can see**, and `useAbility`
re-checks all of it before changing anything. Adding an ability means a new entry in
`ABILITIES`, a branch in `abilityTargets`, and a resolver — no UI work.

### 1.1 Regeneration — all units

Replaces the current heal rules in `sim/turn.ts`, which only heal in cities or when
fortified.

| Situation | Recovered per turn |
|---|---|
| Moved or attacked this turn | 5% of max |
| Sentry | 8% |
| Fortified | 15% |
| In a friendly city | 33% |
| In a friendly city with Barracks | 100% |

Always at least 1 HP, never above max. Take the best applicable rate rather than
stacking them.

**Why this matters more than it looks:** a damaged unit currently has no way back
except a long walk home, so a scratched Ten Orcs is permanently devalued. Regeneration
makes withdrawing a real tactic and gives fortify a use beyond the defence bonus.

### 1.2 Trolls regenerate faster

Troll regeneration is doubled in every row above. Add `regenMultiplier?: number` to
`CreatureDef`, defaulting to 1; troll gets 2.

Note this is per *unit*, so Three Trolls regenerate 2× as a unit — consistent with
everything else, since the group is one unit.

### 1.3 Sapper — dies loudly

- Drop sapper attack from 3 to **1**. It is not a fighter.
- Keep defence 1 and the glass jaw.
- **When a sapper is destroyed *while defending*, it detonates**: every unit on the
  eight surrounding tiles takes 40% of its own maximum health as damage, friend or
  enemy alike, including the attacker.
- Detonation does not chain — a sapper killed *by* a blast does not itself explode, or
  a line of sappers wipes a continent.
- Sappers killed while attacking do not detonate. The joke is that you cannot aim it.

Implement as a hook in `destroyUnit`, which already exists and is the only place units
leave the board.

### 1.4 Ranged attack — mage, archer, axethrower, ballista

- Attack a unit **exactly 2 tiles away** (Chebyshev), no adjacency needed.
- **Consumes all remaining movement**, and requires at least 1 to start.
- The defender **does not strike back**. This is the whole point of ranged.
- Damage is one combat round's worth rather than a fight to the death: attacker
  strength versus defender strength as now, but resolve a fixed 3 rounds and stop.
- Cannot capture a city — killing the last defender leaves the tile empty for someone
  else to walk into.
- Add `range?: number` to `CreatureDef` (default 1).

### 1.5 Axethrower — one axe

- A ranged throw from an axethrower hits at **1.5× attack**.
- Afterwards the unit is **disarmed**: attack drops to 25% until it recovers.
- Recovery happens by either **entering a friendly city** or **killing an enemy unit**
  (picking the axe back up off the corpse).
- Needs a new `disarmed: boolean` on `Unit` → **bumps `SAVE_VERSION` to 2.**
- Show it plainly in the readout and as a badge on the map sprite; a player who cannot
  see this state will think the unit is bugged.

### 1.6 Death Knight — execution

When attacking, if the defender is below **50% health**, roll a **30% chance** to
destroy it outright instead of fighting.

Restrict "weaker" to *defender's max HP ≤ attacker's max HP*, so a Death Knight cannot
delete Ten Orcs by catching them wounded. Without that guard this is the strongest
ability in the game by a wide margin.

### 1.7 Dragon — breath in a line

- Attacking hits the target **and the tile directly beyond it**, along the same
  direction.
- The second unit takes 60% of the damage the first did.
- Hits friendly units in the second tile too. Positioning matters.
- Already has `flies` and ignores terrain cost, so nothing to change there.

### 1.8 Paladin — field medicine

- Target a **friendly unit within 1 tile**, consuming all movement.
- `paladin` heals to **50%** of maximum, or does nothing if already above it.
- `paladin_x2` heals to **100%**.
- Cannot heal itself.

The first genuinely non-combat action in the game, and the one that most needs the
target-select UI to be friendly-aware.

---

## 2. Sound effects still needed

Current mapping is in `src/audio/audio.ts`. Twenty effects are wired, all combat.

### Needed by the abilities above

| Cue | Notes |
|---|---|
| **Explosion** | For the sapper. **There is nothing close in the current set** — this is the one real gap. Wants a deep body-hit boom, not a firework. |
| Heal | Already have it: `coghezzi-holy-healing-spell`, currently used as the paladin's *attack*. Move it to the heal and give the paladin a sword hit. |
| Execution | `yodguard-casting-magic-4` (currently the Death Knight attack) works as-is. |
| Ranged release | Covered: arrow swish, axe whoosh, magic whoosh, ballista. |

### Missing regardless of the abilities

The game currently makes **no sound at all outside combat**, which is the bigger gap.
In rough priority:

1. **Advance discovered** — a short bright chime. The single most satisfying moment in
   a 4X and it is currently silent.
2. **City founded** — a settling thud with a little fanfare.
3. **Production completed** — a soft anvil or bell, distinct from (1).
4. **City grows** — a quiet positive blip.
5. **Blocked / invalid action** — a dull thunk. There is a `flash()` message but
   nothing audible, so mis-clicks feel unresponsive.
6. **Turn begins** — a soft drum, easy to overdo; make it very quiet or optional.
7. **City lost / captured** — currently reuses a sword clash. Deserves something
   bleaker.

All royalty-free, all short. Filenames stay as downloaded; map them in `audio.ts`.

---

## 3. Rebalancing

### Resolved: the orcs were winning 78% of games

Eighteen seeds of AI-vs-AI found the orcs taking **14 of 18** while *behind* on both
advances and units. Three things turned out to be involved, and it is worth recording
which of them mattered, because the first guess was wrong.

**1. The scoring formula (fixed, changed nothing).** It paid a flat 10 points per city
on top of population, so planting a settlement and never developing it was worth 13
points. That is a genuine design flaw and is now gone — the formula is
`population × 4 + advances × 6 + buildings × 4`, and buildings count at all for the
first time. But measured on the same eighteen seeds it produced **identical results**:
still 14–4, the same winner in every game. The flat term was worth about 6 points to
the orcs; their real lead was population, worth about 44. Fixing it was right, but it
was not the cause.

**2. Rioting cities kept growing (the actual bug).** `cityYield` zeroed shields and
trade during disorder but returned food in full, so a city past its content limit grew
forever while producing nothing. Content limits are 5–6 and the AI never built a totem
or chapel, yet average city size was 7.9–9.1: most cities in a typical game were
permanently rioting. Fixing that lifted advance counts (17.7 → 20.5) and finally put
the **deep end of the counting ladder in reach** — ×8 and ×10 units now appear, which
they never did before.

It also made the imbalance *worse* — orcs went to 4–0, leading on every metric — which
was the useful part, because it isolated the cause.

**3. The human AI was the problem all along** — and specifically one number in it.
`caution` is how good the odds must look before the AI will attack. At 0.6 the Kingdom
declined fights it would have won, and the Horde picked it apart a unit at a time.

Swept over 18 seeds each:

| `caution` | wins (orc–human) | orc pop | human pop |
|---|---|---|---|
| 0.60 | 14–4 | 74.9 | 60.4 |
| 0.52 | 12–6 | 54.1 | 53.4 |
| **0.48** | **10–8** | **51.9** | **53.8** |
| 0.45 | 7–11 | 48.5 | 63.5 |

Settled at **0.48**: wins 10–8, populations within 4%, cities 8.2 / 8.6. Each side
leads a different column — orcs on advances (23.6 vs 21.5), humans on army size
(52.3 vs 42.5) — which is the intended shape of the two factions.

`garrisonPerCity` turned out to be a red herring: 1 and 2 gave *identical* 7–11 splits
at caution 0.45, so it was left at 2, which suits the Kingdom's character.

**The lesson worth keeping:** the win column pointed at the factions, the metrics
pointed at the score, and the cause was neither. Always check whether a fix actually
moved the number before believing it.

### Still open: nearly every game reaches the turn limit

Even now, essentially all games run to turn 300 and are decided on points rather than
conquest. That remains the largest structural problem — see below.

### The ladder costs are lopsided, and it is not obvious which way

### The ladder costs are lopsided, and it is not obvious which way

Reaching the ×10 unit costs:

- **Orcs:** 25 + 40 + 60 + 85 + 105 + 132 + 168 = **615 beakers** across 7 advances.
- **Humans:** 30 + 55 + 88 + 128 = **301 beakers** across 4 advances.

Humans reach the top of their ladder for **less than half** the research. That is a
real, structural human advantage that the AI is currently too passive to exploit.

It is also arguably *correct*: orcs being slow to learn to count is the entire joke,
and the orc ×10 is an offensive unit (attack 30 / defence 20) where the human ×10 is
defensive (attack 20 / defence 30). But it should be a deliberate choice, not an
accident — and if it stays, the orcs need something back for those extra 314 beakers.

### Candidate levers, cheapest first

1. **Human AI caution 0.6 → 0.45.** It currently declines fights it would win. Likely
   the single biggest factor in observed win rates, and a one-number change.
2. **Human `garrisonPerCity` 2 → 1 once Walls are built.** Two units per city ties up
   most of the human army doing nothing.
3. **Give orcs something for the longer ladder** — the cleanest option is a small
   flat bonus on the orc counting techs (a free unit, or shields) rather than making
   the human ladder more expensive, which would blunt their joke.
4. **Intermediate human rungs** (×4, ×6, ×8) to match the orc granularity. More work,
   more content, and makes the two trees feel less distinct — probably the wrong call.

### Measuring it again

```bash
BALANCE_SEEDS=18 npx vitest run tests/balance.test.ts --reporter=verbose
```

The report now prints population, the win split, and how many games reached the turn
limit — that last number is the one to watch, because while it stays near 100% the
score formula is deciding the game and faction tuning is close to pointless.

---

## 4. Fortification, resolved — and what it left behind

The orcs no longer get walls at all. Walls are human-only; **Wall Building** now yields
a **Broken Catapult** for the Horde instead, which gives no defensive bonus whatsoever
and doubles the attack of any unit attacking *out of* the city.

> *This would have been a marvellous ranged weapon if anybody here understood wheels.
> As it stands, everyone gets very worked up and runs out to fight instead, which turns
> out to work.*

Both factions research the same advance and get the thing they are capable of, which
is the joke the whole tech tree is built on. Mechanically it makes an orc city
dangerous to stand next to rather than hard to get into — you cannot starve them out
behind a wall, because there is no wall and they are coming out.

### Answered: why the Kingdom finishes with more cities

The premise was wrong, and so was the first round of measurement.

Counting foundings and captures **from the log undercounts badly**: `log()` keeps only
the last 400 entries, so over a 300-turn game most of the history has already been
discarded. Every capture figure quoted before this — 5.5, then 9.4, then 11.4 per game
— was a floor, not a total. Counting properly, by diffing city ownership every
half-turn:

| | founded | captured | lost | final |
|---|---|---|---|---|
| orc | 11.7 | 18.8 | 21.5 | 9.0 |
| human | 9.8 | 21.5 | 18.8 | 12.5 |

Three things fall out of that.

**Neither side over-expands.** The orcs actually found *more* cities than the humans.
`targetCities` is respected at every instant — what happens is that both sides keep
*losing* cities and re-founding, twenty-odd times a game each, so the number founded
over a whole game bears no relation to the target at any moment in it.

**Cities change hands about 40 times per game.** Conquest is not failing; it is
happening constantly. The map is a meat grinder.

**The Kingdom's extra cities are entirely a combat margin.** It captures 21.5 and loses
18.8; the Horde captures 18.8 and loses 21.5. The +2.7 swing is exactly the difference
in final city count. Nothing to do with expansion behaviour at all.

### Answered: it was the garrison, working backwards

Two hypotheses, both wrong, and the second was wrong in an interesting way.

**Walls were not it.** Giving the Broken Catapult a x1.35 defensive bonus changed
nothing at all (cities 8.3→7.9, wins 5–7 either way). The Horde was not losing the
exchange for want of fortification.

**The garrison was it, in reverse.** The guess was that the Kingdom held its cities
because it kept two defenders on each and the Horde kept one. Raising the Horde to two
made it *dramatically worse* — cities 7.9→5.6, population 46.8→29.0, wins 5–7→2–10.
Setting both to one produced the best balance yet.

| orc / human garrison | orc cities | human cities | orc pop | human pop | wins |
|---|---|---|---|---|---|
| 1 / 2 | 7.9 | 12.0 | 46.8 | 68.3 | 5–7 |
| 2 / 2 | 5.6 | 11.3 | 29.0 | 66.8 | 2–10 |
| **1 / 1** | **9.9** | **8.5** | **56.8** | **52.7** | **7–5** |

**The mechanism is an interaction with `caution`.** A cautious AI was never going to
attack with those units, so posting them on a wall is free defence. An aggressive one
is spending its entire army on the offensive, and every unit told to stand still is a
city not taken. The same setting is a gain for one personality and a tax on the other.

That is worth remembering before touching either dial again: **`garrisonPerCity` and
`caution` cannot be tuned independently.**

At 1/1 over 18 seeds the game comes out **9–9**, with each side leading the columns it
should — the Kingdom on cities (10.6 v 8.9) and population (64.1 v 49.5), the Horde on
advances (25.2 v 21.7). The scoring formula nets those against each other, which is
exactly what it is for.

### And it reframes the turn-limit problem

Around fifty city changes per game. The war is not stalled — it is close to
*reciprocal*, both sides taking cities at nearly the rate they lose them, so little
compounds into a collapse.

It is no longer absolute, though: at garrison 1/1, **3 of 18 games ended by conquest**
rather than on points, where previously it was none. Fewer defenders means cities fall
faster than they can be replaced, at least sometimes. Pushing further in that direction
— rather than raising the turn limit — is the thing most likely to make conquest a
normal way for a game to end.

## 4a. Effect animations

The art is processed (`public/effects/`, ten strips) and the playback layer exists
(`src/render/effects.ts`, wired into the frame loop). What is left is the wiring that
decides *when* one plays.

The natural seam is the one the audio already uses: `LogEntry.cue`, drained by
`playLogCues` after the AI has moved, so events from another player's turn are seen
and not just the viewer's own. Audio does not care where a thing happened, though, and
an animation does — so this needs a position on the log entry as well, `at?: [x, y]`,
set where combat, capture and demolition are logged. That keeps `sim/` free of any
render import, exactly as `cue` does today.

Two things a first pass will get wrong:

- **Effects must be gated on visibility.** The layer happily draws over unexplored
  black, so an explosion in fog would announce where an enemy is — the same class of
  leak as the pathfinder using the true board instead of the player's map.
- **A batch arrives at once.** Ten fights resolved during an AI turn would all play on
  the same frame. `spawn` takes a `delay` for this; the drain should stagger them.

## 4b. Why the Kingdom keeps what it takes — measured

**Answered in part, and the remaining part is not what was expected.**

### It is retention, and only retention

Eighteen seeds, tracking every city's ownership turn by turn rather than reading a
combined churn figure:

| | took | kept to the end | median hold | founded | final |
|---|---|---|---|---|---|
| Horde | 23.8 | 5.6 | **14.1 turns** | **11.7** | 8.4 |
| Kingdom | 27.1 | 9.6 | **30.9 turns** | 9.3 | 12.7 |

Three things this kills off:

- **Expansion is not the problem.** The Horde founds *more* cities, 11.7 to 9.3.
- **Capture rate is not the problem.** A 14% edge cannot make a 4.3-city gap.
- **Retention is the whole of it.** The gap in cities kept to the end is 4.0 against a
  final gap of 4.3. Nothing else needs to be invoked.

Also worth keeping: 15.2 distinct cities are ever conquered across 50.9 changes of
hands, about 3.3 changes each. That is not a front moving, it is a see-saw over the
same handful of tiles — the same fact underneath the turn-limit problem in 3.

### Swapping `caution` answers half of it

A controlled swap: give the Horde the Kingdom's 0.48 and the Kingdom the Horde's 0.25.

| | median hold, control | median hold, swapped |
|---|---|---|
| Horde | 14.1 | **22.3** |
| Kingdom | 30.9 | **29.8** |

- **The Horde's half follows the number.** Made cautious, it holds cities 58% longer.
  So `caution` genuinely drives how long the Horde keeps a city.
- **The Kingdom's half does not.** Made reckless, it still holds for ~30 turns. Its
  retention advantage is **faction-intrinsic and still unexplained** — not caution,
  and not anything tuned so far.

### The part that does not add up yet

Wins went 7–11 to **9–9** on the swap, but final city counts barely moved (Horde 8.4
to 8.6, Kingdom 12.7 to 12.4). So the win swing did **not** come through city count,
and therefore came through population, advances or buildings — none of which this
measurement collected. **Do not treat 9–9 as a fix until that is measured.** It is
exactly the shape of the four hypotheses that were already wrong: a number that moved
in the right direction for a reason nobody has established.

### Next, in order

1. Re-run the swap collecting population, advances and buildings, and find where the
   9–9 actually comes from. Until then the mechanism is unknown.
2. Find what makes a Kingdom-held city hard to retake independently of caution.
   Candidates not yet separated: Walls (human-only, and captured cities keep them),
   defender unit stats, and which advances each side reaches first.
3. Only then decide whether to raise the Horde's `caution`. Note the design cost:
   0.48 makes the Horde play carefully, which is backwards for the faction whose whole
   joke is that it does not think things through. A fix that wins on the numbers and
   loses the character is not obviously the right trade — worth asking before taking.

## 4c. Unit-driven buildings: measured, and balance-neutral

Built and tested as a balance lever. **It is not one.** Eighteen seeds, three arms:

| arm | wins | orc score | human score |
|---|---|---|---|
| flat 50%, no condition | 7 – 11 | 378.9 | 546.4 |
| doubled + gated, both sides | 6 – 12 | 359.7 | 559.8 |
| doubled + gated, Horde only | 6 – 12 | 373.8 | 554.6 |

One win in eighteen is noise, so the honest reading is **no measurable effect either
way**. Keep it for the flavour — the Goblin Treasury's blurb finally describes a real
rule — but it is not a lever and should not be tuned as one.

The reason is structural and was visible before the run: the AI's garrison logic
governs *production* (whether to build a defender), not whether a unit stays put.
Units leave whenever odds beat `caution`. A reward for garrisoning that the AI cannot
perceive changes outcomes by a rounding error.

## 4d. The score gap is population, and gold is a dead resource

The three-arm run collected the score breakdown that every previous measurement
missed. Taking the unmodified arm:

| | population | advances | buildings | total |
|---|---|---|---|---|
| Horde | 186.8 | 146.4 | 45.2 | 378.9 |
| Kingdom | 323.6 | 143.4 | 79.2 | 546.4 |

**Population is 82% of the gap** (136.8 of 167.5). Research is level — the Horde is
marginally *ahead*. Buildings are the rest. Everything therefore reduces to cities
held and how big they grow, which is the retention finding in 4b restated in points.

### Gold buys nothing, and the Horde has the most of it

Final treasuries: **Horde 475.6, Kingdom 189.6.**

There is no rush-buy, no hurry-production, no sink of any kind. Grep for
`player.gold -=` and there are no hits: gold's only use is covering building upkeep,
and a bankruptcy path that sells a building off. `taxRate` defaults to 4 of 10 and no
AI ever changes it.

So roughly half a thousand gold per game is trade converted into a number that does
nothing at all, and the Horde accumulates two and a half times as much of it. The
Kingdom's is lower precisely because it *spends*: 19.8 buildings at 1g upkeep against
the Horde's 11.3, and those buildings are worth 4 points each.

**This is the most promising lever left, and it is a mechanic rather than an AI
constant.** Giving gold something to buy — rush-buying production is the obvious
candidate — turns the Horde's dead 476 into buildings or units. It needs measuring
like everything else, but unlike `caution` it does not cost the faction its character:
an orc spending a hoard on getting something built *now* is entirely in keeping.

## 4e. Rush-buying: measured, and actively harmful to the AI

Gold now buys production. As a *feature* this is right -- gold previously had no
sink at all and the Horde banked ~476 a game into nothing. As a **balance lever it is
the worst thing tried all session.**

| arm | wins |
|---|---|
| AI never spends | 6 – 12 |
| reserve 60, cheapest first | 5 – 13 |
| reserve 400, cheapest first | **2 – 16** |
| reserve 400, buildings first | **1 – 17** |

The better the AI got at spending, the worse the Horde did. A six-seed probe had
suggested the opposite, on the strength of the Horde's building count alone (12.2
against 9.8) -- which was true and irrelevant, because over the same arms the Kingdom
went from 12.7 cities to 14.1 and from 83.5 population to 89.2.

**AI rush-buying is off** (`AI_TUNING.rushBuying`). The mechanic stays for the human
player, and the switch is left in place to re-measure if the city gap ever closes.

### The general lesson, which retires a class of ideas

Rush-buying scales with **how many cities you have to spend it in.** The Kingdom has
roughly twice as many, so it gets roughly twice the benefit. The mechanic amplified
the very gap it was meant to close.

That is the same reason the unit-driven buildings did nothing (4c): a per-city bonus
paid to a side with more cities cannot close a city-count deficit. Both ideas failed
for one structural reason, and it generalises:

> **Any per-city mechanic amplifies a city-count lead rather than closing it.**

So the remaining levers are the ones that are *not* per-city:

- **Per-unit**: the Horde fields fewer units too (30 against 76), so this is no better.
- **Flat, per-player**: a fixed bonus regardless of size — untried, and the only
  category that does not scale with the lead.
- **Retention itself**: make a Horde-held city harder to take back, which attacks the
  cause rather than compensating for it. Still the most direct route, and 4b's
  unexplained half — why a Kingdom city survives ~30 turns and a Horde one ~14
  regardless of `caution` — remains the thing to find out.

## 4f. Walls are innocent — and 96% of captures are walk-ins

Walls were the strongest remaining suspect: human-only, kept on capture, so the
Kingdom can add defence to anything it holds while the Horde can only inherit it.
Three arms — as shipped, buildable by both, and standing-but-inert — came back
**byte-identical across all three.** Not similar: identical, meaning no decision
anywhere in any game was affected.

The plumbing was checked before the null was believed (defence 9 with walls, 4.5
inert), so the result is real. The explanation is the finding:

> **Over four games, 237 cities changed hands. 9 of them (4%) were taken from a
> defended city. 228 (96%) were walked into empty.**

A walled city changed hands 3 times in an entire game. Walls cannot matter, because
defence almost never happens: cities are not besieged, they are *found unattended*.

### What this retires

Every defensive lever tried or contemplated, all at once. Walls, the Broken Catapult,
regeneration, terrain, unit defence stats, veterancy — none of them can move retention,
because 96% of the time there is nobody standing there for them to apply to. It also
explains 4b's stubborn half: `caution` changed the Horde's hold time because a cautious
AI leaves units at home, and the Kingdom held on regardless because it simply has more
units (76 to 30) and therefore more cities with somebody in them.

### What is actually left

The war is a see-saw of undefended cities, and the only things that can change that:

1. **Make an empty city not free.** A city that resists on its own — militia, a turn
   spent taking it, population-scaled defence — changes the nature of the war rather
   than adding another bonus nobody is present to receive.
2. **Make units stay.** `garrisonPerCity` is a *production* target, not a standing
   order: it builds a defender when the garrison is short, and that defender then walks
   off to attack. Nothing keeps anyone at home.

Both are mechanics rather than AI constants. (1) is the more interesting and the more
in keeping — an orc city that shrugs off a lone footman is funnier than one with a wall.

## 4g. Empty cities now cost something — measured

Two mechanics, in response to the 96% walk-in finding.

**The citizens fight.** An ungarrisoned city defends at 0.3 per citizen over three
rounds. It cannot hold off an army — Ten Orcs walk in every time — but a lone goblin
no longer annexes a town of eight for free.

**Sacking scales with who turned up.** Up to three citizens and three buildings,
by attacker strength, instead of one of each. Walls still survive, since levelling
them was what caused the original see-saw.

### The militia sweep, eighteen seeds

| toll | wins | changes of hands | orc median hold |
|---|---|---|---|
| 0 | **8 – 10** | 45.8 | 21.3 |
| 0.3 | 5 – 13 | **37.1** | **37.2** |
| 0.6 | 5 – 13 | 42.5 | 34.3 |
| 1.0 | 5 – 13 | 40.2 | 32.4 |

It does exactly what it was built to do: a captured city's median tenure goes from 21
turns to 37 and the see-saw slows markedly. And **it costs three wins**, consistently,
at every non-zero setting — because making cities sticky helps whoever already holds
more of them. That is the per-city lesson from 4e again, in a new coat.

Kept at **0.3** regardless: it does the most good of the three settings for the same
cost, and a game where 96% of cities are taken by walking into them unopposed is a
worse game than one three wins out of eighteen off level. The balance is better
attacked somewhere that is not defensive.

### Sacking, measured properly: it does nothing

The 8-10 control arm looked like sacking had helped, and it was flagged at the time as
suggestive rather than established. It was noise. Militia held at 0.3, sack cap swept:

| sack cap | wins | orc score | human score |
|---|---|---|---|
| 1 (as it was) | 4 – 14 | 324.0 | 558.3 |
| 2 | 5 – 13 | 335.4 | 555.4 |
| 3 (as built) | 5 – 13 | 318.8 | 564.8 |
| 5 | 5 – 13 | 316.8 | 561.4 |

Flat across a fivefold change in severity. **Sacking is balance-neutral**, and the
earlier two-win difference was eighteen seeds being eighteen seeds. Kept for flavour
and for the turn-limit problem — a sacked city is worth less to flip — but it is not
a lever.

So the balance now sits at **5-13**, against roughly 7-11 before this section. The
militia bought a much better game for two or three wins, and those wins have to come
back from somewhere that is neither per-city nor defensive.

## 4h. Supply lines — the first lever that worked

Supply drawn from the **capital plus built outposts**, so the base network does not
scale with empire size. Eighteen seeds:

| arm | wins | orc score | human score | orc cities | human cities |
|---|---|---|---|---|---|
| off | 5 – 13 | 318.8 | 564.8 | 5.9 | 13.7 |
| range 6, ×0.75 | 5 – 13 | 352.1 | 565.0 | 6.8 | 13.8 |
| **range 4, ×0.6** | **6 – 12** | **425.1** | **477.2** | **10.1** | **10.4** |
| range 3, ×0.45 | 7 – 11 | 357.0 | 528.8 | 7.3 | 12.8 |

At range 4 the **city gap closes almost completely — 10.1 against 10.4**, from 5.9
against 13.7. The score gap goes from 246 points to 52, a 79% reduction. Nothing else
tried this session moved the structural numbers at all, let alone that far.

Why this one and not the others: it is the first lever that was neither per-city nor
defensive. Supply from one capital is identical for both sides regardless of how much
either owns, and extending it costs shields in a building a sacking destroys. It
punishes over-extension, which is what the Horde does, and rewards consolidating,
which is what it fails to do.

### What it did not fix

**Wins moved much less than the scores: 5-13 to 6-12.** A mean score gap of 52 still
resolves to the Kingdom winning most games, so the variance is doing the work. The
harsher arm gets 7-11 with a *wider* mean gap, which says the same thing from the
other side.

It also made the turn-limit problem worse -- changes of hands up from 37.1 to 47.7,
and only 1 of 18 games decided before turn 300. Supply lets an army push, and pushing
flips cities.

### The finer sweep, and a correction

Separating the two dimensions produced an alarming shape. The control reproduced
exactly, and every neighbour was far worse:

| arm | mean score gap |
|---|---|
| range 3, ×0.6 | 205.0 |
| range 4, ×0.45 | 194.3 |
| **range 4, ×0.6** | **52.1** |
| range 4, ×0.75 | 193.2 |
| range 5, ×0.45 | 130.1 |
| range 5, ×0.6 | 214.0 |

A real mechanism varies smoothly. An isolated spike ringed by flat neighbours is what
fitting to the sample looks like — so the same setting was run on a **completely
different eighteen seeds**:

| | gap, seed set A | gap, seed set B |
|---|---|---|
| off | 246 | 170 |
| range 4, ×0.6 | **52** | **96** |
| wins | 5-13 → 6-12 | 5-13 → 7-11 |

**The effect is real, and roughly half the size first reported.** It reduces the score
gap by 40–60% and is worth about one to two wins, consistently, on two independent
samples. What was *not* real is the dramatic version — "the city gap closes to 10.1
against 10.4" was set A being kind. On set B the Horde's cities barely move (8.2 to
8.1) and the Kingdom's fall instead (13.0 to 11.7).

Note the neighbours were only ever measured on set A, where they sat at ~195 against
an off-baseline of 246 — so they help too, modestly. The spike was luck stacked on a
real but gentle slope.

### The methodological finding, which matters more

**Eighteen seeds cannot separate settings whose true difference is small.** The gap
between neighbouring arms in that table is smaller than the difference the same
setting shows between two seed sets. That noise floor explains a good share of this
session's false positives, and the rule that follows is:

- Judge a mechanic on whether it survives a *fresh* seed set, never on the sweep it
  was found in.
- Do not fine-tune parameters on eighteen seeds. Pick a defensible middle value and
  leave it.

Range 4, penalty 0.6 stays on those grounds — a sensible middle, not a measured
optimum, and it should not be tuned further without far more seeds.

## 4i. Why games never finish: it is a stalemate, measured

Eighteen seeds, instrumented to tell a stalemate from a clock problem, because the two
want opposite fixes.

**Nobody ever comes close to losing.** The fewest cities the Horde ever held across a
whole game averages 3.4; the Kingdom 4.1. Only **1 game in 18** saw either side fall
below two cities — and that one game is the only one that ended before the limit, at
turn 250. Elimination is not nearly happening.

**The score gap does not diverge, it oscillates.**

| turn | 50 | 100 | 150 | 200 | 250 | 300 |
|---|---|---|---|---|---|---|
| mean gap | -4.3 | 45.0 | 55.3 | 139.3 | 146.4 | **93.2** |

It peaks around 250 and falls back. Nobody is pulling away, so more turns would not
produce a winner — this is not a game that needs lengthening or shortening.

**The war gets busier, not more decisive.** Captures up to turn 150: 16.4. After turn
150: **31.3**. Both sides keep taking cities off each other right to the end and it
settles nothing.

### The bit that matters beyond this problem

Individual games swing enormously late on. Seed 63353 runs +172 at turn 200 and −168
at turn 300; seed 15839 goes +188 to −56; seed 31677 +276 to +18. Three-hundred-point
reversals in the last third are routine, because a handful of cities changing hands at
the end moves the score more than a hundred turns of development.

**That is the noise floor from 4h, explained.** Who wins on points is substantially
decided by which cities happen to be held on turn 300, so eighteen seeds could never
separate two settings whose true difference was small — the outcome is close to a coin
flip regardless of the mechanic being tested. Any future balance work should either
use far more seeds or, better, fix this first: a game whose result is largely
end-state churn cannot be tuned.

### Where to attack it

The war is reciprocal and nothing compounds. A side that loses cities takes them
straight back, so no lead ever becomes a win. Candidates, none measured yet:

- **A captured city cannot change hands again for N turns.** Attacks the see-saw
  directly and is a flat rule rather than a per-city bonus, which is the category that
  has failed repeatedly.
- **Make losing compound.** Losing a city should weaken the loser's ability to retake
  it; at present it does not, because the retaking army is already next to it.
- **A victory condition that can actually be met** — holding some share of all cities
  for a few consecutive turns, say. Ends games that are effectively decided without
  requiring total elimination.

## 4j. Razing and the supply chain, measured

Four arms, eighteen seeds each. The razing arm also restores the citizen loss from
sacking, since turning sacking off is how razing is disabled -- so it reads as
"sacking and razing" against "neither".

| arm | ended before the limit | changes of hands | cities razed | on the map | gap |
|---|---|---|---|---|---|
| neither | 2/18 | 42.4 | 0 | 21.2 | 210.2 |
| supply only | 1/18 | 51.4 | 0 | 22.5 | 138.8 |
| razing only | **4/18** | **28.3** | 0.8 | 18.2 | 201.3 |
| both, as built | **4/18** | **27.4** | 0.9 | 16.4 | 164.8 |

**The see-saw is a third smaller.** Changes of hands drop 42.4 to 27.4, the largest
movement on that number anything has produced. Decisive games double, 2/18 to 4/18.

**It is not enough.** Fourteen games in eighteen still reach turn 300.

**Wins are 5-13 in every single arm.** Neither mechanic touches the balance, which is
worth knowing: they are turn-limit work, not balance work, and they can be tuned
without disturbing the other problem.

### Why razing does not bite harder

Only **0.9 cities are razed per game**. The churn reduction is therefore mostly the
*sacking*, not the destruction: cities are ground smaller and become less worth
retaking. Razing itself almost never fires, because a city sacked to size 2 regrows to
8 long before anyone comes back for it.

So the limiter is regrowth, and the obvious next lever is to stop a recently sacked
city recovering as if nothing had happened -- a ruined place should stay ruined for a
while. That would let repeated capture actually reach zero.

### Supply lines increase churn

51.4 against 42.4 with neither. Supply lets an army push, and pushing flips cities --
the same effect noted in 4h. It reduces the score gap (210 to 139) while making the
turn-limit problem slightly worse. The two mechanics pull in opposite directions on
churn and roughly cancel, which is why "both" and "razing only" land together.

## 6. Requested, and what state it is actually in

Five of these were asked for after they had already been built, which is a
reporting problem rather than a design one -- they are listed here with what
exists so nothing gets built twice.

### Already done

- ~~**A captured city loses citizens based on the attacker.**~~ `sackSeverity`
  scales with the attacker's strength, and now takes a share of the city as well,
  so a large place costs about as many visits to erase as a small one.
- ~~**A weakened look, and a nearly-dead one.**~~ Below half health and below a
  tenth, from the two poses on each `unit states` sheet.
- ~~**The axethrower looks different without its axe.**~~ Three sheets: swinging
  armed, swinging with nothing, and the pose for getting one back, with the
  promotion sound.
- ~~**Outposts cost more the further out, and a chain is worth more than one.**~~
  Supply walks outward from the capital, an outpost only counts if it links back,
  and its price scales with distance from the capital.

### Already done, continued

- ~~**The troll regeneration animation.**~~ Plays when a creature's health goes
  up, watched by the renderer rather than triggered from the rules. Only
  creatures with the art animate, which is trolls alone, so it needed no rule
  about who regenerates visibly.

### Pending

- **Mood changes output.** Very happy citizens double what the city produces;
  disorder halves it. Note the existing disorder rule already zeroes shields and
  trade, so this is a softening as much as an addition -- halving is *kinder*
  than what happens today, and the interesting half is the bonus at the top end.
  Wants measuring: a doubling multiplier on a score dominated by population is
  a large lever.
- ~~**Experience and promotion choices.**~~ Built: six perks, one chosen per
  rank, each hooking into a rule that already exists rather than adding a
  subsystem. The two sides take the same perks under different names.
  Deliberately excludes the three from section 7 that change how a fight works
  -- Twice, Riposte and Overrun -- which stay in "later" where you put them.

### Later

- **A promoted unit attacking more than once**, and **defenders striking back**
  rather than the attacker simply taking damage. Both change the shape of every
  fight in the game, so they want measuring rather than eyeballing -- the second
  especially, since it makes attacking strictly worse and the AI attacks a lot.
- **An animation for the Broken Catapult**, which currently has none.

## 7. Experience and promotion — ideas to pick from

What exists: `veteran` is a single boolean, earned at a flat 25% chance on
winning, worth a flat 1.5x. There is no experience and nothing to choose.

A menu, deliberately over-long so it can be cut down. The suggestion is
experience from damage dealt and taken, two or three promotions per unit, and a
choice of one perk each time.

**Straightforward**
- *Bloodied* — attacks harder.
- *Dug In* — defends harder.
- *Hardened* — more maximum health.
- *Quick* — one more movement point.
- *Far-Eyed* — one more tile of sight.

**Interacting with what already exists**
- *Quartermaster* — counts as supplied a tile or two further out than it is.
- *Field Repairs* — heals even when out of supply, slowly.
- *Butcher* — sacks harder, taking more of a city when it takes one.
- *Reputation* — the townsfolk do not bother resisting; skips the militia stand.
- *Spare Axe* — the axethrower keeps a second one, so its first throw costs it
  nothing.
- *Braced* — takes less from a sapper going up nearby.

**The ones that change how a fight works** (also in "later" above)
- *Twice* — attacks a second time in a turn.
- *Riposte* — hits back while defending.
- *Overrun* — moving into a city it captures does not end its turn.

**Flavour, if the two sides should promote differently**
The Horde's perks could be things that happen *to* it -- angrier, harder to
kill, less careful -- while the Kingdom's are things it has *arranged*:
paperwork, drill, supply. Same numbers, different names, and it costs nothing
but the writing.

**Answered**

- **Where experience comes from.** Most from killing something, less from
  surviving a fight, and **none at all from damage a unit did not choose** --
  a dragon's breath catching a bystander, or a sapper going up, teaches nobody
  anything. That last rule matters mechanically as well as thematically: the
  blast hits friend and enemy alike, so counting it would have a sapper
  promoting its own side's survivors.
- **Groups earn slower, divided by the count.** Ten Orcs winning a fight is ten
  orcs each getting a tenth of the lesson. This also stops the counting ladder
  from doubling as an experience ladder, where the biggest unit would both hit
  hardest and improve fastest.
- **Promotions show on the map sprite**, not only in the readout. Prompts are in
  ART_PROMPTS.md; the current marker is a drawn asterisk and would be replaced.
- **No captured units this iteration**, so promotions never change hands.

## 4k. Sacking depth: the see-saw finally slows

Sacking now takes a share of the city as well as a flat toll, because a flat
toll of three could never finish a city of twelve and captures at a given city
land about ninety turns apart.

| fraction | ended early | changes of hands | cities razed | gap |
|---|---|---|---|---|
| 0 (flat only) | 2/18 | 33.2 | 0.9 | 191 |
| 0.25 | 4/18 | 28.9 | 0.8 | 103 |
| 0.4 | 3/18 | 25.6 | 1.2 | 159 |
| **0.6** | 5/18 | **14.4** | **2.4** | 130 |

A **clean dose-response** -- churn falls at every step, razing rises with it.
That is the shape of a real mechanism, as against the isolated spike with flat
neighbours that turned out to be fitted to the sample in 4h.

**Confirmed on a fresh seed set**, which is the rule written down after that
overfit: changes of hands 21.4 to 12.2 and razing 0.9 to 1.6. Same direction,
similar size, different maps. Set to 0.6.

### What it does not fix

Decisive games move by +3 on the original seeds and +1 on the fresh ones, so the
turn limit is barely touched. **Slowing the see-saw and ending the game turn out
to be separable**: the churn is now half what it was and most games still reach
turn 300, because neither side can eliminate the other. Wins stay in the 5-13 to
7-11 noise band throughout, so none of this is balance work.

### Two defects it exposed

- **The AI often never researched Bridge Building**, which is what unlocks the
  outpost. So in a good share of games it simply could not answer the supply
  penalty -- exactly the failure the linked-outpost rule was meant to prevent,
  hiding one level further up. Now high on both priority lists, and the earlier
  supply measurements were partly measuring an AI that had no answer.
- **The outpost rule crowded out every economy building** once the advance was
  actually researched. It now fires only where there are troops nearby genuinely
  short of supply, so a depot earns its place rather than taking it.

Two tests had to stop assuming a single seed produces a long game -- games now
end by conquest often enough that a five-hundred-turn loop can exit at turn
ninety with nothing built.

## 8. City size limited by the land — ideas to pick from

**What exists already.** A city has a `contentLimit` -- base plus buildings plus the
Happiness advance -- and going over it causes disorder rather than stopping growth.
Separately, poor land already caps a city *silently*: citizens eat, tiles feed, and a
city ringed by mountains starves back down without ever being told it cannot grow.
Eight named specials exist per terrain (Suspiciously Good Grass, A Very Deep Hole,
Bones Worth Something) and currently do nothing but change a tile's yield.

So the honest framing is not "add a limit" -- there are two -- but **make the land's
limit legible and worth planning around**, and stop the second one being invisible.

### The catch, before any of it

Population is **82% of the score gap** (4d). Anything that caps population is one of
the largest levers in the game, larger than most of what has been swept so far, and it
will hit whichever side builds bigger cities. It also interacts with sacking, which
already cuts cities down. Whatever is chosen wants measuring on two seed sets before
it is believed, per 4h.

### Also: how close two cities may be

**What exists.** `MIN_CITY_SPACING` is 3, checked in `canFoundCity` as a Chebyshev
distance, and a settler is simply refused with "Too close to Skullgrind." There is no
middle ground: legal or not, nothing in between.

**Wanted.** A hard block within two spaces, and beyond that allowed but *warned* --
the cities will share tiles and the player should know before they commit rather than
wonder later why two cities are both starving.

Worth noting the arithmetic, because it decides whether the warning is rare or
constant: the work radius is a fat cross, so two cities overlap whenever they are
within four tiles of each other. A three-tile spacing therefore already guarantees
overlap in every legal placement -- the warning would fire on almost everything and
mean nothing. Either the block moves to two and the warning starts at five or six, or
the warning needs to say *how much* is shared rather than merely that some is.

The second reading is the more useful one: "this site shares 6 of its 20 tiles with
Skullgrind" is information, where "shares tiles" is noise. It also needs no change to
the spacing at all.

### Options

**A. Support from the land.** Each terrain in the fat cross contributes a support
number -- grass 1, forest and hills 0.5, mountains and wastes 0 -- and the city's
ceiling is the sum, rounded. Computable from data that already exists, legible as one
number in the panel, and it makes *where* you settle the decision rather than *whether*
you settle. Downside: it is another ceiling next to `contentLimit`, and two ceilings
need visibly different names or the panel becomes confusing.

**B. Fresh water.** A city cannot pass some size without water in its cross. One rule,
trivially legible, immediately understandable, and it makes coasts and lakes worth
fighting over -- which the map currently has no reason to care about. Downside: binary,
so it is a gate rather than a gradient, and worldgen would need checking to be sure
water is not so common the rule never bites.

**C. Specials raise the ceiling.** The eight that exist stop being a yield tweak and
become the reason a site is worth taking. Suspiciously Good Grass feeds more people; A
Very Deep Hole does not. Pairs naturally with A -- specials add support -- and gives
the existing content a job it does not have.

**D. Make the silent limit loud.** Add no rule at all; show the ceiling the land
already imposes. The panel would say "this land feeds 7" from the same arithmetic that
currently just starves people quietly. Cheapest by a distance, changes no balance, and
removes a genuine confusion where a city shrinks and nothing explains why.

### Suggested shape

**D first, then A and C together.** D is nearly free, cannot break the balance, and
fixes a real legibility problem on its own; if the land's implicit ceiling turns out to
be doing most of the work already, A may not be needed at all. A and C then make it a
decision rather than a report, and C finally gives the eight specials a purpose.

B is the most fun thematically -- an orc settlement with nowhere to get water is very
much this game -- but it is the one most likely to be either irrelevant or brutal
depending on how much water worldgen makes, so it wants that checked first.

Art for the specials is prompted in ART_PROMPTS.md; they currently share one generic
drawn diamond, which is the reason none of them read as anything in particular.

## 9. Situational advisors

Text only -- no video, no voice -- in the manner of Civ2's advisors, using the
animation the game already has rather than anything new. Twelve of them are drawn,
six a side, and `docs/advisor_bible.md` has the full brief: role,
appearance, personality and a sample line for each.

The pairs are mirrored by role, which is the useful part for implementation:

| role | Kingdom | Horde |
|---|---|---|
| Military | Knight-Marshal | Blademaster |
| Faith / Honour | Paladin | Death Knight |
| Domestic | Stonewarden | Goblin Overseer |
| Trade | Ledger-Thane | Ogre Quartermaster |
| Diplomacy | Herald | Troll Headhunter |
| Arcane | Court Archmage | Death Mage |

So a situation picks a *role*, not an advisor, and the faction decides who says it.
The bible's own design note is the thing to build against: the two sides fail
differently -- the Kingdom through propriety and bureaucracy, the Horde through
recklessness -- so the same event wants two lines, not one line in two voices.

**Situations the game can already detect**, none of which currently say anything:

- Domestic: a city in disorder, one starving, one still a ruin, one sitting on Coin.
- Military: an enemy stack next to a city, a unit out of supply, an axethrower that
  has thrown its axe and wandered off.
- Trade: gold piling up with nothing to spend it on, a treasury nobody is guarding.
- Arcane: research idle with beakers banking, or an advance finished.
- Faith: a city sacked out of existence -- the Death Knight gets *more* pleased, per
  the bible's crisis-state inversion.

**The shape that fits what is here.** Advisors read the same log the effects and
sounds already read, with a rule per situation. That keeps `sim/` unaware of them,
exactly as the animation layer is.

**Two ways in, which between them settle the volume problem.** Six advisors with
something to say every turn is a nuisance rather than a joke, and the answer is that
most of the time they do not speak unless spoken to:

- **Asked.** The player can consult any advisor on any turn and gets their current
  read. They are allowed to repeat themselves -- an advisor who says the same thing
  three turns running because nothing has changed is *in character*, especially the
  Knight-Marshal, and it costs nothing to let them.
- **Triggered.** They interrupt only for something major: a city lost, a city sacked
  out of existence, an advance finished, a war going badly enough to notice. This is
  the path that needs the cooldown and the discipline, since an interruption has to
  earn itself.

Which reframes the design work. Asked-for lines are cheap and can be many, because
nobody is forced to read them. Triggered lines are the expensive ones, and the list of
what counts as major should start far shorter than it ends up.

## 10. Alternative victories

Both are absurd, both end the game, and they are the first victory route that is
neither conquest nor outlasting the clock -- which matters more than the joke, because
**13 of 18 games currently reach turn 300** and are decided on points. A tech-based
finish is a way for a game to end on purpose.

**The Horde: the Demonic Portal.** Demonic figures overrun the world and the Horde
celebrates its victory, despite having also been enslaved.

**The Kingdom: the Mysterious Object.** It has a button. Pressing it grants everyone
empathy. Wars end permanently, and humans and orcs begin a long-running trivia game
instead.

Points worth settling before building:

- **What they cost.** A wonder-like build, an advance at the end of a branch, or both.
  A build gives the opponent something to see coming and a chance to take the city; an
  advance is invisible until it lands.
- **Whether the other side can see it happening.** The Portal should probably be
  visible -- a race is more interesting than a surprise -- and the Object probably
  should not, since nobody knowing what the button does is the joke.
- **Whether they are symmetric.** They need not be. One side racing to finish
  something while the other tries to reach them first is a better endgame than both
  building the same thing.
- **Measuring.** If either lands too easily, every game ends the same way and the
  turn-limit problem is replaced by a turn-90 problem. Wants the same treatment as
  everything else: two seed sets, watching how often each finishes and by which route.

## 5. Also queued, from earlier

- ~~**Unit-driven buildings.**~~ Built and measured in 4c: `needsGarrison` on the
  Goblin Treasury and Simple Market. Balance-neutral, kept for the flavour.
- **Two pieces of art sitting unwired**: `broken catapult attack.jpg`, and the
  celebration, unrest and damaged city overlays, which are waiting on the extra
  logic you wanted with them.
- **Manual city tile assignment.** Citizens are auto-assigned greedily.
- **Unit movement animation.** Units teleport between tiles.
- **End-of-turn summary.** What happened while you were not looking.
- **Naval units**, which would make the map's islands mean something.

## 11. Enhancements that come with advances — the tech-based ending

The point of these is that the tree currently **dead-ends**. Eleven advances are
leaves that nothing depends on -- `full-of-fire`, `insanity`, `my-little-friend`,
`stupidity-for-all`, `tower-building`, `hammers-of-glory`, `underground-smarts`,
`ten-heads`, `arrows-glory`, `run-you-through`, `lordship` -- and each one unlocks
a single unit and then stops. Research past that point buys nothing, which is
exactly why a game that has not been won by turn 200 has nothing left to do but
walk units at each other. Hanging enhancements off those leaves gives the back
half of the tree somewhere to go, and is the cheapest route to an ending that is
won by teching rather than by attrition.

The design so far is that a perk is **chosen** on promotion. These are different:
they are **unlocked** by an advance and then available to be chosen, so a unit
type's menu grows as the tree does. Worth keeping that distinction, because it is
what makes a late advance feel like it landed.

### Two things missing underneath — built

**A lasting status on a unit.** `Unit` has no field for a condition with a
duration -- only `disarmed`, which is a bare boolean. Burning, frozen, confused
and the troll's halted regeneration are all *the same missing feature*, so they
should be built once rather than four times. Three constraints on it: it has to
serialise into a save, it has to tick deterministically for replays, and it has to
be **visible on the map**. A unit quietly losing health for three turns with
nothing drawn on it does not read as on fire; it reads as a bug.

**Damage with a type.** There is no `resist` anywhere in `src/`, and combat has
attack and defence and nothing subtractive. Resistance *to magic specifically*
means damage has to carry a kind, which nothing does today. It is a small change
and much cheaper made at the same time as statuses than after them.

**Both are now in.** `Unit.statuses` holds a list of conditions with turns
remaining, optional so old saves load unchanged; `tickStatuses` counts them down
at the start of the owner's turn without touching the RNG, so replays are
identical. Frozen takes a unit's movement, spent stops it regenerating, and
burning costs a share of maximum health -- a share rather than a flat figure, so
fire frightens a Goblin and Ten Trolls equally. The renderer draws the overlay
for each, swapping to the guttering version on the last turn, which is how the
map says how much longer a condition has to run.

Damage now carries a kind. Every site that takes health off a unit goes through
one `applyDamage`, so a resistance cannot be forgotten at one of the six places
that deal damage, and the mage, death knight and dragon are declared as striking
with magic rather than steel.

**Deliberately not switched on: no creature has `magicResist` yet.** That is the
half that moves the balance -- it favours the best units on each side and the
Horde has two of the three candidates -- so it belongs with the advances that
make it matter, measured alongside them, rather than arriving quietly underneath
them. A game played today contains no statuses and no resistances, so none of
the measurements in this file need redoing. A test asserts that, and should be
changed rather than deleted when the first resistance is set.

### The list

**Magical resistance** -- deathknights, mages and dragons take less from magic,
improving with rank. Note that this is the first mechanic that is **good for the
AI's best units and no one else's**, and the Horde has two of the three. Wants
measuring on both sides before it stays.

**Pyromancer** -- sets the target alight; it takes damage for a few turns.
**Cryomancer** -- freezes the target for a few turns.

Both are advances off the magic line rather than new unit types. Freezing is the
sharper of the two: a unit that cannot act is a unit removed from the game for
three turns, which is strictly better than damage and historically the thing that
breaks a strategy game's balance. Suggest it costs movement rather than the whole
turn, at least to begin with.

**Deathknight -- confuse.** The target stops differentiating for a few turns and
will attack anything next to it, including its own side. The most interesting item
on the list and the most dangerous to build:

- The XP rule already answers what it teaches: *nothing*, since damage a unit did
  not choose earns nobody anything. A confused unit's kills are exactly that.
- The AI has to not fall over when one of its own units is a legal target of
  another. Worth checking `abilityTargets` and the AI's target selection together.
- It **must** be visible on the target, or a player watching their own unit hit
  their own line will file it as a bug rather than a spell.

**Ogre clubs** -- three variants off the ogre line. *Fiery club* burns. *Exploding
club* damages everything around it including the ogre, but the ogre takes less.
*Quake club* hits the surrounding tiles. All three share machinery with the
sapper's existing `detonate`, which already handles a blast that catches both
sides and deliberately does not chain.

**Sapper -- "Mostly Volatile."** Survives one killing blow, not two. Sappers
currently detonate when killed (`explodes: 0.4`), so this needs deciding: does the
saved sapper detonate on the blow it survived, or does the blast wait for the
second? Surviving *and* going off is a lot of value from one perk.

**Knight -- "Better Part of Valour."** Retreats one tile when it fails to kill
what it attacked. This is the first thing in the game that moves a unit during
somebody else's turn, and it needs a rule for having nowhere to go -- surrounded,
or backed onto water. Also worth checking it cannot retreat *into* a city and
thereby garrison it for free.

**Troll -- "Swampy Friend."** On a swamp tile, spends 90% of its health and its
regeneration for a few turns to make another troll.

Treat this one with the suspicion earned in 4c and 4e. A unit that makes units is
a per-unit multiplier, and every per-unit and per-city multiplier measured so far
has **amplified whoever was already ahead** rather than closing a gap. The
counting ladder makes it worse: Three Trolls spending 90% of a very large health
pool to produce another Three Trolls is an exponent.

**Decided: only a singleton Troll may do it.** Two Trolls and Three Trolls do not
get the option at all, rather than getting a reduced version of it. That kills the
exponent outright instead of trying to price it, and it hands the game something
it has never had -- **a reason to build the small unit**. Every other mechanic in
the game rewards stacking upward, because N creatures on one tile spend one
movement point and that is strictly efficient. This is the first thing that points
the other way, and it is worth more for that than for the troll it makes.

### Measuring

These are unit-level rather than empire-level, so the 18-seed harness will
struggle to separate them individually -- the same limit found in 4c through 4k.
The honest approach is to measure them **as a block**: does a game where the back
half of the tree is worth reaching end sooner than one where it is not? That is
the question the section is actually for, and it is a big enough effect that
eighteen seeds can see it.

## 12. Two requests that fell out of the queue

Both arrived in the same playtest message as five things that did get built -- the
capital crown, beakers in the city readout, the destruction delay, and experience
for razing. These two were never written down and never built. That is a
bookkeeping failure rather than a decision, so they are recorded here properly.

### Auto-build: "auto next" and "auto coin"

Asked for: when a building finishes, a prompt to choose the next thing, with
**auto next** and **auto coin** as standing options so the prompt can be skipped.

**Most of the machinery already exists**, which makes this smaller than it sounds.

- `CityTurnEvents.completed` already reports the turn a city finishes something,
  so the trigger needs no new detection.
- `'coin'` is already a `ProductionItem` kind, and a city set to it already turns
  production into gold. **Auto coin is therefore not a new mechanic at all** -- it
  is a default for what happens when nothing is chosen.

**The question left open at the time was per-city or global.** Per-city is the
better answer: a frontier city turning out units on repeat while the capital is
managed by hand is exactly the case worth having, and a global switch cannot
express it across an empire of a dozen cities in different situations.

Which brings the constraint that actually matters:

**It belongs in the simulation, not the interface.** A standing order resolves
during turn processing, so it has to serialise into a save and replay
identically. That makes it game state, like a unit's `goto` -- which is the
precedent to copy, a standing order stored on the thing it governs. Worth
settling before a line is written, because retrofitting it means touching saves.

**"Next" needs a definition.** Repeat the same item is the honest default for
units and meaningless for buildings, which cannot be built twice. A workable
rule, which doubles as the explanation of what the setting does: repeat it if it
was a unit, otherwise the cheapest structure the city does not have, otherwise
Coin.

**This is not a balance lever.** The game should play out identically whether a
human chose the item or the standing order did. Worth saying plainly, because the
finding in 4c and 4e -- that per-city mechanics amplify a city-count lead -- is
about mechanics and does not apply to a convenience that changes no rule.

The `idle` city overlay already written into ART_PROMPTS.md was drawn for this: a
city sitting on Coin with nothing chosen.

### The Horde Report

Asked for by name, and now specified: **an easy way to see your full current
empire at a glance.** Your own only -- no intelligence on anybody else, since
there are no spying mechanics at this stage and inventing one to feed a screen
would be the tail wagging the dog.

Worth correcting an earlier guess in this file: this is **not** the end-of-turn
summary queued in section 5. That one answers *what happened while you were not
looking*, and is a log of events. This one answers *where do I stand*, and is a
snapshot of state. They are complementary and neither replaces the other.

What it wants to show, all of it derivable from state that already exists:

- **Cities** -- size, what each is building and how many turns are left, food and
  whether any are starving or in disorder, and which is the capital. This is the
  bulk of it and the reason to have it: the information exists today only by
  opening each city in turn.
- **The army** -- unit counts by type, how many are promoted, and which are out
  of supply. `supplyQuality` already computes the last one per unit.
- **The economy** -- gold in hand and per turn, beakers per turn, and what is
  being researched with turns remaining.

Two notes on building it:

- **Read-only, and derived.** Everything above can be computed from `GameState`
  on open. It should store nothing and change nothing, which keeps it out of
  saves entirely and makes it impossible to break a game with.
- **Opened, not pushed.** A screen you choose to look at is ignorable; one that
  appears every turn is a click to dismiss forty times a game. The advisors in
  section 9 are the thing that interrupts, and only for major reasons -- this is
  the one you go and read.

The Kingdom needs its own name for it. Same screen, drier register: the Horde
gets a Report and the Kingdom gets something like a Survey or a Return.

## 13. Disbanding, and a death knight who spends his own side

Two asked for together, and they are the same idea seen from two ends: a unit
you no longer want is worth something if you are willing to be unpleasant about
it.

### Disbanding

There is currently no way to get rid of a unit. A Peon that has founded every
city worth founding, or a Goblin left over from an advance three tiers ago,
costs upkeep forever and can only be disposed of by walking it into something.

The obvious shape: disband where it stands, and disband **in a city** for a
partial refund of its shields, the way most of the genre does it. The second is
the more interesting of the two, because it turns obsolete units into a way of
finishing a building -- and it wants a rate low enough that nobody builds units
in order to melt them. A half refund is the usual answer and is probably right;
anything higher makes a unit a better shield store than a shield is.

Worth settling: whether a disbanding unit gives its **home city** the refund or
whichever city it is standing in, since the second lets an army walk its value
to wherever it is wanted. The first is duller and harder to abuse.

### The death knight's sacrifice

A promotion that heals the death knight by killing one of your own units next to
it. Thematically exact for the faction, and mechanically it is the first thing
in the game that treats your own army as a resource.

Points to settle before building:

- **What it is worth.** Scaling with the sacrificed unit's *remaining* health is
  the honest reading -- a nearly-dead Goblin should not be worth as much as a
  fresh one -- and it also stops the obvious exploit of breeding cheap units as
  batteries. Scaling with the counting ladder needs care for the same reason:
  Ten Orcs are ten orcs, and should heal accordingly rather than count as one.
- **What it teaches.** Nothing. The experience rule already says damage a unit
  did not choose earns nobody anything, and a unit killed by its own side is
  the purest case of that.
- **Whether the AI may use it.** If it can, it needs to not spend a Dragon to
  patch a scratch; if it cannot, the perk is a player-only advantage and the
  balance runs will not see it at all. The second is probably the honest
  starting point, stated rather than left to happen.
- **It needs to be visible.** A unit vanishing from your own line with no
  explanation reads as a bug. The `death-touch` effect already exists and is
  the obvious thing to play on the tile.

Both of these want the disband machinery first: the sacrifice is a disband with
a beneficiary attached, and building it twice would be the usual mistake.

## 14. Two things the map should say for itself — built

**Both are in.** Each of your cities carries a border around the ground it
claims -- one perimeter around the whole fat cross, not a box per tile, and your
own only. The first attempt drew a hairline per worked tile and was wrong twice
over: it vanished into the terrain, and even visible it drew the grid rather
than the shape, which is the thing you need in order to see where a new city
would overlap an old one. The claim is the fat cross rather than the tiles being
worked today, because those move every time a city grows and a border that
shifts with citizen assignment is not a border. A unit fortified or on sentry inside its own city is drawn as a
count on the city rather than on the tile, clicking the tile opens the city, and
the panel lists the garrison with a click to wake each one -- which is the half
that matters, since the drawing change without it would hide units where nobody
could reach them.

### Thin outlines on worked tiles

Every city works a fat cross of tiles and nothing on the map says which. The
consequence is not cosmetic: choosing where to put the next city means guessing
which ground is already spoken for, and the spacing rule in section 8 makes that
guess matter.

A one-pixel border in the owner's colour around each worked tile is enough --
worked tiles are already tracked per city as `workedTiles`, so this is drawing
rather than bookkeeping. Two things to decide:

- **Whose.** Your own only is the safe answer, and consistent with the fog rules:
  drawing an enemy city's worked tiles would say how big it is and which tiles it
  has assigned, which is more than seeing the city tells you.
- **Always, or while founding.** Always is simpler and probably right, but it is
  a lot of lines on a busy map. Worth trying always first and only reaching for
  a toggle if it turns out to be noise.

### A fortified unit should hide inside its city

Right now a unit fortified in a city sits on top of it, so the city is hard to
click and the unit has to be woken by finding it rather than by opening the
place it is standing in. Both halves are the same wrong idea: the unit is the
thing on the tile, when what the player is thinking about is the city.

The shape: a garrisoned unit that is fortified or sentried draws as a small mark
on the city rather than as itself, clicking the tile opens the city, and the
city panel lists what is inside it with a way to wake each one. That last part
is the actual feature -- the drawing change without it just hides the unit
somewhere you cannot reach.

Worth keeping: a garrison you cannot see at all is how a player loses a city
they thought was defended, so the mark has to say *how many* are in there.

## 15. Later

Bigger than the queue above, and none of them blocking.

**A post-game summary that replays the game.** Territory changing hands turn by
turn, cities founded and lost, the score pulling apart. It needs the game to
retain a per-turn record it currently throws away -- city ownership and unit
counts per player would carry most of it, and both are small enough to keep for
three hundred turns. Worth deciding early whether that record is part of the
save, because retrofitting it means old saves can never be replayed.

**A palace.** The capital is currently derived rather than built, which is why
it could be taken by conquering somebody older (fixed, but it shows the shape of
the problem). A palace would make the seat of government a thing you own and can
move at a cost, rather than an accident of founding order.

**More than two factions.** The counting joke is the spine of both current
sides, so a third should not simply be a third set of numbers. Spitballing:
a faction that cannot count past one and compensates with size; a faction whose
advances are all administrative and whose units are all committees; undead who
gain citizens from other people's losses. Each wants its own reason to exist
rather than its own colour.

**Auto-scout**, for the Outrider and for a new Goblin Scout to be added
alongside it. Walks toward unexplored ground on its own and **halts the moment
it sees an enemy or a city**, which is the part that makes it useful rather than
a way to lose a unit unattended. Reuses the standing-order machinery that `goto`
already has, and wants the same Halt action the march does.

## 16. Choosing which tiles a city works

Citizens are assigned greedily and the player cannot overrule it. That is
tolerable while every tile of a kind is worth the same, and stops being
tolerable the moment the terrain modifiers and land specials land -- at that
point the greedy pick is choosing between things it has no way to weigh, and
choosing wrongly is invisible.

Wants: the fat cross drawn in the city screen with each tile's yield on it,
click to assign or unassign, and the greedy assignment as the default so nobody
who does not care is made to care. Two things follow from that:

- **It has to survive growth.** A hand-assigned tile must not be silently
  reshuffled when the city grows or a citizen starves, or the choice was
  pointless. That means a per-city flag saying "these were chosen" and
  `assignWorkers` filling only the remainder.
- **It has to survive losing the tile.** An enemy standing on a worked tile, or
  taking the city next door, can make a chosen tile unworkable. Falling back to
  the greedy pick for that one citizen is right, but it should say so.

The map border added in section 14 is the other half of this: the border says
which ground is yours to assign, and this says what to do with it.

## 17. The settler cost, measured

Two changes landed recently that move the numbers and have not been measured:

- **The AI no longer founds cities into an enemy stack** (section 14 work). A
  clear improvement in play, but it changes what the AI does with settlers.
- **Second-tier gold and science buildings**, which are per-city multipliers --
  the exact class that measured badly in 4c and 4e by amplifying whoever already
  had more cities.
- **Settlers now cost a citizen**, which is the largest of the three. Expansion
  was very nearly free: a city of one could produce settlers forever without
  shrinking, so the only brake on city count was shields and walking time. City
  count is the dominant term in every measurement in this file, so this is the
  first change in a long while that acts directly on it.

The last of those is the one to measure first, and the interesting question is
not whether it slows expansion -- it must -- but **whether it slows the AI more
than the player**, since the AI expands by rule and the player expands by
judgement. If it does, the see-saw in 4i gets worse rather than better.

### What the sweep said

Two arms over the same maps, `SETTLER.costsCitizen` off and on, eighteen seeds
each, then the whole thing repeated on a fresh seed set. AI against AI, which is
worth remembering: it cannot answer the question above about player versus AI,
because there is no player in it.

| | free | costs a citizen | free (fresh) | costs (fresh) |
|---|---|---|---|---|
| peak cities, both sides | 19.33 | 17.44 | 18.22 | 18.39 |
| peak cities, Kingdom | 11.06 | 9.33 | 9.72 | 10.11 |
| population, Horde | 23.83 | 29.89 | 32.00 | 27.78 |
| reached the turn limit | 13/18 | 15/18 | 16/18 | 17/18 |
| wins, Horde | 5 | 3 | 7 | 3 |

**The headline from the first set did not survive the second.** It looked like
the rule cut total expansion by a tenth and took almost all of it out of the
Kingdom, narrowing the gap between the sides on every territorial measure. On
fresh seeds total expansion did not fall at all (+1%), the Kingdom's peak went
*up* rather than down, and the Horde's population fell instead of rising. Every
part of that story reversed sign, so none of it is real.

**What did replicate is the thing dismissed as noise the first time.** The Horde
won less under the rule in both sets, 5 to 3 and then 7 to 3. Pooled over
thirty-six seeds that is twelve wins down to six -- about 2.1 standard
deviations, which is suggestive rather than settled, but it is the only
direction that held across two independent sets.

The likely mechanism is city size. Horde cities are much smaller than Kingdom
ones -- 24 to 32 population against 54 to 58 -- so a flat one-citizen charge is
a far larger share of an orc city, and a city of one or two is gated out of
settlers entirely. A cost expressed in citizens is regressive against whoever
builds small cities.

**The turn limit got slightly worse in both sets**, 13 to 15 and 16 to 17, with
games five to twelve turns longer. Small, but consistent, and pointing the wrong
way for section 4i.

### What to do about it

The rule is still worth having on its own terms: a size-one city producing
settlers forever was an exploit, and expansion being entirely free is not a
thing anyone designed. But it is currently a tax on the side that was already
losing, which is the opposite of what a balance change should do.

Worth trying, in order of how little they disturb:

- **Gate on size rather than charge a citizen** -- only cities of three or more
  may build settlers. Same brake on early runaway expansion, no ongoing charge,
  and it does not scale with how small your cities are.
- **Charge the citizen but make the Horde's settler cheaper in shields**, which
  is the compensation the flavour already suggests -- peons are expendable.
- **Leave it and fix the Horde elsewhere.** Defensible, but it means carrying a
  known regression while looking for the offset.

Whichever, it wants the same two-set treatment. `SETTLER.costsCitizen` exists so
the control arm can be run without editing the rules.

### The size gate, measured: same result, better brake

Option one built and swept the same way, two seed sets, control against
`minCitySize: 3`.

| | set A control | set A gated | set B control | set B gated |
|---|---|---|---|---|
| peak cities, both | 19.33 | 18.17 | 18.22 | 17.78 |
| population, Horde | 23.83 | 30.67 | 32.00 | 21.67 |
| reached the turn limit | 13/18 | 14/18 | 16/18 | 14/18 |
| wins, Horde | 5 | 4 | 7 | 2 |

**As a brake it is the better of the two.** Expansion fell in both sets this time
-- 6% and 2.4% -- where the citizen charge fell 10% and then rose 1%. And it does
not drag on the turn limit: +1 then −2, no direction, against the charge's
consistent worsening.

**But it costs the Horde exactly as much.** Pooled over thirty-six seeds per arm:

| arm | Horde wins |
|---|---|
| no brake | 12 / 36 (33%) |
| citizen charge | 6 / 36 (17%) |
| size-3 gate | 6 / 36 (17%) |

Two different interventions, the same number. That is what makes the mechanism
credible rather than a coincidence: **both brakes are denominated in city size,
and Horde cities are smaller** -- measured directly in section 20, 4.5 to 5.5
citizens against 6.4 to 6.5, so about a quarter to a third smaller. (An earlier
draft here said "about half", read off total population, which is a city-count
gap and not a size gap. A later correction called them "nearly identical", which
was measured off one arm's aggregates and was further wrong. The direct figure
is the one above.) A charge of one citizen is a bigger share of a small city; a
threshold of three citizens takes a small city longer to reach.
Either way the brake binds harder on whoever builds small, and that is the Horde
by design.

### The finding that matters more than either

The control arm is **12 wins in 36 for the Horde**, about two standard
deviations below an even split. The Horde was already losing two games in three
*before any of this was added*. Both attempts then took it to one in six.

So expansion is probably the wrong thing to be tuning. Nothing here has found a
brake that does not land on the weaker side, and the weaker side is weak for
reasons this file has not identified yet. Worth attacking that directly:

- **Where does the Horde actually lose?** Both arms have it peaking at a similar
  city count to the Kingdom (8 against 9--11) but finishing with fewer and with
  half the population. It is not failing to expand -- it is failing to *hold* and
  failing to *grow*. That points at content limits, food, or losing cities back,
  not at settlers.
- **A brake denominated in something other than city size**, if one is still
  wanted. Cost scaling with the number of cities already held would tax the side
  that is running away rather than the side with small cities, which is the
  opposite of both attempts here.

**Set to `minCitySize: 2`**, which closes the degenerate case a
size-one city producing settlers forever without being much of a brake at all,
and leave the balance question to the growth work above.

## 18. The AI should escort its settlers

It does not. `guardedAt` is the only escort-shaped code in `ai.ts`, and all it
asks is whether something of ours *happens* to be adjacent at the moment of
founding. Nothing arranges a guard, and nothing walks one alongside a settler.
They travel alone, every time.

That is worth fixing on its own, but it is also a **prerequisite** for something
else. Settlers already have `attack: 0`; dropping `defense` to 0 as well, so they
must be escorted the way later Civ games do it, is a tempting rule and currently
a trap. A rule that punishes unescorted settlers punishes whoever cannot escort,
and today that is the AI and only the AI -- a human escorts by habit. It would
land entirely on one side, and the Horde is already the weaker one.

Two more things to settle before that rule, separate from the AI:

- **With `defense: 0` it is not a fight, it is an auto-delete.** `pAttack` is
  `atk / (atk + def)`, so zero defence means every round lands, every time.
- **There is no unit capture**, so a caught settler simply vanishes. Civ softens
  the same rule by handing the settler over; here it would not.

So: escort first, measure, and only then consider taking the last point of
defence away.

## 19. Resettlement: a captured city takes time to become yours

Thematically an orc cannot simply move into a human town and carry on. There
should be a period after capture where the old population is leaving and the new
one arriving -- **longer for a larger city**, since there are more people to
move -- during which the place can build **Coin and neutral structures only**,
and **no units at all**.

Three things in the code this has to reckon with:

- **There is already a timer, and it is flat.** Capture sets
  `ruinedUntil = turn + RUIN.turns`, a fixed fifteen turns whatever the size,
  during which nothing grows. Resettlement is a better-motivated version of the
  same idea, so it should almost certainly **replace** that timer rather than run
  a second one beside it. Two overlapping penalties for the same event is how a
  captured city becomes not worth capturing.
- **"Neutral" is thinner than it sounds.** Only two buildings are `faction:
  'both'` -- Barracks and Granary. So in practice the rule reads "Coin, or one of
  two things", which may be the right amount of nothing to do, but is worth
  knowing before it is called a choice.
- **The buildings already standing there are the open question.** Capture
  destroys a few at random and the rest change hands intact, so an orc currently
  inherits a working Chapel of Mild Optimism. The theme says it should not work
  for them. Options: it stops working during resettlement and then does, it stops
  permanently, or it is destroyed on capture. The middle one is the most
  interesting and the easiest to explain.

**Settler capture stays out**, and for the same reason: an orc has no use for a
human settler. It only makes sense in a game where both sides can be the same
kind -- the multiple-factions idea in section 15 -- so it belongs there rather
than here, if anywhere.

## 20. Why the Horde loses: measured

Eighteen seeds, twice, base game, both sides AI. Every city a player stops
holding left by exactly one of two doors, so counting both says which.

| | orc (A) | human (A) | orc (B) | human (B) |
|---|---|---|---|---|
| cities founded | 11.94 | 11.94 | 11.28 | 12.50 |
| taken from enemy | 5.67 | 7.89 | 6.11 | 7.28 |
| lost to capture | 7.89 | 5.67 | 7.28 | 6.11 |
| avg city size | 4.54 | 6.43 | 5.51 | 6.47 |
| **% turns unhappy** | **31.2** | 20.4 | **33.6** | 20.5 |
| **% turns in disorder** | **30.9** | 20.2 | **33.3** | 20.3 |
| % turns starving | 0.2 | 0.6 | 0.5 | 0.7 |
| units alive | 26.22 | 57.89 | 32.22 | 46.61 |
| advances | 21.83 | 22.50 | 22.17 | 23.11 |

### Expansion was never the problem

**Both sides found the same number of cities** -- 11.94 against 11.94, and 11.28
against 12.50. The Horde is not slower to settle and never was. Every measurement
in section 17 was aimed at a mechanism that does not exist, which is worth
remembering the next time a number looks like it needs a brake.

What differs is what happens afterwards. The Horde **loses more cities than it
takes** and the Kingdom does the reverse, by the same margin, in both sets.

### The root is disorder, and disorder is a trap

The Horde spends **a third of all city-turns in disorder** against the Kingdom's
fifth, consistently. Food is not involved at all -- both sides starve under 1% of
the time.

That matters more than the ratio suggests, because of what disorder does:

```ts
if (city.disorder) return { food: total.food, shields: 0, trade: 0 };
```

**A city in disorder produces no shields.** It therefore cannot build the very
building that would end its disorder. The AI already tries -- `chooseProduction`
reaches for a `contentBonus` building the moment a city riots -- and it can never
finish one, because there is nothing to finish it with. Growth is capped at zero
in the same breath, so the city cannot shrink its way out either. **The only
escape is an empire-wide advance raising the limit for everybody.**

That is a design defect rather than a balance knob, and it is not faction
specific. It simply catches the Horde half again as often.

### Everything else follows from it

- **Half the army.** 26 units against 58, and 32 against 47. A third of your
  cities producing nothing is most of that gap.
- **Smaller cities**, 4.5--5.5 against 6.4--6.5, because disorder caps growth.
- **Fewer advances than the trade would suggest**, since disorder zeroes trade
  as well as shields.

### Two structural asymmetries underneath

Neither is a bug, but both point the same way and neither was deliberate as far
as this file records.

**A Kingdom city defends at more than twice a Horde one, for the same cost.**

| | unit (20 shields) | atk / def | city building | fortified defence |
|---|---|---|---|---|
| Kingdom | footman | 2 / 3 | **Walls x2** (human only) | **9.00** |
| Horde | orc | 3 / 2 | Broken Catapult x1.35 | **4.05** |

Two things compound. The orc trades a point of defence for a point of attack at
equal cost, and **defence multiplies while attack does not** -- fortify x1.5,
terrain, and the city building all apply to defence, where attack gets only a
siege bonus. Then Walls are Kingdom-only at x2 against the Horde's x1.35.

The result inverts the flavour: an orc attacking a Kingdom city wins a round
**25%** of the time, and a footman attacking a Horde city **33%**. The Kingdom is
better at taking cities than the Horde is, at every rung of the ladder -- the
same 25/33 holds for orc_x10 against footman_x10.

**And the Horde pays roughly 1.8x the research for the same rung.**

| | rungs to x10 | beakers |
|---|---|---|
| Horde | x3, x4, x6, x8, x10 | 550 |
| Kingdom | x2, x3, x5, x10 | 301 |

Its whole reachable tree is 2190 beakers against 1801.

### What to do, in order

1. **Fix the disorder trap.** A city that cannot act its way out of a state is a
   dead end wherever it appears. Options: leave a floor of shields during
   disorder so the calming building is reachable; let disorder decay on its own
   after some turns; or let a city in disorder still finish something it had
   already started. This helps both sides and the Horde more, which is exactly
   the shape a fix should have.
2. **Re-measure.** The two structural asymmetries may not need touching at all
   once cities stop freezing solid. Changing three things at once is how the
   last two sweeps ended up unreadable.
3. **Only then** consider Walls, the orc's stat line, or the ladder cost.

## 21. The disorder fix, measured

A rioting city may now work on a building that would calm it, and Placating is
always available as a standing choice, so disorder is a setback rather than a
dead end. Same eighteen seeds, twice, before and after.

| | orc before | orc after | human before | human after |
|---|---|---|---|---|
| % turns in disorder | 31 / 33 | **18 / 18** | 20 / 20 | **12 / 10** |
| population | ~25 | **45.5 / 43.9** | ~57 | 54.2 / 57.8 |
| units alive | 26 / 32 | **35 / 39** | 58 / 47 | 51 / 55 |
| final cities | 5.6 / 6.3 | **6.4 / 6.6** | 8.8 / 7.9 | 7.8 / 8.2 |
| wins | 5 / 7 | **5 / 7** | 13 / 11 | 13 / 11 |
| reached the turn limit | 13/18, 16/18 | **17/18, 18/18** | | |

### It worked, economically

Disorder is down by nearly half on both sides. **Horde population very nearly
doubled**, from about 25 to about 45, and the gap that looked like the whole
problem -- 25 against 57 -- closed to 45 against 54. Units and cities moved the
same way. A third of Horde cities were frozen solid; now they are not.

That was worth doing on its own merits. A city that cannot act its way out of a
state is a defect wherever it appears, and this one was eating a third of one
side's economy.

### It changed nothing about who wins

**The win counts are identical.** Twelve to the Horde in thirty-six, before and
after, seed for seed in both sets.

That is the useful part. Roughly doubling the Horde's economy did not move the
result at all, which rules out the economy as the cause and leaves what section
20 measured underneath it:

- A Kingdom city defends at **9.00** against a Horde city's **4.05**, because
  defence is what multiplies and Walls are Kingdom-only.
- So an orc takes a Kingdom city **25%** of the time and a footman takes a Horde
  city **33%**, at every rung of the ladder.

The Horde now has the material to fight with and still loses, so **the combat
asymmetry is the whole of it**. That is where to go next, and it is now isolated
rather than tangled up with an economy three sizes too small.

### It made the turn limit worse, and that is now urgent

**35 games in 36 reach turn 300**, against 29 before. Nearly every game is
decided on points.

This is the second time the same shape has appeared: the settler sweep in
section 17 found that closing the gap between the sides produced more
stalemates, and this does it again and harder. Two sides that are evenly matched
and both solvent cannot finish each other.

Section 4i has been the oldest open problem in this file for a long time. It is
no longer possible to postpone it: every balance improvement makes it worse,
because a fair fight between two healthy empires is exactly the fight nobody
wins. Whatever is done about it has to make *finishing* easier rather than
making the sides more equal, and the two goals genuinely pull against each other.

## 22. Section 4i, candidate 1: measured and rejected

"A captured city cannot change hands again for N turns" was the candidate 4i
liked best -- a flat rule rather than a per-city bonus, which is the category
that had failed repeatedly. Built by reusing `ruinedUntil`, which capture
already sets, so the period a city spends clearing rubble is the period it
cannot be taken. Two seed sets, immunity on against off, everything else equal.

| | captures/game | decided before the limit | Horde wins |
|---|---|---|---|
| no immunity | 15.50 / 15.06 | 1/18, 0/18 | 5, 7 |
| immunity | 16.06 / 16.06 | 2/18, 1/18 | 7, 6 |

**It changes nothing.** Captures are identical, slightly higher if anything, in
both sets. Decisiveness moves from one game in thirty-six to three, which is
inside noise on that sample. Wins do not move.

### Why, which is the useful part

4i assumed the see-saw was *the same city* flipping back and forth, and that
stopping the immediate retake would slow the war. It is not that. **The churn is
distributed**: blocked from retaking one city, the army walks to a different one
and takes that instead. Total captures come out the same because the war is not
short of targets.

That retires a whole line of thinking, not just this rule. Anything that makes an
individual city harder to take will be routed around as long as there are other
cities. **Candidate 2 -- "make losing compound" -- is the same shape and should
be expected to fail the same way** unless it attacks the attacker's ability to
keep attacking, rather than the defender's vulnerability.

### The rule is kept, reclassified

It stays in, but as groundwork for the resettlement in section 19 rather than as
a fix for anything. It is thematically right -- a city mid-resettlement has no
functioning government to capture -- it costs nothing measurable, and section 19
wants exactly this window for its other effects. `RUIN.protects` turns it off.

What it is *not* is an answer to 4i.

### What is left

Only **candidate 3: a victory condition that can actually be met.** The evidence
now points there hard. 4i measured that nobody ever comes close to losing -- the
fewest cities either side ever holds averages 3.4 and 4.1 -- and every attempt
since to make the war more decisive has either done nothing or made the sides
more equal and therefore *less* decisive. The game has exactly two endings, total
elimination and the clock, and the first never happens.

A dominance condition converts "effectively decided" into "decided" without
requiring anyone to be wiped out. It is the only candidate that does not depend
on the war becoming something it has repeatedly refused to become.

## 23. Section 4i solved: a victory that can be met

Hold 60% of every city on the map for ten consecutive turns and the game ends.
Two seed sets, on against off, everything else equal.

| | captures <=150 | captures >150 | avg turns | decided before the limit | Horde wins |
|---|---|---|---|---|---|
| control | 7.67 / 7.17 | 8.39 / 8.89 | 295 / 296 | 2/18, 1/18 | 7, 6 |
| dominance | 7.00 / 6.78 | **2.44 / 2.61** | **189 / 181** | **15/18, 16/18** | 4, 5 |

**Three games in thirty-six became thirty-one.** Games run about forty per cent
shorter, and the late-game churn that 4i identified -- "the war gets busier, not
more decisive" -- collapses by seventy per cent, because games now end instead of
grinding on. Captures before turn 150 barely move, which is the right shape: it
does not change how the war is fought, it ends it once it is decided.

This is the first thing tried against 4i that worked, after a flat rule that did
nothing (section 22) and two balance changes that made it worse by making the
sides more equal (sections 17 and 21).

### Why the other candidates could not have worked

4i measured that nobody ever comes close to losing. Every other candidate tried
to make the *war* decisive, and the war refuses: block a retake and the army
takes a different city, improve a side's economy and the sides become more evenly
matched and finish each other less. **The game had two endings and one of them
never happened.** Adding a third that does not require anyone to be wiped out was
the only move left.

### The catch, which is real

**Horde wins fall from 13 in 36 to 9.** About 1.4 standard deviations --
suggestive rather than settled, but it points the same way as everything else and
the mechanism is obvious: the condition is denominated in **cities held**, and
section 20 measured that the Kingdom is better at taking and holding cities than
the Horde is. A victory measured in the thing one side is better at rewards that
side.

That is the same pattern as the settler brakes in section 17, which were
denominated in city size and hurt whoever built small. It is worth stating as a
rule of thumb: **a mechanic denominated in X favours whoever is better at X**, so
choose the denominator deliberately.

The fix is not to abandon the condition -- 3/36 to 31/36 is worth far more than
four games of faction drift -- but to fix the cause at source. Section 20 has it:
a Kingdom city defends at 9.00 against a Horde city's 4.05, so an orc takes a
Kingdom city 25% of the time and a footman takes a Horde city 33%.

### A bonus worth noting

4i also warned that "a game whose result is largely end-state churn cannot be
tuned" -- outcomes were substantially decided by which cities happened to be held
on turn 300, which is why eighteen seeds could never separate two settings.
Games that end when they are decided, seventy per cent fewer late captures, are
games whose results mean something. **Every future measurement in this file gets
easier because of this one.**

## 24. There is no combat asymmetry

Section 20 claimed one, on the strength of this comparison:

> a Kingdom city defends at 9.00 against a Horde city's 4.05, because Walls are
> Kingdom-only at x2 against the Broken Catapult's x1.35

**That table describes a matchup that does not happen.** Played out to the end,
**Walls stand in 0 cities out of 14 and the Catapult in 1.** Neither building is
ever really built, so the multipliers were theory. Raising the Catapult to x2 to
match Walls produced results identical to the control on every metric, in both
seed sets, to two decimal places -- which is what varying a number nothing reads
looks like. It has been put back to 1.35.

Without the buildings, which is the ordinary case, the mirrored stat lines
already balance exactly: orc 3 against a fortified footman at 4.50 takes it 40%
of the time, and footman 2 against a fortified orc at 3.00 takes it 40%.

### And the fortify bonus is not it either

The remaining theory was that defence is simply worth more than attack -- it is
multiplied by fortifying, by terrain and by buildings, where attack is
multiplied by nothing but a siege bonus -- so the faction that trades defence
for attack pays in the weaker currency. Lowering the fortify bonus from 1.5 to
1.25 to test it moved Horde wins from 9 in 36 to 10, with the two seed sets
disagreeing on the direction. Noise.

### What the numbers actually say

| | founded | took | lost | own razed | final |
|---|---|---|---|---|---|
| Horde | **7.67** | 4.39 | 5.06 | 1.11 | 5.89 |
| Kingdom | **11.28** | 5.06 | 4.39 | 3.39 | 8.56 |

**Captures are balanced.** The Horde takes 4.39 and loses 5.06; the Kingdom takes
5.06 and loses 4.39 -- the same numbers mirrored, which is what a fair fight
looks like. The Kingdom actually loses *more* cities to razing.

**The entire gap is founding**, 7.67 against 11.28, and it is there from the
start: by turn 100 it is already 6.17 against 8.00. The Horde finishes below its
expansion target of six while the Kingdom sits at the cap of eight.

It is not the settler gate either. Turning it off narrows the founding gap to
8.17 against 10.00 and Horde wins go *down*, from 4 to 2.

### So the question changes

The Horde does not lose fights and is not held back by a rule anyone has found.
**It fails to expand as far as it is trying to.** Both AI personalities aim at
six cities; one reaches eight and the other stops at six. Where the settlers go,
or why they are not built, is the thing to measure next -- and it is a question
about production and priorities rather than about combat.

Three theories have now been wrong in a row here -- the economy (fixed, changed
nothing), the buildings (never built), the fortify multiplier (noise). The
common thread is that each was reasoned from a table rather than from what a
played game contains. **Check that a mechanic occurs before explaining anything
with it.**

## 25. The Horde stopped at six because it was told to

Section 24 left the question as "why does the Horde found 7.67 cities to the
Kingdom's 11.28". The answer was in the personality table the whole time:
`targetCities: 6`, and production step 2 reads `if (cities + settlers <
targetCities) build a settler`. Six cities, and it stops for good.

The Kingdom has the *same* target. It reaches 8.4 anyway, because it exceeds its
cap by conquest -- six founded plus two taken -- where the Horde's 5.8 is six
founded minus losses. **A symmetric expansion target produces an asymmetric
result the moment the war stops being symmetric.**

Two seed sets, thirty games:

| target | Horde wins | final cities, orc / human |
|---|---|---|
| 6 | 7/30 (23%) | 5.8 / 8.4 and 6.2 / 7.8 |
| **7** | **18/30 (60%)** | 7.9 / 8.2 and 7.7 / 7.6 |
| 8 | 19/30 (63%) | 8.8 / 8.4 and 8.7 / 7.8 |
| 10 | 9/12 (75%) | one set only, plainly overcorrected |

Seven and eight are one game apart over thirty and cannot be separated at this
sample size. Seven is taken because it levels the city counts rather than
tipping them, and because it is the smaller move -- this file already records an
overcorrection from going one step too far on the Kingdom's caution.

### Also measured -- and then withdrawn

The first pass here reported that raising the Horde's `caution` from 0.25
towards the Kingdom's 0.48 **fixed settler production**, 8.67 built to 11.08,
on the reasoning that a reckless AI empties its own garrisons and production
step 1 rebuilds a defender before step 2 ever reaches a settler. Final cities
and wins did not move, which was put down to the cap being the binding
constraint rather than the supply.

**That was one seed set, and it does not replicate.** Re-measured across two
sets at the new cap -- see section 26 -- settler production rises with caution
on one set and falls on the other. The mechanism was a plausible story fitted to
a single sample.

### Five wrong theories, and what they had in common

| theory | outcome |
|---|---|
| the Horde's economy | fixed -- population nearly doubled, wins unchanged |
| Walls and the Broken Catapult | the buildings are never built; the table described nothing |
| the fortify multiplier | noise, the two seed sets disagreed on direction |
| the settler brakes | measured twice, rejected twice |
| the Horde's caution | inert; the "confirmed mechanism" did not replicate |

Every one was reasoned from a table in the source. The answer came from counting
what a played game actually contains -- settlers built against cities founded
against legal sites available -- which killed three of them in a single ten
minute run.

**Explain the thing that is preventing the next step, not the symptom.** The
symptom was "fewer cities"; four of the five theories were plausible stories
about fewer cities. The question that worked was "what stops it founding the
seventh", and that has exactly one answer.

## 26. Caution re-tested at the new cap: inert

Section 25 left caution as a mechanism that worked but was blocked by the
expansion cap. With the cap moved from six to seven, it was worth asking again.
Three levels, two seed sets, thirty games each level.

| caution | set A wins | set B wins | combined |
|---|---|---|---|
| 0.25 (current) | 7/12 | 11/18 | 18/30 |
| 0.35 | 6/12 | 11/18 | 17/30 |
| 0.45 | 7/12 | 11/18 | 18/30 |

**Flat.** Set B returns eleven wins at every level. Final cities barely move
either -- 7.9 / 7.8 / 7.9 on one set, 7.7 / 8.3 / 7.7 on the other.

**And the settler effect does not replicate.** Set A has settler production
rising with caution, 11.42 to 13.83; set B has it falling, 11.06 to 9.67. The
two sets point in opposite directions, which is what a null result looks like
when it has been read off one sample and dressed as a mechanism.

So `caution` stays at 0.25 and is not a lever. The Kingdom's copy of the number
was measured properly and *is* sensitive; that does not make the Horde's copy
sensitive, and assuming it did was the error.

### The withdrawal is the point

Section 25 reported this as "mechanism confirmed, outcome unmoved" and offered a
tidy explanation for why the outcome refused to follow. The explanation was
wrong because there was nothing to explain: the mechanism was noise on one seed
set.

That is a more dangerous failure than the five wrong theories before it, because
those were contradicted by the numbers while this one was *supported* by them --
until it was asked twice. **A mechanism confirmed on one seed set is a
hypothesis, not a finding**, and the tell was there in plain sight: an effect
large enough to matter that nonetheless moved no outcome at all.

One observation kept as unexplained rather than as a result: on set B alone,
Horde units rise from 32 to 42 and Kingdom units fall from 34 to 29 as caution
rises. Monotonic, sizeable, and absent from set A. Recorded so that nobody
including me builds a story on it without checking the other set first.

## 27. Roads and terrain work

Peons and peasants dig holes for a living and currently do nothing with the
ground except stand on it. Roads, and whatever else the terrain modifiers bring,
are the obvious thing for them to be for.

### What the map can and cannot take today

`state.terrain` is a flat array of terrain ids and `state.specials` a parallel
0/1 array, and **nothing writes to either after worldgen** -- every reference in
`sim/` and `ai/` reads. So the map is currently a constant, and the first piece
of terrain work makes it a variable. That is the real change here, more than any
particular improvement.

A road is not a terrain, it is something *on* a terrain, so it wants **a third
parallel array** rather than a new `TerrainId`. Replacing the terrain would lose
what the tile was, and the tile's food, shields, defence and blend all still
have to come from underneath.

Consequences worth knowing before starting:

- **It changes the save.** The map is currently reproducible from its seed,
  which is why saves are small. Anything that edits tiles has to be stored
  tile-by-tile, or as a diff against the generated map. The second is smaller
  and is what the README already promises: "map stored as seed + diffs".
- **It changes pathfinding.** `terrainMoveCost` is read in four places in
  `movement.ts` and in the pathfinder. A road that costs less to enter has to be
  consulted everywhere terrain currently is, and the AI's routing has to notice
  roads or it will walk beside them.
- **It gives the fog something new to hide.** Whether an enemy's roads are
  visible on explored-but-unseen ground is a real question, and the answer
  should match how cities are already treated.

Worth doing in the order: the overlay array and the save format first, then
movement cost, then trade, then anything that changes the tile's yield. The
first two are the parts that are hard to change later.

## 28. A separate settler unit

The peon is both the worker and the settler, and section 27 gives it a second
job it cannot do at the same time as the first. Splitting them is the obvious
answer, and it is more entangled than it looks.

`settler: true` is read in **eight places** outside the unit table -- the AI's
garrison count, its expansion count, its production choice, its unit dispatch,
the interface's Found City button, the city's own garrison check, and the
minimum-city-size gate. Each of those means something slightly different by
"settler":

- the garrison counts want "cannot fight", which is really `attack === 0`
- the expansion counts want "will become a city"
- the size gate wants "costs the city something to send"

Splitting the unit without splitting those meanings is how a worker ends up
counting toward the expansion target, or a settler ends up garrisoning a city.
**Give the flags the meanings the call sites actually want first**, then add the
unit; the reverse order will produce a fortnight of small strange bugs.

Also worth settling:

- **What the peon keeps.** If it stops founding cities, the joke in its blurb --
  "Digs holes. Occasionally a city happens." -- stops being true, and that joke
  is the reason the unit is called a peon.
- **What it costs.** A settler that costs more than the current 20 shields
  changes expansion rates, which section 25 just finished measuring; expect to
  re-measure `targetCities` afterwards, because the two numbers are coupled.
- **Whether the AI needs both.** It currently builds settlers by one rule and
  everything else by another. A worker has no rule at all yet, and an AI that
  never builds one makes roads a player-only advantage -- which is the same trap
  as section 18's escorts, where a rule the AI cannot follow lands entirely on
  one side.

## 29. The points ending cannot express a tie

`checkElimination` sorts the survivors by score and takes the first:

```ts
const ranked = [...survivors].sort((a, b) => playerScore(b) - playerScore(a));
state.winner = ranked[0].id;
```

`Array.sort` is stable, so on an exact tie `ranked[0]` is **whoever comes first
in player order** -- the Horde, always -- and the game then logs that they are
"declared ahead on points". They are not. It is the one line in the game that
can state something false.

**Measured over thirty-six games: no exact tie occurred**, the closest being four
points. Two of the three endings do not involve scores at all, and dominance now
takes 78% of games, so points endings are only 7 in 36 to begin with. This is a
correctness problem rather than a frequency one -- and a human playing
deliberately to the limit will reach it far sooner than two AIs did.

### Where a draw would have to live

`winner: number | null` has no room for one, because **`null` already means
"still playing"** and is read that way in twelve places. So a draw needs either

- a separate `over` flag, with those twelve reads becoming `!isOver(state)`; or
- `winner` widened to carry a draw, which changes every read rather than twelve.

The first is the smaller change and the one to take. It also leaves `winner`
meaning exactly what it says, which the second does not.

### And what a draw should be

Worth deciding rather than defaulting:

- **A genuine draw**, ending with nobody winning. Fits the game's own opinion of
  the points ending, which it already describes as satisfying nobody, and is
  the funniest of the options.
- **Broken on something secondary** -- cities held, or population -- which keeps
  every game producing a winner at the cost of the joke.

A tie screen is prompted in ART_PROMPTS. It is deliberately **one picture rather
than one per faction**: conquest and points have a side that is winning them,
and a draw is the only ending where both sides have to be in the frame.

## 30. Section 11, first slice: built, and unmeasurable

Magical resistance, and two advances off the back of the tree that make magical
damage leave something behind -- **Setting Things Alight** (burning) and **The
Cold Shoulder** (slowed). Both `faction: 'both'`, both requiring Insanity, which
is where section 11 wanted them.

Also, section 11's own warning about freezing taken seriously: it said a unit
that cannot act is *"strictly better than damage and historically the thing that
breaks a strategy game"*. The groundwork had implemented frozen as `moves = 0`,
so it now halves movement with a floor of one -- otherwise a one-move unit is
frozen in place for the duration, which is exactly the failure being warned
about.

### It cannot be measured, and the reason is a defect

Both arms came out **identical to two decimal places** on turns, cities and
wins. The cause:

| | orc | human |
|---|---|---|
| magic units ever built, per game | **0.00** | **0.00** |
| magic units alive at the end | 0.00 | 0.00 |
| advances that unlock them, held | 0.94 | 1.22 |

**The AI never builds a death knight, a dragon or a mage.** Not rarely -- never,
in eighteen games, while holding the advances that unlock them. So resistance
protects nobody, magical damage never happens, and neither spell can fire.

That is the third time a mechanic has been explained before checking that it
occurs -- after the walls in section 24 and the caution in section 26. The rule
written down after the second time was *check that a mechanic occurs before
explaining anything with it*, and it should have been applied **before building
this**, not after.

The feature itself is correct and tested: eleven tests cover the advances, the
resistance, and that an axe carries no spell. A human player who builds a dragon
will get all of it. What cannot be claimed is that it does anything to a game
between two AIs.

### The defect is worth more than the feature

The dragon is the strongest unit in the game -- attack 10, defence 6, four
movement, and it flies -- and the AI has never once built one. Production step 4
sorts the attackers by attack and takes the first it can afford, so a dragon
should be the obvious pick the moment `full-of-fire` lands. Something between
those two facts is wrong, and until it is fixed:

- the back half of the tree buys the AI nothing, which is the whole complaint
  section 11 exists to answer;
- every remaining item in section 11 that touches a magical unit is equally
  unmeasurable, so **this wants fixing before the rest of the section is built**;
- and the AI is fighting every war with goblins and footmen while holding the
  advances for better.

Worth checking first: whether step 4 is ever reached at all, given steps 1 and 2
now return a defender or a settler far more often with `targetCities` at seven.

## 31. The joke ate the game

Section 30 asked why the AI never builds a dragon. It is not a bug in the
chooser. The chooser is right.

| | attack | defence | hp | cost | attack per shield |
|---|---|---|---|---|---|
| Four Orcs | 12 | 8 | 48 | 80 | 0.15 |
| **Dragon** | **10** | **6** | **25** | **90** | **0.11** |
| Three Trolls | 15 | 9 | 45 | 105 | 0.14 |
| **Two Death Knights** | **12** | **6** | **30** | **110** | **0.11** |
| Ten Orcs | 30 | 20 | 120 | 200 | 0.15 |

A dragon is weaker than four orcs, frailer than four orcs, and costs more than
four orcs. There is no situation in which building one is correct. The same is
true of every mage, death knight and ogre on the list -- the counting ladder
sits at 0.14-0.15 attack per shield and the specials sit at 0.11.

### Why it is worse than the table looks

The ladder multiplies **attack and health together**. Ten Orcs is ten times the
damage *and* ten times the hit points for ten times the price, and two
quantities multiplied is a square: a stack twice the size wins roughly four
times as hard, not twice. Cost is linear, effectiveness is quadratic.

Nothing priced linearly can ever compete with that, which means the specials
were never going to be built no matter what was hung off them. **This is why
section 11 measured as inert, and it would have made every later item in
section 11 inert too.**

The gag -- that N orcs on one tile is strictly efficient -- turns out to be
*too* true. It is the correct answer to every question in the game, and it has
quietly turned the entire right-hand half of the tech tree into scenery.

### The proposal on the table

From the design conversation: attacks are answered -- **a defender strikes
back** -- **advanced units may strike more than once**, and **ranged attackers
are not struck back at all**. Plus the sanity check that gives it its shape: an
ogre should not lose to a footman, nor a knight to a goblin, unless it was
nearly dead already.

That is not decoration, it is the counter to the square law, for a reason worth
writing down:

- **Extra attacks multiply damage without multiplying health.** This is the
  only shape of bonus the ladder cannot copy, because the ladder buys both at
  once and this buys one.
- **Ranged units taking no answering blow removes their health from the
  equation entirely.** Their worth stops depending on the quantity the ladder is
  good at, so an axethrower becomes a different thing rather than a worse orc.
- **A tough unit shrugging off a weak one** means defence has to stop trading
  proportionally somewhere -- some floor or threshold -- and a threshold is
  exactly what a linear ladder cannot buy its way past.

Each of the three attacks the same weakness from a different side, which is
promising, and is also three separate mechanics that want measuring one at a
time rather than as a bundle.

**Nothing else in section 11 should be built until this is settled.** Clubs and
perks hung on units that are never built are three more inert features, and the
lesson from sections 24, 26 and 30 is that this gets checked first.

## 32. Losses, and what Civilization actually does

Two changes, and then the reason neither is enough on its own.

**A count unit fights with what it has left.** `aliveCount` reads the health bar
and reports survivors: Ten Orcs at half health is Five Orcs, swings like five,
holds like five, and the badge on the map shows `5` in red rather than the `10`
that set out. **A singleton never degrades** -- a dragon on its last legs
breathes the same fire, because there is only ever one of it.

**Odds are recomputed every round.** They were computed once before the fight
and reused, so losses could not bite inside a battle -- a stack fought at full
strength down to its last hit point. That single line is what made the first
version of this measure as nothing at all.

### What it bought

Duels, 400 runs each, attacker's win rate:

| | before | after |
|---|---|---|
| Dragon attacks Four Orcs | 1% | **20%** |
| Four Orcs attacks Dragon | 97% | **81%** |
| Two Ogres attacks Three Footmen | 62% | 72% |
| Dragon attacks Ten Orcs | 0% | 0% |

Real movement, right direction, nowhere near enough -- and across full games it
is close to inert, because **the AI buys on the type's paper stats** and on
paper a dragon is still worse than four orcs at a higher price. Wins went 6-9
to 5-10 and specials built stayed at 0.00.

### What Civilization does, and why it cannot have our problem

From Civ4's combat rules and the Civ3 probability derivation:

- **Strength is multiplied by current HP over maximum.** Civ4 has done exactly
  the losses idea since 2005, and applies it to every unit rather than only to
  stacks.
- **Per round, the attacker wins with `R/(1+R)` where `R = A/D`** -- which is
  `A/(A+D)`, algebraically the same as ours. That part already matched.
- **Damage per round is `floor(20*(3A+D)/(3D+A))`, floored at 6 and capped at
  60.** Ours is a function of *maximum health* and ignores strength entirely.
  This is the real gap: in Civ4 a stronger unit hits harder *and* takes less,
  which compounds, so quality kills quickly instead of grinding.
- **First strikes** are free rounds in which only one side does damage -- which
  is the "ranged attackers are not struck back" idea, already in the game it
  came from.
- **Withdrawal** lets a losing *attacker* retreat at its pre-final-round health.
  That is "Better Part of Valour" from section 11, near enough exactly.

Three of the four things proposed in this conversation turn out to be things
Civ4 already does. That is a good sign for all three.

**And the fourth thing is the one that matters most: every Civ4 unit has 100
hit points.** Strength is the only axis that varies. Civ3 is the same within a
narrow veteran band. The Civ3 derivation shows why that is not an accident --
win probability compounds over *both* the strength ratio and the hit point
counts, so a system where one number raises both is exponential in that number.

Our ladder raises both. Ten Orcs is ten times the damage and ten times the
health for ten times the price, and the two multiply. **That is the root, and
nothing bolted on beside it will fix it.**

### The fork

- **(a) Flatten health.** Count scales attack and defence; health stays at the
  base creature's. Kills the square law at the root and makes the original joke
  *sharper* -- a ten-stack is terrifying and no harder to kill than one orc, so
  losing it is the catastrophe the design document always said it was. Biggest
  change to the feel of the game.
- **(b) Health scales as the square root of count.** Ten Orcs gets 3.2x health
  and 10x attack. Keeps a stack meaningfully tough while dropping the exponent
  from 2 to about 1.5.
- **(c) Price the count superlinearly** and leave the stats alone. Honest, but
  it makes the top of the ladder unaffordable, which retires the joke rather
  than fixing it.
- **(d) Adopt Civ4's damage formula** so strength decides how hard blows land.
  Wanted regardless, and helps quality -- but on its own it does not remove the
  exponent.

**(a) or (b), plus (d), plus the specials repriced against whichever is chosen.**
Then first strikes and withdrawal, measured one at a time.

## 33. Flat health: the duels are fixed, the game is not

Health no longer scales with the count. Ten Orcs have ten orcs' attack, ten
orcs' defence, ten orcs' price, and **one orc's health**. Two supporting
changes fell out of it:

- **Execution is measured in shields.** `canExecute` used health as a stand-in
  for how big a thing was, which only worked while health scaled. Without the
  change a Death Knight could delete Ten Orcs, which is the exact case the
  guard exists to prevent.
- **The paladin heal still scales with the count**, deliberately. It is a share
  of the *patient's* health bar, and "one paladin patches you up halfway, two
  finish the job" is a designed mechanic that never had anything to do with how
  tough the healer was.

Four tests had to be rewritten rather than repaired. One of them required
`bigHits > smallHits * 4` -- it was pinning the bug down as though it were a
rule, and had been passing happily for months.

### Duels, 300 runs each

| attacker vs defender | health scaled | flat health |
|---|---|---|
| Dragon vs Four Orcs | 23% | **98%** |
| Dragon vs Ten Orcs | 0% | **64%** |
| Four Orcs vs Dragon | 84% | **2%** |
| Ten Orcs vs Dragon | 100% | **37%** |
| Death Knight vs Four Orcs | 0% | 44% |
| Ogre vs Three Footmen | 1% | 69% |

That is the target hit almost exactly: a dragon beats four orcs comfortably, and
ten orcs against a dragon is a real fight rather than a formality.

### And in a real game it made things worse

| | health scaled | flat health |
|---|---|---|
| cities, orc/human | 7.61 / 9.72 | **6.00 / 10.78** |
| wins, orc/human | 5 / 10 | **3 / 10** |
| specials built | 0.00 | **0.00** |

**Still zero specials.** The reason is the same one section 30 found and it has
not been addressed yet: production step 4 sorts the available attackers by raw
`attack` and takes the dearest it can afford. Ten Orcs has attack 30 and a
dragon has attack 10, so the AI still reaches for the stack -- except a stack is
now a 200-shield unit with twelve hit points, which is terrible value. **The
chooser is not merely missing the specials, it is now actively buying the worst
thing on the list.**

And the Horde suffers most, because the Horde is the side whose personality
leans on the counting ladder hardest.

So flat health is correct and insufficient. The next piece is not another combat
mechanic -- it is **teaching the AI what a unit is worth**, on some measure that
accounts for health and price rather than reading `attack` alone. Nothing else
in sections 11 or 32 can be measured until the AI will buy the units involved.

## 34. Teaching the AI what a unit is worth

One sort key. Production step 4 ranked candidates by raw `attack` and took the
dearest it could afford; it now ranks by **`attack * hp / cost`**, and step 1
ranks defenders by `defense * hp / cost` in place of `defense / cost`.

Sorting on attack was defensible only while health scaled with the group, when
attack stood in for everything. After section 33 it was actively harmful: Ten
Orcs is attack 30 with twelve hit points for two hundred shields, and it still
topped an attack-ordered list. The AI was not merely failing to notice the
dragons, it was buying the worst thing available.

Ties break towards the larger group on purpose. Every stat now scales linearly,
so one orc and Ten Orcs are worth exactly the same per shield -- but upkeep is
charged per *unit* rather than per orc, and a group holds one tile and spends
one movement point. That efficiency is the whole reason the ladder exists and
it never shows up in the value figure.

### Measured, 18 seeds

| | sorted by attack | valued |
|---|---|---|
| **specials built per game** | **0.00** | **48.11** |
| units built per game | 386.00 | 231.89 |
| x4+ ladder units | 15.28 | 6.33 |
| games decided | 13/18 | **18/18** |
| turns | 171.89 | 146.22 |
| cities, orc/human | 6.00 / 10.78 | 11.56 / 5.06 |
| wins, orc/human | 3 / 10 | **17 / 1** |

Most built, before: goblin 172.8, footman 114.6, peon 25.1, orc 20.7.
Most built, after: **troll 34.9, goblin 27.2, ogre 25.3, dragon 22.8, knight 19.0.**

**The back half of the tech tree is in the game for the first time.** Dragons,
ogres and trolls are built by the dozen where the count was previously zero, the
army is a third smaller and considerably better, and every single game now
reaches a decision instead of five in eighteen timing out.

### And the balance has flipped violently

17-1 to the Horde, from 3-10 against. This is a *different* problem and a much
better one: it is no longer a broken mechanism, it is an uncalibrated roster.

The Horde's specials are simply better buys than the Kingdom's -- a troll
regenerates, and an ogre and a dragon both return about 2.8 attack-health per
shield against a knight's 1.75. Nobody ever noticed, because until this commit
not one of them had ever been built and every fight in the game's history was
goblins against footmen.

**Next: reprice both rosters against the value measure**, now that there is
finally a measure to price them against, and re-check on a fresh seed set.

## 35. Repricing both rosters

Section 34 left the mechanism working and the rosters uncalibrated: the Horde
won 17-1 because its specials were simply the better buys, and nobody had ever
noticed because until that commit none of them had ever been built.

Six changes, aimed at the top of each roster rather than spread across it:

| unit | change | value before | after |
|---|---|---|---|
| Ogre | cost 50 → 62 | 2.80 | 2.26 |
| Dragon | cost 90 → 110 | 2.78 | 2.27 |
| Troll | cost 35 → 42 | 2.14 | 1.79 |
| Death Knight | cost 55 → 48 | 1.64 | 1.88 |
| Knight | hp 14 → 16 | 1.75 | 2.00 |
| Mage | cost 55 → 45 | 1.31 | 1.60 |

Value is `attack * hp / cost`, the same measure the AI now buys on. The troll is
deliberately below the band because it heals at twice the rate and that never
shows up in the figure; the death knight and the mage went *down* in price
because both were priced as heavyweights and fought like middleweights, so
neither was ever picked even after the AI learned to value units properly.

### Result, tuned on one seed set and judged on another

| | tuning set | fresh set |
|---|---|---|
| wins before, orc/human | 17 / 1 | 13 / 2 |
| **wins after, orc/human** | **9 / 6** | **10 / 5** |
| cities before | 11.56 / 5.06 | 10.78 / 5.78 |
| cities after | 8.72 / 8.11 | 10.06 / 8.17 |
| turns | 146 → 164 | 151 → 165 |
| games decided | 18/18 → 15/18 | 15/18 → 15/18 |

The fresh set moved the same way as the tuning set, which is the check that
matters -- this is a real effect and not a fit to eighteen maps. The Kingdom now
fields its best unit in numbers (paladins 21-23 a game, up from nothing) and the
city counts are within a city of each other on the tuning set.

**Two things it did not fix.**

- **The Horde still wins about 63% across the 36 games.** Better than 88%, not
  parity.
- **Decisiveness slipped**, from 18/18 to 15/18 on the tuning set, because games
  now run about 18 turns longer. Section 23 worked hard for that number and it
  should not be quietly given back.

The next lever is probably not more unit pricing. `targetCities` was set to 7
for the Horde in section 25, to rescue a Horde that was *losing* -- under a
combat model that no longer exists. The city counts say expansion, not combat,
is now carrying the remaining gap.

## 36. The Horde no longer needs rescuing

`targetCities` was set to 7 for the Horde in section 25, when six cities meant
being beaten to the land and losing 77% of its games. That number was measured
against a game where a stack bought damage and health together and the AI
reached for the biggest one it could afford. Sections 33 and 34 removed both.

Re-measured across three seed sets, 54 games:

| orc `targetCities` | wins, orc-human | cities | turns | decided |
|---|---|---|---|---|
| **6** | **25 - 24** | 7.5 / 8.1 | 148 | 49/54 |
| 7 | 32 - 16 | 9.4 / 7.7 | 157 | 48/54 |

Six is level -- one game apart over fifty-four -- and its games run about nine
turns shorter for the same decisiveness. Seven is now a 67% advantage. **The
rescue became a handicap on the other side the moment the Horde could field a
dragon instead of fifty goblins.**

### Two notes on method

The individual seed sets returned **7-11, 11-5 and 7-8** for the same setting.
Any one of them on its own would have argued something different -- one says the
Kingdom is comfortably ahead, the next says the Horde is. Eighteen seeds is not
enough to read a four-game swing, and this is the clearest illustration of it so
far in this file.

Second: three separate runs of this sweep were thrown away before this one,
because concurrent processes appended to the same output file and `npm test`
picked the diagnostic up and ran it a second time in parallel. The arms
interleaved and rows could not be attributed to seed sets. **A measurement you
cannot attribute is not a weak measurement, it is not one at all**, and the only
safe thing to do with it is delete it.

### Where that leaves the balance

Across sections 30 to 36 the Horde has gone 3-10, then 17-1, then 9-6, and now
25-24 over 54 games. The mechanism is sound and the rosters are calibrated. What
is *not* yet established is whether any of it holds up against a human, since
every one of these numbers comes from two AIs playing each other -- and the AI
buys on a formula that a person will happily ignore.

## 37. The magic block, re-measured: live, and marginal

Section 30 recorded the magic block as **unmeasurable** -- both arms byte-identical,
because no mage, death knight or dragon had ever been built. Sections 33 and 34
changed that, so the measurement was redone: two arms, two seed sets, 72 games,
with the control neutering `applySpellEffects` and zeroing the three
`magicResist` values.

| | magic on | control |
|---|---|---|
| magic units built (6000 / 31337) | 7.00 / 15.94 | 7.61 / 15.28 |
| spell advances held, of 4 | 2.44 / 3.00 | 2.44 / 3.00 |
| **burns per game** | **1.50 / 5.17** | 0.00 / 0.00 |
| **freezes per game** | **0.56 / 2.94** | 0.00 / 0.00 |
| wins, orc-human | 7-11 / 11-5 | 8-10 / 10-5 |
| turns | 135.89 / 163.78 | 137.00 / 163.11 |
| cities | 6.61/8.39, 9.17/7.78 | 6.67/8.39, 9.17/7.83 |

**It is no longer inert. It is marginal.** The spells fire -- the control's flat
zeroes confirm the arm is isolating the right thing -- but a game contains
roughly three burns and under two freezes across 150 turns and several hundred
combats, and nothing downstream moves. Wins differ by one game per set, which
section 36 established is well inside the swing of an eighteen-seed set.

That is a *better* result than section 30's, because it is a real number rather
than an absence. It is not a good one.

### Why it is rare, and what that implies for the rest of section 11

A spell needs three things to coincide: a magical attacker (7-16 of the ~230
units built), its owner holding one of two advances that cost 165 and 180 and
sit behind Insanity, and a fight happening. The advances land late, and the
units are a small minority even now that they get built at all.

**Any enhancement gated on a late advance and a rare unit will measure the same
way.** That is worth knowing before building confuse, three ogre clubs and three
perks: on this evidence they will each fire a handful of times a game and change
nothing measurable. They may still be worth building as texture -- a game is not
only its win rate -- but they should not be sold as a fix for anything.

### And the premise has partly expired

Section 11 exists because *"a game that has not been won by turn 200 has nothing
left to do but walk units at each other."* That was true when it was written.
Games now finish at 136-164 turns with 33 of 36 decided, and the fix came from
sections 23, 33 and 34 rather than from giving the tree somewhere to go.

So the anti-stalemate argument for section 11 is largely spent. The flavour
argument is not, and the confuse mechanic in particular is interesting on its
own terms. Worth deciding which of those is being bought before building it.

## 38. The AI had never used an ability

`useAbility` was called from `main.ts` and nowhere else. Not rarely -- **never**.
Every archer, axethrower, ballista and mage the AI has ever built walked up and
swung, and since section 34 taught it to value units properly it was buying
ballistas enthusiastically: attack 8 makes one the Kingdom's best purchase on
paper, and it is a twelve-health unit with a defence of one.

Ranged units already could not be struck back -- that was built, and
`fireAtRange` says so. The gap was entirely on the AI's side.

### Three attempts, and two wrong theories

**`fireIfPossible` and `takeAim`.** Shoot whatever is at reach, ranked by worth
over remaining health; otherwise step to a tile at exactly reach with nothing
closer, since reach is an *exact* distance and a unit that simply marches at the
enemy walks through its own firing position. Result: **18-16 became 12-20.**

**Wrong theory 1: the disarm asymmetry.** The Horde's only ranged unit throws
its axe and drops to a quarter strength; the Kingdom's three keep theirs; and
`resupply` had no AI caller either. All true, all verified in the source, and
all irrelevant -- adding a restock produced an arm **byte-identical to the
previous run**, because the code path never executed. That is the fourth time in
this file a result has been explained by a mechanism nobody checked *occurs*.

**What was actually happening**, once instrumented:

| | Horde | Kingdom |
|---|---|---|
| ranged units built | **0.00** | 19.6 |
| ranged attacks fired | **0.00** | **87.4** |

The Horde never builds an axethrower, because at 1.60 it is the worst combat buy
it has -- behind ogre 2.26, dragon 2.27, death knight 1.88 and a plain orc 1.80.
So teaching both sides to shoot handed the Kingdom eighty-seven free attacks a
game and the Horde nothing. **Same shape as sections 31 and 34: a mechanic is
inert because the units carrying it are never bought.**

**Wrong theory 2: `RANGED_EDGE = 1.4`.** `worth` is built from attack, health
and price and none of those can see "strikes without being struck back", so
reach was folded in. At 1.4 it put a ballista at 2.99 and every other ranged
unit level with the best melee in the game:

| | control | edge 1.4 |
|---|---|---|
| ranged built | 18 / 20 | **161 / 134** |
| melee built | 133 / 186 | 100 / 104 |
| decided | 18/18 | 13/18 |

An eighth of the army became two thirds. `worth` can see reach now but still
cannot see *fragility*, so nothing pushed back.

### Where it landed

`RANGED_EDGE` at 1.15, and **the axe is retrievable** -- a thrower that spends a
turn not throwing wanders over and picks it up, so it throws every other turn
rather than once per game. A single throw was priced for a unit with three times
the health this one has; flat health and the one-way disarm landed on the same
creature in the same week.

| | control | reach 1.15 + retrievable axe |
|---|---|---|
| wins, both sets | 18-16 | **15-15** |
| ranged survival | 31% / 19% | **45% / 32%** |
| ranged built | 18 / 20 | 93 / 105 |
| **games decided** | **34/36** | **30/36** |
| turns | 136 / 164 | 156 / 168 |

Ranged units are finally used and they survive, and the win split is level. **It
costs decisiveness**: 34/36 down to 30/36, with games about fifteen turns
longer, and section 23 worked hard for that number.

**Untested hypothesis for why:** `fireAtRange` deliberately cannot take a city,
so an army that is 44% ranged is worse at finishing a war than one that is 8%.
That is a guess with a plausible mechanism and nothing more -- which, given the
two wrong theories above, is exactly the point at which this file should stop
and go and measure rather than carry on reasoning.

## 39. Skirmishers, artillery, and three designs waiting on a decision

Sections 30, 31, 34, 37 and 38 all found the same thing in different clothes: a
mechanic is inert when the units carrying it are never bought. So this section
records the designs *and* what each one needs from `worth` before it can work.

### Built: first strike

Archers and axethrowers are no longer artillery. They close like anything else
and land free rounds at the start of a fight -- Civ4's first strikes, netted, so
two units that both strike first simply fight. Reach is now only on the mage and
the ballista, which is what stops an army half made of units that cannot enter a
city, and section 38 measured a third of all sieges being exactly that.

**The axe leaves the hand during the first strike**, which is both the joke and
now the mechanic: it fights the rest of the exchange bare-handed and fetches the
axe back a couple of turns later.

And a rule nothing in the suite had ever stated: **a ballista sees one tile and
shoots two.** A lone one is blind to everything it is allowed to hit and needs a
unit standing forward to spot for it. Found by accident, pinned by test.

### Measured, and it did not work

| | built per game |
|---|---|
| Horde axethrower | **0.00** |
| Kingdom ballista | **111.39** |

First strike did not get the axethrower bought. It sits at 1.86 against an ogre
at 2.26 and a dragon at 2.27, and it cannot win the garrison slot either, where
it is ranked on a defence of one. **`RANGED_EDGE` has now failed its stated
purpose twice** -- it never produced a single axethrower at any value -- while
taking the Kingdom from ten ballistas a game to a hundred and eleven.

The Horde's problem is not the multiplier. It is that its roster has two
excellent heavy units and the chooser takes the best it can afford.

### Three designs on the table

**Ammunition, for both artillery pieces.** The Goblin Catapult carries a fixed
number of goblins and throws them; goblins or orcs, singly or in groups, can be
*informed of their new job* to reload it. The ballista carries a fixed number of
missiles, and an archer can spend two turns making one, or it returns to a city
to restock.

This is worth building as **one mechanic, not three**: the axethrower's single
axe is already `ammo: 1` with a self-fetch, and the two artillery pieces are the
same idea with a different count and a different way of reloading. It also fixes
the ballista problem structurally rather than by tuning -- a hundred and eleven
ballistas cannot all be kept in missiles.

**Note for `worth`:** finite ammunition makes a unit *worse*, and the chooser
cannot see it. Without a term for it the AI will keep buying ballistas it cannot
feed. This is the same trap as reach and first strike, and it is now predictable
enough to write down in advance.

**The death knight takes health rather than giving it.** Choose one unit, take
half its health, restore twice that to another. The donor must be above half or
it dies -- buyer beware.

**Note on scale:** this idea is worth less than it was a week ago. Health used to
scale with the group, so a Ten Orcs was a 120-point battery. Flat health
compressed every creature in the game into a range of 8 to 25, so the difference
between draining a goblin and draining a dragon is 10 against 25, not 10 against
120. Still a real choice, but not the dramatic one it would have been, and worth
knowing before it is priced.

**A Goblin Catapult for the Horde.** Note `catapult` is already a *building* id
-- the Broken Catapult -- so the unit needs its own.

## 40. Ammunition, and the reason every number in this file is a cliff

Artillery is the only thing in the game that hits without being hit back and can
keep doing it forever, and the chooser rated a ballista the Kingdom's best
purchase on exactly that basis: a hundred and eleven a game. **Ammunition is the
structural answer** -- a hundred and eleven ballistas cannot all be kept in
missiles -- rather than another constant to tune.

Five bolts, then a reload. In the field the archery line hands one over at the
cost of its whole turn; a battery needs a tail, and the tail is paid in turns. A
city fills the magazine outright. `worth` prices it as a duty cycle,
`ammo / (ammo + reload)`, shipped in the same commit as the mechanic.

It also let `RANGED_EDGE` come back on. On its own reach was poison because
nothing pushed back against a unit that could shoot forever; a magazine is that
push-back, so the two can finally be priced against each other.

### And then the actual finding

Sweeping the magazine, on two seed sets:

| magazine | ballista `worth` | built per game |
|---|---|---|
| 3 | 1.84 | **0.5** |
| 5 | 2.04 | **5.3** |
| 8 | 2.15 | **93.7** |

**A 17% change in value moves production by two orders of magnitude.** The
Kingdom's list runs paladin 2.06, knight 2.00, archer 1.86 -- so at 1.84 the
ballista is fourth and never built, at 2.04 it is second and built five times, at
2.15 it is first and built ninety-three times.

**Production step 4 is winner-take-all.** It sorts by value and takes the single
best thing it can afford, so what matters is never a unit's value -- only
whether it *crosses* another unit in the ranking. Which explains, at last, every
strange result in sections 38 to 40:

- `RANGED_EDGE` at 1.05 and 1.15 producing byte-identical games. No crossing.
- 1.4 taking ranged from an eighth of the army to two thirds. One crossing.
- Adding ammunition taking ballistas from eleven to 0.7. One crossing, downward.
- The Horde never building an axethrower at any value, because an ogre and a
  dragon sit permanently above it.

**Every constant in this file is a cliff edge rather than a dial**, and a good
deal of the tuning recorded here was really an attempt to land a value in a gap
between two other values. That is why the numbers kept coming out as 0 or 111
and never as something in between.

### What to do about it

The fix is not a better constant, it is a chooser that builds a **mixture**.
Options, roughly in order of how principled they are:

- **Role quotas.** An army wants some of each thing; build whatever it is
  shortest of. Most like a real 4X, most work.
- **Weighted choice.** Pick among the affordable candidates in proportion to
  worth rather than taking the maximum. Cheap, and turns every cliff into a
  slope immediately.
- **A cap per type**, as a share of the army. Crude, but it would have stopped
  a hundred and eleven ballistas on its own.

An army of one unit type is also simply worse -- it is why the Kingdom fielded
a hundred ballistas and had nothing left to storm a city with. **This should be
fixed before any further unit is priced**, because until it is, every price is
being chosen against a ranking rather than against the game.

## 41. Weighted choice: the cliff becomes a slope, and a shortlist that was noise

Section 40 found that production was winner-take-all -- it sorted by value and
took the single best affordable unit, so a unit's value never mattered, only
whether it *crossed* another unit in the ranking. Candidates are now drawn in
proportion to `worth ** 4` instead.

### It worked, and the proof is the same sweep

Ballistas built, sweeping the magazine over the same seeds:

| magazine | winner-take-all | weighted |
|---|---|---|
| 3 | 0.5 | **7.7** |
| 5 | 5.3 | **10.5** |
| 8 | 93.7 | **18.4** |

Two orders of magnitude of step function became a smooth, proportionate climb.
**Every constant in this file is now a dial rather than a cliff edge.**

And the finding that came free: **the axethrower is built at last**, 17 to 26 a
game, having been 0.00 at every value of every multiplier tried in sections 38
to 40. It never needed to beat the ogre and the dragon. It needed the chooser to
stop giving everything to first place. The whole `RANGED_EDGE` saga was solving
a problem that did not exist.

Both sides now field seven or eight kinds of fighter, against effectively two to
four before.

### The shortlist: proposed, measured, and dropped

Weighting across everything affordable taxes whoever has the worse floor, and
the Horde's is worse -- a goblin at 1.0 and a sapper at 1.2 against a Kingdom
footman at 1.2 and an archer at 1.86. On the tuning seeds the Horde lost 9-24.
So candidates were restricted to the best few, which is what a person does
anyway.

On the tuning seeds a shortlist of six looked like the answer: **16-14**, near
level, against 9-24 without.

On two seed sets that had never been used, it **inverted**:

| | 6000 / 31337 | 77000 / 91234 |
|---|---|---|
| no shortlist | 9-24 | **13-16** |
| shortlist 6 | **16-14** | 11-21 |

The shortlist was a fit to two seed sets, chosen against numbers that swing by
five wins per set. **Dropped.** Plain weighted choice ships; the extra concept
does not.

Two process notes worth as much as the result:

- The confirmation run existed only because section 36 established the ±5 swing,
  and it killed a change that was one commit from shipping. This is the first
  time in this file that a held-out seed set has actually vetoed something.
- The control arm in that run was **mislabelled**. `git stash` removed only the
  uncommitted shortlist, so what ran as "winner-take-all" was really "weighted,
  no shortlist". It was caught by noticing the Horde fielding eight kinds and
  twenty axethrowers -- numbers winner-take-all cannot produce. **Reading the
  composition, not just the win column, is what caught it.**

## 42. The Goblin Catapult: it works, and it does not matter

The Horde's answer to the ballista, off Underground Smarts. Five goblins in the
hopper, attack 7, and like all artillery it cannot take a city. The reload is the
whole difference between the two pieces: the Kingdom's is fed by people who make
missiles, and this one is fed by the missiles.

**A sacrifice loads the whole group**, so Three Goblins is three shots. That is
the first use the counting ladder has ever had other than fighting, and it is
the part of this worth keeping.

Only creatures marked `expendable` go in -- goblins and orcs. A rule rather than
a price threshold, so nothing can ever work out that a dragon is cheap enough to
fire at a wall.

### Measured

| | catapults/game | artillery alive | of those dry | wins orc-human | decided |
|---|---|---|---|---|---|
| no catapult | 0.0 | 3.8 | 0.03 | 11-19 | 30/36 |
| hopper 3 | 3.0 | 6.2 | 0.12 | 10-19 | 29/36 |
| hopper 5 | **4.7** | 6.0 | 0.14 | 10-18 | 28/36 |

**It is built, it stays loaded, and it changes nothing.** Dry catapults run at
0.1 a game, so the goblins reliably volunteer -- the sacrifice reload works
exactly as intended. The win split does not move at any setting.

That is a fine outcome and it should be reported as what it is: **a texture
feature**. It gives the Horde a siege train, gives the ladder a second purpose,
and tells a good joke. It is not a balance fix and should not be recorded as
one.

The hopper went from three to five as a **parity correction rather than a buff**.
Three was picked out of the air and quietly made the Horde's artillery the
weaker piece -- 1.81 against the ballista's 2.04, which under weighted choice is
the difference between fifth on the list and near the top. Matching the
magazines removes an asymmetry that was never intended.

### The outstanding question is elsewhere

Across every recent measurement the Kingdom leads: 10-18 here, and base 6000 in
particular returns 3-12, 4-12 and 4-9 across three separate arms while base
77000 returns 7-7 and 6-9. That is a persistent lean plus a large per-map
effect, and no unit added in sections 38 to 42 has touched it.

**Worth attacking directly rather than through another unit.** The Kingdom's
roster is deeper in the useful middle -- archer, knight, footman, ballista all
land between 1.8 and 2.1 -- while the Horde's splits into two excellent heavies
and a weak floor. Weighted choice buys across the whole list, so depth in the
middle is now worth more than a good top end, and the Horde has the wrong shape.

## 43. Art that has arrived ahead of the code

Processed and live:

- **The three standing orders** -- coin, beakers, calm. The build list has had
  slots held open for these since section 39; they now fill.
- **The Goblin Catapult** -- sprite, attack animation and hurt sheet. It needed
  adding to `CREATURES` in the pipeline, which is a hardcoded list, exactly like
  the tech and building lists were in section 39. **Third time.** Anything added
  to `src/model/units.ts` needs adding there too or its art is silently skipped.
- **`goblin-toss`**, a six-frame effect strip, now wired as the catapult's
  projectile.

### Two things waiting on code

**The three ogre clubs.** `ogre-fiery_attack`, `ogre-exploding_attack` and
`ogre-quake_attack` are processed and sitting in `public/units/`. The units do
not exist -- they are section 11's club variants, still unbuilt. The art is
ready whenever they are.

**The axe throw has nowhere to play.** `PROJECTILES` is only read for the
`ranged` ability, and the axethrower stopped being artillery in section 39 -- it
closes and throws the axe as its opening blow. So its entry was dead code and
has been removed. The animation and the sound are both still in the game and
still good; re-homing them needs an effect to fire from `resolveCombat` when a
first strike lands, which nothing currently does. Worth doing: it is the most
visible mechanic in the game with no visual at all.

## 44. The clubs, and a correction to section 37

Section 11's three clubs, built as promotion choices gated on an advance. They
differ in *who* they catch rather than how hard they hit, which is what makes
choosing between them a decision rather than a ranking.

### Measured, and the gate that nearly made them pointless

| | clubs taken/game | spread |
|---|---|---|
| advance unlisted | 2.1 / **0.2** | uneven; exploding never taken on one set |
| **advance prioritised** | **4.3 / 3.1** | fiery 1.4/0.9, exploding 1.6/1.0, quake 1.3/1.2 |

`club-improvement` was not on the Horde's research list, so it was only ever
picked up by the cheapest-thing fallback -- late, and on one seed set
essentially never. **The whole ogre line was reachable in principle and reached
almost never**, which is section 37's prediction landing exactly: an enhancement
gated on a late advance and a rare unit fires a handful of times a game.

With the advance on the list the clubs are taken three to four times a game and
all three appear in roughly equal numbers. The win split does not move -- 10-19
against 9-20 -- so like the Goblin Catapult this is **texture rather than
balance**, and should be recorded as such.

Two things were caught by inspection rather than measurement, which is a change
from most of this file:

- The AI would never have taken a club at all. Its taste list holds all six
  general perks and rank stops at three, so the fallback that reaches a club is
  never reached. Spotted before the first measurement rather than after it.
- A fixed preference order would have given every ogre in the game the same
  club. The choice is drawn at random among the three instead -- the promotion
  equivalent of section 40's winner-take-all problem.

### Section 37 is superseded

Section 37 concluded the magic block was **live but marginal**: burns at 1.50
and 5.17 a game, "roughly three burns and under two freezes across 150 turns",
and nothing downstream moving.

**Burns now run 24 to 47 a game.** Nothing was done to the magic block. What
changed is section 41: weighted choice means mages, death knights and dragons
are actually built, so the spells that were waiting on them now fire five to ten
times as often.

That verdict should not be trusted as written. It was correct about the game it
was measured in, and that game no longer exists -- which is worth noting as a
general hazard of this file, since **every conclusion here is conditional on the
version of the AI that produced it.** Section 36's `targetCities` finding was
overturned the same way, by the combat model changing underneath it.

## 45. Advisors, and two levers that make disorder survivable

Section 9 had twelve finished portraits, a full brief in `docs/advisor_bible.md`
-- role, appearance, personality and a sample line each -- and **not one line of
code**. It was the largest gap in the project between what was drawn and what
was playable.

### The three pieces

**An empire divides its trade three ways.** Coin, study and keeping people calm,
in twelfths, starting perfectly even, and you cannot raise one without lowering
another. Trade was previously split two ways by a `taxRate` fixed at 4 that had
no interface at all.

Spending on calm raises what a city will put up with, and is deliberately
measured against the trade the *tiles produce* rather than the trade collected,
because collection is zero during disorder. A rule reading the collected figure
would do nothing at the one moment anybody wants it to. The city in a riot is
not gathering that money; the empire is spending on it regardless, which is what
buying your way out of a riot means.

**Rush-buying during disorder was already allowed**, and never had been blocked
-- `rushBlocked` never looked at it. Three tests now pin that down so it cannot
quietly acquire a check later. What cannot be rushed is a standing choice like
Placating, which has no cost to pay.

Between them these are the two ways out of a riot that do not require an advance
to turn up for unrelated reasons, which section 21 measured as most of the gap
between the two sides.

**Twelve advisors.** Each has an ordered list of concerns, and **the order is
the character**: the Knight-Marshal checks for enemies before he checks for
walls, because he would always rather attack than build. They are not experts
and they do not agree -- the Paladin distrusts the mages the Archmage keeps
asking for, and the Death Knight considers your goblins expendable, using the
same flag the Goblin Catapult loads itself with.

### Three details worth keeping

- The situation is gathered **once** and handed to all six, so two advisors
  cannot disagree about the facts. They may only disagree about what to do.
- It reads the viewer's own player only. An advisor alarmed about an enemy the
  viewer has not found would be a fog-of-war leak with a face on it.
- Idle lines are chosen **by turn rather than at random**, so opening the panel
  twice in one turn cannot get two opinions out of the same person.

And a `count` helper, because an advisor who says "1 cities" stops sounding like
a person immediately. Nineteen lines went through it.

### What this does not do

Nothing here touches balance, and it is not meant to. The advisors are read-only
and the AI does not consult them. The trade split is a lever a *human* can pull;
the AI still leaves it on even, so every measurement in sections 30 to 44 stands
unchanged.

Worth noting for later: **the AI never adjusts its rates**, which means a human
who spends on calm has a tool the AI does not use. That is a real advantage and
it is unmeasured.

## 46. Advisors that move while they talk

Section 9 asked for advisors "using the animation the game already has rather
than anything new". The still portraits are in and wired; the talking cycles are
drawn and not yet processed.

**What is sitting in `art_src/advisors/Talking Cycles/`:** twelve sheets, one
per advisor, each 512x2064.

### What the implementation has to deal with

- **They are vertical strips.** Every strip the pipeline slices today is
  horizontal -- the Goblin Catapult's attack is four frames from 2064x512, and
  these are the same four frames from 512x2064. `slice_strip` will need to know
  which way round it is looking, rather than assuming.
- **Four frames of 512x516**, not 512x512: 2064 does not divide by four evenly
  at 512, and the existing slicer already handles the horizontal case the same
  way. Worth confirming rather than assuming, since a one-pixel drift per frame
  is exactly the kind of thing that looks like bad art rather than bad maths.
- **Two filenames do not match their ids.** `Ogre talking.jpg` is the Ogre
  Quartermaster and `Troll talking.jpg` is the Troll Headhunter. The aliased
  pass added for the portraits already exists for precisely this and just needs
  a second map.
- **The Blademaster may want redrawing.** Flagged in the design conversation;
  check his cycle against his portrait before wiring the set, since a mismatch
  between the still and the animation is more noticeable than either being
  slightly off on its own.

### The shape it wants: ask one, and let the others interrupt

The panel shows six advisors at once, which is the right shape for "six people
who disagree" and the wrong shape for animation -- six looping faces is a lot of
movement for a screen somebody is trying to read.

**Resolved: you ask one.** Click an advisor and they animate and answer. The
others may then reply, but only if they *disagree*, which is the part that makes
this worth building rather than a hover effect:

- It gives the animation a reason to start and a moment to stop, so nothing
  loops in the corner of the eye.
- **It turns the panel from six opinions into an argument**, which is what the
  characters were written for. The Paladin distrusting the mages the Archmage
  just asked for is already in the writing; this is the shape that lets him say
  so out loud.
- It is the first thing in the game where the advisors relate to each other
  rather than to the empire, so `Concern` will need a notion of who a line
  contradicts -- probably a tag on the concern rather than pairwise rules
  between advisors, which would be thirty-odd relationships to maintain.

That means a GUI change, so it is deliberately **not** an immediate piece of
work. The stills are wired and the cycles are drawn; this is the design they are
waiting on rather than a blocker for anything already shipped.
