import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import {
  NEGOTIATION,
  FACTIONS,
  FACTION_IDS,
  STARTING_FACTIONS,
  rivalFactions,
  talks,
} from '../src/model/factions';
import { CREATURES, CROWD_THRESHOLD, UNIT_TYPES, unitType, unitTypeId } from '../src/model/units';
import { HIVE_ENDING } from '../src/sim/hivekin';
import { DIFFICULTIES } from '../src/sim/difficulty';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS, TECHS_BY_ID } from '../src/model/techs';
import { ADVISORS } from '../src/model/advisors';
import { CITIZEN_RACES } from '../src/model/citizens';
import { createGame, playerUnits, spawnUnit } from '../src/sim/gamestate';
import { assignWorkers, cityYield, foundCity, productionCostIn } from '../src/sim/city';
import { atPeace, hostile, signPeace, PEACE } from '../src/sim/diplomacy';
import { attackStrength } from '../src/sim/combat';
import { dominanceShare } from '../src/sim/turn';
import { HIVEKIN, hivekinOf, placeQueen } from '../src/sim/hivekin';
import { endingFor } from '../src/sim/endings';
import { effectiveMove } from '../src/sim/rules';
import { HIVE_RULES } from '../src/ui/pedia';
import { QUEEN } from '../src/sim/hivekin';
import { BURROW } from '../src/sim/burrow';

/**
 * Section 125 slice A: the third side exists, and is counted.
 *
 * Slice A deliberately adds no new mechanics -- no Sink, no Burrow, no Queen
 * succession. What it adds is a **seat**: a faction that emerges, settles,
 * researches, builds, and can win. These tests are about that seat being a real
 * one and about the places the engine used to say "the other side" and meant it.
 */

function board(): GameState {
  const state = createGame({ seed: 20261002, width: 30, height: 20, barbarians: false });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  state.log.length = 0;
  return state;
}

/** A Hivekin seat on a two-player board, as emergence would leave one. */
function withHive(state: GameState): number {
  const id = state.players.length;
  state.players.push({
    ...state.players[1],
    id,
    faction: 'hivekin',
    name: FACTIONS.hivekin.civName,
    leader: FACTIONS.hivekin.leader,
    alive: true,
    techs: ['first-hivekin'],
    explored: new Array(state.width * state.height).fill(1),
    visible: new Array(state.width * state.height).fill(1),
  });
  return id;
}

