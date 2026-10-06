import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/model/types';
import { FACTIONS } from '../src/model/factions';
import { TERRAIN, TERRAIN_IDS } from '../src/model/terrain';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { moveToward, reachableTiles, visibleEnemies } from '../src/sim/movement';
import { attackStrength } from '../src/sim/combat';
import { beginPlayerTurn } from '../src/sim/turn';
import { PERSONALITIES, chooseProduction, runAiTurn, worth } from '../src/ai/ai';
import { unitType } from '../src/model/units';
import { idx } from '../src/engine/grid';
import {
  BURROW,
  burrow,
  burrowRange,
  burrowTargets,
  disturbedBy,
  isSunk,
  markedAt,
  seenBy,
  sink,
  sinkBlocked,
  surface,
} from '../src/sim/burrow';

/**
 * Section 125 slice B: the Burrower-caste.
 *
 * The thing worth testing hardest is not the movement -- it is **the hiding**,
 * because nothing in this game was ever hidden before. Fog of war is a fact
 * about tiles, and "a unit on a lit tile is a unit you can see" was true
 * everywhere until now. Every one of these tests is really asking whether some
 * other part of the game has quietly kept believing that.
 */

function board(): GameState {
  const state = createGame({ seed: 20261003, width: 24, height: 16, barbarians: false });
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

/** A Hivekin seat on a two-player board. */
function withHive(state: GameState): number {
  const id = state.players.length;
  state.players.push({
    ...state.players[1],
    id,
    faction: 'hivekin',
    name: FACTIONS.hivekin.civName,
    alive: true,
    techs: ['first-hivekin', 'caste-fodder', 'caste-burrower'],
    explored: new Array(state.width * state.height).fill(1),
    visible: new Array(state.width * state.height).fill(1),
  });
  return id;
}

describe('going to ground', () => {
  it('costs the rest of the turn, so it is not a free dodge', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    expect(b.moves).toBeGreaterThan(0);

    expect(sink(state, b)).toBe(true);
    expect(isSunk(b)).toBe(true);
    expect(b.moves).toBe(0);
  });

  it('cannot be done from a boat, or in a settlement', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);

    const sea = TERRAIN_IDS.find((t) => TERRAIN[t].water)!;
    state.terrain[idx(10, 8, state.width)] = sea;
    expect(sinkBlocked(state, b)).toMatch(/nothing here/i);

    state.terrain[idx(10, 8, state.width)] = 'grass';
    foundCity(state, spawnUnit(state, hive, 'grub', 10, 8));
    expect(sinkBlocked(state, b)).toMatch(/settlement/i);
  });

  it('is only ever a Burrower', () => {
    const state = board();
    const hive = withHive(state);
    for (const type of ['soldier', 'elite', 'spitter', 'worker']) {
      const u = spawnUnit(state, hive, type, 12, 12);
      expect(sinkBlocked(state, u), type).toMatch(/Burrower/);
      state.units.splice(state.units.indexOf(u), 1);
    }
  });
});

describe('what the enemy can and cannot see', () => {
  it('stops being visible to them, and stays visible to its own side', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);

    expect(seenBy(state, b, 0)).toBe(true);
    sink(state, b);
    expect(seenBy(state, b, 0), 'the enemy').toBe(false);
    expect(seenBy(state, b, hive), 'its own side').toBe(true);
  });

  it('drops out of the list the rest of the game asks for enemies', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    expect(visibleEnemies(state, 0).has(b.id)).toBe(true);

    sink(state, b);

    // This is the list the AI, the sighting report and the interface all use.
    // If it still held the Burrower, every one of them would see through dirt.
    expect(visibleEnemies(state, 0).has(b.id)).toBe(false);
  });

  it('leaves the dirt disturbed, until the Hive has learned not to', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);

    sink(state, b);
    // A tile, and nothing else: the enemy knows something went down, not what,
    // and not whether it is still there.
    expect(markedAt(state, 10, 8, 0)).toBe(true);
    expect(seenBy(state, b, 0)).toBe(false);

    surface(state, b);
    state.players[hive].techs.push('burrower-veteran');
    sink(state, b);
    expect(markedAt(state, 10, 8, 0), 'the last tile is forgotten').toBe(false);
  });

  it('tells its own side nothing it did not already know', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    sink(state, b);
    // The mark is for the enemy. Your own Burrower is not news to you.
    expect(markedAt(state, 10, 8, hive)).toBe(false);
  });
});

