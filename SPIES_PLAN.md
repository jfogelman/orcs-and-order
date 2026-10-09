# Somebody who is not who they say they are

A plan to react to, not a specification. Jeremy's brief and his answers to the
first round of questions are both folded in.

The brief: *"spy units for our three factions. A low level and high level type
-- they can disguise themselves as regular units (low level) but can be
uncovered by an enemy spy intentionally searching eyeline, or if they are
attacked or attack. High level is invisible, but same deal for being uncovered.
All spy actions (including uncovering other spies) is slightly random, but can
be improved with xp and promotions."*

## The one constraint, stated first

**This must not become a second combat system.** Every temptation below ends
there: assassination, sabotage with damage rolls, spy-versus-spy duels with
their own odds table. The game already has one system for two units deciding
which of them is still standing, and it has been measured for a hundred and
thirty sections.

What makes a spy frightening is not what it can break. It is that you do not
know where it is.

## The hard part is already built

Section 125 taught this game that a unit can be on the board and not visible.
`seenBy` in `sim/burrow.ts` is the single place the question "can this player
see that unit" is answered, and the Burrower-caste proved the concept in anger
-- it sinks, it crosses under things, and `markedAt` gives the enemy a
disturbed patch of dirt and nothing else.

A spy is a Burrower that gathers instead of fighting. Nearly all the plumbing
this needs is a second reason for `seenBy` to say no, and a `shownAs` beside it.

## Two units a side

All three factions build them: *"Yes all factions can build spies."*

| | the Horde | the Kingdom | the Hive |
|---|---|---|---|
| **low** | **Skulker** | **Factor** | **Mimic-caste** |
| **high** | **Nobody** | **Intelligencer** | **Hollow-caste** |

The jokes write themselves and should be allowed to. The Horde's spy is an orc
who has been told to be quiet and is visibly trying very hard; its high rung is
called Nobody, so every report about it is *"Nobody was there, Nobody saw
anything, Nobody has been in the treasury."* The Kingdom's Factor is a
commercial agent with a satchel of perfectly genuine paperwork, and its
Intelligencer files. The Hive's Mimic-caste is grown to look like whatever it
has been looking at, badly; the Hollow-caste is grown to look like nothing.

## Low: disguised, and you choose the disguise

Asked whether a spy should look like one of its own units or one of the
enemy's: *"you can choose whether your spy appears as your own normal unit or
one of theirs."*

So it is an order the unit carries, switchable, and the two settings buy
completely different things.

**Worn as one of yours** — it shows to everybody as an ordinary Goblin, Footman
or Fodder-caste of your own side. The enemy will attack it like any other unit
of yours, so it buys nothing in their land. What it buys is in *your* land:
nobody can tell which of your six goblins is doing the counter-spy work, and a
spy that is never identified is never specifically hunted. This is the setting
for sitting at home and searching.

**Worn as one of theirs** — it shows to that side as a unit of their own, and
their AI will not target it, because every "is this hostile" question in the
game is asked of the owner and to them the owner reads as themselves. This is
the setting for the walk in. It is a lie that breaks the moment anything
touches it.

The second is stronger and far more fragile, which is the right shape for a
choice. **The unit's `owner` stays honest either way** or half the rules in the
game break; what changes is a `shownAs` the *viewer* resolves, asked wherever a
unit is drawn or listed, the way `seenBy` is asked wherever one is seen.

### It shows in the garrison list, and that is the defence

Confirmed — *"disguised spy would show up yes"* — and, on whether a side with
no spies has any defence at all: *"You can potentially notice an extra unit you
own."*

That settles it, and settles it well. **The tell is the defence.** A player who
knows their own army has one more Footman in it than they built has found a spy
without owning one. The interface must not do that counting for them: a
garrison list that helpfully flagged the total would hand the answer over and
throw the whole mechanic away.

The AI needs the same check written explicitly, since it has no eyes to be
suspicious with — a cheap per-city comparison of what it believes it garrisons
against what the tile says, rolled rather than certain.

## High: not there at all

Nobody, the Intelligencer and the Hollow-caste are simply not drawn. This is
the Burrower's existing rule with a different trigger, and the same two
decisions apply:

- **It still occupies ground.** A unit that cannot be seen but can be bumped
  into is a puzzle, not a surprise.