describe('the roster', () => {
  /**
   * This test used to assert the opposite -- no ladder anywhere, "which is the
   * whole of what they are" -- straight off the first bible. Jeremy's answer of
   * 2026-10-04 was that he is not beholden to it and the game's oldest joke
   * should reach the Hive too, so what is pinned here is the *shape* of their
   * version of it rather than its absence.
   */
  it('stacks the shapes quantity is the point of, and nothing else', () => {
    const castes = CREATURES.filter((c) => c.faction === 'hivekin');
    expect(castes.length).toBe(14);
    const ladder = castes.filter((c) => c.counts.length > 1).map((c) => c.id);
    expect(ladder.sort()).toEqual(['elite', 'fodder', 'soldier', 'spitter']);

    // The Fodder-caste *is* the Goblin -- same attack, defence, health and
    // price -- so it gets the Goblin's ladder exactly, and nothing about the
    // rungs needed calibrating.
    const goblin = CREATURES.find((c) => c.id === 'goblin')!;
    const fodder = CREATURES.find((c) => c.id === 'fodder')!;
    expect([fodder.attack, fodder.defense, fodder.hp, fodder.cost]).toEqual([
      goblin.attack,
      goblin.defense,
      goblin.hp,
      goblin.cost,
    ]);
    expect(fodder.counts).toEqual(goblin.counts);
  });

  it('never groups a shape whose work would not double', () => {
    // A group is N times the attack, N times the defence and N times the price,
    // and exactly one unit's worth of *actions* -- nothing scales those. So the
    // ladder belongs only on shapes whose whole job is a number in a fight.
    // Two Workers at fifteen each dig two tiles; Two Workers as one unit costs
    // thirty and digs one. The AI never built one, so this costs nothing today
    // -- it is here for the player who will be able to pick the Hivekin, and
    // whose unit card would show doubled attack and defence and say nothing
    // about digging.
    for (const c of CREATURES.filter((x) => x.faction === 'hivekin' && x.counts.length > 1)) {
      expect(c.role, `${c.id} groups but does not fight`).not.toBe('worker');
      expect(c.attack, `${c.id} groups but has no attack to multiply`).toBeGreaterThan(0);
    }
  });

  it('never puts two Queens or two Princesses on one tile', () => {
    // The seat holds one Queen and the succession grows one replacement. A
    // group variant of either would mean two of a thing the whole faction is
    // built around there being one of.
    for (const id of ['queen', 'princess']) {
      expect(CREATURES.find((c) => c.id === id)!.counts, id).toEqual([1]);
    }
  });

  it('buys the whole ladder in two advances where the Horde needs six', () => {
    const rungs = (faction: string) =>
      TECHS.filter((t) => t.faction === faction && t.units.some((u) => u.includes('_x')));
    const hive = rungs('hivekin');
    const horde = rungs('orc');
    expect(hive).toHaveLength(2);
    expect(horde.length).toBeGreaterThanOrEqual(6);

    // And theirs is cheap, because they research about twelve advances in a
    // whole game: a Horde-shaped ladder would be half of it.
    const cost = (ts: typeof hive) => ts.reduce((n, t) => n + t.cost, 0);
    expect(cost(hive)).toBeLessThan(cost(horde) / 4);

    // One advance, every shape at once -- the inversion that makes it theirs.
    expect(new Set(hive.flatMap((t) => t.units.map((u) => u.split('_x')[0]))).size)
      .toBeGreaterThan(3);
  });

  it('loses nothing to crowding, because every shape with a ladder moves one', () => {
    const player = { techs: ['first-hivekin'] } as never;
    for (const c of CREATURES.filter((x) => x.faction === 'hivekin' && x.counts.length > 1)) {
      const biggest = unitTypeId(c.id, c.counts[c.counts.length - 1]);
      expect(unitType(biggest).crowded || c.counts[c.counts.length - 1] < CROWD_THRESHOLD).toBe(
        true,
      );
      // The Horde pays a movement point for a crowd until it learns to walk in
      // a line. These move one, and the floor is one, so they never do -- which
      // is why they are given no `coordination` advance to want.
      expect(effectiveMove(player, biggest), biggest).toBe(c.move);
    }
  });

  it('covers every role the other two sides field, except the two it refuses', () => {
    const roles = new Set(CREATURES.filter((c) => c.faction === 'hivekin').map((c) => c.role));
    for (const needed of ['worker', 'melee', 'ranged', 'siege', 'naval']) {
      expect(roles.has(needed as never), `no ${needed}`).toBe(true);
    }
    // No caster and no flier, on purpose: nothing in the Hivekin casts
    // anything, which is the premise the Warden-caste exists to preserve.
    expect(roles.has('caster')).toBe(false);
    expect(roles.has('flying')).toBe(false);
  });

  it('gives the Queen no way to move and no way to be built', () => {
    expect(unitType('queen').move).toBe(0);
    expect(TECHS.every((t) => !t.units.includes('queen'))).toBe(true);
  });

  it('arms the Bloat-caste exactly as the other artillery is armed', () => {
    const bloat = unitType('bloatcaste');
    expect(bloat.range).toBe(2);
    expect(bloat.siegeBonus).toBe(2);
    expect(bloat.ammo).toBe(5);
    expect(bloat.reloadsBy).toBe('labour');
    // Which means the Spitter is the only thing that can reload it -- the same
    // shape as the Archer and the Ballista. Section 125 slice 0.
    expect(unitType('spitter').firstStrikes).toBeGreaterThan(0);
  });

  it('keeps the Fodder slower than the Goblin, since they have no scout', () => {
    expect(unitType('fodder').move).toBe(1);
    expect(unitType('goblin').move).toBe(2);
    const fastest = Math.max(
      ...CREATURES.filter((c) => c.faction === 'hivekin' && !c.sails).map((c) => c.move),
    );
    // The Burrower is the quickest thing they have on land, and it costs more
    // than three times what a Fodder does.
    expect(fastest).toBe(unitType('burrower').move);
  });
});

