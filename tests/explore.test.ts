import { describe, expect, it } from 'vitest';
import { idx } from '../src/engine/grid';
import { createGame, recomputeAllVisibility, spawnUnit } from '../src/sim/gamestate';
import { canExplore, resumeExplore, startExplore } from '../src/sim/explore';
import { ruinState } from '../src/sim/ruins';
import type { GameState } from '../src/model/types';

/** A flat map, all of it dark but a strip at the west edge. */
function darkWorld(): GameState {
  const state = createGame({ seed: 7, width: 30, height: 12 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  state.players[0].explored.fill(0);
  state.players[0].visible.fill(0);
  return state;
}

/**
 * The same, narrowed to a single walkable row. The only way east is through
 * every tile of it, which is what makes "the ruin is in its path" true rather
 * than likely.
 */
function corridor(): GameState {
  const state = darkWorld();
  state.terrain.fill('deep');
  for (let x = 0; x < state.width; x++) state.terrain[idx(x, 6, state.width)] = 'grass';
  return state;
}

function seenCount(state: GameState): number {
  return state.players[0].explored.reduce((n, v) => n + (v ? 1 : 0), 0);
}

describe('explore (section 15)', () => {
  it('walks into the unknown and keeps going next turn', () => {
    const state = darkWorld();
    const unit = spawnUnit(state, 0, 'outrider', 1, 6);
    recomputeAllVisibility(state);
    const before = seenCount(state);

    expect(startExplore(state, unit)).toBe(true);
    const afterOne = seenCount(state);
    expect(afterOne).toBeGreaterThan(before);
    expect(unit.exploring).toBe(true);

    unit.moves = 40;
    resumeExplore(state, 0);
    expect(seenCount(state)).toBeGreaterThan(afterOne);
  });

  it('halts the moment an enemy comes into view', () => {
    const state = darkWorld();
    const unit = spawnUnit(state, 0, 'outrider', 1, 6);
    spawnUnit(state, 1, 'footman', 14, 6);
    recomputeAllVisibility(state);
    unit.moves = 90;

    startExplore(state, unit);
    // It stopped with the footman in view and moves still to spare -- on sight,
    // not because it ran out -- and it looked rather than fought.
    expect(unit.exploring).toBeUndefined();
    expect(unit.moves).toBeGreaterThan(0);
    expect(state.players[0].visible[idx(14, 6, state.width)]).toBe(1);
    expect(state.units.filter((u) => u.owner === 1)).toHaveLength(1);
    expect(state.log.at(-1)?.text).toMatch(/halts/);
  });

  /**
   * Section 136, reported from play: an explorer walked into undisturbed ruins
   * and woke whatever was in them.
   *
   * Section 123 made walking in *the* moment the risk is taken -- it wakes the
   * guardian, spends the rest of the turn, and cannot be undone by walking out
   * again -- which is why the interface asks the player first. An explorer
   * that strolls in has taken that decision on their behalf, and the Orcpedia
   * promises the opposite in as many words.
   */
  it('halts at an unopened ruin rather than walking into it', () => {
    // A one-tile corridor, so "in its path" is a fact rather than a hope: on
    // open ground the route to the nearest dark edge need not pass through any
    // particular tile, and the first draft of this test placed a ruin the
    // explorer simply walked around.
    const state = corridor();
    const unit = spawnUnit(state, 0, 'outrider', 1, 6);
    state.ruins = [{ x: 6, y: 6, prize: 'gold' }];
    recomputeAllVisibility(state);
    unit.moves = 90;

    startExplore(state, unit);
    expect(unit.exploring, 'it should have stopped').toBeUndefined();
    expect(unit.moves, 'stopped on sight, not because it ran out').toBeGreaterThan(0);
    // Short of the ruin, and the ruin still shut.
    expect([unit.x, unit.y]).not.toEqual([6, 6]);
    expect(ruinState(state, 6, 6)).toBe('undisturbed');
    expect(state.log.at(-1)?.text).toMatch(/halts/);
  });

  it('walks over a ruin somebody has already emptied', () => {
    const state = corridor();
    const unit = spawnUnit(state, 0, 'outrider', 1, 6);
    // Opened and cleared: there is nothing left in it to be careful of, so
    // stopping would be a nuisance rather than a mercy.
    state.ruins = [{ x: 6, y: 6, prize: 'gold', takenOn: 1 }];
    recomputeAllVisibility(state);
    unit.moves = 90;

    startExplore(state, unit);
    expect(unit.x, 'it should have carried on past').toBeGreaterThan(6);
  });

  it('stops when there is nothing left to see', () => {
    const state = darkWorld();
    state.players[0].explored.fill(1);
    const unit = spawnUnit(state, 0, 'outrider', 5, 5);
    recomputeAllVisibility(state);
    startExplore(state, unit);
    expect(unit.exploring).toBeUndefined();
    expect([unit.x, unit.y]).toEqual([5, 5]);
  });

  it('is for soldiers, not workers', () => {
    const state = darkWorld();
    const peon = spawnUnit(state, 0, 'peon', 3, 3);
    expect(canExplore(peon).ok).toBe(false);
    expect(startExplore(state, peon)).toBe(false);
    expect(peon.exploring).toBeUndefined();
  });

  it('does not count itself as having seen land it has not', () => {
    const state = darkWorld();
    spawnUnit(state, 0, 'outrider', 1, 6);
    recomputeAllVisibility(state);
    expect(state.players[0].explored[idx(29, 6, state.width)]).toBe(0);
  });
});
