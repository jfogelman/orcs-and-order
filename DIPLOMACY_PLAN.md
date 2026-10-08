# Meeting somebody, and how it goes from there

A plan to react to, not a specification. Section 135.

Two things asked for: **you should hear from a side when you first meet it**,
rather than simply discovering you are at war with it; and **the state between
two sides should have a name** — Peace, Uneasy, Joyful, Tense, Angered,
Concerned, War. Simple logic throughout: no conversation trees, no negotiation
minigame.

## The thing that has to change first

`state.diplomacy.peace` is **one flag for the whole game**, not one per pair. It
was a fair simplification with exactly two empires and section 125 already
caught it being a lie — `empires()` carries the note:

> Without this, a Horde-Kingdom treaty would have quietly made the Hivekin
> peaceful toward both. If a later faction *does* negotiate, this is the line
> that has to become a peace per pair rather than a flag.

This is that later faction. So the first slice is bookkeeping, and everything
else is cheap once it is done:

```
relations: Record<PairKey, {
  standing: number;        // -100..100, the only stored number
  met?: number;            // the turn they first laid eyes on each other
  peaceUntil?: number;     // a treaty, while one is running
  lastClash?: number;      // the turn they last fought
  betrayals?: number;      // peaces this pair has broken
}>
```

`PairKey` is the two ids, smaller first: `"0:2"`. Everything already on
`state.diplomacy` — `distrust`, `shameUntil`, `lastClash` — moves in here and
stops being per-player.

## Jeremy's answers, 2026-10-07

All four, and the first one changes the shape of it.

**The Hivekin talk.** "Alien to orcs and humans, not silent" -- and they already
have the advisor for it: the Voice, whose whole joke is mimicking humanoid
emotion at something that does not have any. So `talks()` becomes true for them
and the bible's "fought, not talked to" is retired.

What makes them alien is not silence, it is **what moves their number**. The
same scale, weighted by what the Hive actually cares about:

| | empires | the Hive |
|---|---|---|
| units lost | -12 a fight | **about nothing** |
| a city taken | -25 | **-45 for a Hive** |
| being hemmed in | -- | **-2 a turn with no room to found** |
| much the stronger | -- | **matters, both ways** |

A side that does not mind losing units but minds losing ground, and reads the
balance of power before anything else. That falls straight out of "uncaring
about units except from a hive survival perspective", and it means their mood is
legible without a word of special-case prose.

**And they do not attack what will destroy them.** This is not `caution`, which
is one unit weighing one fight at one-in-three odds. This is the Hive declining
a *war*: strength against strength across the whole board, and no opening of
hostilities it cannot survive. Expansion is the goal; being wiped out is not a
price it will pay for ground.

**Peace can be sued for at War, with a price that moves.** No hard floor --
instead the existing "wanting" score in `DIPLOMACY_AI` gains three terms, all of
which make a long bad war easier to end than a short winning one: how long the
war has run, what it has cost in units and cities, and the balance of power. The
loser asks sooner; the winner holds out.

**The number is shown, on a -50 to +50 scale**, with the name as its band.

**Meeting reveals, both ways.** Whoever walks into whom, both sides learn where
the other is. Fair, and it makes scouting a thing you do *to* somebody rather
than a thing you get away with.

## The names are derived, never stored

**Store the causes, show the label.** A stored mood is a mood nobody can
explain, and the first question a player asks is "why are they angry". One
function, and it reads top to bottom:

A plain ladder on one number from -50 to +50, with **War** the only thing that
overrides it:

| shown | standing |
|---|---|
| **War** | *fighting now, or a peace broken within `warMemory`* |
| **Angered** | -50 to -30 |
| **Tense** | -29 to -15 |
| **Concerned** | -14 to -5 |
| **Uneasy** | -4 to +9 |
| **Peace** | +10 to +34 |
| **Joyful** | +35 to +50 |

Seven names, one number, no state machine. A signed treaty is a **separate
fact** shown beside the mood -- "Tense, truce 12 turns left" -- rather than a
word in the ladder, because the two really are different things: a side can be
furious and bound, or friendly and unbound.

The player sees `Tense (-22)`. The AI reads the number and never the word.

## What moves the number

Small, auditable, and nothing clever:

| | |
|---|---|
| they attack us | −12 a fight |
| they take a city of ours | −25 |
| a peace signed | +20 |
| a peace kept to its end | +10 |
| a peace broken | −45 and a betrayal recorded |
| a turn with no fighting | +1, to a ceiling of 0 for a pair with no treaty |
| a third side takes a city from either of us | +4 — a shared problem is a friendship |
| they are running away with the game | −1 a turn while somebody holds a third of the world |

