# Follies — wonder-equivalent buildings

Twelve unique buildings: 4 shared, 4 orc-only, 4 human-only. **Eleven attach
to an advance you already have** — just one more building added to that
tech's `buildings` array, same as `joy-making` already granting both Totem
and Chapel. **Only one is a genuinely new advance**, because its prereq is a
real fork (needs both `pyromancy` and `cryomancy`, which are parallel
siblings under `insanity`, not a chain).

## What changed from the first pass

The first draft gave every Folly its own invented tech — 12 new advances,
each with its own cost and flavor. That's needless bloat against a tree that
already has the right shape for this: several existing advances grant more
than one building off a single research, and the tree includes real dead
ends (`tower-building`, `underground-smarts`, `full-of-fire`, etc.) that are
sitting there without much attached to them. A Folly riding along on one of
those is far cheaper to add and reads as a natural extension of what that
tech already represents, rather than a new item on the tree competing for
attention.

One real collision surfaced doing this pass: **`underground-smarts` already
grants "The Considerably Bigger Rock."** My original "Loudest Rock" idea was
close enough to be confusing next to it, so it's rehoused on `to-be-an-orc`
instead, mirrored against the Kingdom's own training tech.

## Uniqueness and scope, unchanged from the first pass

A Folly still needs a scarcity constraint nothing in `techs.ts` currently
models — `unique: 'faction'` for the 8 faction-only ones, `unique: 'world'`
for the 4 shared ones (only one instance can ever exist; both sides can
research toward it, and whoever finishes building it first gets it). This
still needs to live wherever buildings are actually defined, not in
`TechDef`.

**Shared Follies still refund production on loss** — shields already spent
convert to the losing city's general production pool the turn the race is
decided elsewhere. Still needs support wherever build queues resolve.

**City-wide vs. civ-wide still maps the same way it did before**: city
Follies are just buildings with a per-city bonus, no new mechanism. Civ-wide
Follies want the same `flags` mechanism that makes `contentment` or
`berserk` apply to the whole faction the moment the tech is researched — and
the same open question as before applies: does the civ-wide bonus activate
the instant the *host tech* is researched (consistent with how `insanity`
already grants `berserk` whether or not anyone ever builds what it also
unlocks), or only once the Folly building itself is finished? Left open.

## Building costs are separate from tech costs

None of the eleven riders below change the research cost of the tech they
attach to — that stays exactly what it already is. The Folly's own
significant cost is a **production** cost, set wherever `BuildingDef` costs
live (not shown here), same as any other building. Only the one genuinely
new tech below needs a research cost of its own.

---

## Shared Follies (world-unique, race + refund)

| Folly | Attaches to | Why it fits |
|---|---|---|
| The First Ledger | `not-you-again` (45) | Already about an unwelcome tax collector — the ledger is the thing they left behind |
| The Yelling Wall | `tower-building` (115) | Existing shared dead end; "a wall, but taller and lonelier" already sets up the joke |
| The Long Peace | `insanity` (150) | Already grants `berserk` and two war-flavored buildings — a peace monument arriving on the same research is the whole joke |
| The Argument With The Sky | **new** — see below | Needs both `pyromancy` and `cryomancy`, which don't sit on one chain |

```ts
// The only new tech this system needs.
{
  id: 'sky-argument',
  name: 'The Argument With The Sky',
  faction: 'both',
  cost: 70,
  prereqs: ['pyromancy', 'cryomancy'],
  units: [],
  buildings: ['skyArgumentSpire'],
  flags: [],
  flavor:
    'Fire and cold were each mastered separately and immediately turned on ' +
    'each other. The weather has held a grudge ever since.',
},
```

Cost is low relative to its two prereqs (165 + 180) since those already did
the expensive research — this is closer to "notice you now know both" than
a new discovery.

Adding the other three is just extending an existing tech's `buildings`
array:

```ts
// not-you-again.buildings.push('firstLedger')
// tower-building.buildings.push('yellingWall')
// insanity.buildings.push('longPeaceMonument')
```

| id | Scope | Effect (proposed) |
|---|---|---|
| `firstLedger` | City | +50% market/treasury output, city built in |
| `yellingWall` | City | +2 sight for the city, sees through all terrain |
| `longPeaceMonument` | Civ | +1 content citizen in every city, stacking with `contentment` |
| `skyArgumentSpire` | Civ | Magical attacks apply both `pyromancy` and `cryomancy` effects together |

---

## Orc horde Follies

| Folly | Attaches to | Why it fits |
|---|---|---|
| The Loudest Rock | `to-be-an-orc` (45) | Training tech — "shouted at on purpose" already sets up a bigger thing to shout at |
| The Bonepit | `axes-crazy` (80) | Currently grants only the `swampy` flag and no building — a pile of everything that craziness has produced fits cleanly |
| The Bargain Stone | `dead-messed-up` (130) | Already the `bargain` flag's home — a stone recording the terms of those bargains is the natural companion |
| The Long March | `full-of-fire` (185) | Existing dead end, already "the Horde's one plan for the late game" — marching out on it is the punchline |

