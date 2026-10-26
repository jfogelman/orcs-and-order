# Art prompts — Wandering Folk, Unbound, and an audit

Written to slot into `ART_PROMPTS.md` as two new faction sections,
mirroring the structure of "## The Hivekin (section 125)" exactly —
same four category headers, same house-style cross-references, same
"already covered in the faction's own bible, here's only the gap" framing.

**One correction to the request first:** the Hivekin ask (Palace,
Citizens, Promotion marks, Garrison post) is **already fully written** in
the `ART_PROMPTS.md` you attached — section 125 has all four, in full,
with the exact tier names you quoted (Packed Earth → Scoured Apron →
Tended Brood-Beds). Nothing to add there. What follows is the same
treatment for the two factions that don't have a section at all yet,
plus the audit you asked for.

---

## The Wandering Folk (new section)

Unlike the Hivekin, the Wandering Folk have **no existing section in
`ART_PROMPTS.md`** — nothing has been dropped into the pipeline yet.
Everything below is new, not a gap-fill against an existing drop. The
bible (`wandering_folk.md`) already carries prompts for the roster
(Wanderer through Drake), the advance icons, the naval units (Ferry
Contract, Corsair) and siege unit (Debt Collector), the ending's three
buildings, and all victory screens — those are written and ready
whenever art production reaches this faction. What follows is only the
four categories the bible doesn't cover, same as it wasn't covering them
for Hivekin.

### Civic Pride palace — 0 of 16

House style: **Structures seen in place**, 64×64, with the palace
bible's top-down exception for Grounds.

Tier names run on the one joke the whole faction is built from: nothing
is really theirs until it's paid off.

| Module | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Grounds | Ground, On Credit | Ground, Paid Up | Ground, Owned Outright |
| Tower | Watch, On Credit | Watch, Paid Up | Watch, Owned Outright |
| Gate | Gate, On Credit | Gate, Paid Up | Gate, Owned Outright |
| Wing | Wing, On Credit | Wing, Paid Up | Wing, Owned Outright |
| Regalia | Banner, On Credit | Banner, Paid Up | Banner, Owned Outright |

**Base chassis — The Standing Caravan.** Deliberately plain, same as
every other chassis, so modules carry the personality.

> *A loose ring of joined wagons and staked canvas tents forming a semi-permanent camp, deliberately plain and unadorned, no wing or banner emphasized, [style block]*

**Tower** — attaches to a corner.

| Tier | Prompt |
|---|---|
| 1 | *A rickety wooden lookout platform lashed together from mismatched cart parts, short wall stubs extending to either side, designed to attach to the corner of a larger building, [style block]* |
| 2 | *A sturdy timber watch-platform with a proper ladder and a small roofed perch, short wall stubs extending to either side, designed to attach to the corner of a larger building, [style block]* |
| 3 | *A tall permanent timber watchtower with a shingled roof and a hanging bell, short wall stubs extending to either side, designed to attach to the corner of a larger building, [style block]* |

**Gate** — attaches to the front.

| Tier | Prompt |
|---|---|
| 1 | *A simple rope-and-pole barrier strung between two wagons, short wall stubs extending to either side, designed to attach to the front of a larger building, [style block]* |
| 2 | *A proper timber gate set into a fenced frame with a hinged crossbar, short wall stubs extending to either side, designed to attach to the front of a larger building, [style block]* |
| 3 | *An ornamented timber gate with painted trim and a carved arch hung with many small tied trinkets, short wall stubs extending to either side, designed to attach to the front of a larger building, [style block]* |

**Wing** — attaches to a side. The "continues past the frame" language is
load-bearing, same reason it mattered for the other two sets.

| Tier | Prompt |
|---|---|
| 1 | *A patched canvas lean-to tent staked against the main camp, flat unfinished wall on the side where it joins the main building, no roof overhang on that side, roof should appear to continue past the frame rather than capping off, [style block]* |
| 2 | *A timber-framed side hall with a canvas roof and hung trade-banners inside, flat unfinished wall on the side where it joins the main building, no roof overhang on that side, roof should appear to continue past the frame rather than capping off, [style block]* |
| 3 | *A permanent timber wing with a shingled roof, carved posts, and shelves of ledgers visible through an open side, flat unfinished wall on the side where it joins the main building, no roof overhang on that side, roof should appear to continue past the frame rather than capping off, [style block]* |

**Grounds** — foreground, top-down plan view exception.

