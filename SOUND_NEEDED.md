# Sound Effects Needed

A shopping list. Everything here is royalty-free-able from Pixabay, Freesound or
similar; suggested search terms are included because the obvious word is often the
wrong one.

## How to add one

1. Download it. **Keep the original filename** — it carries the credit trail.
2. Drop it in `art_src/sfx/`.
3. Add a line to `SFX_FILES` in `src/audio/audio.ts` mapping a short id to the file.
4. Trigger it from wherever the event happens.
5. `npm run art` re-encodes it to mono and copies it across.

Anything short and dry works. The pipeline handles compression, so don't worry about
file size — but **avoid anything with a long tail or reverb**: these fire on top of
each other during a turn and wash into mud.

Target **under 1 second** for interface cues, under 2 for combat.

---

## Priority 1 — the game is silent outside combat

This is the real gap. Twenty effects are wired and **all twenty are combat**. Founding
your first city, discovering an advance, finishing a wonder of a building — all of it
happens in total silence, which makes the whole game feel unresponsive between fights.

| id | Event | Search terms | Notes |
|---|---|---|---|
| `discovery` | An advance is completed | *"magic chime"*, *"level up"*, *"discovery jingle"*, *"achievement"* | **Do this one first.** The most satisfying moment in a 4X. Bright, short, rising. Not a fanfare — it fires 20+ times a game. |
| `city-founded` | A city is founded | *"wood thud"*, *"construction place"*, *"settle"* | A solid low thud with a little lift. Should feel like putting something down. |
| `built` | Production completes | *"anvil"*, *"blacksmith hit"*, *"craft complete"* | Distinct from `discovery` — duller, more physical. Fires very often, so keep it quiet. |
| `growth` | A city grows | *"positive blip"*, *"soft bell"*, *"pop ui"* | Very short and very quiet. Several may fire in one turn. |
| `blocked` | An illegal action | *"error thunk"*, *"wrong buzz"*, *"ui deny"* | Currently only a text message, so mis-clicks feel like the game ignored you. Dull, not harsh. |
| `city-lost` | You lose a city | *"low horn"*, *"defeat sting"*, *"dark drone"* | Currently reuses a sword clash, which badly undersells it. Bleak and short. |
| `turn` | Your turn begins | *"soft drum"*, *"low tick"* | Easy to overdo. Very quiet, or leave it out. Lowest priority here. |

---

## Priority 2 — needed by the queued unit abilities

See `DESIGN_QUEUE.md`. Only one of these is genuinely missing.

| id | Event | Search terms | Notes |
|---|---|---|---|
| `explosion` | **Sapper detonates on death** | *"explosion"*, *"barrel blast"*, *"dynamite"*, *"impact boom"* | **The one real gap in the whole set.** Nothing currently comes close. Wants a deep chesty boom, not a firework crackle — it kills everything around it and should sound like it. |

Everything else the abilities need is **already downloaded**:

- **Ranged attacks** — covered by `arrow`, `axe-throw`, `magic`, `siege`.
- **Death Knight execution** — `magic-dark` works as-is.
- **Dragon breath** — `dragon` works as-is.
- **Paladin heal** — you already have `coghezzi-holy-healing-spell`, but it is currently
  mapped as the paladin's *attack*. When healing arrives, move it to the heal and give
  the paladin `sword` or `grunt-knight` for attacking. **No download needed, just a
  two-line change.**

---

## Priority 3 — nice to have

| id | Event | Search terms |
|---|---|---|
| `select` | Selecting a unit | *"ui click soft"*, *"select blip"* |
| `move` | A unit finishes moving | *"footstep dirt"*, *"march step"* |
| `promote` | A unit becomes veteran | *"short fanfare"*, *"rank up"* |
| `coin` | Treasury income, or selling a building | *"coins"*, *"gold clink"* |
| `capture` | You take an enemy city | *"victory horn"*, *"triumph short"* |

---

## Already covered — don't re-download

Twenty effects, all mapped in `src/audio/audio.ts`:

`melee` · `sword` · `arrow` · `arrow-hit` · `axe-throw` · `magic` · `magic-dark` ·
`holy` · `siege` · `dragon` · `roar-troll` · `roar-ogre` · `grunt-small` ·
`grunt-human` · `grunt-knight` · `grunt-female` · `death-monster` · `death-goblin` ·
`cry` · `grunt-beast`

Every creature has an attack sound and a death sound already. Three music tracks
(`world`, `battle`, `victory`) are in and wired.

Two of the twenty are arguably mis-assigned and worth revisiting when convenient:

- `holy` as the paladin's attack — it is unmistakably a healing sound.
- `arrow-hit` is loaded but **never actually played**; nothing triggers it. It would
  suit the ranged-attack work.
