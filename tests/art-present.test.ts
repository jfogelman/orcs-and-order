import { describe, expect, it } from 'vitest';
import { TERRAIN, TERRAIN_IDS } from '../src/model/terrain';
import { TECHS } from '../src/model/techs';
import { CREATURES, UNIT_TYPES } from '../src/model/units';
import { UPGRADE_DEFS } from '../src/model/upgrades';
import { BUILDINGS } from '../src/model/buildings';
import { FACTION_IDS } from '../src/model/factions';

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

/**
 * Art the model asks for and the pipeline has not made.
 *
 * Asked for after two of the Hivekin's advances turned out to have no icon and
 * nobody noticed until somebody opened the tree and looked. That is the same
 * failure as the three Hivekin specials above: **nothing breaks**. A missing
 * advance icon is quietly dropped from the card, a missing building icon from
 * the city screen, and the game goes on looking almost right.
 *
 * So this is a control rather than a bar: every id the model offers must have
 * a picture, *except* the ones listed here as known gaps, each with a reason.
 * Adding an advance or a unit without art fails loudly; the list shrinks as art
 * lands, and reading it tells you what is outstanding without running anything.
 */
const TECH_ART = import.meta.glob('../public/tech/*.png', { eager: true });
const UNIT_ART = import.meta.glob('../public/units/*.png', { eager: true });
const BUILDING_ART = import.meta.glob('../public/buildings/*.png', { eager: true });

