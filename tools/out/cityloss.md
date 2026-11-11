# city losses, tuned (18 games, 6 a base)

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
| orc | 18 | **7.2** | 11 | **5.5** | 0 | 151 | 6.7 | 2 |
| human | 18 | **7.9** | 13 | **6.5** | 0 | 154 | 9.4 | 2 |
| hivekin | 18 | **5.7** | 11 | **3.7** | 0 | 121 | 8.8 | 3 |
| wandering | 18 | **4.3** | 8 | **2.4** | 0 | 101 | 5.8 | 9 |
| unbound | 18 | **5.3** | 12 | **3.7** | 0 | 128 | 6.8 | 9 |

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
| orc | 16 | 6.2 / 6.0 | 7.3 / 7.0 | 2 | 6.0 / 6.0 / 7 | 206 / 206 / 145 / 266; n=2 | 0 of 2 | 0 |
| human | 16 | 7.3 / 7.0 | 8.2 / 8.0 | 2 | 6.0 / 6.0 / 6 | 128 / 128 / 66 / 190; n=2 | 1 of 2 | 0 |
| hivekin | 15 | 4.5 / 5.0 | 5.9 / 6.0 | 3 | 4.3 / 5.0 / 5 | 252 / 266 / 221 / 270; n=3 | 0 of 3 | 0 |
| wandering | 9 | 4.9 / 6.0 | 7.0 / 7.0 | 6 | 1.7 / 1.0 / 6 | 107 / 79 / 44 / 250; n=6 | 4 of 6 | 3 |
| unbound | 9 | 7.3 / 6.0 | 8.1 / 7.0 | 8 | 2.6 / 2.0 / 6 | 104 / 79 / 49 / 198; n=8 | 6 of 8 | 1 |

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
| hivekin | 18 | 45 / 50 / 19 / 66 | 0.0 / 0 | 213 / 208 / 197; n=3 | 46 / 54 (n=15) | 40 / 37 (n=3) |
| wandering | 18 | 38 / 41 / 14 / 66 | 0.0 / 0 | 66 / 30 / 4; n=6 | 33 / 36 (n=9) | 43 / 42 (n=9) |
| unbound | 18 | 38 / 37 / 14 / 64 | 0.0 / 0 | 59 / 25 / 5; n=8 | 29 / 26 (n=9) | 47 / 61 (n=9) |

## reading the survival split

Unbound: 9 games survived, 8 eliminated after holding a city and 1 eliminated having never held one. 6 of the 8 eliminations came before turn 100, which is the opening of the game rather than its late stages. Read that against the arrival table above before calling it about the faction: a late slot makes an early-looking turn a long life.

Every cell here has n of 18 or fewer, and most of 10 or fewer.

## how cities leave, per game

`captured` = taken by another player or by raiders. `razed` = destroyed by
a sacking. `abandoned` = a Hive letting its seat go. `lost` is the three
together; `own` is the share of lost cities the side had founded rather
than captured itself.

| side | lost | captured | razed | abandoned | own | gained by capture | handed back by raiders |
|---|---|---|---|---|---|---|---|
| orc | **5.6** | 2.7 | 2.9 | 0.0 | 46% | 4.4 | 0.0 |
| human | **6.4** | 2.8 | 3.6 | 0.0 | 65% | 3.5 | 0.0 |
| hivekin | **6.3** | 2.2 | 4.1 | 0.0 | 92% | 1.3 | 0.0 |
| wandering | **4.0** | 1.9 | 2.1 | 0.0 | 93% | 0.6 | 0.0 |
| unbound | **5.8** | 2.9 | 2.9 | 0.0 | 75% | 2.7 | 0.0 |

Raider-held towns deleted with no founder to return them to (nobody's loss): 0.
Raider-held towns handed back to a founder: 0.

## who takes them

Captures only, per game, by the faction of the taker. A raze has no taker.

| loser | hivekin | human | orc | unbound | wandering |
|---|---|---|---|---|---|
| orc | 0.6 | 1.0 | 0.0 | 0.9 | 0.1 |
| human | 0.3 | 0.0 | 1.9 | 0.4 | 0.2 |
| hivekin | 0.0 | 1.1 | 0.9 | 0.2 | 0.0 |
| wandering | 0.0 | 0.4 | 0.3 | 1.2 | 0.0 |
| unbound | 0.3 | 1.0 | 1.3 | 0.0 | 0.3 |

## when

Turn of each loss, and losses by third of the game (thirds of that game’s
last turn, so a short game is divided as a long one is).

| side | mean turn | median turn | first third | middle third | last third | mean size lost |
|---|---|---|---|---|---|---|
| orc | 152 | 144 | 16 (16%) | 45 (45%) | 40 (40%) | 3.9 |
| human | 139 | 142 | 28 (24%) | 40 (35%) | 47 (41%) | 2.9 |
| hivekin | 148 | 140 | 17 (15%) | 59 (52%) | 38 (33%) | 2.7 |
| wandering | 155 | 155 | 7 (10%) | 25 (35%) | 40 (56%) | 3.3 |
| unbound | 139 | 125 | 24 (23%) | 44 (42%) | 37 (35%) | 2.9 |
