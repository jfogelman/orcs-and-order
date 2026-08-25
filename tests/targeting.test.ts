import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { UNIT_TYPES, unitType } from '../src/model/units';
import type { GameState, Unit } from '../src/model/types';
import {
  abilitiesOf,
  abilityReady,
  abilityTargets,
  RANGED_ROUNDS,
  useAbility,
} from '../src/sim/abilities';
import { resolveCombat, resupply, resupplyBlocked } from '../src/sim/combat';
import { REARM_TURNS, ammoLeft } from '../src/sim/abilities';
import { createGame, recomputeVisibility, spawnUnit } from '../src/sim/gamestate';
import { runAiTurn } from '../src/ai/ai';
import { SFX_FILES } from '../src/audio/audio';
import { beginPlayerTurn, endPlayerTurn } from '../src/sim/turn';
import {
  attackStrength,
  breatheThrough,
  BREATH_CARRY,
  DISARMED_ATTACK,
} from '../src/sim/combat';
import { THROW_BONUS } from '../src/sim/abilities';
import { tryStep } from '../src/sim/movement';

/**
 * Targeted abilities: who can be picked, and what happens when they are.
 *
 * The legality rules matter more than the damage here — they are what the
 * interface draws, so a mistake in them is a mistake the player can see and
 * click on.
 */

/**
 * The toughest unit in the game, whatever it happens to be. Picked at runtime
 * rather than named, so re-tuning a count ladder cannot quietly turn "survives
 * a volley" into a test of something much smaller.
 */
const TOUGHEST = Object.values(UNIT_TYPES).reduce((a, b) => (b.hp > a.hp ? b : a)).id;