describe('being walked over', () => {
  it('does not block an enemy, because they cannot see it to be blocked by it', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    const foe = spawnUnit(state, 0, 'footman', 9, 8);

    sink(state, b);

    // Blocking would leak the fact it is there: an enemy would find an
    // invisible wall and know exactly what it was.
    const reach = reachableTiles(state, foe);
    expect(reach.has(idx(10, 8, state.width))).toBe(true);
  });

  it('is found out, pushed clear, and has used its turn being surprised', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    const foe = spawnUnit(state, 0, 'footman', 9, 8);
    sink(state, b);

    const result = moveToward(state, foe, 10, 8);
    expect(result.kind).not.toBe('blocked');

    expect(isSunk(b), 'it is out').toBe(false);
    expect(b.x === 10 && b.y === 8, 'and no longer under the enemy').toBe(false);
    expect(b.moves).toBe(0);
    // One tile per unit still holds, which is the invariant this rule exists
    // to protect.
    expect(state.units.filter((u) => u.x === 10 && u.y === 8)).toHaveLength(1);
  });

  it('is buried when there is nowhere for it to go', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 1, 1);
    sink(state, b);
    // Wall it in completely, then stand on it.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        spawnUnit(state, 0, 'footman', 1 + dx, 1 + dy);
      }
    }
    const mover = spawnUnit(state, 0, 'knight', 1, 1);
    expect(disturbedBy(state, mover)).toBe(true);
    expect(state.units).not.toContain(b);
  });
});

describe('crossing underneath', () => {
  it('goes through what it could never have walked through', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    // A solid wall of enemies, two deep, right across its path.
    for (let y = 6; y <= 10; y++) {
      spawnUnit(state, 0, 'footman', 11, y);
      spawnUnit(state, 0, 'footman', 12, y);
    }

    // It cannot walk anywhere near there...
    expect(reachableTiles(state, b).has(idx(12, 8, state.width))).toBe(false);
    // ...and it can come up on the far side of both ranks.
    expect(burrowTargets(state, b).some(([x, y]) => x === 12 && y === 8)).toBe(false);
    expect(burrow(state, b, 12, 7)).toBe(false);
    const far = burrowTargets(state, b);
    expect(far.length).toBeGreaterThan(0);
    expect(far.every(([x, y]) => !state.units.some((u) => u !== b && u.x === x && u.y === y))).toBe(
      true,
    );
  });

  it('never lands on anybody, and costs the whole turn however far it went', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    spawnUnit(state, 0, 'footman', 11, 8);

    expect(burrowTargets(state, b).some(([x, y]) => x === 11 && y === 8)).toBe(false);
    expect(burrow(state, b, 11, 8)).toBe(false);

    expect(burrow(state, b, 12, 8)).toBe(true);
    expect([b.x, b.y]).toEqual([12, 8]);
    expect(b.moves).toBe(0);
  });

  it('reaches further once the Hive has learned to go further down', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    expect(burrowRange(state, b)).toBe(BURROW.range);

    state.players[hive].techs.push('burrower-deep');
    expect(burrowRange(state, b)).toBe(BURROW.deepRange);
    expect(burrowTargets(state, b).some(([x, y]) => Math.abs(x - 10) === 3 || Math.abs(y - 8) === 3))
      .toBe(true);
  });

  it('comes up out of the ground when it is told to walk instead', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    sink(state, b);
    b.moves = 2;

    moveToward(state, b, 11, 8);
    expect(isSunk(b)).toBe(false);
    expect(seenBy(state, b, 0)).toBe(true);
  });
});

