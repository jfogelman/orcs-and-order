# what a town earns in its first 40 turns, held-out (18 games)

One row per town per half-turn inside the window, so a side holding three
towns contributes three rows a look. `gross` is `cityYield().shields`;
`upkeep` is `max(0, units homed here - max(2, size))`, which is subtracted
in shields before anything is banked; `net` is what the box actually
receives. A unit built in a town is homed to it, so a town pays for its own
garrison out of the same box its settler is accumulating in.

Read `net <= 0` against the 20 to 25 a settler costs. At a net of zero the
box never fills **at any price**, which is what section 188’s failed price
arm would look like from here.

## every latecomer town

| side | looks | towns | size | gross | upkeep | homed (free) | **net** | net ≤ 0 | turns for a 25-settler |
|---|---|---|---|---|---|---|---|---|---|
| orc | 6379 | 3.7 | 2.5 | 3.5 | 0.5 | 2.2 (2.8) | **3.00** | 1% | 9 |
| human | 7604 | 4.5 | 2.2 | 3.3 | 0.2 | 1.0 (2.6) | **3.12** | 0% | 9 |
| wandering | 5789 | 3.1 | 2.1 | 3.4 | 0.2 | 1.6 (2.5) | **3.18** | 0% | 8 |
| unbound | 8540 | 3.9 | 2.1 | 3.7 | 0.1 | 1.1 (2.5) | **3.54** | 0% | 8 |
| hivekin | 10905 | 3.6 | 2.0 | 4.0 | 0.6 | 2.1 (2.5) | **3.35** | 1% | 8 |

## games the side survived

| side | looks | towns | size | gross | upkeep | homed (free) | **net** | net ≤ 0 | turns for a 25-settler |
|---|---|---|---|---|---|---|---|---|---|
| orc | 5677 | 3.8 | 2.5 | 3.7 | 0.6 | 2.4 (2.8) | **3.10** | 1% | 9 |
| human | 7604 | 4.5 | 2.2 | 3.3 | 0.2 | 1.0 (2.6) | **3.12** | 0% | 9 |
| wandering | 5012 | 3.3 | 2.1 | 3.5 | 0.3 | 1.6 (2.5) | **3.20** | 0% | 8 |
| unbound | 7625 | 4.0 | 2.1 | 3.7 | 0.1 | 1.1 (2.5) | **3.54** | 0% | 8 |
| hivekin | 10335 | 3.5 | 2.0 | 4.0 | 0.6 | 2.1 (2.4) | **3.36** | 1% | 8 |

## games the side was eliminated

| side | looks | towns | size | gross | upkeep | homed (free) | **net** | net ≤ 0 | turns for a 25-settler |
|---|---|---|---|---|---|---|---|---|---|
| orc | 702 | 3.4 | 2.7 | 2.2 | 0.0 | 0.9 (3.0) | **2.20** | 0% | 12 |
| wandering | 777 | 1.5 | 2.1 | 3.2 | 0.2 | 1.4 (2.4) | **3.01** | 0% | 9 |
| unbound | 915 | 3.2 | 1.8 | 3.9 | 0.3 | 1.2 (2.4) | **3.57** | 0% | 8 |
| hivekin | 570 | 4.4 | 2.5 | 3.5 | 0.3 | 2.3 (2.7) | **3.15** | 0% | 8 |

## the one-town case on its own

Only looks where the side held exactly one town, which is the state
sections 186 and 187 describe.

| side | looks | size | gross | upkeep | **net** | net ≤ 0 | median banked |
|---|---|---|---|---|---|---|---|
| orc | 106 | 1.0 | 1.8 | 0.0 | **1.85** | 0% | 2 |
| human | 118 | 1.0 | 2.7 | 0.0 | **2.66** | 0% | 4 |
| wandering | 1131 | 1.9 | 3.1 | 0.1 | **2.99** | 0% | 8 |
| unbound | 444 | 1.3 | 2.9 | 0.2 | **2.71** | 0% | 4 |
| hivekin | 357 | 1.3 | 3.2 | 0.1 | **3.13** | 0% | 4 |

## did the box ever reach a settler?

Per side per game: the fullest the shield box ever got inside the window,
and how many times it fell (which is something finishing). A settler costs
20, or 25 for a Wanderer. If the high-water mark sits below that while the
net is three or four a turn, the box is being **spent** before it gets
there -- and the thing spending it is cheaper than a settler.

| side | games | max banked (mean / median / best) | reached 20 | reached 25 | things finished |
|---|---|---|---|---|---|
| orc, survived | 16 | 30.3 / 29 / 50 | 94% | 69% | 19.0 |
| orc, eliminated | 2 | 21.5 / 22 / 24 | 50% | 0% | 10.0 |
| human, survived | 18 | 41.4 / 37 / 75 | 100% | 89% | 14.2 |
| wandering, survived | 11 | 26.8 / 24 / 54 | 100% | 27% | 12.9 |
| wandering, eliminated | 7 | 12.1 / 12 / 22 | 29% | 0% | 3.6 |
| unbound, survived | 11 | 52.7 / 65 / 68 | 82% | 82% | 14.5 |
| unbound, eliminated | 7 | 13.3 / 9 / 40 | 14% | 14% | 3.1 |
| hivekin, survived | 17 | 19.8 / 19 / 32 | 24% | 6% | 21.8 |
| hivekin, eliminated | 1 | 19.0 / 19 / 19 | 0% | 0% | 28.0 |