/** An empty grass board with nothing on it but what a test puts there. */
function board(): GameState {
  const state = createGame({ seed: 31337, width: 30, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  return state;
}

/** Everything the acting player could possibly see, so fog is not the variable. */
function revealAll(state: GameState, playerId: number): void {
  state.players[playerId].visible.fill(1);
  state.players[playerId].explored.fill(1);
}

describe('which units have a targeted ability', () => {
  it('gives reach to the artillery, and an opening blow to the skirmishers', () => {
    const state = board();
    // Archers and axethrowers used to be artillery too, and an army half made
    // of units that cannot enter a city turned out to be very bad at finishing
    // a war -- a third of all sieges were besiegers who could not walk in. They
    // are ordinary fighters now with a free blow as they close. See
    // DESIGN_QUEUE sections 38 and 39.
    for (const id of ['mage', 'ballista']) {
      expect(unitType(id).range, `${id} should strike at range`).toBe(2);
    }
    for (const id of ['archer', 'axethrower']) {
      expect(unitType(id).range, `${id} should have to close`).toBe(1);
      expect(unitType(id).firstStrikes, `${id} should open the fight`).toBeGreaterThan(0);
    }
    for (const id of ['orc', 'footman', 'knight', 'troll']) {
      expect(unitType(id).range, `${id} should have to close`).toBe(1);
      expect(unitType(id).firstStrikes, `${id} should not strike first`).toBe(0);
      // Everything that is not itself a gun can in principle carry ammunition
      // to one; whether it may feed a *particular* gun is a question for the
      // target list, since a ballista is loaded by the archery line and the
      // Horde's artillery is loaded with whoever is standing nearest.
      expect(abilitiesOf(spawnUnit(state, 0, id, 1, 1))).toEqual(['reload']);
    }
    // A settler has other things to be doing.
    expect(abilitiesOf(spawnUnit(state, 0, 'peon', 1, 1))).toEqual([]);
  });

  it('scales the paladin heal with the size of the group', () => {
    // One patches a unit up to half; two finish the job.
    expect(unitType('paladin').healsTo).toBeCloseTo(0.5);
    expect(unitType('paladin_x2').healsTo).toBeCloseTo(1);
  });
});

describe('legal targets', () => {
  it('is exactly two tiles for a ranged attack, not one and not three', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'ballista', 10, 10);
    const adjacent = spawnUnit(state, 0, 'orc', 11, 10);
    const atReach = spawnUnit(state, 0, 'orc', 12, 10);
    const tooFar = spawnUnit(state, 0, 'orc', 13, 10);

    const ids = abilityTargets(state, archer, 'ranged').map((u) => u.id);
    expect(ids).toContain(atReach.id);
    expect(ids).not.toContain(adjacent.id);
    expect(ids).not.toContain(tooFar.id);
  });

  it('measures reach diagonally, the same way movement does', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'ballista', 10, 10);
    const diagonal = spawnUnit(state, 0, 'orc', 12, 12);
    expect(abilityTargets(state, archer, 'ranged').map((u) => u.id)).toContain(diagonal.id);
  });

  it('never offers a target the acting player cannot see', () => {
    const state = board();
    const archer = spawnUnit(state, 1, 'ballista', 10, 10);
    const hidden = spawnUnit(state, 0, 'orc', 12, 10);
    // Nothing revealed: the archer has no idea anyone is there.
    state.players[1].visible.fill(0);
    expect(abilityTargets(state, archer, 'ranged')).toEqual([]);

    // This is the fog-of-war leak the whole rule exists to prevent: an armed
    // ability must not light up a tile and confirm an enemy is standing on it.
    state.players[1].visible[idx(hidden.x, hidden.y, state.width)] = 1;
    expect(abilityTargets(state, archer, 'ranged').map((u) => u.id)).toEqual([hidden.id]);
  });

  it('will not let a ranged unit shoot its own side', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'ballista', 10, 10);
    spawnUnit(state, 1, 'footman', 12, 10);
    expect(abilityTargets(state, archer, 'ranged')).toEqual([]);
  });

  it('offers healing only to wounded neighbours on your own side', () => {
    const state = board();
    revealAll(state, 1);
    const paladin = spawnUnit(state, 1, 'paladin', 10, 10);
    const hurtFriend = spawnUnit(state, 1, 'footman', 11, 10);
    const wellFriend = spawnUnit(state, 1, 'footman', 9, 10);
    const hurtEnemy = spawnUnit(state, 0, 'orc', 10, 11);
    const farFriend = spawnUnit(state, 1, 'footman', 12, 10);
    hurtFriend.hp = 1;
    hurtEnemy.hp = 1;
    farFriend.hp = 1;

    const ids = abilityTargets(state, paladin, 'heal').map((u) => u.id);
    expect(ids).toEqual([hurtFriend.id]);
    expect(ids).not.toContain(wellFriend.id);
    expect(ids).not.toContain(hurtEnemy.id);
    expect(ids).not.toContain(farFriend.id);
  });

  it('will not let a paladin heal itself', () => {
    const state = board();
    revealAll(state, 1);
    const paladin = spawnUnit(state, 1, 'paladin', 10, 10);
    paladin.hp = 1;
    expect(abilityTargets(state, paladin, 'heal')).toEqual([]);
  });

  it('offers nothing once the unit has spent its turn', () => {
    const state = board();
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'ballista', 10, 10);
    spawnUnit(state, 0, 'orc', 12, 10);
    expect(abilityTargets(state, archer, 'ranged')).toHaveLength(1);

    archer.moves = 0;
    expect(abilityReady(archer, 'ranged')).toMatch(/movement/i);
    expect(abilityTargets(state, archer, 'ranged')).toEqual([]);
  });
});

