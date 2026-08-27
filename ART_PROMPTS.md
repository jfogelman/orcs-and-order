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

> `art_src/` is the raw material. It is not shipped, and it is not in the
> repository either — it lives only on the machine the art was made on, since it
> is heavy and none of it is what the game loads. `public/` is generated — treat it
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

## Advance icons — 42 of 44 done

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

## Building icons — 10 of 20 done

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

## Ordinary victory screens

The two endings that already exist. **Conquest**, where the other side has no cities
left, and **points**, where turn 300 passes and the game says so itself: *"declared
ahead on points, which nobody finds satisfying."* The screens should agree with that
sentence.

Same format as the alternative victories above: **full scene, wide 16:9, no magenta,
no keying, no text**. Save as `art_src/victory/<id>.<ext>`.

Four of them — two routes, two factions. **A losing screen can reuse the winner's
picture** with a different caption; being shown the other side celebrating is a
perfectly good way to lose, and it halves the work.

### `conquest-orc` — the Horde conquers everything

The joke is that winning has left them with nothing to do.

> A hilltop over a conquered landscape at dusk, broken siege engines and empty enemy
> banners below. In the foreground a dozen orcs stand about with weapons lowered,
> victorious and visibly at a loose end. One sharpens his axe while looking sideways at
> the orc next to him. Another has already turned to face his own side. Nobody is
> cheering. Mid-1990s fantasy strategy game illustration, pixel art, long orange dusk
> light, dark silhouettes, no text, no lettering, wide 16:9 composition.

The sideways glance is the picture. They have run out of enemies and are working
through the implications.

### `conquest-human` — the Kingdom conquers everything

The joke is that the moment has been scheduled.

> A parade ground with rows of footmen standing rigidly to attention under bright
> banners, and in front of them a small clerk at a lectern reading from a scroll that
> unrolls down the steps and across the ground. The knights are motionless. Two in the
> back row have visibly stopped listening. A dwarf near the front is asleep standing
> up. Mid-1990s fantasy strategy game illustration, pixel art, crisp daylight, blue and
> gold, no text, no lettering, no writing on the scroll, wide 16:9 composition.

Nothing in it should look like a celebration. It is an administrative event that
happens to follow a war.

### `points-orc` — the Horde wins on points

The joke is that nothing was settled and somebody has decided anyway.

> An enormous armoured orc warchief holding a very small certificate at arm's length,
> staring at it with total incomprehension. A nervous goblin clerk with an abacus
> stands beside him having just handed it over. Across the valley behind them an
> unbroken enemy army is still visibly encamped, banners flying, entirely unbothered.
> Mid-1990s fantasy strategy game illustration, pixel art, flat grey overcast light,
> no text, no lettering, no writing on the certificate, wide 16:9 composition.

Two things have to read: the certificate is far too small, and **the enemy is still
there**. Nobody won anything.

### `points-human` — the Kingdom wins on points

The same non-event, from the other end.

> A long committee table indoors, humans and dwarves seated with tally boards, an
> abacus and cups of tea, applauding politely and without enthusiasm. One elf is
> examining the ceiling. Through a tall window behind them, an orc encampment sits on
> the hills outside, campfires lit, plainly still there. Mid-1990s fantasy strategy
> game illustration, pixel art, warm indoor lamplight against cold daylight from the
> window, no text, no lettering, no writing on the boards, wide 16:9 composition.

The window is doing the work. Inside, the matter is closed; outside, it is not.

## Status overlays, and adjustments for the enhancements in queue 11

The enhancements queued in section 11 of DESIGN_QUEUE.md need three conditions to
be **visible on the map**: burning, frozen, confused. This matters more than it
sounds. A unit quietly losing health for three turns with nothing drawn on it does
not read as on fire, it reads as a bug -- and a player watching their own confused
knight swing at their own line will report it as one.

### The tile has no corners left

Worth knowing before commissioning anything. Every corner of a unit tile is
already spoken for: **bottom-right** is the count badge, **bottom-left** the rank
mark, **top-right** the disarmed dot, and the **top edge** carries the
out-of-supply mark. Only the top-left is free, and one free corner cannot hold
three conditions that can all apply at once.

So statuses should **not** be badges. Two workable routes, and the second is much
cheaper:

- Per-unit state sheets, the way `_hurt` works. Honest and best-looking, and it is
  **sixteen units times three conditions**. Not worth it for a first pass.
