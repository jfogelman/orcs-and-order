import { describe, expect, it } from 'vitest';
import {
  BOUND,
  DISPERSAL,
  GUEST_LIST,
  PHYSICAL,
  REFORM_SITES,
  UNIQUE,
  WATERSIDE,
  besideWater,
  canReform,
  guestAs,
  holdsUnique,
  reformFailOdds,
  reformScattered,
  reformSites,
  scatteredOf,
  scatters,
} from '../src/sim/dispersal';
import { attackStrength, defenseStrength, destroyUnit } from '../src/sim/combat';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { buildOptions, canFoundCity, foundCity } from '../src/sim/city';
import { TERRAIN } from '../src/model/terrain';
import { CREATURES, unitType } from '../src/model/units';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS } from '../src/model/techs';
import { FACTIONS } from '../src/model/factions';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 152. Dispersal and reform: the Unbound's whole rule.
 *
 * `UNBOUND_PLAN.md` builds the faction on *"ordinary defeat doesn't end an
 * Unbound unit; it disperses, and may or may not come back"*, and on one
 * promise about it: *"there is always a hard counter (exorcism), so 'hard to
 * kill' never quietly becomes 'impossible to kill.'"* Section 150 shipped the
 * counter first and `tests/exorcism.test.ts` covers it. This covers the half
 * it counters.
 *
 * Everything with a number in it is a **lever** rather than an expectation:
 * nothing in `DISPERSAL` has been measured, and a test that pinned 0.35 would
 * fail the first time a sweep moved it. What is pinned is the shape -- that a
 * site is needed, that the advances take failure off, that neither building on
 * the map is permanent, and that the three exceptions are exceptional in the
 * directions the bible says they are.
 */
function theirs(techs: string[] = []): GameState {
  const state = createGame({ seed: 11, width: 30, height: 20, playerFaction: 'unbound' });
  state.players[0].techs = [FACTIONS.unbound.startTech, ...techs];
  return state;
}

/**
 * A town of theirs with whatever buildings the test needs standing in it.
 *
 * Founded by a Domovoi walked to the spot rather than pushed into
 * `state.cities` by hand: `foundCity` decides the name, the capital and the
 * land, and a city assembled beside it would be a city these rules had never
 * actually seen.
 *
 * **The spot is searched for rather than written down.** The first version of
 * this file named tiles -- 5,5 and 12,12 -- and most of it failed on this
 * seed, because one was water and the other was inside the first's spacing
 * ring. A test that hardcodes a coordinate is a test about one map.
 */
function town(state: GameState, buildings: string[] = []): City {
  const founder = spawnUnit(state, 0, 'domovoi', 1, 1);
  for (let y = 2; y < state.height - 2; y++) {
    for (let x = 2; x < state.width - 2; x++) {
      founder.x = x;
      founder.y = y;
      if (!canFoundCity(state, founder, x, y).ok) continue;
      const city = foundCity(state, founder);
      if (!city) continue;
      city.buildings.push(...(buildings as City['buildings']));
      return city;
    }
  }
  throw new Error('nowhere to found a town on this map');
}

/** Dry, empty, and not standing in a town. Walked outwards from a tile. */
function dryGroundNear(state: GameState, x: number, y: number): [number, number] {
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= state.width - 1 || ny >= state.height - 1) continue;
        if (TERRAIN[state.terrain[ny * state.width + nx]].water) continue;
        if (state.cities.some((c) => c.x === nx && c.y === ny)) continue;
        if (state.units.some((u) => u.x === nx && u.y === ny)) continue;
        return [nx, ny];
      }
    }
  }
  throw new Error('no dry ground anywhere near there');
}

/** One of theirs, standing somewhere free near a tile. */
function ours(state: GameState, type: string, x: number, y: number): Unit {
  const [ax, ay] = dryGroundNear(state, x, y);
  return spawnUnit(state, 0, type, ax, ay);
}

