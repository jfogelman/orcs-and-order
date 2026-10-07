# A third faction, and five wrong answers before the right one

Section 125: the Hivekin. A side that is not on the map when the game begins and
comes up out of unclaimed ground around turn a hundred, with its own roster,
its own tech fork, its own ending and its own reasons. Built in three slices,
then measured until it could actually win, which took considerably longer than
building it.

## What the Hivekin are

**The Hive As It Stands**, led by The Queen, Who Is Already Aware.

- **Fourteen castes.** Grub, Worker, Fodder, Soldier, Elite, Spitter, Burrower,
  Broodlord, Princess, Warden, Queen, Tide-caste, Riptide-caste, Bloat-caste.
  No caster and no flier, on purpose.
- **A Queen who does not move.** She sits in the first Hive and never leaves it,
  and that Hive makes nothing at all while she is not in it — production there
  is a thing she is doing, not a thing the city is doing.
- **Losing her is a clock, not an ending.** Five turns to grow a Princess into a
  replacement; walking one in on the last turn still counts, because the order
  of the tick checks the Princess before the countdown. If nobody does, the Hive
  is given up and everything it owned goes feral into the band that already
  exists, which invents no third kind of owner.
- **Spare Princesses become part of the Hive** — shields, calm, study or coin —
  and *which* is decided at conversion, not at build time. Insurance you choose
  the use of after you know whether you needed it.
- **Burrowers go under the ground.** Sink hides one where it stands; Burrow
  crosses two tiles *through* whatever is in the way and comes up on free
  ground. Both cost the whole turn.
- **Nobody negotiates with them.** There is no peace to be made with the Hive
  and none to be broken.

## Nothing in this game had ever been hidden

Fog of war is a fact about *tiles* — `player.visible` is a bitmap, and "a unit
on a lit tile is a unit you can see" was true everywhere until a Burrower went
under one. `seenBy` asks the new question and is deliberately the only place the
answer lives: the renderer, the AI's target search, `visibleEnemies` and the
pathfinder's occupant map all go through it. A rule about who can see what,
implemented four times, is four different rules within a month.

The pathfinder was the interesting one, and it came with a correction that
`militia.test.ts` caught: the first version routed *and resolved* moves on what
the mover could see, which let an army walk into a defended city and capture it
without a fight because the defender stood on an unlit tile. **Routing is
planned on what a player knows and resolved on what is true.** Walking into
somebody is how you find out they were there. The one thing genuinely not in the
way is a sunk Burrower — that is a fact about the Burrower, not about who is
looking.

## Why they could not win, five times over

Slice A measured **0 wins in 216**. Each of the following was a real fault, and
the first four could not have produced a win, because none of them was on the
path to one:

| | outcome |
|---|---|
| `PERSONALITIES[faction] ?? PERSONALITIES.orc` handed them the Horde's research plan, every line of which they cannot use | fixed — still 0 of 108 |
| `emergenceSpot` scored how empty the ground was, never what it yielded | fixed — still 0 |
| they arrived with one founder | fixed — still 0 |
| their fight bar was 0.50 against best-available odds of 0.44, so they declined eleven adjacent fights in twelve | fixed — still 0 |
| their road to their own ending cost 860 beakers over eleven advances, at 9.9 beakers a turn | fixed — **27 of 108** |

The last one is the section. Thirty-eight of fifty-four games are decided by
somebody finishing an ending; the Hivekin had built **no works in any game,
ever**. Their road is 165 beakers over four advances now, asked for fifth of
twenty-five — the most aggressive ending priority of the three sides, which is
what their research rate pays for — and the works cost 600 shields against the
other two endings' 1,000. Every one of their 27 wins is their own ending.

Repricing was measured and does nothing on its own: their advances per game read
11.8 whatever the road costs. An eleven-advance road was their whole game at any
price.

## The oldest joke, told the other way round

The Horde needs six advances and 590 beakers to get from one orc to ten, one
painful realisation about numbers at a time. The Hive gets two, at 120, each
raising every shape at once — *There Were Always This Many* and *You Had Assumed
Fewer*. A hive did not have to learn to count; being counted is something that
happens to it. It is also the only affordable shape, for the same arithmetic
that made their ending road unwalkable.

