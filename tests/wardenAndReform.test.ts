import { afterEach, describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { UPGRADES } from '../src/model/upgrades';
import { EXORCISM, exorcises } from '../src/sim/exorcism';
import { DISPERSAL, reformSites, reformScattered, scatter, scatters } from '../src/sim/dispersal';
import {
  CLINGING,
  INSISTENT,
  REFORM,
  WARDEN_STRENGTH,
  exorcismStrength,
  clingsOn,
  reformDelayFor,
  upgradeAttack,
  zoneOfControl,
} from '../src/sim/upgradeEffects';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * The two rulings in section 155 that changed systems already shipped.
 *
 * Both Warden upgrades are priced in *"exorcism strength"* and both Revenant
 * upgrades in reform timing, and the game had neither scale: exorcism was a
 * boolean and reform was always the next turn. Jeremy's ruling of 2026-11-02
 * was to build the scales rather than drop the four cards, so each one is a
 * **lever with the old game at one end** -- `EXORCISM.chance = 1` and
 * `REFORM.turns = 1` are exactly sections 150 and 152 before this -- and that
 * is the thing most worth asserting here.
 */

const chanceWas = EXORCISM.chance;
const turnsWas = REFORM.turns;
const failWas = [DISPERSAL.failBase, DISPERSAL.failFloor] as const;
const blockWas = DISPERSAL.ownUnitsBlock;
afterEach(() => {
  UPGRADES.enabled = false;
  EXORCISM.chance = chanceWas;
  EXORCISM.enabled = true;
  REFORM.turns = turnsWas;
  [DISPERSAL.failBase, DISPERSAL.failFloor] = failWas;
  DISPERSAL.ownUnitsBlock = blockWas;
});

function game(): GameState {
  const state = createGame({
    seed: 155,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['hivekin', 'unbound'],
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
  return u;
}

/** A town with a doorway in it, which is what the Unbound need to come back. */
function totem(state: GameState, owner: number, x: number, y: number): City {
  const c = {
    id: state.cities.length + 1,
    owner,
    name: 'Hold',
    x,
    y,
    size: 3,
    buildings: ['anchorTotem'],
  } as unknown as City;
  state.cities.push(c);
  return c;
}

/** The cheap doorway: the one that used to be shut by its own garrison. */
function circle(state: GameState, owner: number, x: number, y: number): City {
  const c = {
    id: state.cities.length + 1,
    owner,
    name: 'Ring',
    x,
    y,
    size: 3,
    buildings: ['retrievalCircle'],
  } as unknown as City;
  state.cities.push(c);
  return c;
}

/** Never fails the roll, so the only thing under test is the waiting. */
function alwaysGathers(): void {
  DISPERSAL.failBase = 0;
  DISPERSAL.failFloor = 0;
}

describe('exorcism is a chance now, and was a certainty', () => {
  it('sends nobody back for good at nought, and everybody at one', () => {
    const state = game();
    const warden = put(state, seat(state, 'hivekin'), 'warden', 5, 5);
    EXORCISM.chance = 0;
    expect(exorcises(state, warden), 'no odds, no exorcism').toBe(false);
    EXORCISM.chance = 1;
    expect(exorcises(state, warden), 'and at one it is section 150 exactly').toBe(true);
  });

  it('still asks whether the thing is an exorcist at all, before any roll', () => {
    const state = game();
    EXORCISM.chance = 1;
    expect(exorcises(state, put(state, 0, 'goblin', 5, 5)), 'a goblin is not').toBe(false);
    EXORCISM.enabled = false;
    expect(exorcises(state, put(state, seat(state, 'hivekin'), 'warden', 6, 5))).toBe(false);
  });

  it('pays a Purging Warden more of it than a Tempered one, and a plain one none', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    const plain = put(state, hive, 'warden', 5, 5);
    const tempered = put(state, hive, 'warden', 6, 5, 'warden-tempered');
    const purging = put(state, hive, 'warden', 7, 5, 'warden-purging');
    expect(exorcismStrength(plain)).toBe(0);
    expect(exorcismStrength(tempered)).toBe(WARDEN_STRENGTH.tempered);
    expect(exorcismStrength(purging)).toBeGreaterThan(exorcismStrength(tempered));
    UPGRADES.enabled = false;
    expect(exorcismStrength(purging), 'and nothing with the box unticked').toBe(0);
  });
});

describe('a spirit waits now, and an Insistent one waits less', () => {
  it('asks two turns of an ordinary one and one of the upgrade', () => {
    UPGRADES.enabled = true;
    expect(reformDelayFor(undefined)).toBe(REFORM.turns);
    expect(reformDelayFor('revenant-settled'), 'any other upgrade waits the usual').toBe(
      REFORM.turns,
    );
    expect(reformDelayFor('revenant-insistent')).toBe(REFORM.insistent);
    expect(REFORM.insistent).toBeLessThan(REFORM.turns);
    UPGRADES.enabled = false;
    expect(reformDelayFor('revenant-insistent'), 'and no shortcut with it off').toBe(REFORM.turns);
  });

  it('leaves the ordinary one scattered on the turn the upgrade stands up', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    totem(state, ub, 10, 10);
    alwaysGathers();
    scatter(state, put(state, ub, 'revenant', 5, 5));
    scatter(state, put(state, ub, 'revenant', 6, 5, 'revenant-insistent'));
    expect(state.players[ub].scattered).toHaveLength(2);
    state.units.length = 0;
    state.turn += 1;
    reformScattered(state, ub);
    expect(state.players[ub].scattered, 'the patient one is still waiting').toHaveLength(1);
    expect(state.players[ub].scattered?.[0].upgrade, 'and it is the plain one').toBeUndefined();
    state.units.length = 0;
    state.turn += 1;
    reformScattered(state, ub);
    expect(state.players[ub].scattered ?? []).toHaveLength(0);
  });

  it('brings a spirit back as what it was, upgrade and all', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    totem(state, ub, 10, 10);
    alwaysGathers();
    scatter(state, put(state, ub, 'revenant', 5, 5, 'revenant-settled'));
    state.units.length = 0;
    state.turn += REFORM.turns;
    reformScattered(state, ub);
    const back = state.units.find((u) => u.owner === ub);
    expect(back?.upgrade, 'a spirit that reforms has not forgotten').toBe('revenant-settled');
  });

  it('pays an Insistent Revenant for having been through this before', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    totem(state, ub, 10, 10);
    alwaysGathers();
    const fresh = put(state, ub, 'revenant', 5, 5, 'revenant-insistent');
    expect(upgradeAttack(state, fresh), 'bought this morning, and nothing yet').toBe(0);
    scatter(state, fresh);
    state.units.length = 0;
    state.turn += REFORM.insistent;
    reformScattered(state, ub);
    const back = state.units.find((u) => u.owner === ub);
    expect(back?.reformed).toBe(true);
    expect(upgradeAttack(state, back as Unit)).toBe(INSISTENT.whenReformed);
  });
});

