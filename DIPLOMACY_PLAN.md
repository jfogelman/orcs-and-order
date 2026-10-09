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

## First contact — **built, slice 3**

When two sides can see each other for the first time, **both of them say one
thing**, chosen by simple rules — not a tree:

- **The Hivekin** make a statement rather than an opening position: what you get
  is the fact of them, and the Voice calls it "a warm welcome". This is the one
  that most needs saying out loud, because a third side appearing out of the
  ground with no word at all is exactly the complaint. (`talks()` is still false
  for them. Flipping it is its own slice — see **3b** below.)
- **An empire** picks from four, on its personality and the board: a greeting, a
  warning about a border, a demand for tribute, or a declaration. The Horde
  leans to the last two and the Kingdom to the first two.

Starting standing comes off the same simple facts: how close their nearest city
is, whether either has an ending under way, who is ahead. **War is still a
legitimate opening** — Jeremy's point is that it should be *announced* rather
than assumed, and a declaration calls `noteClash`, so the pair reads **War**
from the sentence rather than from the first casualty.

Two things changed from the draft above, both while building it:

**Both sides speak, not just the one being met.** "The one being met" needs the
game to know who walked into whom, and a sighting does not carry that: two units
can walk into each other on the same turn, and a side can be met by a *town*
that did not move. Both speaking is simpler, symmetric, and fair the way the
reveal is. A human side says nothing, having no personality to say it with.

**The lean is its own constant.** `DIPLOMACY_AI.lean` is in points of *wanting
peace*; this one is in points of *standing*. Same shape, same sign, separate
number — a shared constant in two units is a constant that will eventually be
rescaled for one of them and quietly break the other.

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

**What the sweeps actually said.**

Slice 1 and 2 were measured with `PEACE.enabled` off against on, because there
is no "old shape" lever to compare against — the old shape is gone, and a
diplomacy that still swings the game the way it did before the rewrite is a
rewrite that kept its promises. Over 216 games:

```
arm            set        orc  hum  hive  turns  fights  caps  conquest
no treaties    tuned       21   21    12    232      26   6.6         4
no treaties    held-out    21   18    15    219      26   5.5         7
treaties       tuned       23   18    13    242      20   6.0         2
treaties       held-out    23   16    15    222      22   5.2         8
```

Fights fall on both seed sets (26→20, 26→22) and games run longer on both
(232→242, 219→222); who wins barely moves — the Hive is 27/108 against 28/108,
and the four-to-five-game swings between the empires are inside chance at this
sample size. That is diplomacy doing exactly its job: it dampens the war without
reshaping the ladder. **The rewrite kept its promises.**

Slice 3's lever is `CONTACT.enabled`, and the prediction was written into
`sweep.run.test.ts` before the run: more fights, more captures, more conquest
endings, shorter games.

**The prediction failed.** Paired over 108 seeds: fights -0.46 (t = -0.59),
captures +0.10 (t = +0.21), turns -1.44 (t = -0.39), conquest endings 10 against
9. Writing the prediction down first is the only reason this is a failure rather
than a story about a half-fight a game.

The next step was the one the plan had already committed to -- count the
mechanism before believing or disbelieving anything. `CONTACT.trace` counts how
many tiles a meeting *newly* explores, and over 18 games **0% of meetings told
nobody anything, at 35-39 fresh tiles each**. So the reveal is not failing to
reach; the premise behind it was simply wrong, and that goes to DESIGN_QUEUE as
a question about the AI rather than about diplomacy.

**The one number that moved does not survive its own mechanism check.** The
Hivekin won 28 of 108 with contact off and 19 with it on -- paired, 13 seeds
lost against 4 gained, McNemar z = 2.18. Three reasons it is not banked: one
seed set carries it (tuned 8/1, held-out 5/3, the latter nothing on its own); no
second column in the table moves with it; and it is one of three winners
compared, so 2.18 is worth less than 2.18 on a named number.

