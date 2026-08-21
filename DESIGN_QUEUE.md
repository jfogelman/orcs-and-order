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

**Both are in.** Worked tiles carry a one-pixel border in the owner colour,
your own only. A unit fortified or on sentry inside its own city is drawn as a
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
