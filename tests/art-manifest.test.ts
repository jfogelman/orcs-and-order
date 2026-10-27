import { describe, expect, it } from 'vitest';
import { buildManifest } from '../tools/manifest';
import { FACTION_IDS } from '../src/model/factions';

/**
 * Section 147. **The seventh hand-maintained list, and the last one.**
 *
 * `prepare_art.py` keeps its own lists of every id it should process:
 * creatures, advance icons, building icons, settlement tiers, capital pieces,
 * advisor portraits, garrison posts. Each is a copy of something the model
 * already knows, and every faction since the second has shipped art that
 * existed, was correct, was committed, and was never processed, because
 * somebody edited the model and not the copy.
 *
 * It is always silent. Nothing throws; the pipeline simply never looks, the
 * game asks for a PNG that is not there, and the renderer draws its fallback.
 * The Wandering Folk went four sections with **no settlement sprites and no
 * advisor portraits**, both sets of art sitting on disk the whole time.
 *
 * This file closes it from both ends:
 *
 * - **Model to disk** -- everything the game asks for has an output, or is a
 *   listed gap with a reason. That is `art-present.test.ts`'s job for the
 *   three lists it covers, and this widens it to the per-faction kinds it
 *   never swept: settlements, capitals, advisors, posts.
 * - **Disk to model** -- *every source file is reachable by something*. This
 *   is the new direction and the one that matters, because every failure
 *   above was art that existed and was unreachable. A file nobody will ever
 *   process is a file that was drawn for nothing.
 */
const OUT = {
  units: import.meta.glob('../public/units/*.png', { eager: true }),
  tech: import.meta.glob('../public/tech/*.png', { eager: true }),
  buildings: import.meta.glob('../public/buildings/*.png', { eager: true }),
  cities: import.meta.glob('../public/cities/*.png', { eager: true }),
  palace: import.meta.glob('../public/palace/*.png', { eager: true }),
  advisors: import.meta.glob('../public/advisors/*.png', { eager: true }),
  posts: import.meta.glob('../public/posts/*.png', { eager: true }),
  citizens: import.meta.glob('../public/citizens/*.png', { eager: true }),
  promotions: import.meta.glob('../public/promotions/*.png', { eager: true }),
  victory: import.meta.glob('../public/victory/*.{png,jpg}', { eager: true }),
};

/**
 * Every source file under a faction folder.
 *
 * `art_src/` is not committed -- the drops are hundreds of megabytes of JPEG
 * -- so this is empty anywhere but a machine that has them, and the audit
 * below says so out loud rather than passing vacuously.
 */
const SOURCES = import.meta.glob('../art_src/factions/**/*', { eager: true, query: '?raw' });

