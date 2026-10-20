# City buildings — Wandering Folk and Unbound

The same ten slots the Hivekin got, filled for the two factions that
don't have them yet: defence ×2, calm 2, calm 3, posting, study ×2, gold
×2, supply, veterancy. Slots, costs and shared-spine unlocks are copied
straight from the Hive table so all three factions stay on the same
economy; only the three faction-specific unlocks change, and each is
picked to sit at the same depth as the Hive's was.

| Hive slot | Hive unlock | Wandering Folk unlock | Unbound unlock |
|---|---|---|---|
| posting (30) | A Sturdier Shape (45) | `tier-warband`, *A Proper Line* (45) | `tier-revenant`, *One Who Returns* (25) |
| study 2 (130) | Further Down (120) | `signature-mystic`, *Taught By Watching* (100) | `sigil-bound`, *Sigil-Bound* (80) |
| veterancy (100) | The Best Shape So Far (85) | `tier-outcast`, *Exile, Reclassified* (85) | `tier-yaksha`, *What Was Left To Guard* (85) |

Every other unlock is a shared-spine advance (Wall Building, Joy Making,
Insanity, Hammers of Glory, Not You Again!, Tower Building, Bridge
Building), so those rows are identical across all five factions.

---

## Wandering Folk

Register: practical, transactional, a little too cheerful about it.
Everything is a service, a fee or a favour; nothing is ever quite owned.

| Building | id | Slot | Cost | Unlocked by | Flavor |
|---|---|---|---|---|---|
| The Circled Wagons | `circledWagons` | defence ×2 | 60 | Wall Building | Defence, achieved by parking carefully and chaining the wheels together. |
| The Shared Fire | `sharedFire` | calm 2 | 40 | Joy Making | Anyone may sit. Nobody asks what you brought. |
| The Big Tent | `bigTent` | calm 3 | 90 | Insanity | Everyone is welcome. The terms are printed on the flap, in very small writing. |
| The Hired Post | `hiredPost` | posting | 30 | A Proper Line | One guard, engaged by the night, renewable if the night goes well. |
| The Route Book | `routeBook` | study | 60 | Hammers of Glory | Every road anyone has ever taken, and what it cost them. |
| The Knotted Record | `knottedRecord` | study | 130 | Taught By Watching | Nothing here was written down. Everybody agrees on what it says. |
| The Strongbox Wagon | `strongboxWagon` | gold | 60 | Not You Again! | The one wagon nobody is allowed to borrow, and the only one with a lock. |
| The Toll Post | `tollPost` | gold | 110 | Tower Building | It has never been established what it is a toll *on*. Payment is accepted regardless. |
| The Waystation | `waystation` | supply | 50 | Bridge Building | A cache for whoever comes next. Whoever comes next is expected to leave it fuller. |
| The Wager Ring | `wagerRing` | veterancy | 100 | Exile, Reclassified | Veterans are made here, mostly because there is money riding on it. |

### Art — Wandering Folk

House style: **Structures seen in place**, 48×48, same block as the
Hive's buildings (the Hive precedent is followed here; if these should
instead be flat card icons like the 20 orc and human ones, swap the
preamble for **Flat interface icons** and drop the isometric wording).
Save as `art_src/buildings/<id>.<ext>`.

| id | Prompt subject |
|---|---|
| `circledWagons` | A tight ring of four heavy wooden wagons chained wheel to wheel, sharpened stakes angled out between them, canvas covers drawn tight |
| `sharedFire` | A wide stone-ringed fire pit with a steady fire, mismatched stools, logs and an overturned crate set around it, no figures |
| `bigTent` | A large patchwork canvas tent of clashing colours strung with paper lanterns, one flap tied open, a long banner of plain cloth on a pole |
| `hiredPost` | A small canvas awning on two poles with a single stool beneath it and a hooded lantern hanging from one pole, no figure |
| `routeBook` | A thick leather-bound ledger lying open on a wooden stand, a ribbon marker trailing from it and a small brass compass beside it |
| `knottedRecord` | A tall post hung with dozens of knotted cords in many colours, small bone charms tied at intervals along the cords |
| `strongboxWagon` | An iron-banded wagon with a single large padlocked chest bolted to its bed, the lock oversized and gleaming, canvas stripped away so the chest is the only thing visible |
| `tollPost` | A striped barrier pole across a track beside a tiny wooden booth with a hanging brass scale, a coin dish set on the booth's ledge |
| `waystation` | A neat stack of roped crates and water barrels under a lean-to roof beside a leaning trail marker post |
| `wagerRing` | A roped-off circle of packed dirt with four corner stakes, a bucket of coins hung from one stake, two plain practice staves leaning against another |