- **One tile-sized overlay per condition, composited over whatever unit is
  standing there.** Three pictures instead of forty-eight, and they work for units
  that do not exist yet.

Take the second. Save as `art_src/status/<id>.<ext>`.

| id | prompt |
|---|---|
| `burning` | A ring of orange and yellow flame licking upward, hollow in the middle, the fire only around the lower edge and sides, pixel art, thick black outline, flat magenta background, no ground, no creature, 4-frame horizontal animation strip, 90s fantasy strategy game effect |
| `frozen` | A shell of pale blue translucent ice with jagged facets and a few frost spikes at the base, hollow through the centre, pixel art, thick black outline, flat magenta background, no ground, no creature, single frame, 90s fantasy strategy game effect |
| `confused` | Three small crooked yellow stars and a spiral circling in a ring, arranged along the top of the frame, pixel art, thick black outline, flat magenta background, no ground, no creature, 4-frame horizontal animation strip, 90s fantasy strategy game effect |

Three rules that make these usable, all learned from the overlays already
processed:

- **Hollow in the middle.** These sit on top of a creature. Anything solid across
  the centre hides the unit it is telling you about, and a burning orc that cannot
  be identified as an orc is worse than no overlay.
- **Draw no creature.** Not even a hint of one. The unit is already there.
- **Burning and confused want to be strips**; the pipeline already derives frame
  count from sheet proportions, so a 4-wide strip needs no table entry. Frozen
  should be still -- that is the point of it.

### The ogre clubs are a weapon swap, not a badge

The three club variants read far better as **variant unit sheets** than as an
icon in a corner there is no room for. The pipeline already has the precedent in
`axethrower-disarmed`: name them `ogre-fiery`, `ogre-exploding`, `ogre-quake`,
each with an idle and an `_attack` sheet, and the count ladder composes itself at
runtime as usual. Six sheets, and a player can tell across the map which ogre is
which -- which is the whole reason to have three.

Prompts follow the existing ogre exactly, changing only what is in its hands: a
club wrapped in burning rag and pitch; a club with iron drums and fuses lashed to
the head; a club with a great cracked stone head veined with light.

### Adjustments to the prompts already written

**Unit tiles.** Add to the house style that the silhouette should stay **clear of
all four corners**, not just centred. Four badges now overlap the frame, and the
existing sheets were drawn before three of them existed.

**Watch the dark units under a tint.** The frozen overlay is pale and the burning
one is bright, and both sit over the sprite. The deathknight, the dragon and the
mage are drawn very dark, so a frost shell over them reads as a smudge. Any
re-roll of those three should keep the **outline hard and the interior lighter
than it currently is** -- which is worth doing anyway, since the same fault makes
them muddy at night on a forest tile.

**Promotion marks: keep them per-rank.** The existing note leaves the door open to
a per-perk badge set. This list closes it. Nine more enhancements would mean
fifteen badges, and there is nowhere on the tile to put a second one. Rank stays
in the corner; what a unit *is* -- burning, frozen, carrying a quake club -- shows
on the sprite. That split is worth holding to as more perks arrive.

### Two gaps in the above, found by checking it against the queue

**The fourth condition has no picture.** Section 11 names four things that share
the missing status field -- burning, frozen, confused, and the troll's **halted
regeneration** -- and only three got overlays. The positive state is already drawn
(`troll_regen.png`); the suppressed one is not.

It should not be a hollow overlay like the other three, and the reason is worth
recording: burning, frozen and confused can land on **any** unit, which is what
forces them to be tile-sized things drawn over an unknown creature. Halted
regeneration applies to exactly one unit type in one situation. That makes it the
right and only candidate for the **top-left corner**, the one part of the tile
nothing has claimed.

Save as `art_src/status/spent.<ext>`, drawn to the same recipe as the promotion
marks -- a small centred object on flat magenta, read at roughly 16 pixels:

> A crude dark stitch of thick twine closing a wound, two crossed sutures with the
> ends hanging loose, pixel art, thick black outline, flat magenta background, no
> shadow, centred, 90s fantasy strategy game icon

Avoid green here for the same reason the Horde's rank marks avoid it. It sits on a
troll.

**The split itself wants an effect.** A troll spending nine tenths of itself to
make another one is the most dramatic thing in the list and currently has no
moment. Standard effect format -- 4 frames, square, flat magenta:

> A rope of thick green sinew and ichor stretching and tearing apart in the middle,
> splitting into two masses that pull away from each other, drips falling, pixel
> art, thick black outline, flat magenta background, 4-frame horizontal animation
> strip, 90s fantasy strategy game effect