/** Somebody else's, standing somewhere free near a tile. */
function other(state: GameState, owner: number, type: string, x: number, y: number): Unit {
  const [ax, ay] = dryGroundNear(state, x, y);
  return spawnUnit(state, owner, type, ax, ay);
}

/** Run the roll with a fixed outcome, and put the levers back. */
function withOdds<T>(fail: number, fn: () => T): T {
  const base = DISPERSAL.failBase;
  const floor = DISPERSAL.failFloor;
  DISPERSAL.failBase = fail;
  DISPERSAL.failFloor = fail;
  try {
    return fn();
  } finally {
    DISPERSAL.failBase = base;
    DISPERSAL.failFloor = floor;
  }
}

const theirsOf = (state: GameState, base: string) =>
  state.units.filter((u) => u.owner === 0 && unitType(u.type).base === base);

/**
 * A creature of theirs that is **not** one of their starting units.
 *
 * The opening forces are a Domovoi and a Revenant -- section 148's rule, that
 * a faction's first advance grants the starter as well as the founder -- so a
 * test that counted Revenants on the board was counting one it never made.
 * Three tests failed on exactly that before this existed.
 */
const SPARE = 'sylph';

describe('losing is not dying', () => {
  it('scatters a spirit beaten by anything that cannot send it back', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    const spirit = ours(state, 'revenant', seat.x + 4, seat.y + 4);
    destroyUnit(state, spirit, 'is wiped out', other(state, 1, 'footman', spirit.x, spirit.y));
    expect(state.units).not.toContain(spirit);
    expect(scatteredOf(state, 0)).toHaveLength(1);
    expect(scatteredOf(state, 0)[0].type).toBe('revenant');
  });

  /**
   * The promise the whole of section 150 exists for, asked from this end. A
   * Paladin needs no advance, so this is the plainest form of it.
   */
  it('kills one beaten by an exorcist, outright', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    const spirit = ours(state, 'revenant', seat.x + 4, seat.y + 4);
    destroyUnit(state, spirit, 'is wiped out', other(state, 1, 'paladin', spirit.x, spirit.y));
    expect(scatteredOf(state, 0)).toHaveLength(0);
  });

  /**
   * **Nobody in particular is the ordinary case, not the odd one.** A unit
   * killed by a blast, a dragon's breath, a fire or a ship going down under it
   * has no killer to name -- and none of those is an exorcist, so all of them
   * scatter. This is why the hook is in `destroyUnit` rather than at the two
   * call sites in `movement.ts`.
   */
  it('scatters one killed by nothing in particular', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    destroyUnit(
      state,
      ours(state, 'revenant', seat.x + 4, seat.y + 4),
      'is burned away behind the line',
    );
    expect(scatteredOf(state, 0)).toHaveLength(1);
  });

  it('leaves every other side dying the way it always did', () => {
    const state = createGame({ seed: 11, width: 30, height: 20 });
    const orc = spawnUnit(state, 0, 'orc', 1, 1);
    const [fx, fy] = dryGroundNear(state, 2, 2);
    destroyUnit(state, orc, 'is wiped out', spawnUnit(state, 1, 'footman', fx, fy));
    expect(state.players[0].scattered ?? []).toHaveLength(0);
  });

  /** A lever, so a sweep can hold the arm where this faction is its stat line. */
  it('can be switched off whole', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    DISPERSAL.enabled = false;
    try {
      destroyUnit(state, ours(state, 'revenant', seat.x + 4, seat.y + 4), 'is wiped out');
      expect(scatteredOf(state, 0)).toHaveLength(0);
    } finally {
      DISPERSAL.enabled = true;
    }
  });
});

