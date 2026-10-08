import { describe, expect, it } from 'vitest';
import { createGame, recomputeVisibility, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { tryStep } from '../src/sim/movement';
import { idx } from '../src/engine/grid';
import {
  CONTACT,
  OPENINGS,
  checkContacts,
  haveMet,
  metOn,
  metSides,
  noteMeeting,
  openingBy,
  openingFor,
  pairOpening,
  startingStanding,
} from '../src/sim/contact';
import { STANDING, atWarLately, moodName, standing } from '../src/sim/diplomacy';
import { deserialize, serialize } from '../src/persist/save';
import type { GameState } from '../src/model/types';

/**
 * Section 135 slice 3. Two sides meeting, which is the first thing this game
 * has ever been able to tell apart from two sides being at war.
 *
 * `board()` deliberately leaves the fog *on*, unlike the peace tests': a
 * meeting is a fact about what can be seen, so a board where everybody can
 * already see everything has nothing left to test.
 */
function board(): GameState {
  const state = createGame({ seed: 12, width: 40, height: 24 });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.turn = 50;
  for (const p of state.players) {
    p.visible.fill(0);
    p.explored.fill(0);
  }
  return state;
}

/** Both sides' sight lines brought up to date, the way a turn does it. */
function look(state: GameState): void {
  for (const p of state.players) recomputeVisibility(state, p.id);
}

describe('meeting somebody (section 135)', () => {
  it('does not count two sides who have never seen each other', () => {
    const state = board();
    spawnUnit(state, 0, 'orc', 2, 2);
    spawnUnit(state, 1, 'footman', 37, 21);
    look(state);
    checkContacts(state, 0);
    checkContacts(state, 1);
    expect(haveMet(state, 0, 1)).toBe(false);
    expect(metSides(state, 0)).toEqual([]);
  });

  it('counts them the moment one can see the other, and counts it for both', () => {
    const state = board();
    spawnUnit(state, 0, 'orc', 10, 10);
    spawnUnit(state, 1, 'footman', 11, 10);
    look(state);
    checkContacts(state, 0);
    expect(haveMet(state, 0, 1)).toBe(true);
    // One record per pair, so asking the other way round is the same question.
    expect(haveMet(state, 1, 0)).toBe(true);
    expect(metOn(state, 0, 1)).toBe(50);
    expect(metSides(state, 1)).toEqual([0]);
  });

  it('happens on the move that causes it, not a turn later', () => {
    const state = board();
    const ours = spawnUnit(state, 0, 'orc', 8, 10);
    spawnUnit(state, 1, 'footman', 10, 10);
    look(state);
    // Sight one: two tiles apart is two tiles too many.
    expect(haveMet(state, 0, 1)).toBe(false);
    // One step, and now they are standing next to each other.
    tryStep(state, ours, 9, 10);
    expect(haveMet(state, 0, 1)).toBe(true);
  });

  it('only happens once, however many times it is asked', () => {
    const state = board();
    spawnUnit(state, 0, 'orc', 10, 10);
    spawnUnit(state, 1, 'footman', 11, 10);
    look(state);
    checkContacts(state, 0);
    const first = standing(state, 0, 1);
    state.turn = 90;
    checkContacts(state, 0);
    checkContacts(state, 1);
    expect(noteMeeting(state, 0, 1)).toBe(false);
    expect(metOn(state, 0, 1)).toBe(50);
    expect(standing(state, 0, 1)).toBe(first);
  });

  it('is never had with the wilds', () => {
    const state = board();
    const wild = { ...state.players[1], id: 2, barbarian: true, faction: 'orc' as const };
    state.players.push(wild);
    spawnUnit(state, 0, 'orc', 10, 10);
    spawnUnit(state, 2, 'orc', 11, 10);
    look(state);
    checkContacts(state, 0);
    expect(haveMet(state, 0, 2)).toBe(false);
  });

  it('reveals the other side’s nearest town, both ways', () => {
    const state = board();
    const ours = foundCity(state, spawnUnit(state, 0, 'peon', 5, 5))!;
    const theirs = foundCity(state, spawnUnit(state, 1, 'peasant', 30, 18))!;
    // Two scouts who meet in the middle, nowhere near either town.
    spawnUnit(state, 0, 'orc', 18, 11);
    spawnUnit(state, 1, 'footman', 19, 11);
    look(state);
    const theirTown = idx(theirs.x, theirs.y, state.width);
    const ourTown = idx(ours.x, ours.y, state.width);
    expect(state.players[0].explored[theirTown]).toBeFalsy();
    expect(state.players[1].explored[ourTown]).toBeFalsy();

    checkContacts(state, 0);

    // The half that moves the game: `nearestEnemyTarget` will not consider a
    // tile the AI has not explored, so this is what gives a war somewhere to go.
    expect(state.players[0].explored[theirTown]).toBe(1);
    // And the half that keeps it fair -- the side that was found out learns
    // just as much as the side that did the finding.
    expect(state.players[1].explored[ourTown]).toBe(1);
    // Map memory, not live sight: you know where the place is, not what is
    // standing in it this morning.
    expect(state.players[0].visible[theirTown]).toBeFalsy();
  });

  it('survives a save and a load', () => {
    const state = board();
    spawnUnit(state, 0, 'orc', 10, 10);
    spawnUnit(state, 1, 'footman', 11, 10);
    look(state);
    checkContacts(state, 0);
    const back = deserialize(serialize(state));
    expect(haveMet(back, 0, 1)).toBe(true);
    expect(metOn(back, 0, 1)).toBe(50);
    expect(openingBy(back, 0, 1, 1)).toBe(openingBy(state, 0, 1, 1));
  });

  it('records nothing at all with the lever off', () => {
    const state = board();
    foundCity(state, spawnUnit(state, 1, 'peasant', 30, 18));
    spawnUnit(state, 0, 'orc', 10, 10);
    spawnUnit(state, 1, 'footman', 11, 10);
    look(state);
    const explored = [...state.players[0].explored];
    CONTACT.enabled = false;
    try {
      checkContacts(state, 0);
      expect(haveMet(state, 0, 1)).toBe(false);
      expect(standing(state, 0, 1)).toBe(0);
      expect([...state.players[0].explored]).toEqual(explored);
    } finally {
      CONTACT.enabled = true;
    }
  });
});

describe('where a pair starts (section 135)', () => {
  it('starts at nothing for two sides meeting in an empty corner', () => {
    const state = board();
    expect(startingStanding(state, 0, 1)).toBe(0);
  });

  it('starts worse when the two are already in each other’s way', () => {
    const state = board();
    foundCity(state, spawnUnit(state, 0, 'peon', 10, 10));
    foundCity(state, spawnUnit(state, 1, 'peasant', 14, 10));
    expect(startingStanding(state, 0, 1)).toBe(CONTACT.crowdedCost);
  });

  it('starts worse when somebody is visibly racing to end the game', () => {
    const state = board();
    state.players[1].endingBegunAt = 40;
    expect(startingStanding(state, 0, 1)).toBe(CONTACT.endingCost);
  });

  it('starts worse against the Hive, because a hole in the ground is not an overture', () => {
    const state = board();
    const even = startingStanding(state, 0, 1);
    state.players[1].faction = 'hivekin';
    expect(startingStanding(state, 0, 1)).toBe(even + CONTACT.alienCost);
  });

  it('never goes off the scale, however many reasons pile up', () => {
    const state = board();
    state.players[1].faction = 'hivekin';
    state.players[1].endingBegunAt = 40;
    foundCity(state, spawnUnit(state, 0, 'peon', 10, 10));
    foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10));
    foundCity(state, spawnUnit(state, 1, 'peasant', 16, 10));
    const n = startingStanding(state, 0, 1);
    expect(n).toBeGreaterThanOrEqual(STANDING.worst);
    expect(n).toBeLessThan(0);
  });
});