**The ogre clubs need no new effects.** `explosion.png` covers the exploding club,
`demolish.png` the quake club, and the fiery club is `dragonfire.png` on the swing
plus the new `burning` overlay on whatever it hit. Only the six variant unit sheets
above are actually missing.

## Re-rolls, after reviewing the first drop

What came back was mostly right. The three status rings are hollow and key
cleanly, the ogre variants are the best sheets in the project, and the four
victory screens land their jokes. These are the specific fixes.

### The decision the drop forced

Two treatments arrived for the same three conditions: **hollow rings** in
`art_src/status/`, and **solid fire and ice masses** in `art_src/unit states/`
that came in two intensity stages -- a full one and a `(mostly recovered)` one.

**Keep the rings, take the two-stage idea into them.** The stages are the more
valuable half of that drop, because how many turns a condition has left is
otherwise completely invisible and the rings cannot show it -- their four frames
are a loop, not a countdown. The solid masses measure 63--76% opaque through the
centre and would sit over the creature they are describing, which is the one
failure these overlays exist to avoid.

So each condition wants **two** pictures: the full one, already drawn, and a
guttering one for the last turn or two. Save the second as
`art_src/status/<id>-fading.<ext>`, matching the hyphen-variant convention the
pipeline already uses for `axethrower-disarmed`.

The five files in `art_src/unit states/` should move out of that folder whichever
way this goes. That processor parses creature-then-state against a list of two
known states, so `unit on fire` is rejected outright -- it is not a per-creature
sheet and does not belong there.

### `spent` — re-roll, the only outright reject

The first one is drawn on an opaque tan patch, so at the ~16 pixels this is
composited at, the silhouette is a beige square and the stitches carry no
information at all. The twine has to *be* the object.

> Two crossed sutures of thick dark twine tied in a knot, loose frayed ends
> hanging down, nothing behind them, pixel art, thick black outline, flat magenta
> background, no patch, no backing, no square, no panel, no border, no skin, no
> shadow, centred, 90s fantasy strategy game icon

### `confused` — re-roll to a ring

The stars currently run along the top edge of the frame, which is where the
out-of-supply mark sits, with the disarmed dot at top-right. Moving them into a
ring fixes the collision and makes all three conditions one family: a ring of
fire, a ring of ice, a ring of stars.

> A ring of small crooked yellow stars and pale spirals orbiting in a circle,
> hollow and empty through the middle, evenly spaced around the ring, pixel art,
> thick black outline, flat magenta background, no ground, no creature, nothing in
> the centre, 4-frame horizontal animation strip, 90s fantasy strategy game effect

### The three fading stages

All three keep the ring shape and the frame size of their full versions, so the
swap reads as the same effect dying rather than as a different picture.

| id | prompt |
|---|---|
| `burning-fading` | A broken ring of low guttering flame with dark gaps in it, more grey smoke than fire, a few dull orange embers, hollow and empty through the middle, pixel art, thick black outline, flat magenta background, no ground, no creature, nothing in the centre, 4-frame horizontal animation strip, 90s fantasy strategy game effect |
| `frozen-fading` | A cracked and half-melted ring of pale blue ice, chunks missing, meltwater dripping from the lower edge, thinner and lower than a whole ring, hollow and empty through the middle, pixel art, thick black outline, flat magenta background, no ground, no creature, nothing in the centre, single frame, 90s fantasy strategy game effect |
| `confused-fading` | A ring of two faint yellow stars and a slow washed-out spiral, most of the ring empty, dimmer and sparser than a full ring, hollow through the middle, pixel art, thick black outline, flat magenta background, no ground, no creature, nothing in the centre, 4-frame horizontal animation strip, 90s fantasy strategy game effect |

### The victory screens

One real problem, and one prop worth a decision. **An earlier draft of this
section claimed the two conquest screens were drawn in a different, smoother
style than the points pair, and that the dark slab in the foreground of
`conquest-orc` was a stray blank plaque. Both were wrong**, and checking at
native resolution rather than off a 330px contact sheet settles it: all four are
chunky pixel art with heavy outlines, and the slab is a wooden-framed slate with
a stick of chalk lying beside it. No restyle is needed and the pair should not be
re-rolled for it.