describe('the two Wardens that hold ground', () => {
  it('has a Purging Warden shut the doorway it is standing beside', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    const hive = seat(state, 'hivekin');
    const home = totem(state, ub, 10, 10);
    expect(reformSites(state, ub)).toHaveLength(1);
    const warden = put(state, hive, 'warden', 11, 10, 'warden-purging');
    expect(reformSites(state, ub), 'not while that is outside').toHaveLength(0);
    warden.x = 20;
    expect(reformSites(state, ub), 'and open again once it leaves').toHaveLength(1);
    put(state, ub, 'warden', 11, 10, 'warden-purging');
    expect(reformSites(state, ub), 'their own Warden shuts nothing').toHaveLength(1);
    expect(home.owner).toBe(ub);
  });

  it('lets their own army stand in a Circle town without shutting it', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    const hive = seat(state, 'hivekin');
    const ring = circle(state, ub, 10, 10);
    expect(reformSites(state, ub), 'an empty Circle town is a doorway').toHaveLength(1);

    // Jeremy's ruling of 2026-11-08, section 169. Their own garrison shut this
    // door 670 times across 24 games and an enemy six, so the clause now asks
    // whose army it is.
    const theirs = put(state, ub, 'revenant', 10, 10);
    expect(reformSites(state, ub), 'their own soldier no longer shuts it').toHaveLength(1);

    // And the old rule is still reachable as a control arm, which is the thing
    // a sweep needs -- section 59.
    DISPERSAL.ownUnitsBlock = true;
    expect(reformSites(state, ub), 'and at the old setting it does').toHaveLength(0);
    DISPERSAL.ownUnitsBlock = false;

    // Somebody else's still does. Nearly hypothetical -- an enemy standing in
    // your city has taken it -- but it is the half of the clause worth keeping.
    theirs.owner = hive;
    expect(reformSites(state, ub), "somebody else's shuts it").toHaveLength(0);
    expect(ring.owner).toBe(ub);
  });

  it('has an Anchored Warden close the ground to the dead and nobody else', () => {
    const state = game();
    const hive = seat(state, 'hivekin');
    const ub = seat(state, 'unbound');
    put(state, hive, 'warden', 5, 5, 'warden-anchored');
    const spirit = put(state, ub, 'revenant', 7, 6);
    const living = put(state, 0, 'orc', 7, 7);
    expect(zoneOfControl(state, spirit, 6, 6), 'beside it').toBe(true);
    expect(zoneOfControl(state, spirit, 8, 8), 'well away').toBe(false);
    expect(zoneOfControl(state, living, 6, 6), 'the living walk past').toBe(false);
    UPGRADES.enabled = false;
    expect(zoneOfControl(state, spirit, 6, 6), 'and nothing with the box unticked').toBe(false);
  });
});