describe('the tree', () => {
  it('starts them with a founder and a gatherer, and no Queen', () => {
    const first = TECHS_BY_ID['first-hivekin'];
    expect(first.cost).toBe(0);
    expect(first.units).toEqual(['grub', 'worker']);
    expect(FACTIONS.hivekin.startTech).toBe('first-hivekin');
    expect(FACTIONS.hivekin.settlerUnit).toBe('grub');
  });

  it('hands them a boat off the shared advance, as it does the other two', () => {
    expect(TECHS_BY_ID['mapmaking'].units).toContain('tidecaste');
    expect(unitType('tidecaste').carries).toBe(3);
  });

  it('reaches an ending of its own, in section 110 shape', () => {
    expect(endingFor('hivekin')).toBe('hive');
    const works = Object.values(BUILDINGS).filter((b) => b.faction === 'hivekin');
    expect(works.filter((b) => b.endingPart === 'hive')).toHaveLength(2);
    expect(works.filter((b) => b.victory === 'hive')).toHaveLength(1);
    expect(TECHS_BY_ID['all-is-the-hive'].flags).toContain('ending');
  });

  it('never offers a caste to a side that cannot grow it', () => {
    for (const t of TECHS) {
      for (const u of t.units) {
        const def = UNIT_TYPES[u];
        if (!def || t.faction === 'both') continue;
        expect(def.faction, `${t.id} grants ${u}`).toBe(t.faction);
      }
    }
  });
});

describe('the six who report', () => {
  it('fills the same roles as everybody else', () => {
    const mine = ADVISORS.filter((a) => a.faction === 'hivekin');
    expect(mine).toHaveLength(6);
    const roles = mine.map((a) => a.role).sort();
    const human = ADVISORS.filter((a) => a.faction === 'human')
      .map((a) => a.role)
      .sort();
    expect(roles).toEqual(human);
  });

  it('never exclaims, asks a rhetorical question, or calls anything a disaster', () => {
    // The register is the hardest thing to keep and the easiest to check: if a
    // line would sound right in the Blademaster's mouth, it is wrong in theirs.
    const forbidden = /!|\?|disaster|terrible|wonderful|excellent|brilliant|catastroph/i;
    for (const a of ADVISORS.filter((x) => x.faction === 'hivekin')) {
      for (const line of a.idle) {
        expect(line, `${a.id} idle`).not.toMatch(forbidden);
      }
    }
  });
});

describe('the people in the Hives', () => {
  it('has the fewest sorts of anybody, which is the joke', () => {
    const count = (f: string) => CITIZEN_RACES.filter((r) => r.faction === f).length;
    expect(count('hivekin')).toBe(4);
    expect(count('hivekin')).toBeLessThan(count('orc'));
  });

  it('asks for advances the Hivekin can actually learn', () => {
    for (const r of CITIZEN_RACES.filter((x) => x.faction === 'hivekin')) {
      if (!r.needs) continue;
      const tech = TECHS_BY_ID[r.needs];
      expect(tech, `${r.id} needs ${r.needs}`).toBeDefined();
      expect(['both', 'hivekin']).toContain(tech.faction);
    }
  });
});

