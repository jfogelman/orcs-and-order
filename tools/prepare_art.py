#!/usr/bin/env python3
"""
Turn raw generated art into game-ready sprites.

Raw art goes in `art_src/`; this writes processed assets into `public/`, which
is what Vite serves and what ships in `dist/`. Nothing in `art_src/` is shipped.

Three things need doing, none of which an image generator does for you:

1. **Cut out the background.** The generators export a transparency checkerboard,
   which becomes real grey-and-white pixels the moment the file is saved as JPEG.
   A flood fill inward from the border removes it without touching a knight's
   white armour, because interior pixels are never connected to the edge.

2. **Trim and square up.** Sprites are cropped to their content and bottom-aligned,
   so every unit's feet land in the same place and the owner-colour disc the game
   draws underneath lines up.

3. **Make them small.** 1024x1024 JPEGs at ~1MB each are roughly a thousand times
   more than a 32-pixel map tile needs.

Group sprites are deliberately NOT processed here. They are composed at runtime
from the single-unit art instead --" see src/render/spriteCache.ts.

Usage:  python tools/prepare_art.py [--force]
"""

from __future__ import annotations

import subprocess
import sys
from collections import Counter, deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art_src"
OUT = ROOT / "public"

# Big enough to stay sharp at maximum zoom (128px tiles), small enough to be web art.
UNIT_SIZE = 96
# Matches TILE in src/render/camera.ts.
TERRAIN_SIZE = 32
# Matches TERRAIN_VARIANTS in src/render/tileArt.ts.
TERRAIN_VARIANTS = 4

# How far a pixel may stray from a detected background colour and still count.
BG_TOLERANCE = 34
# Checkerboard squares are exact flat values, so they are matched tightly: a
# loose match escapes into pale stonework that happens to touch the edge.
CHECKER_TOLERANCE = 12
# Second, looser pass that catches anti-aliased edge pixels bleeding into the fill.
HALO_TOLERANCE = 62
# If a cut-out removes this much of the picture, the fill has clearly escaped
# into the subject and the original is kept instead.
MAX_REMOVED = 0.93

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

# Every base creature in src/model/units.ts. Group variants are composed at
# runtime, so only these are needed as art.
CREATURES = [
    "peon", "goblin", "sapper", "orc", "axethrower", "troll", "ogre",
    "deathknight", "dragon",
    "peasant", "footman", "outrider", "archer", "knight", "ballista",
    "mage", "paladin",
]

TERRAINS = ["grass", "forest", "hills", "mountains", "swamp", "desert", "water", "deep"]

# Settlement art, in three size tiers per faction.
CITIES = [f"{faction}_{tier}" for faction in ("orc", "human") for tier in (1, 4, 8)]


def close_enough(a: tuple[int, int, int], b: tuple[int, int, int], tol: int) -> bool:
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol


def is_neutral(c: tuple[int, int, int]) -> bool:
    """
    Neutral grey: red, green and blue all within a hair of each other.

    Note what this deliberately does NOT test: brightness. Checkerboards come in
    light-on-white *and* dark-on-grey, and assuming the former means the dark
    squares are never recognised - which is fatal, because the fill is
    4-connected and like-coloured squares only touch diagonally.
    """
    return max(c[:3]) - min(c[:3]) < 22


