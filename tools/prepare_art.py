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

import re
import subprocess
import sys
from collections import Counter, deque
from pathlib import Path

from PIL import Image, ImageStat

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

# Advance icons, keyed by tech id from src/model/techs.ts. Optional: the tech
# tree hides the icon and reads fine without it.
TECH_ICONS = [
    "mapmaking", "tree-hugging", "bridge-building", "wall-building",
    "tower-building", "not-you-again", "hammers-of-glory", "joy-making",
    "happiness", "insanity",
    "first-orc", "goblin-smarts", "suicidal-goblins", "underground-smarts",
    "orc-meaning", "to-be-an-orc",
    "axes", "axes-crazy", "throwing-buddies", "my-little-friend",
    "dead-messed-up", "full-of-fire",
    "first-human",
    "see-the-world", "archery", "pointed-ears", "arrows-glory",
    "horses-sneeze", "let-us-ride", "run-you-through", "rumbling-voice",
    "lordship",
]

# Building icons, keyed by id from src/model/buildings.ts. Optional, like
# advance icons: a missing one is simply left out.
BUILDING_ICONS = [
    "barracks", "granary", "walls", "catapult", "totem", "chapel",
    "treasury", "market", "thinkingRock", "scriptorium",
]

# Icons are read at a glance in a crowded tree, so they stay small.
ICON_SIZE = 48

# One animation frame. The renderer draws these over a 32px tile at 2x, so 64
# is native size -- large enough that a fireball is not a smudge, small enough
# that an eleven-effect set stays a few hundred KB.
EFFECT_SIZE = 64
# Composition happens at this size and is downscaled, so stamped copies keep
# their edges instead of turning to mush.
ICON_WORK_SIZE = 192

# Counting-ladder icons, built by stamping a single head N times rather than
# drawn. An image generator asked for "three orc heads" returns two or four --
# the same failure that made the group unit sprites unusable. One good head
# stamped three times is exactly three, every time, and it re-derives itself
# if that head is ever redrawn.
#
# These always win over a drawn file of the same name.
COMPOSED_ICONS = {
    "orc-together": ("first-orc", 2),
    "idiots-stick-together": ("first-orc", 3),
    "next-level-stupid": ("first-orc", 4),
    "beyond-stupid": ("first-orc", 6),
    "not-just-stupid": ("first-orc", 8),
    "stupidity-for-all": ("first-orc", 10),
    "brotherhood": ("first-human", 2),
    "join-army": ("first-human", 3),
    "bunches-footmen": ("first-human", 5),
    "ten-heads": ("first-human", 10),
}


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
    folder: str,
    names: list[str],
    force: bool,
    size: int = UNIT_SIZE,
    quiet_missing: bool = False,
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
            if not quiet_missing:
                missing.append(name)
            continue
        target = out / f"{name}.png"
        if target.exists() and not force and target.stat().st_mtime > path.stat().st_mtime:
            continue
        img = Image.open(path)
        img, cut_out = remove_background(img)
        img = trim_and_square(img, size)
        img.save(target, optimize=True)
        flag = "" if cut_out else "   <-- BACKGROUND NOT REMOVED, needs a re-roll"
        print(f"  {folder}/{name}.png  {target.stat().st_size // 1024}KB{flag}")
        if not cut_out:
            failed.append(name)
        done += 1
    return done, missing, failed


def cluster_layout(n: int) -> list[tuple[float, float]]:
    """
    Where each stamp sits, as a fraction of the icon, mirroring the layout the
    renderer uses for group unit sprites so the two read as the same idea.
    Rows come back to front, so drawing in order overlaps correctly.
    """
    if n <= 1:
        return [(0.0, 0.0)]
    per_row = 2 if n <= 4 else 3 if n <= 9 else 4
    rows: list[int] = []
    left = n
    while left > 0:
        take = min(per_row, left)
        rows.append(take)
        left -= take

    cell_w = 0.84 / per_row
    cell_h = 0.47 / len(rows) if len(rows) > 1 else 0.0
    out: list[tuple[float, float]] = []
    for r, count in enumerate(rows):
        y = (r - (len(rows) - 1) / 2) * cell_h
        for i in range(count):
            out.append(((i - (count - 1) / 2) * cell_w, y))
    return out


