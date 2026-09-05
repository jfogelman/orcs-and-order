import { describe, expect, it } from 'vitest';
import type { City, GameState, Unit } from '../src/model/types';
import {
  CALM,
  CALM_BONUS,
  cityYield,
  contentLimit,
  foundCity,
  isRuined,
  RESETTLE,
  rushBlocked,
} from '../src/sim/city';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep } from '../src/sim/movement';
import { DOMINANCE, beginPlayerTurn, endPlayerTurn, isOver, playerScore } from '../src/sim/turn';

/**
 * Disorder used to be a trap rather than a setback.
 *
 * A rioting city produces no shields, so it could not build the very building
 * that would end its disorder; growth is capped at zero in the same breath, so
 * it could not shrink out either. The only escape was an empire-wide advance
 * arriving for unrelated reasons. Measured at a third of all Horde city-turns
 * against a fifth of the Kingdom's -- see DESIGN_QUEUE section 20.
 */
function riotingCity(): { state: GameState; city: City } {
  const state = createGame({ seed: 20260822, width: 40, height: 30 });
  const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
  const city = foundCity(state, settler)!;
  city.size = CALM.base + 4; // comfortably over any limit it can reach
  city.disorder = true;
  return { state, city };
}

describe('a rioting city', () => {
  it('produces nothing while it works on anything else', () => {
    const { state, city } = riotingCity();
    city.producing = { kind: 'unit', id: 'goblin' } as never;
    expect(cityYield(state, city).shields).toBe(0);
    expect(cityYield(state, city).trade).toBe(0);
  });

  it('may work on the thing that would calm it', () => {
    const { state, city } = riotingCity();
    state.players[0].techs.push('joy-making');
    city.producing = { kind: 'building', id: 'totem' } as never;

    // The whole fix: without this the shields are zero and the building can
    // never be finished, so the riot is permanent.
    expect(cityYield(state, city).shields).toBeGreaterThan(0);
  });

  it('can always fall back on placating, which needs nothing built', () => {
    const { state, city } = riotingCity();
    const before = contentLimit(state, city);
    city.producing = { kind: 'calm' } as never;

    expect(contentLimit(state, city)).toBe(before + CALM_BONUS);
  });

  it('stops rioting once placating is enough', () => {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    city.size = CALM.base + 1; // one over the bare limit
    city.producing = { kind: 'calm' } as never;

    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    expect(city.disorder).toBe(false);
  });
});

describe('the standing production choices', () => {
  it('turn production into research when set to Study', () => {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    city.producing = { kind: 'beakers' } as never;
    const player = state.players[0];
    player.researching = player.researching ?? null;
    const before = player.beakers;

    beginPlayerTurn(state, 0);
    endPlayerTurn(state);

    // More than trade alone would have given, since shields are going in too.
    expect(player.beakers).toBeGreaterThan(before);
  });

  it('never finish, so none of them can be rushed', () => {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    const settler = state.units.find((u) => u.owner === 0 && u.type === 'peon')!;
    const city = foundCity(state, settler)!;
    for (const kind of ['coin', 'beakers', 'calm'] as const) {
      city.producing = { kind } as never;
      expect(rushBlocked(state, city)).toMatch(/not building anything/);
    }
  });
});

/**
 * The see-saw fix from DESIGN_QUEUE section 4i.
 *
 * The war there is reciprocal: whoever loses a city takes it straight back,
 * because the army that lost it is still standing next to it. Captures after
 * turn 150 outnumbered those before it two to one and settled nothing, so no
 * lead ever compounded into a win and every game ran to the turn limit.
 */
