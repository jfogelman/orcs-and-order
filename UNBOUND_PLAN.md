# Unbound — faction design and art prompts

Third and final new faction. Core identity: orcs answer "how many," humans
"how organized," Hivekin "what grows next," Wandering Folk "whoever's left
standing." Unbound answer **"how do you fight a war you don't actually
live through the normal way?"** Ordinary defeat doesn't end an Unbound
unit — it disperses, and may or may not come back. The whole faction's
fairness rests on one promise: there is always a hard counter
(exorcism), so "hard to kill" never quietly becomes "impossible to kill."

## Advisors

Same six roles as the human and orc advisor sets. Five spirits and one
genuinely physical thing — the Effigy holds Trade specifically because
it's the only advisor on this roster with an actual body, which makes it,
by a wide margin, the most normal-sounding of the six.

### The Guardian — Military
The Yaksha, arms crossed, faint blue-white glow along a coiled weapon.
Discusses casualties as temporary administrative matters, since dispersal
isn't real death to something that's never entirely alive. *"It
dispersed. It will return, or it will not. Neither outcome requires
further discussion."*

### The Hearthkeeper — Domestic
The Domovoi, small and stooped, tending an unseen hearth. Speaks with the
patience of something that has done this job for longer than anyone
currently listening has existed. *"The hearth has been tended for longer
than anyone currently present has existed. It will continue to be."*

### The Binder — Diplomacy
The Jinn, coiled in dark smoke, arms crossed. Every sentence sounds like a
contract clause, because to this advisor, it is one. *"An arrangement is
available. The terms are simple. Reading them is, as ever, recommended."*

### The Sigilist — Arcane
A spirit examining a carved sigil-tablet, faint blue-white glow along its
lines. Discusses the mechanics of its own reform and binding with total
clinical detachment — it is, after all, discussing its own death and
undeath as a technical matter. *"The sigil determines whether we return.
We did not always have one. We remember that period poorly."*

### The Archon — Faith/Honor
The Archon itself, crown-ridge of pale light, both arms raised. Never
persuades — only states, because nothing has ever successfully argued
with it. *"It was not elected. It was, in every meaningful sense,
inevitable. The rest is administrative."*

### The Effigy — Trade
The Effigy, small and carved, entirely physical. The only advisor who
sounds like an ordinary person, because it's the only one who is, in any
conventional sense, still a thing rather than a presence. *"Goods moved.
Goods were sold. This part, at least, works the way it always has."*

## Dispersal and reform

A defeated Unbound unit (defeated by anything *other* than an
exorcism-capable attacker) disperses rather than dying outright. Whether
it comes back depends on infrastructure, not luck alone:

- **Anchor Totem** *(advanced building)* — any city with one can reform a
  dispersed unit, no other condition.
- **Retrieval Circle** *(earlier building)* — a city with one can also
  reform a dispersed unit, but only if that city currently has **zero
  units** in it.
- **Neither present anywhere on the map** — the spirit is lost for good.
  Real permanence, gated behind infrastructure instead of combat.

**Even with a valid site, reform can still fail.** A flat chance of
failure applies on top of the site-gating above — two advances reduce it:

- **Sigil-Bound** *(tier 1)* — prereq: whatever unlocks Retrieval Circle.
  Reduces base reform-failure chance by a meaningful margin.
- **The Ankh** *(tier 2)* — prereq: **both** Sigil-Bound and whatever
  unlocks Anchor Totem. A genuine two-branch requirement, same shape as
  the shared Folly needing both `pyromancy` and `cryomancy` — not just a
  longer chain, an actual fork that has to be closed from both sides.
  Reduces failure chance further, stacking with Sigil-Bound.

Exact percentages on both are a balance question for later.

## Effigy: the one exception

**Effigy**, the weakest tier, is purely physical — a bound idol, not a
proper spirit. No dispersal, no reform, no exorcism requirement at all; an
ordinary attack just ends it, same as any normal unit on any other
faction's roster. This bakes the "checkable, not broken" promise into the
roster's own power curve rather than needing a special-case combat rule:
the exorcism requirement only starts applying at the tier where a unit is
more spirit than object.

## The roster

