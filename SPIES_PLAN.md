# Somebody who is not who they say they are

A plan to react to, not a specification. Written while slice 3b's sweep ran.

Jeremy's brief, in full: *"spy units for our three factions. A low level and
high level type -- they can disguise themselves as regular units (low level)
but can be uncovered by an enemy spy intentionally searching eyeline, or if
they are attacked or attack. High level is invisible, but same deal for being
uncovered. All spy actions (including uncovering other spies) is slightly
random, but can be improved with xp and promotions."*

## The one constraint, stated first

**This must not become a second combat system.** Section 135's sketch said it
and it is worth repeating at the top, because every one of the temptations
below ends there: assassination, sabotage with damage rolls, spy-versus-spy
duels with their own odds table. The game already has one system for two units
deciding which of them is still standing, and it has been measured for a
hundred and thirty sections.

So: **everything a spy does is information, except one rung at the top.** The
thing that makes a spy frightening is not what it can break, it is that you do
not know where it is.

## The hard part is already built

Section 125 taught this game that a unit can be on the board and not visible.
`seenBy` in `sim/burrow.ts` is the single place the question "can this player
see that unit" is answered, and the Burrower-caste proved the concept in anger
-- it sinks, it crosses under things, and `markedAt` gives the enemy a
disturbed patch of dirt and nothing else.

A spy is a Burrower that gathers instead of fighting. Nearly all of the
plumbing this needs is a second reason for `seenBy` to say no.

## Two units a side

Low first, high second, and the high one is a late advance.

| | the Horde | the Kingdom | the Hive |
|---|---|---|---|
| **low** | **Skulker** | **Factor** | **Mimic-caste** |
| **high** | **Nobody** | **Intelligencer** | **Hollow-caste** |

The jokes write themselves and should be allowed to. The Horde's spy is an orc
who has been told to be quiet and is visibly trying very hard; its high rung is
called Nobody, so every report about it is "Nobody was there, Nobody saw
anything, Nobody has been in the treasury." The Kingdom's Factor is a
commercial agent with a satchel of perfectly genuine paperwork, and its
Intelligencer files. The Hive's Mimic-caste is grown to look like whatever it
has been looking at, badly, and the Hollow-caste is grown to look like nothing
at all.

## Low: disguised, not hidden

**It appears to the enemy as one of *their* units.** This is the reading the
brief forces: a spy that merely looked like an ordinary unit of its own side
would still be attacked on sight by anybody it is at war with, and "uncovered
if attacked" would never fire. Looking like one of theirs is what buys it the
walk.

So, concretely:

- The enemy's renderer and unit lists show it as a plausible unit of their own
  faction -- a Footman, a Goblin, a Fodder-caste -- standing where it actually
  stands. It is not invisible and it does not move oddly.
- **Their AI will not target it**, because every "is this hostile" question in
  the game is asked of the owner, and to them the owner reads as themselves.
- It is uncovered by three things: **a search** (below), **attacking**, and
  **being attacked**. The third is the one worth dwelling on: a disguised spy
  standing where an enemy wants to walk gets attacked as the stack it is
  pretending to be, which blows it and starts an ordinary fight it will lose.
  That is the cost of the disguise and it is a good one -- the safe tile is
  rarely the useful tile.

**The lie is in `seenBy`'s neighbourhood, not in the unit.** The unit's `owner`
must stay honest or half the rules in the game break; what changes is a
`shownAs` the *viewer* resolves. One function, asked wherever a unit is drawn
or listed, the way `seenBy` is asked wherever one is seen.

## High: not there at all

The Hollow-caste and its cousins are simply not shown. This is the Burrower's
existing rule with a different trigger, and the same two decisions apply:

- **It still occupies ground.** A unit that cannot be seen but can be bumped
  into is a puzzle, not a surprise.
- **It leaves something.** The Burrower leaves disturbed dirt; a spy should
  leave something comparable and vaguer -- see the open question about whether
  a city it is sitting in gets any hint at all.

Uncovering is the same three triggers.

## Searching, which is the whole counter

**Only a spy searches**, per the brief: *"uncovered by an enemy spy
intentionally searching eyeline."* So the counter to spies is spies, which is
elegant, cheap and has one obvious failure mode flagged as a question below.

The action, roughly:

- A spy spends its turn **searching**, which looks at every tile it can
  currently see -- its own eyeline, not the empire's.
- For each hidden or disguised enemy unit in that eyeline, roll. On a success
  the thing is revealed, permanently, to the searcher's whole side.
- A revealed spy is an ordinary unit again and can be killed like one.

Eyeline rather than radius is deliberate: it makes a spy's *sight* worth
promoting, it makes standing somewhere high or open matter, and it means the
answer to "where do I put my counter-spy" is a real question about the map.

## The dice, and what improves them

