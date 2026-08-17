# Unit abilities, animation, and a lot of balance measurement

Everything since the terrain-edge work: eight unit abilities, the interface they
needed, effect and attack animations, two new mechanics, and a long run of balance
measurement that mostly consisted of being wrong in useful ways.

## Abilities

All eight items on the queue, and the piece of interface four of them were waiting on.

- **Target-select mode.** An armed ability puts the map into target-picking: legal
  targets get a pulsing reticle and the next click chooses one. Escape backs out of
  the ability before it drops the selection; clicking a non-target cancels rather than
  falling through to a move order, because an armed ability that quietly marches your
  archer at the enemy instead of shooting is worse than one that refuses.
- **Ranged attack** — exactly two tiles, no retaliation, three rounds rather than a
  fight to the death, and it cannot take a city.
- **Healing** — one Paladin gets a neighbour to half, two get them all the way.
- **The axethrower's one axe** — throws at 1.5x, then fights at a quarter strength
  until it reaches a friendly city or kills somebody.
- **The dragon's breath** carries into the tile behind its target, friend or enemy.

Target lists are built from what the acting player can *see*, never the true board:
an armed ability that lit an unexplored tile would work as a fog-of-war probe.

## Art and animation

- Ten effect strips and sixteen per-creature attack animations, sliced from magenta
  and green source art. Frame counts come from each sheet's own proportions rather
  than a table, so re-rolling art needs no code change.
- Effects play from the game log the way sound already did, gated on visibility and
  staggered so a whole AI turn does not fire on one frame.
- Sounds are capped at about a second with a fade. Several clips ran far longer than
  the event -- the troll roar is eleven seconds.
- The Orcpedia now says what every unit and building actually does, generated from the
  data so it cannot drift from the rules.

## New mechanics

- **Militia.** An ungarrisoned city defends itself a little. Measured beforehand: 228
  of 237 captured cities were being walked into unopposed, which made every defensive
  rule in the game a bonus applied to a defender who was not there.
- **Supply lines.** Units far from the capital fight weakly and do not heal. Drawn
  from the capital plus built outposts rather than from every city, so the network
  does not scale with empire size.
- **Sacking** scales with whoever turned up, and **rush-buying** gives gold a use --
  it previously had no sink at all outside upkeep.

## Balance

Ten hypotheses tested, most of them wrong, all recorded in `DESIGN_QUEUE.md` with the
numbers. Two general findings came out of the failures and are worth more than any
single result:

- **Per-city mechanics amplify a city-count lead rather than closing one.** That is
  why rush-buying, unit-driven buildings and the militia all failed the same way.
- **Eighteen seeds cannot separate settings whose true difference is small.** The gap
  between neighbouring parameter values was smaller than the gap the *same* value
  showed between two seed sets. A promising result is now only believed if it survives
  a fresh seed set.

Supply lines survive that test: a 40-60% reduction in the score gap and one to two
wins, on two independent samples. The balance sits at 7-11 on fresh seeds, from 5-13.

## Testing

180 tests. The suite caught three real regressions from supply gating healing -- and
one test that had quietly stopped testing anything, comparing a gain of zero against a
gain of zero and finding the ratio agreeable.

---

# Earlier on the same branch

Eighteen commits taking the game from "playable" to "measurably balanced", plus the
full art and sound set. Grouped by theme rather than in commit order.

## Rendering

- **Terrain blends across tile edges.** Each terrain has a `blend` rank and the
  higher-ranked of two neighbours feathers across the shared edge, so grass softens
  into sand and land grows a shoreline instead of stopping at a square boundary.
- The map is **pre-rendered once into an offscreen canvas** and drawn as a single
  blit. Blending per frame would be far too expensive, and this incidentally took a
  frame from ~700 `drawImage` calls to one, at 0.22 ms.
- Units are scaled relative to one another (`artScale`), so a goblin no longer stands
  as tall as an ogre.

## Art and sound pipeline

- `npm run art` cuts out backgrounds, trims and squares sprites, slices terrain
  sheets into tile variants, and re-encodes audio. The first art batch went from
  **48 MB to 200 KB**; audio from 9.0 MB to 3.4 MB.
- **Group sprites are composed at runtime** by stamping the single-unit art N times.
  Image generators cannot reliably draw an exact number of matching figures — asked
  for three orcs they return two or four — so one good Orc gives the whole counting
  ladder, exactly right every time. The same trick builds the counting-ladder advance
  icons from a single orc head.
- Full asset set now in: 17 units, 6 cities, 8 terrains, 42 advance icons, 10 building
  icons, 33 sound effects and 3 music tracks.

## Gameplay

- **Economy buildings**: Goblin Treasury and Simple Market (gold), The Thinking Rock
  and Hall of Careful Notes (research). Trade is now split per city rather than once
  for the empire, so a treasury enriches the city it stands in.
- **The Broken Catapult** replaces Walls for the orcs — no real defence, but double
  attack for a garrison sallying out. Both factions research the same advance and get
  whatever they are capable of.
- **Orcpedia**, reachable from the toolbar, any unit's name, every unit and structure
  named in the Advances screen, and a `?` beside each build option.
- Research is **asked for rather than assigned**; beakers bank up until you choose.
- Movement: routes are drawn in two tones split at this turn's reach, marches carry
  over turns, and clicking into fog works.

## Fixes worth calling out

- **Pathing used the true board rather than the player's map.** An enemy standing
  unseen in fog blocked the route, so a move order silently failed — and the failure
  leaked where that enemy was.
- **Rioting cities kept growing.** `cityYield` zeroed shields and trade during
  disorder but returned food in full, so most cities in a typical game were
  permanently rioting, producing nothing, and still swelling.
- **Captured cities keep their walls.** Levelling them made a taken city easier to
  retake than it had been to take, driving an endless see-saw.

## Balance

Two identical AIs, one per faction, over eighteen seeds: **wins 9–9**, each side ahead
where it should be — the Kingdom on cities and population, the Horde on advances.

Getting there took four hypotheses, **three of which were wrong**, and the sweeps are
recorded in the code so the numbers stay re-tunable:

| Suspected | Actual |
|---|---|
| The scoring formula | Genuinely flawed, but fixing it changed *nothing* — identical results on the same seeds |
| Walls | Giving the orcs a defensive building changed nothing either |
| Garrison size, as defence | Right lever, backwards direction — garrisoning **helps** a cautious AI and **cripples** an aggressive one |

The one that mattered first was a timid AI constant (`caution`), swept 0.45–0.60. The
second was `garrisonPerCity`, which interacts with `caution` and so cannot be tuned
independently of it.

Also fixed two measurement bugs that had been quietly producing wrong numbers: the
balance harness carried an explicit `beforeAll` timeout that silently capped how many
seeds could ever run, and capture counts were being read from a log that keeps only
its last 400 entries — so every figure quoted before that was a floor, not a total.

## Testing

86 tests. Beyond unit coverage they include full 300-turn AI-vs-AI games, save
round-trips, a determinism check, worldgen invariants (both civs must start on the
same landmass, since there are no ships), and balance regressions.

`npm run build` produces a self-contained static site with no runtime dependencies.
