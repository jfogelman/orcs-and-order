import { beforeEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity, rushCost } from '../src/sim/city';
import { CARAVANS, advanceCaravanWork, startCaravan } from '../src/sim/caravans';
import {
  RECRUIT,
  aiAsks,
  RECRUIT_AS,
  canRecruit,
  recruitFailOdds,
  recruitPrice,
  recruitTargets,
  recruitUnit,
  recruitsAs,
} from '../src/sim/recruiting';
import { standing } from '../src/sim/diplomacy';
import { TERRAIN } from '../src/model/terrain';
import { CREATURES, unitType } from '../src/model/units';
import { idx } from '../src/engine/grid';
import type { GameState, Unit } from '../src/model/types';

/**
 * Section 145. Recruit, which is the reason this faction exists.
 *
 * `WANDERERS_PLAN.md`: two ways onto the roster, *"deliberately priced
 * apart"*. Create costs a quarter more than anybody else pays for the same
 * thing; Recruit is always cheaper, needs a Caravan that can see the target,
 * and can fail outright with the gold already gone.
 */
let state: GameState;

function land(nth = 0): { x: number; y: number } {
  let seen = 0;
  for (let y = 2; y < state.height - 2; y++) {
    for (let x = 2; x < state.width - 2; x++) {
      if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
      if (state.cities.some((c) => Math.abs(c.x - x) < 3 && Math.abs(c.y - y) < 3)) continue;
      if (seen++ === nth) return { x, y };
    }
  }
  throw new Error('no dry ground on this map');
}

/** A standing Caravan at `at`, built the long way so nothing is faked. */
function caravanAt(at: { x: number; y: number }): void {
  const w = spawnUnit(state, 0, 'peon', at.x, at.y);
  startCaravan(state, w);
  for (let t = 0; t < CARAVANS.turns; t++) advanceCaravanWork(state, w);
  // The worker has done its job; it is not part of any crowd being measured.
  state.units = state.units.filter((u) => u !== w);
}

beforeEach(() => {
  state = createGame({ seed: 11, width: 30, height: 20, barbarians: true });
  state.players[0].faction = 'wandering';
  state.players[0].techs = ['first-wanderers', 'caravan-building'];
  state.players[0].gold = 5000;
});

describe('who can be asked', () => {
  it('turns every source the bible names into its listed equivalent', () => {
    // The table is the bible's "Rough equivalent" column. Read back rather
    // than retyped, so a change to one has to be a change to both.
    for (const [from, to] of Object.entries(RECRUIT_AS)) {
      expect(CREATURES.some((c) => c.id === from), `${from} is not a creature`).toBe(true);
      expect(CREATURES.some((c) => c.id === to), `${to} is not a creature`).toBe(true);
      expect(unitType(to).faction, `${to} is not ours`).toBe('wandering');
    }
  });

  /**
   * *"Dragon, Paladin, Death Knight, and Mage stay unrecruitable -- too
   * bonded, too trained, too specific to just walk over."* They fall out of
   * the rule rather than being listed as exceptions: there is no tier to turn
   * them into.
   */
  it('refuses the four the bible says are not for sale', () => {
    for (const id of ['dragon', 'paladin', 'deathknight', 'mage']) {
      const u = spawnUnit(state, 1, id, 12, 12);
      expect(recruitsAs(u), id).toBeNull();
    }
  });

  it('refuses anything with no Wandering Folk tier to become', () => {
    // Ships, siege and spies were never in the bible's table and need no
    // exception written for them.
    for (const id of ['frigate', 'intelligencer', 'scout']) {
      const u = spawnUnit(state, 1, id, 14, 12);
      expect(recruitsAs(u), id).toBeNull();
    }
  });

  it('needs a Caravan that can see them', () => {
    const here = land();
    const them = spawnUnit(state, 1, 'footman', here.x, here.y + 1);
    expect(canRecruit(state, 0, them).ok).toBe(false);
    caravanAt(here);
    expect(canRecruit(state, 0, them).ok).toBe(true);
  });

  it('is nobody else’s mechanic', () => {
    const here = land();
    caravanAt(here);
    const them = spawnUnit(state, 1, 'footman', here.x, here.y + 1);
    state.players[0].faction = 'orc';
    expect(canRecruit(state, 0, them).ok).toBe(false);
  });

  it('gives one Caravan one attempt a turn', () => {
    const here = land();
    caravanAt(here);
    const a = spawnUnit(state, 1, 'footman', here.x, here.y + 1);
    const b = spawnUnit(state, 1, 'footman', here.x + 1, here.y + 1);
    expect(recruitUnit(state, 0, a).kind).not.toBe('blocked');
    const second = canRecruit(state, 0, b);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/already asked/);
    state.turn++;
    expect(canRecruit(state, 0, b).ok).toBe(true);
  });
});

