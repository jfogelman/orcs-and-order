# throughput, tuned, budget counts diggers (section 177) (18 games, 6 a base)

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
| hivekin | **11.4** | 195 | **2230** | **19.7** | 197 | 1% | 7/18 | 3.59 | 14.3 |
| human | **22.9** | 234 | **5338** | **27.5** | 1427 | 12% | 4/18 | 6.01 | 27.0 |
| orc | **17.8** | 239 | **4267** | **29.0** | 255 | 1% | 1/18 | 5.40 | 22.1 |
| unbound | **14.8** | 138 | **2040** | **14.3** | 270 | 3% | 4/18 | 4.90 | 19.2 |
| wandering | **17.6** | 125 | **2200** | **14.1** | 404 | 6% | 0/18 | 4.81 | 21.6 |

## where the trade split goes

| side | coin | study | **calm** | city-turns rioting | at the limit |
|---|---|---|---|---|---|
| hivekin | 3.6 | 7.3 | **1.1** | 9.3% | 11.9% |
| human | 3.8 | 7.4 | **0.8** | 3.4% | 7.8% |
| orc | 3.6 | 7.0 | **1.5** | 7.8% | 14.8% |
| unbound | 3.6 | 7.1 | **1.4** | 9.0% | 13.5% |
| wandering | 3.7 | 7.2 | **1.2** | 7.0% | 12.3% |

## and per city, which separates small towns from many towns

| side | pop a city | trade a city | science bonus |
|---|---|---|---|
| hivekin | 4.63 | 3.99 | 0.2% |
| human | 5.21 | 4.49 | 4.2% |
| orc | 6.50 | 4.10 | 4.9% |
| unbound | 4.90 | 3.93 | 0.4% |
| wandering | 5.44 | 4.48 | 3.2% |

## the science buildings: learned against built

Every faction has two, at the same prices for the same bonus, and the
cheap one comes off the same shared advance for all five. So a side that
learns the advance and never builds is `chooseProduction`, and a side
that never learns it is research priority.

| side | ever built one | city-turns building one | peak shields in THAT city | what it costs there | peak anywhere |
|---|---|---|---|---|---|
| hivekin | **1/18** | 0.4% | **54** | **60** | 93 |
| human | **13/18** | 3.6% | **174** | **60** | 199 |
| orc | **16/18** | 3.5% | **67** | **60** | 244 |
| unbound | **1/18** | 3.4% | **72** | **60** | 129 |
| wandering | **5/18** | 6.2% | **90** | **60** | 226 |

## the cheap one against the dear one (section 175)

Each faction has two science buildings. The **cheap** one costs 60 and
comes off `hammers-of-glory`, one shared advance at depth 3 for all five
factions; the **dear** one costs 130 and comes off that faction’s own.
Three steps can fail -- learning the advance, the building appearing in a
city’s yard, and raising it -- and `offered` is read from
`buildOptions`, which is what the city is actually shown.

| side | cheap: knew / offered / built | dear: knew / offered / built | cheap learned first |
|---|---|---|---|
| hivekin | **10** / **10** / **1** | 5 / 5 / 0 | **5/5** | (of 18)
| human | **18** / **18** / **13** | 14 / 11 / 0 | **14/14** | (of 18)
| orc | **18** / **18** / **16** | 3 / 3 / 0 | **3/3** | (of 18)
| unbound | **9** / **9** / **1** | 12 / 12 / 0 | **0/9** | (of 18)
| wandering | **8** / **8** / **5** | 11 / 11 / 0 | **0/8** | (of 18)

## which step of chooseProduction answered (section 174)

Every decision each side made, by the step that made it. Step 4 is the
one that would build a science building, and it is last of the ones that
can: anything above it answering first is a decision step 4 never sees.

| side | 0 nothing buildable | 1 garrison | 2 expand | 3 content building | 3 placate | 3a ending work | 3a' folly | 3c supply | 3d road crew | 4 economy/defence | 5 biggest stick |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hivekin | 1.3% | 22.7% | 14.2% | 3.4% | 2.9% | 16.7% | 2.8% | 4.4% | 0.6% | **5.4%** | 25.7% |
| human | 1.9% | 20.2% | 3.0% | 5.1% | 1.5% | 2.6% | 5.4% | 5.8% | 0.4% | **15.7%** | 38.4% |
| orc | 2.4% | 17.8% | 2.4% | 5.5% | 4.4% | 1.3% | 4.9% | 5.3% | 0.8% | **18.1%** | 37.1% |
| unbound | 3.6% | 15.0% | 7.0% | 6.6% | 5.3% | 6.1% | 8.3% | 4.7% | 0.3% | **13.1%** | 30.0% |
| wandering | 0.7% | 18.2% | 9.6% | 6.5% | 2.7% | 2.1% | 5.1% | 2.9% | 0.3% | **15.6%** | 36.3% |

### and what step 4 bought, commonest first (science buildings bold)

| side | picks |
|---|---|
| hivekin | theRenderingPit 90%, **theScentRecord** 8%, theNarrowing 2% |
| human | market 66%, **scriptorium** 20%, exchange 8%, **library** 4%, barracks 1%, walls 1% |
| orc | treasury 69%, **thinkingRock** 20%, bigVault 4%, catapult 4%, barracks 3%, **biggerRock** 0% |
| unbound | titheBasin 68%, **sigilStacks** 22%, **wallOfNames** 10% |
| wandering | strongboxWagon 53%, **knottedRecord** 32%, **routeBook** 13%, tollPost 2% |

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
| hivekin | 2017 | 0.0% | **96.7%** | 0.0% | **3.3%** | 1.14 | 1.14 | 1.17 | **96.7%** |
| human | 9205 | 0.0% | **98.9%** | 0.1% | **1.0%** | 1.45 | 1.45 | 1.14 | **98.9%** |
| orc | 10557 | 0.0% | **98.4%** | 0.0% | **1.6%** | 1.19 | 1.19 | 1.10 | **98.4%** |
| unbound | 3289 | 0.0% | **97.8%** | 1.3% | **0.8%** | 2.18 | 2.18 | 1.23 | **97.8%** |
| wandering | 3357 | 0.0% | **99.2%** | 0.0% | **0.8%** | 2.30 | 2.30 | 1.07 | **99.2%** |