| Tier | Prompt |
|---|---|
| 1 | *A patch of bare trampled dirt scattered with borrowed crates, seen in top-down plan view, designed to sit in front of a larger building, [style block, top-down plan view instead of the isometric angle]* |
| 2 | *A packed dirt yard with neat rows of staked tents and a small cookfire, seen in top-down plan view, designed to sit in front of a larger building, [style block, top-down plan view instead of the isometric angle]* |
| 3 | *A fenced and graveled yard with permanent stalls and a well, seen in top-down plan view, designed to sit in front of a larger building, [style block, top-down plan view instead of the isometric angle]* |

**Regalia** — roofline, isolated object.

| Tier | Prompt |
|---|---|
| 1 | *A single faded mismatched cloth banner hanging from a borrowed pole, small isolated object, no building, [style block]* |
| 2 | *A pair of matching dyed cloth banners on sturdy poles, hanging side by side, small isolated object, no building, [style block]* |
| 3 | *A pair of richly embroidered banners with tasseled trim, hanging side by side, small isolated object, no building, [style block]* |

### Citizen portraits — 0 of 10

House style: **Citizens — four moods at 64**. Source files named for the
sort: `art_src/citizens/wf-wanderer citizens.<ext>`, and so on.

The joke here is that the four moods barely matter, because every frame
is still clutching a travel bundle — nobody in this faction has ever
fully unpacked, regardless of how they feel about today.

| id | Needs | Subject |
|---|---|---|
| `wf-wanderer` | — | *A weathered Wanderer's head and shoulders, layered mismatched travel clothes, a bundle strap visible at the shoulder, alert eyes* |
| `wf-outcast` | `tier-outcast` | *An Outcast-kin's head and shoulders, scarred, a single travel-pack strap crossing the chest, guarded expression* |
| `wf-slinger` | `tier-slinger` | *A Slinger-kin's head and shoulders, a simple leather sling coiled and looped at the collar, keen narrowed eyes* |
| `wf-brute` | `tier-brute` | *A one-headed Brute-kin's head and shoulders, broad features, a coil of rope slung over one shoulder, plain bearing* |
| `wf-mystic` | `signature-mystic` | *A Mystic-taught kin's head and shoulders, a small charm bundle tied at the collar, watchful distant gaze* |

**All five want a female sheet.** The "no female sheet" call for Hivekin
was specific to them — sexless insectoids where the one female-coded
unit (Princess) never shows up in a crowd. The Wandering Folk are a
human/beastkin/dwarf-ish mix with ordinary sexual dimorphism, so this
follows the human convention instead: a second sheet per sort, same
pose and mood set, saved as `art_src/citizens/female wf-<sort>
citizens.<ext>`.

| id | Needs | Subject |
|---|---|---|
| `female wf-wanderer` | — | *A weathered Wanderer woman's head and shoulders, layered mismatched travel clothes, a bundle strap visible at the shoulder, alert eyes* |
| `female wf-outcast` | `tier-outcast` | *An Outcast-kin woman's head and shoulders, scarred, a single travel-pack strap crossing the chest, guarded expression* |
| `female wf-slinger` | `tier-slinger` | *A Slinger-kin woman's head and shoulders, a simple leather sling coiled and looped at the collar, keen narrowed eyes* |
| `female wf-brute` | `tier-brute` | *A one-headed Brute-kin woman's head and shoulders, broad features, a coil of rope slung over one shoulder, plain bearing* |
| `female wf-mystic` | `signature-mystic` | *A Mystic-taught woman's head and shoulders, a small charm bundle tied at the collar, watchful distant gaze* |

That makes it 10 citizen strips for Wandering Folk, not 4 — the "0 of 4"
header earlier undercounted it, and this now adds a fifth sort on top
of that.

### Promotion marks — 0 of 3

House style: **Promotion marks — one tiny object**. Save as
`art_src/promotions/wandering-<rank>.<ext>`.

The Horde's marks happened to it, the Kingdom's were issued, the
Hivekin's grew. **The Wandering Folk's were picked up on the way** —
nobody awards anything here, you just end up still carrying it.

| id | Rank | Prompt |
|---|---|---|
| `wandering-1` | first | *A single carved trade-token threaded on a worn cord, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon* |
| `wandering-2` | second | *Two trade-tokens strung together with a tally mark scratched between them, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon* |
| `wandering-3` | third | *A tarnished signet ring threaded onto a worn cord, clearly handed down rather than made for its wearer, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon* |

**Avoid muddy browns** — the roster's whole look is mismatched earth
tones, so the badge needs a brighter contrasting accent (a dyed thread,
a bit of verdigris) to read against it, the same reason the other two
sides' rules call out green-on-orc and blue-on-human.

### Garrison post — 0 of 1