describe('the Clinging Revenant, whose card said the opposite of what it meant', () => {
  /**
   * The flip, and why it is the only reading with anything in it.
   *
   * *"Cannot be dispersed by non-Warden attacks"* taken at face value makes
   * the upgrade a **penalty**: for this faction dispersal is how a unit
   * survives, so a Revenant that cannot be dispersed is one that dies. And an
   * ordinary attack already only scatters it, so the clause had to be about
   * the things that *do* end it -- which is the exorcists. Jeremy's ruling of
   * 2026-11-02: flip it, and let the Warden keep its hard counter.
   */
  it('scatters out of its own town where a Paladin would have ended it', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    const home = totem(state, ub, 10, 10);
    EXORCISM.chance = 1;
    const paladin = put(state, 1, 'paladin', 11, 10);
    const plain = put(state, ub, 'revenant', home.x, home.y);
    expect(scatters(state, plain, paladin), 'an ordinary one is simply dead').toBe(false);
    const clinging = put(state, ub, 'revenant', home.x, home.y, 'revenant-clinging');
    expect(scatters(state, clinging, paladin), 'this one is merely elsewhere').toBe(true);
  });

  it('is ended by a Hive Warden, which is the whole of the exception', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    const home = totem(state, ub, 10, 10);
    EXORCISM.chance = 1;
    const warden = put(state, seat(state, 'hivekin'), 'warden', 11, 10);
    const clinging = put(state, ub, 'revenant', home.x, home.y, 'revenant-clinging');
    expect(clingsOn(state, clinging, warden)).toBe(false);
    expect(scatters(state, clinging, warden)).toBe(false);
    expect(CLINGING.endsIt).toBe('warden');
  });

  it('clings to nothing out in the field, which is how it stays killable', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    totem(state, ub, 10, 10);
    EXORCISM.chance = 1;
    const paladin = put(state, 1, 'paladin', 6, 5);
    const clinging = put(state, ub, 'revenant', 5, 5, 'revenant-clinging');
    expect(clingsOn(state, clinging, paladin), 'no walls, no argument').toBe(false);
    expect(scatters(state, clinging, paladin)).toBe(false);
  });

  it('clings to nothing in a town that is not theirs, or with the box unticked', () => {
    const state = game();
    const ub = seat(state, 'unbound');
    const theirs = totem(state, 1, 10, 10);
    EXORCISM.chance = 1;
    const paladin = put(state, 1, 'paladin', 11, 10);
    const clinging = put(state, ub, 'revenant', theirs.x, theirs.y, 'revenant-clinging');
    expect(clingsOn(state, clinging, paladin), 'defending means its own').toBe(false);
    const home = totem(state, ub, 20, 10);
    const athome = put(state, ub, 'revenant', home.x, home.y, 'revenant-clinging');
    expect(clingsOn(state, athome, paladin)).toBe(true);
    UPGRADES.enabled = false;
    expect(clingsOn(state, athome, paladin)).toBe(false);
  });
});
