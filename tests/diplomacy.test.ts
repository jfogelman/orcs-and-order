import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { tryStep, attackTargets } from '../src/sim/movement';
import { foundCity, contentLimit } from '../src/sim/city';
import { endPlayerTurn } from '../src/sim/turn';
import {
  PEACE,
  atPeace,
  ashamed,
  atWarLately,
  betrayals,
  breakPeace,
  hostile,
  noteClash,
  peaceLeft,
  signPeace,
} from '../src/sim/diplomacy';
import { aiAccepts, aiDiplomacy } from '../src/ai/diplomacy';
import { deserialize, serialize } from '../src/persist/save';
import type { GameState } from '../src/model/types';

function board(): GameState {
  const state = createGame({ seed: 12, width: 30, height: 20 });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.turn = 50;
  for (const p of state.players) p.visible.fill(1);
  return state;
}

describe('a peace (section 116)', () => {
  it('stops the fighting while it holds', () => {
    const state = board();
    const ours = spawnUnit(state, 0, 'orc', 10, 10);
    spawnUnit(state, 1, 'footman', 11, 10);
    signPeace(state, { from: 0, to: 1, gold: 0 });
    expect(atPeace(state, 0, 1)).toBe(true);
    expect(attackTargets(state, ours).size).toBe(0);
    const tried = tryStep(state, ours, 11, 10);
    expect(tried.kind).toBe('blocked');
    expect(state.units).toHaveLength(2);
  });

  it('keeps their towns theirs', () => {
    const state = board();
    const theirs = foundCity(state, spawnUnit(state, 1, 'peasant', 15, 10))!;
    state.units = state.units.filter((u) => !(u.x === theirs.x && u.y === theirs.y));
    const ours = spawnUnit(state, 0, 'orc', 14, 10);
    signPeace(state, { from: 0, to: 1, gold: 0 });
    expect(tryStep(state, ours, 15, 10).kind).toBe('blocked');
    expect(theirs.owner).toBe(1);
  });

  it('never covers the wilds', () => {
    const state = board();
    signPeace(state, { from: 0, to: 1, gold: 0 });
    expect(hostile(state, 0, 1)).toBe(false);
    // A made-up third side stands in for the raiders: at war with everybody.
    expect(hostile(state, 0, 2)).toBe(true);
  });

  it('runs its term and lapses', () => {
    const state = board();
    // Somewhere to live, or both sides are eliminated on the first end of turn.
    foundCity(state, spawnUnit(state, 0, 'peon', 4, 4));
    foundCity(state, spawnUnit(state, 1, 'peasant', 25, 15));
    signPeace(state, { from: 0, to: 1, gold: 0 });
    expect(peaceLeft(state)).toBe(PEACE.term);
    for (let i = 0; i < PEACE.term * state.players.length + 2; i++) endPlayerTurn(state);
    expect(atPeace(state, 0, 1)).toBe(false);
    expect(state.log.some((l) => l.text.includes('lapsed'))).toBe(true);
  });

  it('renews for a full term from now, keeping when it began', () => {
    const state = board();
    signPeace(state, { from: 0, to: 1, gold: 0 });
    state.turn += 15;
    signPeace(state, { from: 1, to: 0, gold: 0 });
    expect(state.diplomacy?.peace?.since).toBe(50);
    expect(peaceLeft(state)).toBe(PEACE.term);
  });

  it('moves the gold, in either direction, and not beyond what somebody has', () => {
    const state = board();
    state.players[0].gold = 60;
    state.players[1].gold = 10;
    expect(signPeace(state, { from: 0, to: 1, gold: 50 })).toBe(true);
    expect([state.players[0].gold, state.players[1].gold]).toEqual([10, 60]);
    delete state.diplomacy!.peace;
    // Demanding more than they hold is not a deal that can be signed.
    expect(signPeace(state, { from: 1, to: 0, gold: -40 })).toBe(false);
  });
});

describe('breaking one', () => {
  it('ends it at once, shames the breaker, and is remembered', () => {
    const state = board();
    const town = foundCity(state, spawnUnit(state, 0, 'peon', 5, 5))!;
    town.size = 3;
    const patient = contentLimit(state, town);
    signPeace(state, { from: 0, to: 1, gold: 0 });
    expect(breakPeace(state, 0)).toBe(true);
    expect(atPeace(state, 0, 1)).toBe(false);
    expect(ashamed(state, 0)).toBe(true);
    expect(ashamed(state, 1)).toBe(false);
    expect(betrayals(state, 0)).toBe(1);
    expect(contentLimit(state, town)).toBe(patient - PEACE.shameContent);
    state.turn += PEACE.shameTurns;
    expect(contentLimit(state, town)).toBe(patient);
  });

  it('makes the next offer harder to land', () => {
    const state = board();
    state.players[1].controller = 'ai';
    const before = aiAccepts(state, { from: 0, to: 1, gold: 30 });
    state.diplomacy = { distrust: { 0: 3 } };
    const after = aiAccepts(state, { from: 0, to: 1, gold: 30 });
    // Distrust can only ever turn a yes into a no, never the reverse.
    expect(before || !after).toBe(true);
    expect(after).toBe(false);
  });
});

describe('the AI at the table', () => {
  it('does not ask for peace before there has been a war', () => {
    const state = board();
    for (const p of state.players) p.controller = 'ai';
    // A Horde vastly outnumbered, which would want peace badly -- if there were a war.
    for (let i = 0; i < 8; i++) spawnUnit(state, 1, 'knight', 20 + (i % 4), 5 + Math.floor(i / 4));
    spawnUnit(state, 0, 'goblin', 3, 3);
    aiDiplomacy(state, 0);
    expect(atPeace(state, 0, 1)).toBe(false);
    // Once they have fought, it asks, and the stronger side answers.
    noteClash(state, 0, 1);
    expect(atWarLately(state)).toBe(true);
    aiDiplomacy(state, 0);
    expect(state.diplomacy?.lastOffer?.[0]).toBe(state.turn);
  });

  it('puts its offer to a human rather than answering for them', () => {
    const state = board();
    state.players[0].controller = 'human';
    state.players[1].controller = 'ai';
    for (let i = 0; i < 8; i++) spawnUnit(state, 0, 'ogre', 3 + (i % 4), 3 + Math.floor(i / 4));
    spawnUnit(state, 1, 'peasant', 25, 15);
    noteClash(state, 0, 1);
    aiDiplomacy(state, 1);
    expect(state.diplomacy?.pending?.from).toBe(1);
    expect(atPeace(state, 0, 1)).toBe(false);
  });

  it('keeps it all through a save', () => {
    const state = board();
    signPeace(state, { from: 0, to: 1, gold: 0 });
    breakPeace(state, 1);
    const loaded = deserialize(serialize(state));
    expect(loaded.diplomacy).toEqual(state.diplomacy);
  });
});
