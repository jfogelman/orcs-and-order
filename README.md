# Orcs & Order

A small, extremely tongue-in-cheek turn-based 4X in which orcs slowly discover that
two orcs can stand in the same place.

The tech tree is the joke. The Horde advances through `First Orc` → `Let's Orc
Together` → `Idiots Stick Together` → `The Next Level of Stupid` → `Beyond Stupid` →
`Not Just Stupid Anymore` → `And Stupidity for All`. The Kingdom reaches the same
conclusion via `Brotherhood`, `Join the Army`, `Bunches of Footmen`, and
`10 Heads are Better than One`. Every advance name comes from the original design
doc.

Units stay singleton — one tile, one unit. **"Two Orcs" is not a stack**;
it is a unit type with two orcs drawn on it and double the numbers. Ten of them cost
ten orcs' worth of shields, occupy one tile, spend one movement point, and die all at
once.

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`dist/` is a self-contained static site with no server and no dependencies (88 KB of
JS, 30 KB gzipped). It is built with a relative base, so it works unchanged from
GitHub Pages, an itch.io HTML5 upload, or a local file open.

```bash
npm test
```

## Playing

| Input | Does |
|---|---|
| Left-click | Select your unit, or open your city |
| Left-click again | On a unit standing in a city, opens the city underneath it |
| Left-click open ground | Move there, if it is in range |
| Right-click | Move or attack at any distance — including into your own cities |
| Left-drag | Pan · **Wheel** zoom · **Arrows** pan |
| `B` | Found a city (Peons and Peasants only) |
| `P` | Orcpedia — also reachable by clicking any unit's name |
| `F` fortify · `S` sentry · `Space` skip · `N` next idle unit · `C` centre | |
| `T` advances · `Ctrl+S` saves · `G` grid · `Enter` end turn · `Esc` deselect | |
| `M` | Mute. The **Sound** button opens music and effects volume sliders |

**Reading the map.** A blue wash marks everywhere the selected unit can reach *this
turn*; red marks what it can attack. Hovering shows a dashed line — a proposal. Once
ordered, the route becomes a **solid blue line with a ring at the destination**: a
standing march order the unit resumes every turn until it arrives. The readout tells
you how many turns that will take.

**Research is never chosen for you.** Beakers bank up until you pick a target, so you
are asked rather than assigned; the tech tree opens by itself whenever nothing is
being researched.

The soundtrack follows the situation: the battle theme cross-fades in whenever an enemy
unit is in sight and holds for two turns after the last one is lost from view.

Move into an enemy to attack. Winning a fight does not advance you into the tile —
walk in afterwards to take an emptied city.

## Where things are

```
src/
  engine/   rng, grid, A* pathfinding, line of sight   — no game knowledge
  model/    terrain, units, techs, buildings, factions — pure data tables
  sim/      worldgen, turn pipeline, movement, combat, cities, research
  ai/       the opponent, behind a one-function interface
  render/   canvas map, camera, minimap, procedural sprites
  ui/       HUD and panels, plain DOM
  persist/  save format
```

**`sim/` never imports from `render/` or `ui/`.** The simulation is a pure function of
state plus input, which is what makes it testable and what would make hotseat or
async multiplayer possible later without a rewrite.

Adding content is editing one data file:

- a new unit → add a creature to `src/model/units.ts`; every group size in its
  `counts` array is generated automatically
- a new advance → add an entry to `src/model/techs.ts`; the tech tree UI lays itself
  out from the prerequisite graph
- a new building → `src/model/buildings.ts`

## Art and sound

Raw art goes in `art_src/` at whatever size and format it came out of the generator.
Then:

```bash
npm run art
```

`tools/prepare_art.py` cuts out the background (a flood fill inward from the border,
so a knight's white armour survives while the transparency checkerboard does not),
trims each sprite to its content, bottom-aligns it so every unit's feet land on the
same line, scales it down and writes optimised PNGs into `public/`. The first batch
went from **48 MB of 1024² JPEGs to 200 KB**.

`public/` is generated output — treat it as build artefacts, not source.

**Group sprites are composed at runtime and need no artwork.** "Two Orcs" through
"Ten Orcs" are built by stamping the single Orc sprite N times, mirroring alternate
members so a crowd doesn't read as a row of clones. Image generators are unreliable at
drawing an exact number of matching figures; stamping one good Orc is exact, free, and
picks up any later redraw of that Orc automatically.

Anything with no art falls back to a procedural placeholder, so the game is always
playable. See [ART_PROMPTS.md](ART_PROMPTS.md) for the prompts, filenames, and what is
still missing.

All art and prompts describe original characters in a general 90s-fantasy-RTS style.
No Warcraft assets, names, characters, or logos appear anywhere in this repo.

---

## Status

Everything below is built, tested, and playable end to end. 62 tests pass
(`npm test`), including full 300-turn AI-vs-AI games, save round-trips, and a
determinism check.

Balance is measured over eighteen seeds of AI-vs-AI played to a verdict:

```bash
BALANCE_SEEDS=18 npx vitest run tests/balance.test.ts --reporter=verbose
```

The two sides now come out level: **wins 10–8**, populations 51.9 / 53.8, cities
8.2 / 8.6, with orcs ahead on advances (23.6 vs 21.5) and humans on army size
(52.3 vs 42.5) — each faction leading the column it should.

Getting there took three changes and only one of them was the cause; the diagnosis is
written up in [DESIGN_QUEUE.md](DESIGN_QUEUE.md). Briefly: the scoring formula was
genuinely flawed but fixing it changed nothing, rioting cities were growing forever
which made everything worse, and the actual culprit was a single AI timidity constant.

Around 94% of games still reach the turn limit and are decided on points rather than
conquest, which is now the largest outstanding problem.

### Art status

All 17 unit sprites, all 6 city sprites, all 8 terrain sets, sound effects and music
are in. The only art still outstanding is the **advance icons**, which are entirely
optional — a missing icon is simply removed and the tech card reads fine without it.
Prompts for all 43 are in [ART_PROMPTS.md](ART_PROMPTS.md).

`dist/` is **3.7 MB**, of which 3.0 MB is the two music tracks. `npm run art`
re-encodes audio on the way in: the source files arrive at 256 kbps stereo, which is a
studio master setting, and music at a third of full volume does not need it. Music goes
to VBR ~110 kbps stereo and sound effects to mono, taking audio from 9.0 MB to 3.4 MB
with no audible difference in play.

### Known gaps and next steps

1. **`Ten Orcs` is still rarely reached.** Eight now shows up on some seeds since
   research buildings arrived; ten remains a stretch for the AI inside 300 turns.
   A focused human player should manage it.
2. **No naval anything.** Worldgen therefore guarantees both civs start on the same
   continent. Islands on the map are decorative and unreachable.
3. **Citizens are auto-assigned to tiles.** There is no manual tile-assignment UI.
4. **No diplomacy, roads, terraforming, wonders, or governments.** Deliberate for v1;
   all fit the existing architecture.
5. **AI is a behaviour list, not a planner.** It expands, garrisons, and marches at
   the nearest known target. It does not concentrate force or defend a front.
6. **Not yet played by a human for a full game.** The AI-vs-AI harness exercises the
   rules hard, but pacing and feel need a real session.