**The chalkboard.** It is drawn on purpose and appears in both conquest screens --
on the rock among the orcs, and on the steps by the clerk. The only question is
whether a slate belongs on an orc hilltop at all. It is defensible: the joke in
`conquest-orc` is that these are creatures with nothing left to do, and a
tally-board somebody has abandoned mid-count fits that better than it has any
right to. Leave it unless it grates. If it should go, ask for **a rolled hide and
a charcoal stick** in its place rather than forbidding props, since a blanket ban
on rectangular objects would also cost the scroll and the crates.

**`conquest-human` is the one genuine re-roll**, and for composition rather than
style. The victory modal is 600px wide at most, and a parade ground of forty tiny
figures turns to mush at that width -- the two who have stopped listening are the
joke, and at that size nobody can see them. **Fewer and much larger figures.**

> A clerk at a lectern on stone steps reading from a long scroll that unrolls down
> the steps, seen close, with only six or seven armoured footmen standing to
> attention around him drawn large in the foreground. Two of them have visibly
> stopped listening and one dwarf is asleep standing up. A castle wall behind, kept
> simple. Chunky pixel art, 90s fantasy strategy game illustration, heavy outlines,
> crisp daylight, blue and gold, no text, no lettering, wide 16:9 composition.

Note that the existing scroll handles lettering exactly right -- an illegible
squiggle-script that reads as writing without spelling anything. Worth keeping,
and worth asking for by name elsewhere.

**`conquest-orc`, `points-orc` and `points-human` — keep.** The only blemish in
the three is the blank banner across the top of `points-human`, which is a crop
away from gone.

### Status overlays and ogre variants: done

All seven status overlays are drawn and processed, and all three ogre club
variants now have both an idle and an attack sheet.

**burning / burning-fading** and **frozen / frozen-fading** pair exactly: the
fading version is visibly the same ring decaying, which is what makes the swap
read as one effect running down rather than as two different pictures.

**confused-fading** was re-rolled out of question marks and into the same ring of
stars as `confused`, which fixes the idiom -- the two now read as one status
wearing out rather than as two different ones. Worth recording that it is the
faintest of the six by some way. Measured as the share of the frame actually
drawn, each fading version keeps this much of its full version:

| pair | fading keeps |
|---|---|
| frozen | 88% |
| burning | 77% |
| confused | **40%** |

At 4% of the frame drawn it is the sparsest overlay in the set, and on a busy
tile it will be the hardest to spot. Usable, and a large improvement on what it
replaced -- but if anything here is ever re-rolled again this is the one, and the
note is simply to dim it less. `burning-fading` is the reference for how far to
take it.

**The ogre attack sheets** read as intended: the fiery club leaves a flame arc,
the exploding club destroys its own head on impact -- which is the self-damage in
the mechanic, drawn -- and the quake club cracks the ground outward. All three
keep the base ogre's body and pose language, so they read as the same creature
carrying something different rather than as three creatures.

Naming worth recording, since it caught the pipeline out: an attack or state
sheet for a variant is named `<creature>-<variant> attack.<ext>`, matching both
the idle sheets in `art_src/units` and the `axethrower-disarmed_attack.png` this
pipeline has always written. That form is now accepted on input as well as
produced on output.

## The tie screen

The points ending can come out level, and when it does the game currently hands
the win to whoever sorts first -- the Horde, every time -- and announces they
are "declared ahead on points", which is a lie. Measured over thirty-six games
it never actually happened, the closest being four points apart, so this is
about being correct rather than about being common. A human playing deliberately
to the limit will hit it far sooner than two AIs did.

**One picture, not two.** Conquest and points each get a scene per faction
because one side is winning them. A draw is the one ending where **both sides
have to be in the frame**, because the joke is that neither of them can claim
it. Save as `art_src/victory/draw.<ext>`, same format as the others -- full
scene, wide 16:9, no magenta, no text, no blank signage.

> Two long tables pushed end to end under a grey sky, orcs seated down one side
> and humans down the other, both sets of tally boards turned to face the middle
> where a single small clerk stands between them holding two identical scrolls
> at arm's length and looking at neither. Every figure is leaning in and none of
> them is celebrating. An orc and a knight opposite each other have both begun
> to point at the same number. Chunky pixel art, 90s fantasy strategy game
> illustration, heavy outlines, flat overcast light with no sun anywhere, no
> signs, no plaques, no banners, no boards, no blank panels, no text, no
> lettering, wide 16:9 composition.

Three things carry it: **the two identical scrolls**, the clerk refusing to look
at either side, and the fact that nobody in the picture is happy. It should read
as the moment before an argument rather than the end of one.

