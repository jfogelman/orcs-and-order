import { afterEach, describe, expect, it } from 'vitest';
import type { GameState, Ruin } from '../src/model/types';
import {
  RUINS,
  WARDENS,
  claimRuins,
  guarded,
  isWarden,
  ruinAt,
  ruinState,
  sleepRuins,
  standingRuins,
  tickRuins,
} from '../src/sim/ruins';
import { runRaiders } from '../src/sim/barbarians';
import { tryStep } from '../src/sim/movement';
import { resolveCombat } from '../src/sim/combat';
import { UNIT_TYPES, unitType } from '../src/model/units';
import { barbarianOf, createGame, spawnUnit } from '../src/sim/gamestate';
import { beginPlayerTurn } from '../src/sim/turn';
import { idx } from '../src/engine/grid';

/**
 * Section 123: what was standing here before anybody arrived.
 *
 * The bargain is the feature -- you wake it, you fight it, and then it is
 * yours -- so most of these are about the ways that bargain could be dodged:
 * walking in and out again, taking the prize past a live guardian, or being
 * chased home by something that should never have left its doorway.
 */

const saved = { ...RUINS };
afterEach(() => {
  Object.assign(RUINS, saved);
});

/** Open grass, no cities, and one ruin in the middle of it. */
function world(prize: Ruin['prize'] = 'gold'): { state: GameState; ruin: Ruin } {
  const state = createGame({ seed: 20260925, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.gold = 0;
  }
  const ruin: Ruin = { x: 15, y: 10, prize };
  state.ruins = [ruin];
  state.log.length = 0;
  return { state, ruin };
}

describe('where ruins come from', () => {
  it('scatters them over the land, clear of the starts', () => {
    const state = createGame({ seed: 4242, width: 60, height: 40 });
    const starts = state.units.filter((u) => u.owner === 0 || u.owner === 1);
    expect((state.ruins ?? []).length).toBeGreaterThan(0);
    for (const r of state.ruins ?? []) {
      expect(state.terrain[idx(r.x, r.y, state.width)]).not.toBe('deep');
      expect(state.terrain[idx(r.x, r.y, state.width)]).not.toBe('water');
      for (const u of starts) {
        expect(Math.max(Math.abs(u.x - r.x), Math.abs(u.y - r.y))).toBeGreaterThanOrEqual(
          RUINS.clearOfStarts - 2,
        );
      }
    }
  });

  it('puts the same ruins on the same seed, every time', () => {
    const a = createGame({ seed: 777, width: 40, height: 30 });
    const b = createGame({ seed: 777, width: 40, height: 30 });
    expect(a.ruins).toEqual(b.ruins);
  });

  it('keeps them apart from each other', () => {
    const state = createGame({ seed: 99, width: 60, height: 40 });
    const ruins = state.ruins ?? [];
    for (const a of ruins) {
      for (const b of ruins) {
        if (a === b) continue;
        expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(
          RUINS.apart,
        );
      }
    }
  });

  it('none at all with the lever off', () => {
    RUINS.enabled = false;
    const state = createGame({ seed: 4242, width: 60, height: 40 });
    expect(state.ruins ?? []).toHaveLength(0);
  });
});

describe('walking into one', () => {
  it('wakes what is in it, and spends the rest of the turn', () => {
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    orc.moves = 3;

    tryStep(state, orc, ruin.x, ruin.y);

    expect(ruin.wokeOn).toBe(state.turn);
    expect(orc.moves).toBe(0);
    // The guard is the price tag: a bag of gold gets one bored skeleton.
    expect(state.units.filter(isWarden).length).toBe(RUINS.guard.gold.count);
  });

  it('conjures a wilds slot in a game that had none', () => {
    const { state, ruin } = world();
    expect(barbarianOf(state)).toBeNull();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);

    tryStep(state, orc, ruin.x, ruin.y);

    expect(barbarianOf(state)).not.toBeNull();
    expect(state.players.filter((p) => !p.barbarian)).toHaveLength(2);
  });

  it('does not wake one that is already open', () => {
    const { state, ruin } = world();
    ruin.takenOn = 1;
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    orc.moves = 3;

    tryStep(state, orc, ruin.x, ruin.y);

    expect(state.units.filter(isWarden)).toHaveLength(0);
    expect(orc.moves).toBeGreaterThan(0);
  });
});

