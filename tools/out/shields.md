# what a town earns in its first 40 turns, tuned (18 games)

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
| orc | 6917 | 4.0 | 2.6 | 3.7 | 0.6 | 2.3 (2.8) | **3.16** | 0% | 8 |
| human | 7614 | 4.6 | 2.2 | 3.8 | 0.2 | 1.3 (2.6) | **3.57** | 0% | 7 |
| unbound | 6887 | 3.6 | 2.1 | 3.3 | 0.1 | 0.9 (2.5) | **3.20** | 0% | 8 |
| wandering | 5122 | 2.9 | 2.2 | 3.4 | 0.3 | 1.6 (2.6) | **3.06** | 1% | 9 |
| hivekin | 10361 | 3.5 | 2.2 | 3.6 | 0.4 | 1.9 (2.5) | **3.14** | 1% | 8 |

## games the side survived

| side | looks | towns | size | gross | upkeep | homed (free) | **net** | net ≤ 0 | turns for a 25-settler |
|---|---|---|---|---|---|---|---|---|---|
| orc | 6206 | 4.1 | 2.5 | 3.8 | 0.6 | 2.4 (2.8) | **3.21** | 0% | 8 |
| human | 7294 | 4.7 | 2.2 | 3.9 | 0.2 | 1.4 (2.6) | **3.65** | 0% | 7 |
| unbound | 5643 | 3.6 | 2.1 | 3.1 | 0.1 | 0.8 (2.5) | **3.00** | 0% | 9 |
| wandering | 3055 | 3.0 | 2.4 | 3.0 | 0.1 | 1.3 (2.7) | **2.84** | 0% | 9 |
| hivekin | 8888 | 3.6 | 2.1 | 3.7 | 0.5 | 2.0 (2.5) | **3.17** | 1% | 8 |

## games the side was eliminated

| side | looks | towns | size | gross | upkeep | homed (free) | **net** | net ≤ 0 | turns for a 25-settler |
|---|---|---|---|---|---|---|---|---|---|
| orc | 711 | 3.9 | 2.7 | 2.9 | 0.3 | 1.8 (3.0) | **2.70** | 0% | 10 |
| human | 320 | 3.9 | 2.2 | 1.9 | 0.0 | 0.5 (2.6) | **1.86** | 0% | 14 |
| unbound | 1244 | 3.5 | 2.1 | 4.1 | 0.0 | 1.2 (2.5) | **4.10** | 0% | 7 |
| wandering | 2067 | 2.8 | 1.9 | 4.0 | 0.6 | 2.0 (2.4) | **3.40** | 2% | 8 |
| hivekin | 1473 | 2.9 | 2.6 | 3.0 | 0.0 | 1.0 (2.8) | **3.01** | 0% | 9 |

## the one-town case on its own

Only looks where the side held exactly one town, which is the state
sections 186 and 187 describe.

| side | looks | size | gross | upkeep | **net** | net ≤ 0 | median banked |
|---|---|---|---|---|---|---|---|
| orc | 100 | 1.0 | 2.0 | 0.0 | **2.05** | 0% | 2 |
| human | 124 | 1.0 | 2.1 | 0.0 | **2.13** | 0% | 3 |
| unbound | 390 | 1.3 | 3.5 | 0.0 | **3.48** | 0% | 6 |
| wandering | 903 | 1.7 | 3.3 | 0.1 | **3.21** | 0% | 9 |
| hivekin | 458 | 1.1 | 3.5 | 0.4 | **3.16** | 0% | 3 |

## did the box ever reach a settler?

Per side per game: the fullest the shield box ever got inside the window,
and how many times it fell (which is something finishing). A settler costs
20, or 25 for a Wanderer. If the high-water mark sits below that while the
net is three or four a turn, the box is being **spent** before it gets
there -- and the thing spending it is cheaper than a settler.

| side | games | max banked (mean / median / best) | reached 20 | reached 25 | things finished |
|---|---|---|---|---|---|
| orc, survived | 16 | 36.4 / 36 / 70 | 100% | 81% | 20.1 |
| orc, eliminated | 2 | 43.0 / 43 / 62 | 100% | 50% | 15.5 |
| human, survived | 17 | 52.3 / 44 / 141 | 94% | 88% | 16.5 |
| human, eliminated | 1 | 31.0 / 31 / 31 | 100% | 100% | 7.0 |
| unbound, survived | 10 | 44.5 / 45 / 68 | 90% | 90% | 12.3 |
| unbound, eliminated | 8 | 19.9 / 15 / 68 | 25% | 13% | 5.4 |
| wandering, survived | 7 | 26.0 / 24 / 32 | 100% | 29% | 9.6 |
| wandering, eliminated | 11 | 11.6 / 10 / 30 | 36% | 9% | 6.1 |
| hivekin, survived | 15 | 21.7 / 19 / 35 | 47% | 27% | 19.9 |
| hivekin, eliminated | 3 | 18.7 / 19 / 19 | 0% | 0% | 14.7 |

