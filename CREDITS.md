# Credits

Everything the game is built from that did not come out of this repository, and
where it came from. The code's own terms are in [LICENSE](LICENSE); this file
covers the assets, which are not the same thing and are not MIT.

## Art

Every sprite, icon, terrain tile, portrait and victory screen was generated with
**Google Gemini** from the prompts in [ART_PROMPTS.md](ART_PROMPTS.md), then cut
out, trimmed and scaled by `tools/prepare_art.py`. The raw generator output is in
`art_src/`; `public/` holds the processed results.

The prompts describe original characters in a general 90s-fantasy-RTS style. No
assets, names, characters or logos from any existing game appear anywhere here.

## Sound effects

Sourced from **Pixabay**. Licence summary:
<https://pixabay.com/service/license-summary/>

Found using the search terms listed in [SOUND_NEEDED.md](SOUND_NEEDED.md).

### Files that document themselves

A Pixabay download arrives named `<uploader>-<title>-<id>.mp3`, and these kept
that name, so the credit and licence trail is readable straight off the file.

- `666herohero-monster-death-grunt-131480.mp3`
- `adhimahadi-ballista-slow-mo-8280.mp3`
- `coghezzi-holy-healing-spell-533279.mp3`
- `daviddumaisaudio-monster-05-grunt-and-growl-195715.mp3`
- `daviddumaisaudio-small-monster-attack-195712.mp3`
- `dennish18-arrow-body-impact-146419.mp3`
- `djartmusic-arrow-swish_03-306040.mp3`
- `djartmusic-magical-sparkle-whoosh-298750.mp3`
- `dragon-studio-deer-grunt-472371.mp3`
- `dragon-studio-dragon-breathing-fire-364475.mp3`
- `dragon-studio-sword-clashhit-393837.mp3`
- `freesound_community-goblin-death-6729.mp3`
- `freesound_community-gryffin-cry-6995.mp3`
- `freesound_community-troll-roars-100312.mp3`
- `magiaz-ogre-387362.mp3`
- `phatphrogstudio-male-fighter-voice-heavy-attack-grunt-544355.mp3`
- `phatphrogstudio-rpg-female-attack-grunt-no-ai-481720.mp3`
- `phatphrogstudio-rpg-m-knight-voice-attack-grunt-490291.mp3`
- `soundreality-whoosh-axe-throw-389751.mp3`
- `yodguard-casting-magic-4-382380.mp3`

### Files renamed to the event they play on

These were renamed for the sake of the code that loads them, which cost the
trail. It is restored here: each was matched **byte for byte** against the
original download, so the pairing is identity, not resemblance.

| in the repo | original Pixabay download |
|---|---|
| `blocked.mp3` | `soundshelfstudio-ui-error-pop-515668.mp3` |
| `built.mp3` | `freesound_community-bing1-91919.mp3` |
| `capture.mp3` | `freesound_community-075747_inception-horn-victory-82997.mp3` |
| `city-founded.mp3` | `freesound_community-wooden-thud-mono-6244.mp3` |
| `city-lost.mp3` | `u_903n3qx7rq-dramatic-sting-118943.mp3` |
| `coin.mp3` | `pwlpl-falling-coins-and-treasure-clatter-481169.mp3` |
| `discovery.mp3` | `universfield-game-bonus-144751.mp3` |
| `growth.mp3` | `47313572-ui-sounds-pack-2-sound-5-358890.mp3` |
| `move.mp3` | `joentnt-walk-on-dirt-3-291983.mp3` |
| `promote.mp3` | `universfield-level-up-08-402152.mp3` |
| `select.mp3` | `vadim_makes_sound-soft-app-button-tap-sound-2-547872.mp3` |
| `turn.mp3` | `freesound_community-086196_oil-drum-soft-impactwav-39587.mp3` |
| `xplosion.mp3` | `soundreality-explosion-fx-343683.mp3` |

## Music — provenance unconfirmed

`battle.mp3`, `world.mp3` and `victory.mp3`.

**These three cannot currently be credited.** They carry no ID3 metadata at all --
only a LAME encoder string -- and unlike every sound effect above, none of them
matches any named download in the original folder, by content or by size and
length. Nothing on disk says where they came from.

The likely sources are Pixabay, as above, or Royalty Free Music Library:
<https://royaltyfreemusiclibrary.com/license>

Until that is settled they are **not in the repository**. See below.

## Audio is not currently tracked here

All sound effects and music are untracked and gitignored while the licensing
above is confirmed, so this repository redistributes none of it. The files stay
in place locally, so a checkout on this machine still has sound; a fresh clone
will not, and neither will the deployed site until they are restored.

The distinction that motivates this: bundling licensed audio inside a game is an
ordinary permitted use, whereas publishing the `.mp3` files themselves in a public
repository is closer to redistributing the sounds as files, which these licences
treat differently. Restoring them is a matter of deleting the audio lines from
`.gitignore` once each file's terms are confirmed.
