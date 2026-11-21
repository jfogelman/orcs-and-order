# city losses, held-out (18 games, 6 a base)

Every way a player stops owning a city, found by reading `src/sim` for
owner assignments and splices of `state.cities`: a capture, a raze (a capture
that leaves nobody alive), a raider-held town returned or deleted, and a
Hive abandoning its seat. Incitement never transfers a town. Losses were
detected by comparing owner maps between watch-hook calls (one half-turn),
not from the trimmed log and not by a counter in the rules; the one thing
that cannot be seen is a town changing hands twice inside a single half-turn.
Per-game figures are over games the faction was in; "games" is that count.

## peak and final cities

`peak` is the most cities held at any hook, averaged over games, with the
largest single game after it. `founded` counts cities the side itself
founded, per game. `eliminated` is games ending on zero cities.

| side | games | mean peak | best peak | mean final | worst final | peak turn | founded | eliminated |
|---|---|---|---|---|---|---|---|---|
| orc | 18 | **6.5** | 8 | **4.6** | 0 | 123 | 9.2 | 2 |
| human | 18 | **8.6** | 15 | **7.6** | 5 | 140 | 7.6 | 0 |
| hivekin | 18 | **5.9** | 8 | **3.6** | 0 | 111 | 12.1 | 1 |
| wandering | 18 | **5.3** | 11 | **4.2** | 0 | 135 | 6.3 | 7 |
| unbound | 18 | **4.8** | 10 | **3.7** | 0 | 137 | 6.0 | 7 |

## the same, split by whether the side survived

`final` above is a mean over every game, including those a side ended with
no city, so it mixes how big a side gets with how often it is wiped out.
Here it is split. `n` is the number of games in each cell; several are small.
`elim turn` is the turn a side last went from holding a city to holding none,
over games where it held one at some point; `never had one` counts eliminated
games in which the side held no city at any observation (it never settled,
or arrived and was gone before the first look), which have no such turn.

| side | survived n | final, survivors (mean / median) | peak, survivors (mean / median) | eliminated n | peak, eliminated (mean / median / max) | elim turn (mean / median / earliest / latest; n) | before turn 100 | never had one |
|---|---|---|---|---|---|---|---|---|
| orc | 16 | 5.1 / 5.0 | 6.6 / 7.0 | 2 | 5.5 / 5.5 / 6 | 194 / 194 / 180 / 208; n=2 | 0 of 2 | 0 |
| human | 18 | 7.6 / 7.0 | 8.6 / 8.0 | 0 | 0.0 / 0.0 / 0 | -- | 0 of 0 | 0 |
| hivekin | 17 | 3.8 / 5.0 | 5.9 / 6.0 | 1 | 6.0 / 6.0 / 6 | 199 / 199 / 199 / 199; n=1 | 0 of 1 | 0 |
| wandering | 11 | 6.9 / 7.0 | 7.7 / 7.0 | 5 | 1.6 / 1.0 / 5 | 97 / 61 / 51 / 168; n=5 | 3 of 5 | 2 |
| unbound | 11 | 6.0 / 6.0 | 6.8 / 7.0 | 6 | 1.6 / 1.0 / 5 | 78 / 71 / 54 / 126; n=6 | 5 of 6 | 1 |

## arrival slot, and lifespan (section 160 asks whether this is the slot or the faction)

A side that arrives late has a short life for free, so an elimination turn
means nothing alone. `due` is `arrivalTurnFor` for the faction slot, read
from the schedule the game itself keeps rather than inferred from when a city appeared;
`came` is the first observation at which the side existed on the map. Only
games in which the faction was a latecomer count, so a side that sometimes
starts on the map has fewer games here than above. `lifespan` is
elimination turn minus `due`, over eliminated games in which the side held a
city at some point (n beside it); the figures are mean / median / minimum.
Arrival is split by outcome in the last two columns, mean / median (n).
Every n is small; these are numbers, not tested differences.

| side | latecomer games | due (mean / median / min / max) | came, minus due (mean / max) | lifespan (mean / median / min; n) | due, survived (mean / median; n) | due, eliminated (mean / median; n) |
|---|---|---|---|---|---|---|
| hivekin | 18 | 39 / 41 / 14 / 63 | 0.0 / 0 | 175 / 175 / 175; n=1 | 40 / 41 (n=17) | 24 / 24 (n=1) |
| wandering | 18 | 32 / 25 / 14 / 59 | 0.0 / 0 | 60 / 36 / 12; n=5 | 25 / 22 (n=11) | 43 / 39 (n=7) |
| unbound | 18 | 46 / 42 / 22 / 64 | 0.0 / 0 | 24 / 13 / 5; n=6 | 40 / 38 (n=11) | 54 / 58 (n=7) |

## reading the survival split

Unbound: 11 games survived, 6 eliminated after holding a city and 1 eliminated having never held one. 5 of the 6 eliminations came before turn 100, which is the opening of the game rather than its late stages. Read that against the arrival table above before calling it about the faction: a late slot makes an early-looking turn a long life.

Every cell here has n of 18 or fewer, and most of 10 or fewer.

## how cities leave, per game

`captured` = taken by another player or by raiders. `razed` = destroyed by
a sacking. `abandoned` = a Hive letting its seat go. `lost` is the three
together; `own` is the share of lost cities the side had founded rather
than captured itself.

| side | lost | captured | razed | abandoned | own | gained by capture | handed back by raiders |
|---|---|---|---|---|---|---|---|
| orc | **7.8** | 4.6 | 3.2 | 0.0 | 82% | 3.1 | 0.0 |
| human | **4.4** | 2.1 | 2.3 | 0.0 | 39% | 4.3 | 0.0 |
| hivekin | **10.9** | 3.6 | 7.4 | 0.0 | 86% | 2.4 | 0.0 |
| wandering | **4.0** | 1.9 | 2.1 | 0.0 | 64% | 1.9 | 0.0 |
| unbound | **4.2** | 1.6 | 2.6 | 0.0 | 72% | 1.9 | 0.0 |

Raider-held towns deleted with no founder to return them to (nobody's loss): 0.
Raider-held towns handed back to a founder: 0.

## who takes them

Captures only, per game, by the faction of the taker. A raze has no taker.

| loser | hivekin | human | orc | unbound | wandering |
|---|---|---|---|---|---|
| orc | 1.1 | 2.0 | 0.0 | 0.3 | 1.2 |
| human | 0.7 | 0.0 | 0.7 | 0.3 | 0.3 |
| hivekin | 0.0 | 1.5 | 1.2 | 0.7 | 0.2 |
| wandering | 0.3 | 0.3 | 0.6 | 0.6 | 0.0 |
| unbound | 0.3 | 0.5 | 0.6 | 0.0 | 0.2 |

## when

Turn of each loss, and losses by third of the game (thirds of that game’s
last turn, so a short game is divided as a long one is).

| side | mean turn | median turn | first third | middle third | last third | mean size lost |
|---|---|---|---|---|---|---|
| orc | 160 | 173 | 19 (14%) | 41 (29%) | 80 (57%) | 4.1 |
| human | 154 | 170 | 16 (20%) | 23 (29%) | 40 (51%) | 3.1 |
| hivekin | 153 | 147 | 25 (13%) | 80 (41%) | 92 (47%) | 2.5 |
| wandering | 147 | 146 | 10 (14%) | 26 (36%) | 36 (50%) | 2.9 |
| unbound | 148 | 147 | 5 (7%) | 37 (49%) | 34 (45%) | 2.4 |