def compose_icons(force: bool) -> tuple[int, list[str]]:
    """Build the counting-ladder icons by stamping a single head N times."""
    src = SRC / "tech"
    out = OUT / "tech"
    out.mkdir(parents=True, exist_ok=True)
    done = 0
    missing: list[str] = []

    for target, (source_name, count) in COMPOSED_ICONS.items():
        path = find_source(src, source_name)
        if path is None:
            missing.append(f"{target} (needs {source_name})")
            continue
        dest = out / f"{target}.png"
        if dest.exists() and not force and dest.stat().st_mtime > path.stat().st_mtime:
            continue

        head, cut_out = remove_background(Image.open(path))
        if not cut_out:
            missing.append(f"{target} (could not cut out {source_name})")
            continue
        bbox = head.getbbox()
        if bbox:
            head = head.crop(bbox)

        scale = max(0.42, 1.05 / (count ** 0.38))
        stamp_w = max(1, int(ICON_WORK_SIZE * scale))
        stamp = head.resize(
            (stamp_w, max(1, round(head.height * stamp_w / head.width))), Image.LANCZOS
        )
        flipped = stamp.transpose(Image.FLIP_LEFT_RIGHT)

        canvas = Image.new("RGBA", (ICON_WORK_SIZE, ICON_WORK_SIZE), (0, 0, 0, 0))
        for i, (nx, ny) in enumerate(cluster_layout(count)):
            piece = flipped if i % 2 else stamp
            x = round(ICON_WORK_SIZE / 2 + nx * ICON_WORK_SIZE - piece.width / 2)
            y = round(ICON_WORK_SIZE / 2 + ny * ICON_WORK_SIZE - piece.height / 2)
            canvas.alpha_composite(piece, (x, y))

        trimmed = canvas.crop(canvas.getbbox() or (0, 0, ICON_WORK_SIZE, ICON_WORK_SIZE))
        trim_and_square(trimmed, ICON_SIZE).save(dest, optimize=True)
        print(f"  tech/{target}.png  composed from {source_name} x{count}")
        done += 1
    return done, missing


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
            if not quiet_missing:
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
        variants = [
            sheet.crop((ox, oy, ox + cw, oy + ch)).resize(
                (TERRAIN_SIZE, TERRAIN_SIZE), Image.LANCZOS
            )
            for ox, oy in offsets
        ]

        # Match the variants' average colour to each other. Different parts of
        # a sheet are lit slightly differently, and once those crops are tiled
        # across a map at random the difference reads as pale and dark patches
        # in a chequered pattern - the exact "stamped" look the variants exist
        # to avoid.
        means = [ImageStat.Stat(v).mean[:3] for v in variants]
        target = [sum(m[c] for m in means) / len(means) for c in range(3)]
        for i, (tile, mean) in enumerate(zip(variants, means)):
            channels = list(tile.split())[:3]
            for c in range(3):
                gain = target[c] / max(1e-6, mean[c])
                channels[c] = channels[c].point(
                    lambda value, gain=gain: min(255, int(value * gain))
                )
            Image.merge("RGB", channels).save(out / f"{name}_{i}.png", optimize=True)
        print(f"  terrain/{name}_[0-{TERRAIN_VARIANTS - 1}].png")
        done += 1
    return done, missing


def clear_panel_borders(strip: Image.Image, frames: int) -> None:
    """
    Rub out the white rules some strips draw between their frames.

    A generator asked for a row of frames often returns them as separate panels
    with a hairline border, and that border is not the background colour, so
    keying leaves it behind -- every animation then plays inside a visible box.

    Only lines sitting on a panel edge are considered, and only if they run
    almost the full span. That is what separates a divider from artwork: an
    effect can easily be a solid vertical bar somewhere, but not one that
    happens to be exactly on a frame boundary and reaches both ends of it.
    """
    w, h = strip.size
    px = strip.load()
    span = w / frames
    edge = max(2, round(span * 0.02))

    def solid_column(x: int) -> bool:
        opaque = sum(1 for y in range(h) if px[x, y][3] > 200)
        return opaque > h * 0.85

    def solid_row(y: int) -> bool:
        opaque = sum(1 for x in range(w) if px[x, y][3] > 200)
        return opaque > w * 0.85

    for i in range(frames + 1):
        centre = round(i * span)
        for x in range(max(0, centre - edge), min(w, centre + edge + 1)):
            if solid_column(x):
                for y in range(h):
                    px[x, y] = (0, 0, 0, 0)

    band = max(2, round(h * 0.02))
    for y in list(range(0, band)) + list(range(h - band, h)):
        if solid_row(y):
            for x in range(w):
                px[x, y] = (0, 0, 0, 0)