const names = (glob: Record<string, unknown>) =>
  new Set(Object.keys(glob).map((p) => p.replace(/^.*\//, '').replace(/\.png$/, '')));

/** Known gaps, with the reason each one is allowed to be a gap. */
const NOT_DRAWN_YET = {
  // Empty, and worth leaving here rather than deleting: the Hive's two
  // counting rungs were listed when this test was written and drawn an hour
  // later, and the entry below caught them still being listed. An empty list
  // is the state this should normally be in.
  // Empty, and left here rather than deleted: an empty list is the state
  // this should normally be in, and the stale-entry check below is what
  // brings somebody back to cross an item off.
  // Empty again, which is the state this should normally be in. Section 152
  // listed `tier-drowned` and `tier-cairn` here for about an hour, which is
  // roughly how long the entries below have historically lasted.
  advances: [] as string[],
  /**
   * Section 155 slice 2 set this **true**: the upgrade art was drawn, and
   * `prepare_art.py` had never heard of the folder it was in, so all
   * thirty-six advance icons were missing for a reason that was nobody's
   * fault and nothing's bug.
   *
   * Slice 3 wired the folder up and the icons landed, and **the check below
   * is what said so** -- it failed naming all thirty-six the moment they
   * appeared, which is exactly what a known-gap list is supposed to do when
   * the gap closes. False now, and the upgrade advances are held to the same
   * rule as every other advance in the game.
   *
   * Left here rather than deleted. The next drop is the three newer factions'
   * upgrades, whose advances do not exist yet, and this is where that gap
   * gets declared if it needs declaring.
   */
  upgradeAdvancesAwaitingThePipeline: false,
  buildings: [
    // Section 102 replaced both with a hut on a tile. `POSTING.enabled` is
    // false, so neither is offered in any city, and the definitions are kept
    // only so a sweep can hold an arm with them. Art for a building nobody can
    // build would be art nobody can see.
    'orcPosting',
    'soldierPosting',
  ],
};

describe('everything the model offers has a picture', () => {
  it('has an icon for every advance', () => {
    const have = names(TECH_ART);
    const missing = TECHS.filter(
      (t) =>
        !have.has(t.id) &&
        !NOT_DRAWN_YET.advances.includes(t.id) &&
        !(NOT_DRAWN_YET.upgradeAdvancesAwaitingThePipeline && t.flags.includes('upgrade')),
    ).map((t) => t.id);
    expect(missing, 'add the art, or add it to NOT_DRAWN_YET with a reason').toEqual([]);
  });

  it('has a sprite for every creature', () => {
    const have = names(UNIT_ART);
    const missing = CREATURES.map((c) => c.id).filter((id) => !have.has(id));
    expect(missing, 'add the art, or add it to NOT_DRAWN_YET with a reason').toEqual([]);
  });

  it('has an icon for every building a city can actually build', () => {
    const have = names(BUILDING_ART);
    const missing = Object.keys(BUILDINGS).filter(
      (id) => !have.has(id) && !NOT_DRAWN_YET.buildings.includes(id),
    );
    expect(missing, 'add the art, or add it to NOT_DRAWN_YET with a reason').toEqual([]);
  });

  /**
   * The list is a record of work outstanding, not a drawer to sweep things
   * into. An entry for something that *does* have art is a gap that was filled
   * and never crossed off, and the next person reading the list would believe
   * it.
   */
  it('keeps no stale entries in the known-gap list', () => {
    const drawn = [
      ...NOT_DRAWN_YET.advances.filter((id) => names(TECH_ART).has(id)),
      ...NOT_DRAWN_YET.buildings.filter((id) => names(BUILDING_ART).has(id)),
      // The blanket exemption is a gap too, and goes stale the same way: the
      // moment `prepare_art.py` learns about `art_src/unit upgrades/`, these
      // icons appear and the rule above stops being honest.
      ...(NOT_DRAWN_YET.upgradeAdvancesAwaitingThePipeline
        ? TECHS.filter((t) => t.flags.includes('upgrade') && names(TECH_ART).has(t.id)).map(
            (t) => t.id,
          )
        : []),
    ];
    expect(drawn, 'these have art now and should come off the list').toEqual([]);
  });
});

/**
 * Section 155's upgrades, and the three sheets each of them wants.
 *
 * The idle sprite is a bar: the renderer asks for `units/<base>-<variant>.png`
 * for a unit wearing an upgrade, and without one it falls back to the plain
 * creature -- which looks exactly like the upgrade not working.
 *
 * The attack strip and the weakened sheet are **controls with a count**,
 * because both fall back harmlessly and neither can therefore break anything.
 * Slice 3 shipped with seven and nine of them missing and the only record of
 * that was a line in a markdown file. This is the number, in the suite, where
 * it is read every run rather than when somebody opens the file.
 */
const UPGRADE_SHEETS = { attack: 36, hurt: 36 };

describe('every upgrade has been through the art pipeline', () => {
  const have = names(UNIT_ART);

  it('has an idle sprite for each of the thirty-six', () => {
    const missing = UPGRADE_DEFS.map((u) => u.id).filter((id) => !have.has(id));
    expect(missing, 'run `npm run art`').toEqual([]);
  });

  it('has the attack strips and weakened sheets it says it has', () => {
    // Named rather than counted when they are short, so the failure says which.
    const attack = UPGRADE_DEFS.filter((u) => !have.has(`${u.id}_attack`)).map((u) => u.id);
    const hurt = UPGRADE_DEFS.filter((u) => !have.has(`${u.id}_hurt`)).map((u) => u.id);
    expect(36 - attack.length, `no attack strip: ${attack.join(', ')}`).toBe(UPGRADE_SHEETS.attack);
    expect(36 - hurt.length, `no weakened sheet: ${hurt.join(', ')}`).toBe(UPGRADE_SHEETS.hurt);
  });

  /**
   * The sprite name has to fall out of the id, because that is the whole
   * reason these are variants rather than thirty-six new creatures: the
   * renderer takes `ogre-brawler`, strips `ogre`, and asks for `-brawler`.
   * An id that did not start with its base would quietly load the wrong
   * creature's art rather than failing.
   */
  it('names each sprite so the renderer can take it apart again', () => {
    const wrong = UPGRADE_DEFS.filter((u) => !u.id.startsWith(`${UNIT_TYPES[u.base].base}-`)).map(
      (u) => u.id,
    );
    expect(wrong).toEqual([]);
  });
});

/**
 * Section 102's garrison posts, one a side.
 *
 * This is here because of the way the Hive's went missing, which is the most
 * expensive shape of all of them: **the file was there**. It was drawn in
 * section 125, committed, and shipped. `mapRenderer` looped over a
 * hand-written `['orc', 'human']` and never asked for it, so for eighteen
 * sections the Hive's posts drew the three-shape placeholder hut and the art
 * sat in `public/` being correct and unread. No test could fail: the picture
 * existed and the game was not broken, only wrong.
 *
 * The loop reads `FACTION_IDS` now, so the renderer side is structural. This
 * covers the other half -- that a side the picker offers has a post to draw --
 * and it is a control rather than a bar, for the same reason the list above is.
 */
const POST_ART = import.meta.glob('../public/posts/*.png', { eager: true });

/** Sides whose post is not drawn yet, each with its reason. */
const NO_POST_YET: string[] = [
  // Empty, and left here deliberately: the Wandering Folk's was listed when
  // this test was written and drawn the same afternoon, which is the state an
  // outstanding-work list should normally be in.
];

describe('every side has a garrison post', () => {
  const have = names(POST_ART);

  it('has a picture for each faction the game offers', () => {
    const missing = FACTION_IDS.filter((f) => !have.has(f) && !NO_POST_YET.includes(f));
    expect(missing, 'see Garrison posts in ART_PROMPTS.md').toEqual([]);
  });

  it('keeps no stale entries in the not-drawn-yet list', () => {
    expect(NO_POST_YET.filter((f) => have.has(f))).toEqual([]);
  });
});