describe('somewhere to gather', () => {
  /**
   * The permanence in this faction, and the reason it is a faction about
   * buildings: *"neither present anywhere on the map -- the spirit is lost for
   * good. Real permanence, gated behind infrastructure instead of combat."*
   */
  it('loses a spirit for good with neither building standing', () => {
    const state = theirs();
    const seat = town(state);
    destroyUnit(state, ours(state, 'revenant', seat.x + 4, seat.y + 4), 'is wiped out');
    expect(scatteredOf(state, 0)).toHaveLength(0);
    expect(canReform(state, 0)).toBe(false);
  });

  it('takes an Anchor Totem with no other condition', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    // Something standing in it, which is the condition the Circle minds and
    // the Totem does not.
    spawnUnit(state, 0, 'effigy', seat.x, seat.y);
    expect(reformSites(state, 0).map((c) => c.id)).toEqual([seat.id]);
  });

  it('takes a Retrieval Circle only while nobody is standing in it', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[1]]);
    expect(reformSites(state, 0)).toHaveLength(1);
    const squatter = spawnUnit(state, 0, 'effigy', seat.x, seat.y);
    expect(reformSites(state, 0)).toHaveLength(0);
    // Anybody's, not only theirs: the rule is about the tile being empty.
    [squatter.x, squatter.y] = dryGroundNear(state, seat.x + 3, seat.y + 3);
    expect(reformSites(state, 0)).toHaveLength(1);
    spawnUnit(state, 1, 'footman', seat.x, seat.y);
    expect(reformSites(state, 0)).toHaveLength(0);
  });

  /**
   * Totems first, so an empire with both does not spend the empty town it is
   * keeping clear on a spirit the Totem would have taken anyway.
   */
  it('prefers a Totem to a Circle when it has both', () => {
    const state = theirs();
    town(state, [REFORM_SITES[1]]);
    const totem = town(state, [REFORM_SITES[0]]);
    expect(reformSites(state, 0)[0].id).toBe(totem.id);
  });
});

describe('gathering again', () => {
  it('stands a spirit back up in the site, whole, with what it had learned', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    const spirit = ours(state, SPARE, seat.x + 4, seat.y + 4);
    spirit.rank = 2;
    destroyUnit(state, spirit, 'is wiped out');
    withOdds(0, () => {
      state.turn += 1;
      reformScattered(state, 0);
    });
    const back = theirsOf(state, SPARE);
    expect(back).toHaveLength(1);
    expect([back[0].x, back[0].y]).toEqual([seat.x, seat.y]);
    expect(back[0].hp).toBe(unitType(SPARE).hp);
    expect(back[0].rank).toBe(2);
    expect(scatteredOf(state, 0)).toHaveLength(0);
  });

  /**
   * One attempt and no queue. Waiting would make dispersal a resource that
   * accumulates while the building goes up, which is the opposite of the
   * bible's *"infrastructure, not luck alone"* -- and a long war would end with
   * a second army arriving all at once.
   */
  it('gives a failed gathering no second go', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    destroyUnit(state, ours(state, SPARE, seat.x + 4, seat.y + 4), 'is wiped out');
    withOdds(1, () => {
      state.turn += 1;
      reformScattered(state, 0);
    });
    expect(theirsOf(state, SPARE)).toHaveLength(0);
    expect(scatteredOf(state, 0)).toHaveLength(0);
  });

  /** Beaten on somebody else's turn, it does not stand up before that turn ends. */
  it('leaves one scattered the same turn alone', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    destroyUnit(state, ours(state, 'revenant', seat.x + 4, seat.y + 4), 'is wiped out');
    reformScattered(state, 0);
    expect(scatteredOf(state, 0)).toHaveLength(1);
  });

  /**
   * A Circle stops being a site the moment the first spirit stands up in it,
   * which is why the site is asked for per spirit rather than once.
   */
  it('spends a Circle on one spirit, not on three', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[1]]);
    for (let i = 0; i < 3; i++) {
      destroyUnit(state, ours(state, SPARE, seat.x + 5, seat.y + 5), 'is wiped out');
    }
    expect(scatteredOf(state, 0)).toHaveLength(3);
    withOdds(0, () => {
      state.turn += 1;
      reformScattered(state, 0);
    });
    expect(theirsOf(state, SPARE)).toHaveLength(1);
  });

  it('takes failure off for each thing learned, and never reaches certainty', () => {
    const plain = theirs();
    const sigil = theirs(['retrieval-circle', 'sigil-bound']);
    const both = theirs([
      'retrieval-circle',
      'sigil-bound',
      'tier-revenant',
      'tier-yaksha',
      'anchor-totem',
      'the-ankh',
    ]);
    expect(reformFailOdds(sigil, 0)).toBeLessThan(reformFailOdds(plain, 0));
    expect(reformFailOdds(both, 0)).toBeLessThan(reformFailOdds(sigil, 0));
    expect(reformFailOdds(both, 0)).toBeGreaterThanOrEqual(DISPERSAL.failFloor);
  });

  /** The folly, which stacks with both advances and is empire-wide. */
  it('takes more off again for The First Binding', () => {
    const state = theirs(['tier-revenant']);
    const before = reformFailOdds(state, 0);
    town(state, ['firstBinding']);
    expect(reformFailOdds(state, 0)).toBeCloseTo(before - BUILDINGS.firstBinding.reformOdds!, 5);
  });
});