describe('a city still being resettled', () => {
  function taken(): { state: GameState; city: City; retaker: Unit } {
    const state = createGame({ seed: 20260822, width: 30, height: 24 });
    state.units.length = 0;
    state.cities.length = 0;
    state.terrain.fill('grass');
    const city: City = {
      id: 1, owner: 0, name: 'Hold', x: 10, y: 10, size: 8,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: 0,
    };
    state.cities.push(city);
    const raider = spawnUnit(state, 1, 'orc', 11, 10, false);
    raider.moves = 2;
    tryStep(state, raider, 10, 10);
    // The raider marches on. What is left is an empty city mid-resettlement,
    // which is exactly the case the see-saw was made of: the army that lost it
    // is still next door and walks straight back in.
    state.units = state.units.filter((u) => u.id !== raider.id);
    // Big enough that the townsfolk cannot see it off, so the test is about
    // the resettlement rule rather than about a militia roll.
    const retaker = spawnUnit(state, 0, 'orc_x3', 9, 10, false);
    retaker.moves = 2;
    return { state, city, retaker };
  }

  it('cannot be taken straight back', () => {
    const { state, city, retaker } = taken();
    expect(city.owner).toBe(1);
    expect(isRuined(state, city)).toBe(true);

    const result = tryStep(state, retaker, 10, 10);

    expect(result.kind).toBe('blocked');
    expect(city.owner).toBe(1);
  });

  it('can be taken once the resettling is over', () => {
    const { state, city, retaker } = taken();
    state.turn += RESETTLE.cap + 1;
    retaker.moves = 2;

    tryStep(state, retaker, 10, 10);

    expect(city.owner).toBe(0);
  });

  it('leaves a city nobody has touched perfectly takeable', () => {
    const { state } = taken();
    const quiet: City = {
      id: 2, owner: 0, name: 'Quiet', x: 20, y: 10, size: 5,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: 0,
    };
    state.cities.push(quiet);
    const raider = spawnUnit(state, 1, 'orc', 21, 10, false);
    raider.moves = 2;

    tryStep(state, raider, 20, 10);

    expect(quiet.owner).toBe(1);
  });
});

/**
 * Winning by being obviously in front, rather than by wiping anybody out.
 *
 * The game had two endings, total elimination and the clock, and section 4i
 * measured that the first never happens: the fewest cities either side ever
 * holds averages 3.4 and 4.1. Thirty-three games in thirty-six were being
 * settled on points.
 */
describe('a dominance victory', () => {
  function board(orcCities: number, humanCities: number, turn: number): GameState {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    state.units.length = 0;
    state.cities.length = 0;
    state.turn = turn;
    state.winner = null;
    let id = 1;
    const add = (owner: number) => {
      state.cities.push({
        id: id++, owner, name: `C${id}`, x: 2 + id, y: 2 + owner * 4, size: 3,
        food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
        workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: owner,
      });
    };
    for (let i = 0; i < orcCities; i++) add(0);
    for (let i = 0; i < humanCities; i++) add(1);
    return state;
  }

  const run = (state: GameState, turns: number) => {
    for (let i = 0; i < turns; i++) {
      beginPlayerTurn(state, state.activePlayer);
      endPlayerTurn(state);
    }
  };

  it('is won by holding a commanding share without a break', () => {
    const state = board(12, 4, DOMINANCE.notBefore + 1);
    run(state, DOMINANCE.turns * 2 + 4);
    expect(state.winner).toBe(0);
  });

  it('is not won on a share held only briefly', () => {
    const state = board(12, 4, DOMINANCE.notBefore + 1);
    run(state, 2);
    // Section 4i measured routine three-hundred-point swings late on, so a
    // threshold met for a turn or two would fire on noise.
    expect(state.winner).toBeNull();
  });

  it('starts the count again when the share slips', () => {
    const state = board(12, 4, DOMINANCE.notBefore + 1);
    run(state, 4);
    // Hand enough over to drop below the share, then take them back.
    for (const c of state.cities.slice(0, 5)) c.owner = 1;
    run(state, 2);
    expect(state.players[0].dominantSince).toBeUndefined();
    expect(state.winner).toBeNull();
  });

  it('cannot be won by simply settling faster early on', () => {
    const state = board(12, 4, 20);
    run(state, DOMINANCE.turns * 2 + 4);
    // Winning the opening is not winning. Without this a side that founded
    // four cities to the other two won outright, having never met them.
    expect(state.winner).toBeNull();
  });

  it('ignores a share of a map with barely anything on it', () => {
    const state = board(4, 1, DOMINANCE.notBefore + 1);
    run(state, DOMINANCE.turns * 2 + 4);
    expect(state.winner).toBeNull();
  });

  /**
   * Reported from a played game that ended on turn 137. The condition was met
   * fairly -- three quarters of the world, held for ten turns -- but the losing
   * player was never told it was running, so ten turns of being one tick from
   * defeat arrived as a game that simply stopped. A countdown nobody can see is
   * indistinguishable from a bug, and was reported as one.
   */
  it('tells the other side the moment the clock starts', () => {
    const state = board(12, 4, DOMINANCE.notBefore + 1);
    run(state, 1);

    const warned = state.log.filter(
      (e) => e.player === 1 && /most of the world/i.test(e.text),
    );
    expect(warned.length, 'the losing side was told nothing').toBeGreaterThan(0);
    // And it says what to do about it, not merely that it is happening.
    expect(warned[0].text).toMatch(/take some of it back/i);
  });

  it('tells the leader too, so a win does not arrive unannounced', () => {
    const state = board(12, 4, DOMINANCE.notBefore + 1);
    run(state, 1);
    expect(state.log.some((e) => e.player === 0 && /you hold most of the world/i.test(e.text)))
      .toBe(true);
  });

  it('says it once, not once per check', () => {
    const state = board(12, 4, DOMINANCE.notBefore + 1);
    // `run` takes one player-turn per step, so a game turn costs two of them.
    run(state, DOMINANCE.turns * 2 + 2);

    // A first draft counted the turns down in the log and repeated itself six
    // times a turn, because the check runs more often than the turn advances.
    // The countdown moved to the advisors, who are asked rather than shouting.
    const shouts = state.log.filter((e) => /most of the world/i.test(e.text));
    expect(shouts.filter((e) => e.player === 1)).toHaveLength(1);
    expect(shouts.filter((e) => e.player === 0)).toHaveLength(1);
  });

  it('says nothing at all while nobody is close', () => {
    // Level, so neither side is anywhere near three quarters. Twelve against
    // one would have *the orcs* dominant, which is the warning working rather
    // than the silence being tested.
    const state = board(6, 6, DOMINANCE.notBefore + 1);
    run(state, DOMINANCE.turns * 2 + 2);
    expect(state.log.some((e) => /most of the world/i.test(e.text))).toBe(false);
  });
});

