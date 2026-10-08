import { describe, expect, it } from 'vitest';
import { TERRAIN, TERRAIN_IDS } from '../src/model/terrain';

/**
 * Art that exists in `art_src/` but was never run through the pipeline is art
 * the game does not have.
 *
 * Section 125 dropped three Hivekin specials into `art_src/factions/hivekin/
 * terrain/` and the pipeline already knew how to map them -- and nobody ran it,
 * so Broodmoss, the Chitin Vein and Marrow Salt drew the fallback diamond on
 * the map and showed a broken icon in the Orcpedia for a fortnight. Nothing
 * failed; there was simply nothing to fail.
 *
 * `public/` is committed deliberately (see `.gitignore`), so the files are
 * right here to be counted. Listed through Vite rather than `fs` because this
 * project does not install `@types/node`.
 */
const SPECIAL_ART = import.meta.glob('../public/specials/*.png', { eager: true });

/** The file the renderer and the Orcpedia both ask for, for one special. */
function artKey(id: string, index: number): string {
  return index === 0 ? id : `${id}_${index + 1}`;
}

describe('every land special has been through the art pipeline', () => {
  const have = new Set(
    Object.keys(SPECIAL_ART).map((p) => p.replace(/^.*\//, '').replace(/\.png$/, '')),
  );

  it('has a file for each one the model offers', () => {
    const missing: string[] = [];
    for (const id of TERRAIN_IDS) {
      TERRAIN[id].specials.forEach((special, n) => {
        const key = artKey(id, n);
        // The first special of a terrain is allowed either name, which is the
        // fallback the renderer and the Orcpedia both already honour.
        const ok = have.has(key) || (n === 0 && have.has(`${id}_1`));
        if (!ok) missing.push(`${special.name} (${key}.png)`);
      });
    }
    expect(missing, 'run `npm run art`').toEqual([]);
  });

  it('includes the three the Hivekin brought', () => {
    // Named rather than counted, because these are the ones that went missing
    // and the test exists to say so out loud.
    for (const key of ['grass_3', 'hills_2', 'mountains_2']) {
      expect(have.has(key), `${key}.png`).toBe(true);
    }
  });
});
