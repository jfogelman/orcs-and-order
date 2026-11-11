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
| orc | 18 | **6.7** | 8 | **4.6** | 0 | 143 | 9.5 | 2 |
| human | 18 | **9.0** | 15 | **8.2** | 6 | 168 | 7.8 | 0 |
| hivekin | 18 | **6.0** | 10 | **3.0** | 0 | 120 | 11.4 | 4 |
| wandering | 18 | **5.6** | 11 | **3.9** | 0 | 135 | 6.2 | 9 |
| unbound | 18 | **5.0** | 13 | **3.6** | 0 | 133 | 5.7 | 8 |

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
| orc | 16 | 5.1 / 5.0 | 6.8 / 7.0 | 2 | 5.5 / 5.5 / 6 | 183 / 183 / 162 / 204; n=2 | 0 of 2 | 0 |
| human | 18 | 8.2 / 8.0 | 9.0 / 8.5 | 0 | 0.0 / 0.0 / 0 | -- | 0 of 0 | 0 |
| hivekin | 14 | 3.9 / 5.0 | 6.2 / 6.0 | 4 | 5.3 / 5.0 / 6 | 193 / 176 / 164 / 254; n=4 | 0 of 4 | 0 |
| wandering | 9 | 7.9 / 8.0 | 8.4 / 8.0 | 7 | 2.7 / 2.0 / 6 | 131 / 128 / 51 / 237; n=7 | 3 of 7 | 2 |
| unbound | 10 | 6.4 / 6.0 | 7.3 / 7.0 | 7 | 2.1 / 1.0 / 6 | 99 / 72 / 54 / 227; n=7 | 5 of 7 | 1 |

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
| hivekin | 18 | 39 / 41 / 14 / 63 | 0.0 / 0 | 149 / 140 / 116; n=4 | 37 / 38 (n=14) | 44 / 48 (n=4) |
| wandering | 18 | 32 / 25 / 14 / 59 | 0.0 / 0 | 96 / 106 / 12; n=7 | 24 / 20 (n=9) | 40 / 39 (n=9) |
| unbound | 18 | 46 / 42 / 22 / 64 | 0.0 / 0 | 48 / 14 / 5; n=7 | 41 / 39 (n=10) | 52 / 57 (n=8) |

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
| orc | **8.1** | 4.7 | 3.4 | 0.0 | 81% | 3.2 | 0.0 |
| human | **4.4** | 2.1 | 2.4 | 0.0 | 29% | 4.8 | 0.0 |
| hivekin | **10.4** | 3.6 | 6.8 | 0.0 | 88% | 1.9 | 0.0 |
| wandering | **4.3** | 1.9 | 2.4 | 0.0 | 74% | 2.1 | 0.0 |
| unbound | **4.4** | 2.1 | 2.3 | 0.0 | 77% | 2.3 | 0.0 |

Raider-held towns deleted with no founder to return them to (nobody's loss): 0.
Raider-held towns handed back to a founder: 0.

## who takes them

Captures only, per game, by the faction of the taker. A raze has no taker.

| loser | hivekin | human | orc | unbound | wandering |
|---|---|---|---|---|---|
| orc | 1.1 | 1.7 | 0.0 | 0.8 | 1.1 |
| human | 0.3 | 0.0 | 0.9 | 0.4 | 0.4 |
| hivekin | 0.0 | 1.7 | 1.2 | 0.4 | 0.3 |
| wandering | 0.1 | 0.6 | 0.6 | 0.6 | 0.0 |
| unbound | 0.6 | 0.8 | 0.4 | 0.0 | 0.3 |

## when

Turn of each loss, and losses by third of the game (thirds of that game’s
last turn, so a short game is divided as a long one is).

| side | mean turn | median turn | first third | middle third | last third | mean size lost |
|---|---|---|---|---|---|---|
| orc | 155 | 156 | 22 (15%) | 65 (45%) | 59 (40%) | 4.4 |
| human | 156 | 169 | 20 (25%) | 23 (29%) | 37 (46%) | 2.8 |
| hivekin | 140 | 137 | 30 (16%) | 96 (51%) | 61 (33%) | 2.6 |
| wandering | 155 | 143 | 11 (14%) | 34 (44%) | 32 (42%) | 3.0 |
| unbound | 156 | 147 | 13 (16%) | 33 (42%) | 33 (42%) | 3.1 |