def process_effects(force: bool) -> tuple[int, list[str]]:
    """
    Effect art arrives as a horizontal strip of animation frames on magenta.

    Nothing declares how many frames a strip holds, and asking would mean
    maintaining a table that has to be edited every time a file is re-rolled.
    The frames are square, so the strip's own proportions say it: a 2064x512
    sheet is four frames across, a 2544x416 one is six. Round the ratio and
    that is the count.

    The whole strip is keyed in one pass rather than frame by frame, so every
    frame ends up with the same background decision -- a frame that happens to
    be nearly all fire would otherwise be read as having a different background
    from its neighbours and come out cut differently.

    Frames are never trimmed or re-centred, which the unit pipeline does and
    this one must not: trimming each frame to its own content would re-centre
    an expanding fireball on itself every frame, and the explosion would sit
    still while merely getting bigger.
    """
    src = SRC / "effects"
    out = OUT / "effects"
    if not src.is_dir():
        return 0, []
    out.mkdir(parents=True, exist_ok=True)

    # A generator asked for "6 frames" names the file that way, so the count
    # lives in the filename as often as not. It is not needed -- the ratio
    # already says it -- so drop it, and let the better version of a duplicate
    # win rather than whichever happened to sort last.
    best: dict[str, tuple[int, Path, int, int]] = {}
    for path in sorted(src.iterdir()):
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        name = re.sub(r"\s*\([^)]*\)", "", path.stem).strip().lower()
        name = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
        with Image.open(path) as probe:
            w, h = probe.size
        frames = max(1, round(w / h))
        if name not in best or frames > best[name][0]:
            best[name] = (frames, path, w, h)

    done = 0
    failed: list[str] = []
    for name, (frames, path, w, h) in sorted(best.items()):
        target = out / f"{name}.png"
        if target.exists() and not force and target.stat().st_mtime > path.stat().st_mtime:
            continue

        strip, cut_out = remove_background(Image.open(path))
        if not cut_out:
            failed.append(name)
            continue

        # Slice from the keyed strip's own width: crop_letterbox may have taken
        # a bar off, and the frames divide whatever is actually left.
        kw, kh = strip.size
        clear_panel_borders(strip, frames)
        sheet = Image.new("RGBA", (frames * EFFECT_SIZE, EFFECT_SIZE), (0, 0, 0, 0))
        for i in range(frames):
            left = round(i * kw / frames)
            right = round((i + 1) * kw / frames)
            frame = strip.crop((left, 0, right, kh)).resize(
                (EFFECT_SIZE, EFFECT_SIZE), Image.LANCZOS
            )
            sheet.paste(frame, (i * EFFECT_SIZE, 0), frame)
        sheet.save(target, optimize=True)
        print(f"  effects/{name}.png ({frames} frames from {w}x{h})")
        done += 1
    return done, failed