describe('a side that does come to the table, and is still not like you', () => {
  /**
   * Section 135 slice 3b reversed section 125's answer, on Jeremy's: *"No
   * definitely not, they're alien to orcs/humans not silent."* What the Hive
   * wants out of a table is what makes it alien, not whether it turns up.
   */
  it('talks, and says so behind a lever so a sweep can take it away again', () => {
    expect(talks('orc')).toBe(true);
    expect(talks('human')).toBe(true);
    expect(talks('hivekin')).toBe(true);
    NEGOTIATION.hivekin = false;
    try {
      expect(talks('hivekin')).toBe(false);
      // And only theirs. A lever that silenced everybody would measure
      // something else entirely.
      expect(talks('orc')).toBe(true);
    } finally {
      NEGOTIATION.hivekin = true;
    }
  });

  it('is not quietly included in somebody else’s peace', () => {
    const state = board();
    const hive = withHive(state);
    expect(PEACE.enabled).toBe(true);
    signPeace(state, { from: 0, to: 1, gold: 0 });

    // The two who signed it are at peace and may not fight.
    expect(atPeace(state, 0, 1)).toBe(true);
    expect(hostile(state, 0, 1)).toBe(false);

    // The third side signed nothing. Before this rule the peace was a single
    // global flag, so both of these came back the wrong way round and nobody
    // could attack the Hivekin at all.
    expect(atPeace(state, 0, hive)).toBe(false);
    expect(atPeace(state, 1, hive)).toBe(false);
    expect(hostile(state, 0, hive)).toBe(true);
    expect(hostile(state, 1, hive)).toBe(true);
  });

  it('leaves every side two rivals it could in principle sign with', () => {
    expect(rivalFactions('orc')).toEqual(['human', 'hivekin']);
    // Two, where this said one until slice 3b -- which is exactly why
    // `rival()` picking "the first other talker" had to stop being a function
    // that returns one side.
    expect(rivalFactions('orc').filter(talks)).toEqual(['human', 'hivekin']);
    expect(rivalFactions('human').filter(talks)).toEqual(['orc', 'hivekin']);
    expect(rivalFactions('hivekin').filter(talks)).toEqual(['orc', 'human']);
  });
});

describe('a new Hive', () => {
  it('opens by building something it can actually build', () => {
    const state = board();
    const hive = withHive(state);
    const grub = spawnUnit(state, hive, 'grub', 10, 10);
    const city = foundCity(state, grub);
    expect(city).not.toBeNull();
    // The bug this replaces said `orc ? goblin : footman`, so a Hive would have
    // opened by trying to grow a Footman. Section 123's settler-prize bug again.
    expect(city!.producing).toEqual({ kind: 'unit', id: 'fodder' });
    expect(UNIT_TYPES['fodder'].faction).toBe('hivekin');
  });

  it('has her in it, immobile, and only the first one does', () => {
    const state = board();
    const hive = withHive(state);
    const first = foundCity(state, spawnUnit(state, hive, 'grub', 10, 10))!;
    const queens = playerUnits(state, hive).filter((u) => u.type === 'queen');
    expect(queens).toHaveLength(1);
    expect(queens[0].x).toBe(first.x);
    expect(queens[0].y).toBe(first.y);

    // A second Hive is a second Hive, not a second Queen. That is the ending.
    foundCity(state, spawnUnit(state, hive, 'grub', 14, 10));
    expect(playerUnits(state, hive).filter((u) => u.type === 'queen')).toHaveLength(1);
  });

  it('puts nobody in anybody else’s city', () => {
    const state = board();
    const orc = foundCity(state, spawnUnit(state, 0, 'peon', 6, 6))!;
    placeQueen(state, orc);
    expect(state.units.some((u) => u.type === 'queen')).toBe(false);
  });
});