`art_src/posts/wandering.<ext>`. House style: **Map stamps**, taking the
garrison-post exception — 64×64, top-down map view, no ground under it.

The existing joke is tidiness: built quickly (Horde), built properly
(Kingdom), grown (Hivekin). **The Wandering Folk's is neither built nor
grown — it's pitched**, and it has clearly been meant to come down again
since the day it went up, except nobody's gotten around to it.

> *A patched canvas tent propped on crossed poles with a bundled bedroll leaning against one side, 64x64, plain solid magenta background (#FF00FF), seen from directly above at a slight angle in the same top-down map view as a tile of terrain, no ground or grass under it, thick dark outline, limited palette, flat shading with one light source from the upper left, mid-1990s fantasy strategy game style, no text, no logos, no border, no characters, no shadow on the ground.*

---

## The Unbound (new section)

Same situation as Wandering Folk — **no existing section**, nothing
dropped into the pipeline. The bible (`unbound.md`) carries prompts for
the roster (Effigy through Archon), six of twelve advisor portraits on
green backgrounds, the advance icons, the shared Exorcise effect, the
naval units (The Ferryman's Due, The Undertow) and siege unit (The
Cairn), the ending's three buildings, and both victory screens. What
follows is the same four gap categories.

### Civic Pride palace — 0 of 16

House style: **Structures seen in place**, 64×64, with the top-down
exception for Grounds. Tier names stay flat and declarative, the same
register as the rest of this faction's tech names (*A Place To Call Back
To*, *Something To Hold Onto*) — a fact stated, not an achievement
announced.

| Module | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Grounds | Where It Happened | Where It Happens Now | Where It Is Expected |
| Tower | Something Is Watching | Something Is Posted | Something Permanent |
| Gate | Unlocked, Technically | Attended | Warded |
| Wing | A Room, Added | A Hall, Added | A Wing That Doesn't Leave |
| Regalia | A Marker | A Pair, Matching | A Marker That Stays Lit |

**Base chassis — The Permanent Circle.** Plain, same as every other
chassis.

> *A low ring of weathered standing stones enclosing a plain stone floor, deliberately undecorated, no wing or tower emphasized, [style block]*

**Tower** — attaches to a corner.

| Tier | Prompt |
|---|---|
| 1 | *A single leaning standing stone roughly the height of a person, faint carved eye-shapes worn into its face, short wall stubs extending to either side, designed to attach to the corner of a larger building, [style block]* |
| 2 | *A taller carved stone pillar with a hollow lantern-niche cut into its top, faint blue-white glow inside the niche, short wall stubs extending to either side, designed to attach to the corner of a larger building, [style block]* |
| 3 | *A tall dark obelisk ringed with a continuous faint blue-white glow along carved grooves from base to top, short wall stubs extending to either side, designed to attach to the corner of a larger building, [style block]* |

**Gate** — attaches to the front.

| Tier | Prompt |
|---|---|
| 1 | *A plain gap in the stone ring marked only by two low unconnected posts, short wall stubs extending to either side, designed to attach to the front of a larger building, [style block]* |
| 2 | *A narrow stone archway flanked by two carved sentinel figures, faint glow along their carved eyes, short wall stubs extending to either side, designed to attach to the front of a larger building, [style block]* |
| 3 | *A heavy stone archway sealed with a faintly glowing sigil-inlaid lattice, short wall stubs extending to either side, designed to attach to the front of a larger building, [style block]* |

**Wing** — attaches to a side.

| Tier | Prompt |
|---|---|
| 1 | *A small flat-roofed stone room built onto the ring, bare and unlit, flat unfinished wall on the side where it joins the main building, no roof overhang on that side, surface should appear to continue past the frame rather than capping off, [style block]* |
| 2 | *A longer stone hall with a row of narrow glowing slit-windows, flat unfinished wall on the side where it joins the main building, no roof overhang on that side, surface should appear to continue past the frame rather than capping off, [style block]* |
| 3 | *An ornate stone wing with a vaulted roof and continuous pale blue-white glow spilling from every window, flat unfinished wall on the side where it joins the main building, no roof overhang on that side, surface should appear to continue past the frame rather than capping off, [style block]* |

**Grounds** — foreground, top-down plan view exception.

| Tier | Prompt |
|---|---|
| 1 | *A bare patch of packed earth with one faint scorched outline on the ground, seen in top-down plan view, designed to sit in front of a larger building, [style block, top-down plan view instead of the isometric angle]* |
| 2 | *A worn circular patch of ground ringed with small grave-markers, seen in top-down plan view, designed to sit in front of a larger building, [style block, top-down plan view instead of the isometric angle]* |
| 3 | *A neatly kept courtyard of raked pale gravel ringed with evenly spaced grave-markers, seen in top-down plan view, designed to sit in front of a larger building, [style block, top-down plan view instead of the isometric angle]* |

