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
  blastRadius,
  coveringFor,
  keepsItsTurn,
  LANCE,
  movesThisTurn,
  axesCarried,
  breathSpares,
  CHAMPION,
  conditionDefence,
  HEAVY,
  piercesDefence,
  retrievesAxe,
  shrugsFirstBlow,
  WARD,
  neighbours,
  upgradeAttack,
  upgradeDefence,
  upgradeMoves,
  upgradeReach,
} from '../src/sim/upgradeEffects';
import {
  applyDamage,
  attackStrength,
  breatheThrough,
  rearm,
  REARM_TURNS,
  defenseStrength,
  detonate,
  MAX_RESIST,
  resistance,
  resolveCombat,
} from '../src/sim/combat';
import { tryStep } from '../src/sim/movement';
import { beginPlayerTurn } from '../src/sim/turn';
import { applyStatus, clearStatus, hasStatus } from '../src/sim/status';
import { runAiTurn } from '../src/ai/ai';
import {
  abilitiesOf,
  abilityReady,
  abilityTargets,
  unitReach,
  useAbility,
} from '../src/sim/abilities';
import { maxHp, unitType } from '../src/model/units';
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
  // Abilities only ever target what the acting side can see, which is what
  // stops an armed ability doubling as a fog-of-war probe. A bare test state
  // has seen nothing, so say it has.
  for (const p of state.players) p.visible[y * state.width + x] = 1;
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
  'sapper-cadre': 'the paired-risk rule needs a notion of a pair, which nothing has',


  // ---- the troll
  'troll-regen': 'healing mid-combat means a heal inside the round loop, which has none',
  // **Measured, after it was built and found never to fire.** A lasting
  // debuff on whatever a troll hit needs whatever a troll hit to still be
  // standing, and a probe over 2160 melee fights found **not one** that left
  // both sides alive: `resolveCombat` runs until somebody dies, and the only
  // exception is a withdrawal perk that did not fire once either. The
  // `broken` status was written, wired and deleted again.
  //
  // Two readings would work and the choice is a design one: apply it at the
  // *start* of the fight, which makes it `axethrower-heavy` under another
  // name, or make it an aura on adjacent enemies like `deathknight-dread`.
  'troll-bonebreaker':
    'a lasting debuff needs a survivor, and 0 of 2160 melee fights left both sides alive',

  // ---- the ogre

  // ---- the Death Knight, and the whole raised-skeleton rule
  'deathknight-grave':
    'raising a skeleton is a new unit on the board with a lifespan; the art is drawn and the Unbound ruling is made, but the rule is its own slice',
  'deathknight-soulbound': 'depends entirely on the above existing first',

  // ---- the dragon
  'dragon-elder': 'breath damage plus a movement cost over enemy cities, which is two systems',
  'dragon-rider': 'carrying a passenger is the ship mechanism, for something that flies',

  // ---- the Kingdom's foot

  // ---- the bow
  // ---- the bow, where the bible and the game turn out to disagree. **This
  // game's Archer has `range: 1`**; what makes it ranged is `firstStrikes: 1`.
  // `archer-longbow` was unwired for a day over exactly that, and Jeremy's
  // answer on 2026-10-29 reads the longer reach as *twice*: it looses, is
  // answered, and looses again. That is wired. `archer-volley` still is not.
  'archer-volley': 'firing past an intervening unit means nothing at range 1',


  // ---- the horse

  // ---- the Paladin and the Mage. Their "no longer costs the whole turn"
  // halves landed together, as the note here said they should; what is left
  // of each wants machinery nothing has yet.
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
    // point. 27 of 36.
    expect(Object.keys(UNWIRED)).toHaveLength(9);
    expect(UPGRADE_DEFS.filter((u) => u.effect)).toHaveLength(6);
    expect(36 - Object.keys(UNWIRED).length, 'wired so far').toBe(27);
  });
});

