# Wandering Folk — faction design and art prompts

Third faction, second of two built out so far (Hivekin first). Core
identity: orcs answer "how many," humans answer "how organized," Hivekin
answer "what grows next." Wandering Folk answer **"whoever's left
standing."** No homeland roster of their own — their strength is built
entirely from what they can talk, buy, or steal away from the two
established sides, at a real cost/risk tradeoff against simply training
their own from nothing.

## Advisors

Same six roles as the human and orc advisor sets, each reflecting the
faction's pragmatic, transactional voice — loyalty is a topic everyone
here discusses openly, which is itself the running joke across all six.

### The Reclaimer — Military
A scarred Warband veteran, patchwork armor. Discusses losses the way a
quartermaster discusses stock — everyone here was already someone else's
loss once, so a fresh one is just an ordinary cost of doing business.
*"We lost four. We'll recruit six. The math works out, eventually."*

### The Campkeeper — Domestic
A Gnome Wanderer bustling between mismatched tents. Practical to the
point of bluntness about happiness — treats contentment as a resource to
manage, not a feeling to soothe. *"They're unhappy because they miss
somewhere that isn't here. Nothing to be done about that specifically.
More stew, maybe."*

### The Broker — Diplomacy
An Elf Slinger with arms crossed, appraising. Says the terms everyone else
would only think. *"They'll ally with us for grain. Everyone allies with
us for grain. It's not complicated."*

### The Self-Taught — Arcane
The Dwarf Mystic, staff in hand. Openly admits nobody trained them for
this. *"I'm mostly guessing. It's worked so far. That's not nothing."*

### The Self-Sworn — Faith/Honor
The Half-orc Champion, hand-painted heraldry visible at the chest.
Sincere about an order of one, and entirely undefensive about how that
sounds out loud. *"Nobody else swore me in. I did it myself. That doesn't
make the oath less real."*

### The Fair Dealer — Trade
A patchwork trader with a well-used ledger. Discusses the economics of
recruiting people without any euphemism at all. *"Recruiting is cheaper.
Building from nothing is safer. Pick your risk."*

## The Caravan

A fixed terrain improvement, same category as a fort or watchtower — built
once by a worker-type unit and permanent from then on, not a mobile
structure. Its presence is the whole strategic tell: a Caravan sitting near
a contested border is a visible, attackable thing the other two factions
can see coming, the same way a watchtower or wall is. Wandering Folk
expansion is really a question of *where* to plant Caravans — near likely
battle sites, near borders where damaged enemy units are likely to pass —
rather than whether they can expand at all.

**Recruitment radius**: any enemy or neutral unit within a Caravan's
sight-line is a valid recruit target (except the four unrecruitable types,
below).

## Recruit vs. Create

Two ways onto the roster, deliberately priced apart:

- **Create** — the normal training path, available at every Caravan or
  city, costs noticeably more per tier than the equivalent unit costs
  either established faction. Slow but certain — no risk, no dependency on
  an enemy being nearby.
- **Recruit** — always cheaper than Create at the same tier, but comes with
  real risk (below). Only available when a valid target is within a
  Caravan's sight-line.

**Recruit cost scales down from a base price by:**
- **Target's missing HP** — a battered unit is cheaper to talk over than a
  fresh one.
- **Nearby friendly density** — more Wandering Folk units near the Caravan
  lowers the price, read as safety-in-numbers making defection look like
  the obvious choice rather than a desperate one.
- **Source type** — Orc Horde and Human Alliance regulars cost the base
  price; **neutral/barbarian units cost more**, not less, despite having no
  existing loyalty to break. The flavor logic: you can't offer someone
  something better than what they already have if they don't have anything
  to compare it to — there's no existing dissatisfaction to work with, so
  the whole pitch has to be built from nothing.

**Risk on every recruit attempt, both can happen, neither is mutually
exclusive with the other:**
- **Random failure chance** — gold spent, no unit gained. Modified by the
  same factors as cost (a tougher, healthier target is both pricier and
  more likely to simply refuse).
- **Provocation** — attempting a recruit within an enemy faction's own
  sight-lines counts as a hostile act against them regardless of whether
  the attempt succeeds. You're openly poaching their soldier in front of
  them; they notice either way. **Confirmed to carry both consequences
  at once** — a diplomacy hit against the poached-from faction, and a real
  retaliation risk (their nearby units may respond as if provoked), not
  just one or the other.