**Regalia** — roofline, isolated object.

| Tier | Prompt |
|---|---|
| 1 | *A single weathered grave-marker stone leaning slightly, faint pale glow in its carved lines, small isolated object, no building, [style block]* |
| 2 | *A pair of matching upright grave-marker stones side by side, faint pale glow in their carved lines, small isolated object, no building, [style block]* |
| 3 | *A tall carved marker stone with a continuous steady blue-white glow along its full length, small isolated object, no building, [style block]* |

The blue-white glow throughout stays safe on the standard magenta
background — it's not a magenta/violet hue, so nothing here needs the
green-background exception the way the advisor portraits and naval units
did.

### Citizen portraits — 0 of 6

House style: **Citizens — four moods at 64**. Source files:
`art_src/citizens/ub-domovoi citizens.<ext>`, and so on. **All six use
the green background (#00FF00)**, same rule as every other
translucent/glowing Unbound asset — these are the one faction where the
"four moods" joke runs on transparency rather than expression: render
each sort **more translucent the calmer it is and more solid the
angrier it gets** — barely-there for content, nearly opaque for rioting
— since getting stirred up is, for this faction, the literal first step
toward becoming physical again.

| id | Needs | Subject |
|---|---|---|
| `ub-domovoi` | — | *A small stooped Domovoi's head and shoulders, translucent pale wisping form, faint warm glow, plain household bearing* |
| `ub-revenant` | `tier-revenant` | *A Revenant citizen's head and shoulders, translucent grey pallor, unremarkable period clothing, blank patient expression* |
| `ub-sylph` | `tier-sylph` | *A Sylph citizen's head and shoulders, wispy translucent form caught mid-drift, faint cool glow along its edges* |
| `ub-naiad` | `tier-naiad` | *A Naiad citizen's head and shoulders, translucent watery sheen, faint ripple across its face* |
| `ub-yaksha` | `tier-yaksha` | *A Yaksha citizen's head and shoulders, translucent but heavier-set than the others, watchful stillness, faint blue-white glow along the jaw* |
| `ub-jinn` | `tier-jinn` | *A Jinn citizen's head and shoulders, coiling dark translucent smoke, faint cool inner glow, a knowing half-lidded expression* |

**No female sheet assumed here**, on the theory that spirits aren't
sexed bodies the way Wandering Folk's living roster is — but that's an
assumption, not a confirmed call the way it was for Hivekin (where the
in-world reason is explicit: one female-coded unit, never in a crowd).
Worth a second look if any of these four reads as gendered in the
bible's own flavor text.

### Promotion marks — 0 of 3

House style: **Promotion marks — one tiny object**. Save as
`art_src/promotions/unbound-<rank>.<ext>`.

Happened to it (Horde), issued (Kingdom), grew (Hivekin), picked up on
the way (Wandering Folk). **The Unbound's refused to let go** — each
reform brings back a little more of whatever it was carrying last time,
and the marks are that residue becoming visible.

| id | Rank | Prompt |
|---|---|---|
| `unbound-1` | first | *A single tarnished brass button, barely attached to a wisp of pale smoke, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon* |
| `unbound-2` | second | *Two tarnished keepsakes — a button and a small coin — fused together within a denser wisp of smoke, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon* |
| `unbound-3` | third | *A small solid cluster of several tarnished keepsakes fused into one opaque lump, no smoke remaining around it, pixel art, thick black outline, flat magenta background, no shadow, centred, 90s fantasy strategy game icon* |

The wisp-to-solid progression is the whole joke, and it's the same joke
as the ending — **accumulating enough to become solid again is the
faction's entire plot**, so the rank-3 mark is, quietly, a preview of
"The Arrangement Became Permanent."

**Avoid pale blue-white** on these — that's the roster's own glow colour,
and a pale badge on a pale-glowing unit disappears the same way green
vanishes on an orc. Rust and tarnished brass read against it.

### Garrison post — 0 of 1

`art_src/posts/unbound.<ext>`. House style: **Map stamps**, garrison-post
exception — 64×64, top-down map view, no ground, **no characters** (the
standing soldier is drawn separately and composited on top, same rule
as every other post).

Built quickly, built properly, grown, pitched. **The Unbound's is none
of those — it's returned to.** Nobody built this one either; something
has simply stood guard here often enough that the ground remembers.

> *A weathered stone marker post ringed by a faint pale glow worn into the ground around its base, 64x64, plain solid magenta background (#FF00FF), seen from directly above at a slight angle in the same top-down map view as a tile of terrain, no ground or grass under it, thick dark outline, limited palette, flat shading with one light source from the upper left, mid-1990s fantasy strategy game style, no text, no logos, no border, no characters, no shadow on the ground.*

---

## Audit — what exists and what's actually missing, across all five factions

| Category | Orc | Human | Hivekin | Wandering Folk | Unbound |
|---|---|---|---|---|---|
| Unit sprites | done | done | done (castes, in bible) | **prompted in bible, not dropped into this file** | **prompted in bible, not dropped into this file** |
| Naval units | prompted (`raft`/`warboat`, `barge`/`frigate`) | — | prompted in bible | prompted in bible (this session) | prompted in bible (this session) |
| Siege unit | done (`ballista`) | done (`goblincatapult`, named under orc in the doc — see note below) | prompted in bible | prompted in bible, fixed to land-only this session | prompted in bible, already land-only |
| Advisor portraits | done | done | done, 6/6 + talking cycles | **none prompted yet** | 6/6 prompted (5 green-bg, 1 magenta) |
| Advance icons | 44/44 done | (shared with orc's 44) | 13/13 done, +2 outstanding (`caste-riptide`, `caste-bloat` — **now covered above in the naval/siege work**) | prompted in bible, not audited against this file | prompted in bible, not audited against this file |
| Building icons | 20/20 **prompted** (header at line 518 says "10 of 20" but the later "ten structures" section completes the other 10 — **the header is just stale, not a real gap**) | same 20, shared table | 6/6 done + 1 outstanding (`princess-bonus`) | 6 ending buildings + 9 Folly buildings prompted in bible, not audited against this file | 6 ending buildings + 9 Folly buildings prompted in bible, not audited against this file |
| Citizen portraits | 5 sorts, done | 4 sorts (some with a female sheet), done | 4/4, this request (no female sheet — sexless insectoids) | **0/10 — written above (5 sorts × male/female)** | **0/6 — written above (no female sheet needed; spirits, not sexed bodies — worth confirming)** |
| Promotion marks | 3/3 done | 3/3 done | 3/3, this request | **0/3 — written above** | **0/3 — written above** |
| Garrison post | done | done | 1/1, this request | **0/1 — written above** | **0/1 — written above** |
| Civic Pride palace | done (The Warcamp) | done (The Grand Hall) | 16/16, this request | **0/16 — written above** | **0/16 — written above** |
| Victory screens (ordinary + ending) | done | done | 3/3 done | prompted in bible, not audited against this file | prompted in bible, not audited against this file |
| Effect animations (attack strips, projectiles) | done | done | done except Spitter's `spit` (1 needed, already prompted in the file) | **none prompted — Corsair and Debt Collector both need an attack strip and/or projectile, not yet written anywhere** | **none prompted — The Undertow and The Cairn both need one, not yet written anywhere** |
| Standing order icons | 0/3 — prompted, not yet drawn | shared | shared (these are universal, not per-faction) | shared | shared |

### What this actually means, in plain terms

1. **The Hivekin ask is a non-issue** — section 125 in your `ART_PROMPTS.md` already has all four categories, complete.
2. **Wandering Folk and Unbound are missing far more than the four categories you named.** Neither has ever been dropped into `ART_PROMPTS.md` at all — no section, no "already drawn" ledger. The four you asked about are now written above, but their **advisor portraits** (Wandering Folk has none prompted anywhere), **advance icon audit**, **building icon audit**, and **attack/effect animations for every unit including the new naval and siege ones** still need the same section-125-style treatment Hivekin got. I'd flag this rather than quietly scope it down to just the four you asked for.
3. **Orc/human building icons are not actually missing anything** — the "10 of 20" header is stale documentation, not a real gap; the later "ten structures" section already completes the set. Worth a one-line fix to that header so it stops looking like an open item.
4. **The only real undrawn-but-prompted gap on the orc/human side** is the three Standing Order icons (`coin`, `beakers`, `calm`) — prompts exist, art doesn't yet.
5. **No faction has an effect/attack-strip prompt for its naval or siege units yet** — Hivekin included. Ballista and Goblin Catapult both have attack strips in the original 19; none of the six new naval/siege units (Riptide-caste, Bloat-caste, Corsair, Debt Collector, The Undertow, The Cairn) have one written anywhere, including in my own faction docs from earlier this week. That's probably the next real gap to close once the four-category work above is done.
