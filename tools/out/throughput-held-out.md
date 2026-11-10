# throughput, held-out (18 games, 6 a base)

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
| hivekin | **11.0** | 191 | **2110** | **19.3** | 123 | 1% | 4/18 | 3.72 | 14.0 |
| human | **29.6** | 255 | **7546** | **31.9** | 2572 | 19% | 5/18 | 6.62 | 33.0 |
| orc | **14.7** | 233 | **3410** | **26.7** | 106 | 0% | 2/18 | 5.01 | 18.7 |
| unbound | **12.3** | 133 | **1629** | **13.3** | 134 | 1% | 1/18 | 4.93 | 15.8 |
| wandering | **16.1** | 157 | **2515** | **18.2** | 172 | 2% | 1/18 | 5.45 | 21.1 |

## where the trade split goes

| side | coin | study | **calm** | city-turns rioting | at the limit |
|---|---|---|---|---|---|
| hivekin | 3.6 | 7.2 | **1.2** | 10.8% | 9.6% |
| human | 3.8 | 7.5 | **0.8** | 3.4% | 5.4% |
| orc | 3.6 | 7.0 | **1.4** | 8.3% | 14.2% |
| unbound | 3.6 | 7.0 | **1.4** | 9.1% | 13.1% |
| wandering | 3.7 | 7.3 | **1.0** | 4.0% | 12.0% |

## and per city, which separates small towns from many towns

| side | pop a city | trade a city | science bonus |
|---|---|---|---|
| hivekin | 4.05 | 3.77 | 0.0% |
| human | 5.89 | 4.99 | 6.9% |
| orc | 6.02 | 3.74 | 3.9% |
| unbound | 4.46 | 3.21 | 0.0% |
| wandering | 5.28 | 3.86 | 0.1% |

## the science buildings: learned against built

Every faction has two, at the same prices for the same bonus, and the
cheap one comes off the same shared advance for all five. So a side that
learns the advance and never builds is `chooseProduction`, and a side
that never learns it is research priority.

| side | ever built one | city-turns building one | peak shields in THAT city | what it costs there | peak anywhere |
|---|---|---|---|---|---|
| hivekin | **1/18** | 0.1% | **57** | **60** | 178 |
| human | **18/18** | 5.9% | **159** | **130** | 386 |
| orc | **15/18** | 3.2% | **67** | **60** | 182 |
| unbound | **0/18** | 2.7% | **93** | **130** | 119 |
| wandering | **1/18** | 15.6% | **118** | **130** | 147 |

## the cheap one against the dear one (section 175)

Each faction has two science buildings. The **cheap** one costs 60 and
comes off `hammers-of-glory`, one shared advance at depth 3 for all five
factions; the **dear** one costs 130 and comes off that faction’s own.
Three steps can fail -- learning the advance, the building appearing in a
city’s yard, and raising it -- and `offered` is read from
`buildOptions`, which is what the city is actually shown.

| side | cheap: knew / offered / built | dear: knew / offered / built | cheap learned first |
|---|---|---|---|
| hivekin | **11** / **11** / **1** | 3 / 3 / 0 | **3/3** | (of 18)
| human | **18** / **18** / **18** | 18 / 18 / 3 | **18/18** | (of 18)
| orc | **18** / **18** / **15** | 1 / 0 / 0 | **1/1** | (of 18)
| unbound | **8** / **8** / **0** | 12 / 12 / 0 | **0/8** | (of 18)
| wandering | **11** / **11** / **0** | 13 / 13 / 1 | **0/11** | (of 18)

## which step of chooseProduction answered (section 174)

Every decision each side made, by the step that made it. Step 4 is the
one that would build a science building, and it is last of the ones that
can: anything above it answering first is a decision step 4 never sees.

| side | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3 placate | 3a ending work | 3a' folly | 3b siege | 3c supply | 3d road crew | 4 economy/defence | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hivekin | 1.7% | 32.1% | 18.7% | 2.4% | 1.2% | 13.5% | 1.0% | 0.0% | 2.4% | 6.6% | **0.9%** | 19.5% |
| human | 2.5% | 22.7% | 1.9% | 5.5% | 1.4% | 3.9% | 5.8% | 0.0% | 4.9% | 0.5% | **16.4%** | 34.5% |
| orc | 1.8% | 16.5% | 4.1% | 6.7% | 3.4% | 0.9% | 4.9% | 0.0% | 7.0% | 0.6% | **15.8%** | 38.4% |
| unbound | 2.8% | 23.2% | 5.4% | 5.1% | 4.1% | 4.9% | 10.5% | 0.0% | 8.1% | 15.0% | **4.0%** | 16.9% |
| wandering | 2.5% | 22.9% | 5.2% | 4.5% | 2.3% | 0.5% | 3.7% | 0.1% | 3.0% | 0.4% | **17.1%** | 37.7% |

### and what step 4 bought, commonest first (science buildings bold)

| side | picks |
|---|---|
| hivekin | theRenderingPit 85%, **theScentRecord** 15% |
| human | market 58%, **scriptorium** 21%, **library** 19%, barracks 1%, walls 1%, exchange 0% |
| orc | treasury 69%, **thinkingRock** 21%, catapult 6%, barracks 4%, bigVault 0% |
| unbound | **sigilStacks** 100% |
| wandering | **knottedRecord** 100%, strongboxWagon 0%, **routeBook** 0% |
