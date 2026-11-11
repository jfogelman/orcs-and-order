# throughput, held-out, budget counts diggers (section 177) (18 games, 6 a base)

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
| hivekin | **12.6** | 199 | **2508** | **20.8** | 174 | 1% | 1/18 | 3.94 | 16.0 |
| human | **29.7** | 252 | **7469** | **31.8** | 2531 | 20% | 8/18 | 6.38 | 33.0 |
| orc | **15.1** | 245 | **3710** | **27.8** | 142 | 0% | 0/18 | 5.04 | 18.9 |
| unbound | **12.8** | 140 | **1787** | **14.4** | 60 | 0% | 2/18 | 4.92 | 16.4 |
| wandering | **17.3** | 150 | **2593** | **18.2** | 145 | 2% | 0/18 | 5.24 | 21.1 |

## where the trade split goes

| side | coin | study | **calm** | city-turns rioting | at the limit |
|---|---|---|---|---|---|
| hivekin | 3.7 | 7.4 | **1.0** | 7.9% | 9.3% |
| human | 3.8 | 7.6 | **0.6** | 2.5% | 5.0% |
| orc | 3.6 | 7.1 | **1.3** | 7.0% | 13.5% |
| unbound | 3.5 | 6.9 | **1.6** | 10.6% | 14.1% |
| wandering | 3.7 | 7.3 | **1.0** | 4.1% | 11.8% |

## and per city, which separates small towns from many towns

| side | pop a city | trade a city | science bonus |
|---|---|---|---|
| hivekin | 4.03 | 4.06 | 0.0% |
| human | 5.96 | 5.17 | 7.4% |
| orc | 5.90 | 3.74 | 4.6% |
| unbound | 4.51 | 3.33 | 1.1% |
| wandering | 5.46 | 4.02 | 6.8% |

## the science buildings: learned against built

Every faction has two, at the same prices for the same bonus, and the
cheap one comes off the same shared advance for all five. So a side that
learns the advance and never builds is `chooseProduction`, and a side
that never learns it is research priority.

| side | ever built one | city-turns building one | peak shields in THAT city | what it costs there | peak anywhere |
|---|---|---|---|---|---|
| hivekin | **0/18** | 0.1% | **41** | **60** | 119 |
| human | **18/18** | 4.4% | **146** | **130** | 199 |
| orc | **15/18** | 3.0% | **127** | **60** | 140 |
| unbound | **2/18** | 5.0% | **81** | **60** | 119 |
| wandering | **9/18** | 8.1% | **127** | **60** | 212 |

## the cheap one against the dear one (section 175)

Each faction has two science buildings. The **cheap** one costs 60 and
comes off `hammers-of-glory`, one shared advance at depth 3 for all five
factions; the **dear** one costs 130 and comes off that faction’s own.
Three steps can fail -- learning the advance, the building appearing in a
city’s yard, and raising it -- and `offered` is read from
`buildOptions`, which is what the city is actually shown.

| side | cheap: knew / offered / built | dear: knew / offered / built | cheap learned first |
|---|---|---|---|
| hivekin | **13** / **13** / **0** | 4 / 4 / 0 | **4/4** | (of 18)
| human | **18** / **18** / **18** | 17 / 17 / 3 | **17/17** | (of 18)
| orc | **18** / **18** / **15** | 1 / 1 / 0 | **1/1** | (of 18)
| unbound | **8** / **8** / **2** | 12 / 12 / 0 | **0/8** | (of 18)
| wandering | **10** / **10** / **9** | 13 / 13 / 1 | **0/10** | (of 18)

## which step of chooseProduction answered (section 174)

Every decision each side made, by the step that made it. Step 4 is the
one that would build a science building, and it is last of the ones that
can: anything above it answering first is a decision step 4 never sees.

| side | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3 placate | 3a ending work | 3a' folly | 3b siege | 3c supply | 3d road crew | 4 economy/defence | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hivekin | 1.9% | 30.1% | 14.3% | 3.0% | 2.1% | 15.2% | 1.2% | 0.3% | 3.4% | 0.8% | **2.2%** | 25.4% |
| human | 2.2% | 22.3% | 2.0% | 5.0% | 0.7% | 4.0% | 6.5% | 0.0% | 6.0% | 0.4% | **16.4%** | 34.6% |
| orc | 1.8% | 17.2% | 3.9% | 7.0% | 3.0% | 0.8% | 4.5% | 0.0% | 7.1% | 0.7% | **15.5%** | 38.6% |
| unbound | 3.1% | 18.2% | 4.5% | 4.5% | 4.7% | 4.9% | 9.1% | 0.0% | 5.0% | 0.6% | **12.4%** | 33.1% |
| wandering | 2.0% | 19.8% | 5.7% | 5.1% | 2.0% | 0.3% | 4.2% | 0.1% | 3.3% | 0.4% | **18.9%** | 38.2% |

### and what step 4 bought, commonest first (science buildings bold)

| side | picks |
|---|---|
| hivekin | theRenderingPit 97%, **theScentRecord** 3%, theNarrowing 0% |
| human | market 60%, **scriptorium** 17%, exchange 11%, **library** 11%, barracks 0%, walls 0% |
| orc | treasury 68%, **thinkingRock** 20%, catapult 7%, barracks 4%, **biggerRock** 1%, bigVault 1% |
| unbound | **sigilStacks** 45%, titheBasin 45%, **wallOfNames** 9%, titheVault 1% |
| wandering | strongboxWagon 49%, **knottedRecord** 35%, **routeBook** 13%, tollPost 2%, circledWagons 0% |

## inside the road-crew step (section 177)

Step 3d answers 17% of the Unbound’s production decisions and 0.2--0.6%
of each empire’s. It has three conditions, and the share alone does not
say which of them differs. These are counted where each is evaluated,
over the decisions that reached the step with its outer gate open.

`budget full` is `workers < wanted` saying no, where `workers` counts
units flagged `settler`. `would be full` is the same budget read against
units flagged `works` -- the ones that actually dig -- which is what the
step builds. For the empires the two flags sit on one unit and the
columns should agree; where they disagree, the budget is counting a unit
the faction never builds.

| side | gate open | no digger | budget full | no work | **fires** | mean workers | mean diggers | mean wanted | **would be full** |
|---|---|---|---|---|---|---|---|---|---|
| hivekin | 1232 | 0.0% | **92.6%** | 0.0% | **7.4%** | 0.93 | 0.93 | 1.00 | **92.6%** |
| human | 11588 | 0.0% | **99.1%** | 0.0% | **0.9%** | 1.73 | 1.73 | 1.32 | **99.1%** |
| orc | 8808 | 0.0% | **97.4%** | 1.1% | **1.5%** | 1.48 | 1.48 | 1.05 | **97.4%** |
| unbound | 2739 | 0.0% | **98.2%** | 0.0% | **1.8%** | 1.72 | 1.72 | 1.13 | **98.2%** |
| wandering | 5631 | 0.0% | **99.2%** | 0.0% | **0.8%** | 1.74 | 1.74 | 1.18 | **99.2%** |
