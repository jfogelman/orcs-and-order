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

### Measured: orcs win 78% of games, and not by fighting

Eighteen seeds, two identical AIs, played to a verdict:

```
wins            orc 14   human 4        (78% orc)
avg cities      orc  8.2  human  7.6
avg advances    orc 17.7  human 18.6
avg units       orc 31.2  human 34.9
reached turn limit                 16/18
```

Fourteen of eighteen on a fair coin is about a 1.5% result, so this is real. An
earlier six-seed read of 4–2 was *not* significant, and should not have been used to
draw any conclusion — six seeds is enough to catch a faction being hopeless and
nothing more.

**The interesting part is how the orcs win.** They are behind on advances *and* behind
on units. So they are not out-teching or out-fighting anyone. And 16 of 18 games ran
to the turn limit, where the winner is decided by:

```
score = cities × 10  +  population × 3  +  advances × 5  +  units × 1
```

Humans lead the two terms that were measured and still lose, so the whole margin sits
in **cities and citizens** — the two heaviest terms. The orc AI sprawls, and sprawl is
what the score pays for.

Both of the two games that ended by *conquest* were won by the humans.

### Fixed: the scoring formula (done)

The flat per-city term is gone. It was:

```
cities × 10  +  population × 3  +  advances × 5  +  units × 1
```

which paid 13 points for planting a size-1 settlement and never developing it, on top
of whatever population it eventually grew. That made "found cities everywhere and
ignore them" the winning line, which is exactly what the sprawlier AI was doing.

It is now:

```
population × 4  +  advances × 6  +  buildings × 4
```

Cities still count — through the citizens living in them and the structures built
there — but they are paid for the parts that took effort. Advances are weighted up,
because the tech ladder is the entire point of the game. Units are no longer scored at
all: an army is a means, not an achievement, and conquest already wins outright.

**Still open:** roughly 90% of games reach the turn limit, so the score is deciding
almost everything regardless of how it is weighted. Making conquest achievable is the
larger fix and is untouched — see below.

### Making conquest achievable — still open

Attacking a walled, fortified city stacks x2 for Walls, x1.5 for fortifying and up to
x3 for terrain, and the AI never concentrates force, so wars grind on without
resolving. Worth trying, in order of cheapness:

1. Have the AI mass units before attacking rather than feeding them in one at a time.
2. Let siege units (`sapper`, `ballista`) ignore the Walls multiplier rather than
   merely getting a bonus against cities.
3. Reconsider whether Walls should be x2 on top of everything else.

### Faction levers, if they are still needed afterwards

1. **Human AI caution 0.6 → 0.45.** It declines fights it would win. Cheapest possible
   change, one number.
2. **Human `garrisonPerCity` 2 → 1 once Walls are built.** Two per city ties up much
   of the army standing still.
3. Only then look at unit stats. The per-shield numbers are close: orcs lead slightly
   on attack, humans clearly on defence, which is the intended shape.

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

## 4. Also queued, from earlier

- **Unit-driven buildings.** A building that only functions while a matching unit
  garrisons it. Would give idle late-game units a job, and would make the Goblin
  Treasury's blurb literal: a treasury that leaks gold to whoever sacks the city.
- **Manual city tile assignment.** Citizens are auto-assigned greedily.
- **Unit movement animation.** Units teleport between tiles.
- **End-of-turn summary.** What happened while you were not looking.
- **Naval units**, which would make the map's islands mean something.