describe('the three that are exceptions', () => {
  /**
   * *"Purely physical, a bound idol, not a proper spirit. No dispersal, no
   * reform, no exorcism requirement at all."* The cheapest thing they field is
   * the one thing anybody can just kill, which puts the fairness promise in
   * the power curve rather than in a special case in combat.
   */
  it('simply kills an Effigy', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    const idol = ours(state, 'effigy', seat.x + 4, seat.y + 4);
    expect(scatters(state, idol)).toBe(false);
    destroyUnit(state, idol, 'is wiped out');
    expect(scatteredOf(state, 0)).toHaveLength(0);
  });

  /**
   * *"Ordinary defeat sends it home at full strength, instantly -- no site
   * requirement, no failure roll."* The standout soft defeat, and the reason
   * to build one.
   */
  it('sends an Archon home at once, whole, with no building and no roll', () => {
    const state = theirs();
    const far = town(state);
    const ruler = ours(state, UNIQUE, far.x + 2, far.y + 2);
    ruler.rank = 1;
    ruler.hp = 2;
    destroyUnit(state, ruler, 'is wiped out', other(state, 1, 'footman', ruler.x, ruler.y));
    const back = theirsOf(state, UNIQUE);
    expect(back).toHaveLength(1);
    // Nearest rather than the capital: it is not a retreat, it is the thing
    // not having been interrupted.
    expect([back[0].x, back[0].y]).toEqual([far.x, far.y]);
    expect(back[0].hp).toBe(unitType(UNIQUE).hp);
    expect(back[0].rank).toBe(1);
    expect(scatteredOf(state, 0)).toHaveLength(0);
  });

  it('destroys an Archon put down by an exorcist', () => {
    const state = theirs();
    const seat = town(state, [REFORM_SITES[0]]);
    const ruler = ours(state, UNIQUE, seat.x + 4, seat.y + 4);
    destroyUnit(state, ruler, 'is wiped out', other(state, 1, 'paladin', ruler.x, ruler.y));
    expect(theirsOf(state, UNIQUE)).toHaveLength(0);
    expect(scatteredOf(state, 0)).toHaveLength(0);
  });

  it('leaves an Archon nowhere to go when its empire has no towns', () => {
    const state = theirs();
    destroyUnit(state, spawnUnit(state, 0, UNIQUE, 4, 4), 'is wiped out');
    expect(theirsOf(state, UNIQUE)).toHaveLength(0);
  });

  /**
   * *"World-unique per faction -- only one can exist at a time; a second can't
   * be built while the first lives."* Not offered rather than refused on
   * completion, which is how the endings and the follies read, and for the
   * same reason: a city that spent seventy shields on a unit it was never
   * going to get is a bug the player experiences as one.
   */
  it('offers one Archon, and not a second', () => {
    const everything = TECHS.filter((t) => t.faction === 'unbound' || t.faction === 'both').map(
      (t) => t.id,
    );
    const state = theirs(everything);
    const seat = town(state);
    seat.size = 4;
    const offered = () => buildOptions(state, seat).units.some((u) => u.id === UNIQUE);
    expect(offered()).toBe(true);
    const ruler = ours(state, UNIQUE, seat.x + 5, seat.y + 5);
    expect(holdsUnique(state, 0)).toBe(true);
    expect(offered()).toBe(false);
    // Away rather than dead still counts: a second built while the first is
    // scattered would be two of them a turn later.
    town(state, [REFORM_SITES[0]]);
    destroyUnit(state, ruler, 'is wiped out', other(state, 1, 'paladin', ruler.x, ruler.y));
    expect(holdsUnique(state, 0)).toBe(false);
    expect(offered()).toBe(true);
  });

  /**
   * *"Genuinely new, not a reskin of anything on another roster -- meaningfully
   * stronger when adjacent to water terrain."* Both feet, because what the
   * bonus is about is the Naiad being somewhere it belongs rather than it
   * being on the front foot.
   */
  it('makes a Naiad stronger beside water, attacking and holding', () => {
    const state = theirs();
    // Water put beside exactly one of two Naiads, and dry ground put round the
    // other: which tiles this seed happens to have made wet is not the point.
    const dry = spawnUnit(state, 0, 'naiad', 4, 4);
    const wet = spawnUnit(state, 0, 'naiad', 20, 10);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.terrain[(4 + dy) * state.width + (4 + dx)] = 'grass';
      }
    }
    state.terrain[10 * state.width + 21] = 'water';
    const foe = spawnUnit(state, 1, 'footman', 26, 16);
    expect(besideWater(state, dry)).toBe(false);
    expect(besideWater(state, wet)).toBe(true);
    expect(attackStrength(state, wet, foe).total).toBeGreaterThan(
      attackStrength(state, dry, foe).total,
    );
    expect(defenseStrength(state, wet, foe).total).toBeGreaterThan(
      defenseStrength(state, dry, foe).total,
    );
  });

  it('does not give the bonus to anything else standing in the shallows', () => {
    const state = theirs();
    state.terrain[10 * state.width + 21] = 'water';
    expect(besideWater(state, spawnUnit(state, 0, 'revenant', 20, 10))).toBe(false);
  });
});

