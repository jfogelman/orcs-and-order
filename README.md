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
| Move into fog | Allowed. The unit marches on and **halts the moment it sights an enemy** |
| Left-drag | Pan · **Wheel** zoom · **Arrows** pan |
| `B` | Found a city (Peons and Peasants only) |
| `P` | Orcpedia — also on the toolbar. Every unit and structure named in the Advances screen links into it, as do a city's standing structures and the `?` beside each build option |
| `F` fortify · `S` sentry · `Space` skip · `N` next idle unit · `C` centre | |
| `T` advances · `Ctrl+S` saves · `G` grid · `Enter` end turn · `Esc` deselect | |
| `M` | Mute. The **Sound** button opens music and effects volume sliders |

**Reading the map.** A blue wash marks everywhere the selected unit can reach *this
turn*; red marks what it can attack. Hovering anywhere shows the route, drawn in two
tones: **solid for the part walked this turn, faded for everything beyond it**, with a
ring at the destination and the number of turns the march will take.

Clicking a destination out of reach this turn is fine — the unit sets off and keeps
going each turn until it arrives, halting early if it sights an enemy.

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

The art itself was generated with **Google Gemini** from those prompts. The sound
effects came from Pixabay, found with the search terms in
[SOUND_NEEDED.md](SOUND_NEEDED.md).

Every audio file traces to a named Pixabay download, listed in
[CREDITS.md](CREDITS.md) with its uploader and id -- including the original
download name of each sound effect that was renamed to the event it plays on,
recovered by matching byte for byte against the originals.

The processed audio in `public/` is tracked, since it is what the game loads. The
untouched original downloads in `art_src/sfx` and `art_src/music` are not: the
game does not need them, and they are credited in full either way.

---

## Licence

Code, tooling and documentation are MIT -- see [LICENSE](LICENSE). The artwork and
audio are **not** covered by it and are not the project's to relicense; anyone
reusing the code should assume they need to bring their own. [CREDITS.md](CREDITS.md)
has the details.

---

## Status

Everything below is built, tested, and playable end to end. **798 tests pass**
(`npm test`), including full AI-vs-AI games, save round-trips, a determinism check,
and fixture saves that land the interface straight on a situation worth looking at
(`fixtures/`, loaded through Save and load).

### Balance

The authority is the sweep, not the per-commit test: `npm run sweep` plays 216
AI-vs-AI games -- two arms, two seed sets -- in about 25 minutes, and refuses to
compare arms that do not really differ. The method, and every result it has
produced, is in [DESIGN_QUEUE.md](DESIGN_QUEUE.md).

The game as it ships -- endings, follies and terraforming all on, measured
September 2026 -- comes out **Horde 57-51 over 108 games**, about as even as it has
been. Games end on purpose now: the Demonic Portal and the Mysterious Object decide
about half of them, level with each other, and barely one in twenty is still settled
on points at the turn limit.

### What is in

Two factions with their own counting-joke tech trees, singleton units that grow into
groups, promotion perks and abilities, supply lines, roads and trade routes, raiders,
garrison posts, pillaging, land specials, hand-picked city tiles, a capital that grows
a piece at a time, two ways to win by building something, twelve follies (the
game's wonders), and workers who irrigate, mine and clear the land once the roads are
laid. A council of advisors argues about all of it.

### Art status

Every unit, city, terrain set, road piece, building icon, advance icon, advisor
portrait and palace piece is in, along with sound effects and music. Prompts for all
of it, and the house style, are in [ART_PROMPTS.md](ART_PROMPTS.md). `npm run art`
cuts raw art out of its background, sizes it, and re-encodes audio on the way in.

### Known gaps and next steps

1. **No naval anything.** Worldgen therefore guarantees both civs start on the same
   continent. Islands on the map are decorative and unreachable.
2. **No diplomacy or governments.** Deliberate for now; both fit the architecture.
3. **AI is a behaviour list, not a planner.** It expands, garrisons, builds roads and
   follies, works the land, and marches at the nearest known target. It does not concentrate force
   or defend a front.
4. **Balance has not been played to a verdict.** The sweep says about even; play
   should confirm or deny it before anything is tuned.
