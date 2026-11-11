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
| hivekin | **10.2** | 211 | **2165** | **20.0** | 74 | 0% | 5/18 | 3.48 | 13.2 |
| human | **23.5** | 249 | **5858** | **28.6** | 1560 | 15% | 2/18 | 6.15 | 28.2 |
| orc | **16.3** | 262 | **4263** | **28.9** | 351 | 2% | 4/18 | 5.36 | 20.2 |
| unbound | **16.0** | 160 | **2549** | **16.4** | 398 | 5% | 4/18 | 5.10 | 21.7 |
| wandering | **22.3** | 120 | **2683** | **14.8** | 698 | 9% | 0/18 | 5.21 | 26.6 |

## where the trade split goes

| side | coin | study | **calm** | city-turns rioting | at the limit |
|---|---|---|---|---|---|
| hivekin | 3.6 | 7.2 | **1.3** | 12.7% | 11.8% |
| human | 3.7 | 7.3 | **1.0** | 4.9% | 7.3% |
| orc | 3.4 | 6.9 | **1.7** | 10.1% | 14.5% |
| unbound | 3.4 | 6.7 | **1.9** | 12.9% | 14.7% |
| wandering | 3.7 | 7.3 | **0.9** | 3.7% | 11.7% |

## and per city, which separates small towns from many towns

| side | pop a city | trade a city | science bonus |
|---|---|---|---|
| hivekin | 4.71 | 3.78 | 0.1% |
| human | 5.35 | 4.58 | 3.5% |
| orc | 6.42 | 3.78 | 6.3% |
| unbound | 5.41 | 4.25 | 0.1% |
| wandering | 5.82 | 5.11 | 5.6% |

## the science buildings: learned against built

Every faction has two, at the same prices for the same bonus, and the
cheap one comes off the same shared advance for all five. So a side that
learns the advance and never builds is `chooseProduction`, and a side
that never learns it is research priority.

| side | ever built one | city-turns building one | peak shields in THAT city | what it costs there | peak anywhere |
|---|---|---|---|---|---|
| hivekin | **2/18** | 0.1% | **57** | **60** | 89 |
| human | **12/18** | 3.2% | **138** | **60** | 430 |
| orc | **14/18** | 2.8% | **183** | **60** | 183 |
| unbound | **1/18** | 0.9% | **72** | **60** | 119 |
| wandering | **7/18** | 6.3% | **94** | **60** | 215 |

## the cheap one against the dear one (section 175)

Each faction has two science buildings. The **cheap** one costs 60 and
comes off `hammers-of-glory`, one shared advance at depth 3 for all five
factions; the **dear** one costs 130 and comes off that faction’s own.
Three steps can fail -- learning the advance, the building appearing in a
city’s yard, and raising it -- and `offered` is read from
`buildOptions`, which is what the city is actually shown.

| side | cheap: knew / offered / built | dear: knew / offered / built | cheap learned first |
|---|---|---|---|
| hivekin | **12** / **12** / **2** | 4 / 4 / 0 | **4/4** | (of 18)
| human | **18** / **18** / **12** | 15 / 10 / 1 | **15/15** | (of 18)
| orc | **18** / **18** / **14** | 3 / 3 / 0 | **3/3** | (of 18)
| unbound | **10** / **10** / **1** | 13 / 13 / 0 | **0/10** | (of 18)
| wandering | **9** / **9** / **7** | 11 / 11 / 0 | **0/9** | (of 18)

## which step of chooseProduction answered (section 174)

Every decision each side made, by the step that made it. Step 4 is the
one that would build a science building, and it is last of the ones that
can: anything above it answering first is a decision step 4 never sees.

| side | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3 placate | 3a ending work | 3a' folly | 3b siege | 3c supply | 3d road crew | 4 economy/defence | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hivekin | 1.8% | 27.8% | 16.9% | 2.7% | 2.6% | 14.8% | 2.0% | 0.2% | 3.8% | 5.0% | **3.1%** | 19.2% |
| human | 2.0% | 23.1% | 2.8% | 6.4% | 1.4% | 2.5% | 5.1% | 0.0% | 6.1% | 0.5% | **14.0%** | 36.1% |
| orc | 2.6% | 19.6% | 2.9% | 7.3% | 4.7% | 1.2% | 4.5% | 0.0% | 4.7% | 0.6% | **16.3%** | 35.6% |
| unbound | 2.9% | 22.5% | 5.4% | 8.3% | 5.6% | 6.8% | 8.0% | 0.0% | 4.4% | 17.1% | **5.0%** | 14.1% |
| wandering | 1.1% | 20.6% | 6.0% | 6.6% | 2.5% | 2.9% | 5.1% | 0.1% | 3.9% | 0.2% | **16.4%** | 34.7% |

### and what step 4 bought, commonest first (science buildings bold)

| side | picks |
|---|---|
| hivekin | theRenderingPit 93%, **theScentRecord** 5%, theNarrowing 3% |
| human | market 67%, **scriptorium** 22%, exchange 6%, **library** 3%, barracks 1%, walls 1% |
| orc | treasury 68%, **thinkingRock** 18%, catapult 7%, barracks 3%, bigVault 3%, **biggerRock** 0% |
| unbound | titheBasin 75%, **sigilStacks** 16%, **wallOfNames** 6%, titheVault 3% |
| wandering | strongboxWagon 53%, **knottedRecord** 26%, **routeBook** 16%, tollPost 6% |

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
| hivekin | 1577 | 0.0% | **63.7%** | 0.1% | **36.2%** | 1.49 | 3.68 | 1.04 | **49.0%** |
| human | 8956 | 0.0% | **98.8%** | 0.0% | **1.2%** | 1.42 | 1.42 | 1.25 | **98.8%** |
| orc | 10778 | 0.0% | **98.6%** | 0.0% | **1.3%** | 1.29 | 1.29 | 1.10 | **98.6%** |
| unbound | 3158 | 0.0% | **42.0%** | 0.5% | **57.5%** | 0.88 | 14.14 | 1.19 | **99.7%** |
| wandering | 3718 | 0.0% | **99.6%** | 0.0% | **0.4%** | 2.27 | 2.27 | 1.15 | **99.6%** |
