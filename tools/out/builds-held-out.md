# what the step chose, first 40 turns after arriving, held-out (18 games)

Section 186: in the games a latecomer is eliminated, the median one builds
**no settlers at all** in this window, against three or four in the games it
survives. So its town is building something else, and `chooseProduction` is
an ordered list where the first step that answers wins.

`PRODUCTION_TRACE` (section 174) counts by faction and step. Here the counts
are differenced between half-turns and attributed to each faction's own
window, and the game is classified afterwards by whether that side ended
holding no city. Counting only; the trace rolls no dice.

Figures are **decisions per game**, and the share of that side’s decisions
in brackets. A decision is one call of the chooser, so a town that is told
the same thing twenty turns running counts twenty times.

## every game

| side | games | towns held | 0 nothing buildable | 1 garrison | 2 expand | 3a ending work | 3a' folly | 3c supply | 3d road crew | 4 economy/defence:market | 4 economy/defence:treasury | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orc | 18 | 4.8 | · | 26.5 (23%) | 28.8 (25%) | · | 4.6 (4%) | 6.1 (5%) | 1.9 (2%) | · | 1.6 (1%) | 45.8 (40%) |
| human | 18 | 5.7 | · | 48.4 (35%) | 23.5 (17%) | · | 6.7 (5%) | 9.8 (7%) | 1.8 (1%) | 3.1 (2%) | · | 44.6 (32%) |
| wandering | 18 | 3.2 | 0.8 (1%) | 16.4 (26%) | 22.4 (36%) | · | · | · | · | · | · | 23.4 (37%) |
| unbound | 18 | 3.6 | · | 25.9 (46%) | 10.6 (19%) | · | 5.2 (9%) | 0.1 (0%) | 0.1 (0%) | · | · | 14.0 (25%) |
| hivekin | 18 | 4.6 | 1.3 (1%) | 15.3 (13%) | 25.5 (22%) | 7.4 (6%) | · | 0.3 (0%) | 0.1 (0%) | · | · | 66.4 (57%) |

## games the side survived

| side | games | towns held | 0 nothing buildable | 1 garrison | 2 expand | 3a ending work | 3a' folly | 3c supply | 3d road crew | 4 economy/defence:market | 4 economy/defence:treasury | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orc | 16 | 4.9 | · | 25.3 (22%) | 27.1 (23%) | · | 4.3 (4%) | 6.8 (6%) | 2.1 (2%) | · | 1.7 (1%) | 49.2 (42%) |
| human | 18 | 5.7 | · | 48.4 (35%) | 23.5 (17%) | · | 6.7 (5%) | 9.8 (7%) | 1.8 (1%) | 3.1 (2%) | · | 44.6 (32%) |
| wandering | 11 | 4.4 | 1.3 (1%) | 21.7 (24%) | 31.2 (35%) | · | · | · | · | · | · | 35.1 (39%) |
| unbound | 11 | 4.8 | · | 37.7 (47%) | 16.0 (20%) | · | 7.6 (9%) | 0.2 (0%) | 0.1 (0%) | · | · | 18.9 (23%) |
| hivekin | 17 | 4.6 | 1.4 (1%) | 15.2 (13%) | 25.8 (23%) | 7.4 (6%) | · | 0.3 (0%) | 0.1 (0%) | · | · | 64.5 (56%) |

## games the side was eliminated

| side | games | towns held | 0 nothing buildable | 1 garrison | 2 expand | 3a ending work | 3a' folly | 3c supply | 3d road crew | 4 economy/defence:market | 4 economy/defence:treasury | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orc | 2 | 4.5 | · | 36.5 (34%) | 42.5 (40%) | · | 7.0 (7%) | 0.5 (0%) | 0.5 (0%) | · | 0.5 (0%) | 19.0 (18%) |
| wandering | 7 | 1.3 | · | 8.1 (37%) | 8.6 (39%) | · | · | · | · | · | · | 5.1 (24%) |
| unbound | 7 | 1.6 | · | 7.4 (43%) | 2.1 (12%) | · | 1.4 (8%) | · | · | · | · | 6.3 (36%) |
| hivekin | 1 | 5.0 | · | 18.0 (12%) | 20.0 (14%) | 8.0 (6%) | · | · | · | · | · | 99.0 (68%) |