describe('the Spirit Party invites whoever dies near it', () => {
  /** Standing is not enough: it has to be counting down. */
  function party(state: GameState, counting = true): City {
    const city = town(state, ['guestList', 'spiritParty']);
    if (counting) city.endingSince = state.turn;
    return city;
  }

  const guestsIn = (state: GameState, city: City) =>
    state.units.filter((u) => u.owner === 0 && u.x === city.x && u.y === city.y);

  it('turns somebody else’s dead into one of theirs', () => {
    const state = theirs();
    const pavilion = party(state);
    const victim = other(state, 1, 'footman', pavilion.x + 1, pavilion.y);
    destroyUnit(state, victim, 'is wiped out', ours(state, 'revenant', victim.x, victim.y));
    expect(guestsIn(state, pavilion).length).toBeGreaterThan(0);
  });

  /** Killed by anybody at all: it is their party, they did not have to be there. */
  it('counts somebody a third party killed', () => {
    const state = theirs();
    const pavilion = party(state);
    const victim = other(state, 1, 'footman', pavilion.x + 1, pavilion.y);
    destroyUnit(state, victim, 'is wiped out', other(state, 2, 'orc', victim.x, victim.y));
    expect(guestsIn(state, pavilion).length).toBeGreaterThan(0);
  });

  it('does nothing before the clock starts', () => {
    const state = theirs();
    const quiet = party(state, false);
    destroyUnit(state, other(state, 1, 'footman', quiet.x + 1, quiet.y), 'is wiped out');
    expect(guestsIn(state, quiet)).toHaveLength(0);
  });

  it('does nothing out of reach', () => {
    const state = theirs();
    const pavilion = party(state);
    const far = spawnUnit(
      state,
      1,
      'footman',
      Math.min(state.width - 1, pavilion.x + GUEST_LIST.reach + 2),
      pavilion.y,
    );
    destroyUnit(state, far, 'is wiped out');
    expect(guestsIn(state, pavilion)).toHaveLength(0);
  });

  it('does nothing to its own, which scatter as they always did', () => {
    const state = theirs();
    const pavilion = party(state);
    destroyUnit(state, ours(state, 'revenant', pavilion.x + 1, pavilion.y), 'is wiped out');
    expect(guestsIn(state, pavilion)).toHaveLength(0);
  });

  /** A lever, so a sweep can hold the arm where the ending is flavour only. */
  it('can be switched off whole', () => {
    const state = theirs();
    const pavilion = party(state);
    GUEST_LIST.enabled = false;
    try {
      destroyUnit(state, other(state, 1, 'footman', pavilion.x + 1, pavilion.y), 'is wiped out');
      expect(guestsIn(state, pavilion)).toHaveLength(0);
    } finally {
      GUEST_LIST.enabled = true;
    }
  });

  /**
   * **Derived rather than tabulated**, which is the whole of the design here:
   * section 146's `RECRUIT_AS` is a hand-written map of source ids to tiers and
   * it was stale twice over. So this asks what the derivation has to get right
   * -- that everybody has somewhere to come back as, and that nobody comes
   * back as either of the two that are not on offer.
   */
  it('finds a tier for everything on every roster', () => {
    for (const c of CREATURES) {
      if (c.faction === 'unbound') continue;
      const as = guestAs(c.id);
      expect(as, `${c.name} has nothing to come back as`).toBeTruthy();
      expect(PHYSICAL.has(as!), `${c.name} came back as an object`).toBe(false);
      expect(as, `${c.name} came back as the unique one`).not.toBe(UNIQUE);
    }
  });

  it('brings a worker back as something that works and a caster as a caster', () => {
    expect(unitType(guestAs('peon')!).role).toBe('worker');
    expect(unitType(guestAs('mage')!).role).toBe('caster');
    // A siege engine comes back as one, because they field a Cairn.
    const siege = CREATURES.find((c) => c.role === 'siege')!;
    expect(unitType(guestAs(siege.id)!).role).toBe('siege');
    // And something whose role they do not field at all comes back with hands.
    const flier = CREATURES.find((c) => c.role === 'flying')!;
    expect(CREATURES.some((c) => c.faction === 'unbound' && c.role === 'flying')).toBe(false);
    expect(unitType(guestAs(flier.id)!).role).toBe('melee');
  });
});