describe('firing at range', () => {
  /** An archer and a target two tiles apart, both fully visible. */
  function range2(targetType = 'orc'): { state: GameState; archer: Unit; target: Unit } {
    // A mage rather than an archer: the archer closes and strikes first now,
    // and of the two units that still fire, the mage is the one that can see
    // as far as it shoots. A ballista has sight 1 and range 2 -- see the
    // spotter test below.
    const state = board();
    revealAll(state, 0);
    revealAll(state, 1);
    const archer = spawnUnit(state, 1, 'mage', 10, 10);
    const target = spawnUnit(state, 0, targetType, 12, 10);
    recomputeVisibility(state, 1);
    return { state, archer, target };
  }

  it('never lets the target hit back', () => {
    // The whole point of reach. Run it enough times that a retaliating
    // implementation could not get away with it by luck.
    for (let i = 0; i < 30; i++) {
      const { state, archer, target } = range2('ogre');
      const before = archer.hp;
      useAbility(state, archer, 'ranged', target);
      expect(archer.hp, 'the archer took damage from something it shot at').toBe(before);
    }
  });

  it('spends the whole turn on one shot', () => {
    const { state, archer, target } = range2();
    archer.moves = 3;
    useAbility(state, archer, 'ranged', target);
    expect(archer.moves).toBe(0);
  });

  it('does a few rounds of damage rather than fighting to the death', () => {
    // A big target must survive a single volley, or "3 rounds" means nothing.
    let survived = 0;
    for (let i = 0; i < 20; i++) {
      const { state, archer, target } = range2(TOUGHEST);
      useAbility(state, archer, 'ranged', target);
      if (target.hp > 0) survived++;
    }
    expect(survived, 'a volley wiped out a large unit every time').toBe(20);
  });

  it('caps the damage at the rounds it is allowed', () => {
    const { state, archer, target } = range2(TOUGHEST);
    const before = target.hp;
    const out = useAbility(state, archer, 'ranged', target);
    const perRound = Math.max(
      1,
      Math.round(Math.max(unitType('archer').hp, unitType(TOUGHEST).hp) / 15),
    );
    expect(out.ok).toBe(true);
    expect(before - target.hp).toBeLessThanOrEqual(perRound * RANGED_ROUNDS);
  });

  it('removes a target it kills', () => {
    const { state, archer, target } = range2();
    target.hp = 1;
    const out = useAbility(state, archer, 'ranged', target);
    if (out.killed) {
      expect(state.units.find((u) => u.id === target.id)).toBeUndefined();
    }
  });

  it('refuses a target that is not legal, and changes nothing', () => {
    const { state, archer } = range2();
    const adjacent = spawnUnit(state, 0, 'orc', 11, 10);
    archer.moves = 2;
    const out = useAbility(state, archer, 'ranged', adjacent);
    expect(out.ok).toBe(false);
    expect(adjacent.hp).toBe(unitType('orc').hp);
    expect(archer.moves, 'a refused ability still cost the turn').toBe(2);
  });
});

describe('healing', () => {
  function pair(healer = 'paladin'): { state: GameState; medic: Unit; patient: Unit } {
    const state = board();
    revealAll(state, 1);
    const medic = spawnUnit(state, 1, healer, 10, 10);
    const patient = spawnUnit(state, 1, 'footman', 11, 10);
    return { state, medic, patient };
  }

  it('brings a wounded friend up to half with one paladin', () => {
    const { state, medic, patient } = pair();
    const max = unitType('footman').hp;
    patient.hp = 1;
    useAbility(state, medic, 'heal', patient);
    expect(patient.hp).toBe(Math.round(max * 0.5));
  });

  it('brings them all the way with two', () => {
    const { state, medic, patient } = pair('paladin_x2');
    const max = unitType('footman').hp;
    patient.hp = 1;
    useAbility(state, medic, 'heal', patient);
    expect(patient.hp).toBe(max);
  });

  it('does not injure someone already healthier than the ceiling', () => {
    const { state, medic, patient } = pair();
    const max = unitType('footman').hp;
    patient.hp = max - 1;
    const out = useAbility(state, medic, 'heal', patient);
    expect(out.amount).toBe(0);
    expect(patient.hp, 'healing pulled a healthy unit back down').toBe(max - 1);
  });

  it('costs the healer its turn either way', () => {
    const { state, medic, patient } = pair();
    patient.hp = 1;
    medic.moves = 2;
    useAbility(state, medic, 'heal', patient);
    expect(medic.moves).toBe(0);
  });
});

describe('every sound the simulation asks for actually exists', () => {
  it('emits no cue that is not a real sound id', () => {
    // Two cues were invented while writing the abilities above -- 'combat' and
    // 'heal' -- and neither is a sound the game has. Nothing failed; they just
    // silently did nothing. This is the cheapest possible guard against that,
    // and it covers every cue any rule emits, not only the new ones.
    const known = new Set(Object.keys(SFX_FILES));
    const state = createGame({ seed: 606 });
    state.players[0].controller = 'ai';
    beginPlayerTurn(state, 0);
    for (let i = 0; i < 120 && state.winner === null; i++) {
      runAiTurn(state, state.activePlayer);
      endPlayerTurn(state);
    }
    const bogus = [...new Set(state.log.map((e) => e.cue).filter(Boolean))].filter(
      (c) => !known.has(c as string),
    );
    expect(bogus, `these cues name no sound file: ${bogus.join(', ')}`).toEqual([]);
  });

  it('covers the cues the targeted abilities emit', () => {
    const known = new Set(Object.keys(SFX_FILES));
    // A short AI game will not fire an arrow or heal anyone, so check these
    // two directly rather than hoping the sweep above happened to reach them.
    const state = board();
    revealAll(state, 1);
    const medic = spawnUnit(state, 1, 'paladin', 10, 10);
    const patient = spawnUnit(state, 1, 'footman', 11, 10);
    patient.hp = 1;
    const archer = spawnUnit(state, 1, 'ballista', 5, 5);
    const foe = spawnUnit(state, 0, 'orc', 7, 5);
    useAbility(state, medic, 'heal', patient);
    useAbility(state, archer, 'ranged', foe);
    for (const entry of state.log) {
      if (entry.cue) expect(known.has(entry.cue), `no sound named ${entry.cue}`).toBe(true);
    }
  });
});