describe('what it costs', () => {
  function pair(): { me: { x: number; y: number }; them: Unit } {
    const here = land();
    caravanAt(here);
    return { me: here, them: spawnUnit(state, 1, 'footman', here.x, here.y + 1) };
  }

  /**
   * The bible's hard requirement: *"Recruit -- always cheaper than Create at
   * the same tier."*
   *
   * **Against what, though.** Create is paid in shields and Recruit in gold,
   * so the first draft of this compared a gold price to a shield cost and
   * failed on the cheapest tier -- which was the test being wrong, not the
   * price. The honest comparison is the one a player actually faces: the gold
   * it would take to have that unit *now*, which is `rushCost`.
   */
  it('always undercuts paying to have the same unit now', () => {
    const { them } = pair();
    const city = foundCity(state, spawnUnit(state, 0, 'peon', land(30).x, land(30).y))!;
    for (const [from, to] of Object.entries(RECRUIT_AS)) {
      them.type = from as Unit['type'];
      them.hp = unitType(from).hp;
      city.producing = { kind: 'unit', id: to as Unit['type'] };
      city.shields = 0;
      expect(recruitPrice(state, 0, them), `${from} -> ${to}`).toBeLessThan(
        rushCost(state, city),
      );
    }
  });

  it('charges less for somebody who has already been beaten up', () => {
    const { them } = pair();
    const full = recruitPrice(state, 0, them);
    them.hp = 1;
    expect(recruitPrice(state, 0, them)).toBeLessThan(full);
  });

  it('charges less when our own are standing about nearby', () => {
    const { me, them } = pair();
    const alone = recruitPrice(state, 0, them);
    for (let n = 0; n < 4; n++) spawnUnit(state, 0, 'warband', me.x, me.y);
    expect(recruitPrice(state, 0, them)).toBeLessThan(alone);
  });

  /**
   * The best line in the bible, and it had to survive into the numbers:
   * *"you can't offer someone something better than what they already have if
   * they don't have anything to compare it to."*
   */
  it('charges a raider more than a soldier, not less', () => {
    const here = land();
    caravanAt(here);
    const regular = spawnUnit(state, 1, 'footman', here.x, here.y + 1);
    // The raiders are a real seat in this game rather than a flag on an
    // existing one, so the test asks for one instead of inventing player 2.
    const wild = state.players.find((p) => p.barbarian) ?? null;
    expect(wild, 'this map seats no raiders').not.toBeNull();
    const raider = spawnUnit(state, wild!.id, 'footman', here.x + 1, here.y + 1);
    expect(recruitPrice(state, 0, raider)).toBeGreaterThan(recruitPrice(state, 0, regular));
  });

  it('moves the odds the same way it moves the price', () => {
    const { them } = pair();
    const full = recruitFailOdds(state, 0, them);
    them.hp = 1;
    // A battered target is both cheaper and likelier to say yes, which is the
    // bible's rule rather than a simplification of it.
    expect(recruitFailOdds(state, 0, them)).toBeLessThan(full);
  });

  it('keeps the failure odds inside their band whatever happens', () => {
    const { me, them } = pair();
    them.hp = 1;
    for (let n = 0; n < 40; n++) spawnUnit(state, 0, 'warband', me.x, me.y);
    expect(recruitFailOdds(state, 0, them)).toBeGreaterThanOrEqual(RECRUIT.failFloor);
    expect(recruitFailOdds(state, 0, them)).toBeLessThanOrEqual(RECRUIT.failCap);
  });
});

