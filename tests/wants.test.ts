import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { foundCity, buildOptions } from '../src/sim/city';
import { STANDING_WANTS, wantedHere } from '../src/ai/wants';
import { TECHS } from '../src/model/techs';
import type { City, GameState, Player } from '../src/model/types';

/**
 * Section 155 slice 1: the standing wants, declared once instead of four times.
 *
 * **This file guards a class of bug, not a rule.** `chooseProduction` ranks
 * units on strength, health and price and buildings on gold, science, defence
 * and a barracks. Anything whose reason to exist is none of those is the worst
 * thing in the yard by every number it reads, forever -- so it is never built,
 * the mechanic never reaches the board, and a sweep of it returns identical
 * numbers on both arms having measured nothing.
 *
 * That has happened four times: the Burrower-caste (125), the spy (136), the
 * unseen agent (138) and the reform sites (152). Each was found by a probe
 * after shipping.
 *
 * So what is asserted here is **reachability** -- that each declared want can
 * actually fire -- and the order, because the order is balance and a refactor
 * must not move it. What cannot be asserted is completeness: no test can know
 * about a mechanic nobody wrote a want for, which is why the fifth instance
 * will still be found by a probe if somebody forgets.
 */

/** A town with everything learned, so the yard offers the whole catalogue. */
function yard(faction: 'human' | 'unbound' | 'hivekin' = 'human'): {
  state: GameState;
  city: City;
  owner: Player;
} {
  const state = createGame({
    seed: 5,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: [faction],
  });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  for (const p of state.players) {
    p.explored.fill(1);
    p.techs = TECHS.map((t) => t.id);
  }
  const seat = state.players.findIndex((p) => p.faction === faction);
  const city = foundCity(state, spawnUnit(state, seat, 'peasant', 10, 10))!;
  city.size = 6;
  state.units.length = 0;
  return { state, city, owner: state.players[seat] };
}

const offer = (state: GameState, city: City) => {
  const o = buildOptions(state, city);
  return { units: o.units.filter((u) => !u.sails), buildings: o.buildings };
};

describe('the standing wants', () => {
  it('declares each one once, with an id that says which section it came from', () => {
    const ids = STANDING_WANTS.map((w) => w.id);
    expect(new Set(ids).size, `duplicate want: ${ids.join(', ')}`).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * **The order is balance, not housekeeping.**
   *
   * Section 152's reform-site block carries a comment reading "ahead of the
   * riots and the endings below", which is true of all four of these and
   * reads as though it should be first. It was written last and has always
   * been asked last. Moving it would change which thing a short-of-everything
   * city builds first, which is a balance change wearing a refactor's
   * clothes, so it is pinned here rather than left to a reading of a comment.
   */
  it('asks them in the order the four sections added them', () => {
    expect(STANDING_WANTS.map((w) => w.id)).toEqual([
      'burrower',
      'spy',
      'unseen-agent',
      'reform-site',
    ]);
  });

  it('can actually fire: every want picks something in a yard that offers it', () => {
    // Asked of the side whose mechanic it is -- the reform sites are the
    // Unbound's and nobody else is ever offered one.
    const unreachable: string[] = [];
    // Each want belongs to a side: a Burrower-caste is the Hive's and a
    // reform site is the Unbound's, and asking a Kingdom yard for either
    // would fail for the wrong reason.
    const whose: Record<string, 'human' | 'unbound' | 'hivekin'> = {
      burrower: 'hivekin',
      'reform-site': 'unbound',
      spy: 'human',
      'unseen-agent': 'human',
    };
    for (const want of STANDING_WANTS) {
      const faction = whose[want.id] ?? 'human';
      const { state, city, owner } = yard(faction);
      if (!want.when(state, owner)) {
        unreachable.push(`${want.id}: switched off in the shipped game`);
        continue;
      }
      // Nothing owned, so the want is maximally short.
      if (want.have(state, owner) !== 0) {
        unreachable.push(`${want.id}: starts already satisfied`);
        continue;
      }
      if (want.target(state, owner) <= 0) {
        // Legitimate for a want gated on another: the unseen agent wants
        // nothing until the cheap agents exist. Satisfy every earlier want
        // in full and ask again.
        for (const earlier of STANDING_WANTS) {
          if (earlier.id === want.id) break;
          if (!earlier.when(state, owner)) continue;
          for (let i = 0; i < 8; i++) {
            if (earlier.have(state, owner) >= earlier.target(state, owner)) break;
            const pick = earlier.pick(offer(state, city));
            if (!pick || pick.kind !== 'unit') break;
            spawnUnit(state, owner.id, pick.id, city.x, city.y);
          }
        }
      }
      if (want.target(state, owner) <= 0) {
        unreachable.push(`${want.id}: wants none even once its prerequisite is met`);
        continue;
      }
      if (!want.pick(offer(state, city))) {
        unreachable.push(`${want.id}: nothing in a fully-unlocked yard satisfies it`);
      }
    }
    expect(unreachable, unreachable.join('; ')).toEqual([]);
  });

  it('asks for nothing once every want is satisfied', () => {
    const { state, city, owner } = yard('human');
    // Give the side as many of each as it wants.
    for (const want of STANDING_WANTS) {
      if (!want.when(state, owner)) continue;
      for (let i = 0; i < 6; i++) {
        if (want.have(state, owner) >= want.target(state, owner)) break;
        const pick = want.pick(offer(state, city));
        if (!pick || pick.kind !== 'unit') break;
        spawnUnit(state, owner.id, pick.id, city.x, city.y);
      }
    }
    expect(wantedHere(state, owner, offer(state, city))).toBeNull();
  });

  /**
   * A want that does not apply has to **fall through**, not stop the search.
   *
   * The loop returns the first want that is both short and satisfiable here,
   * so a gate that returned something falsy-but-stopping would silently hide
   * every want below it. The Kingdom is never offered a reform site and never
   * a Burrower, and both sit in the list -- one above the spy and one below
   * it -- so a Kingdom yard asking for an agent is the real test of that.
   */
  it('falls past the wants that are somebody else’s and reaches the next', () => {
    const { state, city, owner } = yard('human');
    const reform = STANDING_WANTS.find((w) => w.id === 'reform-site')!;
    const burrower = STANDING_WANTS.find((w) => w.id === 'burrower')!;
    expect(reform.when(state, owner), 'the Kingdom does not disperse').toBe(false);
    expect(burrower.pick(offer(state, city)), 'no Kingdom yard offers a digger').toBeNull();
    // And the want below the digger is still reached.
    const asked = wantedHere(state, owner, offer(state, city));
    expect(asked, 'the search stopped on a want that did not apply').not.toBeNull();
    expect(asked!.kind).toBe('unit');
  });
});