/**
 * A ballista shoots two tiles and sees one. On its own it is blind to
 * everything it is allowed to hit, and needs somebody standing forward to spot
 * for it -- which is why a lone one never fires and a ballista behind a line
 * does. Found while moving these tests off the archer, and pinned here because
 * nothing else in the suite said it.
 */
describe('a ballista needs someone to spot for it', () => {
  it('cannot fire at what it cannot see by itself', () => {
    const state = board();
    const ballista = spawnUnit(state, 1, 'ballista', 10, 10);
    spawnUnit(state, 0, 'orc', 12, 10);
    recomputeVisibility(state, 1);

    expect(unitType('ballista').range).toBe(2);
    expect(unitType('ballista').sight).toBeLessThan(unitType('ballista').range);
    expect(abilityTargets(state, ballista, 'ranged')).toEqual([]);
  });

  it('fires once something of ours is far enough forward to see', () => {
    const state = board();
    const ballista = spawnUnit(state, 1, 'ballista', 10, 10);
    const target = spawnUnit(state, 0, 'orc', 12, 10);
    // A footman standing next to the target is all the spotting it needs.
    spawnUnit(state, 1, 'footman', 11, 10);
    recomputeVisibility(state, 1);

    expect(abilityTargets(state, ballista, 'ranged').map((u) => u.id)).toContain(target.id);
  });
});

/**
 * Artillery is the only thing in the game that hits without being hit back and
 * can keep doing it, and the chooser rated a ballista the Kingdom's best buy on
 * exactly that basis -- it built a hundred and eleven a game. A magazine is the
 * structural answer rather than another constant to tune: a hundred and eleven
 * ballistas cannot all be kept in missiles. See DESIGN_QUEUE section 40.
 */
describe('a ballista carries a finite number of bolts', () => {
  function battery() {
    const state = board();
    revealAll(state, 1);
    const gun = spawnUnit(state, 1, 'ballista', 10, 10);
    const spotter = spawnUnit(state, 1, 'footman', 11, 10);
    const foe = spawnUnit(state, 0, 'orc', 12, 10);
    recomputeVisibility(state, 1);
    return { state, gun, spotter, foe };
  }

  it('starts loaded and spends a bolt a shot', () => {
    const { state, gun, foe } = battery();
    const max = unitType('ballista').ammo;
    expect(max).toBeGreaterThan(0);
    // Absent on a fresh unit rather than written out, so old saves read as full.
    expect(gun.ammo).toBeUndefined();
    expect(ammoLeft(gun)).toBe(max);

    useAbility(state, gun, 'ranged', foe);
    expect(ammoLeft(gun)).toBe(max - 1);
  });

  it('stops firing when it runs dry, and says so', () => {
    const { state, gun, foe } = battery();
    gun.ammo = 0;
    gun.moves = 2;
    expect(abilityReady(gun, 'ranged')).toMatch(/missile/i);
    const out = useAbility(state, gun, 'ranged', foe);
    expect(out.ok).toBe(false);
    expect(foe.hp).toBe(unitType(foe.type).hp);
  });

  it('is fed by the archery line and not by just anyone', () => {
    const { state, gun, spotter } = battery();
    gun.ammo = 0;
    const archer = spawnUnit(state, 1, 'archer', 10, 11);

    expect(abilityTargets(state, archer, 'reload').map((u) => u.id)).toContain(gun.id);
    // A footman has no idea how to make a ballista bolt.
    expect(abilityTargets(state, spotter, 'reload')).toEqual([]);
  });

  it('costs the helper its whole turn for one bolt', () => {
    const { state, gun } = battery();
    gun.ammo = 0;
    const archer = spawnUnit(state, 1, 'archer', 10, 11);
    archer.moves = 2;

    useAbility(state, archer, 'reload', gun);

    expect(ammoLeft(gun)).toBe(1);
    expect(archer.moves, 'a battery needs a tail, and the tail costs turns').toBe(0);
    expect(state.units, 'labour reloading must not eat the helper').toContain(archer);
  });

  it('fills right up from a city instead', () => {
    const { state, gun } = battery();
    gun.ammo = 0;
    state.cities.push({
      id: 99, owner: 1, name: 'Armoury', x: 10, y: 11, size: 3, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' }, workedTiles: [], disorder: false, foundedTurn: 1,
    });

    expect(resupplyBlocked(state, gun)).toBeNull();
    expect(resupply(state, gun)).toBe(true);
    // A city has an armoury in it; a neighbour in the field has one bolt.
    expect(ammoLeft(gun)).toBe(unitType('ballista').ammo);
  });
});