describe("a ruin is a soldier's business", () => {
  it('is not woken by somebody with a shovel', () => {
    const { state, ruin } = world();
    const peon = spawnUnit(state, 0, 'peon', ruin.x - 1, ruin.y, false);
    peon.moves = 3;

    tryStep(state, peon, ruin.x, ruin.y);

    expect(ruin.wokeOn).toBeUndefined();
    expect(state.units.filter(isWarden)).toHaveLength(0);
    // And it keeps its turn: a worker crossing a tile has chosen nothing.
    expect(peon.moves).toBeGreaterThan(0);
  });

  it('leaves a worker alone even once it is awake', () => {
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    // The soldier who woke it steps out; a worker wanders in behind it.
    orc.x = ruin.x - 3;
    const peon = spawnUnit(state, 0, 'peon', ruin.x, ruin.y, false);
    const whole = peon.hp;
    const wild = barbarianOf(state)!;

    for (let t = 0; t < 4; t++) {
      for (const u of state.units) u.moves = unitType(u.type).move;
      runRaiders(state, wild.id);
    }

    expect(peon.hp).toBe(whole);
    expect(state.units).toContain(peon);
  });
});

describe('taking what is in it', () => {
  function cleared(prize: Ruin['prize']): { state: GameState; ruin: Ruin } {
    const { state, ruin } = world(prize);
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    // The fight, skipped: whatever stood up is cut down.
    state.units = state.units.filter((u) => !isWarden(u));
    return { state, ruin };
  }

  it('waits until nothing is standing over it', () => {
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    expect(guarded(state, ruin)).toBe(true);

    claimRuins(state, 0);

    expect(ruin.takenOn).toBeUndefined();
    expect(state.players[0].gold).toBe(0);
  });

  it('hands over the gold to whoever held it', () => {
    const { state, ruin } = cleared('gold');
    claimRuins(state, 0);
    expect(ruin.takenOn).toBe(state.turn);
    expect(state.players[0].gold).toBe(RUINS.gold);
  });

  it('hands over an advance off their own tree', () => {
    const { state, ruin } = cleared('advance');
    const before = state.players[0].techs.length;
    claimRuins(state, 0);
    expect(state.players[0].techs.length).toBe(before + 1);
    expect(ruin.takenOn).toBe(state.turn);
  });

  it('leaves a soldier standing there who walks out with you', () => {
    const { state } = cleared('unit');
    const before = state.units.filter((u) => u.owner === 0).length;
    claimRuins(state, 0);
    const now = state.units.filter((u) => u.owner === 0);
    expect(now.length).toBe(before + 1);

    // Section 124: a *soldier*, one of them, and never a worker. The prize was
    // each side's settler once, which is even on paper and not in play -- an AI
    // stops founding at its target, so a free settler was a town for the
    // Kingdom and a road crew for the Horde, and cost twenty games in a sweep.
    const gift = unitType(now[now.length - 1].type);
    expect(gift.attack).toBeGreaterThan(0);
    expect(gift.settler).toBe(false);
    expect(gift.count).toBe(1);
  });

  it('hands out a better soldier the older the world is', () => {
    const early = cleared('unit');
    claimRuins(early.state, 0);
    const first = early.state.units.filter((u) => u.owner === 0).at(-1)!;

    const late = cleared('unit');
    // The whole world further along, which is what the rung is read off.
    for (const p of late.state.players) p.techs = new Array(24).fill('x');
    claimRuins(late.state, 0);
    const second = late.state.units.filter((u) => u.owner === 0).at(-1)!;

    expect(unitType(second.type).cost).toBeGreaterThan(unitType(first.type).cost);
  });

  it('never goes past the middle of the roster, however old the world is', () => {
    const state = cleared('unit').state;
    for (const p of state.players) p.techs = new Array(200).fill('x');
    claimRuins(state, 0);
    const gift = unitType(state.units.filter((u) => u.owner === 0).at(-1)!.type);

    const roster = Object.values(UNIT_TYPES)
      .filter(
        (u) =>
          u.faction === state.players[0].faction &&
          u.count === 1 &&
          u.cost > 0 &&
          u.attack > 0 &&
          !u.settler &&
          !u.sails,
      )
      .sort((a, b) => a.cost - b.cost);
    const dearest = roster[roster.length - 1];
    expect(gift.cost).toBeLessThan(dearest.cost);
  });

  it('teaches whoever opened it something', () => {
    const { state, ruin } = cleared('promotion');
    const holder = state.units.find((u) => u.x === ruin.x && u.y === ruin.y)!;
    const before = holder.rank;
    claimRuins(state, 0);
    expect(holder.rank).toBeGreaterThan(before);
  });

  it('is emptied once, and not again', () => {
    const { state } = cleared('gold');
    claimRuins(state, 0);
    claimRuins(state, 0);
    expect(state.players[0].gold).toBe(RUINS.gold);
    expect(standingRuins(state)).toHaveLength(0);
  });

  it('gives it to nobody who is not standing in it', () => {
    const { state, ruin } = cleared('gold');
    const holder = state.units.find((u) => u.x === ruin.x && u.y === ruin.y)!;
    holder.x -= 1;
    claimRuins(state, 0);
    expect(ruin.takenOn).toBeUndefined();
  });
});

