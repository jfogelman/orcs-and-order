# settlers in the first 40 turns, held-out (18 games, 6 a base)

Section 185 found that what separates a surviving latecomer from an
eliminated one is towns founded in its first forty turns, with the map not
full and lateness not fatal on its own. A low count of towns has three very
different causes -- never built, built and killed, built and still walking --
and they want opposite fixes. This separates them.

`arrived with` is settlers standing there at the first look -- every
latecomer is given `HIVEKIN.founders` of them, the same count for every
faction -- and `built` is what the side produced after that. They are kept
apart because "builds fewer" and "builds none" are different findings.

Settlers are followed by unit id between half-turns. A settler that vanishes
leaving a city of its own side on the tile it stood on **founded**; one that
vanishes otherwise was **lost**. `blamed` is a guess and is labelled one: the
nearest hostile within two tiles at the previous look.

## per game, in the window

| side | games | arrived with | built | founded | lost | still walking | turns before founding | turns before dying |
|---|---|---|---|---|---|---|---|---|
| human | 18 | 2.0 | **4.8** | **6.1** | **0.6** | 0.1 | 8 | 77 |
| orc | 18 | 1.0 | **3.8** | **3.9** | **0.8** | 0.1 | 6 | 58 |
| wandering | 18 | 2.0 | **2.6** | **3.2** | **1.4** | 0.0 | 8 | 13 |
| unbound | 18 | 2.0 | **2.1** | **3.5** | **0.6** | 0.0 | 4 | 5 |
| hivekin | 18 | 2.0 | **4.6** | **5.8** | **0.8** | 0.0 | 4 | 4 |

## built and lost, split by whether the side survived

Mean / median. Small n; these are numbers, not tested differences.

| side | survived n | built | lost | eliminated n | built | lost |
|---|---|---|---|---|---|---|
| human | 18 | 4.8 / 5.0 | 0.6 / 0.5 | 0 | 0.0 / 0.0 | 0.0 / 0.0 |
| orc | 16 | 3.9 / 4.0 | 0.9 / 1.0 | 2 | 3.5 / 3.5 | 0.5 / 0.5 |
| wandering | 11 | 3.7 / 4.0 | 1.4 / 1.0 | 7 | 0.7 / 0.0 | 1.6 / 2.0 |
| unbound | 11 | 3.2 / 3.0 | 0.4 / 0.0 | 7 | 0.4 / 0.0 | 1.0 / 1.0 |
| hivekin | 17 | 4.7 / 5.0 | 0.8 / 0.0 | 1 | 3.0 / 3.0 | 0.0 / 0.0 |

## who was standing nearby when one was lost (a guess, not evidence)

| side | hivekin | human | nobody in sight | orc | raiders | unbound | wandering |
|---|---|---|---|---|---|---|---|
| human | 2 | 0 | 4 | 3 | 0 | 0 | 1 |
| orc | 3 | 2 | 9 | 0 | 0 | 1 | 0 |
| wandering | 2 | 0 | 18 | 2 | 3 | 1 | 0 |
| unbound | 7 | 0 | 2 | 2 | 0 | 0 | 0 |
| hivekin | 0 | 1 | 3 | 8 | 0 | 1 | 1 |