Worth avoiding: any hint of a handshake or a truce. Neither side has agreed to
anything. They have simply run out of turns while exactly level, which in a game
whose own text calls the points ending unsatisfying is the least satisfying
outcome available -- and therefore the right one to draw.

---

## The advances and structures added since the last pass

Twelve icons: two advances and ten buildings. All 48×48, all the **same preamble
as every other icon** — plain solid magenta background, single centred object,
thick dark outline, no text, no numerals.

### Two advances

Both sit off Insanity at the far end of the tree, and both are about magic
leaving something behind after the blow has landed.

| id | Advance | Icon subject |
|---|---|---|
| `pyromancy` | Setting Things Alight | a single orange flame burning steadily on top of a plain grey rock, the rock entirely unbothered and not obviously flammable |
| `cryomancy` | The Cold Shoulder | a single armoured shoulder pauldron encased in pale blue ice, three icicles hanging off the bottom edge |

The Cold Shoulder is a pun and should be drawn as one — **a shoulder, frozen**,
not a generic snowflake. If the generator keeps producing snowflakes, ask for
"a suit-of-armour shoulder piece, sculpted in ice" and drop the word cold
entirely.

### Ten structures

These are **tier-two upgrades of icons that already exist**, and that is the
whole joke: each one should be immediately recognisable as its tier-one
counterpart, only *more so*. Draw the pairs together and keep the palette,
angle and framing identical between them — the gag only lands if you can see
the first icon inside the second.

| id | Faction | Upgrade of | Icon subject |
|---|---|---|---|
| `bigTotem` | orc | `totem` | the same carved totem pole with the same snarling painted face, absurdly taller, running off the top of the frame so the top is not visible |
| `cathedral` | human | `chapel` | the same white chapel with the same steep red roof, now enormous, with a rose window and two small spires |
| `bigVault` | orc | `treasury` | the same battered gold-filled chest, now with one heavy iron door bolted to the front of it, the rest of the chest still open |
| `exchange` | human | `market` | the same striped stall awning, now with a second smaller stall behind it and a ledger open on the counter |
| `biggerRock` | orc | `thinkingRock` | the same smooth grey boulder, much wider, with three worn seat-shaped dips across the top instead of one |
| `library` | human | `scriptorium` | the same stack of leather books, now a tall shelf of them, with lengths of red string running between three of the spines |
| `yellingGrounds` | orc | `barracks` | a crude wooden megaphone cone mounted on a post, mouth toward the viewer, with three thick sound rings coming out |
| `paradeGround` | human | `barracks` | a small square of flagstones with four boot prints on it arranged in a perfect square, one pennant on a pole at the corner |
| `outpost` | orc | — | a lopsided wooden lean-to with a partial roof and a sack of food leaning against it, one post visibly shorter than the others |
| `depot` | human | — | a neat wooden crate stack with a clipboard hanging on a nail beside it, three sheets of paper on the clipboard |

Notes worth having in front of you while prompting:

- **`bigVault` is the funniest one and the easiest to get wrong.** The Goblin
  Treasury's joke is that it is enormously valuable and completely unguarded;
  the upgrade's joke is that the goblins have solved this by adding *one door*
  to an otherwise open chest, and are extremely pleased about it. The door has
  to look sturdy and the chest has to still be open.
- **`biggerRock` needs the seats to read.** Three dips, clearly worn, clearly
  seat-shaped. Without them it is a rock.
- **`library` wants the string.** Cross-referencing is the entire name, and red
  string between spines says it at 48px in a way that more books does not.
- **`outpost` and `depot` are the same building twice**, and they should look
  like two different civilisations failing at the same task in opposite
  directions: the Horde's is structurally optimistic, the Kingdom's is
  administratively thorough. Neither is any use.
- **`yellingGrounds` and `paradeGround` both upgrade the same barracks**, so
  they should *not* rhyme with each other — one is noise, the other is
  geometry.

---

## Standing order icons — 0 of 3 done

A city that is not making a thing is doing one of three things instead, and the
build list shows all three alongside the units and structures. They are the only
lines with no picture, which is exactly where the eye stops.

Drop them at `art_src/orders/<id>.png`. **Same preamble as every other icon** —
48×48, plain solid magenta background, single centred object, thick dark
outline, no text, no numerals.