The drift toward 0 matters: without it, one bad century is permanent, and a
player who has not seen that side for eighty turns is still being punished for
a border skirmish.

## First contact

When two sides can see each other for the first time, the one being met
**says one thing**, chosen by simple rules — not a tree:

- **The Hivekin** make a statement rather than an opening position. They do not
  negotiate (`talks()` is false for them and should stay false): what you get is
  the fact of them, and `standing` starts wherever the rules put it. This is the
  one that most needs saying out loud, because a third side appearing out of the
  ground with no word at all is exactly the complaint.
- **An empire** picks from four, on its personality and the board: a greeting, a
  warning about a border, a demand for tribute, or a declaration. The Horde
  leans to the last two and the Kingdom to the first two, which is the `lean`
  table that already exists in `DIPLOMACY_AI`.

Starting standing comes off the same simple facts: how close their nearest city
is, whether either has an ending under way, who is ahead. **War is still a
legitimate opening** — Jeremy's point is that it should be *announced* rather
than assumed.

## What it has to change in play, or it is decoration

- **The AI reads `standing`, not just `atPeace`.** `nearestEnemyTarget` already
  skips a side at peace; it should also weigh a side it merely dislikes less
  than one it hates.
- **Peace offers need a floor.** Below Angered, nobody is asking.
- **The Diplomacy Advisor finally has something to advise on** — six advisors
  just got their posts, and that one has had the thinnest job of the six.
- **The Talks screen shows the table**: every side you have met, the name of the
  state, and the one sentence saying why it is that.

## What this costs to measure

**War by default is what every balance number in this game was measured
against.** If two empires now open at Uneasy and have to be pushed into a war,
the early game changes shape, and the 61/39 Horde lead is measured against a
game that no longer exists. That is a 216-game bill, not a sweep I can fold into
the feature.

Cheapest honest answer: a `RELATIONS.enabled` lever, off being exactly today's
game, and one paired sweep on against off. The same shape as every other section
here.

## Slices

1. **Per-pair relations.** The bookkeeping above, `hostile()` and `atPeace()`
   reading it, no behaviour change — today's game expressed in the new shape and
   measured to prove it is still today's game.
2. **The names.** Derived label, the Talks table, the advisor line. No rules
   change at all; it is a window onto slice 1.
3. **First contact.** The message, the opening stance, the starting standing.
   This is the one that moves balance, and it gets the sweep.
4. **Standing in the AI's decisions.** Targets weighed by it, offers floored by
   it. Measured separately, because it is the half that could quietly end wars
   altogether.

## Spies, sketched -- their own section, not this one

Asked for as a next step, and worth noting now because **the hard part is
already built**. Section 125 taught this game that a unit can be on the board
and not visible: `seenBy` is the single place that question is answered, and the
Burrower-caste proved the concept in anger. A spy is a Burrower that gathers
instead of fighting.

Roughly, and to be argued about later:

- **A unit that is not seen while it is still.** Sits in or beside a rival's
  city and reports what it can see of it: what is being built, what garrisons
  it, how far along an ending is.
- **Upgrades along the Burrower's shape**, one linear then two branches. Read a
  city; read the standing itself, which is the one thing diplomacy cannot
  otherwise tell you -- *their* view of *you*; and one rung that acts rather
  than watches.
- **Acting has a price in standing**, which is what ties this to diplomacy
  rather than making it a separate toy: being caught is a swing against you and
  a betrayal on the record, weighed by the AI the way breaking a peace is.

What it must not become is a second combat system. One unit, three upgrades,
and everything it does is *information* except the last rung.

## Open questions for Jeremy

All four answered above. What is left is narrower, and most of it can wait
until slice 1 is standing up:

- **Does the Hive's own standing mean anything to the Hive?** It will talk and
  it will hold a treaty, but "Joyful" is a word about a thing with no feelings.
  The Voice mimicking an emotion it does not have is the joke; whether the Hive
  *acts* on the mood or merely reports it is a real mechanical choice, and
  "reports it, acts on the arithmetic" is the funnier and the simpler.
- **How long is a war before it counts as long?** The tiring term needs a shape,
  and twenty turns is a guess rather than a measurement.
- **Does breaking a truce with one side cost standing with everybody?** It
  should, a little -- nobody likes a side that breaks its word, and it gives
  `betrayals` something to do beyond the pair that suffered it.
