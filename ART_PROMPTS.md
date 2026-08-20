# Art Prompts

The game ships playable with **procedurally generated placeholder sprites**. You do
not have to make any art for it to work. When you do want real art, drop a PNG into
the right folder with the right filename and it replaces the placeholder on the next
page load — no code change, no manifest to edit.

## How to add a sprite

1. Generate an image using one of the prompts below.
2. Save it — **any size, any format, background and all** — as `art_src/units/<id>.<ext>`,
   using the exact `id` from the tables. JPEG is fine. Dropping it in `public/units/`
   instead is also fine: raw files left there are adopted into `art_src/` automatically
   on the next run, since `public/` is generated output and shouldn't hold source art.
3. Run:

```bash
npm run art
```

That cuts out the background, trims the sprite, squares it up so every unit's feet
land on the same line, scales it to 96×96 and writes an optimised PNG into
`public/`. It took the first batch from 48 MB to 200 KB.

Missing files are expected and silent — anything without art falls back to a
procedural placeholder, and the game stays playable throughout.

> `art_src/` is the raw material and is not shipped. `public/` is generated — treat it
> as build output and don't hand-edit it.

## You do not need to draw groups

**"Two Orcs", "Six Orcs" and "Ten Footmen" need no artwork.** They are composed at
runtime by stamping the single-unit sprite N times, mirroring alternate members so a
crowd doesn't read as a row of clones.

This is deliberate. Image generators are unreliable at drawing an exact number of
matching figures — ask for seven orcs and you get six or nine, wearing slightly
different armour each time. Stamping one good Orc seven times is exact, consistent,
free, and instantly correct if you later redraw that Orc.

So: **draw the 17 base creatures below and nothing else.** The whole counting ladder
comes out of them. If you ever do want a hand-drawn group, dropping
`art_src/units/orc_x3.jpg` in will override the composed one for that unit only.

## Draw every creature at full frame

Do **not** try to draw a goblin small and an ogre large. Fill the frame with whatever
you are drawing; relative size is applied by the game, not by the artwork.

Each creature carries an `artScale` in `src/model/units.ts` — a Goblin is 0.70, an Orc
is 1.0, an Ogre 1.28, a Dragon 1.34 — and the renderer scales the sprite about its feet
so it stays on its owner-colour disc. That means proportions are a one-number tweak
rather than a re-roll, and it applies to real art, procedural placeholders and composed
group sprites alike.

## House style

Paste this in front of every unit prompt so the set looks like one game:

> 32x32 pixel art game sprite, single character centred on a **plain solid magenta
> background (#FF00FF)**, front-facing three-quarter view, chunky readable silhouette,
> thick dark outline, limited palette, flat shading with one light source from the
> upper left, mid-1990s fantasy real-time-strategy style, no text, no logos, no border,
> no letterboxing, no ground shadow, no background scenery.

### Ask for magenta, never a transparency checkerboard

This one detail decides whether the pipeline works.

Generators love to export a **transparency checkerboard**, and the moment that is
saved as JPEG the checkerboard stops being transparency and becomes thousands of real
grey pixels. Removing it reliably is genuinely hard: the squares come in light-on-white
*and* dark-on-grey, they carry JPEG noise, and like-coloured squares only touch
diagonally so a flood fill cannot cross them unless both shades are recognised. Four
of the first six city images could not be cut out for exactly this reason.

A flat magenta background has none of those problems. Nothing in the artwork is that
colour, so it is removed exactly, every time, in one pass. **Any solid colour that does
not appear in the art works** — magenta is just the traditional choice.

Two things the pipeline does *only* for a vividly saturated background, both of which
matter:

- It removes the colour **globally**, not just from the edges inward. That clears
  background trapped inside the sprite — the gap inside an archer's drawn bow, the
  space behind a ballista's throwing arm — which a border flood fill can never reach.
- It keys on **hue**, not on colour distance, so the fringe of half-magenta pixels
  JPEG leaves along every edge goes too. That fringe is what a plain colour match
  always leaves behind as a pink halo.

⚠️ **The one catch:** because keying is by hue and global, do not put strong
magenta, hot pink or bright violet *in* a sprite that has a magenta background — it
will be removed along with the backdrop. If you want a violet-glowing Death Knight,
give that one a solid **green** background instead (`#00FF00`); the pipeline picks the
key colour up from the border either way.

Also worth asking for explicitly: **no letterboxing**. Two of the city images came back
1408x768 with black bars, and a black bar is the worst possible thing to start a
background fill from — it seeds on black, finds the dark stone of an orc keep, and eats
the whole building.

Two things matter more than detail: **the silhouette** must be readable at 32 pixels,
and **the character must not fill the frame** — leave a couple of pixels of margin so
the coloured owner-disc the game draws underneath stays visible.

⚠️ Everything here describes **original** fantasy characters. Do not prompt for
Warcraft, Blizzard, or any named character, unit, or logo from an existing game, and
do not feed existing game art in as a reference image. The joke is ours; the art
should be too.

---

## Orc units

| id | Prompt subject |
|---|---|
| `peon` | A stooped green-skinned orc labourer in a rough brown loincloth, carrying a heavy iron pickaxe over one shoulder, tired expression, small tusks |
| `goblin` | A small wiry green goblin with an oversized head, huge pointed ears, yellow eyes, a torn red rag tunic, holding a crude short knife, grinning |
| `sapper` | A goblin in a scorched leather apron and cracked goggles, clutching a bundle of red explosive sticks to its chest, wide alarmed eyes |
| `orc` | A broad-shouldered green orc warrior in studded leather armour, lower tusks jutting up, gripping a heavy two-handed iron axe, aggressive stance |
| `axethrower` | A lean green orc in a fur half-cloak, arm drawn back mid-throw with a throwing axe raised overhead, bandolier of small axes across the chest |
| `troll` | A tall gaunt blue-green troll with long arms, a stringy mane of dark hair, prominent lower tusks, holding two crude hatchets, hunched forward |
| `ogre` | A hugely fat two-headed ogre in a torn hide kilt, tiny eyes on both heads, one enormous spiked club resting on its shoulder |
| `deathknight` | A skeletal armoured figure in a tattered black-purple hooded robe, no visible face, violet glow inside the hood, holding a bone staff |
| `dragon` | A red scaled dragon with tattered bat wings spread wide, long neck, golden horns and eyes, a faint orange glow at the throat, seen from the front |

## Human units

| id | Prompt subject |
|---|---|
| `peasant` | A plain human farmer in a brown tunic and straw hat, holding a wooden hoe, sturdy and unremarkable, slightly worried expression |
| `footman` | A human soldier in a polished steel breastplate and open helm, blue tabard, round steel shield on the left arm, spear held upright |
| `outrider` | A light scout on a slim brown horse, leather jerkin and green cloak, no armour, one hand shading their eyes as they look ahead |
| `archer` | A human archer in a green hooded jerkin and leather bracers, longbow drawn to the cheek, quiver of arrows at the hip |
| `knight` | An armoured knight on a white barded warhorse, blue plume on the helm, couched lance angled forward, gleaming plate armour |
| `ballista` | A wooden siege engine on two spoked wheels, a large horizontal crossbow mounted on top, iron fittings, a heavy bolt loaded |
| `mage` | A human wizard in deep blue robes with gold trim, long white beard, wide-brimmed pointed hat, holding a staff topped with a pale glowing stone |
| `paladin` | A holy warrior in ornate golden plate armour with a white surcoat, mounted on an armoured white horse, broadsword raised, faint warm glow |

## What exists, and what is left

Everything below is drawn, processed and wired unless this section says otherwise.

| set | count | state |
|---|---|---|
| Unit sprites | 17 | done |
| City sprites | 6 | done |
| Terrain sets | 8 | done |
| Advance icons | 42 | done |
| Building icons | 10 | done |
| Sound and music | 33 + 3 | done |
| Effect animations | 10 | done and wired |
| Attack animations | 19 | done and wired, including the axethrower's three states |
| Unit states | 19 | done and wired: hurt and nearly dead per creature, plus troll regeneration |
| Citizen portraits | 13 | done and wired, four moods each |
| Promotion marks | 6 | done and wired |
| Cities coming apart | 6 | done and wired |

**Two pieces of art exist but are not wired to anything yet**, both waiting on a
decision rather than on drawing:

- `art_src/buildings/broken catapult attack.jpg` — the Broken Catapult has no
  animation, and what should trigger it has not been settled.
- The **celebration**, **unrest** and **damaged** city overlays, which are held
  pending the extra logic wanted around them.

The only prompts still unanswered are the **city overlays** at the bottom of this
file, which are new rather than left over.

The prompt sections below are kept as a record of what was asked for, and as the
recipe to follow when any of it is re-rolled.

### Not needed, deliberately

- **Group sprites.** Composed at runtime. See above.
- **UI art.** The panels are CSS.
- **More terrain.** All eight exist and tile well.

---

## Advance icons — all 42 done

Each advance in the tech tree can carry a 48×48 icon at `art_src/tech/<id>.png`.
**Entirely optional**: a missing icon is removed from the card, and the tree reads
fine without one. So treat this as a long tail to chip away at, not a batch to sit
through.

Use a **plain magenta background** as everywhere else, then this preamble:

> 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single
> centred object filling the frame, thick dark outline, limited palette, flat shading
> lit from the upper left, mid-1990s fantasy strategy game interface icon, no text,
> no letters, no numbers, no border, no background scenery.

**No text or numerals**, emphatically — generators love to write words into icons and
they turn to mush at 48px.

### The counting ladder — already done, do not draw these

**Only three icons were ever needed here, and all three exist.** The rest of the
ladder is stamped from them.

| id | Icon subject | Status |
|---|---|---|
| `first-orc` | a single green orc head in profile, tusks prominent | done |
| `first-human` | a single human head in a steel helm, in profile | done |
| `orc-meaning` | one orc head with a question mark shape formed from a bent ear | done |

Everything below is generated by `npm run art`, by stamping one of those heads the
right number of times:

`orc-together` (2) · `idiots-stick-together` (3) · `next-level-stupid` (4) ·
`beyond-stupid` (6) · `not-just-stupid` (8) · `stupidity-for-all` (10) ·
`brotherhood` (2) · `join-army` (3) · `bunches-footmen` (5) · `ten-heads` (10)

This is the same lesson as the group unit sprites, learned twice. Asked for "three orc
heads" a generator returns two or four — the first attempt at these came back with one
head for *Let's Orc Together* and four for *Idiots Stick Together*. Stamping a single
good head three times is exactly three, every time, costs nothing, and re-derives
itself if that head is ever redrawn.

Two useful consequences: the row reads as a genuine sequence because every member is
literally the same head, and the deep end turns into an illegible green mass all by
itself — which for *And Stupidity for All* is precisely the right joke.

To add a rung, or change one, edit `COMPOSED_ICONS` in `tools/prepare_art.py`. To
override one with hand-drawn art, remove its entry from that table first — composition
deliberately wins over a file of the same name, because a drawn file is exactly what
went wrong.

### Economy and infrastructure

| id | Icon subject |
|---|---|
| `not-you-again` | a single gold coin, face-on, with a crude scratched mark |
| `hammers-of-glory` | a stone mason's hammer crossed with a quill |
| `mapmaking` | a rolled parchment map with a compass rose |
| `tree-hugging` | a single stylised tree with a protective ring around it |
| `bridge-building` | a simple stone arch bridge over blue water |
| `wall-building` | a section of grey stone battlement |
| `tower-building` | a tall round stone watchtower |
| `joy-making` | a crude carved wooden mask with a wide grin |
| `happiness` | a simple sun with soft rays |
| `insanity` | a spiral of wild red and yellow, slightly off-centre |

### Orc branches

| id | Icon subject |
|---|---|
| `goblin-smarts` | a small green goblin head with oversized ears and bright yellow eyes |
| `suicidal-goblins` | a bundle of red explosive sticks with a lit fuse |
| `underground-smarts` | a dark tunnel mouth with two yellow eyes inside |
| `to-be-an-orc` | a crude wooden training post, notched and battered |
| `axes` | a single heavy iron axe head |
| `axes-crazy` | two crossed axes with a jagged spark between them |
| `throwing-buddies` | an axe in mid-flight with a motion arc behind it |
| `my-little-friend` | a small figure standing beside a much larger silhouette |
| `dead-messed-up` | a cracked skull with faint violet glow in the eye sockets |
| `full-of-fire` | a red dragon's head breathing a gout of orange flame |

### Human branches

| id | Icon subject |
|---|---|
| `see-the-world` | a spyglass over a small horizon line |
| `archery` | a drawn longbow with a single nocked arrow |
| `pointed-ears` | a single pointed ear, seen side on, slightly suspicious |
| `arrows-glory` | three arrows fanned upward |
| `horses-sneeze` | a horse's head in profile, mid-sneeze, eyes screwed shut |
| `let-us-ride` | two stylised horse heads side by side |
| `run-you-through` | a couched lance angled across the frame |
| `rumbling-voice` | an open mouth with concentric sound rings coming out |
| `lordship` | an ornate crown with a single blue gem |

---

## Building icons — all 10 done

Shown beside each structure in the city screen, at `art_src/buildings/<id>.png`, 48×48.
Same rules as advance icons: **plain magenta background, no text**, and a missing icon
is simply left out.

Same preamble as the advance icons, then:

| id | Faction | Icon subject |
|---|---|---|
| `barracks` | both | a wooden weapon rack holding three spears and a shield |
| `granary` | both | a fat clay storage jar overflowing with golden grain |
| `walls` | human | a short run of grey stone battlement with a closed gate |
| `catapult` | orc | a crude wooden catapult listing badly to one side, one wheel square and the other missing entirely, throwing arm snapped |
| `totem` | orc | a carved wooden totem pole with a snarling painted face and feathers |
| `chapel` | human | a small white chapel with a steep red roof and one round window |
| `treasury` | orc | a battered wooden chest overflowing with gold coins, lid hanging off, entirely unguarded |
| `market` | human | a single striped market stall awning above a wooden counter with one apple on it |
| `thinkingRock` | orc | a large smooth grey boulder with a single worn seat-shaped dip on top |
| `scriptorium` | human | a stack of leather-bound books with a quill and inkpot resting on top |

The two economy pairs are where the joke lives, so lean into it: the **Goblin
Treasury** should look valuable and *completely unprotected*, and the **Simple Market**
should be conspicuously one stall selling one thing.

---

## Effect animations — all 10 done

Short bursts played over the map when something happens: a sapper going up, an arrow
landing, a wounded unit being finished off. **All of these are drawn and playing.**
The format below is what the pipeline reads, so a re-roll drops straight in.

### Format

**A horizontal strip of 4 frames**, each frame square, on a **plain solid magenta
background (#FF00FF)**. So a 4-frame effect is one image 4x as wide as it is tall — for
example 512x128 or 256x64. Save as `art_src/effects/<id>.png`.

Magenta suits these even better than it suits sprites: effects are full of glows, smoke
and soft edges, and the pipeline keys on *hue* rather than colour distance, so a
half-transparent flame edge is cut correctly instead of leaving a pink rim.

Preamble for all of them:

> pixel art visual effect animation, a horizontal strip of exactly 4 frames left to
> right showing the effect starting, growing, peaking and fading, each frame square and
> the same size, plain solid magenta background (#FF00FF) behind every frame, mid-1990s
> fantasy strategy game style, bright saturated colours, thick readable shapes, no
> characters, no text, no frame borders or dividing lines, no background scenery.

⚠️ **No magenta, hot pink or violet in the effect itself** — it will be keyed out with
the background. For anything that wants to be purple, say **solid green background
(#00FF00)** instead; the pipeline picks the key colour up off the border either way.
The Death Knight's effect below is exactly that case.

### The impacts

| id | Effect |
|---|---|
| `explosion` | an orange and yellow fireball bursting outward, thickening into black smoke, with debris flying out at the edges |
| `demolish` | grey stone blocks blowing apart in a cloud of pale dust, tumbling outward and settling |
| `clash` | two crossed white sparks at the point of impact, flaring and fading, with three short motion streaks |
| `death-touch` | **green background** — a violet skull-shaped wisp closing over its target and collapsing inward to nothing |

### The projectiles and the rest

Every ability these were drawn for now exists: ranged attack, healing, the
axethrower's throw and the dragon's breath all play their own.

| id | Effect |
|---|---|
| `heal` | a warm golden ring rising upward with soft white sparkles inside it |
| `arrow` | a single arrow streaking left to right, then a small burst where it strikes |
| `axe` | a throwing axe tumbling end over end, then a chopping impact spark |
| `magic` | a bright cyan-white orb streaking and bursting into a ring of sparks |
| `bolt` | a heavy iron ballista bolt driving in and splintering on impact |
| `dragonfire` | a cone of orange flame billowing forward and guttering out into smoke |

### If four frames is awkward

Four is a suggestion, not a constraint — the pipeline can slice any number as long as
the strip is a whole multiple of the frame height. Six or eight frames will look
smoother; two will look like a stamp. Keep every frame the same width and leave no gaps
or dividing lines between them.

---

## Terrain

Terrain art is a **tiling sheet**, not a single tile — the ones supplied hold roughly
8×8 repeats of a motif across 1024 px, which is exactly right. `npm run art` cuts each
sheet into four quadrants and downscales them into the four tile variants the renderer
picks between by position, so the map doesn't look rubber-stamped.

Drop them at `art_src/terrain/<id>.<ext>`.

Prefix with:

> Seamless tiling pixel art terrain texture, top-down map view, many repeats of the
> motif across the image, mid-1990s fantasy strategy game style, limited palette, no
> text, no border, no single focal point.

| id | Prompt subject |
|---|---|
| `grass` | Lush green grassland with small tufts and scattered lighter blades |
| `forest` | Dense dark green conifer canopy seen from above, overlapping treetops |
| `hills` | Rolling khaki-brown hills with rounded sunlit crests and shadowed hollows |
| `mountains` | Grey rocky peaks with pale snow caps and dark shadowed faces |
| `swamp` | Murky green-brown marsh with black pools of standing water and reeds |
| `desert` | Pale golden sand with soft wind-carved dune ripples |
| `water` | Bright shallow blue-green coastal water with small white wave crests |
| `deep` | Deep dark navy ocean water with faint slow swells |

---

## Sound

Sound effects keep their original filenames, so the credit and licence trail stays
readable. Drop them in `art_src/sfx/` and map them to game events in
`src/audio/audio.ts` — there is a table at the top of that file pairing each creature
with an attack noise and a death noise.

Music is looked up by role, so those three files do need fixed names:

| File | When it plays |
|---|---|
| `art_src/music/world.mp3` | The main loop, from the first click onward |
| `art_src/music/battle.mp3` | While any enemy unit is in sight, plus two turns after |
| `art_src/music/victory.mp3` | The end-of-game screen |

Tracks cross-fade over 1.4 seconds rather than cutting, and the battle theme lingers
for two turns after the last enemy is lost from sight — otherwise a scout stepping in
and out of view would flip the soundtrack back and forth every turn.

`npm run art` **re-encodes audio** on the way into `public/`, using ffmpeg if it is on
your PATH. Drop files in at whatever quality you have; the originals stay untouched in
`art_src/`.

| | Encoded as | Why |
|---|---|---|
| Music | VBR ~110 kbps, stereo | Plays at a third of volume under everything else |
| Effects | VBR ~85 kbps, **mono** | One-shot cues; stereo width buys nothing |

Both are also stripped of tags and embedded cover art, which is easy to ship by
accident. The first batch went from 9.0 MB to 3.4 MB with no audible difference.

If ffmpeg is missing the files are copied through unchanged and the game still works —
it just downloads more. Missing files are silent, not broken.

---

## What is deliberately not here

No prompts reference an existing game's characters, unit names, factions, logos, or
art. `Peon`, `Footman`, `Grunt` and `Ogre` are ordinary English words and are used as
such. If a generator returns something that looks like it came out of a specific
commercial game, throw it away and reroll — the placeholder is a perfectly good
fallback and costs nothing.

## Promotion marks

Small badges stamped in the corner of a promoted unit's tile, so a veteran army
reads as veteran at a glance without opening anything. Three ranks a side, drawn
as **objects rather than lettering** — numbers and chevrons stop being legible at
tile size, and a shape holds up where a glyph does not.

Save as `art_src/promotions/<id>.<ext>`. Each wants a **single centred object on a
flat magenta background**, no scene, no ground shadow, in the same chunky pixel
style as the units — read at roughly 16 pixels across, so silhouette is everything
and interior detail is nearly wasted.

The two sides earn the same numbers and wear them differently. The Horde's marks
are things that *happened* to it; the Kingdom's are things somebody *issued*.

| id | rank | prompt |
|---|---|---|
| `orc_1` | Horde, first | A single yellowed tusk fragment bound to a scrap of leather cord, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon |
| `orc_2` | Horde, second | Two crossed yellowed tusks lashed together with red-stained twine, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon |
| `orc_3` | Horde, third | A small crude skull trophy with a bent iron nail driven through the crown, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon |
| `human_1` | Kingdom, first | A single polished brass stud on a blue enamel disc, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon |
| `human_2` | Kingdom, second | A brass and blue enamel medal with two short ribbon tails, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon |
| `human_3` | Kingdom, third | A wax seal on a folded commission, ribbon trailing, gold and deep blue, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon |

Two notes on making these usable:

- **Keep the object well inside the frame.** These are composited at about a
  sixth of a tile, so anything touching the edge loses its outline and turns to
  mush.
- **Avoid green on the Horde marks and blue on the Kingdom's** — the badge sits
  on top of a unit of roughly that colour, and a green tusk on a green orc
  disappears. Bone-yellow and rust read against both.

If a set of **per-perk** icons is wanted later rather than per-rank, the same
rules apply and the list would follow whichever perks survive from section 7 of
DESIGN_QUEUE.md — but rank marks are the cheaper thing to try first, since three
a side covers every unit in the game.

## City overlays

Small motifs stamped over a city on the map, so its state reads without opening
the panel. You already have **celebration**, **unrest** and **damaged**; these
are the states that currently cannot be seen at all from the map, several of
which the player has to react to.

Save as `art_src/cities/city <state> overlay.<ext>`, matching the three that
exist. Same recipe as those: **one motif on flat magenta**, no scene, no ground,
no city underneath — it is composited on top of a settlement that is already
there, so anything resembling buildings will fight with it.

| state | why it matters | prompt |
|---|---|---|
| `ruined` | A sacked city grows nothing for fifteen turns and the map gives no hint | Wooden scaffolding poles lashed together over a small heap of rubble, a bucket hanging from one, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `starving` | Population is falling and nothing on the map says so | An upturned empty cooking pot with a bare gnawed bone beside it and two flies, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `besieged` | Enemies are adjacent and the city may fall next turn | Three crude spears planted in a ring point-up with a tattered dark banner between them, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `supplied` | The supply chain is invisible on the map, and it decides how the army fights | A stack of roped crates and a full sack with a small flag on top, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `capital` | Currently a shape drawn in code; art would read better | A tall standard on a pole with a heavy square banner and a gold finial, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `idle` | Pairs with auto-build: a city sitting on Coin with nothing chosen | A small hourglass on its side beside a rolled unopened scroll, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |

Three things learned from the sheets already processed:

- **Keep the motif clear of the frame edges.** These are composited at about a
  third of a tile; anything touching the edge loses its outline.
- **Avoid brown and grey.** The city sprites underneath are mostly wood, thatch
  and stone, and a brown motif on a brown settlement vanishes. The three that
  exist work because they lean on saturated colour — gold sparks, orange fire —
  or on a hard black silhouette.
- **One idea per overlay.** At the size these are drawn, a scene reads as a
  smudge. The unrest overlay works because it is a shape with one angry mark on
  it, not a picture of a riot.

If several apply at once — a besieged, starving, ruined city is entirely
possible — only one can sensibly be drawn. Worth deciding an order of
precedence when these are wired; the obvious one is whatever the player most
needs to act on, which is roughly besieged, then starving, then ruined.

## Land specials

Eight resources already exist in the rules, one per terrain, each with a name and its
own yields — and all eight currently share a single generic drawn diamond, which is
why none of them reads as anything in particular. These give each one a face.

Save as `art_src/specials/<terrain id>.<ext>`. They are stamped onto a **32px terrain
tile**, so they end up smaller than anything else in the game: **one object, no
scene, no ground**, on flat magenta. Silhouette is the whole job.

| terrain | what it is called | prompt |
|---|---|---|
| `grass` | Suspiciously Good Grass | A single fat tuft of vivid green grass with three seed heads, faintly glowing, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `forest` | Big Angry Game | A pair of heavy curved antlers, chipped and scarred, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `hills` | Shiny Rocks | Three faceted blue-white gemstones in a small cluster, catching light, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `mountains` | A Very Deep Hole | A dark round pit mouth with two timber props at its lip and no bottom visible, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `swamp` | Smells Like Money | A cracked clay jar tipped over with dull coins and green ooze spilling out, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `desert` | Bones Worth Something | A bleached horned skull half-buried, with one gold ring around a horn, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `water` | Fish, Probably | Two silver-blue fish crossed tail over tail, one with an odd extra fin, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |
| `deep` | Something Enormous | A single vast dark coil breaking a water surface, with two small bubbles, pixel art, thick black outline, flat magenta background, no ground, centred, 90s fantasy strategy game icon |

These are the smallest things in the game, and that changes what works:

- **No interior detail.** At 32px on a tile these are read as a shape and a colour.
  The gemstones work because three blobs of blue on brown hills is unmistakable; a
  detailed mine cart would be four grey pixels.
- **Contrast with the terrain each one sits on.** Blue gems on brown hills, gold on
  pale desert, green tuft on green grass is the hard one — that is why the prompt asks
  for it faintly glowing, so it separates from the field behind it.
- **Two of them sit on water**, which is bright cyan. Silver-blue fish will struggle
  there; if they vanish, a darker outline or a warmer colour is the fix rather than a
  bigger fish.

## Alternative victory screens

Two of these, one a side, for the endings in DESIGN_QUEUE section 10. Neither has a
path to it in the game yet; the art can exist first.

**These break every rule above, on purpose.** Everything else in this file is a small
object on flat magenta, keyed out and stamped onto a tile. These are **full scenes with
their own background**, shown once, filling the top of a 600px-wide modal above the
score breakdown. So: **no magenta, no keying, no transparency** — draw the whole
picture, edge to edge.

Save as `art_src/victory/<id>.<ext>`. Ask for a **wide banner, roughly 16:9** (1024×576
is ideal), since the modal is much wider than it is tall and a square would have to be
cropped to nothing.

**No text anywhere in the image.** The caption is written in the game and the
generators mangle lettering.

### `portal` — the Horde wins

The joke is that they have not noticed.

> A vast torn rift of green and black fire filling the sky, demonic silhouettes with
> long horns streaming out of it across a ruined landscape. In the foreground a crowd
> of orcs, tusks bared, arms raised in triumphant celebration, banners held high — and
> every one of them wearing an iron collar, with chains running back toward a single
> enormous demon standing calmly at the edge of the crowd holding the ends. The orcs
> are delighted. The demon is bored. Mid-1990s fantasy strategy game illustration,
> pixel art, saturated greens and oranges against a dark sky, dramatic, no text,
> no lettering, no banners with writing, wide 16:9 composition.

The chains are the whole picture — if the orcs read as merely victorious, it has not
worked. They should be celebrating *and* obviously enslaved, and the demon holding the
chains should look like he is waiting for something more interesting to happen.

### `object` — the Kingdom wins

The joke is how thoroughly ordinary the aftermath is.

> A plain grey featureless object the size of a barrel on a simple stone pedestal, one
> large round button on top, freshly pressed and still glowing faintly. Around it, in a
> sunlit hall, humans and orcs sit together at long trestle tables with mugs and paper,
> a dwarf keeping score on a slate, one orc with a hand raised to answer, a knight and
> an ogre sharing a bench and getting along. A great heap of swords, axes and shields
> lies discarded and forgotten in one corner, already gathering dust. Mid-1990s fantasy
> strategy game illustration, pixel art, warm daylight, calm and companionable, no
> text, no lettering, no writing on the slate, wide 16:9 composition.

The comedy is in the mundanity: this is a pub quiz, and the object that ended a
thousand years of war is sitting in the corner being ignored. Resist anything
triumphant — no rays of light, no kneeling, no awe. The heap of abandoned weapons is
the only hint that anything happened at all.

### If a losing screen is wanted later

The same two scenes from the other side would work — the Kingdom watching the rift open
from a distance, the Horde arriving at the trivia night and finding they quite enjoy it
— but there is no need for them until the endings themselves exist.
