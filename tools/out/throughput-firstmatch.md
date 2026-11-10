# throughput, tuned, first match (section 175) (18 games, 6 a base)

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

| side | ever built one | city-turns building one | peak shields in THAT city | what it costs there | peak anywhere |
|---|---|---|---|---|---|
| hivekin | **1/18** | 0.1% | **57** | **60** | 89 |
| human | **14/18** | 4.3% | **150** | **60** | 199 |
| orc | **14/18** | 2.7% | **88** | **60** | 246 |
| unbound | **0/18** | 3.9% | **81** | **130** | 222 |
| wandering | **0/18** | 15.1% | **112** | **130** | 180 |

## the cheap one against the dear one (section 175)

Each faction has two science buildings. The **cheap** one costs 60 and
comes off `hammers-of-glory`, one shared advance at depth 3 for all five
factions; the **dear** one costs 130 and comes off that faction’s own.
Three steps can fail -- learning the advance, the building appearing in a
city’s yard, and raising it -- and `offered` is read from
`buildOptions`, which is what the city is actually shown.

| side | cheap: knew / offered / built | dear: knew / offered / built | cheap learned first |
|---|---|---|---|
| hivekin | **11** / **11** / **1** | 5 / 5 / 0 | **5/5** | (of 18)
| human | **18** / **18** / **14** | 16 / 13 / 1 | **16/16** | (of 18)
| orc | **18** / **18** / **14** | 2 / 2 / 0 | **2/2** | (of 18)
| unbound | **9** / **9** / **0** | 13 / 13 / 0 | **0/9** | (of 18)
| wandering | **9** / **9** / **0** | 11 / 11 / 0 | **0/9** | (of 18)

## which step of chooseProduction answered (section 174)

Every decision each side made, by the step that made it. Step 4 is the
one that would build a science building, and it is last of the ones that
can: anything above it answering first is a decision step 4 never sees.

| side | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3 placate | 3a ending work | 3a' folly | 3b siege | 3c supply | 3d road crew | 4 economy/defence | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hivekin | 1.9% | 27.3% | 18.5% | 2.1% | 2.7% | 15.0% | 1.8% | 0.0% | 3.5% | 5.4% | **2.8%** | 19.0% |
| human | 2.3% | 21.6% | 2.5% | 6.2% | 1.3% | 3.0% | 5.3% | 0.0% | 5.9% | 0.5% | **14.4%** | 36.9% |
| orc | 2.6% | 20.2% | 3.0% | 7.3% | 4.5% | 1.2% | 4.4% | 0.0% | 5.0% | 0.7% | **15.7%** | 35.4% |
| unbound | 2.8% | 21.1% | 5.0% | 8.5% | 5.9% | 6.5% | 7.6% | 0.0% | 4.8% | 19.4% | **5.1%** | 13.3% |
| wandering | 2.0% | 22.9% | 5.7% | 6.1% | 2.0% | 2.3% | 5.1% | 0.0% | 3.2% | 0.2% | **16.3%** | 34.1% |

### and what step 4 bought, commonest first (science buildings bold)

| side | picks |
|---|---|
| hivekin | theRenderingPit 95%, **theScentRecord** 4%, theNarrowing 1% |
| human | market 65%, **scriptorium** 23%, **library** 9%, walls 1%, barracks 1%, exchange 0% |
| orc | treasury 70%, **thinkingRock** 17%, catapult 8%, barracks 4%, **biggerRock** 1%, bigVault 1% |
| unbound | **sigilStacks** 100% |
| wandering | **knottedRecord** 100% |
