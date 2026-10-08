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

## The names are derived, never stored

**Store the causes, show the label.** A stored mood is a mood nobody can
explain, and the first question a player asks is "why are they angry". One
function, and it reads top to bottom:

| shown | when |
|---|---|
| **War** | fighting, or a peace broken within `warMemory` |
| **Angered** | standing below −40 |
| **Tense** | standing below −15, or they have broken a peace with us before |
| **Concerned** | standing below −15 *and* we are much the stronger — fear, not anger |
| **Uneasy** | no treaty, standing near nothing: the default of two sides that have met and done nothing about it |
| **Peace** | a treaty running |
| **Joyful** | a treaty running, standing above +40 |

Seven names, one number, no state machine. The label is a *view*; the AI reads
`standing` and the treaty, never the word.

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

## Open questions for Jeremy

- **Do the Hivekin stay silent?** They are "fought, not talked to" by the
  bible, and the plan above keeps that while still giving them a first-contact
  message. If they are to be playable, is their Talks screen simply empty?
- **Can a player sue for peace with a side at War, or only at Tense and above?**
  A floor makes wars finish; no floor makes them cheap to end.
- **Should standing be visible as a number, or only as the name?** The name is
  friendlier and the number is honest.
- **Does meeting somebody reveal where they are?** First contact implies a
  sighting, and that is a real intelligence gift.
