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
| 4 | Ranged attack | **target-select mode** in the UI |
| 5 | Axethrower disarm | (4), plus a new `Unit` field |
| 6 | Death Knight execution | nothing new |
| 7 | Dragon line attack | (4) |
| 8 | Paladin heal | (4), plus friendly targeting |

**Steps 4–8 all hang off one piece of UI that does not exist yet:** a mode where the
selected unit has an ability armed and the next click picks a *target* rather than a
destination. Build that once, carefully, and the rest are small.

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

### The ladder costs are lopsided, and it is not obvious which way### The ladder costs are lopsided, and it is not obvious which way

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

## 5. Also queued, from earlier

- **Unit-driven buildings.** A building that only functions while a matching unit
  garrisons it. Would give idle late-game units a job, and would make the Goblin
  Treasury's blurb literal: a treasury that leaks gold to whoever sacks the city.
- **Manual city tile assignment.** Citizens are auto-assigned greedily.
- **Unit movement animation.** Units teleport between tiles.
- **End-of-turn summary.** What happened while you were not looking.
- **Naval units**, which would make the map's islands mean something.