describe('already waiting', () => {
  it('is worth a harder swing, and only to a Hive that has learned it', () => {
    const state = board();
    const hive = withHive(state);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    const foe = spawnUnit(state, 0, 'footman', 11, 8);
    sink(state, b);

    surface(state, b);
    expect(b.ambushing, 'not learned yet').toBeUndefined();
    const plain = attackStrength(state, b, foe).total;

    state.players[hive].techs.push('burrower-ambush');
    b.moves = 2;
    sink(state, b);
    surface(state, b);
    expect(b.ambushing).toBe(true);
    expect(attackStrength(state, b, foe).total).toBeCloseTo(plain * BURROW.ambush, 5);
  });

  it('wears off at the start of its own next turn, swung or not', () => {
    const state = board();
    const hive = withHive(state);
    state.players[hive].techs.push('burrower-ambush');
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    spawnUnit(state, 0, 'footman', 11, 8);
    sink(state, b);
    surface(state, b);
    expect(b.ambushing).toBe(true);

    beginPlayerTurn(state, hive);

    // Coming up and not attacking has still given away where it is.
    expect(b.ambushing).toBeUndefined();
  });

  it('is not earned by coming up with nobody about', () => {
    const state = board();
    const hive = withHive(state);
    state.players[hive].techs.push('burrower-ambush');
    const b = spawnUnit(state, hive, 'burrower', 2, 2);
    sink(state, b);
    surface(state, b);
    expect(b.ambushing).toBeUndefined();
  });
});

/**
 * Section 125, second pass: the AI knows it has these.
 *
 * Slice B measured Sink and Burrow and got two arms reading identical numbers,
 * which was not a null result but an instrument reading zero -- the AI built
 * 0.2 Burrower-caste a game and never once put one underground. These tests
 * exist so that cannot quietly become true again.
 */