| id | Role | Word origin | Rough equivalent |
|---|---|---|---|
| `effigy` | Weakest, purely physical, no dispersal | A bound idol | Peon / Grub |
| `domovoi` | Founds a haunted site | Household/hearth spirit | Peon / Grub |
| `revenant` | Standard line trooper | "One who returns" | Orc / Footman |
| `yaksha` | Heavy guardian melee | Guardian-of-treasure spirit | Ogre / Troll |
| `sylph` | Fast scout | Air spirit | Outrider |
| `naiad` | Terrain-conditional specialist | Water spirit | — (new mechanic, see below) |
| `jinn` | Ranged, debuff-flavored | Deceptive, binding spirit | Mage / Spitter |
| `archon` | Unique, late-game | "Ruler" | Dragon / Death Knight slot |

**Naiad's water-adjacency bonus is a genuinely new mechanic**, not a
reskin of anything on another roster — meaningfully stronger when adjacent
to water terrain, the one tier that doesn't map onto an existing template.
Not yet specified how much stronger; worth a real pass once the rest of
the roster's stats exist to compare against.

### Archon, in full

- **Gated behind its own top-of-tree advance**, same slot as
  Dragon/Death Knight/Paladin on the other rosters.
- **World-unique per faction** — only one can exist at a time; a second
  can't be built while the first lives.
- **Two different defeat paths, deliberately different weight:**
  - **Ordinary defeat** (anything except exorcism) sends it home at full
    strength, instantly — no site requirement, no failure roll. The
    standout "soft defeat" behavior that makes Archon worth building.
  - **Exorcism defeat** actually destroys it. A new one can be produced
    afterward, but at full normal production cost, same as building any
    unit from scratch — no shortcut back.

  This keeps the faction's one universal fairness promise (there's always
  a real counter) intact even for the unique unit, while still making
  Archon meaningfully different from everything else on the roster.

## Bone-Speaker (Horde, corollary unit)