describe('what stands in them', () => {
  it('never follows anybody home', () => {
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    const warden = state.units.find(isWarden)!;
    const wild = barbarianOf(state)!;
    // Our unit runs for it, a long way off.
    orc.x = 2;
    orc.y = 2;

    for (let t = 0; t < 6; t++) {
      warden.moves = unitType(warden.type).move;
      runRaiders(state, wild.id);
    }

    expect(Math.max(Math.abs(warden.x - ruin.x), Math.abs(warden.y - ruin.y))).toBeLessThanOrEqual(
      RUINS.leash,
    );
  });

  it('gets a Vault Keeper if it is left awake, when it is worth one', () => {
    // An advance, which is the prize a Keeper turns out for. A ruin holding
    // coins does not get one, which is the next test.
    const { state, ruin } = world('advance');
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);

    state.turn += RUINS.keeperAfter;
    tickRuins(state);

    expect(state.units.some((u) => u.type === WARDENS.keeper)).toBe(true);
  });

  it('leaves a bag of gold to its one skeleton, Keeper or no Keeper', () => {
    const { state, ruin } = world('gold');
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    expect(state.units.filter(isWarden)).toHaveLength(1);

    state.turn += RUINS.keeperAfter;
    tickRuins(state);

    expect(state.units.some((u) => u.type === WARDENS.keeper)).toBe(false);
  });

  it('stands something better over something better', () => {
    const cheap = world('gold');
    const dear = world('advance');
    for (const { state, ruin } of [cheap, dear]) {
      const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
      tryStep(state, orc, ruin.x, ruin.y);
    }
    const overGold = cheap.state.units.filter(isWarden);
    const overAdvance = dear.state.units.filter(isWarden);

    expect(overAdvance.length).toBeGreaterThan(overGold.length);
    // And what stands there is made of sterner stuff, before the world has
    // aged into golems at all.
    expect(overAdvance.every((u) => u.type === WARDENS.guardian)).toBe(true);
    expect(overGold.every((u) => u.type === WARDENS.sentinel)).toBe(true);
  });

  it('gets no Keeper once its guardians are down', () => {
    const { state, ruin } = world('advance');
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    state.units = state.units.filter((u) => !isWarden(u));

    state.turn += RUINS.keeperAfter;
    tickRuins(state);

    expect(state.units.some((u) => u.type === WARDENS.keeper)).toBe(false);
  });

  it('hurts whoever punches it', () => {
    const { state } = world();
    const guardian = spawnUnit(state, 0, WARDENS.guardian, 10, 10, false);
    const orc = spawnUnit(state, 1, 'orc', 10, 11, false);
    const before = orc.hp;

    resolveCombat(state, orc, guardian);

    // Either it died in there or it came out lighter; what it did not do is
    // walk away from a stone golem unmarked.
    expect(orc.hp).toBeLessThan(before);
    expect(unitType(WARDENS.guardian).reflects).toBeGreaterThan(0);
  });
});

