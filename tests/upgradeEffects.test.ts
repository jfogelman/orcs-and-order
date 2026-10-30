import { afterEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { UPGRADES, UPGRADE_DEFS } from '../src/model/upgrades';
import {
  DREAD,
  firstStrikesOf,
  GRINDER,
  SEASONED,
  VANGUARD,
  WARLORD,
  neighbours,
  upgradeAttack,
  upgradeDefence,
  upgradeMoves,
  upgradeReach,
} from '../src/sim/upgradeEffects';
import { attackStrength, defenseStrength, resolveCombat } from '../src/sim/combat';
import { unitReach } from '../src/sim/abilities';
import { unitType } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';

/**
 * Section 155 slice 5: what the thirty-six upgrades actually do.
 *
 * Slice 4 made a unit able to carry one and **every blurb still described an
 * effect no code produced**. This file is about closing that gap and, more
 * importantly, about *knowing how far it is still open* -- see the
 * completeness test, which is the reason this file exists at all.
 */

afterEach(() => {
  UPGRADES.enabled = false;
});

function game(): GameState {
  const state = createGame({
    seed: 155,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['human'],
    upgrades: true,
  });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  return state;
}

function put(state: GameState, owner: number, type: string, x: number, y: number, up?: string): Unit {
  const u = spawnUnit(state, owner, type as Parameters<typeof spawnUnit>[2], x, y, false);
  if (up) u.upgrade = up;
  return u;
}

/**
 * **The test this slice is really for.**
 *
 * Thirty-six upgrades each carry a sentence promising a player something. An
 * upgrade whose blurb promises an effect and whose code does nothing is a card
 * that lies, and **nothing else in this suite would ever fail because of it**
 * -- the unit builds, the sprite loads, the advance researches, the fee is
 * paid, and the thing simply does not happen.
 *
 * So every one of the thirty-six must be accounted for in exactly one of three
 * ways: it is data here, it is named in code somewhere under `src/`, or it is
 * declared unwired with a reason. The list below is a record of work
 * outstanding, in the suite rather than in a markdown file, and it shrinks.
 */
const UNWIRED: Record<string, string> = {
  // ---- the sapper's bundle. All three are rules inside `detonate()`, which
  // is its own small machine: a radius, a self-destruct and a risk roll.
  'sapper-tunnel': 'moving through impassable ground is a movement rule, not a combat one',
  'sapper-deep': 'detonation radius; `detonate()` has no radius at all today',
  'sapper-cadre': 'the paired-risk rule needs a notion of a pair, which nothing has',

  // ---- the axe, which leaves the hand. `disarmed`, `rearmIn` and the
  // first-strike throw are one mechanism and these three all edit it.
  'axethrower-twin': 'two throws needs a count where `disarmed` is a boolean',
  'axethrower-retriever': 'a chance at the start of a turn; `rearmIn` is a fixed countdown',
  'axethrower-heavy': 'ignoring a point of defence has to happen inside the throw, not the stack',

  // ---- the troll
  'troll-brute':
    '+2 HP needs a `maxHp(unit)` helper: `unitType(u.type).hp` is written out in about fifteen places and replacing them is a refactor, not an effect',
  'troll-regen': 'healing mid-combat means a heal inside the round loop, which has none',
  'troll-bonebreaker': 'a lasting debuff on the target wants a status, like `cowed`',

  // ---- the ogre
  'ogre-brawler': 'splash onto a bystander; the club blast is the nearest thing and is a perk',

  // ---- the Death Knight, and the whole raised-skeleton rule
  'deathknight-grave':
    'raising a skeleton is a new unit on the board with a lifespan; the art is drawn and the Unbound ruling is made, but the rule is its own slice',
  'deathknight-soulbound': 'depends entirely on the above existing first',

  // ---- the dragon
  'dragon-elder': 'breath damage plus a movement cost over enemy cities, which is two systems',
  'dragon-rider': 'carrying a passenger is the ship mechanism, for something that flies',
  'dragon-wyrm': 'the carry-through is in `breatheThrough`, and suppressing it is that rule inverted',

  // ---- the Kingdom's foot
  'footman-sergeant': 'ignoring the first point of damage belongs in `applyDamage`, per combat',

  // ---- the bow
  // ---- the bow, where the bible and the game turn out to disagree. **This
  // game's Archer has `range: 1`**; what makes it ranged is `firstStrikes: 1`.
  // So two of its three lines describe a mechanic that does not exist here,
  // and the third ports exactly.
  'archer-longbow':
    'the blurb says "range increases to 3" and the Archer has a range of 1, so +1 contradicts the card and a floor at 3 would out-range the Mage; a design call, not a wiring one',
  'archer-volley': 'firing past an intervening unit means nothing at range 1',

  // ---- the horse
  'knight-lance': 'first strike against cavalry needs a cavalry category; `isMounted` is close',

  // ---- the Paladin and the Mage, both of which edit what an ability costs
  'paladin-champion': 'heal granting defence wants the same lasting-buff machinery as the troll',
  'paladin-warden': 'an ability that does not cost the turn is a change to `abilities.ts`',
  'mage-battle': 'the same change, for the same reason, and they should land together',
  'mage-warden': 'reduced damage on a first strike needs the first strike to be distinguishable',
};

/** Every `.ts` file in the game, as text, so the test can see what names code uses. */
const SOURCE = import.meta.glob('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('every upgrade is accounted for', () => {
  /** Files that may *mention* an id without that counting as wiring it. */
  const DECLARATIONS = ['/src/model/upgrades.ts'];

  const namedInCode = (id: string): boolean =>
    Object.entries(SOURCE).some(
      ([path, text]) =>
        !DECLARATIONS.some((d) => path.replace(/\\/g, '/').endsWith(d)) && text.includes(`'${id}'`),
    );

  it('is data, or code, or declared unwired, and never none of the three', () => {
    const orphans = UPGRADE_DEFS.filter(
      (u) => !u.effect && !namedInCode(u.id) && UNWIRED[u.id] === undefined,
    ).map((u) => u.id);
    expect(
      orphans,
      `these promise something and nothing does it: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * The list is a record of work outstanding, not a drawer to sweep things
   * into -- the same rule `NOT_DRAWN_YET` follows in `art-present.test.ts`.
   * An entry for something that *is* wired is a job finished and never
   * crossed off, and the next person reading the list would believe it.
   */
  it('keeps no stale entries in the unwired list', () => {
    const done = Object.keys(UNWIRED).filter((id) => {
      const def = UPGRADE_DEFS.find((u) => u.id === id);
      return def !== undefined && (def.effect !== undefined || namedInCode(id));
    });
    expect(done, `these are wired now and should come off the list: ${done.join(', ')}`).toEqual([]);
  });

  it('names only real upgrades in the unwired list', () => {
    const ids = new Set(UPGRADE_DEFS.map((u) => u.id));
    expect(Object.keys(UNWIRED).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('says how many are left, out loud', () => {
    // Not a bar -- a number somebody has to come and change, which is the
    // point. 13 of 36 at the end of slice 5a.
    expect(Object.keys(UNWIRED)).toHaveLength(23);
    expect(UPGRADE_DEFS.filter((u) => u.effect)).toHaveLength(4);
    expect(36 - Object.keys(UNWIRED).length, 'wired so far').toBe(13);
  });
});

describe('the flat ones', () => {
  it('gives the Knight Errant a move and the Orc Guardian one fewer', () => {
    const state = game();
    expect(upgradeMoves(put(state, 1, 'knight', 5, 5, 'knight-errant'))).toBe(1);
    expect(upgradeMoves(put(state, 0, 'orc', 7, 7, 'orc-guardian'))).toBe(-1);
    expect(upgradeMoves(put(state, 0, 'orc', 9, 9))).toBe(0);
  });

  it('puts the Archmage a tile further out, and says 3 because it means 3', () => {
    const state = game();
    const mage = put(state, 1, 'mage', 5, 5, 'mage-archmage');
    const plain = put(state, 1, 'mage', 6, 6);
    expect(upgradeReach(mage)).toBe(1);
    expect(unitReach(mage)).toBe(unitReach(plain) + 1);
    // The blurb says "range increases to 3", so check the number a player
    // would count on the map rather than the modifier behind it.
    expect(unitReach(mage)).toBe(3);
  });

  /**
   * The finding that cost `archer-longbow` its wiring, pinned so nobody wires
   * it from the blurb without noticing. The bible describes a Civ-style
   * bowman; this game's Archer strikes at range 1 and gets a free opening
   * blow instead.
   */
  it('knows the Archer is not a ranged unit in this game', () => {
    const state = game();
    const archer = put(state, 1, 'archer', 5, 5);
    expect(unitReach(archer)).toBe(1);
    expect(unitType(archer.type).firstStrikes).toBe(1);
  });

  it('trades the Marksman’s free blow for its two points', () => {
    const state = game();
    const plain = put(state, 1, 'archer', 5, 5);
    const marks = put(state, 1, 'archer', 7, 7, 'archer-marksman');
    expect(firstStrikesOf(plain)).toBe(1);
    expect(firstStrikesOf(marks), 'no longer gets the first word').toBe(0);
    const orc = put(state, 0, 'orc', 12, 12);
    expect(attackStrength(state, marks, orc).total).toBeGreaterThan(
      attackStrength(state, plain, orc).total,
    );
    UPGRADES.enabled = false;
    expect(firstStrikesOf(marks), 'and keeps it in a game without upgrades').toBe(1);
  });

  it('adds the Guardian’s shield to the stack it defends with', () => {
    const state = game();
    const plain = put(state, 0, 'orc', 5, 5);
    const guard = put(state, 0, 'orc', 7, 7, 'orc-guardian');
    expect(defenseStrength(state, guard).total).toBeGreaterThan(
      defenseStrength(state, plain).total,
    );
  });

  it('does none of it with the box unticked', () => {
    const state = game();
    const guard = put(state, 0, 'orc', 5, 5, 'orc-guardian');
    const before = defenseStrength(state, guard).total;
    UPGRADES.enabled = false;
    expect(defenseStrength(state, guard).total).toBeLessThan(before);
    expect(upgradeMoves(guard)).toBe(0);
    expect(upgradeReach(guard)).toBe(0);
  });
});

describe('the conditional ones', () => {
  it('makes the Berserker better at attacking and worse at surviving, but only when hurt', () => {
    const state = game();
    const target = put(state, 1, 'footman', 6, 5);
    const b = put(state, 0, 'orc', 5, 5, 'orc-berserker');
    expect(upgradeAttack(state, b), 'healthy, so nothing yet').toBe(0);
    b.hp = Math.floor(unitType(b.type).hp / 3);
    expect(upgradeAttack(state, b)).toBeGreaterThan(0);
    expect(upgradeDefence(state, b), 'and it is paying for it').toBeLessThan(0);
    void target;
  });

  it('pays the veterans after two fights and not before', () => {
    const state = game();
    const orc = put(state, 0, 'orc', 5, 5, 'orc-veteran');
    const foot = put(state, 1, 'footman', 9, 9, 'footman-veteran');
    expect(upgradeAttack(state, orc)).toBe(0);
    orc.fights = SEASONED.fights - 1;
    foot.fights = SEASONED.fights - 1;
    expect(upgradeAttack(state, orc), 'one short').toBe(0);
    orc.fights = SEASONED.fights;
    foot.fights = SEASONED.fights;
    expect(upgradeAttack(state, orc)).toBe(SEASONED.attack);
    expect(upgradeDefence(state, foot)).toBe(SEASONED.defence);
  });

  it('counts a fight for whoever walked away from it', () => {
    const state = game();
    const orc = put(state, 0, 'orc', 5, 5, 'orc-veteran');
    const foot = put(state, 1, 'footman', 6, 5);
    resolveCombat(state, orc, foot);
    // Whoever is still standing has been in one; both, if both survived.
    const survivors = [orc, foot].filter((u) => u.hp > 0);
    expect(survivors.length).toBeGreaterThan(0);
    for (const u of survivors) expect(u.fights, `${u.type}`).toBe(1);
  });

  it('gives the Vanguard its two only when it is the one attacking', () => {
    const state = game();
    const v = put(state, 1, 'knight', 5, 5, 'knight-vanguard');
    const orc = put(state, 0, 'orc', 6, 5);
    expect(upgradeAttack(state, v)).toBe(VANGUARD.attack);
    // Defending is not initiating, and `defenseStrength` never asks.
    expect(upgradeDefence(state, v)).toBe(0);
    void orc;
  });
});

describe('the ones that reach past their own tile', () => {
  it('finds what is standing next to a unit, and whose it is', () => {
    const state = game();
    const mine = put(state, 0, 'orc', 5, 5);
    put(state, 0, 'orc', 6, 5);
    put(state, 1, 'footman', 4, 4);
    put(state, 1, 'footman', 9, 9);
    expect(neighbours(state, mine)).toHaveLength(2);
    expect(neighbours(state, mine, 'friendly')).toHaveLength(1);
    expect(neighbours(state, mine, 'enemy')).toHaveLength(1);
  });

  it('has the Warlord lift what stands beside it, and not itself', () => {
    const state = game();
    const w = put(state, 0, 'ogre', 5, 5, 'ogre-warlord');
    const near = put(state, 0, 'orc', 6, 5);
    const far = put(state, 0, 'orc', 12, 12);
    expect(upgradeAttack(state, near)).toBe(WARLORD.attack);
    expect(upgradeAttack(state, far), 'out of earshot').toBe(0);
    expect(upgradeAttack(state, w), 'a warlord does not bellow at itself').toBe(0);
  });

  it('pays the Grinder once for every enemy that surrounded it', () => {
    const state = game();
    const g = put(state, 0, 'ogre', 5, 5, 'ogre-grinder');
    expect(upgradeAttack(state, g)).toBe(0);
    put(state, 1, 'footman', 6, 5);
    put(state, 1, 'footman', 4, 5);
    put(state, 0, 'orc', 5, 6);
    expect(upgradeAttack(state, g), 'two enemies, not three neighbours').toBe(
      GRINDER.perEnemy * 2,
    );
  });

  it('has the Dread Knight take a point off what it stands beside', () => {
    const state = game();
    const d = put(state, 0, 'deathknight', 5, 5, 'deathknight-dread');
    const foot = put(state, 1, 'footman', 6, 5);
    expect(upgradeAttack(state, foot)).toBe(-DREAD.attack);
    // And a Templar is the answer to it, which is its entire purpose.
    const templar = put(state, 1, 'paladin', 4, 5, 'paladin-templar');
    expect(upgradeAttack(state, templar)).toBe(0);
    void d;
  });

  it('never takes a swing below the floor the cowed share', () => {
    const state = game();
    put(state, 0, 'deathknight', 5, 5, 'deathknight-dread');
    const peasant = put(state, 1, 'peasant', 6, 5);
    const defender = put(state, 0, 'orc', 12, 12);
    expect(attackStrength(state, peasant, defender).total).toBeGreaterThan(0);
  });

  it('holds a shieldwall only between Footmen', () => {
    const state = game();
    const wall = put(state, 1, 'footman', 5, 5, 'footman-shieldwall');
    const mate = put(state, 1, 'footman', 6, 5);
    const archer = put(state, 1, 'archer', 4, 5);
    expect(upgradeDefence(state, mate)).toBeGreaterThan(0);
    expect(upgradeDefence(state, archer), 'an archer is not a wall').toBe(0);
    void wall;
  });
});