- **It leaves something, vaguely.** The Burrower leaves disturbed dirt. The
  open question is whether a city it sits in gets any hint at all, or whether
  the city's own contentment check below is the only thing standing between it
  and a permanent resident.

## Who notices, and how

Four ways a spy is found, and only one of them needs a spy of your own.

**A spy searching its eyeline.** It spends the turn searching, looks at every
tile it can currently see — its own sight, not the empire's — and rolls for
each hidden or disguised enemy unit in it. On a success the thing is revealed
permanently to the searcher's whole side, and is an ordinary unit again that
can be killed like one. Eyeline rather than radius is deliberate: it makes a
spy's *sight* worth promoting, and makes where you stand a real question.

**A city that is pleased with itself.** *"More joyful cities are more likely to
notice spies, including ones with barracks."* This is the passive defence and
it costs no new building at all — `isCelebrating` already answers "content, big
enough to matter, and still growing", and `barracks` already exists. A happy,
well-garrisoned town is one where everybody knows everybody and the stranger is
conspicuous; a rioting one has other things on its mind. It is also a lovely
incentive, because it pays for contentment in a currency that is not score.

**Counting your own units**, as above.

**Attacking, or being attacked**, which blows either tier instantly.

## The dice, and what improves them

Every spy action rolls — *"all spy actions might fail"* — and the brief says
*slightly* random. Slightly is the operative word: a mechanic that fails a
third of the time is a mechanic players stop using.

Starting numbers, all guesses to be measured rather than defended:

| | base | at rank 3 |
|---|---|---|
| search finds a given low spy | 60% | 85% |
| search finds a given high spy | 35% | 65% |
| an action succeeds | 75% | 95% |
| a failed action is *noticed* | 50% | 20% |

That last row is the important one and the one most likely to be got wrong.
**Failure and exposure are two different rolls.** A spy that fails has wasted a
turn; a spy that is noticed has caused a diplomatic incident. Keeping them
separate is what lets a promotion make a spy *safe* rather than merely
effective, which is a more interesting thing to promote toward.

### Where the experience comes from

The part the brief implies and does not solve: **a unit that never fights earns
no experience**, because `XP` in `sim/combat.ts` is awarded for fighting. A spy
that can only improve by promotion, and can only be promoted by fighting, never
improves at all.

So spy actions have to grant it:

- A successful action: a full share.
- A failed action nobody noticed: a small share. It learned something.
- Being caught: nothing. Obviously.
- **Surviving a search it was in the eyeline of**: a small share — which is how
  a spy sitting in a watched city slowly becomes good at sitting in watched
  cities.

### Promotions

`PERKS` already takes an `only` list of base creatures and a `flag` for an
advance that must be in hand, so spy perks need no new machinery — just
entries, named per side as the existing ones are:

- **Sees Further** — eyeline for searching. The counter-spy's perk.
- **Nothing To Report** — the "noticed" roll drops sharply. The survivor.
- **Thorough** — the action roll improves. The professional.

## What a spy can do, and what gates it

The three-rung ladder in the first draft is gone. *"I think spies can do
anything potentially but tech advances are the capability gaps — starts simple,
more get unlocked later, no third rung."*

That is better, and it is the shape the game already uses: `PERKS` has a `flag`
field for exactly this, and DESIGN_QUEUE section 11 asked for a unit's menu of
choices growing as the tree does. So there is no tier of abilities — there is
**one unit whose menu lengthens**, and a late advance lands as something
visible rather than another number.

Roughly in unlock order:

- **Read a city.** What it is building, what garrisons it, how far along an
  ending is. What a spy is for, from the first advance.
- **Read the standing** — *their* view of *you*, the one thing diplomacy cannot
  otherwise tell you. Section 135 made that a number; this is what makes
  knowing it worth a unit.
- **Foment discontent.** *"Spies can foment discontent too although this gets
  absorbed into the city — same as sabotage."* The effect lands on the city the
  way any unhappiness does, and the victim is told **that** it happened and
  **nothing else**: not which unit, and **not which side**. Somebody is doing
  this to you and you do not know who.

  That is the whole mechanic, and it is sharper than the first draft had it.
  A victim who knows which empire is at work can act — close a border, weigh
  the standing, declare. A victim who knows only that their city is turning on
  them has a problem with no address. **The name is the prize for catching
  somebody**, and the only way to get it, which is what makes the search worth
  a unit's whole turn and what makes being caught the real price.
