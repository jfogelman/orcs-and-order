import { afterEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { UPGRADES } from '../src/model/upgrades';
import {
  KEEPER,
  OPENS_TWICE,
  RECKONER,
  SWARM,
  breaksOff,
  firstStrikesOf,
  openGround,
  reckons,
  tendTheWounded,
  upgradeAttack,
  upgradeDefence,
  zoneOfControl,
} from '../src/sim/upgradeEffects';
import { resolveCombat } from '../src/sim/combat';
import { tryStep } from '../src/sim/movement';
import { maxHp } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';

/**
 * Section 155 slice 6: the three newer factions' effects.
 *
 * **Mostly about the six Jeremy ruled on**, because those are the ones where
 * the bible described a game this engine does not have and the reading is his
 * rather than the document's. The flat numbers are data and the completeness
 * test covers them; what wants asserting is the rules.
 */

afterEach(() => {
  UPGRADES.enabled = false;
});

function game(): GameState {
  const state = createGame({
    seed: 156,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['hivekin', 'wandering', 'unbound'],
    // The hardest level is the one with no stagger, so every side is on the
    // board at turn one -- the same reason `graveKnight.test.ts` picks it.
    difficulty: 'hardest',
    upgrades: true,
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

function put(
  state: GameState,
  owner: number,
  type: string,
  x: number,
  y: number,
  up?: string,
): Unit {
  const u = spawnUnit(state, owner, type as Parameters<typeof spawnUnit>[2], x, y, false);
  if (up) u.upgrade = up;
  for (const p of state.players) p.visible[y * state.width + x] = 1;
  return u;
}

describe('"stack" means adjacent, because one unit to a tile', () => {
  it('pays a Swarm Fodder for each shape beside it, up to the cap', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    const swarm = put(state, hive, 'fodder', 5, 5, 'fodder-swarm');
    expect(upgradeAttack(state, swarm)).toBe(0);
    put(state, hive, 'fodder', 6, 5);
    expect(upgradeAttack(state, swarm)).toBe(SWARM.each);
    put(state, hive, 'fodder', 4, 5);
    put(state, hive, 'fodder', 5, 4);
    // Three shapes beside it would be six; the bible caps it at three.
    expect(upgradeAttack(state, swarm), 'capped').toBe(SWARM.cap);
  });

  it('counts only other Fodder, not whatever happens to be near', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    const swarm = put(state, hive, 'fodder', 5, 5, 'fodder-swarm');
    put(state, hive, 'soldier', 6, 5);
    expect(upgradeAttack(state, swarm)).toBe(0);
  });
});

describe('extra attacks became extra opening blows', () => {
  it('gives one more free shot, and records which five took that reading', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    const plain = put(state, hive, 'spitter', 9, 9);
    const long = put(state, hive, 'spitter', 5, 5, 'spitter-long');
    const foe = put(state, 0, 'orc', 6, 5);
    expect(firstStrikesOf(long, foe)).toBe(firstStrikesOf(plain, foe) + 1);
    // Three because their creature has `range: 1` and the bible gave it
    // range; two because Jeremy read "attacks twice" this way.
    expect(OPENS_TWICE).toContain('elite-warform');
    expect(OPENS_TWICE).toContain('broodlord-many');
    expect(OPENS_TWICE).toHaveLength(5);
  });
});

describe('the Yaksha, whose card described things already true', () => {
  it('counts who has come for it this turn', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    const yaksha = put(state, ub, 'yaksha', 5, 5, 'yaksha-reckoner');
    yaksha.hp = maxHp(yaksha) * 6;
    expect(reckons(yaksha)).toBe(true);
    resolveCombat(state, put(state, 0, 'goblin', 6, 5), yaksha);
    expect(yaksha.foughtThisTurn).toBe(1);
    resolveCombat(state, put(state, 0, 'goblin', 4, 5), yaksha);
    expect(yaksha.foughtThisTurn, 'being swarmed is what this punishes').toBe(2);
    expect(RECKONER.hurtsEachAfterTheFirst).toBeGreaterThan(0);
  });

  it('closes the ground around an Immovable Yaksha to the other side', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    put(state, ub, 'yaksha', 5, 5, 'yaksha-immovable');
    const mover = put(state, 0, 'orc', 7, 6);
    mover.moves = 3;
    expect(zoneOfControl(state, mover, 6, 5), 'beside it').toBe(true);
    expect(zoneOfControl(state, mover, 6, 6), 'diagonally beside it').toBe(true);
    expect(zoneOfControl(state, mover, 8, 8), 'well away').toBe(false);
    expect(tryStep(state, mover, 6, 6).kind).toBe('blocked');
  });

  it('closes nothing against its own side', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    put(state, ub, 'yaksha', 5, 5, 'yaksha-immovable');
    const friend = put(state, ub, 'sylph', 7, 4);
    expect(zoneOfControl(state, friend, 6, 5)).toBe(false);
  });

  it('never closes a town, which could strand somebody in their own', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    put(state, ub, 'yaksha', 5, 5, 'yaksha-immovable');
    const mover = put(state, 0, 'orc', 7, 6);
    state.cities.push({
      id: 1,
      owner: 0,
      name: 'Hold',
      x: 6,
      y: 5,
      size: 1,
    } as unknown as GameState['cities'][number]);
    expect(zoneOfControl(state, mover, 6, 5)).toBe(false);
  });

  it('closes nothing with the box unticked', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    put(state, ub, 'yaksha', 5, 5, 'yaksha-immovable');
    const mover = put(state, 0, 'orc', 7, 6);
    UPGRADES.enabled = false;
    expect(zoneOfControl(state, mover, 6, 5)).toBe(false);
  });
});