```ts
// to-be-an-orc.buildings.push('loudestRock')
// axes-crazy.buildings.push('bonepit')
// dead-messed-up.buildings.push('bargainStone')
// full-of-fire.buildings.push('longMarchRoad')
```

| id | Scope | Effect (proposed) |
|---|---|---|
| `loudestRock` | City | Orc units trained in this city start with +1 attack |
| `bonepit` | City | Orc units trained in this city start at +1 experience level |
| `bargainStone` | Civ | Death Knight `bargain` effect costs less of the caster's own side's health |
| `longMarchRoad` | Civ | +1 movement for all orc units |

---

## Human alliance Follies

| Folly | Attaches to | Why it fits |
|---|---|---|
| The Unfinished Cathedral | `hammers-of-glory` (85) | Already grants the Thinking Rock and "Hall of Careful Notes" — a permanently-in-progress cathedral is the same bureaucratic joke |
| The Rumbling Archive | `rumbling-voice` (100) | The pun is already sitting right there in the tech's own name |
| The Long Vigil | `run-you-through` (125) | Already the `valour` flag's home and grants Paladin — a vow monument fits directly |
| The Learned Committee | `lordship` (150) | Already grants "The Parade Ground" and titles/land — a standing committee is the same institutional joke one step further |

```ts
// hammers-of-glory.buildings.push('unfinishedCathedral')
// rumbling-voice.buildings.push('rumblingArchive')
// run-you-through.buildings.push('longVigilShrine')
// lordship.buildings.push('learnedCommittee')
```

| id | Scope | Effect (proposed) |
|---|---|---|
| `unfinishedCathedral` | City | +1 content citizen in this city, stacking with `contentment` |
| `rumblingArchive` | City | Mage-line units trained in this city get +1 range |
| `longVigilShrine` | Civ | +1 defense for all mounted units (Knight, Paladin lines) |
| `learnedCommittee` | Civ | +1 sight for every human unit |

---

## Art prompts

Same house style as every other building icon: 48×48, plain magenta
background, single centred object, thick dark outline, no text, no
numerals. Save as `art_src/buildings/<id>.png`.

> 48x48 pixel art icon on a plain solid magenta background (#FF00FF), a single
> centred object filling the frame, thick dark outline, limited palette, flat
> shading lit from the upper left, mid-1990s fantasy strategy game interface
> icon, no text, no letters, no numbers, no border, no background scenery.

**Eleven of these only need a building icon** — no new tech card exists for
them, so there's no separate advance icon to draw; the tech they ride on
already has (or will eventually get) its own icon, unrelated to the Folly.
**Only `sky-argument` needs both**, since it's the one genuinely new tech.

### Shared

| id | What it is | Icon subject |
|---|---|---|
| `firstLedger` | building | a single ancient scroll under glass on a plain stone plinth |
| `yellingWall` | building | an extremely tall, disproportionately thick section of grey stone wall |
| `longPeaceMonument` | building | a simple stone obelisk with a single carved dove, one wing chipped |
| `sky-argument` | tech | a storm cloud split cleanly down the middle, orange lightning on one side, blue frost on the other |
| `skyArgumentSpire` | building | a tall thin spire with an orange flame licking one side and blue frost creeping the other |

### Orc horde

| id | What it is | Icon subject |
|---|---|---|
| `loudestRock` | building | an enormous smooth grey boulder, far bigger than the standard thinking-rock, with a deep worn seat |
| `bonepit` | building | a wide sunken pit filled with stacked bones and rusted weapons |
| `bargainStone` | building | a dark standing stone carved with tally marks, faint violet glow in the carved grooves |
| `longMarchRoad` | building | a long straight dirt road cutting toward the horizon, orc banners planted along its length |

### Human alliance

| id | What it is | Icon subject |
|---|---|---|
| `unfinishedCathedral` | building | a grand cathedral facade, half in finished pale stone and half still in bare grey scaffold |
| `rumblingArchive` | building | a tall shelf of leather-bound books with a faint golden glow between the spines |
| `longVigilShrine` | building | a small stone shrine with a single perpetually burning candle at its centre |
| `learnedCommittee` | building | a round table with several empty chairs and one very tall stack of papers |

---

## Open questions before implementation

- **Civ-wide activation timing** — on research of the host tech, or on the
  Folly building's completion? Unchanged from the first pass; still open.
- **Uniqueness enforcement** — where does `unique: 'faction' | 'world'`
  live? Still not in `TechDef` as shown.
- **Shared-Folly refund mechanics** — still needs support wherever build
  queues resolve.
- **Effect numbers are proposals, not final** — same caveat as before.
- **Does bolting a new building onto an existing tech's flavor text still
  read well?** None of the eleven riders change that tech's own `flavor`
  string, but worth a read-through once the buildings are wired to check
  none of them now contradict what the tech's existing description implies.