- **Sabotage**, the same shape — absorbed into the city, and anonymous until
  somebody is caught.
- **Turn somebody**, late and expensive. *"A 'turn' enemy option later too,
  including a 'delay' to betray at a later time (using random chance + gold to
  recruit, failure is reported back)."* Gold buys a roll; success buys a unit
  that changes sides, now or on a turn you choose; **failure is reported back
  to the other side**, which is the price, and which makes the gold a real bet
  rather than a tax. The delayed betrayal is the best idea in the brief and
  deserves its own slice — a unit that is secretly yours, sitting in their
  line, is the whole fantasy of the thing.

## Yes, we need new advances — five of them

Asked directly, and the answer is not the comfortable one. **There is nothing
in the tree this can hang off.** The shared spine is thirteen advances and all
thirteen are about land, walls, weather or mood: Mapmaking, Tree-Hugging,
Bridge Building, Wall Building, Tower Building, Not You Again!, Hammers of
Glory, Joy Making, Happiness, the three magics, Insanity. The faction ladders
are units and counting jokes. Not one advance in the game is about *knowing
things*, which is the gap spies live in.

**On the shared spine, not three ladders.** All three factions build spies, so
three parallel chains would be fifteen advances and fifteen icons to draw for
one feature. The shared spine is exactly where "everybody eventually works this
out" lives, and the flavour is already carried by the units themselves — a
Skulker and an Intelligencer learning the same advance and doing visibly
different things with it *is* the joke.

Five, in the order they unlock, named in the spine's register:

| id | name | unlocks |
|---|---|---|
| `someone-elses-business` | **Someone Else's Business** | the low spy, and reading a city |
| `asking-around` | **Asking Around** | searching — the counter-spy's whole job |
| `a-word-in-the-wrong-ear` | **A Word In The Wrong Ear** | fomenting discontent, and sabotage |
| `nobody-in-particular` | **Nobody In Particular** | the high spy, and reading the standing |
| `everyone-has-a-price` | **Everyone Has A Price** | turning somebody, and the delayed betrayal |

Two things that fall out of the ordering and are worth stating.

**Searching unlocks second, before anything offensive.** A tree where the
first thing anybody learns is how to hurt a city is a tree where the first
hundred turns of spycraft are unanswerable. Putting the counter second means
the defence is available before the attack exists, which is the same reason
Wall Building sits where it does.

**Reading the standing is gated behind the high spy**, not sold separately. It
is the one thing diplomacy genuinely cannot tell you, and it should cost the
expensive unit.

**Art bill: five advance icons**, prompts written and waiting in ART_PROMPTS
under *The five spy advances*. They read as a sequence and none of them is a
person, since the whole subject is somebody you cannot see: a keyhole with an
eye behind it, a shuttered lantern, a note pushed into stonework, an empty
hood, and a coin in an open palm.

## The advisors are how any of this reaches you

*"Would prioritize from the advisors POV if anything happens."*

Right, and section 124 already built both the machinery and the argument:
*"the log is extremely easy to ignore, critical notifications should be modal
popups instead."* A city of yours going restless for no reason you can see is
exactly the sort of news that changes what you do next, and it should arrive
the way a folly or a broken peace arrives — from the advisor whose portfolio it
is, saying what it means rather than that it happened.

The Diplomacy Advisor finally has a job here, which section 135 noted was the
thinnest of the six.

## The tie to diplomacy, which is what stops it being a toy

**Being caught costs standing**, weighed the way breaking a peace is, and
recorded as a betrayal — and being caught is also the *only* moment a victim
learns whose spy it was. Everything a spy does before that is anonymous, so the
whole diplomatic cost of the feature is paid at the instant of capture and not
before. That is the whole reason this belongs after section 135
rather than before it: `STANDING` and `betrayals` already exist, `wantPeace`
already reads betrayals, and a spy caught in a city you are at peace with
should be something the other side holds against you for a long time.