**Notes for prompting:**

- **`strongboxWagon` is the Goblin Treasury's opposite** and should look
  it: the orc chest is valuable and unguarded, this one is valuable and
  absurdly secured. The padlock is the joke, so let it be too big.
- **`tollPost` must have no sign or lettering** — the booth, pole and
  scale carry it.
- **`knottedRecord` should read as a record, not as laundry.** If it
  comes out as hanging washing, ask for "cords knotted at regular
  intervals, like a tally".
- **No characters in any of these**, per the house style. The guard
  posted at `hiredPost` is drawn separately, on top.

---

## Unbound

Register: flat, clinical and faintly bureaucratic about being dead.
Nothing is celebrated; things are simply noted, and then kept.

| Building | id | Slot | Cost | Unlocked by | Flavor |
|---|---|---|---|---|---|
| The Drawn Line | `drawnLine` | defence ×2 | 60 | Wall Building | A line was drawn. Most things have respected it. |
| The Quiet Room | `quietRoom` | calm 2 | 40 | Joy Making | Nothing is expected here. This is found restful, by those who find things. |
| The Long Conversation | `longConversation` | calm 3 | 90 | Insanity | It began some time ago. It has not been interrupted, and nobody has finished a sentence. |
| The Appointed Place | `appointedPlace` | posting | 30 | One Who Returns | Somewhere to be stood in. It is the same spot every time. |
| The Wall of Names | `wallOfNames` | study | 60 | Hammers of Glory | Every name that has been carried here. Most of them can still be read. |
| The Sigil Stacks | `sigilStacks` | study | 130 | Sigil-Bound | Each mark says which way to come back. There are, by now, a great many. |
| The Tithe Basin | `titheBasin` | gold | 60 | Not You Again! | Left by the living, collected by everyone else. |
| The Tithe Vault | `titheVault` | gold | 110 | Tower Building | Larger than the basin, and for the same reason. |
| The Far Door | `farDoor` | supply | 50 | Bridge Building | A doorway standing alone in a field. It leads here from somewhere else, and does not need a wall. |
| The Rehearsal Floor | `rehearsalFloor` | veterancy | 100 | What Was Left To Guard | They have done this before. They are now doing it properly. |

### Art — Unbound

House style: **Structures seen in place**, 48×48, same block as the
Hive's buildings (same flat-icon caveat as above). Save as
`art_src/buildings/<id>.<ext>`. Pale blue-white glow stays safe on the
**standard magenta** background, as it already does for `retrieval-circle`
and `anchor-totem` — it is not a magenta or violet hue.

| id | Prompt subject |
|---|---|
| `drawnLine` | A low run of upright weathered stones joined by one thin continuous line of faint pale blue-white light running along their bases |
| `quietRoom` | A small domed stone chamber with a single open doorway and nothing visible inside but a faint warm glow |
| `longConversation` | A ring of many plain stone seats facing inward around a shallow round hollow, a faint pale glow rising from the centre, every seat empty |
| `appointedPlace` | A single flat paving stone ringed by a thin worn pale circle, a short iron post standing at its edge |
| `wallOfNames` | A short standing wall of dark stone covered in rows of tiny carved marks, a faint pale glow lying in the grooves of the carving |
| `sigilStacks` | A tall stone shelving unit packed with flat carved sigil tablets stacked on edge, a faint cold glow leaking from between them |
| `titheBasin` | A wide shallow dark stone basin with a scatter of dull coins and small keepsakes lying in the bottom |
| `titheVault` | A low squat stone vault with a heavy round door standing slightly ajar, coins spilled on the threshold, faint cold glow from inside |
| `farDoor` | A freestanding stone doorframe with no wall around it, faint pale blue-white light filling the opening |
| `rehearsalFloor` | A low circular dais of dark stone worn smooth in overlapping footprint hollows, a rack of dull blunt practice weapons at its edge |

**Notes for prompting:**

- **`farDoor` must have nothing around it.** The whole joke is that it is
  a door without a building. If the generator adds walls or a house,
  ask for "a doorframe standing alone on bare ground, nothing attached to
  either side".
- **`longConversation` stays empty.** Chairs, no sitters — the faction
  would say the participants are present. The viewer is not expected to
  be able to tell.
- **`wallOfNames` carries no readable lettering**, only rows of small
  uniform marks; at 48px any real writing turns to mush.
- **No characters in any of these**, per the house style.

---

## Counts

Twenty new building icons: ten Wandering Folk, ten Unbound. None needs an
attack strip or state sheets. Names are checked against the Folly,
lesser-work and ending buildings already written for both factions, and
against the Hive's ten, so nothing collides.
