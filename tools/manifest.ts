import { CREATURES } from '../src/model/units';
import { TECHS } from '../src/model/techs';
import { BUILDINGS } from '../src/model/buildings';
import { FACTIONS, FACTION_IDS } from '../src/model/factions';
import { ADVISORS } from '../src/model/advisors';
import { PALACE_MODULES, PALACE_TIERS, palaceArt } from '../src/model/palace';
import { CITIZEN_RACES } from '../src/model/citizens';

/**
 * What the game asks the art pipeline for, read off the model.
 *
 * **This file exists because the same mistake has now been made seven times.**
 * `prepare_art.py` kept its own hand-written lists of every id it should
 * process -- creatures, advance icons, building icons, settlement tiers,
 * capital pieces, advisor portraits, garrison posts -- and each one was a copy
 * of something the TypeScript model already knew. Every faction since the
 * second has shipped with art that existed, was correct, was committed, and
 * was never processed, because somebody edited the model and not the copy.
 *
 * The failure is always silent. Nothing throws: the file is simply not there
 * as far as the pipeline is concerned, the game asks for a PNG that does not
 * exist, and the renderer draws its fallback. The Wandering Folk shipped with
 * **no settlement sprites and no advisor portraits at all** for four sections
 * on exactly that basis, with both sets of art sitting on disk the whole time.
 *
 * So the lists are generated now, and `npm run art` regenerates them before it
 * runs. `tests/art-manifest.test.ts` fails if what is committed has drifted
 * from the model, so a stale manifest is loud rather than invisible.
 *
 * **What this cannot do** is invent the name somebody saved a file under. A
 * piece carries a list of `sources` instead: every name it might reasonably
 * have arrived as, derived rather than typed -- its id, its name in the game,
 * the tier it stands for. The pipeline tries them in order. That is what
 * replaces most of the aliasing, and what is left is genuinely arbitrary.
 */
export interface ArtPiece {
  /** The name the game asks for, without extension. */
  id: string;
  /** Names the source file might carry, best first. */
  sources: string[];
}

export interface ArtManifest {
  creatures: ArtPiece[];
  techIcons: ArtPiece[];
  buildingIcons: ArtPiece[];
  cities: ArtPiece[];
  palace: ArtPiece[];
  advisors: ArtPiece[];
  advisorsTalking: ArtPiece[];
  posts: ArtPiece[];
  citizens: ArtPiece[];
  promotions: ArtPiece[];
  victory: ArtPiece[];
}

/** Candidate source names for a piece, deduplicated and lower-cased. */
function sources(...names: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const n of names) {
    if (!n) continue;
    const key = n.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key) seen.add(key);
  }
  return [...seen];
}

export function buildManifest(): ArtManifest {
  return {
    // Every creature in the game, which is the list `CREATURES` in the Python
    // was a copy of. Group variants are composed at runtime from the base, so
    // only the bases are art.
    creatures: CREATURES.map((c) => ({ id: c.id, sources: sources(c.id, c.name) })),

    techIcons: TECHS.map((t) => ({ id: t.id, sources: sources(t.id, t.name) })),

    buildingIcons: Object.values(BUILDINGS).map((b) => ({
      id: b.id,
      sources: sources(b.id, b.name),
    })),

    // Three size tiers a side. The source convention is `<faction>-tier<n>`
    // for the factions that arrived as a folder and `<faction>_<tier>` for the
    // two that were filed limb by limb, so both are offered.
    cities: FACTION_IDS.flatMap((f) =>
      [1, 4, 8].map((tier, n) => ({
        id: `${f}_${tier}`,
        sources: sources(`${f}_${tier}`, `${f}-tier${n + 1}`, `hive-tier${n + 1}`.replace('hive', f === 'hivekin' ? 'hive' : f)),
      })),
    ),

    // The capital, every module at every tier plus the base chassis. The
    // source name is the **tier's name**, which the model holds -- so this is
    // the one list that was pure duplication and is now pure derivation.
    palace: FACTION_IDS.flatMap((f) => [
      { id: `${f}-base`, sources: sources(`${f}-base`, 'base chassis') },
      ...PALACE_MODULES.flatMap((m) =>
        Array.from({ length: PALACE_TIERS }, (_, i) => ({
          id: palaceArt(f, m.id, i + 1),
          sources: sources(palaceArt(f, m.id, i + 1), m.tiers[f]?.[i]),
        })),
      ),
    ]),

    advisors: ADVISORS.map((a) => ({ id: a.id, sources: sources(a.id, a.name) })),
    advisorsTalking: ADVISORS.map((a) => ({
      id: a.id,
      sources: sources(`${a.id} talking`, `${a.name} talking`),
    })),

    // Section 102's huts, one a side, named for the faction id.
    posts: FACTION_IDS.map((f) => ({ id: f, sources: sources(f, FACTIONS[f].name) })),

    // Who lives in the towns. A sort with women of its own has a second sheet
    // filed under `female <id>`, which the audit treats as a variant.
    citizens: CITIZEN_RACES.map((r) => ({ id: r.id, sources: sources(r.id, r.name) })),

    // Three rungs a side, named for the faction and the rank.
    promotions: FACTION_IDS.flatMap((f) =>
      [1, 2, 3].map((rank) => ({ id: `${f}-${rank}`, sources: sources(`${f}-${rank}`) })),
    ),

    // The end screens: one a side for each of the two ordinary roads out.
    victory: FACTION_IDS.flatMap((f) =>
      ['conquest', 'points'].map((kind) => ({
        id: `${kind}-${f}`,
        sources: sources(`${kind}-${f}`),
      })),
    ),
  };
}
