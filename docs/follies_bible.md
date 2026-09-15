# Follies bible

Reference doc for the Folly (wonder-equivalent) system — mechanic, full
roster, and flavor. For the `TechDef` code, existing-tech attachments, and
art prompts, see `follies.md`.

## What a Folly is

A Folly is a unique building — one that can only exist once, either once per
faction or once in the whole game. Twelve total: 4 shared between both
sides, 4 orc-only, 4 human-only, split evenly city-wide and civ-wide within
each group.

**Eleven of the twelve ride on an advance you already have** — no new
research, just one more building added to what that tech already unlocks,
the same way `joy-making` already grants both a Totem and a Chapel. **Only
one is a new advance**, because it needs both `pyromancy` and `cryomancy`
already known, and those two don't sit on one chain.

**City-wide** Follies sit in one city and benefit that city only.
**Civ-wide** Follies benefit the whole faction once built, no matter which
city holds them.

**Shared Follies are a race.** Both sides can research toward one (since the
tech they ride on is already shared), but only one copy of it will ever
exist — whoever finishes building it first gets it, and the other side's
invested production converts back into their city's normal production
rather than being lost.

## Shared Follies

*Race-built. Same wonder either way, no matter which side finishes it.*

### The First Ledger — city
*Rides on: Not You Again!*

The original tax record, preserved out of either reverence or spite. It has
been copied so many times nobody is sure the original numbers were ever
right.

**Effect:** +50% market/treasury output in the city that built it.

### The Yelling Wall — city
*Rides on: Tower Building*

A wall so tall both sides claim credit for the idea. Nobody remembers who
suggested it first. Everyone remembers whose idea it definitely wasn't.

**Effect:** +2 sight for the city, sees through all terrain.

### The Long Peace — civ
*Rides on: Insanity*

Erected during a brief, genuine cessation of hostilities, and finished just
after hostilities resumed. The plaque was updated. The peace was not. The
same research that produced this also produced the frenzy to end it —
nobody has commented on the timing.

**Effect:** +1 content citizen in every city, stacking with Happiness.

### The Argument With The Sky — civ
*New advance, needs: Setting Things Alight, The Cold Shoulder*

Fire and cold were each mastered separately and immediately turned on each
other. The weather has held a grudge ever since. The only Folly that
required its own dedicated research — everything else here was already
sitting in the tree, waiting to be built.

**Effect:** Magical attacks apply both the burning and slowing effects
together.

## Orc horde Follies

### The Loudest Rock — city
*Rides on: To Be An Orc*

The biggest thinking-rock ever raised, mostly so orcs can shout at it from
further away. It has never once thought anything back. This is considered a
feature. Not to be confused with the Considerably Bigger Rock, a completely
different rock, built for entirely unrelated reasons, under Underground
Smarts.

**Effect:** Orc units trained in this city start with +1 attack.

### The Bonepit — city
*Rides on: Axes Make You Crazy*

An ever-growing monument built from every enemy the Horde has definitely,
actually, historically beaten. The pit does not lie, though it has been
known to exaggerate.

**Effect:** Orc units trained in this city start at +1 experience level.

### The Bargain Stone — civ
*Rides on: The Dead are Messed Up*

A record of every deal struck with the dead, kept mostly so nobody has to
remember the terms out loud a second time. Built by the same research that
first made bargaining with the dead a documented practice.

**Effect:** Death Knight bargains cost less of the caster's own side's
health.

### The Long March — civ
*Rides on: Full of Fire*

The Horde has finished writing down its one plan for the late game and has
now also finished walking there ahead of schedule.

**Effect:** +1 movement for all orc units.

## Human alliance Follies

### The Unfinished Cathedral — city
*Rides on: Hammers of Glory*

Construction has been "almost done" for two generations. The committee
overseeing its completion has itself required a committee. Filed, fittingly,
right alongside the Hall of Careful Notes.

**Effect:** +1 content citizen in this city, stacking with Happiness.

### The Rumbling Archive — city
*Rides on: Rumbling Voice*

Every recorded instance of someone's voice making something true.
Cross-referencing it against actual events has been deliberately
deprioritised.

**Effect:** Mage-line units trained in this city get +1 range.

### The Long Vigil — civ
*Rides on: We'll Run You Through!*

A vow, sworn once, renewed constantly, and never once actually finished
being kept.

**Effect:** +1 defense for all mounted units (Knight and Paladin lines).

### The Learned Committee — civ
*Rides on: Lordship*

A standing body convened to watch the horizon on the Kingdom's behalf. It
has produced fourteen reports and no horizon. Convened the same year the
Parade Ground was finished, for reasons the committee has not yet reported
on.

**Effect:** +1 sight for every human unit.

## Design notes

- **Riding on an existing tech beats inventing one**, almost every time.
  Eleven of twelve Follies fit an advance already in the tree — several of
  which (`tower-building`, `axes-crazy`, `full-of-fire`) had nothing or very
  little attached to them already. Only reach for a new advance when the
  prereq genuinely doesn't exist yet, as with the one that needs both
  elemental branches known at once.
- **Check for collisions before reusing a concept.** The first pass invented
  "The Loudest Rock" without noticing `underground-smarts` already grants
  "The Considerably Bigger Rock" — close enough to read as the same joke
  told twice. Rehoused on a different tech once caught.
- **Mirrored tiers, not mirrored jokes.** Orc and human Follies at a
  comparable tier ride on techs of similar cost and depth (`to-be-an-orc`
  45 / `hammers-of-glory` 85 roughly matches `axes-crazy` 80 / a bit under
  `rumbling-voice` 100, `dead-messed-up` 130 pairs with `run-you-through`
  125, `full-of-fire` 185 pairs with `lordship` 150) — but the flavor for
  each stays true to its own faction's register, orc leaning into boastful
  exaggeration and score-settling, human leaning into bureaucratic
  non-completion.
- **Shared Follies read as genuinely co-authored**, not owned by either
  side — the flavor text for all four avoids crediting one faction, since
  either one might be the one that actually finishes it.
- **Effect numbers are unplaytested placeholders** — see `follies.md` for
  the caveat and the open engineering questions (civ-wide activation
  timing, where uniqueness is enforced, shared-Folly refund mechanics).