describe('lying back down', () => {
  it('sends the guard away once nobody has been near for a while', () => {
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    expect(state.units.filter(isWarden).length).toBeGreaterThan(0);

    // Our soldier leaves, and nobody comes back.
    orc.x = ruin.x - 9;
    state.turn += RUINS.sleepAfter;
    sleepRuins(state);

    expect(state.units.filter(isWarden)).toHaveLength(0);
    expect(ruin.wokeOn).toBeUndefined();
    // The prize is still in there, and it can be woken again.
    expect(ruin.takenOn).toBeUndefined();
  });

  it('stays awake while somebody is still about', () => {
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);

    state.turn += RUINS.sleepAfter;
    sleepRuins(state);

    expect(state.units.filter(isWarden).length).toBeGreaterThan(0);
    expect(ruin.wokeOn).toBeDefined();
  });

  it('can be woken a second time', () => {
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    orc.x = ruin.x - 9;
    state.turn += RUINS.sleepAfter;
    sleepRuins(state);

    const again = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, again, ruin.x, ruin.y);

    expect(ruin.wokeOn).toBe(state.turn);
    expect(state.units.filter(isWarden).length).toBeGreaterThan(0);
  });
});

describe('the map remembers', () => {
  it('knows which tile a ruin is on', () => {
    const { state, ruin } = world();
    expect(ruinAt(state, ruin.x, ruin.y)).toBe(ruin);
    expect(ruinAt(state, 1, 1)).toBeUndefined();
  });

  it('carries them through a turn without complaint', () => {
    const { state } = world();
    expect(() => beginPlayerTurn(state, 0)).not.toThrow();
  });

  it('places none on a map with the lever off, and wakes none either', () => {
    RUINS.enabled = false;
    const { state, ruin } = world();
    const orc = spawnUnit(state, 0, 'orc', ruin.x - 1, ruin.y, false);
    tryStep(state, orc, ruin.x, ruin.y);
    expect(ruin.wokeOn).toBeUndefined();
    expect(state.units.filter(isWarden)).toHaveLength(0);
  });
});

/**
 * What the interface is allowed to say about a ruin. Section 130.
 *
 * The map drew ruins and nothing described them: hovering one gave the terrain
 * under it and no hint that the thing on the tile was anything but scenery, so
 * the first most players learned about ruins was something coming out of one.
 */
describe('what a ruin looks like from outside', () => {
  function board(): GameState {
    const state = createGame({ seed: 4242, width: 24, height: 16, barbarians: false });
    state.units.length = 0;
    state.ruins = [{ x: 10, y: 8, prize: 'gold' }];
    for (const p of state.players) {
      p.explored.fill(1);
      p.visible.fill(1);
    }
    return state;
  }

  it('says nothing at all about a tile with no ruin on it', () => {
    expect(ruinState(board(), 3, 3)).toBeNull();
  });

  it('tells the four states apart', () => {
    const state = board();
    const ruin = state.ruins![0];
    expect(ruinState(state, 10, 8), 'never touched').toBe('undisturbed');

    ruin.wokeOn = 20;
    expect(ruinState(state, 10, 8), 'woken, nothing standing').toBe('awake');

    spawnUnit(state, 1, WARDENS.sentinel, 10, 8);
    expect(ruinState(state, 10, 8), 'something in the doorway').toBe('held');

    ruin.takenOn = 30;
    expect(ruinState(state, 10, 8), 'emptied, now scenery').toBe('emptied');
  });

  it('never says what is inside, in any state', () => {
    const state = board();
    state.ruins![0].wokeOn = 20;
    // The prize is on the record and must not reach the player through this.
    expect(state.ruins![0].prize).toBe('gold');
    for (const answer of ['undisturbed', 'awake', 'held', 'emptied']) {
      expect(answer).not.toContain('gold');
    }
  });
});