/**
 * Level on points is a draw, and says so.
 *
 * Sorting the survivors by score is stable, so taking the first of a tie handed
 * the game to whoever came first in player order -- the Horde, every time --
 * and then logged that they were "ahead on points". It was the one line in the
 * game that could state something false. Measured over thirty-six games it
 * never fired, the closest being four points apart, so this is about being
 * correct rather than about being common.
 */
describe('a game that ends exactly level', () => {
  function atTheBell(orcCities: number, humanCities: number): GameState {
    const state = createGame({ seed: 20260822, width: 40, height: 30 });
    state.units.length = 0;
    state.cities.length = 0;
    state.winner = null;
    delete state.victory;
    let id = 1;
    const add = (owner: number, size: number) => {
      state.cities.push({
        id: id++, owner, name: `C${id}`, x: 2 + id * 2, y: 3 + owner * 6, size,
        food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
        workedTiles: [], disorder: false, foundedTurn: 1, foundedBy: owner,
      });
    };
    for (let i = 0; i < orcCities; i++) add(0, 3);
    for (let i = 0; i < humanCities; i++) add(1, 3);
    state.turn = state.settings.maxTurns + 1;
    return state;
  }

  it('is a draw, with nobody winning', () => {
    const state = atTheBell(3, 3);
    expect(playerScore(state, 0)).toBe(playerScore(state, 1));

    endPlayerTurn(state);

    expect(state.victory).toBe('draw');
    expect(state.winner).toBeNull();
  });

  it('is over, even though there is no winner', () => {
    const state = atTheBell(3, 3);
    endPlayerTurn(state);
    // The reason isOver exists: a dozen places read `winner === null` as
    // "still playing", which a drawn game is not.
    expect(isOver(state)).toBe(true);
  });

  it('still declares a winner when the totals differ', () => {
    const state = atTheBell(4, 3);
    expect(playerScore(state, 0)).toBeGreaterThan(playerScore(state, 1));

    endPlayerTurn(state);

    expect(state.victory).toBe('points');
    expect(state.winner).toBe(0);
  });
});
