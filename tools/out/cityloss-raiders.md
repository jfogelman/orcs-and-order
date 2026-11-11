# city losses, tuned, raiders on (18 games, 6 a base)

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
| orc | 18 | **6.7** | 9 | **4.9** | 0 | 140 | 7.8 | 3 |
| human | 18 | **8.5** | 12 | **7.7** | 6 | 168 | 8.3 | 0 |
| hivekin | 18 | **5.7** | 9 | **3.4** | 1 | 122 | 8.9 | 0 |
| wandering | 18 | **4.7** | 8 | **3.1** | 0 | 109 | 4.9 | 9 |
| unbound | 18 | **5.7** | 10 | **4.4** | 0 | 126 | 7.9 | 6 |

## how cities leave, per game

`captured` = taken by another player or by raiders. `razed` = destroyed by
a sacking. `abandoned` = a Hive letting its seat go. `lost` is the three
together; `own` is the share of lost cities the side had founded rather
than captured itself.

| side | lost | captured | razed | abandoned | own | gained by capture | handed back by raiders |
|---|---|---|---|---|---|---|---|
| orc | **5.7** | 2.7 | 3.1 | 0.0 | 71% | 2.8 | 0.0 |
| human | **4.6** | 2.3 | 2.2 | 0.0 | 52% | 3.9 | 0.0 |
| hivekin | **7.0** | 3.1 | 3.9 | 0.0 | 87% | 1.4 | 0.0 |
| wandering | **2.9** | 1.2 | 1.7 | 0.0 | 73% | 1.1 | 0.0 |
| unbound | **6.1** | 2.5 | 3.6 | 0.0 | 83% | 2.6 | 0.0 |

Raider-held towns deleted with no founder to return them to (nobody's loss): 0.
Raider-held towns handed back to a founder: 0.

## who takes them

Captures only, per game, by the faction of the taker. A raze has no taker.

| loser | hivekin | human | orc | unbound | wandering |
|---|---|---|---|---|---|
| orc | 0.6 | 1.2 | 0.0 | 0.7 | 0.2 |
| human | 0.5 | 0.0 | 0.8 | 0.7 | 0.3 |
| hivekin | 0.0 | 1.2 | 1.0 | 0.7 | 0.2 |
| wandering | 0.1 | 0.5 | 0.2 | 0.4 | 0.0 |
| unbound | 0.3 | 1.1 | 0.8 | 0.0 | 0.3 |

## when

Turn of each loss, and losses by third of the game (thirds of that game’s
last turn, so a short game is divided as a long one is).

| side | mean turn | median turn | first third | middle third | last third | mean size lost |
|---|---|---|---|---|---|---|
| orc | 161 | 159 | 12 (12%) | 36 (35%) | 55 (53%) | 3.8 |
| human | 150 | 154 | 16 (20%) | 31 (38%) | 35 (43%) | 3.0 |
| hivekin | 145 | 137 | 15 (12%) | 69 (55%) | 42 (33%) | 3.0 |
| wandering | 145 | 165 | 11 (21%) | 17 (33%) | 24 (46%) | 2.9 |
| unbound | 131 | 122 | 27 (25%) | 47 (43%) | 35 (32%) | 2.8 |
