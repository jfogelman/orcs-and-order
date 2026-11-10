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
| hivekin | **11.2** | 194 | **2175** | **19.7** | 128 | 1% | 4/18 | 3.76 | 14.2 |
| human | **28.8** | 251 | **7218** | **31.9** | 2187 | 18% | 6/18 | 6.50 | 32.1 |
| orc | **14.6** | 235 | **3431** | **26.7** | 99 | 0% | 1/18 | 5.08 | 18.8 |
| unbound | **12.3** | 133 | **1640** | **13.5** | 96 | 1% | 1/18 | 4.90 | 15.8 |
| wandering | **16.9** | 152 | **2574** | **18.2** | 208 | 2% | 0/18 | 5.37 | 21.1 |

## where the trade split goes

| side | coin | study | **calm** | city-turns rioting | at the limit |
|---|---|---|---|---|---|
| hivekin | 3.6 | 7.2 | **1.2** | 10.7% | 9.5% |
| human | 3.8 | 7.5 | **0.7** | 3.2% | 5.5% |
| orc | 3.5 | 7.0 | **1.5** | 9.0% | 14.4% |
| unbound | 3.5 | 7.0 | **1.5** | 9.5% | 13.3% |
| wandering | 3.7 | 7.3 | **0.9** | 3.6% | 11.1% |

## and per city, which separates small towns from many towns

| side | pop a city | trade a city | science bonus |
|---|---|---|---|
| hivekin | 3.99 | 3.78 | 0.0% |
| human | 5.92 | 4.94 | 6.7% |
| orc | 6.04 | 3.71 | 4.1% |
| unbound | 4.51 | 3.23 | 0.0% |
| wandering | 5.22 | 3.94 | 4.3% |

## the science buildings: learned against built

Every faction has two, at the same prices for the same bonus, and the
cheap one comes off the same shared advance for all five. So a side that
learns the advance and never builds is `chooseProduction`, and a side
that never learns it is research priority.

| side | ever built one | city-turns building one | peak shields in THAT city | what it costs there | peak anywhere |
|---|---|---|---|---|---|
| hivekin | **0/18** | 0.1% | **51** | **60** | 178 |
| human | **17/18** | 4.3% | **194** | **60** | 368 |
| orc | **15/18** | 2.9% | **67** | **60** | 156 |
| unbound | **0/18** | 1.4% | **59** | **60** | 120 |
| wandering | **7/18** | 6.9% | **135** | **60** | 135 |

## the cheap one against the dear one (section 175)

Each faction has two science buildings. The **cheap** one costs 60 and
comes off `hammers-of-glory`, one shared advance at depth 3 for all five
factions; the **dear** one costs 130 and comes off that faction’s own.
Three steps can fail -- learning the advance, the building appearing in a
city’s yard, and raising it -- and `offered` is read from
`buildOptions`, which is what the city is actually shown.

| side | cheap: knew / offered / built | dear: knew / offered / built | cheap learned first |
|---|---|---|---|
| hivekin | **11** / **11** / **0** | 4 / 4 / 0 | **4/4** | (of 18)
| human | **18** / **18** / **17** | 18 / 17 / 2 | **18/18** | (of 18)
| orc | **18** / **18** / **15** | 0 / 0 / 0 | **0/0** | (of 18)
| unbound | **7** / **7** / **0** | 12 / 12 / 0 | **0/7** | (of 18)
| wandering | **11** / **11** / **7** | 13 / 13 / 1 | **0/11** | (of 18)

## which step of chooseProduction answered (section 174)

Every decision each side made, by the step that made it. Step 4 is the
one that would build a science building, and it is last of the ones that
can: anything above it answering first is a decision step 4 never sees.

| side | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3 placate | 3a ending work | 3a' folly | 3b siege | 3c supply | 3d road crew | 4 economy/defence | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hivekin | 1.8% | 33.0% | 18.4% | 2.5% | 1.1% | 13.2% | 1.0% | 0.1% | 2.4% | 6.2% | **1.1%** | 19.4% |
| human | 2.3% | 22.2% | 2.0% | 5.5% | 1.5% | 4.0% | 6.2% | 0.0% | 5.2% | 0.4% | **16.3%** | 34.3% |
| orc | 1.9% | 16.1% | 4.0% | 7.5% | 3.4% | 1.0% | 5.0% | 0.0% | 7.4% | 0.6% | **15.3%** | 37.7% |
| unbound | 2.7% | 23.0% | 5.8% | 5.2% | 4.0% | 4.8% | 10.1% | 0.0% | 7.0% | 13.7% | **5.3%** | 18.2% |
| wandering | 2.0% | 19.6% | 5.5% | 5.1% | 2.1% | 0.5% | 4.0% | 0.1% | 3.1% | 0.5% | **17.8%** | 39.7% |

### and what step 4 bought, commonest first (science buildings bold)

| side | picks |
|---|---|
| hivekin | theRenderingPit 88%, **theScentRecord** 12% |
| human | market 59%, **scriptorium** 20%, exchange 10%, **library** 9%, barracks 1%, walls 1% |
| orc | treasury 69%, **thinkingRock** 20%, catapult 8%, barracks 3%, bigVault 0% |
| unbound | titheBasin 65%, **sigilStacks** 26%, **wallOfNames** 8% |
| wandering | strongboxWagon 55%, **knottedRecord** 32%, **routeBook** 13%, tollPost 1%, circledWagons 0% |