**No desertion.** Once a unit is recruited, it's committed — nothing about
being Wandering Folk causes a unit to spontaneously leave on its own later.
Loyalty is expensive and risky to acquire, but once bought, it's bought.

**Recruited units renormalize, they don't keep their original stats.** A
recruited unit converts to the Wandering Folk's own equivalent stat line
for that tier rather than carrying over whatever combat stats it had before
switching sides — keeps balance sane (no recruiting a veteran into
something wildly stronger than Create would ever produce, and no
recruiting a nearly-dead unit into something absurdly weak either). This
has a nice side effect worth calling out explicitly rather than assuming
silently: **since every recruit renormalizes to the same target stat line
regardless of source, Wandering Folk don't need two parallel rosters
mirroring both Orc and Human tiers separately** — one unified tier list
covering "cheap trooper," "line trooper," "heavy," "ranged," etc. can serve
as the conversion target no matter which faction the recruit came from.
Visual variety (the unit "changes appearance to the equivalent nomadic
type," per your original brief) stays intact as a cosmetic skin on top of
that shared stat line, rather than needing separate balancing work per
source faction.

## The roster

Six generic tiers (Create anywhere, Recruit when a matching target is
nearby), plus four signature units that are Create-only because there's
nothing to poach:

| id | Role | Race | Rough equivalent |
|---|---|---|---|
| `wanderer` | Founds Caravans, weakest | Gnome | Peon / Peasant |
| `wf-skirmisher` | Cheap, spammable | Goblin | Goblin / early Footman |
| `warband` | Standard line trooper | Human | Orc / Footman |
| `outcast` | Stronger melee | Orc | Troll / Knight |
| `wf-brute` | Heavy melee | Ogre | Ogre |

> ⚠️ **`skirmisher` and `brute` were both taken**, which is why the ids above
> carry the `wf-` prefix. Section 141's art drop collided with the wilds on
> three ids at once -- these two and the Unbound's `drowned` -- and
> **overwrote shipped art**: `brute_attack.png`, `skirmisher_attack.png` and
> `drowned_hurt.png` were all destroyed, and it was noticed only because
> `brute_attack.png` appeared as *modified* in a commit that was otherwise
> entirely additions. The sources were renamed then; this document was not.
> The game uses `wf-skirmisher` and `wf-brute`.
| `slinger` | Ranged | Elf | Axethrower / Archer |
| `mystic` | Signature caster, Create-only | Dwarf | Mage |
| `champion` | Signature elite, Create-only | Half-orc | Paladin |
| `bonebound` | Signature elite, Create-only | Troll | Death Knight |
| `drake` | Signature heavy, Create-only | — (a tamed creature, not a recruit) | Dragon |

Race is now the thing doing the "grab-bag" work visually — since every
recruit renormalizes to one shared stat line per tier regardless of source
(see above), assigning each tier a specific race keeps that balance
decision intact while giving the roster real, distinct identity instead of
one generic patchwork-traveler look repeated ten times. The spread
deliberately pulls from both existing factions (Orc, Ogre, Troll from the
Horde; Human, Elf, Dwarf from the Kingdom) plus two races that belong to
neither side by birth (Gnome, Half-orc) — Drake stays a literal creature
rather than getting a race, since it was caught, not recruited from anyone.

**Why each one left**, matching the faction's dry, matter-of-fact voice:

- **Gnome** *(Wanderer)* — never had a homeland to leave in the first
  place. Neither the Horde nor the Kingdom ever claimed gnomes as their
  own, so wandering was simply the default rather than a departure.
- **Goblin** *(Skirmisher)* — left the Horde once it became clear that
  "disposable" was a permanent job description there, not a phase.
- **Human** *(Warband)* — the ordinary case. Deserted, exiled, or the
  paperwork just never got filed either way.
- **Orc** *(Outcast)* — exiled outright. The tier name and the story are
  the same word for a reason.
- **Ogre** *(Brute)* — grown with only one head, and made to feel it every
  day it stayed among ogres who had two.
- **Elf** *(Slinger)* — left once the Kingdom's committees developed
  opinions about how an elf ought to feel about things.
- **Dwarf** *(Mystic)* — abandoned proper ledger-keeping to learn a kind
  of magic no dwarven institution — and no Kingdom archmage either — would
  agree to teach.
- **Half-orc** *(Champion)* — belonged fully to neither side from birth,
  so declared an order of exactly one rather than wait for someone else to
  decide where they fit.
- **Troll** *(Bonebound)* — regenerates fast enough that whatever it's
  bound to has never quite finished leaving.
- **Drake** — not a defector at all. The one entry on this roster that
  isn't a "why they left" story, because nobody asked it to leave
  anywhere — it was simply caught.

**Dragon, Paladin, Death Knight, and Mage stay unrecruitable** — too
bonded, too trained, too specific to just walk over. Each gets its own
original unit rather than a reskin, since there's no equivalent unit to
poach in the first place:

- **Mystic** — self-taught, learned by watching rather than studying. An
  upgrade tech (same linear-upgrade shape as Burrower's, elsewhere in this
  doc set) later grants the Mystic exorcism capability — every faction
  gets exactly one exorcism-capable unit against the Unbound, and Mystic
  is Wandering Folk's. No art change needed for this upgrade; the ability
  rides on the existing portrait.
- **Champion** — a self-proclaimed knight-equivalent, sworn to nobody's
  order but their own.
- **Bonebound** — bound to some kind of spirit guide picked up somewhere
  nobody involved wants to specify.
- **Drake** — a lesser, tamed cousin of a true dragon, caught rather than
  bred.

## Flavor voice

Pragmatic and transactional, dry rather than mournful about it — loyalty
is a topic everyone here discusses openly, which is itself faintly
unsettling to the other two sides, who don't.

- *On recruiting:* "He was theirs yesterday. Today he isn't. Nobody
  involved considers this remarkable."
- *On Create cost:* "Raising one from nothing costs more than asking
  someone who already exists. This is considered common sense everywhere
  except, apparently, everywhere else."
- *On recruiting a barbarian:* "There was nothing to offer him instead of.
  This turned out to be the expensive part."
- *On the signature units:* "The drake was not purchased. The drake was
  convinced. There is a difference, and it involved considerably more
  fish."

---

## Ending: "Nowhere Left But Up"

Same register as `somebody-knocked` and `do-not-touch-that` — large,
absurd, and told completely straight, with the punchline landing on the
faction's own voice rather than the event itself.

*"The Wandering Folk have reached all corners of the globe, with everyone
joined their motley, violent-but-friendly ways. Without anywhere left,
everyone just starts moving in circles for years, until one enterprising
young beastkin points straight up."*

Ties directly back to the faction's core mechanic — "everyone joined" is
the Recruit system taken to its logical, global conclusion — and leaves
the actual next step unresolved on purpose, matching how `do-not-touch-that`
never explains what the button does either. Mechanically undefined for
now: presumably the trigger condition is something like "recruited or
converted some threshold of the map's total population," but that needs
a real definition rather than staying purely flavor, same open-question
shape as Unbound's ending.

## Follies

Three, following the same "ride on an existing tech" convention as
orc/human's Follies — split 1 civ-wide + 2 city-wide (orc and human each
have 4, split 2+2; the three new factions were asked for 3 each, so the
split doesn't halve evenly and lands 1/2 instead).

### The First Caravan — civ
*Rides on: `caravan-building` ("Somewhere To Ask From", 80)*

The original route the founders walked, before there was a name for what
they were doing. It is walked still, though never on purpose — every
Caravan since has somehow ended up sitting on part of it.

The open "Create discount vs. Recruit boost" question from the earlier
draft is resolved in favor of Recruit, since that's the half of the
faction's whole identity this building's flavor is actually about.

**Effect:** +15% chance to successfully Recruit at any Caravan,
faction-wide.

```ts
// caravan-building.buildings.push('firstCaravan')
```

### The Head Count — city
*Rides on: `tier-brute` ("The One-Headed Sort", 95)*

One head, properly counted, is worth more than outsiders expect. This has
now been formally recorded, in this settlement specifically, for the
benefit of anyone still doubting it.

**Effect:** Units trained or Recruited in this settlement start at +1
experience level.

```ts
// tier-brute.buildings.push('headCount')
```

### The Unnamed Marker — city
*Rides on: `signature-bonebound` ("A Guide, Picked Up", 130)*

Where the guide was found still isn't written down anywhere. A marker was
raised regardless, pointing at nothing in particular, which everyone
involved agrees is roughly accurate.

**Effect:** Bonebound and Drake trained or Recruited in this settlement
get +1 movement.

```ts
// signature-bonebound.buildings.push('unnamedMarker')
```

| id | Scope | Effect |
|---|---|---|
| `firstCaravan` | Civ | +15% Recruit success, faction-wide |
| `headCount` | City | Units trained/Recruited here start +1 experience |
| `unnamedMarker` | City | Bonebound/Drake trained/Recruited here get +1 movement |

**Art (building icons, same house style as this doc's other buildings):**

| id | Icon subject |
|---|---|
| `firstCaravan` | a single weathered cart wheel, half-sunk, beside a faint worn dirt track |
| `headCount` | a simple tally post notched all over, one deep fresh notch at the top |
| `unnamedMarker` | a plain unmarked standing stone, leaning slightly, at a crossroads |

---

## Naval and siege units

Two naval, one siege — same pattern as the reference units: the transport
needs only the shared Mapmaking tech; the attack ship and siege unit each
need one new tech of their own.

### The Ferry Contract — transport
| A | D | HP | M | Cost |
|---|---|---|---|---|
| 0 | 1 | 10 | 3 | 35s |

**Needs:** Mapmaking (shared)

Everyone aboard has signed something. Nobody remembers reading it closely.
The crossing happens on schedule regardless, and the paperwork is filed
somewhere on the far bank.

### Corsair — attack ship
| A | D | HP | M | Cost |
|---|---|---|---|---|
| 4 | 3 | 12 | 3 | 55s |

**Needs:** A Fee, Negotiated (`tier-corsair`)

Passage was offered. The alternative was also offered, clearly and up
front. Most parties, on reflection, choose passage.

```ts
{
  id: 'tier-corsair',
  name: 'A Fee, Negotiated',
  faction: 'wandering',
  cost: 70,
  prereqs: ['tier-warband'],
  units: ['corsair'],
  buildings: [],
  flags: [],
  flavor: 'The toll was boarding. This was explained in advance, mostly for legal reasons.',
},
```

**Art (32×32 unit sprites, naval, same house style as this doc's other units):**

| id | Sprite subject |
|---|---|
| `ferrycontract` | a broad flat-bottomed barge stacked with crates and one visible ledger on a lectern |
| `corsair` | a lean single-mast raiding ship with a boarding hook coiled at the bow |

---

## Siege unit

Land unit — does not enter water, moves and fights the same way Ballista
and Goblin Catapult do.

### Debt Collector — siege
| A | D | HP | M | Cost |
|---|---|---|---|---|
| 7 | 1 | 12 | 1 | 40s |

**Needs:** The Debt Comes Due (`tier-collector`)

×2 attacking a city — strikes from exactly 2 tiles for a few rounds, and is
not struck back — costs the whole turn.

The debt was the wall. The debt has now been collected in full, and a
receipt has been left where the gate used to be.

```ts
{
  id: 'tier-collector',
  name: 'The Debt Comes Due',
  faction: 'wandering',
  cost: 90,
  prereqs: ['tier-outcast'],
  units: ['collector'],
  buildings: [],
  flags: [],
  flavor: 'Every debt is owed to somebody. This one was finally owed to the right people.',
},
```

**Art (32×32 unit sprite, land, same house style as this doc's other units):**

| id | Sprite subject |
|---|---|
| `collector` | a heavy timber siege engine on cart wheels, counterweight bristling with tally-notches, a ledger nailed to its frame |

---

## Tech tree

First draft. Reuses the existing shared spine exactly as the orc and
human trees do — assumed here the same way it was confirmed for Hivekin,
not yet separately confirmed for this faction. What follows is only the
Wandering Folk-only fork.

```ts
{
  id: 'first-wanderers',
  name: 'Whoever Was Left',
  faction: 'wandering',
  cost: 0,
  prereqs: [],
  units: ['wanderer'],
  buildings: [],
  flags: [],
  flavor: 'There was no homeland to begin from. This turned out not to matter.',
},
{
  id: 'caravan-building',
  name: 'Somewhere To Ask From',
  faction: 'wandering',
  cost: 80,
  prereqs: ['first-wanderers', 'wall-building'],
  units: [],
  buildings: ['caravan'],
  flags: [],
  flavor: 'A fort, more or less, except the point of it is conversation.',
},
{
  id: 'tier-skirmisher',
  name: 'The First Ones Who Stayed',
  faction: 'wandering',
  cost: 20,
  prereqs: ['first-wanderers'],
  units: ['skirmisher'],
  buildings: [],
  flags: [],
  flavor: 'They were not asked to leave. They left anyway. Close enough.',
},
{
  id: 'tier-warband',
  name: 'A Proper Line',
  faction: 'wandering',
  cost: 45,
  prereqs: ['tier-skirmisher'],
  units: ['warband'],
  buildings: [],
  flags: [],
  flavor: 'Ordinary people, mostly. The paperwork was the only unusual part.',
},
{
  id: 'tier-slinger',
  name: 'Aim, Borrowed',
  faction: 'wandering',
  cost: 50,
  prereqs: ['tier-skirmisher'],
  units: ['slinger'],
  buildings: [],
  flags: [],
  flavor: 'Nobody remembers whose technique this originally was. It works regardless.',
},
{
  id: 'tier-outcast',
  name: 'Exile, Reclassified',
  faction: 'wandering',
  cost: 85,
  prereqs: ['tier-warband'],
  units: ['outcast'],
  buildings: [],
  flags: [],
  flavor: 'The word "outcast" was already accurate. It was simply adopted.',
},
{
  id: 'tier-brute',
  name: 'The One-Headed Sort',
  faction: 'wandering',
  cost: 95,
  prereqs: ['tier-outcast'],
  units: ['brute'],
  buildings: [],
  flags: [],
  flavor: 'One head was, elsewhere, considered a defect. Here it is simply a head count.',
},
{
  id: 'signature-mystic',
  name: 'Taught By Watching',
  faction: 'wandering',
  cost: 100,
  prereqs: ['tier-warband'],
  units: ['mystic'],
  buildings: [],
  flags: [],
  flavor: 'No institution agreed to teach this. It was learned regardless, from a distance.',
},
{
  id: 'mystic-exorcism',
  name: 'Sending It Back',
  faction: 'wandering',
  cost: 90,
  prereqs: ['signature-mystic'],
  units: [],
  buildings: [],
  flags: [],
  flavor: 'The next lesson, once the first one was mastered without permission.',
},
{
  id: 'signature-champion',
  name: 'An Order Of One',
  faction: 'wandering',
  cost: 125,
  prereqs: ['tier-outcast'],
  units: ['champion'],
  buildings: [],
  flags: [],
  flavor: 'Nobody else was going to found the order. This was considered sufficient reason to do it personally.',
},
{
  id: 'signature-bonebound',
  name: 'A Guide, Picked Up',
  faction: 'wandering',
  cost: 130,
  prereqs: ['tier-brute'],
  units: ['bonebound'],
  buildings: [],
  flags: [],
  flavor: 'Where it was found has not been disclosed. This is generally considered wise.',
},
{
  id: 'signature-drake',
  name: 'Caught, Not Bred',
  faction: 'wandering',
  cost: 185,
  prereqs: ['signature-bonebound'],
  units: ['drake'],
  buildings: [],
  flags: [],
  flavor: 'The drake was not purchased. The drake was convinced. There is a difference, and it involved considerably more fish.',
},
{
  id: 'nowhere-left-but-up',
  name: 'Nowhere Left But Up',
  faction: 'wandering',
  cost: 200,
  prereqs: ['caravan-building', 'signature-champion'],
  units: [],
  buildings: ['lastMap', 'standingOrder', 'circlingCaravan'],
  flags: ['ending'],
  flavor:
    'The Wandering Folk have reached all corners of the globe, with everyone ' +
    'joined their motley, violent-but-friendly ways. Without anywhere left, ' +
    'everyone just starts moving in circles for years, until one enterprising ' +
    'young beastkin points straight up.',
},
```

### Ending buildings: The Circling Caravan

Same three-building pattern as the Horde's Demonic Portal and the
Kingdom's Mysterious Object: two lesser works, buildable independently
once `nowhere-left-but-up` is researched, and the final ending building
itself, which only becomes buildable in a settlement holding either
lesser work, once both exist somewhere.

**The Last Map** — 300s · 0g/turn — *Nowhere Left But Up*

Every corner has a mark on it now. Nobody has needed to draw a new line
in some time. One of two works the Circling Caravan needs.

**The Standing Order** — 300s · 0g/turn — *Nowhere Left But Up*

A contract that never ends, because there was never a place to end it at.
Everyone still gets paid on schedule regardless. One of two works the
Circling Caravan needs.

**The Circling Caravan** — 400s · 0g/turn — *Nowhere Left But Up*

The Wandering Folk have reached everywhere there was to reach. Without
anywhere left, the whole caravan starts moving in a slow, permanent
circle instead. Only in a settlement holding the Last Map or the Standing
Order, once both stand. Hold the settlement long enough and everyone
simply agrees the circle is the destination.

| id | Cost | Prereqs | Grants |
|---|---|---|---|
| `first-wanderers` | 0 | — | Wanderer |
| `caravan-building` | 80 | first-wanderers, wall-building (shared) | Caravan |
| `tier-skirmisher` | 20 | first-wanderers | Skirmisher |
| `tier-warband` | 45 | tier-skirmisher | Warband |
| `tier-slinger` | 50 | tier-skirmisher | Slinger |
| `tier-outcast` | 85 | tier-warband | Outcast |
| `tier-brute` | 95 | tier-outcast | Brute |
| `signature-mystic` | 100 | tier-warband | Mystic |
| `mystic-exorcism` | 90 | signature-mystic | Mystic gains exorcism |
| `signature-champion` | 125 | tier-outcast | Champion |
| `signature-bonebound` | 130 | tier-brute | Bonebound |
| `signature-drake` | 185 | signature-bonebound | Drake |
| `nowhere-left-but-up` | 200 | caravan-building, signature-champion | Ending |

**Not yet covered**: the recruit mechanic's actual cost/risk formula isn't
tied to a tech here (assumed to be an inherent property of `caravan`
once built, not something that improves via further research — worth
confirming whether Wandering Folk should get their own reliability-improving
advances the way Unbound does for reform), and the placeholder Folly
("The First Caravan") isn't attached to a real advance here yet.

## Art prompts

### Advisor portraits — 48×48, full combined prompts

Each one below is a complete, standalone prompt — subject and house style
already combined into a single string, same format as the original
twelve advisors.

**The Reclaimer, Military Advisor:** A scarred human's head and shoulders in patchwork plate and leather, battered shield strap visible at one shoulder, weathered veteran expression, 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Campkeeper, Domestic Advisor:** A small gnome's head and shoulders, oversized nose and ears, patched traveler's clothing, brisk practical expression, 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Broker, Diplomacy Advisor:** An elf's head and shoulders, patched hooded cloak over fine faded traveling clothes, arms folded, appraising expression, 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Self-Taught, Arcane Advisor:** A dwarf's head and shoulders, braided beard threaded with small hand-stitched charms instead of iron rings, gnarled staff visible at the shoulder, 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Self-Sworn, Faith/Honor Advisor:** A half-orc's head and shoulders, human face with faint tusks, a hand-painted heraldic symbol visible at the collar, sincere upright bearing, 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

**The Fair Dealer, Trade Advisor:** A weathered trader's head and shoulders, patchwork collar, a small worn ledger tucked under one arm, plain unromantic expression, 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

### House style (units) — 32×32, same convention as orc/human/Hivekin units

> 32x32 pixel art game sprite, single character centred on a plain solid magenta background (#FF00FF), front-facing three-quarter view, chunky readable silhouette, thick dark outline, limited palette, flat shading with one light source from the upper left, mid-1990s fantasy real-time-strategy style, no text, no logos, no border, no letterboxing, no ground shadow, no background scenery. Keep the silhouette clear of all four corners of the frame, not just centred.

**No magenta, hot pink, or violet in the sprite itself.** Each unit should
read clearly as its assigned race first, with patchwork/salvaged gear as
the unifying second layer — mismatched armor pieces, re-dyed cloth,
charms and trophies picked up along the way — so the roster reads as
visually coherent despite being ten different kinds of person, rather than
one generic look repeated with different silhouettes.

| id | Race | Prompt subject |
|---|---|---|
| `wanderer` | Gnome | A small gnome with an oversized nose and ears, patched layered traveler's clothing far too big in places, leading a pack animal by a rope |
| `wf-skirmisher` | Goblin | A small hunched green goblin in mismatched scavenged leather armor pieces, a simple curved blade, a few charms tied to a shoulder strap |
| `warband` | Human | A sturdy human fighter in patchwork plate and leather, a battered shield bearing several painted-over old symbols, a plain sword |
| `outcast` | Orc | A green orc with filed tusks in salvaged heavier armor mixing at least two different origins of plating, a two-handed weapon |
| `wf-brute` | Ogre | A single-headed ogre, noticeably lopsided where a second head would sit on others of its kind, wrapped in furs and scavenged plate, a massive improvised weapon of bound scrap and stone |
| `slinger` | Elf | A lean elf in a patched hooded cloak over fine but faded traveling clothes, a simple recurve bow, a bandolier of mismatched arrows |
| `mystic` | Dwarf | A dwarf in layered ragged robes over a stout frame, a braided beard threaded with small hand-stitched protective charms instead of iron rings, a gnarled walking staff |
| `champion` | Half-orc | A fighter with a human face and faint tusks, mismatched but well-maintained plate pieces, a hand-painted heraldic symbol of their own design on the chest, a plain well-kept sword raised |
| `bonebound` | Troll | A tall gaunt blue-green troll draped in strings of small bone charms and beads, faint pale glow at the hands, long arms hanging loose |
| `drake` | — | A smaller, leaner cousin of a true dragon, duller scales, a simple rope-and-leather harness, wings half-folded, watchful rather than menacing |

### House style (terrain improvement) — 48×48, same convention as buildings

> 48x48 pixel art building icon on a plain solid magenta background (#FF00FF), a single structure centred and filling the frame, isometric view at a fixed 30-degree angle, camera facing the same direction in every asset, consistent horizon line, thick dark outline, limited palette, flat shading with one light source from the upper left, mid-1990s fantasy strategy game city-view style, no text, no logos, no border, no characters, no background scenery, no ground shadow.

| id | Prompt subject |
|---|---|
| `caravan` | A ring of parked wooden wagons and staked tents forming a small defensible camp, a few cookfires, banners of mismatched origin hung between posts |
| `firstCaravan` *(Folly)* | A single weathered wooden wagon wheel mounted upright on a stone plinth, faded cloth streamers of many different origins tied around its rim |
| `lastMap` *(lesser work)* | A large weathered map stretched flat on a wooden frame, small pins marking every visible corner |
| `standingOrder` *(lesser work)* | A tall wooden post layered thick with overlapping notices, the topmost sheet still fresh |
| `circlingCaravan` *(ending building)* | A ring of many mismatched wagons arranged in a tight spiral, wheel-tracks visible circling the ground around them many times over |

### City-size tiers — 48×48, same building house style

Three growth stages for the city view, matching the same initial →
respectable → populous convention used elsewhere. Unlike Hivekin's single
growing structure, a Wandering Folk city should read as visibly patchwork
from the start — a settlement built from whatever architectural styles its
population brought with them, getting denser and more visually varied
(not more uniform) as it grows, since new residents keep arriving with
their own building habits rather than the city adopting one style.

| id | Tier | Prompt subject |
|---|---|
| `wandering-tier1` | Initial | A small cluster of a few mismatched structures — one timber, one stone, one simple tent — loosely arranged around a shared central firepit |
| `wandering-tier2` | Respectable | A denser cluster of visibly mismatched buildings in at least three different architectural styles, a few mismatched banners strung between them |
| `wandering-tier3` | Populous | A sprawling patchwork settlement of many distinct building styles crowded together, banners and charms of many different origins strung throughout, a genuinely busy and varied skyline |

### Advance icons — 48×48, same convention as every other tech

> 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single centred object filling the frame, thick dark outline, limited palette, flat shading lit from the upper left, mid-1990s fantasy strategy game interface icon, no text, no letters, no numbers, no border, no background scenery.

| id | Prompt subject |
|---|---|
| `first-wanderers` | A single worn boot-print pressed into bare dirt |
| `caravan-building` | A small tied bundle of rope, wooden stakes, and canvas |
| `tier-skirmisher` | A curved blade with a small charm tied to the hilt |
| `tier-warband` | A battered round shield bearing several painted-over old symbols |
| `tier-slinger` | A strung recurve bow, drawn slightly, at rest |
| `tier-outcast` | A single broken iron chain link |
| `tier-brute` | A large improvised club head bound from scrap and stone |
| `signature-mystic` | A gnarled wooden walking staff wrapped in small hand-stitched charms |
| `mystic-exorcism` | A single protective charm glowing faintly white-gold |
| `signature-champion` | A small hand-painted heraldic banner of an invented design |
| `signature-bonebound` | A short string of small bone beads |
| `signature-drake` | A single duller, smaller dragon scale |
| `nowhere-left-but-up` | A simple compass with no directions marked, its needle pointing straight up |

### Ordinary victory screens

Same full-scene, no-keying, no-text, 1024×576 rules as the special ending
screen below — these two cover the standard domination and points wins,
same as `conquest-orc`/`conquest-human` and `points-orc`/`points-human`
already do for the original two factions. Save as
`art_src/victory/conquest-wandering.<ext>` and
`art_src/victory/points-wandering.<ext>`.

`conquest-wandering` — Wandering Folk conquers everything
The joke is that there's genuinely no one left to recruit.

A vast crowd gathered around a Caravan camp under a wide evening sky — gnomes, goblins, humans, orcs, ogres, elves, dwarves, half-orcs and trolls, all in patchwork gear, all unmistakably part of the same ragged company now. A recruiter stands at the edge of the crowd with one hand extended, turning slowly, looking for someone new to approach, and finding no one who isn't already standing among them. Discarded, empty banners of both the Horde and the Kingdom lie on the ground nearby. Mid-1990s fantasy strategy game illustration, pixel art, warm dusk light, no text, no lettering, wide 16:9 composition.

The extended, unclaimed hand is the joke. There is genuinely nobody left standing who hasn't already joined.

`points-wandering` — Wandering Folk wins on points
The joke is that nothing was settled and somebody has decided anyway.

The Fair Dealer sits at a small folding table outside the Caravan, running a finger down a worn ledger. A messenger has just handed over a small scrap of parchment declaring the tally. The Fair Dealer glances at it, shrugs, and tucks it into a coat pocket already holding several others exactly like it. Behind, both an orc encampment and a human garrison remain visible on opposite hillsides, campfires burning, entirely undisturbed. Mid-1990s fantasy strategy game illustration, pixel art, cool grey late-afternoon light, no text, no lettering, no writing on the parchment, wide 16:9 composition.

The pocket already has several identical scraps in it. This isn't the first tally, and the shrug says it won't matter more than the others did.

### Victory screen — `nowhere-left-but-up`

**This breaks every rule above, on purpose** — same as `portal` and
`object` in the base game's own art doc. Everything else in this section
is a small object on flat magenta, keyed out and stamped onto a tile.
This is a **full scene with its own background**, shown once, filling the
top of the victory modal. **No magenta, no keying, no transparency** —
draw the whole picture, edge to edge. **No text anywhere in the image** —
the caption is written in the game. Wide 16:9 (1024×576 ideal). Save as
`art_src/victory/nowhere-left-but-up.<ext>`.

The joke, matching how `portal`'s demon is bored and `object`'s pub-quiz
crowd is unbothered: **the crowd hasn't caught up to the discovery yet.**

> A vast, wildly diverse crowd — gnomes, goblins, orcs, humans, ogres, elves, dwarves, half-orcs and trolls, all in patchwork mismatched gear — standing at the edge of a windswept clifftop with visibly nowhere further to walk, milling in a loose unconscious spiral pattern worn into the grass beneath them, as if they've been circling for a very long time. Off to one side, a young beastkin figure with animal ears and a tail stands apart from the crowd, one arm raised straight up, pointing at the sky, an expression of dawning realization on their face. Nobody else in the crowd has noticed yet. Mid-1990s fantasy strategy game illustration, pixel art, late golden-hour light, windswept and faintly absurd, no text, no lettering, wide 16:9 composition.

The worn spiral track in the grass is doing as much work as the pointing
figure — it has to read as "this has been going on for years," not as a
single day's confusion.

### Shared effect: Exorcise

Not Wandering Folk-specific — this is the one visual every exorcism-capable
unit across all four factions triggers (Kingdom Paladin, Horde
Bone-Speaker, Hivekin's Warden-caste, and the upgraded Mystic above), so
it's a single shared asset rather than four separate ones. Same 4-frame
horizontal strip format as `skeleton-raise`, opposite register — purifying
rather than necromantic.

> pixel art visual effect animation, a horizontal strip of exactly 4 frames left to right showing a burst of white-gold light lancing forward from the attacker and a wispy shadow-form unraveling and dispersing into nothing by the final frame, each frame square and the same size, plain solid magenta background (#FF00FF) behind every frame, mid-1990s fantasy strategy game style, bright saturated colours, thick readable shapes, no text, no frame borders or dividing lines, no background scenery.

`id`: `exorcise`

---

## Open questions before implementation

- **Recruit cost/fail-chance formula** — the modifiers above (missing HP,
  friendly density, source type) are directional, not numeric. Wants a
  real balance pass.
- **Can a Caravan be destroyed or captured** the way a fort or watchtower
  presumably can? Assumed yes, not confirmed.
- **Does friendly density stack across multiple nearby Caravans**, or only
  count units near the specific Caravan attempting the recruit?
- **Unified roster simplification** (one shared tier list instead of
  mirroring both source factions) is proposed above as the natural
  consequence of renormalizing stats — worth confirming that's actually
  the intended scope rather than assumed.
- **Ending trigger condition** — "Nowhere Left But Up" is settled as
  flavor, but the actual threshold that fires it (some percentage of the
  map's units recruited or converted? every remaining unrecruited unit
  gone?) isn't defined yet.