describe('what they open with (section 135)', () => {
  it('greets, from an empty board', () => {
    const state = board();
    expect(openingFor(state, 1, 0)).toBe('greeting');
  });

  it('has the Horde open harder than the Kingdom on the same board', () => {
    const state = board();
    foundCity(state, spawnUnit(state, 0, 'peon', 10, 10));
    foundCity(state, spawnUnit(state, 1, 'peasant', 14, 10));
    state.players[1].endingBegunAt = 40;
    const kingdom = openingFor(state, 1, 0);
    const horde = openingFor(state, 0, 1);
    expect(OPENINGS[horde]).toBeLessThan(OPENINGS[kingdom]);
  });

  it('has the Hive make a statement rather than hold a position', () => {
    const state = board();
    state.players[1].faction = 'hivekin';
    expect(openingFor(state, 1, 0)).toBe('statement');
  });

  it('puts the pair at War from the word, when the word is a declaration', () => {
    const state = board();
    // Crowded, racing, and the Horde's lean on top of it: the hard end.
    foundCity(state, spawnUnit(state, 0, 'peon', 10, 10));
    foundCity(state, spawnUnit(state, 1, 'peasant', 13, 10));
    foundCity(state, spawnUnit(state, 1, 'peasant', 16, 10));
    state.players[1].endingBegunAt = 40;
    state.players[0].controller = 'ai';
    expect(openingFor(state, 0, 1)).toBe('declaration');

    noteMeeting(state, 0, 1);
    expect(openingBy(state, 0, 1, 0)).toBe('declaration');
    expect(pairOpening(state, 0, 1)).toBe('declaration');
    // Announced rather than assumed, which is the whole point: the pair is at
    // war from the sentence rather than from the first casualty.
    expect(atWarLately(state, 0, 1)).toBe(true);
    expect(moodName(state, 0, 1)).toBe('War');
  });

  it('has a human side say nothing, having nobody to say it with', () => {
    const state = board();
    expect(state.players[0].controller).toBe('human');
    noteMeeting(state, 0, 1);
    // The Kingdom spoke; the player did not, so the Kingdom's is the only
    // opening on the record.
    expect(openingBy(state, 0, 1, 1)).toBe('greeting');
    expect(openingBy(state, 0, 1, 0)).toBeUndefined();
    const theirs = state.log.filter((e) => e.actor === 1 && e.subject === 'first-contact');
    const ours = state.log.filter((e) => e.actor === 0 && e.subject === 'first-contact');
    expect(theirs.length).toBeGreaterThan(0);
    expect(ours).toHaveLength(0);
  });

  it('moves the number by the board first and the words second', () => {
    const state = board();
    foundCity(state, spawnUnit(state, 0, 'peon', 10, 10));
    foundCity(state, spawnUnit(state, 1, 'peasant', 14, 10));
    const start = startingStanding(state, 0, 1);
    noteMeeting(state, 0, 1);
    // Only the Kingdom spoke, so the sum is exactly the board plus one opening.
    expect(standing(state, 0, 1)).toBe(start + OPENINGS[openingBy(state, 0, 1, 1)!]);
  });

  it('tells both sides what each of them said', () => {
    const state = board();
    state.players[0].controller = 'ai';
    noteMeeting(state, 0, 1);
    for (const id of [0, 1]) {
      const heard = state.log.filter((e) => e.player === id && e.subject === 'first-contact');
      // The meeting itself, and one line from each of the two that spoke.
      expect(heard.length).toBe(3);
    }
  });
});