def process_unit_effects(force: bool) -> tuple[int, list[str], list[str]]:
    """
    Per-creature attack animations, sliced the same way the effect strips are.

    Output is one strip per creature at `units/<id>_attack.png`, so the renderer
    can find it from a unit's base creature and recover the frame count by
    dividing the strip's width by its height -- the same contract the effects
    use, and no table to keep in step.

    The vertical crop is taken once across the whole strip rather than per
    frame. Trimming each frame to its own content would re-centre a creature on
    itself every frame, so a lunging orc would appear to stand still while
    changing shape. Horizontal extent is left exactly as drawn, which is what
    carries the lunge.
    """
    src = SRC / "unit effects"
    if not src.is_dir():
        src = SRC / "unit_effects"
    out = OUT / "units"
    if not src.is_dir():
        return 0, [], []
    out.mkdir(parents=True, exist_ok=True)

    known = {c for c in CREATURES}
    # A re-roll usually keeps the old file beside it, tagged in parentheses
    # ("(green bg)"). Prefer whichever holds more frames, and on a tie the one
    # generated most recently -- a second attempt supersedes the first.
    best: dict[str, tuple[int, Path, int, int]] = {}
    unknown: list[str] = []
    for path in sorted(src.iterdir()):
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        name = re.sub(r"\s*\([^)]*\)", "", path.stem).strip().lower()
        name = re.sub(r"\s*attack$", "", name).strip()
        name = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
        if name not in known:
            unknown.append(f"{path.name} -> '{name}'")
            continue
        with Image.open(path) as probe:
            w, h = probe.size
        frames = max(1, round(w / h))
        prev = best.get(name)
        if prev is None or (frames, path.stat().st_mtime) > (prev[0], prev[1].stat().st_mtime):
            best[name] = (frames, path, w, h)

    done = 0
    problems: list[str] = []
    for name, (frames, path, w, h) in sorted(best.items()):
        if frames < 2:
            problems.append(f"{name}: {w}x{h} is a single square image, not a strip")
            continue
        target = out / f"{name}_attack.png"
        if target.exists() and not force and target.stat().st_mtime > path.stat().st_mtime:
            continue

        strip, cut_out = remove_background(Image.open(path))
        if not cut_out:
            problems.append(f"{name}: background would not key")
            continue
        clear_panel_borders(strip, frames)

        bbox = strip.getbbox()
        if bbox is None:
            problems.append(f"{name}: nothing left after keying")
            continue
        # One vertical window for every frame, so the creature keeps its footing.
        top, bottom = bbox[1], bbox[3]
        kw = strip.size[0]
        sheet = Image.new("RGBA", (frames * UNIT_SIZE, UNIT_SIZE), (0, 0, 0, 0))
        for i in range(frames):
            left = round(i * kw / frames)
            right = round((i + 1) * kw / frames)
            frame = strip.crop((left, top, right, bottom)).resize(
                (UNIT_SIZE, UNIT_SIZE), Image.LANCZOS
            )
            sheet.paste(frame, (i * UNIT_SIZE, 0), frame)
        sheet.save(target, optimize=True)
        print(f"  units/{name}_attack.png ({frames} frames from {w}x{h})")
        done += 1

    missing = sorted(known - set(best))
    return done, problems + [f"no animation for {m}" for m in missing], unknown


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
    # Audio counts too. `public/` is gitignored build output, so a sound file
    # left there is one clean checkout away from being gone for good.
    adoptable = {".jpg", ".jpeg", ".webp", ".bmp", ".mp3", ".ogg", ".wav", ".m4a"}
    for path in sorted(OUT.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in adoptable:
            continue
        target = SRC / path.relative_to(OUT)
        # Never adopt over an existing source. Audio keeps the same name and
        # extension on both sides, so without this the compressed output would
        # be copied back over its own original and re-encoded from a lossy copy
        # on every subsequent run.
        if target.exists():
            continue
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
    print("Advance icons:")
    icons, missing_icons, failed_icons = process_cutouts(
        "tech", TECH_ICONS, force, size=ICON_SIZE, quiet_missing=True
    )
    print("Building icons:")
    bicons, missing_bicons, failed_bicons = process_cutouts(
        "buildings", BUILDING_ICONS, force, size=ICON_SIZE, quiet_missing=True
    )
    icons += bicons
    missing_icons.extend(missing_bicons)
    failed_icons.extend(failed_bicons)
    composed, missing_composed = compose_icons(force)
    icons += composed
    missing_icons.extend(missing_composed)
    print("Terrain:")
    terrain, missing_terrain = process_terrain(force)
    print("Effects:")
    effects, failed_effects = process_effects(force)
    print("Unit attack animations:")
    anims, anim_problems, anim_unknown = process_unit_effects(force)
    audio, audio_before, audio_after = process_audio()

    print(
        f"\n{units} unit sprites, {cities} city sprites, {icons} advance icons, "
        f"{terrain} terrain sets, {effects} effect strips, {anims} attack animations, "
        f"{audio} audio files "
        f"({audio_before // 1024}KB -> {audio_after // 1024}KB)."
    )
    for label, missing in (
        ("units", missing_units),
        ("cities", missing_cities),
        ("advance icons", missing_icons),
        ("terrain", missing_terrain),
    ):
        if missing:
            # Plain ASCII: the Windows console default codepage cannot print dashes.
            print(f"Still needed ({label}): {', '.join(missing)} - placeholders in use")
    for label, items in (("unusable", anim_problems), ("unrecognised", anim_unknown)):
        if items:
            print(f"Attack animations {label}:")
            for item in items:
                print(f"  {item}")
    print("\nGroup sprites (Two Orcs, Ten Footmen...) are composed at runtime")
    print("from the single-unit art. They do not need their own files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
