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

## Still to draw

Nothing. All 17 units, all 6 city sprites, all 8 terrains, the sound effects and the
music are in and rendering.

`npm run art` lists anything missing if that ever changes.

### Not needed, deliberately

- **Group sprites.** Composed at runtime. See above.
- **UI art.** The panels are CSS.
- **More terrain.** All eight exist and tile well.

---

## Advance icons — optional, 43 of them

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

### The counting ladder — do these first

These are the spine of the game, and the one place an icon can carry the joke on its
own. The trick is that each is the *previous icon plus one more*, so the row reads as
a sequence at a glance.

| id | Icon subject |
|---|---|
| `first-orc` | a single green orc head in profile, tusks prominent |
| `orc-meaning` | one orc head with a small question mark shape formed from a bent axe (no letters) |
| `orc-together` | two green orc heads side by side, touching |
| `idiots-stick-together` | three orc heads in a tight triangle |
| `next-level-stupid` | four orc heads in a square block |
| `beyond-stupid` | six orc heads crammed into the frame, edges cropped |
| `not-just-stupid` | eight orc heads as a dense mass, all facing the same way |
| `stupidity-for-all` | a solid wall of orc heads filling the whole icon, uncountable |
| `first-human` | a single human head in a steel helm, in profile |
| `brotherhood` | two identical helmed heads side by side, perfectly aligned |
| `join-army` | three helmed heads in a neat row |
| `bunches-footmen` | five helmed heads in two tidy ranks |
| `ten-heads` | ten helmed heads in a perfect drilled block |

Note the deliberate contrast: **orc groups get more crowded, human groups get more
orderly.** That difference is the whole joke between the two trees.

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