| id | Shown as | Icon subject |
|---|---|---|
| `coin` | Coin | a small stack of three fat gold coins, the top one standing upright on its edge and slightly too large for the stack |
| `beakers` | Study | a round glass flask of glowing blue liquid with one bubble rising, and a bent copper drinking straw resting in the neck |
| `calm` | Placate | an open palm raised in a calming gesture, with a small iced pastry balanced on the fingertips |

All three jokes are in the last clause, so **do not let the generator tidy them
away**. The coin that does not fit, the straw in the research, and the pastry
offered to the mob are the entire point; a neat stack of coins, a plain flask
and a plain raised hand are three icons nobody will look at twice.

If the straw keeps coming out as a stirring rod, ask for "a bendy drinking
straw, the kind from a milkshake". If the pastry reads as a stone, ask for
"a pink iced bun with a cherry on top".

These sit beside portraits of goblins and dragons in the same list, so keep the
outline weight and the palette in the same family — bright, but not brighter
than a dragon.

---

## The Goblin Catapult

One unit sprite, `art_src/units/goblincatapult.png`, same rules as every other
creature: **plain magenta background, full frame, no text**.

> A crude siege catapult built from lashed timber and scrap iron, its throwing
> arm cocked back, with a wide wooden hopper where the counterweight should be.
> Two small green goblins sit in the hopper looking pleased with themselves. A
> third goblin stands on the frame holding the release rope. Mid-1990s fantasy
> strategy game unit art, thick dark outline, limited palette, flat shading lit
> from the upper left, plain solid magenta background (#FF00FF), no text.

The joke has to be **in the goblins' faces**, not in the machine. They have been
told it is a promotion and they believe it. If the generator makes them look
frightened or captive the whole thing curdles into something else -- ask for
"cheerful", "eager", "proud", and if that fails, "posing for a photograph".

Keep the machine visibly worse made than the Kingdom's ballista: the ballista is
carpentry and this is enthusiasm. Lashings rather than joints, one wheel larger
than the other, at least one plank that clearly came off something else.

It shares the `engine` silhouette with the ballista, so the placeholder already
reads as artillery until the art lands. If a group version is ever wanted there
is none to draw -- it is `counts: [1]`, one machine at a time.

---

## House style for unit attack animations

The prompt below is the one these have actually been generated with, and it
works. Keep it, and read the notes under it before changing a word.

> pixel art animation, a horizontal strip of exactly 4 frames left to right
> showing the attack starting, in progress and completing, each frame square and
> the same size, plain solid magenta background (#FF00FF) behind every frame,
> mid-1990s fantasy strategy game style, bright saturated colours, thick
> readable shapes, no characters, no text, no frame borders or dividing lines,
> no background scenery.
>
> Leverage the attached `<unit name>.jpg` image as animating their attack of
> their weapon, with still showing their full figure size — only one weapon held
> the whole time.

### The parts the pipeline actually depends on

- **Horizontal, four frames, left to right.** `slice_strip` divides the keyed
  strip's own width. A vertical strip is not a strip as far as the tool is
  concerned -- which is exactly the problem section 46 of DESIGN_QUEUE runs
  into, because the advisor talking cycles came back 512x2064 rather than
  2064x512.
- **Every frame square and identical in size.** Frames are never trimmed or
  re-centred on their own content, deliberately: doing so would re-centre a
  swing on itself each frame and the weapon would appear to stand still while
  changing shape.
- **No frame borders or dividing lines.** A drawn divider becomes a column of
  real pixels down the middle of a frame once the strip is cut.
- **Full figure at the same size in every frame.** The unit is composited over
  the map at a fixed footprint; a figure that grows across the strip reads as
  the creature lurching toward the camera.
- **One weapon, held throughout.** A second weapon appearing mid-swing is the
  single most common failure, and it is not fixable in post.

### The green alternative

**Use `#00FF00` instead of magenta for anything violet or purple.** Magenta
keying eats a mage's robes, a death knight's trim and the fel glow on anything
undead. The pipeline's background removal floods inward from the border, so it
only needs the *background* to be a colour the subject does not contain — green
serves that just as well for those, and badly for anything green, which is why
neither is the default for everything.

`remove_background` reports `BACKGROUND NOT REMOVED, needs a re-roll` when it
cannot key an image cleanly. That message is the signal to switch key colour
rather than to redraw the art.

### On "no characters"

Kept verbatim because the prompt is working, but it reads oddly for art whose
subject is a character. In practice generators take it as *no lettering* and *no
extra figures*, both of which are wanted. If a generator ever returns an empty
frame, that phrase is the first thing to try replacing with "no text, no other
figures".