describe('asking', () => {
  function setup(): { me: { x: number; y: number }; them: Unit } {
    const here = land();
    caravanAt(here);
    return { me: here, them: spawnUnit(state, 1, 'knight', here.x, here.y + 1) };
  }

  it('spends the gold whether or not it works', () => {
    const { them } = setup();
    const before = state.players[0].gold;
    const out = recruitUnit(state, 0, them);
    expect(out.kind === 'joined' || out.kind === 'refused').toBe(true);
    if (out.kind !== 'blocked') expect(state.players[0].gold).toBe(before - out.gold);
  });

  it('renormalises rather than re-badging', () => {
    const { them } = setup();
    them.rank = 3;
    // Forced, so the test is about what arrives rather than about a dice roll.
    RECRUIT.failBase = 0;
    RECRUIT.failFloor = 0;
    try {
      const out = recruitUnit(state, 0, them);
      expect(out.kind).toBe('joined');
      expect(them.owner).toBe(0);
      // A Knight becomes an Outcast, at an Outcast's health, with nobody
      // else's decorations.
      expect(them.type).toBe('outcast');
      expect(them.hp).toBe(unitType('outcast').hp);
      expect(them.rank).toBe(0);
      expect(them.recruitedFrom).toBe(1);
    } finally {
      RECRUIT.failBase = 0.34;
      RECRUIT.failFloor = 0.06;
    }
  });

  /**
   * *"Attempting a recruit within an enemy faction's own sight-lines counts as
   * a hostile act against them regardless of whether the attempt succeeds."*
   */
  it('costs standing when they can see it, win or lose', () => {
    const { them } = setup();
    state.players[1].visible[idx(them.x, them.y, state.width)] = 1;
    const before = standing(state, 0, 1);
    const out = recruitUnit(state, 0, them);
    expect(out.kind).not.toBe('blocked');
    if (out.kind !== 'blocked') expect(out.provoked).toBe(true);
    expect(standing(state, 0, 1)).toBeLessThan(before);
  });

  it('costs nothing with somebody who never saw it happen', () => {
    const { them } = setup();
    state.players[1].visible[idx(them.x, them.y, state.width)] = 0;
    const before = standing(state, 0, 1);
    const out = recruitUnit(state, 0, them);
    if (out.kind !== 'blocked') expect(out.provoked).toBe(false);
    expect(standing(state, 0, 1)).toBe(before);
  });

  it('lists everybody who could be asked right now', () => {
    const { me } = setup();
    spawnUnit(state, 1, 'archer', me.x + 1, me.y);
    // The Mage is in range and is one of the four nobody can have.
    spawnUnit(state, 1, 'mage', me.x - 1, me.y);
    const targets = recruitTargets(state, 0);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((u) => recruitsAs(u) !== null)).toBe(true);
    expect(targets.some((u) => unitType(u.type).base === 'mage')).toBe(false);
  });
});

/**
 * The other side asking, which is the half that makes this a faction rather
 * than a player toy.
 *
 * Section 125's lesson, for the fourth time: a mechanic the AI never uses is
 * a mechanic that is only ever measured by somebody clicking it.
 */