describe('the data the rules read', () => {
  it('names creatures that exist, for every exception', () => {
    for (const id of [...PHYSICAL, ...BOUND, ...WATERSIDE.who, UNIQUE]) {
      expect(
        CREATURES.some((c) => c.id === id && c.faction === 'unbound'),
        `${id} is named in a rule and is not an Unbound creature`,
      ).toBe(true);
    }
  });

  it('names buildings that exist, for both reform sites', () => {
    for (const id of REFORM_SITES) {
      expect(BUILDINGS[id], `${id} is a reform site and is not a building`).toBeTruthy();
      expect(BUILDINGS[id].faction).toBe('unbound');
      expect(
        TECHS.some((t) => t.buildings.includes(id)),
        `${id} is unlocked by nothing`,
      ).toBe(true);
    }
  });

  /** Each of the three follies does something, and each is hung on an advance. */
  it('hangs all three follies on an advance, each doing one thing', () => {
    const follies = Object.values(BUILDINGS).filter(
      (b) => b.faction === 'unbound' && b.folly !== undefined,
    );
    expect(follies).toHaveLength(3);
    for (const f of follies) {
      expect(
        TECHS.some((t) => t.buildings.includes(f.id)),
        `${f.name} is unlocked by nothing`,
      ).toBe(true);
      const does = (f.reformOdds ?? 0) + (f.garrisonDefense ?? 0) + (f.boundDiscount ?? 0);
      expect(does, `${f.name} does nothing`).toBeGreaterThan(0);
    }
  });
});
