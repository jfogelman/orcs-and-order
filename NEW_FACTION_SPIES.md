# Spies — Wandering Folk and Unbound

Extends `SPIES_PLAN.md`'s unit grid and art section to the two factions it
didn't cover (it was written when there were only three). Nothing else in
the plan needs touching: the five shared advances, the detection rules, the
no-attack rule, the dice, and the diplomacy tie are all on the shared spine
or faction-agnostic by design — *"all three factions build spies"* already
generalizes to five without any new mechanic. This is purely the two new
rows of the unit grid, named and drawn.

## Five units a side, not two

| | the Horde | the Kingdom | the Hive | the Wandering Folk | the Unbound |
|---|---|---|---|---|---|
| **low** | Skulker | Factor | Mimic-caste | **Tag-Along** | **Borrowed Face** |
| **high** | Nobody | Intelligencer | Hollow-caste | **Off The Books** | **Unreturned** |

Both new names play the same game the first three did — the joke is in
what the unit's own faction would actually call this, not in a generic
"spy" label.

**Tag-Along** because every band of Wandering Folk has always picked up
people along the way with no formal process for it, and a spy is just one
more person nobody remembers formally admitting. **Off The Books** because
the whole faction already thinks in contracts and ledgers — this is the
one unit that was never entered into either, which is also, not
coincidentally, the exact mechanism that makes it dangerous: nothing
written down means nothing to trace back.

**Borrowed Face** because the Unbound's whole deal is a spirit occupying
a shape that isn't originally its own, and this is that same trick turned
toward deception instead of survival. **Unreturned** sits opposite
`tier-revenant` ("One Who Returns") on purpose — every other Unbound unit
came back; this one is the one that specifically didn't finish the job,
and stays that way as long as it's useful.

## Gating — no new advances needed

Both factions sit on the same shared spine as orc, human, and Hivekin, and
the plan's five spy advances (`someone-elses-business`,
`asking-around`, `a-word-in-the-wrong-ear`, `nobody-in-particular`,
`everyone-has-a-price`) are already faction `'both'`-equivalent in intent
— written for "all three factions," now meaning all five. No new tech, no
new icons: the existing five advance icons already planned in
`ART_PROMPTS.md` (keyhole, shuttered lantern, note in stonework, empty
hood, coin in palm) cover every faction, the same way Mapmaking does.

## Art

Same rule as the other three pairs: **a disguised spy needs no art of its
own while disguised** — it's drawn as whatever ordinary unit it's
pretending to be. What follows is only what each one looks like once
uncovered. House style: **Units — 32×32 sprite**, saved as
`art_src/units/<id>.<ext>`.

### Wandering Folk spies

| id | Prompt subject |
|---|---|
| `tagalong` | A plainly dressed Wanderer-kin with a battered travel pack and the same mismatched gear as anyone else in the band, caught mid-glance to one side, one hand resting a little too casually near a coin-pouch that isn't theirs |
| `offbooks` | A deliberately unremarkable figure in plain grey-brown travelling clothes with no clan colours, trade-marks, or charms of any kind, hood low over the face, standing with the practiced stillness of someone who has been not-quite-there for a long time |

Neither is translucent or ghostly — the Wandering Folk aren't a spirit
faction, so the "uncovered" tell here is the absence of the faction's
usual visual noise (the mismatched charms, the travel-worn layering every
other Wanderer wears) rather than anything supernatural. **Off The Books
should look like it was built specifically to belong nowhere** — no
identifiable origin at all, which is the opposite approach from Tag-Along,
who belongs *too* easily, to everywhere.

### Unbound spies

| id | Prompt subject |
|---|---|
| `borrowedface` | A human-shaped figure in plain, unremarkable clothing, almost entirely solid and ordinary, except for eyes that don't quite track together and a faint cold air that nothing else in the scene seems to notice |
| `unreturned` | A barely-formed translucent shape, deliberately incomplete, no face or limbs fully resolved, faint cold blue-white glow along what edges it has, holding together only just enough to be seen |

**Backgrounds differ on purpose.** `borrowedface` goes on the standard
magenta — it's the one Unbound spy drawn mostly solid, same logic as the
Effigy being the one magenta-background unit in the whole faction: the
joke is that it's wearing physicality *well*, not badly. `unreturned`
goes on **green (#00FF00)**, the same rule as every other
translucent/glowing Unbound asset, since its whole point is a form that
never finished arriving.

This is also a deliberate contrast with the Hive's Mimic-caste, whose
joke is a visibly botched disguise (blotchy colours, wrong angles).
Borrowed Face's disguise doesn't fail visibly at all — the tell is small
and uncanny rather than slapstick, which fits the faction's quieter,
dryer register better than a bad-costume gag would.

### State sheets, not sprites

Same note the original plan made for the first six: each of these four
also needs **hurt and nearly-dead sheets** in `art_src/unit states/`
(eight more files, two per unit), since a found spy is a spy about to
have an ordinary bad day. **None of the four needs an attack strip** —
`attack: 0` applies exactly as it does to the other six, and the shared
`uncovered` effect strip (already drawn, faceless, figure-agnostic) plays
over any of them the same way it plays over the first three pairs.