/**
 * The Horde's answer to the ballista. Where the Kingdom's artillery is fed by
 * people who make missiles, this one is fed by the missiles themselves, who
 * have been told it is a promotion.
 */
describe('the Goblin Catapult is loaded with goblins', () => {
  function battery() {
    const state = board();
    revealAll(state, 0);
    const gun = spawnUnit(state, 0, 'goblincatapult', 10, 10);
    gun.ammo = 0;
    return { state, gun };
  }

  it('eats the goblin it is loaded with', () => {
    const { state, gun } = battery();
    const volunteer = spawnUnit(state, 0, 'goblin', 11, 10);

    expect(abilityTargets(state, volunteer, 'reload').map((u) => u.id)).toContain(gun.id);
    useAbility(state, volunteer, 'reload', gun);

    expect(ammoLeft(gun)).toBe(1);
    // The whole difference between the two artillery pieces: the Kingdom's
    // helper walks away, and this one does not.
    expect(state.units, 'the volunteer should be in the hopper').not.toContain(volunteer);
  });

  it('loads a whole group at once', () => {
    const { state, gun } = battery();
    const three = spawnUnit(state, 0, 'goblin_x3', 11, 10);

    useAbility(state, three, 'reload', gun);

    // Three Goblins is three shots, which is what makes the counting ladder
    // worth something to a siege train.
    expect(ammoLeft(gun)).toBe(3);
    expect(state.units).not.toContain(three);
  });

  it('will not fire anything the Horde actually values', () => {
    const { state, gun } = battery();
    const troll = spawnUnit(state, 0, 'troll', 11, 10);
    const ogre = spawnUnit(state, 0, 'ogre', 10, 11);

    // A rule rather than a price threshold, so nothing ever works out that a
    // dragon is cheap enough to fire at a wall.
    expect(abilityTargets(state, troll, 'reload')).toEqual([]);
    expect(abilityTargets(state, ogre, 'reload')).toEqual([]);
    expect(ammoLeft(gun)).toBe(0);
  });

  it('never overfills, however many volunteers there are', () => {
    const { state, gun } = battery();
    const max = unitType('goblincatapult').ammo;
    // Five goblins into a hopper that holds three.
    const crowd = spawnUnit(state, 0, 'goblin_x5', 11, 10);

    useAbility(state, crowd, 'reload', gun);

    expect(ammoLeft(gun)).toBe(max);
  });
});