describe('the AI and the ground', () => {
  function hiveWith(state: GameState, techs: string[]): number {
    const id = state.players.length;
    state.players.push({
      ...state.players[1],
      id,
      faction: 'hivekin',
      name: FACTIONS.hivekin.civName,
      alive: true,
      controller: 'ai',
      techs: ['first-hivekin', 'caste-fodder', 'caste-soldier', 'caste-burrower', ...techs],
      explored: new Array(state.width * state.height).fill(1),
      visible: new Array(state.width * state.height).fill(1),
    });
    return id;
  }

  it('wants a couple of them, which nothing in the value formula ever would', () => {
    const state = board();
    const hive = hiveWith(state, []);
    const city = foundCity(state, spawnUnit(state, hive, 'grub', 10, 8))!;
    city.size = 6;
    // A Burrower is a Soldier-caste that costs three quarters again as much, so
    // `worth()` puts it last and the Hive built almost none.
    expect(worth(unitType('burrower'), false)).toBeLessThan(worth(unitType('soldier'), false));

    // A personality with nowhere left to expand to, so the settler step is
    // satisfied and the question is only what it builds for the army.
    const settled = { ...PERSONALITIES.hivekin, targetCities: 1 };
    for (let n = 0; n < 6; n++) {
      const pick = chooseProduction(state, city, settled);
      if (pick.kind === 'unit' && unitType(pick.id).base === 'burrower') return;
      if (pick.kind === 'unit') spawnUnit(state, hive, pick.id, city.x, city.y);
      else break;
    }
    throw new Error('the Hive never asked for a Burrower-caste');
  });

  it('stops wanting them once it has enough', () => {
    const state = board();
    const hive = hiveWith(state, []);
    const city = foundCity(state, spawnUnit(state, hive, 'grub', 10, 8))!;
    city.size = 6;
    for (let n = 0; n < BURROW.aiWants; n++) spawnUnit(state, hive, 'burrower', 12 + n, 8);
    for (let n = 0; n < 3; n++) spawnUnit(state, hive, 'soldier', 10 + n, 9);

    const settled = { ...PERSONALITIES.hivekin, targetCities: 1 };
    const pick = chooseProduction(state, city, settled);
    expect(pick.kind === 'unit' && unitType(pick.id).base === 'burrower').toBe(false);
  });

  it('comes up swinging rather than attacking from under the ground', () => {
    const state = board();
    const hive = hiveWith(state, ['burrower-ambush']);
    foundCity(state, spawnUnit(state, hive, 'grub', 4, 4));
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    const foe = spawnUnit(state, 0, 'peon', 11, 8);
    sink(state, b);
    expect(isSunk(b)).toBe(true);

    beginPlayerTurn(state, hive);
    runAiTurn(state, hive);

    // It surfaced first -- which is free -- and that is the only way the Ambush
    // multiplier is ever collected, since going down costs the whole turn and
    // the bonus is wiped at the start of the next one.
    expect(isSunk(b)).toBe(false);
    expect(state.units.includes(foe), 'the peon').toBe(false);
  });

  it('stays down when there is nothing up there to hit', () => {
    const state = board();
    const hive = hiveWith(state, ['burrower-ambush']);
    foundCity(state, spawnUnit(state, hive, 'grub', 4, 4));
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    sink(state, b);

    beginPlayerTurn(state, hive);
    runAiTurn(state, hive);

    expect(isSunk(b), 'still under').toBe(true);
  });

  it('lies in wait without needing the advance, because hiding is the point', () => {
    // This used to require Ambush, and `burrower-ambush` sits twenty-second in
    // a plan that reaches about ten advances -- so the behaviour was gated on
    // something that never happens, and the probe read 0.0 sinks a game. Going
    // down hides the unit outright; the advance makes the swing harder, which
    // is a different thing from making it possible.
    const state = board();
    const hive = hiveWith(state, []);
    foundCity(state, spawnUnit(state, hive, 'grub', 4, 4));
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    spawnUnit(state, 0, 'peon', 12, 8);

    beginPlayerTurn(state, hive);
    runAiTurn(state, hive);

    expect(isSunk(b), 'something is coming, and it is waiting').toBe(true);
  });

  it('does not lie in wait with nobody coming', () => {
    const state = board();
    const hive = hiveWith(state, []);
    foundCity(state, spawnUnit(state, hive, 'grub', 4, 4));
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    // The nearest enemy is far outside `aiLieInWait`, so hiding here is a
    // Burrower that never fights.
    spawnUnit(state, 0, 'peon', 22, 14);

    beginPlayerTurn(state, hive);
    runAiTurn(state, hive);

    expect(isSunk(b)).toBe(false);
  });

  it('goes through what it cannot walk round', () => {
    const state = board();
    const hive = hiveWith(state, []);
    foundCity(state, spawnUnit(state, hive, 'grub', 4, 4));
    spawnUnit(state, hive, 'soldier', 4, 4);
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    // Something to march on, far enough that it is the nearest target, and a
    // rank of our own bodies in the way -- our own, so the wall blocks the walk
    // without being a thing worth attacking instead.
    const far = foundCity(state, spawnUnit(state, 0, 'peon', 14, 8))!;
    const wall = [];
    for (let y = 5; y <= 11; y++) wall.push(spawnUnit(state, hive, 'fodder', 11, y));
    const before = Math.max(Math.abs(b.x - far.x), Math.abs(b.y - far.y));

    beginPlayerTurn(state, hive);
    // Everybody else stands still, so what moves is the Burrower and the branch
    // under test is the only one that could have moved it.
    for (const u of state.units) if (u !== b) u.moves = 0;
    runAiTurn(state, hive);

    const after = Math.max(Math.abs(b.x - far.x), Math.abs(b.y - far.y));
    expect(wall.every((u) => u.x === 11), 'the wall held').toBe(true);
    expect(after, 'it got closer than any step could').toBeLessThan(before - 1);
    expect(isSunk(b), 'it comes up on the far side').toBe(false);
  });

  it('does none of it with the lever off, which is the control arm', () => {
    const state = board();
    const hive = hiveWith(state, ['burrower-ambush']);
    foundCity(state, spawnUnit(state, hive, 'grub', 4, 4));
    const b = spawnUnit(state, hive, 'burrower', 10, 8);
    spawnUnit(state, 0, 'peon', 12, 8);

    BURROW.ai = false;
    try {
      beginPlayerTurn(state, hive);
      runAiTurn(state, hive);
      expect(isSunk(b)).toBe(false);
    } finally {
      BURROW.ai = true;
    }
  });
});