Then the obvious mechanism was tested directly, because losing is a coin flip
and *cities* are a number. Hive cities, same seeds, contact on against off:

```
             t150          t200          end
tuned     10.00 / 12.67  12.00 / 11.11  4.56 / 3.56
held-out  10.67 / 12.00  10.11 / 11.56  2.33 / 2.89
```

Only turn 150 agrees across the sets, and by the end the two sets point opposite
ways -- with the Hive ending **larger** on the tuned set, which is the very set
that lost it eight wins. "Being found costs the Hive ground" is refuted rather
than merely unsupported, so the win drop stays unexplained and unbelieved.

**What slice 3 ships as, then: a feature with no measured balance cost.** Which
is the outcome worth having. The meeting, the mood and the reveal are all real
and all visible, and the 216-game bill this section was warned would cost came
back saying the game underneath is unchanged.

## Slices

1. **Per-pair relations.** The bookkeeping above, `hostile()` and `atPeace()`
   reading it, no behaviour change — today's game expressed in the new shape and
   measured to prove it is still today's game.
2. **The names.** Derived label, the Talks table, the advisor line. No rules
   change at all; it is a window onto slice 1.
3. **First contact.** The message, the opening stance, the starting standing.
   This is the one that moves balance, and it gets the sweep. **Built.**
3b. **The Hivekin at the table.** `talks()` true for them, and the AI's table
   loop widened from one rival to everybody it can sign with — `rival()` in
   `ai/diplomacy.ts` still picks the first other talker, which was the only
   possible answer with two empires and would pick arbitrarily with three; and
   `lastOffer` is keyed per player, so asking one side would block asking the
   other. **Kept out of slice 3 deliberately.** It is a second lever on the same
   sweep, and two balance movers in one paired run means neither gets
   attributed. Jeremy's answer retires "fought, not talked to"; this is where.
4. **Standing in the AI's decisions.** Targets weighed by it, offers floored by
   it. Measured separately, because it is the half that could quietly end wars
   altogether.

## Spies -- now `SPIES_PLAN.md`

The sketch that was here has grown into its own plan, on Jeremy's brief of
2026-10-08: two tiers a side, the low one disguised as an enemy unit and the
high one not drawn at all, both uncovered by an enemy spy searching its eyeline
or by attacking or being attacked, every action rolled and improved by
experience and promotions.

The paragraphs below are the original sketch, kept because the argument for
*why here* is still the argument:

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

## The narrower questions, answered 2026-10-08

- **Does the Hive's own standing mean anything to the Hive?** *"Mechanically,
  in that survival trumps all else, and expansion means survival too (they
  don't have the capacity to understand running out of resources exactly in a
  holistic sense, but they can grasp things like farming and so on to avoid
  starvation). The Voice mimics emotion in an alien manner."* Built as
  `hiveWants` in slice 3b: the balance of power weighted hard, room to grow,
  and no lean, no distrust and no raiders term at all.
- **How long is a war before it counts as long?** *"Give our general 300 end
  state, I'd put 20 as a little low, but let's say 25 is 'long'."* **Not yet
  built** -- it belongs with slice 4, where `wantPeace` gains the war-length
  and losses terms that answer 2 asked for and that are still missing.
- **Does breaking a truce cost standing with everybody?** *"Yes, although we
  haven't implemented a 'reputation' yet. Something good to queue. For now,
  yes, breaking a truce affects how trustworthy you are and how likely you are
  to be attacked without warning in the future."* **Not yet built.** The
  trust half already exists globally -- `betrayals` is keyed per player and
  `wantPeace` reads it -- so what is missing is the *standing* half, a smaller
  hit to every third party when a treaty is torn up. Reputation as its own
  thing is queued, and `SPIES_PLAN.md` argues it is spies that make it worth
  having rather than a second scoreboard.

## Older open questions

All four of the originals answered above. What is left is narrower, and most of
it can wait until slice 1 is standing up:

All three are answered above, and two of the three are still to build.