It also gives Jeremy's third diplomacy answer somewhere to land. On whether
breaking a truce should cost standing with everybody: *"Yes, although we
haven't implemented a 'reputation' yet. Something good to queue... breaking a
truce affects how trustworthy you are and how likely you are to be attacked
without warning in the future."* A reputation is exactly what a caught spy and
a torn treaty should both feed, and spies are the feature that makes one worth
having rather than a second scoreboard.

## The warning that has been written down three times

**The AI has to know spies exist, or the sweep measures nothing.** Section
125's slice B came back with two arms reading byte-identical numbers because
the AI had no route to the Burrower-caste and never built one. `BURROW.aiKnows`
carries the note; sections 37 and 38 carry it before that.

So the AI needs, at minimum: a reason to build one, a notion of where to send
it, a reason to search with the counter-spy, and the garrison-count suspicion
check above. If that is not in the first slice, the first slice is not
measurable and should not pretend to be.

## Open questions for Jeremy

All four of the first round answered and folded in. What is left is narrower:

- **What does a turned unit cost to keep?** A unit that is secretly yours in
  their line is extraordinary value for one payment. A standing cost in gold, a
  per-turn roll that it gets cold feet, or a short fuse before it must act —
  all three are defensible and they make very different games.
- **Does fomenting discontent stack, or does a city get one dose?** Two spies
  in one town either double the problem or waste one of themselves.
- **Can a spy wearing their colours walk into their city?** It is the obvious
  next step from "their AI will not target it", and it is also the single
  biggest jump in power in the whole feature.

## Art

**A disguised spy needs no art of its own while it is disguised** — it is drawn
as whatever it is pretending to be, and both an ordinary unit of yours and an
ordinary unit of theirs are already drawn. The sprites below are what it looks
like once uncovered, standing in the open with nowhere left to be. That is a
real saving and worth designing around.

House style as every other unit: full frame, no background, the usual mid-1990s
fantasy strategy look. Save as `art_src/units/<id>.<ext>`.

### Orc spies

| id | Prompt subject |
|---|---|
| `skulker` | A wiry green goblin crouched low in a dark grey hooded cloak several sizes too big and dragging on the ground, holding one finger to its lips with an enormous exaggerated wink, a stolen helmet of the wrong army tucked under the other arm |
| `nobody` | A tall thin orc wrapped head to foot in matte black cloth with only yellow eyes showing, standing perfectly still with both arms flat at its sides, a blank featureless wooden mask pushed up on its forehead, no weapon visible at all |

### Human spies

| id | Prompt subject |
|---|---|
| `factor` | A tidy human clerk in a plain brown travelling coat and soft cap, a locked leather satchel of ledgers under one arm, holding up a sheaf of entirely genuine paperwork with a small apologetic smile |
| `intelligencer` | A human in a dark blue high-collared coat and gloves, face half in shadow under a wide hat brim, one hand resting on a slim black cane, a sealed letter just visible inside the coat, entirely expressionless |

### Hive spies

| id | Prompt subject |
|---|---|
| `mimic` | A slender pale insectile figure whose chitin has gone blotchy and uneven as it tries to take on the blue and gold of a human soldier's tabard, the pattern not quite in the right places, head tilted at slightly the wrong angle |
| `hollow` | A tall translucent insectile figure, almost colourless, its chitin faintly glassy so that the background shows dimly through it, long limbs folded in close, no face markings at all |

### And one effect strip

Yes, the standard format: **a horizontal strip of exactly 4 frames**, each
frame square, on a plain solid magenta `#FF00FF` background, saved as
`art_src/effects/uncovered.png`. Four is the house default rather than a hard
rule — the pipeline slices any whole multiple of the frame height — and the
standing warning applies: **no magenta, hot pink or violet in the effect
itself**, since that is the key colour.

> pixel art visual effect animation, a horizontal strip of exactly 4 frames left
> to right showing the effect starting, growing, peaking and fading, each frame
> square and the same size, plain solid magenta background (#FF00FF) behind every
> frame, mid-1990s fantasy strategy game style, bright saturated colours, thick
> readable shapes, no characters, no text, no frame borders or dividing lines, no
> background scenery.

`uncovered` — a dark hood and cloak dropping away and crumpling, with pale
sheets of paper bursting outward and fluttering down around it. No blood and no
impact flash: being caught is an embarrassment, not a fight, and the sprite
under it is about to be an ordinary unit having an ordinary bad day.
