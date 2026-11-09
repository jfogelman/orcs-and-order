# throughput, tuned (18 games, 6 a base)

Sampled per half-turn, over player-turns in which the side held at least
one city. Rates are out of 12 steps.

## the number section 125 named, and never followed up

`turns with a city` is why the rate and the advance count cannot be read
against each other without it: a side that arrives on turn 60 earns a
high rate over a short life. `beakers all told` is the two multiplied,
and it is the column that should track advances.

`banked at the end` and `nothing to learn` separate earning too few
beakers from earning beakers that cannot become advances.

| side | beakers a turn | turns with a city | beakers all told | advances | banked | nothing to learn | wins | cities | trade a turn |
|---|---|---|---|---|---|---|---|---|---|
| hivekin | **9.5** | 209 | **1986** | **19.3** | 47 | 0% | 4/18 | 3.36 | 12.2 |
| human | **23.9** | 250 | **5966** | **28.8** | 1641 | 15% | 3/18 | 6.20 | 28.4 |
| orc | **15.9** | 260 | **4129** | **29.1** | 212 | 1% | 3/18 | 5.38 | 19.9 |
| unbound | **16.3** | 156 | **2550** | **16.0** | 430 | 5% | 3/18 | 5.26 | 22.4 |
| wandering | **21.7** | 120 | **2613** | **14.7** | 690 | 9% | 0/18 | 5.38 | 27.5 |

## where the trade split goes

| side | coin | study | **calm** | city-turns rioting | at the limit |
|---|---|---|---|---|---|
| hivekin | 3.6 | 7.2 | **1.3** | 13.5% | 11.9% |
| human | 3.7 | 7.3 | **0.9** | 4.5% | 7.0% |
| orc | 3.5 | 6.9 | **1.7** | 9.9% | 14.4% |
| unbound | 3.4 | 6.7 | **1.9** | 12.0% | 15.4% |
| wandering | 3.7 | 7.3 | **1.0** | 3.5% | 11.8% |

## and per city, which separates small towns from many towns

| side | pop a city | trade a city | science bonus |
|---|---|---|---|
| hivekin | 4.62 | 3.63 | 0.0% |
| human | 5.32 | 4.58 | 3.3% |
| orc | 6.40 | 3.70 | 6.7% |
| unbound | 5.43 | 4.25 | 0.0% |
| wandering | 5.63 | 5.11 | 0.0% |

## the science buildings: learned against built

Every faction has two, at the same prices for the same bonus, and the
cheap one comes off the same shared advance for all five. So a side that
learns the advance and never builds is `chooseProduction`, and a side
that never learns it is research priority.

| side | learned the advance | ever built one |
|---|---|---|
| hivekin | **11/18** | **1/18** |
| human | **18/18** | **13/18** |
| orc | **18/18** | **13/18** |
| unbound | **13/18** | **0/18** |
| wandering | **11/18** | **0/18** |
