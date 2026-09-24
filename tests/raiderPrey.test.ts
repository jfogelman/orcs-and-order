import { afterEach, describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { BARBARIANS, PREY, RAIDER, runRaiders } from '../src/sim/barbarians';
import { assignWorkers } from '../src/sim/city';
import { barbarianOf, createGame, spawnUnit } from '../src/sim/gamestate';
import { idx } from '../src/engine/grid';

/**
 * Section 120: what a raiding band is out here for.
 *
 * They used to walk at the nearest thing that was not theirs, and a soldier in
 * a field counted the same as a town. Measured over seventy-two games, that
 * rule had a side to it: the Horde, whose army is the one out walking, lost
 * eleven soldiers a game to the wilds against the Kingdom's four, while towns
 * were sacked about four tenths of a game each.
 *
 * So they go for what somebody built, and turn on a body only when there are
 * enough of them to fancy it, or when one of them has nowhere left to back off
 * to.
 */

const saved = { ...PREY };
afterEach(() => {
  Object.assign(PREY, saved);
});

/** Two towns far apart on open grass, and nothing else on the board. */
function game(): GameState {
  const state = createGame({ seed: 20260923, width: 40, height: 30, barbarians: true });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const [i, at] of [[5, 5], [30, 22]].entries()) {
    const c: City = {
      id: i + 1, owner: i, name: `Place ${i}`, x: at[0], y: at[1], size: 4,
      food: 0, shields: 0, buildings: ['granary'], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: i,
    };
    state.cities.push(c);
    assignWorkers(state, c);
  }
  // Laid out here rather than left to the first worker, because a band that
  // goes for somebody's diggings needs diggings to go for.
  const blank = () => new Array(state.width * state.height).fill(0);
  state.roads = blank();
  state.posts = blank();
  state.irrigation = blank();
  state.mines = blank();
  state.turn = BARBARIANS.notBefore;
  state.log.length = 0;
  return state;
}

const away = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('what a band walks at', () => {
  it('walks past somebody in a field to get at a town', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const raider = spawnUnit(state, wild.id, RAIDER, 12, 12, false);
    // Nearer than the town, and off to the side, so passing it is a choice.
    const wanderer = spawnUnit(state, 0, 'orc', 12, 15, false);
    const whole = wanderer.hp;
    const town = state.cities[0];
    const before = away(raider, town);

    runRaiders(state, wild.id);

    expect(away(raider, town)).toBeLessThan(before);
    expect(wanderer.hp).toBe(whole);
  });

  it('goes for the diggings when they are nearer than the town', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const raider = spawnUnit(state, wild.id, RAIDER, 15, 15, false);
    // A ditch two steps off, with the nearest town ten away.
    state.irrigation![idx(15, 13, state.width)] = 1;

    runRaiders(state, wild.id);

    expect(away(raider, { x: 15, y: 13 })).toBeLessThan(2);
  });

  it('tears up what it is standing on rather than walking on', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const raider = spawnUnit(state, wild.id, RAIDER, 15, 15, false);
    state.roads![idx(15, 15, state.width)] = 1;

    runRaiders(state, wild.id);

    expect(state.roads![idx(15, 15, state.width)]).toBe(0);
    expect([raider.x, raider.y]).toEqual([15, 15]);
  });

  it('turns on a body once there are enough of them to fancy it', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const mob = [
      spawnUnit(state, wild.id, RAIDER, 15, 15, false),
      spawnUnit(state, wild.id, RAIDER, 15, 16, false),
      spawnUnit(state, wild.id, RAIDER, 16, 15, false),
    ];
    const lone = spawnUnit(state, 0, 'orc', 15, 12, false);
    const before = mob.map((r) => away(r, lone));

    runRaiders(state, wild.id);

    // At least one of them has closed on the soldier rather than the town,
    // which lies the other way.
    expect(mob.some((r, i) => away(r, lone) < before[i])).toBe(true);
  });

  it('is the band around it that decides, not the whole wilds', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    // Three raiders in the world, but nowhere near each other.
    const alone = spawnUnit(state, wild.id, RAIDER, 15, 15, false);
    spawnUnit(state, wild.id, RAIDER, 30, 5, false);
    spawnUnit(state, wild.id, RAIDER, 32, 6, false);
    const soldier = spawnUnit(state, 0, 'orc', 15, 12, false);
    const whole = soldier.hp;
    const town = state.cities[0];
    const before = away(alone, town);

    runRaiders(state, wild.id);

    expect(away(alone, town)).toBeLessThan(before);
    expect(soldier.hp).toBe(whole);
  });
});

describe('cornered', () => {
  /** Water on every side but the one the soldier is standing on. */
  function penned(state: GameState, x: number, y: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        state.terrain[idx(x + dx, y + dy, state.width)] = 'water';
      }
    }
  }

  it('fights when it is on its own with nowhere to back off to', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    penned(state, 15, 15);
    const raider = spawnUnit(state, wild.id, RAIDER, 15, 15, false);
    // The one dry tile beside it, so there is nowhere to go that is not through him.
    state.terrain[idx(15, 14, state.width)] = 'grass';
    const soldier = spawnUnit(state, 0, 'orc', 15, 14, false);
    const whole = soldier.hp;

    runRaiders(state, wild.id);

    // Either it hurt him or it died trying; what it did not do is stand there.
    expect(soldier.hp < whole || !state.units.includes(raider)).toBe(true);
  });

  it('walks away instead when there is somewhere to walk to', () => {
    const state = game();
    const wild = barbarianOf(state)!;
    const raider = spawnUnit(state, wild.id, RAIDER, 15, 15, false);
    const soldier = spawnUnit(state, 0, 'orc', 15, 14, false);
    const whole = soldier.hp;

    runRaiders(state, wild.id);

    expect(soldier.hp).toBe(whole);
    expect([raider.x, raider.y]).not.toEqual([15, 15]);
  });
});

describe('the lever', () => {
  it('put back, they walk at the nearest thing again', () => {
    PREY.enabled = false;
    const state = game();
    const wild = barbarianOf(state)!;
    const raider = spawnUnit(state, wild.id, RAIDER, 12, 12, false);
    const wanderer = spawnUnit(state, 0, 'orc', 12, 14, false);

    runRaiders(state, wild.id);

    expect(away(raider, wanderer)).toBeLessThan(2);
  });
});