describe('the axethrower has exactly one axe', () => {
  function thrower(): { state: GameState; axe: Unit; foe: Unit } {
    const state = board();
    revealAll(state, 0);
    const axe = spawnUnit(state, 0, 'axethrower', 10, 10);
    const foe = spawnUnit(state, 1, 'ogre', 12, 10);
    return { state, axe, foe };
  }

  it('starts armed, and throws the axe as its opening blow', () => {
    const { state, axe, foe } = thrower();
    expect(axe.disarmed).toBe(false);
    expect(unitType(axe.type).firstStrikes).toBeGreaterThan(0);

    resolveCombat(state, axe, foe);

    // The free blow *is* the axe leaving its hand, which is the whole joke and
    // now also the whole mechanic: it fights the rest of the exchange without
    // one, and fetches it back a couple of turns later.
    expect(axe.disarmed).toBe(true);
    expect(axe.rearmIn).toBe(REARM_TURNS);
  });

  it('does not throw a second axe it has not got', () => {
    const { state, axe, foe } = thrower();
    resolveCombat(state, axe, foe);
    const pending = axe.rearmIn;

    const again = spawnUnit(state, 1, 'ogre', 11, 10);
    if (axe.hp > 0) resolveCombat(state, axe, again);

    // Still the one axe, and the fetch already under way is not restarted --
    // which would leave a thrower permanently two turns from having one.
    expect(axe.disarmed).toBe(true);
    expect(axe.rearmIn).toBe(pending);
  });

  it('fights at a quarter strength while disarmed', () => {
    const { state, axe, foe } = thrower();
    const armedStrength = attackStrength(state, axe, foe).total;
    axe.disarmed = true;
    expect(attackStrength(state, axe, foe).total).toBeCloseTo(armedStrength * DISARMED_ATTACK);
  });

  it('throws harder than it swings', () => {
    // The whole trade: one big hit at range, then a much worse unit.
    const { state, axe, foe } = thrower();
    expect(unitType('axethrower').throwsWeapon).toBe(true);
    expect(THROW_BONUS).toBeGreaterThan(1);
    expect(attackStrength(state, axe, foe).total * THROW_BONUS).toBeGreaterThan(
      attackStrength(state, axe, foe).total,
    );
  });

  it('gets an axe back by walking into a friendly city', () => {
    const { state, axe } = thrower();
    axe.disarmed = true;
    state.cities.push({
      id: 1, owner: 0, name: 'Axeholm', x: 11, y: 10, size: 3,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1,
    });
    axe.moves = 2;
    tryStep(state, axe, 11, 10);
    expect(axe.disarmed).toBe(false);
  });

  it('gets an axe back by killing somebody', () => {
    const { state, axe } = thrower();
    axe.disarmed = true;
    const victim = spawnUnit(state, 1, 'peasant', 11, 10);
    victim.hp = 1;
    axe.moves = 2;
    // Keep swinging until it wins; disarmed it may well lose the first try.
    for (let i = 0; i < 40 && state.units.includes(victim); i++) {
      axe.hp = unitType('axethrower').hp;
      axe.moves = 2;
      tryStep(state, axe, victim.x, victim.y);
      if (!state.units.includes(axe)) break;
    }
    if (!state.units.includes(victim) && state.units.includes(axe)) {
      expect(axe.disarmed, 'killing somebody should have got the axe back').toBe(false);
    }
  });
});

describe("a dragon's breath carries past its target", () => {
  function line(behindOwner: number): { state: GameState; dragon: Unit; front: Unit; behind: Unit } {
    const state = board();
    revealAll(state, 0);
    const dragon = spawnUnit(state, 0, 'dragon', 10, 10);
    const front = spawnUnit(state, 1, 'footman', 11, 10);
    const behind = spawnUnit(state, behindOwner, 'footman', 12, 10);
    return { state, dragon, front, behind };
  }

  it('hits the unit directly beyond, for a share of the damage', () => {
    const { state, dragon, front, behind } = line(1);
    const before = behind.hp;
    breatheThrough(state, dragon, front, 10);
    expect(behind.hp).toBe(before - Math.round(10 * BREATH_CARRY));
  });

  it('does not care whose side that unit is on', () => {
    // Positioning is the mechanic. A dragon lined up behind your own front
    // rank will cook it, and that is deliberate.
    const { state, dragon, front, behind } = line(0);
    const before = behind.hp;
    breatheThrough(state, dragon, front, 10);
    expect(behind.hp, 'the breath spared a friendly unit').toBeLessThan(before);
  });

  it('follows the line the attack was already travelling, including diagonals', () => {
    const state = board();
    revealAll(state, 0);
    const dragon = spawnUnit(state, 0, 'dragon', 10, 10);
    const front = spawnUnit(state, 1, 'footman', 11, 11);
    const behind = spawnUnit(state, 1, 'footman', 12, 12);
    const aside = spawnUnit(state, 1, 'footman', 11, 12);
    const asideBefore = aside.hp;
    breatheThrough(state, dragon, front, 10);
    expect(behind.hp).toBeLessThan(unitType('footman').hp);
    expect(aside.hp, 'the breath bent around a corner').toBe(asideBefore);
  });

  it('does nothing when the tile behind is empty, and nothing for other creatures', () => {
    const state = board();
    revealAll(state, 0);
    const dragon = spawnUnit(state, 0, 'dragon', 10, 10);
    const front = spawnUnit(state, 1, 'footman', 11, 10);
    expect(breatheThrough(state, dragon, front, 10)).toBeNull();

    const orc = spawnUnit(state, 0, 'orc', 5, 5);
    const target = spawnUnit(state, 1, 'footman', 6, 5);
    const behind = spawnUnit(state, 1, 'footman', 7, 5);
    expect(breatheThrough(state, orc, target, 10)).toBeNull();
    expect(behind.hp).toBe(unitType('footman').hp);
  });
});