The Fodder-caste *is* the Goblin, stat for stat, so it took the Goblin's ladder
exactly; the Soldier-caste is the Orc, so it took three rungs of the Orc's
seven. The Queen and the Princess never stack, and nor does the Worker — a group
multiplies attack, defence and price while its *actions* do not scale, so Two
Workers costs thirty and digs one.

## Measurement, and being wrong in public

Five bugs in the measuring equipment, all mine, all now fixed and commented:

- **The probes were never playing the sweeps' game.** `control()` lived inside
  the sweep's own file, so sweeps played the shipped game and probes played the
  module defaults. One lever differed and it was enough — `RUINS.aiOdds` ships
  at 0.4 and every sweep since §123 measures it at 0.25. It is `tools/control.ts`
  now and both import it.
- **A probe counted fights by reading the log by index.** `log()` keeps 400
  entries; once it saturates, both the length and a saved index sit still while
  entries scroll past underneath. It reported *zero* attacks for a side making
  eight a game. Anchored by identity now.
- **A probe divided its averages by survivors**, which flattered whichever arm
  died most, because its failures left the sample.
- **"Both seed sets agree" is not a significance test.** A 28-against-17 result
  I called believable is 1.85 sigma. The queue says so now.
- **The report had no column for the Hive's ending**, so for the whole section
  the third side's wins could only appear as a hole in the arithmetic.

Plus two in the game itself that the measuring found: `foundCity` picked its
default production with `faction === 'orc' ? … : …`, and four fixtures assumed
the world had exactly two seats.

## Also here

- The sweep report gained a `hv` column, a 25s-a-game timeout so a finished run
  cannot be lost to a failed test, and a recalibrated estimate (8s → 15s; three
  sides take more turns).
- The generated `docs/TECH_TREE.md` left the Hive out of its own tree — three
  loops still said `['orc', 'human']`.
- The Orcpedia names three endings instead of two, and the Hivekin section now
  says who everybody is before it says that she does not move.
- `AI_TRACE`, off by default: counts which branch of `actSoldier` each side's
  units leave through, because nothing outside that function can see which one a
  turn went out of.

## A caveat on every number above

**`RUINS.aiOdds` ships at 0.4 and the sweep's control arm pinned it to 0.25
from the day ruins landed.** PR #126 added both in one commit, the 0.25 being a
leftover of the arm that lost — so every sweep since has measured the AI
attacking a thing standing in a doorway at one-in-four odds, which §123
measured as costing the Horde fifteen games and then rejected.

Paired comparisons survive it, because both arms always had it: the short road
really does beat the long one, and the ordering of the five fixes above holds.
**Absolute figures do not.** "27 of 108" describes a game nobody plays. The
Hivekin's win rate on the shipped game is being re-measured, and that number
will be corrected here rather than quietly left standing.

The same class of bug twice in one day — a measurement setup drifting from the
game with nothing checking it — is why `control()` now lives in `tools/control.ts`
and is imported by the sweeps, the probes and the seed scanner alike.

## What this does not do

- **Sink and Burrow are measured but not settled.** The AI now builds Burrowers
  and uses them — it crosses what it cannot walk round, comes up swinging, and
  lies in wait — where before it built 0.2 a game and never once went
  underground. Whether that is worth having is a sweep in flight. Fourteen turns
  a game spent under the ground across 1.8 sinks is about eight turns apiece,
  and is the first thing to tune if it costs them games.
- **The garrison treadmill.** Half of every Hivekin soldier-turn and a third of
  each empire's goes on walking to one of its own undefended cities, and the
  branch that would make a unit *stay* has never fired in 77,000 turns because
  it cannot. Shared code, its own section.
- Five turns for the succession is unmeasured; the two Burrower branches are not
  mutually exclusive, which the bible says they should be and the tech tree
  cannot express; the brood choice has no dialog yet; the three Hivekin specials
  still owe an unpaired measurement; and whether the third seat moved the
  Horde-Kingdom balance at all is not established either way.

1041 tests.
