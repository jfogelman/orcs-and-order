import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { SPECIALS, TERRAIN, TERRAIN_IDS, defenseOf, specialAt } from '../src/model/terrain';
import type { GameState, TerrainId } from '../src/model/types';
import { defenseStrength } from '../src/sim/combat';
import { tileYield } from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';

function board(): GameState {
  const state = createGame({ seed: 20260912, width: 24, height: 18 });
  state.units.length = 0;
  state.cities.length = 0;
  state.specials.fill(0);
  for (const p of state.players) p.visible.fill(2);
  return state;
}

/** Put a named special on a tile and hand back its index. */
function put(state: GameState, x: number, y: number, terrain: TerrainId, name: string): number {
  const i = idx(x, y, state.width);
  state.terrain[i] = terrain;
  const n = TERRAIN[terrain].specials.findIndex((s) => s.name === name);
  expect(n, `no special called ${name} on ${terrain}`).toBeGreaterThanOrEqual(0);
  state.specials[i] = n + 1;
  return i;
}

/**
 * Section 66 wanted two things and section 93 measured which of them is safe.
 *
 * The yield specials turned out to be a **Kingdom lever** -- they hand out trade
 * and the Kingdom converts trade better -- so more of *those* cannot be added
 * for flavour. A special that is a **rule** touches no yields at all, which is
 * the direction that does not move the faction balance.
 */
describe('specials as a list rather than one apiece', () => {
  it('reads the tile as a one-based index into the terrain list', () => {
    // One-based so a save written when every terrain had a single special --
    // where the value was a flag reading 1 -- still names that same one.
    expect(specialAt('grass', 0)).toBeNull();
    expect(specialAt('grass', 1)).toBe(TERRAIN.grass.specials[0]);
    expect(specialAt('grass', 2)).toBe(TERRAIN.grass.specials[1]);
  });

  it('says nothing for an index past the end', () => {
    // A save from a build with more specials than this one must not crash it.
    expect(specialAt('grass', 99)).toBeNull();
    expect(specialAt('deep', 5)).toBeNull();
  });

  it('still yields the second special properly', () => {
    const state = board();
    const i = put(state, 5, 5, 'grass', 'A Very Rude Boulder');
    const boulder = TERRAIN.grass.specials[1];
    expect(tileYield(state, i, false)).toEqual({
      food: boulder.food,
      shields: boulder.shields,
      trade: boulder.trade,
    });
  });

  it('leaves every terrain with at most one special that is a rule', () => {
    // Not a rule of the game, a rule about the data: two defensive specials on
    // one terrain would make the roll mostly about defence.
    for (const id of TERRAIN_IDS) {
      const rules = TERRAIN[id].specials.filter((s) => s.defense !== undefined);
      expect(rules.length, `${id} has ${rules.length} defensive specials`).toBeLessThanOrEqual(1);
    }
  });
});

describe('ground worth standing on', () => {
  it('raises the defence of whoever is on it', () => {
    const state = board();
    const i = put(state, 5, 5, 'grass', 'A Very Rude Boulder');
    expect(defenseOf('grass', state.specials[i])).toBeGreaterThan(TERRAIN.grass.defense);
  });

  it('reaches an actual fight', () => {
    const bare = board();
    const plain = idx(5, 5, bare.width);
    bare.terrain[plain] = 'grass';
    const exposed = spawnUnit(bare, 0, 'goblin', 5, 5, false);

    const rocky = board();
    put(rocky, 5, 5, 'grass', 'A Very Rude Boulder');
    const covered = spawnUnit(rocky, 0, 'goblin', 5, 5, false);

    expect(defenseStrength(rocky, covered).total).toBeGreaterThan(
      defenseStrength(bare, exposed).total,
    );
  });

  it('adds no yields at all, which is the whole point', () => {
    // Section 93: yields are the Kingdom's currency. A rule that also paid out
    // would be the thing that measurement warned against.
    for (const id of TERRAIN_IDS) {
      const ground = TERRAIN[id];
      for (const sp of ground.specials) {
        if (sp.defense === undefined) continue;
        expect(sp.food, `${sp.name} changes food`).toBe(ground.food);
        expect(sp.shields, `${sp.name} changes shields`).toBe(ground.shields);
        expect(sp.trade, `${sp.name} changes trade`).toBe(ground.trade);
      }
    }
  });

  it('is always better than the bare ground, or it would be a punishment', () => {
    for (const id of TERRAIN_IDS) {
      for (const sp of TERRAIN[id].specials) {
        if (sp.defense === undefined) continue;
        expect(sp.defense, `${sp.name} is worse than standing on nothing`).toBeGreaterThan(
          TERRAIN[id].defense,
        );
      }
    }
  });

  it('can be switched off without changing the map', () => {
    const state = board();
    const i = put(state, 5, 5, 'grass', 'A Very Rude Boulder');
    const before = tileYield(state, i, false);

    SPECIALS.rules = false;
    try {
      // The tile still carries the same thing and still yields the same; only
      // the rule stops. That is what makes an arm without it measure the rule
      // rather than a different world.
      expect(defenseOf('grass', state.specials[i])).toBe(TERRAIN.grass.defense);
      expect(tileYield(state, i, false)).toEqual(before);
      expect(specialAt('grass', state.specials[i])).not.toBeNull();
    } finally {
      SPECIALS.rules = true;
    }
  });
});
