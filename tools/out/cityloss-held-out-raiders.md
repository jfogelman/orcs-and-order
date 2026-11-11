# city losses, held-out, raiders on (18 games, 6 a base)

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
| orc | 18 | **7.1** | 10 | **4.6** | 0 | 126 | 8.3 | 3 |
| human | 18 | **8.1** | 12 | **6.9** | 0 | 168 | 8.4 | 1 |
| hivekin | 18 | **6.2** | 10 | **4.3** | 0 | 126 | 11.8 | 3 |
| wandering | 18 | **5.2** | 14 | **4.6** | 0 | 119 | 6.0 | 7 |
| unbound | 18 | **4.7** | 11 | **3.4** | 0 | 127 | 5.4 | 8 |

## how cities leave, per game

`captured` = taken by another player or by raiders. `razed` = destroyed by
a sacking. `abandoned` = a Hive letting its seat go. `lost` is the three
together; `own` is the share of lost cities the side had founded rather
than captured itself.

| side | lost | captured | razed | abandoned | own | gained by capture | handed back by raiders |
|---|---|---|---|---|---|---|---|
| orc | **7.5** | 4.1 | 3.4 | 0.0 | 61% | 3.8 | 0.0 |
| human | **4.2** | 2.0 | 2.2 | 0.0 | 57% | 2.7 | 0.0 |
| hivekin | **9.2** | 2.9 | 6.3 | 0.0 | 89% | 1.7 | 0.0 |
| wandering | **3.2** | 1.2 | 2.0 | 0.0 | 70% | 1.8 | 0.0 |
| unbound | **3.9** | 1.7 | 2.2 | 0.0 | 72% | 1.9 | 0.0 |

Raider-held towns deleted with no founder to return them to (nobody's loss): 0.
Raider-held towns handed back to a founder: 0.

## who takes them

Captures only, per game, by the faction of the taker. A raze has no taker.

| loser | hivekin | human | orc | unbound | wandering |
|---|---|---|---|---|---|
| orc | 0.9 | 1.1 | 0.0 | 1.2 | 0.9 |
| human | 0.6 | 0.0 | 0.8 | 0.4 | 0.2 |
| hivekin | 0.0 | 0.6 | 1.7 | 0.2 | 0.4 |
| wandering | 0.1 | 0.5 | 0.5 | 0.1 | 0.0 |
| unbound | 0.1 | 0.6 | 0.8 | 0.0 | 0.3 |

## when

Turn of each loss, and losses by third of the game (thirds of that game’s
last turn, so a short game is divided as a long one is).

| side | mean turn | median turn | first third | middle third | last third | mean size lost |
|---|---|---|---|---|---|---|
| orc | 162 | 161 | 22 (16%) | 52 (39%) | 61 (45%) | 3.9 |
| human | 143 | 148 | 24 (32%) | 25 (33%) | 27 (36%) | 3.0 |
| hivekin | 146 | 139 | 24 (14%) | 93 (56%) | 49 (30%) | 2.5 |
| wandering | 159 | 161 | 6 (11%) | 24 (42%) | 27 (47%) | 2.6 |
| unbound | 135 | 124 | 22 (31%) | 31 (44%) | 18 (25%) | 2.6 |