describe('the other side asks too', () => {
  it('wants the dearest thing it can afford good odds on', () => {
    const here = land();
    caravanAt(here);
    spawnUnit(state, 1, 'peasant', here.x, here.y + 1);
    spawnUnit(state, 1, 'knight', here.x + 1, here.y + 1);
    const asks = aiAsks(state, 0);
    expect(asks.length).toBeGreaterThan(0);
    // Sorted by what arrives, not by what was taken: an Outcast outranks a
    // Wanderer, so the Knight is asked before the Peasant.
    expect(recruitsAs(asks[0])).toBe('outcast');
  });

  it('will not ask for what it cannot pay for', () => {
    const here = land();
    caravanAt(here);
    spawnUnit(state, 1, 'knight', here.x, here.y + 1);
    state.players[0].gold = 0;
    expect(aiAsks(state, 0)).toEqual([]);
  });

  it('leaves long shots alone', () => {
    const here = land();
    caravanAt(here);
    const them = spawnUnit(state, 1, 'knight', here.x, here.y + 1);
    const was = RECRUIT.failFloor;
    RECRUIT.failFloor = 0.99;
    try {
      expect(aiAsks(state, 0)).toEqual([]);
    } finally {
      RECRUIT.failFloor = was;
    }
    expect(them.owner).toBe(1);
  });
});

/**
 * The Hivekin, and Jeremy's ruling on the question his bible never reached.
 *
 * I had left them out of `RECRUIT_AS` entirely and flagged it, which was the
 * wrong instinct: *"I worry that disallowing hivekin from recruitment is
 * problematic from a balance perspective -- potentially we could have the
 * lower castes be susceptible to something shiny (i.e. gold), but higher
 * castes are built too loyal (literally)."*
 *
 * So the line sits where the empires' does, and the flavour is the point:
 * **nobody is bought.** A caste is led off, and the price profile says so --
 * cheap, because there is no loyalty to outbid, and unreliable, because there
 * is nobody there to make a decision.
 */
describe('the Hive, led off rather than bought', () => {
  function castes(): { me: { x: number; y: number } } {
    const here = land();
    caravanAt(here);
    state.players[1].faction = 'hivekin';
    return { me: here };
  }

  it('takes the lower castes', () => {
    castes();
    for (const id of ['grub', 'worker', 'fodder', 'soldier', 'spitter', 'elite']) {
      const u = spawnUnit(state, 1, id, 15, 15);
      expect(recruitsAs(u), id).not.toBeNull();
    }
  });

  /** The Hive's Dragon, Paladin, Death Knight and Mage. */
  it('leaves the four that were built loyal', () => {
    castes();
    for (const id of ['broodlord', 'princess', 'warden', 'queen']) {
      const u = spawnUnit(state, 1, id, 16, 16);
      expect(recruitsAs(u), id).toBeNull();
    }
  });

  it('is cheaper than asking somebody with opinions, and likelier to fail', () => {
    const { me } = castes();
    const caste = spawnUnit(state, 1, 'soldier', me.x, me.y + 1);
    // The same tier from a side that has opinions about its employer.
    state.players[1].faction = 'human';
    const regular = spawnUnit(state, 1, 'footman', me.x + 1, me.y + 1);
    const regularPrice = recruitPrice(state, 0, regular);
    const regularFail = recruitFailOdds(state, 0, regular);
    state.players[1].faction = 'hivekin';
    expect(recruitPrice(state, 0, caste)).toBeLessThan(regularPrice);
    expect(recruitFailOdds(state, 0, caste)).toBeGreaterThan(regularFail);
  });

  it('says it happened to them rather than that they chose it', () => {
    const { me } = castes();
    const caste = spawnUnit(state, 1, 'fodder', me.x, me.y + 1);
    const was = RECRUIT.failBase;
    const wasFloor = RECRUIT.failFloor;
    RECRUIT.failBase = 0;
    RECRUIT.failFloor = 0;
    try {
      const out = recruitUnit(state, 0, caste);
      expect(out.kind).toBe('joined');
      const said = state.log[state.log.length - 1].text;
      expect(said).toMatch(/shiny/);
      expect(said).not.toMatch(/thought better/);
    } finally {
      RECRUIT.failBase = was;
      RECRUIT.failFloor = wasFloor;
    }
  });
});
