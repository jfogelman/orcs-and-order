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
  peaceSince,
  pairKey,
  migrateRelations,
  lapsePeace,
  standing,
  adjustStanding,
  moodName,
  STANDING,
  noteFight,
  noteCityTaken,
  forgetSlowly,
  talksWith,
} from '../src/sim/diplomacy';
import { DIPLOMACY_AI, HIVE_TABLE, aiAccepts, aiDiplomacy, wantPeace } from '../src/ai/diplomacy';
import { deserialize, serialize } from '../src/persist/save';
import type { GameState } from '../src/model/types';
import { FACTIONS } from '../src/model/factions';

function board(): GameState {
  const state = createGame({ seed: 12, width: 30, height: 20 });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.turn = 50;
  for (const p of state.players) p.visible.fill(1);
  return state;
}

/** A third side on the board, which since slice 3b also comes to the table. */
function withHive(state: GameState): number {
  const id = state.players.length;
  state.players.push({
    ...state.players[1],
    id,
    faction: 'hivekin',
    name: FACTIONS.hivekin.civName,
    leader: FACTIONS.hivekin.leader,
    alive: true,
    techs: ['first-hivekin'],
    explored: new Array(state.width * state.height).fill(1),
    visible: new Array(state.width * state.height).fill(1),
  });
  return id;
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
    expect(peaceLeft(state, 0, 1)).toBe(PEACE.term);
    for (let i = 0; i < PEACE.term * state.players.length + 2; i++) endPlayerTurn(state);
    expect(atPeace(state, 0, 1)).toBe(false);
    expect(state.log.some((l) => l.text.includes('lapsed'))).toBe(true);
  });

  it('renews for a full term from now, keeping when it began', () => {
    const state = board();
    signPeace(state, { from: 0, to: 1, gold: 0 });
    state.turn += 15;
    signPeace(state, { from: 1, to: 0, gold: 0 });
    expect(peaceSince(state, 0, 1), 'when it began is kept').toBe(50);
    expect(peaceLeft(state, 0, 1)).toBe(PEACE.term);
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
    expect(atWarLately(state, 0, 1)).toBe(true);
    aiDiplomacy(state, 0);
    // Keyed by the pair since slice 3b, not by the side doing the asking: with
    // two sides to ask, one cooldown per player meant opening talks with one
    // of them silenced this AI toward the other for a dozen turns.
    expect(state.diplomacy?.lastOffer?.[pairKey(0, 1)]).toBe(state.turn);
  });

  it('asks each side it can sign with, rather than whichever one came first', () => {
    const state = board();
    for (const p of state.players) p.controller = 'ai';
    const hive = withHive(state);
    // Outnumbered by both, and freshly at war with both.
    spawnUnit(state, 0, 'goblin', 3, 3);
    for (let i = 0; i < 6; i++) spawnUnit(state, 1, 'knight', 20 + (i % 3), 5);
    for (let i = 0; i < 6; i++) spawnUnit(state, hive, 'soldier', 20 + (i % 3), 15);
    noteClash(state, 0, 1);
    noteClash(state, 0, hive);

    aiDiplomacy(state, 0);
    // Both, in one morning. `rival()` returned a single side until slice 3b,
    // so the one it did not pick was never spoken to at all.
    expect(state.diplomacy?.lastOffer?.[pairKey(0, 1)]).toBe(state.turn);
    expect(state.diplomacy?.lastOffer?.[pairKey(0, hive)]).toBe(state.turn);
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

/**
 * Section 135, slice 1: one record per pair of sides.
 *
 * `state.diplomacy.peace` was one flag for the whole game. That was a fair
 * simplification with two empires and section 125 caught it being a lie the
 * moment a third side arrived -- `empires()` carries the note. Nothing here
 * changes what the game *does*; it changes where the answer is kept, and these
 * tests exist to say that the two are not the same thing.
 */
describe('relations, one record per pair', () => {
  function threeSided(): GameState {
    const state = board();
    // A third side that talks, so there are two pairs to tell apart.
    state.players.push({
      ...state.players[1],
      id: 2,
      faction: 'orc',
      name: 'The Other Horde',
      alive: true,
    });
    return state;
  }

  it('spells a pair one way round only', () => {
    expect(pairKey(2, 0)).toBe(pairKey(0, 2));
    expect(pairKey(0, 2)).toBe('0:2');
  });

  it('keeps one pair out of another pair’s treaty', () => {
    const state = threeSided();
    signPeace(state, { from: 0, to: 1, gold: 0 });

    expect(atPeace(state, 0, 1), 'the pair that signed').toBe(true);
    expect(atPeace(state, 0, 2), 'a pair that did not').toBe(false);
    expect(atPeace(state, 1, 2), 'nor this one').toBe(false);
    // The whole point: the third side is still fair game to both signatories.
    expect(hostile(state, 0, 2) && hostile(state, 1, 2)).toBe(true);
  });

  it('tears up only the treaty it was told to', () => {
    const state = threeSided();
    signPeace(state, { from: 0, to: 1, gold: 0 });
    signPeace(state, { from: 0, to: 2, gold: 0 });

    expect(breakPeace(state, 0, 2)).toBe(true);

    expect(atPeace(state, 0, 2), 'the one broken').toBe(false);
    expect(atPeace(state, 0, 1), 'the one left alone').toBe(true);
  });

  it('remembers a fight between the two who had it, and nobody else', () => {
    const state = threeSided();
    noteClash(state, 0, 2);
    expect(atWarLately(state, 0, 2)).toBe(true);
    expect(atWarLately(state, 0, 1), 'not our quarrel').toBe(false);
  });

  it('lapses one treaty without touching another', () => {
    const state = threeSided();
    signPeace(state, { from: 0, to: 1, gold: 0 });
    state.turn += 5;
    signPeace(state, { from: 0, to: 2, gold: 0 });

    state.turn += PEACE.term - 4;   // the first has run out, the second has not
    lapsePeace(state);

    expect(atPeace(state, 0, 1), 'the older one lapsed').toBe(false);
    expect(atPeace(state, 0, 2), 'the newer one holds').toBe(true);
  });

  it('carries an old save mid-treaty onto the pair it was between', () => {
    const state = threeSided();
    // A save from before pairs existed: one peace, no pairs at all.
    state.diplomacy = { peace: { since: state.turn, until: state.turn + 10 }, lastClash: state.turn };

    migrateRelations(state);

    expect(atPeace(state, 0, 1), 'still mid-treaty').toBe(true);
    expect(atWarLately(state, 0, 1), 'and still remembers the war').toBe(true);
    expect(state.diplomacy?.peace, 'the old field is emptied').toBeUndefined();
  });
});

/**
 * Section 135, slice 2: the number, and the seven names for it.
 *
 * A window onto slice 1 rather than a rule: the standing accrues and is shown,
 * and nothing in the game reads it yet. That is deliberate -- a slice that
 * changes no behaviour can be measured by finding no difference, which is the
 * only way to tell a rewrite that kept its promises from one that did not.
 */
describe('where two sides stand', () => {
  it('starts at nothing and stays on the scale', () => {
    const state = board();
    expect(standing(state, 0, 1), 'nothing either way').toBe(0);

    adjustStanding(state, 0, 1, -1000);
    expect(standing(state, 0, 1), 'floored').toBe(STANDING.worst);
    adjustStanding(state, 0, 1, 1000);
    expect(standing(state, 0, 1), 'and capped').toBe(STANDING.best);
  });

  it('reads the same from either side, because it is one relationship', () => {
    const state = board();
    adjustStanding(state, 1, 0, -20);
    expect(standing(state, 0, 1)).toBe(standing(state, 1, 0));
  });

  it('names every rung of the ladder', () => {
    const state = board();
    const at = (n: number) => {
      state.diplomacy = { pairs: { [pairKey(0, 1)]: { standing: n } } };
      return moodName(state, 0, 1);
    };
    expect(at(-50)).toBe('Angered');
    expect(at(-29)).toBe('Tense');
    expect(at(-14)).toBe('Concerned');
    expect(at(0)).toBe('Uneasy');
    expect(at(10)).toBe('Peace');
    expect(at(50)).toBe('Joyful');
  });

  it('calls it War while they are shooting, whatever they otherwise think', () => {
    const state = board();
    adjustStanding(state, 0, 1, 40);
    expect(moodName(state, 0, 1), 'friendly, until').toBe('Joyful');

    noteClash(state, 0, 1);

    expect(moodName(state, 0, 1), 'they started shooting').toBe('War');
    // And a treaty puts the word back, because that is what a treaty is for.
    signPeace(state, { from: 0, to: 1, gold: 0 });
    expect(moodName(state, 0, 1)).not.toBe('War');
  });

  it('sours when a city is taken, and barely when the Hive loses a unit', () => {
    const state = board();
    state.players[1].faction = 'hivekin';
    const before = standing(state, 0, 1);

    noteFight(state, 0, 1, 1);
    const afterHiveLoss = standing(state, 0, 1);
    expect(before - afterHiveLoss, 'the Hive does not take it personally')
      .toBeLessThan(Math.abs(STANDING.fight));

    noteCityTaken(state, 0, 1);
    expect(standing(state, 0, 1), 'a Hive is another matter')
      .toBe(afterHiveLoss + STANDING.hiveTaken);
  });

  it('forgets a grudge slowly, and never invents a friendship', () => {
    const state = board();
    adjustStanding(state, 0, 1, -20);
    forgetSlowly(state);
    expect(standing(state, 0, 1)).toBe(-20 + STANDING.forgets);

    // All the way back, and no further.
    for (let n = 0; n < 100; n++) forgetSlowly(state);
    expect(standing(state, 0, 1), 'indifference, not affection').toBe(0);
  });

  it('leaves a pair under treaty alone, because time is not healing that', () => {
    const state = board();
    adjustStanding(state, 0, 1, -20);
    signPeace(state, { from: 0, to: 1, gold: 0 });
    const held = standing(state, 0, 1);
    forgetSlowly(state);
    expect(standing(state, 0, 1)).toBe(held);
  });
});

/**
 * Section 135 slice 3b. The Hive sits down, and wants different things.
 *
 * Jeremy: *"the Hive's standing means something to the hive mechanically, in
 * that survival trumps all else, and expansion means survival too."* So these
 * pin the shape of the sum rather than its numbers -- the weights will move
 * when somebody measures them, and none of the assertions below should have to
 * move with them.
 */
describe('the Hive at the table (section 135)', () => {
  /** A Hive and an empire with nothing between them but armies. */
  function table(ours: number, theirs: number) {
    const state = board();
    const hive = withHive(state);
    state.players[hive].faction = 'hivekin';
    // Enough Hives that it is not short of ground, so `cramped` is out of the
    // way and these measure the thing they say they measure.
    for (let i = 0; i < 6; i++) foundCity(state, spawnUnit(state, hive, 'grub', 2 + i * 3, 2));
    foundCity(state, spawnUnit(state, 1, 'peasant', 2, 18));
    for (let i = 0; i < ours; i++) spawnUnit(state, hive, 'soldier', 20 + (i % 5), 8);
    for (let i = 0; i < theirs; i++) spawnUnit(state, 1, 'knight', 20 + (i % 5), 12);
    return { state, hive };
  }

  it('signs things at all, which it could not before', () => {
    const state = board();
    const hive = withHive(state);
    expect(talksWith(state, 0)).toContain(hive);
    expect(signPeace(state, { from: 0, to: hive, gold: 0 })).toBe(true);
    expect(atPeace(state, 0, hive)).toBe(true);
    expect(hostile(state, 0, hive)).toBe(false);
    // And still not on anybody else's behalf, which is slice 1's guarantee
    // now doing real work rather than being protected by `talks()`.
    expect(atPeace(state, 1, hive)).toBe(false);
  });

  it('takes almost anything when it would not survive the war', () => {
    const { state, hive } = table(1, 12);
    const want = wantPeace(state, state.players[hive], state.players[1]);
    expect(want).toBeGreaterThan(DIPLOMACY_AI.asks);
    // Harder than an empire in the same position: *"they won't attack if they
    // know they will be destroyed as that counters survival."*
    const theirs = wantPeace(state, state.players[1], state.players[hive]);
    expect(want).toBeGreaterThan(Math.abs(theirs));
  });

  it('is only mildly interested in a war it is winning', () => {
    const { state, hive } = table(12, 1);
    const want = wantPeace(state, state.players[hive], state.players[1]);
    expect(want).toBeLessThan(0);
    // Survival is not appetite. An empire this far ahead is far keener to
    // press on than the Hive is.
    const theirs = wantPeace(state, state.players[1], state.players[hive]);
    expect(want).toBeGreaterThan(Math.min(theirs, -HIVE_TABLE.sated - 0.0001));
    expect(want).toBeGreaterThanOrEqual(-HIVE_TABLE.sated);
  });

  it('does not hold a broken promise against anybody', () => {
    const { state, hive } = table(6, 6);
    const before = wantPeace(state, state.players[hive], state.players[1]);
    (state.diplomacy ??= {}).distrust = { 1: 3 };
    expect(betrayals(state, 1)).toBe(3);
    // An empire would knock the offer down for this. The Hive gains nothing by
    // remembering it: a side that reneged last century is exactly as strong as
    // it is now, and strength is the question.
    expect(wantPeace(state, state.players[hive], state.players[1])).toBe(before);
  });

  it('wants ground while it is short of Hives', () => {
    const { state, hive } = table(6, 6);
    const roomy = wantPeace(state, state.players[hive], state.players[1]);
    // Take all but one away: now it needs somewhere to grow, and ground is
    // what somebody else is standing on.
    const keep = state.cities.find((c) => c.owner === hive)!;
    state.cities = state.cities.filter((c) => c.owner !== hive || c === keep);
    expect(wantPeace(state, state.players[hive], state.players[1])).toBeLessThan(roomy);
  });
});