Not an Unbound unit — the Horde's exorcism-capable answer, added here
since its whole reason to exist is this faction. Deliberately visually
and thematically opposite Death Knight: living, not armored-undead,
marked as doing the unpopular "send them back" job rather than the
"command them" one. Already speced (see `hivekin.md`'s Warden-caste entry
and `wandering_folk.md`'s Mystic entry for the equivalent Kingdom/Wandering
Folk answers — Paladin is the Kingdom's, needing no new unit).

**Bone-Speaker's tech entry belongs in the orc tree (`techs.ts`), not
here** — same as how Warden-caste's tech lives inside Hivekin's own tree
above and Mystic's upgrade lives inside Wandering Folk's. This doc
describes the unit; its actual `TechDef` is an *addition to the existing
Horde tree*, not part of Unbound's own tree below. Proposed shape, for
whenever that gets added to `techs.ts` directly:

```ts
{
  id: 'bone-speaker',
  name: 'The Unpopular Sort',
  faction: 'orc',
  cost: 140,
  prereqs: ['dead-messed-up'],
  units: ['bone-speaker'],
  buildings: [],
  flags: [],
  flavor:
    'Someone has to send them back. This has never been a popular job. ' +
    'It has always, nonetheless, been a job.',
},
```

## The shared Exorcise effect

Not new — already documented identically in both `hivekin.md` and
`wandering_folk.md`, since Warden-caste, the upgraded Mystic, Paladin, and
Bone-Speaker all trigger the same single asset rather than four separate
ones. Included again here for completeness since Unbound is the faction
it's actually used *against*.

> pixel art visual effect animation, a horizontal strip of exactly 4 frames left to right showing a burst of white-gold light lancing forward from the attacker and a wispy shadow-form unraveling and dispersing into nothing by the final frame, each frame square and the same size, plain solid magenta background (#FF00FF) behind every frame, mid-1990s fantasy strategy game style, bright saturated colours, thick readable shapes, no text, no frame borders or dividing lines, no background scenery.

`id`: `exorcise`

## Ending: "The Arrangement Became Permanent"

Same register as `somebody-knocked` and `do-not-touch-that` — large,
absurd, and told completely straight, with the punchline landing on the
faction's own flat confidence rather than the event itself.

*"Death is solved! The spirits embrace their new physical brethren,
inviting them to new Undead parties and enjoying a life filled with a lack
of food or drink and endless, droning conversations. They will all love
it, the Unbound knows — eventually."*

## Follies

Three, following the same "ride on an existing tech" convention as
orc/human's Follies — split 1 civ-wide + 2 city-wide (orc and human each
have 4, split 2+2; the three new factions were asked for 3 each, so the
split doesn't halve evenly and lands 1/2 instead).

### The First Binding — civ
*Rides on: `tier-revenant` ("One Who Returns", 25)*

The very first successful return, before there was a circle, a totem, or a
sigil to explain why it worked. Riding on Revenant rather than Retrieval
Circle specifically because this predates all of that — it's the proof
that reform was always possible, arriving well before anything existed to
make it reliable.

**Effect:** Reform-failure chance reduced further, faction-wide; stacks
with Sigil-Bound, Anchor Totem, and The Ankh.

```ts
// tier-revenant.buildings.push('firstBinding')
```

### The Standing Watch — city
*Rides on: `tier-yaksha` ("What Was Left To Guard", 85)*

It no longer knows what it was guarding. It has selected this settlement
instead, on its own initiative, and will not be talked out of it.

**Effect:** +2 defense for the garrison in this settlement.

```ts
// tier-yaksha.buildings.push('standingWatch')
```

### The Read Terms — city
*Rides on: `tier-jinn` ("A Binding, Offered", 90)*

The terms were read, in full, by someone. That record is kept here.
Nobody has needed to consult it since, which is either reassuring or
exactly the problem.

**Effect:** Jinn and Archon reformed or bound in this settlement cost 15%
less.

```ts
// tier-jinn.buildings.push('readTerms')
```

| id | Scope | Effect |
|---|---|---|
| `firstBinding` | Civ | Reform-failure chance reduced further, stacks with reliability chain |
| `standingWatch` | City | +2 garrison defense in this settlement |
| `readTerms` | City | Jinn/Archon cost 15% less here |

**Art (building icons, same house style as this doc's other buildings):**

| id | Icon subject |
|---|---|
| `firstBinding` | a single worn sigil carved into bare stone, no circle or totem around it |
| `standingWatch` | a weathered stone sentinel post, faint blue-white glow along one carved seam |
| `readTerms` | a small lectern holding one open ledger, pages faintly luminous |

---

## Naval and siege units

Two naval, one siege — same pattern as the reference units: the transport
needs only the shared Mapmaking tech; the attack ship and siege unit each
need one new tech of their own.

### The Ferryman's Due — transport
| A | D | HP | M | Cost |
|---|---|---|---|---|
| 0 | 1 | 10 | 3 | 30s |

**Needs:** Mapmaking (shared)

Passage across water has always required a toll. The toll here is
attention, not coin. It has been paid, by something, and the crossing
proceeds.

### The Undertow — attack ship
| A | D | HP | M | Cost |
|---|---|---|---|---|
| 5 | 2 | 12 | 3 | 55s |

**Needs:** Already Occupied (`tier-drowned`)

The water was already occupied before it had traffic. This is now
relevant to ships that weren't expecting company.

```ts
{
  id: 'tier-drowned',
  name: 'Already Occupied',
  faction: 'unbound',
  cost: 85,
  prereqs: ['tier-naiad'],
  units: ['ub-drowned'],  // not `drowned`: see the warning below
  buildings: [],
  flags: [],
  flavor: 'The water had residents before it had traffic. This was inevitable.',
},
```

**Art (32×32 unit sprites, naval):** Both translucent/spectral, so both use
the green-background (`#00FF00`) convention like the rest of this doc's
glowing units.

| id | Sprite subject | Background |
|---|---|---|
| `ferrymansdue` | a low flat spectral barge, faint blue-white glow along its waterline, no visible crew | green (#00FF00) |
| `ub-drowned` | a waterlogged translucent hull trailing wisps, faint cold glow at the bow | green (#00FF00) |

> ⚠️ **`drowned` is taken**, and this is the second time it has come up.
> `drowned` is the Kingdom's **Drowned Sailor**, from the Sunken Legion.
> Section 141 found the collision when the art drop overwrote
> `drowned_hurt.png` -- shipped art, destroyed, and noticed only because the
> file appeared as *modified* in a commit that was otherwise all additions --
> and renamed the source files to `ub-drowned`. The id in this document was
> never updated, so a roster written straight out of it would collide again.
> **Use `ub-drowned`**, which is what the art is filed and processed under.

---

## Siege unit

Land unit — does not enter water, moves and fights the same way Ballista
and Goblin Catapult do.

### The Cairn — siege
| A | D | HP | M | Cost |
|---|---|---|---|---|
| 8 | 1 | 12 | 1 | 45s |

**Needs:** What It Guards Now (`tier-cairn`)

×2 attacking a city — strikes from exactly 2 tiles for a few rounds, and is
not struck back — costs the whole turn.

It was built to guard something, once. It has been repurposed to remove
something instead. Neither job required much explaining to it.

```ts
{
  id: 'tier-cairn',
  name: 'What It Guards Now',
  faction: 'unbound',
  cost: 95,
  prereqs: ['tier-yaksha'],
  units: ['cairn'],
  buildings: [],
  flags: ['volatile'],
  flavor: 'What it guards changed. What it does did not.',
},
```

**Art (32×32 unit sprite, land):** Inert stacked stone, no glow, so it
stays on the standard magenta — unlike its two naval neighbors above.

| id | Sprite subject | Background |
|---|---|---|
| `cairn` | a squat siege engine built from stacked, rune-etched grave-cairn stones | magenta (#FF00FF) |

---

## Tech tree

First draft. Reuses the existing shared spine exactly as the orc and
human trees do — assumed here the same way it was confirmed for Hivekin,
not yet separately confirmed for this faction. What follows is only the
Unbound-only fork, including the reform/reliability chain already
established (Retrieval Circle → Sigil-Bound, Anchor Totem, then The Ankh
needing both).

```ts
{
  id: 'first-unbound',
  name: 'It Did Not Stay Gone',
  faction: 'unbound',
  cost: 0,
  prereqs: [],
  units: ['effigy', 'domovoi'],
  buildings: [],
  flags: [],
  flavor: 'It did not stay gone. Nobody involved has fully explained why.',
},
{
  id: 'tier-revenant',
  name: 'One Who Returns',
  faction: 'unbound',
  cost: 25,
  prereqs: ['first-unbound'],
  units: ['revenant'],
  buildings: [],
  flags: [],
  flavor: 'The name was not chosen for subtlety.',
},
{
  id: 'tier-sylph',
  name: 'Hard To Pin Down',
  faction: 'unbound',
  cost: 45,
  prereqs: ['first-unbound'],
  units: ['sylph'],
  buildings: [],
  flags: [],
  flavor: 'It was asked to stay still. It declined.',
},
{
  id: 'tier-naiad',
  name: 'Wherever The Water Is',
  faction: 'unbound',
  cost: 65,
  prereqs: ['tier-revenant'],
  units: ['naiad'],
  buildings: [],
  flags: [],
  flavor: 'It has opinions about dry ground. It keeps most of them to itself.',
},
{
  id: 'tier-yaksha',
  name: 'What Was Left To Guard',
  faction: 'unbound',
  cost: 85,
  prereqs: ['tier-revenant'],
  units: ['yaksha'],
  buildings: [],
  flags: [],
  flavor: 'It was guarding something. What, specifically, is no longer relevant.',
},
{
  id: 'tier-jinn',
  name: 'A Binding, Offered',
  faction: 'unbound',
  cost: 90,
  prereqs: ['tier-revenant'],
  units: ['jinn'],
  buildings: [],
  flags: [],
  flavor: 'Every offer has terms. Reading them is, as ever, recommended.',
},
{
  id: 'retrieval-circle',
  name: 'A Place To Call Back To',
  faction: 'unbound',
  cost: 55,
  prereqs: ['first-unbound'],
  units: [],
  buildings: ['retrievalCircle'],
  flags: [],
  flavor: 'An empty room calls better than a full one. This was not expected.',
},
{
  id: 'sigil-bound',
  name: 'Sigil-Bound',
  faction: 'unbound',
  cost: 80,
  prereqs: ['retrieval-circle'],
  units: [],
  buildings: [],
  flags: [],
  flavor: 'A mark that says which way to come back. It helps more than expected.',
},
{
  id: 'anchor-totem',
  name: 'Something To Hold Onto',
  faction: 'unbound',
  cost: 130,
  prereqs: ['tier-yaksha'],
  units: [],
  buildings: ['anchorTotem'],
  flags: [],
  flavor: 'The empty-room requirement was, eventually, considered unnecessary.',
},
{
  id: 'the-ankh',
  name: 'The Ankh',
  faction: 'unbound',
  cost: 150,
  prereqs: ['sigil-bound', 'anchor-totem'],
  units: [],
  buildings: [],
  flags: [],
  flavor: 'Two separate solutions, combined. Neither was sufficient alone.',
},
{
  id: 'archon-tech',
  name: 'A Ruler, Assembled',
  faction: 'unbound',
  cost: 220,
  prereqs: ['the-ankh', 'tier-jinn'],
  units: ['archon'],
  buildings: [],
  flags: [],
  flavor: 'It was not elected. It was, in every meaningful sense, inevitable.',
},
{
  id: 'arrangement-permanent',
  name: 'The Arrangement Became Permanent',
  faction: 'unbound',
  cost: 200,
  prereqs: ['archon-tech'],
  units: [],
  buildings: ['guestList', 'standingInvitation', 'spiritParty'],
  flags: ['ending'],
  flavor:
    'Death is solved! The spirits embrace their new physical brethren, ' +
    'inviting them to new Undead parties and enjoying a life filled with a ' +
    'lack of food or drink and endless, droning conversations. They will all ' +
    'love it, the Unbound knows — eventually.',
},
```

### Ending buildings: The Spirit Party

Same three-building pattern as the Horde's Demonic Portal and the
Kingdom's Mysterious Object: two lesser works, buildable independently
once `arrangement-permanent` is researched, and the final ending building
itself, which only becomes buildable in a settlement holding either lesser
work, once both exist somewhere.

**The Guest List** — 300s · 0g/turn — *The Arrangement Became Permanent*

Every name added to it has, eventually, attended. This has not yet failed
to be true. One of two works the Spirit Party needs.

**The Standing Invitation** — 300s · 0g/turn — *The Arrangement Became
Permanent*

It was extended once, to the living generally. It has not been possible
to retract since. One of two works the Spirit Party needs.

**The Spirit Party** — 400s · 0g/turn — *The Arrangement Became Permanent*

A party thrown for every guest who has ever died, and now, gradually, for
those who haven't yet. Only in a settlement holding the Guest List or the
Standing Invitation, once both stand. Hold the settlement long enough and
eventually nobody there recalls it being optional.

| id | Cost | Prereqs | Grants |
|---|---|---|---|
| `first-unbound` | 0 | — | Effigy, Domovoi |
| `tier-revenant` | 25 | first-unbound | Revenant |
| `tier-sylph` | 45 | first-unbound | Sylph |
| `tier-naiad` | 65 | tier-revenant | Naiad |
| `tier-yaksha` | 85 | tier-revenant | Yaksha |
| `tier-jinn` | 90 | tier-revenant | Jinn |
| `retrieval-circle` | 55 | first-unbound | Retrieval Circle |
| `sigil-bound` | 80 | retrieval-circle | Reduces reform-failure chance |
| `anchor-totem` | 130 | tier-yaksha | Anchor Totem |
| `the-ankh` | 150 | sigil-bound, anchor-totem | Reduces reform-failure chance further |
| `archon-tech` | 220 | the-ankh, tier-jinn | Archon |
| `arrangement-permanent` | 200 | archon-tech | Ending |

~~Note `anchor-totem`'s prereq is a placeholder~~ — **settled, section 151.
It stays `tier-yaksha`, and the reason it was missing is this:**

> The yaksha is the *guardian-of-treasure* spirit — the one kind that stays
> where it is put, indefinitely, holding on to a thing. An Anchor Totem
> holds a spirit in place. **You learn to anchor a spirit from the one that
> already anchors itself.**

Three alternatives were weighed and put to Jeremy, who kept this one:

- **`tier-jinn`** is the most literal tie — the roster calls it a
  *"deceptive, binding spirit"*, and binding is the faction's whole
  vocabulary. Against it: `tier-jinn` is already a prereq of `archon-tech`,
  so the late tree would funnel everything through one 90-beaker advance.
- **`retrieval-circle`** has the strongest building story, since the Totem
  is plainly the better Circle. It **collapses the fork**: both branches
  would root in the same advance, making The Ankh two siblings rather than
  two kinds of knowledge.
- **`sigil-bound`** makes the reform line one straight chain, which this
  document already rules out as *"just a longer chain"*.

What the depth was protecting turns out to be the point. The Ankh wants two
branches *different in kind* — the shared Folly's pyromancy-and-cryomancy
shape — and this is what gives it one: `retrieval-circle → sigil-bound` is
the **ritual** line and `anchor-totem` hangs off the **spirit** line, so
closing the fork means having developed both your rites and your dead. The
placeholder had the right shape and the wrong tier's worth of reasoning.

**Not yet covered**: the placeholder Folly ("The First Binding") isn't
attached to a real advance here yet, and Naiad's water-adjacency bonus
still has no numeric definition even though it now has a tech slot.

---

## Art prompts

### Advisor portraits — 48×48, full combined prompts

Each one below is a complete, standalone prompt — subject and house style
already combined into a single string, same format as the original
twelve advisors. **Five of these six use a solid green background
(`#00FF00`) instead of magenta**, same rule as every other
translucent/glowing Unbound asset in this doc — each carries the pale
blue-white glow that would otherwise be keyed out along with a magenta
backdrop. Only Effigy, being genuinely physical with no glow, uses the
standard magenta background.

**The Guardian, Military Advisor:** The Yaksha's head and shoulders, translucent, faint blue-white glow along a coiled weapon visible at the shoulder, watchful expression, 48x48 pixel art icon on a plain solid green background (#00FF00), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Hearthkeeper, Domestic Advisor:** The Domovoi's head and shoulders, small stooped translucent form made of pale wisping smoke, faint warm glow cupped in view, 48x48 pixel art icon on a plain solid green background (#00FF00), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Binder, Diplomacy Advisor:** The Jinn's head and shoulders, coiling dark smoke with a faint cool inner glow, arms crossed, knowing expression, 48x48 pixel art icon on a plain solid green background (#00FF00), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Sigilist, Arcane Advisor:** A translucent spirit's head and shoulders, examining a small carved sigil-tablet held up before it, faint blue-white glow along its carved lines, 48x48 pixel art icon on a plain solid green background (#00FF00), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Archon, Faith/Honor Advisor:** The Archon's head and shoulders, an ornate crown-like ridge of pale light above the brow, commanding still expression, 48x48 pixel art icon on a plain solid green background (#00FF00), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Effigy, Trade Advisor:** A small crude carved idol's head and shoulders, simple carved features, no glow, motionless, 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

### House style (units) — 32×32, same convention as every other faction

> 32x32 pixel art game sprite, single character centred on a plain solid magenta background (#FF00FF), front-facing three-quarter view, chunky readable silhouette, thick dark outline, limited palette, flat shading with one light source from the upper left, mid-1990s fantasy real-time-strategy style, no text, no logos, no border, no letterboxing, no ground shadow, no background scenery. Keep the silhouette clear of all four corners of the frame, not just centred.

**No magenta, hot pink, or violet in the sprite itself** — same rule as
every other faction, and worth double-checking here specifically, since
"ghostly glow" is exactly the kind of detail a generator defaults toward
violet on. Keep any incorporeal glow in cool blue-white or pale cyan
instead.

| id | Prompt subject |
|---|---|
| `effigy` | A small crude carved idol bound with cord and dried herbs, no limbs or face detail beyond simple carved features, sitting motionless on a low stone base |
| `domovoi` | A small stooped humanoid shape made of pale wisping smoke, vaguely elderly in posture, tending an unseen hearth with both hands cupped around a faint warm glow |
| `revenant` | A gaunt translucent humanoid figure in tattered grave-wrappings, hollow pale blue-white eyes, reaching forward with one outstretched hand |
| `yaksha` | A broad heavily-built translucent guardian figure, arms crossed, faint blue-white glow outlining a coiled weapon held low, watchful stance |
| `sylph` | A slender wind-swept humanoid form made of swirling pale mist, limbs trailing off into vapor, caught mid-motion |
| `naiad` | A slender flowing humanoid form made of translucent rippling water, faint pale blue-white glow within, one arm extended as if reaching from a pool |
| `jinn` | A tall coiling humanoid form wreathed in dark smoke with a faint cool inner glow, arms crossed, an unsettling knowing expression |
| `archon` | A tall regal translucent figure in flowing robe-like drapery of pale light, an ornate crown-like ridge of light above the brow, both arms raised in command |
| `bone-speaker` | A weathered orc shaman in ash-pale ceremonial paint, a carved bone mask pushed up onto the forehead rather than worn, wrapped in ragged pale hides, holding a rattling bundle of bones and feathers bound to a short staff, wary and somewhat isolated expression |

### House style (buildings) — 48×48, same convention as Follies/Civic Pride

> 48x48 pixel art building icon on a plain solid magenta background (#FF00FF), a single structure centred and filling the frame, isometric view at a fixed 30-degree angle, camera facing the same direction in every asset, consistent horizon line, thick dark outline, limited palette, flat shading with one light source from the upper left, mid-1990s fantasy strategy game city-view style, no text, no logos, no border, no characters, no background scenery, no ground shadow.

| id | Prompt subject |
|---|---|
| `retrieval-circle` | A simple ring of weathered standing stones on bare ground, faint pale markings carved into each stone, no roof or walls |
| `anchor-totem` | A tall carved wooden totem bound in iron bands and pale cord, ringed by a low stone wall, faint blue-white glow radiating from carvings along its length |
| `firstBinding` *(Folly)* | A single cracked but intact standing stone, worn far smoother than any of the others nearby, a faint figure-shaped discoloration worn into its face |
| `guestList` *(lesser work)* | A tall standing ledger open to a page dense with names, faint pale glow along the ink |
| `standingInvitation` *(lesser work)* | A single scroll mounted upright on a stand, wax seal broken, faint cold glow escaping the opening |
| `spiritParty` *(ending building)* | A festive stone pavilion strung with banners, faint pale-blue glow spilling from every window and doorway, long tables visible within |

### City-size tiers — 48×48, same building house style

Three growth stages for the city view, matching the same initial →
respectable → populous convention used elsewhere. Framed differently from
Hivekin's single-structure growth, since Unbound don't build outward so
much as settle in — an ordinary place gradually becoming more theirs, mist
and pale light creeping further into what's already there rather than new
construction appearing.

| id | Tier | Prompt subject |
|---|---|
| `unbound-tier1` | Initial | A cluster of a few weathered, half-abandoned stone structures, faint wisps of pale mist pooling low around the doorways |
| `unbound-tier2` | Respectable | A denser cluster of stone structures, several visibly overtaken by pale mist and faint blue-white glow seeping from windows and cracks |
| `unbound-tier3` | Populous | A sprawling settlement of stone structures wreathed almost entirely in drifting pale mist, translucent figures faintly visible moving between them, a steady cold blue-white glow throughout |

### Advance icons — 48×48, same convention as every other tech

> 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

| id | Prompt subject |
|---|---|
| `first-unbound` | A faint wisp of pale smoke rising from a small crack in bare ground |
| `tier-revenant` | A single set of tattered grave-wrappings, unwound and drifting |
| `tier-sylph` | A swirl of pale mist caught mid-motion, no fixed shape |
| `tier-naiad` | A single droplet of rippling water suspended in mid-air |
| `tier-yaksha` | A coiled translucent weapon shape, faint blue-white glow along its edge |
| `tier-jinn` | A wisp of dark smoke coiled into a loose knot |
| `retrieval-circle` | A simple ring of small standing stones, viewed from above |
| `sigil-bound` | A single carved wooden sigil-tablet bound with pale cord, faint blue-white glow along its carved lines |
| `anchor-totem` | A short length of iron chain wrapped around a carved wooden peg |
| `the-ankh` | An ornate ankh symbol wrought in pale weathered metal, a faint blue-white glow at its looped top |
| `archon-tech` | A crown-like ridge of pale light, floating free with no head beneath it |
| `arrangement-permanent` | Two hands clasped together, one solid, one faintly translucent |

### Ordinary victory screens

Same full-scene, no-keying, no-text, 1024×576 rules as the special ending
screen below — these two cover the standard domination and points wins,
same as `conquest-orc`/`conquest-human` and `points-orc`/`points-human`
already do for the original two factions. Save as
`art_src/victory/conquest-unbound.<ext>` and
`art_src/victory/points-unbound.<ext>`.

`conquest-unbound` — Unbound conquers everything
The joke is that winning looks exactly like any other evening.

A wide, quiet landscape at dusk, low pale mist drifting across the ground and dotted with faint translucent figures going about ordinary business — one tends an invisible hearth, one stands motionless at a boundary stone, one simply watches the horizon. Nothing marks this as the site of a finished war: no banners, no ruins being admired, no gathering of any kind. In the foreground, a single living onlooker — a lost traveler, or a soldier from a defeated side — stands very still, visibly unsettled by how little has changed. Mid-1990s fantasy strategy game illustration, pixel art, pale blue-white moonlight through drifting mist, quiet and unnervingly still, no text, no lettering, wide 16:9 composition.

The living onlooker is the only thing in the scene reacting to anything. For everyone else here, conquest looks exactly like an ordinary evening.

`points-unbound` — Unbound wins on points
The joke is that even the proof of winning can't commit to staying solid.

The Archon stands before a low stone dais, where the Sigilist has just set down a carved tally-marker declaring the score. As the Archon reaches to take it, the marker's edges blur and turn faintly translucent in its grip, unraveling the same way a dispersing spirit would. Neither reacts to this. In the distance, both a Horde war-band and a Kingdom garrison remain fully encamped and undisturbed on opposite hills. Mid-1990s fantasy strategy game illustration, pixel art, pale blue-white glow against a darkening sky, no text, no lettering, no writing on the marker, wide 16:9 composition.

The marker turning translucent in the Archon's hand is the whole joke — even the proof of winning can't quite commit to staying solid.

### Victory screen — `arrangement-permanent`

**This breaks every rule above, on purpose** — same as `portal` and
`object` in the base game's own art doc. Everything else in this section
is a small object on flat magenta, keyed out and stamped onto a tile.
This is a **full scene with its own background**, shown once, filling the
top of the victory modal. **No magenta, no keying, no transparency** —
draw the whole picture, edge to edge. **No text anywhere in the image** —
the caption is written in the game. Wide 16:9 (1024×576 ideal). Save as
`art_src/victory/arrangement-permanent.<ext>`.

The joke, matching how `portal`'s demon is bored and `object`'s pub-quiz
crowd is unbothered: **this genuinely looks like a good party, and the
downside is entirely a matter of stamina.**

> A crowded festival hall lit warm gold, living humans and orcs mingling freely with translucent pale blue-white spirits at a lively party — banners strung overhead, musicians playing, most guests laughing and clearly enjoying themselves. Long feast tables are set with untouched food and full mugs, since half the guests need neither. In the foreground, one visibly exhausted living guest stands trapped in conversation with an animated, gesturing spirit — glazed eyes, a fixed polite smile, posture of someone who has been listening for several hours and sees no end in sight. Everyone else in the scene looks delighted. Mid-1990s fantasy strategy game illustration, pixel art, warm festive golden light mixed with cool spirit-glow, cheerful but faintly exhausting, no text, no lettering, wide 16:9 composition.

The untouched feast table is the detail that sells "solved," not
"celebrated" — a normal party has people eating. This one doesn't need to,
and that's the tell.

---

## Open questions before implementation

- **Naiad's water-adjacency bonus magnitude** — flagged above, not yet
  specified.
- **Reform failure-chance base rate, and how much Sigil-Bound/The Ankh
  each reduce it** — placeholder-level only.
- **Archon's own production cost** — needs to be high enough that the
  "pay to rebuild after exorcism" penalty actually stings, but that's a
  real balance pass, not a design decision to make blind.
- ~~**Ending mechanics**, not just flavor~~ — **settled, section 150.**

  The *trigger* was never actually open: the Ending buildings section above
  specifies the ordinary three-work pattern down to costs and prereqs, and
  that stands. What was open is whether the Spirit Party also **does**
  something, since the flavour promises the living join the Unbound's own
  condition and nothing would have happened.

  Four shapes were put to Jeremy — flavour only; the hold converts the
  world; the hold converts what it kills; or it converts only the
  researching side — and he chose **converts what it kills**:

  > While the Spirit Party is standing and counting down, anything that
  > dies near it comes back as Unbound.

  It is the only one of the four that is an **extension of this faction's
  own identity** rather than a new system bolted beside it: dispersal and
  reform already bring their units back, and the ending turns that on
  everybody else's. It is answerable without a new rule to learn — fight
  further off, or take the city — and it is roughly a quarter the surface
  of a map-wide conversion, which would have meant a new per-unit *and*
  per-city condition touching all five factions fifteen turns before the
  game ends.

  The trigger stays standard in every case, deliberately. An ending that
  fired off a bespoke counter would be a second victory rule nobody else
  plays by, which is the reasoning that settled the Wandering Folk's
  identical question in section 146.

  **Still to specify when the roster exists**: what each dying unit comes
  back *as*. Renormalising to an Unbound tier is the obvious answer and is
  the shape the Wandering Folk's Recruit already uses, but it cannot be
  written until there are tiers to name.
- **Folly is placeholder-only**, same caveat as Hivekin's and Wandering
  Folk's — wants a real tech-tree attachment once Unbound's advances
  actually exist.
