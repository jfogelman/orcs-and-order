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
| orc | 18 | **7.1** | 10 | **5.6** | 0 | 161 | 7.3 | 2 |
| human | 18 | **8.3** | 13 | **6.9** | 0 | 186 | 8.5 | 1 |
| hivekin | 18 | **5.9** | 11 | **3.8** | 0 | 133 | 8.9 | 3 |
| wandering | 18 | **4.9** | 14 | **3.0** | 0 | 111 | 5.6 | 11 |
| unbound | 18 | **5.3** | 13 | **3.8** | 0 | 126 | 7.4 | 8 |

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
| orc | 16 | 6.3 / 6.5 | 7.3 / 7.0 | 2 | 6.0 / 6.0 / 7 | 211 / 211 / 148 / 274; n=2 | 0 of 2 | 0 |
| human | 17 | 7.4 / 7.0 | 8.5 / 8.0 | 1 | 6.0 / 6.0 / 6 | 66 / 66 / 66 / 66; n=1 | 1 of 1 | 0 |
| hivekin | 15 | 4.5 / 5.0 | 6.3 / 6.0 | 3 | 3.7 / 3.0 / 5 | 207 / 216 / 151 / 254; n=3 | 0 of 3 | 0 |
| wandering | 7 | 7.7 / 7.0 | 8.7 / 8.0 | 8 | 2.5 / 1.0 / 7 | 115 / 115 / 44 / 217; n=8 | 4 of 8 | 3 |
| unbound | 10 | 6.8 / 6.0 | 8.0 / 7.0 | 7 | 2.0 / 1.0 / 5 | 94 / 73 / 49 / 191; n=7 | 5 of 7 | 1 |

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
| hivekin | 18 | 45 / 50 / 19 / 66 | 0.0 / 0 | 162 / 192 / 97; n=3 | 45 / 45 (n=15) | 45 / 54 (n=3) |
| wandering | 18 | 38 / 41 / 14 / 66 | 0.0 / 0 | 78 / 71 / 4; n=8 | 35 / 36 (n=7) | 40 / 42 (n=11) |
| unbound | 18 | 38 / 37 / 14 / 64 | 0.0 / 0 | 51 / 11 / 5; n=7 | 32 / 31 (n=10) | 46 / 62 (n=8) |

## reading the survival split

Unbound: 10 games survived, 7 eliminated after holding a city and 1 eliminated having never held one. 5 of the 7 eliminations came before turn 100, which is the opening of the game rather than its late stages. Read that against the arrival table above before calling it about the faction: a late slot makes an early-looking turn a long life.

Every cell here has n of 18 or fewer, and most of 10 or fewer.

## how cities leave, per game

`captured` = taken by another player or by raiders. `razed` = destroyed by
a sacking. `abandoned` = a Hive letting its seat go. `lost` is the three
together; `own` is the share of lost cities the side had founded rather
than captured itself.

| side | lost | captured | razed | abandoned | own | gained by capture | handed back by raiders |
|---|---|---|---|---|---|---|---|
| orc | **5.9** | 3.0 | 2.9 | 0.0 | 50% | 4.2 | 0.0 |
| human | **6.4** | 3.5 | 2.9 | 0.0 | 49% | 4.9 | 0.0 |
| hivekin | **6.8** | 3.1 | 3.8 | 0.0 | 86% | 1.7 | 0.0 |
| wandering | **3.8** | 1.8 | 2.1 | 0.0 | 84% | 1.2 | 0.0 |
| unbound | **5.8** | 2.8 | 2.9 | 0.0 | 85% | 2.2 | 0.0 |

Raider-held towns deleted with no founder to return them to (nobody's loss): 0.
Raider-held towns handed back to a founder: 0.

## who takes them

Captures only, per game, by the faction of the taker. A raze has no taker.

| loser | hivekin | human | orc | unbound | wandering |
|---|---|---|---|---|---|
| orc | 0.8 | 1.4 | 0.0 | 0.7 | 0.1 |
| human | 0.7 | 0.0 | 1.7 | 0.4 | 0.7 |
| hivekin | 0.0 | 1.5 | 0.9 | 0.4 | 0.2 |
| wandering | 0.1 | 0.5 | 0.5 | 0.7 | 0.0 |
| unbound | 0.1 | 1.4 | 1.1 | 0.0 | 0.2 |

## when

Turn of each loss, and losses by third of the game (thirds of that game’s
last turn, so a short game is divided as a long one is).

| side | mean turn | median turn | first third | middle third | last third | mean size lost |
|---|---|---|---|---|---|---|
| orc | 160 | 153 | 14 (13%) | 47 (44%) | 46 (43%) | 4.4 |
| human | 150 | 159 | 25 (22%) | 46 (40%) | 45 (39%) | 3.1 |
| hivekin | 145 | 143 | 21 (17%) | 69 (56%) | 33 (27%) | 3.0 |
| wandering | 143 | 143 | 13 (19%) | 27 (39%) | 29 (42%) | 3.0 |
| unbound | 135 | 123 | 27 (26%) | 47 (45%) | 30 (29%) | 3.0 |