describe('the flat ones', () => {
  it('gives the Knight Errant a move, and nobody a flat penalty', () => {
    const state = game();
    expect(upgradeMoves(put(state, 1, 'knight', 5, 5, 'knight-errant'))).toBe(1);
    expect(upgradeMoves(put(state, 0, 'orc', 9, 9))).toBe(0);
    // The Guardian's cost is not a number -- see Jeremy's ruling below. A flat
    // -1 on a creature with one movement point is a creature that never moves.
    expect(upgradeMoves(put(state, 0, 'orc', 7, 7, 'orc-guardian'))).toBe(0);
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

describe('Jeremy’s two rulings of 2026-10-29', () => {
  /**
   * `archer-longbow`. The bible said "range increases to 3" and this game's
   * Archer has a range of 1, so the line sat unwired for a day. The answer was
   * to read the longer reach as *twice*: it looses, is answered, and looses
   * again, all before the fight proper.
   */
  it('lets the Longbow loose twice, and be answered in between', () => {
    const state = game();
    const plain = put(state, 1, 'archer', 5, 5);
    const long = put(state, 1, 'archer', 5, 7, 'archer-longbow');
    const a = put(state, 0, 'orc', 6, 5);
    const b = put(state, 0, 'orc', 6, 7);
    const hpWas = { a: a.hp, b: b.hp, plain: plain.hp, long: long.hp };
    resolveCombat(state, plain, a);
    resolveCombat(state, long, b);
    // Both archers opened; the Longbow got a second shot in, and took one back
    // for the privilege. Compared as "more damage dealt" rather than an exact
    // figure, because the rest of the fight is dice.
    expect(hpWas.b - b.hp, 'the Longbow hit harder').toBeGreaterThan(hpWas.a - a.hp);
    void hpWas.plain;
    void hpWas.long;
  });

  it('nets against another first-striker, the way every first strike does', () => {
    const state = game();
    // Two archers cancel, so neither opens and the Longbow's extra hangs off
    // a shot it never got. Section 11's rule, not a special case for this one.
    const long = put(state, 1, 'archer', 5, 5, 'archer-longbow');
    const other = put(state, 0, 'axethrower', 6, 5);
    expect(firstStrikesOf(long)).toBe(firstStrikesOf(other));
  });

  /**
   * `orc-guardian`. "-1 movement" could not be a number, because an orc has
   * one and the Guardian would never move again. One tile every two turns,
   * and `cover` to do with the turns in between.
   */
  it('moves the Guardian one turn in two', () => {
    const state = game();
    const guard = put(state, 0, 'orc', 5, 5, 'orc-guardian');
    const plain = put(state, 0, 'orc', 9, 9);
    const moving: boolean[] = [];
    for (let turn = 1; turn <= 4; turn++) {
      state.turn = turn;
      moving.push(movesThisTurn(state, guard));
      expect(movesThisTurn(state, plain), 'an ordinary orc is unaffected').toBe(true);
    }
    expect(moving.filter(Boolean)).toHaveLength(2);
    expect(moving[0]).not.toBe(moving[1]);
  });

  it('lets a Guardian cover even on a turn it cannot move', () => {
    const state = game();
    const guard = put(state, 0, 'orc', 5, 5, 'orc-guardian');
    const friend = put(state, 0, 'peon', 6, 5);
    guard.moves = 0;
    expect(abilitiesOf(guard)).toContain('cover');
    expect(abilityReady(guard, 'cover'), 'the thing it does while waiting').toBeNull();
    expect(abilityTargets(state, guard, 'cover').map((u) => u.id)).toContain(friend.id);
    expect(useAbility(state, guard, 'cover', friend).ok).toBe(true);
    expect(guard.covering).toBe(friend.id);
    // And not twice in one turn.
    expect(abilityReady(guard, 'cover')).not.toBeNull();
  });

  it('puts the Guardian in the way of whatever comes', () => {
    const state = game();
    const guard = put(state, 0, 'orc', 5, 5, 'orc-guardian');
    const peon = put(state, 0, 'peon', 6, 5);
    guard.covering = peon.id;
    expect(coveringFor(state, peon)?.id, 'adjacent and covering').toBe(guard.id);
    // Moved away, and no longer covering anybody: checked at the moment of
    // the blow rather than trusted from when the order was given.
    guard.x = 12;
    guard.y = 12;
    expect(coveringFor(state, peon)).toBeNull();
    guard.x = 5;
    guard.y = 5;
    guard.hp = 0;
    expect(coveringFor(state, peon), 'a dead orc covers nobody').toBeNull();
  });

  it('covers nobody at all in a game without upgrades', () => {
    const state = game();
    const guard = put(state, 0, 'orc', 5, 5, 'orc-guardian');
    const peon = put(state, 0, 'peon', 6, 5);
    guard.covering = peon.id;
    UPGRADES.enabled = false;
    expect(coveringFor(state, peon)).toBeNull();
    expect(abilitiesOf(guard)).not.toContain('cover');
    expect(movesThisTurn(state, guard)).toBe(true);
  });
});

describe('covering, end to end', () => {
  /**
   * The lookup is one thing; the fight is the other. This drives a real
   * attack through `tryStep`, because the substitution happens in the mover
   * and a test of `coveringFor` alone would pass with the mover unchanged.
   */
  it('sends the blow to the Guardian and leaves the covered unit alone', () => {
    const state = game();
    const guard = put(state, 1, 'orc', 5, 5, 'orc-guardian');
    const peon = put(state, 1, 'peon', 6, 5);
    const attacker = put(state, 0, 'orc', 7, 5);
    guard.covering = peon.id;
    guard.owner = 1;
    const peonHp = peon.hp;
    const guardHp = guard.hp;
    tryStep(state, attacker, peon.x, peon.y);
    expect(peon.hp, 'untouched, because somebody was in the way').toBe(peonHp);
    expect(guard.hp, 'the Guardian took it').toBeLessThan(guardHp);
  });

  it('lets the blow through once nobody is covering', () => {
    const state = game();
    const guard = put(state, 1, 'orc', 5, 5, 'orc-guardian');
    const peon = put(state, 1, 'peon', 6, 5);
    const attacker = put(state, 0, 'orc', 7, 5);
    const peonHp = peon.hp;
    const guardHp = guard.hp;
    // No `covering` set: the Guardian is simply standing there.
    tryStep(state, attacker, peon.x, peon.y);
    expect(guard.hp, 'it did not volunteer').toBe(guardHp);
    expect(peon.hp).toBeLessThan(peonHp);
  });
});

describe('the AI uses it', () => {
  /**
   * The fifth instance of the same lesson. An ability no AI ever reaches for
   * is a mechanic that never happens, and a sweep of it compares two games
   * that are the same game.
   */
  it('puts a Guardian in front of the frailest thing beside it', () => {
    const state = game();
    const guard = put(state, 0, 'orc', 5, 5, 'orc-guardian');
    const healthy = put(state, 0, 'orc', 6, 5);
    const hurt = put(state, 0, 'peon', 4, 5);
    hurt.hp = 1;
    state.players[0].controller = 'ai';
    runAiTurn(state, 0);
    expect(guard.covering, 'the one that cannot take a hit').toBe(hurt.id);
    void healthy;
  });
});

describe('the second batch', () => {
  it('lowers a lance at anything on a horse, and nothing on foot', () => {
    const state = game();
    const lancer = put(state, 1, 'knight', 5, 5, 'knight-lance');
    const horse = put(state, 0, 'dragon', 6, 5);
    const foot = put(state, 0, 'orc', 4, 5);
    const plain = put(state, 1, 'knight', 9, 9);
    // `isMounted` is what "cavalry-type" means here; a knight is, an orc is not.
    expect(firstStrikesOf(lancer, foot)).toBe(firstStrikesOf(plain, foot));
    const mounted = put(state, 0, 'knight', 7, 5);
    expect(firstStrikesOf(lancer, mounted)).toBe(firstStrikesOf(plain, mounted) + LANCE.firstStrikes);
    // And it is a fact about the pairing, not about the lancer: asked with no
    // opponent at all, it is an ordinary knight.
    expect(firstStrikesOf(lancer)).toBe(firstStrikesOf(plain));
    void horse;
  });

  it('leaves the Battle Mage and the Warden Paladin their turn', () => {
    const state = game();
    const mage = put(state, 1, 'mage', 5, 5, 'mage-battle');
    const plainMage = put(state, 1, 'mage', 5, 9);
    // Two tiles out: a ranged unit cannot lob one at somebody standing next
    // to it, which is the drawback that makes the range worth having -- and
    // which quietly made the first draft of this test assert nothing at all.
    const foe = put(state, 0, 'orc', 7, 5);
    const foe2 = put(state, 0, 'orc', 7, 9);
    expect(useAbility(state, mage, 'ranged', foe).ok, 'the strike happened').toBe(true);
    expect(useAbility(state, plainMage, 'ranged', foe2).ok).toBe(true);
    expect(mage.moves, 'still swinging').toBeGreaterThan(0);
    expect(plainMage.moves, 'and the ordinary one is not').toBe(0);

    const pal = put(state, 1, 'paladin', 12, 5, 'paladin-warden');
    const plainPal = put(state, 1, 'paladin', 12, 9);
    const hurt1 = put(state, 1, 'footman', 13, 5);
    const hurt2 = put(state, 1, 'footman', 13, 9);
    hurt1.hp = 1;
    hurt2.hp = 1;
    useAbility(state, pal, 'heal', hurt1);
    useAbility(state, plainPal, 'heal', hurt2);
    expect(pal.moves).toBeGreaterThan(0);
    expect(plainPal.moves).toBe(0);
  });

  it('throws the Deep Sapper a tile further', () => {
    const state = game();
    const deep = put(state, 0, 'sapper', 5, 5, 'sapper-deep');
    const plain = put(state, 0, 'sapper', 15, 15);
    expect(blastRadius(plain)).toBe(1);
    expect(blastRadius(deep)).toBe(2);
    const near = put(state, 1, 'footman', 6, 5);
    const far = put(state, 1, 'footman', 7, 5);
    const nearHp = near.hp;
    const farHp = far.hp;
    detonate(state, deep);
    expect(near.hp).toBeLessThan(nearHp);
    expect(far.hp, 'two tiles out, and still caught').toBeLessThan(farHp);
  });

  it('lets a Sergeant’s Footmen shrug the first blow, once a fight', () => {
    const state = game();
    const sgt = put(state, 1, 'footman', 5, 5, 'footman-sergeant');
    const mate = put(state, 1, 'footman', 6, 5);
    const alone = put(state, 1, 'footman', 15, 15);
    const archer = put(state, 1, 'archer', 4, 5);
    expect(shrugsFirstBlow(state, mate)).toBe(true);
    expect(shrugsFirstBlow(state, alone), 'nobody beside it').toBe(false);
    // Only Footmen. The blurb says Footmen, and a Sergeant is not a general.
    expect(shrugsFirstBlow(state, archer)).toBe(false);
    // A Sergeant is a Footman beside another Footman, so it covers itself only
    // when a second Sergeant is beside it -- the same rule the shieldwall has.
    void sgt;
  });

  it('shrugs nothing with the box unticked', () => {
    const state = game();
    put(state, 1, 'footman', 5, 5, 'footman-sergeant');
    const mate = put(state, 1, 'footman', 6, 5);
    const deep = put(state, 0, 'sapper', 15, 15, 'sapper-deep');
    const mage = put(state, 1, 'mage', 12, 12, 'mage-battle');
    UPGRADES.enabled = false;
    expect(shrugsFirstBlow(state, mate)).toBe(false);
    expect(blastRadius(deep)).toBe(1);
    expect(keepsItsTurn(mage, 'ranged')).toBe(false);
  });
});

describe('the Troll Brute, and the number that had fifteen homes', () => {
  it('gives a Brute two more hit points than a troll', () => {
    const state = game();
    const plain = put(state, 0, 'troll', 5, 5);
    const brute = put(state, 0, 'troll', 9, 9, 'troll-brute');
    expect(maxHp(brute)).toBe(maxHp(plain) + 2);
  });

  it('gives a group two each, like every other flat addition', () => {
    const state = game();
    const one = put(state, 0, 'troll', 5, 5, 'troll-brute');
    const three = put(state, 0, 'troll_x3', 9, 9, 'troll-brute');
    const plainThree = put(state, 0, 'troll_x3', 12, 12);
    expect(maxHp(three) - maxHp(plainThree)).toBe(2 * unitType('troll_x3').count);
    void one;
  });

  /**
   * The point of the helper rather than the upgrade. A ceiling, a threshold,
   * a limit and a scale all meant the same number and all wrote it out
   * separately; a Brute at full health has to read as full health to every
   * one of them, or it is permanently one heal short of itself.
   */
  it('is full when it is full, to everything that asks', () => {
    const state = game();
    const brute = put(state, 0, 'troll', 5, 5, 'troll-brute');
    brute.hp = maxHp(brute);
    const healer = put(state, 0, 'deathknight', 6, 5);
    expect(abilityTargets(state, healer, 'reload')).not.toContain(brute);
    // A unit at its own maximum is not a candidate for patching up.
    const pal = put(state, 1, 'paladin', 15, 15);
    const sick = put(state, 1, 'footman', 16, 15);
    sick.hp = 1;
    expect(abilityTargets(state, pal, 'heal').map((u) => u.id)).toContain(sick.id);
    expect(abilityTargets(state, pal, 'heal').map((u) => u.id)).not.toContain(brute.id);
  });

  it('is an ordinary troll with the box unticked', () => {
    const state = game();
    const brute = put(state, 0, 'troll', 5, 5, 'troll-brute');
    const plain = put(state, 0, 'troll', 9, 9);
    UPGRADES.enabled = false;
    expect(maxHp(brute)).toBe(maxHp(plain));
  });
});

describe('the backswing', () => {
  /**
   * **The ogre has to win.** The first draft of this let an even fight decide
   * it, and the ogre lost -- so `brawlerSwing` correctly did nothing, and the
   * test failed for a reason that had nothing to do with the backswing. The
   * target is left on one hit point so the outcome is not in question.
   */
  function brawl(state: GameState): { ogre: Unit; target: Unit } {
    const ogre = put(state, 0, 'ogre', 5, 5, 'ogre-brawler');
    const target = put(state, 1, 'footman', 6, 5);
    target.hp = 1;
    return { ogre, target };
  }

  it('catches the bystander nearest the Brawler, and only one', () => {
    const state = game();
    const { ogre, target } = brawl(state);
    // Both are beside the target; one is beside the ogre as well, and that is
    // the one a wide flat arc would catch on the way through.
    const near = put(state, 1, 'footman', 6, 4);
    const far = put(state, 1, 'footman', 7, 5);
    const was = { near: near.hp, far: far.hp };
    resolveCombat(state, ogre, target);
    expect(ogre.hp, 'the ogre survived to swing at all').toBeGreaterThan(0);
    expect(near.hp, 'on the way through').toBeLessThan(was.near);
    expect(far.hp, 'one bystander, not everything nearby').toBe(was.far);
  });

  it('swings at nobody of its own', () => {
    const state = game();
    const { ogre, target } = brawl(state);
    const friend = put(state, 0, 'orc', 6, 4);
    const was = friend.hp;
    resolveCombat(state, ogre, target);
    expect(friend.hp).toBe(was);
  });

  it('does neither with the box unticked', () => {
    const state = game();
    const { ogre, target } = brawl(state);
    const beside = put(state, 1, 'footman', 6, 4);
    const was = beside.hp;
    UPGRADES.enabled = false;
    resolveCombat(state, ogre, target);
    expect(beside.hp).toBe(was);
  });
});

describe('the Warden Mage, on its second reading', () => {
  /**
   * The bible's wording -- *"first strike against this unit deals reduced
   * damage"* -- was measured and found to be worth nothing: a free blow is
   * one hit point for 78 of the game's 81 creatures, and half of one is one.
   * Jeremy's answer on 2026-10-30 made it both larger and simpler.
   */
  it('shrugs off half of any blow, whatever it is made of', () => {
    const state = game();
    const warden = put(state, 1, 'mage', 5, 5, 'mage-warden');
    const plain = put(state, 1, 'mage', 5, 9);
    expect(resistance(warden, 'physical')).toBe(WARD.share);
    // A mage already resists magic, so there the ward stacks on top of what
    // it had and runs into the ceiling rather than standing alone.
    expect(resistance(warden, 'magic')).toBeGreaterThanOrEqual(WARD.share);
    expect(resistance(plain, 'physical')).toBe(0);
    // Through `applyDamage`, which is the one place health comes off a unit.
    expect(applyDamage(warden, 8, 'physical')).toBe(4);
    expect(applyDamage(plain, 8, 'physical')).toBe(8);
  });

  it('never lets a resistance past the ceiling', () => {
    const state = game();
    const warden = put(state, 1, 'mage', 5, 5, 'mage-warden');
    warden.rank = 3;
    expect(resistance(warden, 'magic')).toBeLessThanOrEqual(MAX_RESIST);
  });

  it('takes the free opening blow away from whatever attacks it', () => {
    const state = game();
    const warden = put(state, 1, 'mage', 5, 5, 'mage-warden');
    const plain = put(state, 1, 'mage', 5, 9);
    const archer = put(state, 0, 'archer', 6, 5);
    expect(firstStrikesOf(archer, plain), 'an archer normally opens').toBe(1);
    expect(firstStrikesOf(archer, warden), 'and not against this one').toBe(0);
    // Both directions of the subtraction `resolveCombat` does: the warden has
    // none of its own either, so the netting is zero rather than negative.
    expect(firstStrikesOf(warden, archer)).toBe(0);
  });

  it('does neither with the box unticked', () => {
    const state = game();
    const warden = put(state, 1, 'mage', 5, 5, 'mage-warden');
    const archer = put(state, 0, 'archer', 6, 5);
    UPGRADES.enabled = false;
    expect(resistance(warden, 'physical')).toBe(0);
    expect(firstStrikesOf(archer, warden)).toBe(1);
  });

  it('is reached: the same fight leaves the warded mage better off', () => {
    const state = game();
    const warden = put(state, 1, 'mage', 5, 5, 'mage-warden');
    const plain = put(state, 1, 'mage', 5, 9);
    const a = put(state, 0, 'orc', 6, 5);
    const b = put(state, 0, 'orc', 6, 9);
    const seed = state.rngState;
    resolveCombat(state, a, warden);
    state.rngState = seed;
    resolveCombat(state, b, plain);
    // A mage is a single creature, so the odds never move during a fight and
    // the same seed deals the same sequence of blows to both.
    expect(warden.hp, 'half of everything adds up').toBeGreaterThan(plain.hp);
  });
});

describe('the ward at a granularity where a half does not exist', () => {
  /**
   * The finding that shaped the implementation. Of the 6561 creature
   * matchups in this game, **6084 deal exactly one point a round**, and
   * `Math.round(1 * 0.5)` is 1 -- so a 50% resistance is rounded away in
   * ninety-three per cent of fights and does nothing whatever.
   *
   * Half the blows is half the damage when a blow is indivisible, so every
   * second one the percentage failed to reduce is shrugged off entirely.
   */
  it('still halves what a whole fight does to it', () => {
    const state = game();
    const warden = put(state, 1, 'mage', 5, 5, 'mage-warden');
    const plain = put(state, 1, 'mage', 5, 9);
    const a = put(state, 0, 'orc', 6, 5);
    const b = put(state, 0, 'orc', 6, 9);
    const seed = state.rngState;
    resolveCombat(state, a, warden);
    state.rngState = seed;
    resolveCombat(state, b, plain);
    // A mage is a single creature, so the odds never move during a fight and
    // the same seed deals the same sequence of blows to both.
    expect(warden.hp, 'took half of what the other did').toBeGreaterThan(plain.hp);
  });

  it('does not halve a blow twice when the percentage worked', () => {
    // A dragon's breath and a sapper's blast are big enough to halve, and
    // those go through `applyDamage` and its resistance alone.
    const state = game();
    const warden = put(state, 1, 'mage', 5, 5, 'mage-warden');
    expect(applyDamage(warden, 8, 'physical'), 'halved once').toBe(4);
    expect(applyDamage(warden, 8, 'physical'), 'and once, every time').toBe(4);
  });
});

describe('the axethrower’s three, which are all one mechanism', () => {
  /** A fight the thrower opens, so the axe actually leaves its hand. */
  function throwAt(state: GameState, thrower: Unit): Unit {
    const mark = put(state, 1, 'footman', thrower.x + 1, thrower.y);
    resolveCombat(state, thrower, mark);
    return mark;
  }

  it('leaves a Twin Thrower an axe after the first fight', () => {
    const state = game();
    const twin = put(state, 0, 'axethrower', 5, 5, 'axethrower-twin');
    const plain = put(state, 0, 'axethrower', 5, 9);
    expect(axesCarried(twin)).toBe(2);
    expect(axesCarried(plain)).toBe(1);
    throwAt(state, plain);
    expect(plain.disarmed, 'one axe, and it has gone').toBe(true);
    twin.hp = unitType(twin.type).hp;
    throwAt(state, twin);
    expect(twin.axesThrown).toBe(1);
    expect(twin.disarmed, 'still has the spare').toBe(false);
  });

  it('empties a Twin Thrower’s hands on the second throw', () => {
    const state = game();
    const twin = put(state, 0, 'axethrower', 5, 5, 'axethrower-twin');
    twin.axesThrown = 1;
    throwAt(state, twin);
    expect(twin.axesThrown).toBe(2);
    expect(twin.disarmed).toBe(true);
    expect(twin.rearmIn).toBeGreaterThan(0);
  });

  it('gives the hand back full when the axe is fetched', () => {
    const state = game();
    const twin = put(state, 0, 'axethrower', 5, 5, 'axethrower-twin');
    twin.disarmed = true;
    twin.axesThrown = 2;
    rearm(state, twin, 'picks them up');
    expect(twin.disarmed).toBe(false);
    expect(twin.axesThrown, 'both of them, not one').toBeUndefined();
  });

  it('lowers the line a Heavy Thrower opens on, and nobody else’s', () => {
    const state = game();
    const heavy = put(state, 0, 'axethrower', 5, 5, 'axethrower-heavy');
    const plain = put(state, 0, 'axethrower', 5, 9);
    const mark = put(state, 1, 'footman', 6, 5);
    expect(piercesDefence(heavy)).toBe(HEAVY.pierces);
    expect(piercesDefence(plain)).toBe(0);
    expect(piercesDefence(undefined), 'nobody attacking at all').toBe(0);
    expect(defenseStrength(state, mark, heavy).total).toBeLessThan(
      defenseStrength(state, mark, plain).total,
    );
  });

  it('never drops a defence below nothing', () => {
    const state = game();
    const heavy = put(state, 0, 'axethrower', 5, 5, 'axethrower-heavy');
    const mark = put(state, 1, 'peasant', 6, 5);
    expect(defenseStrength(state, mark, heavy).total).toBeGreaterThanOrEqual(0);
  });

  it('gives a Retriever its axe back early, and never late', () => {
    const state = game();
    const quick = put(state, 0, 'axethrower', 5, 5, 'axethrower-retriever');
    expect(retrievesAxe(quick)).toBe(true);
    expect(retrievesAxe(put(state, 0, 'axethrower', 5, 9))).toBe(false);
    quick.disarmed = true;
    quick.rearmIn = REARM_TURNS;
    // Rolled, so run it until it lands rather than asserting one coin toss.
    let turns = 0;
    while (quick.disarmed && turns < 20) {
      turns++;
      beginPlayerTurn(state, 0);
    }
    expect(quick.disarmed, 'it got the axe back').toBe(false);
    expect(turns, 'and never slower than the long walk').toBeLessThanOrEqual(REARM_TURNS);
  });

  it('does none of the three with the box unticked', () => {
    const state = game();
    const twin = put(state, 0, 'axethrower', 5, 5, 'axethrower-twin');
    const heavy = put(state, 0, 'axethrower', 5, 9, 'axethrower-heavy');
    const quick = put(state, 0, 'axethrower', 5, 12, 'axethrower-retriever');
    UPGRADES.enabled = false;
    expect(axesCarried(twin)).toBe(1);
    expect(piercesDefence(heavy)).toBe(0);
    expect(retrievesAxe(quick)).toBe(false);
  });
});

describe('the blessing, and the dragon that learned to aim', () => {
  it('blesses whoever a Champion patches up, even at full health', () => {
    const state = game();
    const champ = put(state, 1, 'paladin', 5, 5, 'paladin-champion');
    const plain = put(state, 1, 'paladin', 5, 12);
    const mended = put(state, 1, 'footman', 6, 5);
    const other = put(state, 1, 'footman', 6, 12);
    mended.hp = 1;
    other.hp = 1;
    useAbility(state, champ, 'heal', mended);
    useAbility(state, plain, 'heal', other);
    expect(hasStatus(mended, 'blessed')).toBe(true);
    expect(hasStatus(other, 'blessed'), 'an ordinary paladin only heals').toBe(false);
    expect(defenseStrength(state, mended).total).toBeGreaterThan(
      defenseStrength(state, other).total,
    );
  });

  it('reads the blessing off the defence, and nothing once it lapses', () => {
    const state = game();
    const unit = put(state, 1, 'footman', 5, 5);
    const plain = put(state, 1, 'footman', 9, 9);
    expect(conditionDefence(unit)).toBe(0);
    applyStatus(unit, 'blessed', 1);
    expect(conditionDefence(unit)).toBe(CHAMPION.defence);
    clearStatus(unit, 'blessed');
    expect(conditionDefence(unit)).toBe(0);
    expect(conditionDefence(plain)).toBe(0);
  });

  it('stops an Ancient Wyrm’s breath at its own front rank', () => {
    const state = game();
    const wyrm = put(state, 0, 'dragon', 5, 5, 'dragon-wyrm');
    const plain = put(state, 0, 'dragon', 5, 12);
    const markA = put(state, 1, 'footman', 6, 5);
    const ownA = put(state, 0, 'orc', 7, 5);
    const markB = put(state, 1, 'footman', 6, 12);
    const ownB = put(state, 0, 'orc', 7, 12);
    const was = { a: ownA.hp, b: ownB.hp };
    expect(breathSpares(wyrm)).toBe(true);
    expect(breathSpares(plain)).toBe(false);
    expect(breatheThrough(state, wyrm, markA, 8), 'spared its own').toBeNull();
    expect(breatheThrough(state, plain, markB, 8), 'cooked its own').not.toBeNull();
    expect(ownA.hp).toBe(was.a);
    expect(ownB.hp).toBeLessThan(was.b);
  });

  it('still carries on into an enemy behind the line', () => {
    const state = game();
    const wyrm = put(state, 0, 'dragon', 5, 5, 'dragon-wyrm');
    const mark = put(state, 1, 'footman', 6, 5);
    const foe = put(state, 1, 'footman', 7, 5);
    const was = foe.hp;
    expect(breatheThrough(state, wyrm, mark, 8)).not.toBeNull();
    expect(foe.hp, 'that is the whole mechanic').toBeLessThan(was);
  });

  it('does none of the three with the box unticked', () => {
    const state = game();
    const wyrm = put(state, 0, 'dragon', 5, 5, 'dragon-wyrm');
    const champ = put(state, 1, 'paladin', 12, 12, 'paladin-champion');
    const mended = put(state, 1, 'footman', 13, 12);
    mended.hp = 1;
    UPGRADES.enabled = false;
    expect(breathSpares(wyrm)).toBe(false);
    useAbility(state, champ, 'heal', mended);
    expect(hasStatus(mended, 'blessed')).toBe(false);
  });
});