describe('the three follies', () => {
  function hiveCity(state: GameState, owner: number): City {
    const city = foundCity(state, spawnUnit(state, owner, 'grub', 10, 10))!;
    city.size = 4;
    assignWorkers(state, city);
    return city;
  }

  it('makes the Undercity’s shields survive a pillaging, by not being on a tile', () => {
    const state = board();
    const hive = withHive(state);
    const city = hiveCity(state, hive);
    const before = cityYield(state, city).shields;

    city.buildings.push('undercity');
    expect(cityYield(state, city).shields).toBe(before + BUILDINGS['undercity'].cityShields!);

    // The whole of Jeremy's rule: take every worked tile away -- which is worse
    // than any pillaging could manage -- and the Undercity still pays.
    city.workedTiles = [];
    expect(cityYield(state, city).shields).toBeGreaterThanOrEqual(
      BUILDINGS['undercity'].cityShields!,
    );
  });

  it('discounts castes grown in a Broodwarmth Hive, and nothing else', () => {
    const state = board();
    const hive = withHive(state);
    const city = hiveCity(state, hive);
    const unit = { kind: 'unit', id: 'soldier' } as const;
    const building = { kind: 'building', id: 'granary' } as const;
    const unitBefore = productionCostIn(state, city, unit);
    const buildingBefore = productionCostIn(state, city, building);

    city.buildings.push('broodwarmth');

    expect(productionCostIn(state, city, unit)).toBeLessThan(unitBefore);
    // A building costs what it costs. It is a warm place to grow things in, not
    // a tax break.
    expect(productionCostIn(state, city, building)).toBe(buildingBefore);
  });

  it('sharpens two named castes with the Shell, and leaves the rest alone', () => {
    const state = board();
    const hive = withHive(state);
    const city = hiveCity(state, hive);
    const foe = spawnUnit(state, 0, 'footman', 11, 10);
    const lord = spawnUnit(state, hive, 'broodlord', 10, 11);
    const grunt = spawnUnit(state, hive, 'soldier', 9, 10);
    const lordBefore = attackStrength(state, lord, foe).total;
    const gruntBefore = attackStrength(state, grunt, foe).total;

    city.buildings.push('oldQueensShell');

    expect(attackStrength(state, lord, foe).total).toBeGreaterThan(lordBefore);
    expect(attackStrength(state, grunt, foe).total).toBe(gruntBefore);
  });
});

describe('three sides, counted', () => {
  it('asks the same dominance of each rival however many there are', () => {
    // 0.75 means "three times what the other side has". With two rivals that is
    // three fifths of the map, not three quarters -- and three quarters with two
    // rivals is an ending that can never fire.
    expect(dominanceShare(2)).toBeCloseTo(0.75, 5);
    expect(dominanceShare(3)).toBeCloseTo(0.6, 5);
    expect(dominanceShare(4)).toBeCloseTo(0.5, 5);
  });

  it('knows three factions and gives each one a full definition', () => {
    expect(FACTION_IDS).toHaveLength(3);
    for (const id of FACTION_IDS) {
      const def = FACTIONS[id];
      expect(def.cityNames.length, `${id} names`).toBe(24);
      expect(def.blurb.length, `${id} blurb`).toBeGreaterThan(20);
      expect(UNIT_TYPES[def.settlerUnit]?.settler, `${id} settler`).toBe(true);
      expect(UNIT_TYPES[def.starterUnit]?.faction, `${id} starter`).toBe(id);
    }
  });

  it('is not offered as a side to play, having no opening of its own', () => {
    // Out of scope for this slice and deliberately so: emergence exists to
    // leave the measured opening alone, and a Hivekin opening would be a new
    // one that nobody has measured. The picker reads the field rather than
    // guessing from `talks`, because a later faction could emerge and
    // negotiate, or start on the map and refuse to.
    expect(STARTING_FACTIONS).toEqual(['orc', 'human']);
    expect(FACTIONS.hivekin.startsOnMap).toBe(false);
  });

  it('does not put the Hivekin on the map at turn one', () => {
    const state = createGame({ seed: 7, width: 30, height: 20 });
    expect(state.players).toHaveLength(2);
    expect(hivekinOf(state)).toBeNull();
    expect(state.players.map((p) => p.faction).sort()).toEqual(['human', 'orc']);
  });

  it('draws an arrival turn inside its window, from the seed rather than the stream', () => {
    // Taking nothing from the shared stream is what lets an arm with the
    // Hivekin switched off be the same game as before this section, rather than
    // a differently-shuffled one.
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const a = createGame({ seed, width: 30, height: 20 });
      const b = createGame({ seed, width: 30, height: 20 });
      expect(a.rngState).toBe(b.rngState);
      const at = a.hivekinAt;
      if (at !== undefined) seen.add(at);
    }
    for (const at of seen) {
      expect(at).toBeGreaterThanOrEqual(HIVEKIN.from);
      expect(at).toBeLessThanOrEqual(HIVEKIN.until);
    }
  });
});