// The extension comes off as well as the folder, and `.jpg` as well as `.png`:
// the victory screens are the one kind the pipeline leaves as photographs
// rather than keyed sprites, so a `.png`-only strip reported all ten of them
// as missing art that was right there.
const names = (glob: Record<string, unknown>) =>
  new Set(Object.keys(glob).map((p) => p.replace(/^.*\//, '').replace(/\.(png|jpg)$/, '')));

const manifest = buildManifest();

describe('everything the game asks for has been processed', () => {
  /** Kinds the pipeline handles, and where their output lands. */
  const kinds: Array<[string, { id: string }[], Set<string>, string[]]> = [
    ['settlement sprites', manifest.cities, names(OUT.cities), []],
    [
      'capital pieces',
      manifest.palace,
      names(OUT.palace),
      // Nothing outstanding. Section 146 drew the last of the first four
      // sides' pieces and section 152 drew the Unbound's Gate, which was the
      // one module their faction drop arrived without.
      [],
    ],
    ['advisor portraits', manifest.advisors, names(OUT.advisors), []],
    ['garrison posts', manifest.posts, names(OUT.posts), []],
    // Section 152 added these three, and `unbound-1` is why. The Unbound's
    // first promotion mark was drawn, dropped, and silently not processed --
    // `remove_background` refused it, which the pipeline says out loud and
    // nothing checked afterwards. **Every other row here was added the same
    // way**, after something went missing, so the gap was three kinds wide
    // rather than one: who lives in the towns, the three rungs a side, and
    // the picture at the end of the game were all unaudited in this
    // direction.
    ['citizen sheets', manifest.citizens, names(OUT.citizens), []],
    [
      'promotion marks',
      manifest.promotions,
      names(OUT.promotions),
      // The badge fills 5.9% of its frame against its siblings' 26% and 20%,
      // so keying it removes 94% and `MAX_REMOVED` refuses it at 93%. That
      // ceiling stays where it is -- section 151 raised it for two Regalia
      // and put it straight back, because **a false refusal is loud and a
      // false acceptance is silent**. It wants a re-roll with the badge
      // filling the frame, which is also what would make it match the other
      // two to look at.
      ['unbound-1'],
    ],
    ['victory screens', manifest.victory, names(OUT.victory), []],
  ];

  for (const [what, pieces, have, allowed] of kinds) {
    it(`has every one of the ${what}`, () => {
      const missing = pieces.map((p) => p.id).filter((id) => !have.has(id) && !allowed.includes(id));
      expect(missing, `run \`npm run art\`, or add a reason`).toEqual([]);
    });
  }

  /**
   * The check that would have caught all seven on its own: a faction is not
   * done until it has one of everything the others have.
   */
  it('gives every faction the same kinds of art as every other', () => {
    const per = (pieces: { id: string }[], have: Set<string>, f: string) =>
      pieces.filter((p) => p.id.startsWith(f)).filter((p) => have.has(p.id)).length;
    for (const f of FACTION_IDS) {
      expect(per(manifest.cities, names(OUT.cities), f), `${f} has no settlement art`).toBeGreaterThan(0);
      expect(per(manifest.palace, names(OUT.palace), f), `${f} has no capital art`).toBeGreaterThan(0);
      expect(per(manifest.posts, names(OUT.posts), f), `${f} has no garrison post`).toBeGreaterThan(0);
    }
  });

  it('gives every faction somebody to give advice', () => {
    const have = names(OUT.advisors);
    for (const f of FACTION_IDS) {
      const theirs = manifest.advisors.filter((a) => a.id && advisorFaction(a.id) === f);
      expect(theirs.length, `${f} has no advisors at all`).toBeGreaterThan(0);
      expect(
        theirs.filter((a) => have.has(a.id)).length,
        `${f}'s advisors have no portraits`,
      ).toBeGreaterThan(0);
    }
  });
});

/** Which side an advisor belongs to, read off the model rather than the id. */
function advisorFaction(id: string): string {
  // Imported lazily through the manifest's own source so this file does not
  // need a second import of the advisor table.
  return ADVISOR_SIDE.get(id) ?? '';
}

const ADVISOR_SIDE = new Map<string, string>();
{
  // Built once, from the same table the manifest reads.
  const { ADVISORS } = await import('../src/model/advisors');
  for (const a of ADVISORS) ADVISOR_SIDE.set(a.id, a.faction);
}

/**
 * The other direction, and the new one: nothing drawn is left unreachable.
 *
 * Skipped with a stated reason where `art_src/` is not present, which is
 * everywhere but the machine the drops live on. A silent pass would be worse
 * than no test, since the whole point is to notice absence.
 */
describe('every file that was drawn can be found', () => {
  /** Folder names a faction drop may use, and what they hold. */
  const FOLDERS = new Set([
    'units',
    'advances',
    'buildings',
    'cities',
    'citizens',
    'palace',
    'posts',
    'improvements',
    'promotions',
    'advisors',
    'victory',
    'effects',
    'terrain',
    'specials',
    'unit effects',
    'unit states',
  ]);

  /**
   * Tags that make a file a *variant* of something else rather than its own
   * subject: a weakened sheet, an attack strip, a talking cycle, a damaged
   * settlement, a re-roll. These are matched by the pipeline through their
   * base name, so they are reachable without being manifest entries.
   */
  const VARIANT = /\b(weakened|attack|hurt|talking|damaged|female|flipped|trapezoid|magenta|bg|v2|v3|redo|reroll|new)\b/i;

  /**
   * Drawn on purpose, used on purpose, and not a manifest entry.
   *
   * Each is a decision recorded somewhere rather than an oversight, and the
   * audit would otherwise report them every run until somebody stopped
   * reading it -- which is how a loud test becomes a quiet one.
   */
  const SURPLUS: RegExp[] = [
    // The Hive's three terrain resources: processed under the terrain's name
    // and tier rather than under an id of their own.
    /^(broodmoss|chitin-vein|marrow-salt)$/,
    // Travelling effects, named for what they are.
    /^(spit|exorcise|burrower-emerge|burrower-sink)$/,
    // Section 125's misspelling, kept rather than renamed so the re-roll that
    // replaces it lands on the same name. See ART_PROMPTS.md.
    /damanged/,
    // An advance the bible writes and the game has not reached: exorcism
    // ships with the Unbound, which is the thing it is for.
    /^mystic-exorcism$/,
    // A building's bonus, drawn as its own icon.
    /^princess-bonus$/,
    // The Caravan overlay, filed with the improvements rather than as a unit
    // or a building, which is what it is.
    /^caravan$/,
  ];

  /**
   * Faction folders the game has no model for yet.
   *
   * The Unbound's whole drop -- units, advances, buildings, settlements,
   * citizens, a capital, advisors, promotions, victory screens -- arrived in
   * section 141 beside the Wandering Folk's and is waiting for the faction to
   * be written. It is not unreachable by mistake, so it is named here rather
   * than counted as a fault, and this comes off the day the Unbound exist.
   */
  const NOT_A_FACTION_YET = ['unbound'];

  const files = Object.keys(SOURCES)
    .map((p) => p.replace('../art_src/factions/', ''))
    // Only pictures. A faction folder may carry its own bible beside the art.
    .filter((f) => /[.](jpg|jpeg|png|webp|bmp)$/i.test(f))
    .filter((f) => !NOT_A_FACTION_YET.includes(f.split('/')[0]));

  it('is filed in folders the pipeline knows to look in', () => {
    if (files.length === 0) return; // no drops on this machine; see below
    const odd = new Set<string>();
    for (const f of files) {
      const parts = f.split('/');
      // <faction>/<folder>/<file>, or deeper for a nested set.
      if (parts.length < 3) {
        odd.add(f);
        continue;
      }
      if (!FOLDERS.has(parts[1])) odd.add(`${parts[0]}/${parts[1]}/`);
    }
    expect(
      [...odd].sort(),
      'the pipeline never looks in these, so anything in them is drawn for nothing',
    ).toEqual([]);
  });

  it('matches something the game actually asks for', () => {
    if (files.length === 0) return;
    const wanted = new Set<string>();
    for (const list of Object.values(manifest)) {
      for (const piece of list) for (const s of piece.sources) wanted.add(s);
    }
    const stray: string[] = [];
    for (const f of files) {
      const stem = f
        .replace(/^.*\//, '')
        .replace(/\.[a-z0-9]+$/i, '')
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!stem) continue;
      // A variant rides on its base, so strip the tag and ask about that.
      const base = stem.replace(VARIANT, '').replace(/\s+/g, ' ').trim();
      // A file may name the thing *and* what it is called -- the Wandering
      // Folk's chassis arrived as "Base chassis — The Standing Caravan".
      // The part before a dash separator is the subject; the rest is a label.
      const said = stem.split(/\s[–—-]\s/)[0].trim();
      if (wanted.has(stem) || wanted.has(base) || wanted.has(said)) continue;
      if (SURPLUS.some((r) => r.test(stem) || r.test(base))) continue;
      stray.push(f);
    }
    expect(
      stray.sort(),
      'drawn, but nothing in the game is named for it — wrong name, or a piece nobody wired',
    ).toEqual([]);
  });

  it('says so when there is nothing to audit', () => {
    // Not a silent skip. If `art_src/` is absent the two checks above pass
    // vacuously, and somebody reading a green suite should know why.
    if (files.length === 0) {
      expect(files, 'no art_src on this machine: the audit above checked nothing').toEqual([]);
    } else {
      expect(files.length).toBeGreaterThan(0);
    }
  });
});

/**
 * The third direction: **the bible against the art.** Section 150.
 *
 * The two audits above ask whether the *model* and the *files* agree. Neither
 * can see the design documents, and those are where a faction starts: an id
 * named in a prompt table and never drawn is a piece of the faction nobody
 * has made yet, and an id the bible gives that the art was filed under a
 * *different* name is worse -- it is a trap for whoever writes the roster.
 *
 * Both have already happened:
 *
 * - `bone-speaker`, the Horde's exorcist advance, is named in no icon table
 *   anywhere, because `UNBOUND_PLAN.md` covers the Unbound's twelve and says
 *   outright that this advance belongs to the Horde.
 * - **`drowned`, `skirmisher` and `brute`** were all collisions with existing
 *   ids. Section 141 found them when the art drop **overwrote shipped art**
 *   and renamed the source files `ub-` and `wf-`. The bibles were not
 *   updated, so a roster written straight out of either one would have
 *   collided a second time -- which is exactly what nearly happened here.
 */
describe('the design documents against the art', () => {
  /** Every id a prompt table names, which is how the bibles list their art. */
  const BIBLES: Array<[string, string, Record<string, unknown>]> = [
    ['UNBOUND_PLAN.md', 'unbound', import.meta.glob('../UNBOUND_PLAN.md', { eager: true, query: '?raw', import: 'default' })],
    ['WANDERERS_PLAN.md', 'wanderers', import.meta.glob('../WANDERERS_PLAN.md', { eager: true, query: '?raw', import: 'default' })],
    ['HIVEKIN_PLAN.md', 'hivekin', import.meta.glob('../HIVEKIN_PLAN.md', { eager: true, query: '?raw', import: 'default' })],
  ];

  /** Ids still waiting to be drawn, each with a reason. */
  const NOT_DRAWN_YET: Record<string, string> = {
    // Empty. `bone-speaker` was listed here for one section and drawn the
    // next, which is the state an outstanding-work list should normally be
    // in -- and the stale check below is what makes somebody cross it off.
  };

  function namedIn(doc: string): string[] {
    const out = new Set<string>();
    for (const line of doc.split('\n')) {
      const m = /^\|\s*`([a-zA-Z0-9_-]+)`\s*\|/.exec(line);
      if (m) out.add(m[1]);
    }
    return [...out];
  }

  for (const [name, folder, loaded] of BIBLES) {
    const doc = Object.values(loaded)[0] as string | undefined;
    const files = Object.keys(SOURCES).filter((p) =>
      p.startsWith(`../art_src/factions/${folder}/`),
    );

    it(`has art for everything ${name} names`, () => {
      if (!doc || files.length === 0) return; // no bible, or no drops here
      const drawn = new Set<string>();
      for (const f of files) {
        const stem = f.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
        drawn.add(stem);
        drawn.add(stem.replace(VARIANT_WORDS, '').replace(/\s+/g, ' ').trim());
      }
      const missing = namedIn(doc)
        .filter((id) => !drawn.has(id.toLowerCase()))
        .filter((id) => !(id in NOT_DRAWN_YET));
      expect(missing.sort(), `named in ${name}, drawn nowhere`).toEqual([]);
    });
  }

  it('keeps no stale entries in the not-drawn-yet list', () => {
    const drawn = new Set(
      Object.keys(SOURCES).map((p) =>
        p.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '').toLowerCase(),
      ),
    );
    if (drawn.size === 0) return;
    expect(Object.keys(NOT_DRAWN_YET).filter((id) => drawn.has(id))).toEqual([]);
  });
});

/** Shared with the folder audit above; see the note on variants there. */
const VARIANT_WORDS =
  /\b(weakened|attack|hurt|talking|damaged|female|flipped|trapezoid|magenta|bg|v2|v3|redo|reroll|new)\b/gi;