describe('the Rearguard, who is paid to go last', () => {
  it('is the one thing in the game that carries the withdrawal', () => {
    const state = game();
    const wf = seat(state, 'wandering');
    const rear = put(state, wf, 'wf-skirmisher', 5, 5, 'wf-skirmisher-rearguard');
    const plain = put(state, wf, 'wf-skirmisher', 5, 12);
    expect(breaksOff(rear)).toBe(true);
    expect(breaksOff(plain)).toBe(false);
    UPGRADES.enabled = false;
    expect(breaksOff(rear), 'and not in a game without upgrades').toBe(false);
  });

  it('walks away from a fight it lost, where an ordinary one does not', () => {
    const state = game();
    const wf = seat(state, 'wandering');
    const rear = put(state, wf, 'wf-skirmisher', 5, 5, 'wf-skirmisher-rearguard');
    const plain = put(state, wf, 'wf-skirmisher', 5, 12);
    const a = put(state, 0, 'ogre', 6, 5);
    const b = put(state, 0, 'ogre', 6, 12);
    const r1 = resolveCombat(state, rear, a);
    const r2 = resolveCombat(state, plain, b);
    // A goblin mercenary loses to an ogre either way. The one paid to go
    // last is still standing; the other is not.
    if (!r1.attackerWon) {
      expect(r1.withdrew, 'broke off').toBe(true);
      expect(rear.hp).toBeGreaterThan(0);
    }
    if (!r2.attackerWon) expect(r2.withdrew, 'and this one did not').toBeFalsy();
  });
});

describe('the ones that mend whoever is beside them', () => {
  it('has a Brood-Keeper put adjacent Hivekin back together', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    put(state, hive, 'broodlord', 5, 5, 'broodlord-keeper');
    const hurt = put(state, hive, 'fodder', 6, 5);
    const far = put(state, hive, 'fodder', 12, 12);
    hurt.hp = 1;
    far.hp = 1;
    tendTheWounded(state, hive);
    expect(hurt.hp, 'beside it').toBe(1 + KEEPER.heals);
    expect(far.hp, 'and not across the map').toBe(1);
  });

  it('never mends past what a creature can hold', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    put(state, hive, 'broodlord', 5, 5, 'broodlord-keeper');
    const near = put(state, hive, 'fodder', 6, 5);
    near.hp = maxHp(near) - 1;
    tendTheWounded(state, hive);
    expect(near.hp).toBe(maxHp(near));
  });

  it('mends nobody with the box unticked', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    put(state, hive, 'broodlord', 5, 5, 'broodlord-keeper');
    const hurt = put(state, hive, 'fodder', 6, 5);
    hurt.hp = 1;
    UPGRADES.enabled = false;
    tendTheWounded(state, hive);
    expect(hurt.hp).toBe(1);
  });
});

describe('the conditional ones', () => {
  it('knows open ground from ground worth standing on', () => {
    const state = game();
    const unit = put(state, 0, 'orc', 5, 5);
    expect(openGround(state, unit), 'grass gives its defender nothing').toBe(true);
    state.terrain[5 * state.width + 5] = 'hills';
    expect(openGround(state, unit), 'hills do').toBe(false);
  });

  it('lets an Outcast settle a debt with the Horde specifically', () => {
    const state = game();
    const wf = seat(state, 'wandering');
    const grudge = put(state, wf, 'outcast', 5, 5, 'outcast-grudge');
    const orc = put(state, 0, 'orc', 6, 5);
    const other = put(state, seat(state, 'hivekin'), 'fodder', 4, 5);
    expect(upgradeAttack(state, grudge, orc)).toBeGreaterThan(
      upgradeAttack(state, grudge, other),
    );
  });

  it('has a Sergeant lift its neighbours and a Caravan Guard shield them', () => {
    const state = game();
    const wf = seat(state, 'wandering');
    put(state, wf, 'warband', 5, 5, 'warband-sergeant');
    put(state, wf, 'warband', 12, 12, 'warband-caravanguard');
    const lifted = put(state, wf, 'slinger', 6, 5);
    const shielded = put(state, wf, 'slinger', 13, 12);
    const alone = put(state, wf, 'slinger', 20, 5);
    expect(upgradeAttack(state, lifted)).toBeGreaterThan(upgradeAttack(state, alone));
    expect(upgradeDefence(state, shielded)).toBeGreaterThan(upgradeDefence(state, alone));
  });

  it('has a Fine-Print Jinn read the terms at whoever is beside it', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    put(state, ub, 'jinn', 5, 5, 'jinn-fineprint');
    const near = put(state, 0, 'orc', 6, 5);
    const far = put(state, 0, 'orc', 15, 15);
    expect(upgradeAttack(state, near)).toBeLessThan(upgradeAttack(state, far));
  });

  it('has a Rattling Bonebound unsettle whoever swings at it', () => {
    const state = game();
    const wf = seat(state, 'wandering');
    const rattler = put(state, wf, 'bonebound', 5, 5, 'bonebound-rattling');
    const plain = put(state, wf, 'bonebound', 12, 12);
    const swinger = put(state, 0, 'orc', 6, 5);
    // About who it is swinging at, not who is standing nearby.
    expect(upgradeAttack(state, swinger, rattler)).toBeLessThan(
      upgradeAttack(state, swinger, plain),
    );
  });
});