describe('what the book says about them', () => {
  /**
   * The Hivekin pane used to open on "She does not move", with no antecedent
   * for "she" anywhere above it but a flavour blurb -- and nothing to say that
   * a Hive is their word for a city, a caste their word for a unit, that they
   * are not on the map when the game begins, or how they behave at a table.
   * Every rule in the block assumes those four things.
   *
   * The fourth used to be "they cannot be talked to", asserted here as *"no
   * peace to be made"*. Section 135 slice 3b reversed that and this assertion
   * was not updated with it, so the book went on saying nobody negotiates with
   * the Hive for as long as it took the next change to trip over it. Pinning a
   * rule in the book is only worth doing if the pin moves when the rule does.
   */
  it('says who everybody is before it says what they do', () => {
    const intro = HIVE_RULES.slice(0, HIVE_RULES.indexOf('She does not move'));
    expect(intro).toMatch(/Hives/);
    expect(intro).toMatch(/castes/);
    expect(intro).toMatch(/Queen/);
    // When they turn up, and that they are not there at the start.
    expect(intro).toMatch(/not on the map when the game starts/i);
    expect(intro).toMatch(new RegExp(`${HIVEKIN.from}`));
    expect(intro).toMatch(new RegExp(`${HIVEKIN.until}`));
    // And the rule an empire player will otherwise learn by trying it: they
    // do come to the table, and a treaty with them binds that pair alone.
    expect(intro).toMatch(/will talk/i);
    expect(intro).toMatch(/signed for itself/i);
    // Section 136: and that when they arrive is the level's business.
    expect(intro).toMatch(/level you chose/i);
  });

  it('never prints a number it failed to look up', () => {
    // Every figure in the block is interpolated from the levers, so a renamed
    // one would read "undefined" to the player rather than failing anywhere.
    expect(HIVE_RULES).not.toMatch(/undefined|NaN|\[object/);
    for (const n of [HIVEKIN.from, HIVEKIN.until, HIVEKIN.grace, QUEEN.countdown, BURROW.range]) {
      expect(typeof n, 'a lever the book quotes').toBe('number');
      expect(HIVE_RULES).toContain(String(n));
    }
  });

  it('is written for both readers, so it never says "you are" the Hive', () => {
    // The same block is shown in the Hivekin player's own pane and in the pane
    // about them, so it stays in the third person throughout.
    expect(HIVE_RULES).not.toMatch(/\byour Hive\b|\byou are the\b|\byour Queen\b/i);
  });
});

/**
 * Section 136: the ending is priced by how long the Hive has had to pay.
 *
 * The three works cost six hundred shields against the other endings'
 * thousand, and `buildings.ts` says why -- the Hive pays out of 3.5 towns
 * where an empire pays out of six. That is right for a side that does not
 * exist until turn ninety and wrong for one that has been there all along: a
 * turn-one Hive measured 83% against a 64% baseline, winning in 141 turns
 * against 230, with ten of thirteen wins on this very ending.
 */
describe('what the Hive pays for its ending (section 136)', () => {
  function hiveCity(joined: number | undefined) {
    const state = board();
    const hive = withHive(state);
    state.players[hive].joinedAt = joined;
    const city = foundCity(state, spawnUnit(state, hive, 'grub', 10, 10))!;
    return { state, city };
  }

  const works = ['moltingChamber', 'secondFeeding', 'secondQueenShell'] as const;

  it('charges a Hive that emerged on time exactly what it always did', () => {
    const { state, city } = hiveCity(HIVEKIN.from);
    for (const id of works) {
      expect(productionCostIn(state, city, { kind: 'building', id })).toBe(BUILDINGS[id].cost);
    }
  });

  it('charges a Hive that has been there since turn one an empire’s price', () => {
    const { state, city } = hiveCity(1);
    const total = works.reduce(
      (t, id) => t + productionCostIn(state, city, { kind: 'building', id }),
      0,
    );
    const shipped = works.reduce((t, id) => t + BUILDINGS[id].cost, 0);
    expect(shipped).toBe(600);
    // The other two endings cost a thousand, and a Hive with the whole game is
    // what an empire is. Both anchors are facts rather than guesses.
    expect(total).toBe(1000);
  });

  it('treats a seat that was never given an arrival as having started', () => {
    const { state, city } = hiveCity(undefined);
    expect(productionCostIn(state, city, { kind: 'building', id: 'secondQueenShell' })).toBe(
      productionCostIn(hiveCity(1).state, hiveCity(1).city, {
        kind: 'building',
        id: 'secondQueenShell',
      }),
    );
  });

  it('charges something in between for a Hive that turned up in between', () => {
    const early = hiveCity(1);
    const mid = hiveCity(Math.round(HIVEKIN.from / 2));
    const late = hiveCity(HIVEKIN.from);
    const price = (c: ReturnType<typeof hiveCity>) =>
      productionCostIn(c.state, c.city, { kind: 'building', id: 'secondQueenShell' });
    expect(price(mid)).toBeGreaterThan(price(late));
    expect(price(mid)).toBeLessThan(price(early));
  });

  it('leaves everything at the shipped price with the lever off', () => {
    HIVE_ENDING.scaled = false;
    try {
      const { state, city } = hiveCity(1);
      for (const id of works) {
        expect(productionCostIn(state, city, { kind: 'building', id })).toBe(BUILDINGS[id].cost);
      }
    } finally {
      HIVE_ENDING.scaled = true;
    }
  });

  it('does not touch anybody else’s buildings', () => {
    const state = board();
    const hive = withHive(state);
    state.players[hive].joinedAt = 1;
    const city = foundCity(state, spawnUnit(state, hive, 'grub', 10, 10))!;
    expect(productionCostIn(state, city, { kind: 'building', id: 'barracks' })).toBe(
      BUILDINGS.barracks.cost,
    );
  });
});

/**
 * Section 136: and when they turn up is a difficulty dial.
 *
 * Jeremy: "a staggered arrival depending on game difficulty (later is easier,
 * same time is harder)." A third contender appearing is the largest single
 * thing that can happen to a game, so *when* changes how much of it you get to
 * yourself -- without changing any number you are playing against.
 */
describe('when the Hive turns up, by level (section 136)', () => {
  it('is unchanged at Normal, which every earlier measurement used', () => {
    expect(DIFFICULTIES.find((d) => d.id === 'normal')!.hiveArrives).toBe(0);
  });

  it('runs later the easier the game is, and earlier the harder', () => {
    const order = ['easiest', 'easy', 'normal', 'hard', 'hardest'] as const;
    const shifts = order.map((id) => DIFFICULTIES.find((d) => d.id === id)!.hiveArrives);
    for (let i = 1; i < shifts.length; i++) {
      expect(shifts[i], `${order[i]} against ${order[i - 1]}`).toBeLessThan(shifts[i - 1]);
    }
  });

  it('never asks for a turn before the first one', () => {
    for (const d of DIFFICULTIES) {
      expect(HIVEKIN.from + d.hiveArrives, d.id).toBeGreaterThan(-HIVEKIN.until);
    }
  });
});