Every spy action rolls. The brief says *slightly* random, and slightly is the
operative word: a mechanic that fails a third of the time is a mechanic players
stop using.

Starting numbers, all of them guesses to be measured rather than defended:

| | base | at rank 3 |
|---|---|---|
| search finds a given low spy | 60% | 85% |
| search finds a given high spy | 35% | 65% |
| an action succeeds (read a city, read standing) | 75% | 95% |
| a failed action is *noticed* | 50% | 20% |

That last row is the important one and the one most likely to be got wrong.
**Failure and exposure are two different rolls.** A spy that fails is a wasted
turn; a spy that is noticed is a diplomatic incident. Keeping them separate is
what lets a promoted spy be *safe* rather than merely effective, which is a
more interesting thing to promote toward.

### Where the experience comes from

This is the part the brief implies and does not solve: **a unit that never
fights earns no experience**, because `XP` in `sim/combat.ts` is awarded for
fighting. A spy that can only improve by being promoted, and can only be
promoted by fighting, is a spy that never improves.

So spy actions have to grant it:

- A successful action: a full share.
- A failed action that nobody noticed: a small share. It learned something.
- Being caught: nothing. Obviously.
- **Surviving a search it was in the eyeline of**: a small share, and this is
  the one that makes a spy sitting in a watched city slowly become good at
  sitting in watched cities.

### Promotions

`PERKS` in `model/perks.ts` already takes an `only` list of base creatures and
a `flag` for an advance that must be in hand, so spy perks need no new
machinery at all -- just entries. Three suggested, named per side as the
existing ones are:

- **Sees Further** -- eyeline for searching, which is the counter-spy's perk.
- **Nothing To Report** -- the "noticed" roll drops sharply. The survivor.
- **Thorough** -- the action roll improves. The professional.

## What a spy is actually for

Three rungs, and only the last one acts:

1. **Read a city.** What it is building, what garrisons it, how far along an
   ending is. Available to both tiers.
2. **Read the standing** -- *their* view of *you*, which is the one thing
   diplomacy cannot otherwise tell you. Section 135 made that a number; this is
   what makes knowing it worth a unit. High tier only.
3. **One rung that acts.** Deliberately left as one rung and deliberately not
   specified here, because this is where the second combat system gets in.

## The tie to diplomacy, which is what stops it being a toy

**Being caught costs standing**, weighed the way breaking a peace is, and
recorded as a betrayal. That is the whole reason this belongs after section 135
rather than before it: `STANDING` and `betrayals` already exist, `wantPeace`
already reads betrayals, and a spy caught in a city you are at peace with
should be a thing the other side holds against you for a long time.

It also gives Jeremy's third answer somewhere to land. On whether breaking a
truce should cost standing with everybody: *"Yes, although we haven't
implemented a 'reputation' yet. Something good to queue... breaking a truce
affects how trustworthy you are and how likely you are to be attacked without
warning in the future."* A reputation is exactly what a caught spy and a torn
treaty should both feed, and spies are the feature that makes one worth having
rather than a second scoreboard.

## The warning that has been written down three times

**The AI has to know spies exist, or the sweep measures nothing.** Section
125's slice B came back with two arms reading byte-identical numbers because
the AI had no route to the Burrower-caste and never built one. `BURROW.aiKnows`
carries the note; sections 37 and 38 carry it before that.

So the AI needs, at minimum: a reason to build one, a notion of where to send
it, and a reason to search with the counter-spy. If that is not in the first
slice, the first slice is not measurable and should not pretend to be.

## Open questions for Jeremy

- **Does a side with no spies have any defence at all?** "Only a spy searches"
  is clean, but it means a player who has not built one can be read at will and
  has no move available except building one. A cheap building that searches its
  own tile -- a Watch House, a Listening Post, a Nest-ear -- would fix it, at
  the cost of a building slot. Or it is correct as written, and the answer to
  spies is simply spies.
- **Does a disguised spy show up in a city's garrison list?** It must, or it
  cannot stand in a city at all, which is most of the point. But then a player
  who *counts* their own units knows something is wrong. That is either a
  delightful tell or an infuriating one, and it depends on how much counting
  the interface does for you.
- **What is the third rung?** The one that acts. Steal gold, delay a build,
  blind a city for a turn, copy an advance. All of them are defensible and one
  of them is a second combat system wearing a hat.
- **Can spies be built by anybody, or does each side get its own route?** The
  Hive growing a caste for this is obvious. The Horde having a *sneaking*
  advance is funny precisely because it should not.

## Art needed, eventually

Six units -- two a side -- plus whatever the disguise shows, which is the
interesting one: **a disguised spy should be drawn as the enemy unit it is
pretending to be**, so it needs no art of its own at all until it is uncovered.
That is a nice saving and worth designing around.
