import { afterEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { detonate } from '../src/sim/combat';
import { DISPERSAL, REFORM_SITES, scatteredOf } from '../src/sim/dispersal';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 165: every death goes out through the one door.
 *
 * `destroyUnit`'s own comment calls itself *"the one door out of the game"*
 * and says why: *"a rule installed at the call sites would have been true of
 * a fight and false of everything else, and the three sections after it would
 * each have found a new way to kill something."*
 *
 * **Two things found a new way anyway.** `detonate` and `clubEffects` spliced
 * their victims straight out of `state.units`, so an Unbound unit caught by a
 * sapper going up or an ogre's club never scattered, was never offered to a
 * Spirit Party, and was logged *"does not get up"* -- which is the one
 * sentence that faction's rule exists to make untrue.
 *
 * Measured first, because it decides what kind of fix this is: **4 of 1730**
 * of their deaths in twelve games came through those paths. A correctness
 * fix with no balance consequence, which is why there is no sweep beside it.
 */

const failWas = [DISPERSAL.failBase, DISPERSAL.failFloor] as const;
afterEach(() => {
  [DISPERSAL.failBase, DISPERSAL.failFloor] = failWas;
});

function game(): GameState {
  const state = createGame({
    seed: 165,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    // The level with no stagger, so the fifth faction is seated at turn one.
    difficulty: 'hardest',
    opponents: ['human', 'unbound'],
  });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  return state;
}

function seat(state: GameState, faction: string): number {
  const n = state.players.findIndex((p) => p.faction === faction);
  expect(n, `the fixture needs a ${faction} side`).toBeGreaterThan(0);
  return n;
}

function put(state: GameState, owner: number, type: string, x: number, y: number): Unit {
  return spawnUnit(state, owner, type as Parameters<typeof spawnUnit>[2], x, y, false);
}

/** Somewhere for a spirit to gather, so "did it scatter" is answerable. */
function totem(state: GameState, owner: number, x: number, y: number): City {
  const c = {
    id: state.cities.length + 1,
    owner,
    name: 'Hold',
    x,
    y,
    size: 3,
    buildings: [REFORM_SITES[0]],
  } as unknown as City;
  state.cities.push(c);
  return c;
}

describe('a spirit caught in a blast', () => {
  it('scatters, where before it was simply spliced off the board', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    totem(state, ub, 20, 10);
    DISPERSAL.failBase = 0;
    DISPERSAL.failFloor = 0;

    const sapper = put(state, 0, 'sapper', 5, 5);
    const spirit = put(state, ub, 'revenant', 5, 6);
    spirit.hp = 1;

    const killed = detonate(state, sapper);

    expect(killed.map((u) => u.id), 'the blast caught it').toContain(spirit.id);
    expect(state.units.some((u) => u.id === spirit.id), 'and took it off the board').toBe(
      false,
    );
    // The whole of the fix: it went out through `destroyUnit`, so the
    // faction's own rule got to run on it.
    expect(scatteredOf(state, ub).length, 'it came apart rather than ending').toBe(1);
  });

  it('is still simply dead when there is nowhere to gather', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    const sapper = put(state, 0, 'sapper', 5, 5);
    const spirit = put(state, ub, 'revenant', 5, 6);
    spirit.hp = 1;

    detonate(state, sapper);

    expect(state.units.some((u) => u.id === spirit.id)).toBe(false);
    // No Totem, no Circle: the ladder's third rung, reached properly rather
    // than by being spliced past.
    expect(scatteredOf(state, ub).length).toBe(0);
  });

  it('leaves everybody else dying the way they always did', () => {
    const state = game();
    const sapper = put(state, 0, 'sapper', 5, 5);
    const human = put(state, seat(state, 'human'), 'footman', 5, 6);
    human.hp = 1;

    const killed = detonate(state, sapper);

    expect(killed.map((u) => u.id)).toContain(human.id);
    expect(state.units.some((u) => u.id === human.id)).toBe(false);
  });
});
