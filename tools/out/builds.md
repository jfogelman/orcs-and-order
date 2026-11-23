# what the step chose, first 40 turns after arriving, tuned (18 games)

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

| side | games | towns held | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3a ending work | 3a' folly | 3c supply | 3d road crew | 4 economy/defence:market | 4 economy/defence:treasury | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orc | 18 | 5.1 | 0.1 (0%) | 26.2 (21%) | 24.2 (19%) | · | · | 4.9 (4%) | 9.5 (8%) | 2.9 (2%) | · | 2.1 (2%) | 55.2 (44%) |
| human | 18 | 5.7 | · | 45.5 (33%) | 23.8 (17%) | 0.1 (0%) | · | 6.2 (4%) | 13.1 (9%) | 1.4 (1%) | 2.2 (2%) | · | 45.6 (33%) |
| unbound | 18 | 3.5 | 0.3 (1%) | 26.8 (46%) | 15.4 (27%) | · | · | 3.7 (6%) | · | · | · | · | 11.7 (20%) |
| wandering | 18 | 2.9 | 0.3 (1%) | 14.7 (27%) | 22.0 (41%) | · | · | · | · | · | · | · | 16.4 (31%) |
| hivekin | 18 | 4.3 | 0.9 (1%) | 13.4 (12%) | 25.3 (23%) | · | 8.9 (8%) | · | 0.2 (0%) | 0.5 (0%) | · | · | 61.3 (55%) |

## games the side survived

| side | games | towns held | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3a ending work | 3a' folly | 3c supply | 3d road crew | 4 economy/defence:market | 4 economy/defence:treasury | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orc | 16 | 5.1 | 0.1 (0%) | 26.3 (21%) | 23.6 (19%) | · | · | 5.0 (4%) | 8.5 (7%) | 2.9 (2%) | · | 2.3 (2%) | 56.9 (45%) |
| human | 17 | 5.7 | · | 45.2 (33%) | 23.8 (17%) | 0.1 (0%) | · | 6.1 (4%) | 13.4 (10%) | 1.5 (1%) | 2.4 (2%) | · | 46.5 (33%) |
| unbound | 10 | 4.7 | 0.6 (1%) | 39.5 (49%) | 22.1 (27%) | · | · | 4.8 (6%) | · | · | · | · | 14.0 (17%) |
| wandering | 7 | 4.0 | 0.9 (1%) | 23.7 (30%) | 36.3 (46%) | · | · | · | · | · | · | · | 17.7 (23%) |
| hivekin | 15 | 4.5 | 1.1 (1%) | 12.1 (11%) | 22.9 (20%) | · | 10.0 (9%) | · | 0.2 (0%) | 0.6 (1%) | · | · | 66.2 (59%) |

## games the side was eliminated

| side | games | towns held | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3a ending work | 3a' folly | 3c supply | 3d road crew | 4 economy/defence:market | 4 economy/defence:treasury | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orc | 2 | 5.0 | · | 26.0 (21%) | 29.5 (24%) | · | · | 4.5 (4%) | 17.5 (14%) | 3.0 (2%) | · | 1.0 (1%) | 42.0 (34%) |
| human | 1 | 5.0 | · | 50.0 (42%) | 23.0 (19%) | · | · | 8.0 (7%) | 7.0 (6%) | · | · | · | 30.0 (25%) |
| unbound | 8 | 2.0 | · | 10.9 (38%) | 7.0 (24%) | · | · | 2.3 (8%) | · | · | · | · | 8.9 (31%) |
| wandering | 11 | 2.2 | · | 8.9 (24%) | 12.9 (34%) | · | · | · | · | · | · | · | 15.6 (42%) |
| hivekin | 3 | 3.7 | · | 20.0 (20%) | 37.3 (38%) | · | 3.7 (4%) | · | · | · | · | · | 37.0 (38%) |