def crop_letterbox(img: Image.Image) -> Image.Image:
    """
    Strip uniform bars from the edges before anything else looks at them.

    Some exports arrive letterboxed in solid black, and a black bar is a
    disastrous thing to seed a background fill from: the fill starts in the bar,
    finds the dark stone of an orc keep, and eats the entire building.
    """
    img = img.convert("RGB")
    w, h = img.size
    px = img.load()

    def uniform_row(y: int) -> bool:
        first = px[0, y]
        if max(first) > 60:  # only strip dark bars, not pale backgrounds
            return False
        return all(close_enough(px[x, y], first, 10) for x in range(0, w, max(1, w // 120)))

    def uniform_col(x: int) -> bool:
        first = px[x, 0]
        if max(first) > 60:
            return False
        return all(close_enough(px[x, y], first, 10) for y in range(0, h, max(1, h // 120)))

    top, bottom, left, right = 0, h - 1, 0, w - 1
    while top < bottom and uniform_row(top):
        top += 1
    while bottom > top and uniform_row(bottom):
        bottom -= 1
    while left < right and uniform_col(left):
        left += 1
    while right > left and uniform_col(right):
        right -= 1

    if (left, top, right, bottom) == (0, 0, w - 1, h - 1):
        return img
    return img.crop((left, top, right + 1, bottom + 1))


def background_predicate(img: Image.Image):
    """
    Decide what counts as background in this particular image.

    Two very different situations, so two very different tests:

    * **Transparency checkerboard.** Matching against sampled seed colours does
      not work here. The squares are small and JPEG-ringed, so no tolerance is
      both loose enough to cross the pattern and tight enough to be safe. But
      the checkerboard has a property nothing in the artwork has: it is a
      *neutral light grey*. Testing for that directly crosses the whole pattern
      in one go, and coloured artwork is untouched.

    * **Anything else** (a flat pale or coloured backdrop): proximity to the
      dominant border colours, which is all that is needed.

    Returns a predicate, or None when the border looks like artwork.
    """
    w, h = img.size
    px = img.load()
    border: list[tuple[int, int, int]] = []
    step = max(1, min(w, h) // 200)
    for x in range(0, w, step):
        border.extend((px[x, 0][:3], px[x, h - 1][:3]))
    for y in range(0, h, step):
        border.extend((px[0, y][:3], px[w - 1, y][:3]))

    neutrals = [c for c in border if is_neutral(c)]
    if len(neutrals) >= len(border) * 0.45:
        # A checkerboard is two neutral levels. Find them, then accept any
        # neutral pixel sitting near either one. Artwork is almost never
        # neutral, so coloured stonework and mud survive this untouched.
        levels = Counter(sum(c[:3]) // 3 // 10 for c in neutrals)
        keep = [b * 10 + 5 for b, n in levels.most_common(3) if n >= len(neutrals) * 0.15]

        def checker(c: tuple[int, int, int]) -> bool:
            if not is_neutral(c):
                return False
            value = sum(c[:3]) // 3
            return any(abs(value - k) <= 28 for k in keep)

        return checker, False

    counts = Counter((c[0] // 12, c[1] // 12, c[2] // 12) for c in border)
    threshold = len(border) * 0.08
    seeds = [
        (q[0] * 12 + 6, q[1] * 12 + 6, q[2] * 12 + 6)
        for q, n in counts.most_common(6)
        if n >= threshold
    ]

    # A vividly saturated backdrop - magenta being the classic - is worth
    # keying on hue rather than distance. Where the background meets the
    # sprite, JPEG leaves a fringe of blended pixels that are still obviously
    # magenta-tinted but far too far from pure magenta for any safe distance
    # threshold to catch. Testing "does this lean towards the background's
    # hue" removes the whole fringe and leaves the artwork alone, because no
    # green, brown, grey or gold leans that way.
    vivid = next((b for b in seeds if max(b) - min(b) > 70), None)
    if vivid is not None:
        high = [i for i in range(3) if vivid[i] >= max(vivid) - 40]
        low = [i for i in range(3) if i not in high]
        if low:
            def tinted(c: tuple[int, int, int]) -> bool:
                if close_enough(c[:3], vivid, BG_TOLERANCE):
                    return True
                weakest = max(c[i] for i in low)
                return all(c[i] - weakest > 28 for i in high)

            # Safe to key globally rather than only from the edges. This is the
            # entire point of a chroma-key colour: it appears nowhere in the
            # artwork, so background trapped inside the sprite - the gap inside
            # an archer's bow, the space behind a ballista's arm - is removed
            # too, which a border flood fill can never reach.
            return tinted, True
    if not seeds:
        return None

    def flat(c: tuple[int, int, int]) -> bool:
        return any(close_enough(c[:3], b, BG_TOLERANCE) for b in seeds)

    return flat, False


def checkerboard_survived(px, transparent: bytearray, w: int, h: int) -> bool:
    """
    Did a transparency checkerboard escape the fill?
    Checked directly rather than inferred from how much was removed, because a
    half-removed checkerboard removes a perfectly reasonable-looking fraction of
    the image. The giveaway is what is *left* around the outside: real artwork
    out at the margins is coloured, whereas a checkerboard is flat neutral grey.
    """
    margin_x = max(1, w // 10)
    margin_y = max(1, h // 10)
    opaque = 0
    neutral = 0
    for y in range(0, h, 2):
        in_y_margin = y < margin_y or y >= h - margin_y
        for x in range(0, w, 2):
            if not (in_y_margin or x < margin_x or x >= w - margin_x):
                continue
            if transparent[y * w + x]:
                continue
            opaque += 1
            if is_neutral(px[x, y]):
                neutral += 1
    if opaque < 40:
        return False
    return neutral / opaque > 0.55

def remove_background(img: Image.Image) -> tuple[Image.Image, bool]:
    """
    Flood fill inward from every border pixel that matches a background colour.

    Connectivity is what makes this safe: a white shield in the middle of the
    sprite is never reached, because the fill cannot get to it without crossing
    the character.

    Returns the image and whether the cut-out succeeded. A fill that consumes
    nearly everything has escaped into the subject, and the caller is told so it
    can keep the original and flag the file for a re-roll.
    """
    img = crop_letterbox(img).convert("RGBA")
    w, h = img.size
    px = img.load()
    detected = background_predicate(img)
    if detected is None:
        return img, False
    is_bg, keyable = detected

    transparent = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()

    if keyable:
        for y in range(h):
            row = y * w
            for x in range(w):
                if is_bg(px[x, y]):
                    transparent[row + x] = 1
                    queue.append((x, y))

    for x in range(w):
        for y in (0, h - 1):
            if not transparent[y * w + x] and is_bg(px[x, y]):
                transparent[y * w + x] = 1
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not transparent[y * w + x] and is_bg(px[x, y]):
                transparent[y * w + x] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            i = ny * w + nx
            if transparent[i]:
                continue
            if is_bg(px[nx, ny]):
                transparent[i] = 1
                queue.append((nx, ny))

    # Second pass: anti-aliased pixels along the cut edge are part-background and
    # would otherwise show as a pale halo once the sprite is over grass.
    halo: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if transparent[y * w + x]:
                continue
            if not is_bg(px[x, y]):
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and transparent[ny * w + nx]:
                    halo.append((x, y))
                    break
    for x, y in halo:
        transparent[y * w + x] = 1

    removed = sum(transparent)
    if removed > w * h * MAX_REMOVED:
        # The fill ate the subject. Better a visible background than nothing.
        return img, False

    for y in range(h):
        row = y * w
        for x in range(w):
            if transparent[row + x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return img, True


def trim_and_square(img: Image.Image, size: int) -> Image.Image:
    """Crop to content, then centre it horizontally and sit it on the floor."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # Leave a little headroom and a small floor margin so the owner disc reads.
    content = size - round(size * 0.10)
    scale = min(content / img.width, content / img.height)
    scaled = img.resize(
        (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
        Image.LANCZOS,
    )

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - scaled.width) // 2
    y = size - scaled.height - round(size * 0.06)
    canvas.paste(scaled, (x, max(0, y)), scaled)
    return canvas


def find_source(folder: Path, name: str) -> Path | None:
    for suffix in IMAGE_SUFFIXES:
        candidate = folder / f"{name}{suffix}"
        if candidate.exists():
            return candidate
    return None


def process_cutouts(
    folder: str, names: list[str], force: bool
) -> tuple[int, list[str], list[str]]:
    """Anything that sits on top of the map: units and settlements alike."""
    src = SRC / folder
    out = OUT / folder
    out.mkdir(parents=True, exist_ok=True)
    done = 0
    missing: list[str] = []
    failed: list[str] = []

    for name in names:
        path = find_source(src, name)
        if path is None:
            missing.append(name)
            continue
        target = out / f"{name}.png"
        if target.exists() and not force and target.stat().st_mtime > path.stat().st_mtime:
            continue
        img = Image.open(path)
        img, cut_out = remove_background(img)
        img = trim_and_square(img, UNIT_SIZE)
        img.save(target, optimize=True)
        flag = "" if cut_out else "   <-- BACKGROUND NOT REMOVED, needs a re-roll"
        print(f"  {folder}/{name}.png  {target.stat().st_size // 1024}KB{flag}")
        if not cut_out:
            failed.append(name)
        done += 1
    return done, missing, failed


def process_terrain(force: bool) -> tuple[int, list[str]]:
    """
    The terrain art is a tiling sheet holding many repeats of one motif, so a few
    crops from different parts of the sheet become the renderer's tile variants
    and the map stops looking stamped.
    """
    src = SRC / "terrain"
    out = OUT / "terrain"
    out.mkdir(parents=True, exist_ok=True)
    done = 0
    missing: list[str] = []

    for name in TERRAINS:
        path = find_source(src, name)
        if path is None:
            missing.append(name)
            continue
        first = out / f"{name}_0.png"
        if first.exists() and not force and first.stat().st_mtime > path.stat().st_mtime:
            continue

        sheet = Image.open(path).convert("RGB")
        w, h = sheet.size
        # Take a quarter of the sheet per variant: big enough to hold several
        # repeats of the motif, so downscaling averages into a usable tile.
        cw, ch = w // 2, h // 2
        offsets = [(0, 0), (cw, 0), (0, ch), (cw, ch)][:TERRAIN_VARIANTS]
        for i, (ox, oy) in enumerate(offsets):
            tile = sheet.crop((ox, oy, ox + cw, oy + ch))
            tile = tile.resize((TERRAIN_SIZE, TERRAIN_SIZE), Image.LANCZOS)
            tile.save(out / f"{name}_{i}.png", optimize=True)
        print(f"  terrain/{name}_[0-{TERRAIN_VARIANTS - 1}].png")
        done += 1
    return done, missing


def have_ffmpeg() -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-version"], capture_output=True, check=True, timeout=20
        )
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def encode_audio(path: Path, target: Path, quality: str, mono: bool) -> bool:
    """Re-encode one file with LAME VBR. Returns False if ffmpeg could not."""
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(path),
        "-c:a", "libmp3lame",
        "-q:a", quality,
        "-ar", "44100",
        "-ac", "1" if mono else "2",
        # Strip cover art and tags; a 200KB embedded JPEG in a sound effect is
        # not unheard of and ships straight to the player.
        "-map_metadata", "-1",
        "-vn",
        str(target),
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=300)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def process_audio() -> tuple[int, int, int]:
    """
    Compress audio on the way into `public/`.

    The source files arrive at 256 kbps stereo, which is a studio master
    setting: it is roughly three times what background music playing at a third
    of full volume needs, and the music alone was 70% of the entire download.

    Music keeps stereo at VBR ~100 kbps. Sound effects are one-shot cues where
    stereo buys nothing, so they go to mono at a lower rate. Filenames are
    preserved either way, because src/audio/audio.ts maps game events onto the
    original credited names.
    """
    if not have_ffmpeg():
        print("  ffmpeg not found - copying audio uncompressed")
    encode = have_ffmpeg()

    count = 0
    before = 0
    after = 0
    for folder, quality, mono in (("music", "7", False), ("sfx", "8", True)):
        src = SRC / folder
        if not src.exists():
            continue
        out = OUT / folder
        out.mkdir(parents=True, exist_ok=True)
        for path in sorted(src.iterdir()):
            if path.suffix.lower() not in {".mp3", ".ogg", ".wav", ".m4a"}:
                continue
            target = out / f"{path.stem}.mp3"
            count += 1
            before += path.stat().st_size
            if target.exists() and target.stat().st_mtime > path.stat().st_mtime:
                after += target.stat().st_size
                continue
            if not (encode and encode_audio(path, target, quality, mono)):
                target.write_bytes(path.read_bytes())
            after += target.stat().st_size
    return count, before, after


def adopt_raw_files() -> list[str]:
    """
    Move raw source images out of `public/` and into `art_src/`.

    `public/` is generated output that ships verbatim, so a raw 1MB JPEG left
    there goes straight into `dist/`. But dropping new art next to the processed
    art is the obvious thing to do, and telling people off for it is less useful
    than simply picking the files up. So: adopt them, then process them normally.
    """
    adopted: list[str] = []
    if not OUT.exists():
        return adopted
    for path in sorted(OUT.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".webp", ".bmp"}:
            continue
        target = SRC / path.relative_to(OUT)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())
        path.unlink()
        adopted.append(str(target.relative_to(ROOT)))
    return adopted


def main() -> int:
    force = "--force" in sys.argv
    if not SRC.exists():
        print(f"No {SRC.relative_to(ROOT)} directory. Put raw art there and re-run.")
        return 1

    adopted = adopt_raw_files()
    if adopted:
        print(f"Adopted {len(adopted)} raw file(s) left in public/ -> art_src/:")
        for name in adopted:
            print(f"  {name}")
        print()
        # Anything just adopted is new art and must override its old output.
        force = True

    print("Units:")
    units, missing_units, failed_units = process_cutouts("units", CREATURES, force)
    print("Cities:")
    cities, missing_cities, failed_cities = process_cutouts("cities", CITIES, force)
    print("Terrain:")
    terrain, missing_terrain = process_terrain(force)
    audio, audio_before, audio_after = process_audio()

    print(
        f"\n{units} unit sprites, {cities} city sprites, "
        f"{terrain} terrain sets, {audio} audio files "
        f"({audio_before // 1024}KB -> {audio_after // 1024}KB)."
    )
    for label, missing in (
        ("units", missing_units),
        ("cities", missing_cities),
        ("terrain", missing_terrain),
    ):
        if missing:
            # Plain ASCII: the Windows console default codepage cannot print dashes.
            print(f"Still needed ({label}): {', '.join(missing)} - placeholders in use")
    print("\nGroup sprites (Two Orcs, Ten Footmen...) are composed at runtime")
    print("from the single-unit art. They do not need their own files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
