import { describe, expect, it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { beginPlayerTurn, idleUnits, prideDue } from '../src/sim/turn';
import { chooseFocus } from '../src/ui/watch';
import { SIGHTING, reportSightings } from '../src/sim/barbarians';
import { contentLimit, inSupply } from '../src/sim/city';
import { PALACE_COMPLETE_CONTENT, PALACE_MODULES, PALACE_TIERS, palaceComplete, takePride } from '../src/model/palace';
import { OMNISCIENCE, knowsEverything } from '../src/sim/research';
import { techsForFaction } from '../src/model/techs';
import { attackStrength } from '../src/sim/combat';
import { assignWorkers } from '../src/sim/city';
import { barbarianOf, createGame, spawnUnit } from '../src/sim/gamestate';
import { unitType } from '../src/model/units';

/**
 * Section 124: notes off a played-out game (Jeremy, 2026-09-28).
 *
 * A game won on the Portal, with diplomacy, and a list of things that were
 * wrong or missing on the way. These are the ones with a right answer.
 */

function board(over: { barbarians?: boolean } = {}): GameState {
  const state = createGame({
    seed: 20260928,
    width: 30,
    height: 20,
    barbarians: over.barbarians ?? false,
  });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
  }
  const city: City = {
    id: 1, owner: 0, name: 'Home', x: 5, y: 10, size: 4, food: 0, shields: 0,
    buildings: [], producing: { kind: 'coin' }, workedTiles: [], disorder: false,
    foundedTurn: 1, foundedBy: 0,
  };
  state.cities.push(city);
  assignWorkers(state, city);
  state.log.length = 0;
  return state;
}

describe('skipping a unit', () => {
  it('leaves it its movement, so it can be picked up again', () => {
    const state = board();
    const orc = spawnUnit(state, 0, 'orc', 8, 10, false);
    const was = orc.moves;

    // What the panel's Skip does.
    orc.order = 'skip';

    expect(orc.moves).toBe(was);
    // Out of the cycle, because that is what the order is for...
    expect(idleUnits(state, 0).map((u) => u.id)).not.toContain(orc.id);
    // ...but still able to act when you come back to it by hand.
    expect(orc.moves).toBeGreaterThan(0);
  });
});

describe('the supply line', () => {
  it('is the capital and its depots, not any city at all', () => {
    const state = board();
    // A second town, far from the capital, with nothing that supplies an army.
    const far: City = {
      id: 2, owner: 0, name: 'Far', x: 25, y: 10, size: 4, food: 0, shields: 0,
      buildings: [], producing: { kind: 'coin' }, workedTiles: [], disorder: false,
      foundedTurn: 2, foundedBy: 0,
    };
    state.cities.push(far);
    assignWorkers(state, far);

    // Standing in the gate of that town, and still out of supply -- which is
    // the rule working, and exactly why the message must not say "any city".
    const knight = spawnUnit(state, 0, 'deathknight', far.x, far.y, false);
    expect(inSupply(state, knight)).toBe(false);

    // Beside the capital, in supply.
    const home = spawnUnit(state, 0, 'deathknight', 6, 10, false);
    expect(inSupply(state, home)).toBe(true);
  });
});

describe('the capital growing', () => {
  it('offers one piece a turn, however good the turn was', () => {
    const state = board();
    const player = state.players[0];
    // Rich enough to be owed several at once.
    player.prideTaken = 0;
    for (let n = 0; n < 12; n++) {
      state.cities.push({
        id: 10 + n, owner: 0, name: `Town ${n}`, x: 2 + n, y: 3, size: 6, food: 0, shields: 0,
        buildings: [], producing: { kind: 'coin' }, workedTiles: [], disorder: false,
        foundedTurn: 1, foundedBy: 0,
      });
    }
    for (const c of state.cities) assignWorkers(state, c);

    const owed = prideDue(state, 0);
    // Taking one marks the turn, whatever the score says next.
    player.prideTurn = state.turn;
    expect(prideDue(state, 0)).toBe(false);
    // And tomorrow the council is available again.
    state.turn += 1;
    expect(prideDue(state, 0)).toBe(owed);
  });
});

describe('fortify until healed', () => {
  it('gets up the morning it is whole, and not before', () => {
    const state = board();
    const orc = spawnUnit(state, 0, 'orc', 5, 10, false);
    orc.hp = 4;
    orc.order = 'fortified';
    orc.mending = true;

    beginPlayerTurn(state, 0);
    // Healing, but not yet whole: still dug in and still out of the cycle.
    expect(orc.hp).toBeGreaterThan(4);
    if (orc.hp < unitType(orc.type).hp) {
      expect(orc.mending).toBe(true);
      expect(orc.order).toBe('fortified');
    }

    orc.hp = unitType(orc.type).hp;
    beginPlayerTurn(state, 0);

    expect(orc.mending).toBeUndefined();
    expect(orc.order).toBe('none');
    expect(idleUnits(state, 0).map((u) => u.id)).toContain(orc.id);
    expect(state.log.some((e) => /patched up/i.test(e.text))).toBe(true);
  });
});

describe('a raider coming into view', () => {
  it('is news the camera is willing to turn for', () => {
    const state = board({ barbarians: true });
    const wild = barbarianOf(state)!;
    spawnUnit(state, 0, 'orc', 10, 10, false);
    const raider = spawnUnit(state, wild.id, 'skirmisher', 12, 10, false);

    reportSightings(state, 0);

    const sighting = state.log.find((e) => e.subject === SIGHTING);
    expect(sighting, 'a sighting was logged').toBeDefined();
    expect(sighting!.at).toEqual([raider.x, raider.y]);

    // The camera agrees to look, provided the tile is visible and off screen.
    const look = chooseFocus(
      state,
      0,
      state.log,
      () => true,
      () => false,
    );
    expect(look).toEqual([raider.x, raider.y]);
  });

  it('says nothing the second time, which is why the screen sits still', () => {
    const state = board({ barbarians: true });
    const wild = barbarianOf(state)!;
    spawnUnit(state, 0, 'orc', 10, 10, false);
    spawnUnit(state, wild.id, 'skirmisher', 12, 10, false);

    reportSightings(state, 0);
    state.log.length = 0;
    reportSightings(state, 0);

    expect(state.log.filter((e) => e.subject === SIGHTING)).toHaveLength(0);
  });
});

describe('a city minding itself', () => {
  /** A town of ours, big enough to be unhappy about it. */
  function town(state: GameState): City {
    const city = state.cities[0];
    city.size = 9;
    assignWorkers(state, city);
    return city;
  }

  it('turns to calm while it riots, and goes back to work after', () => {
    const state = board();
    const city = town(state);
    city.autoCalm = true;
    city.producing = { kind: 'building', id: 'granary' };
    city.disorder = true;

    beginPlayerTurn(state, 0);
    expect(city.producing.kind).toBe('calm');

    // The shouting stops, and it picks up exactly what it put down.
    city.disorder = false;
    beginPlayerTurn(state, 0);
    expect(city.producing).toEqual({ kind: 'building', id: 'granary' });
  });

  it('does none of that unless it was asked to', () => {
    const state = board();
    const city = town(state);
    city.producing = { kind: 'building', id: 'granary' };
    city.disorder = true;

    beginPlayerTurn(state, 0);

    expect(city.producing).toEqual({ kind: 'building', id: 'granary' });
  });

  it('studies rather than banking coin, when told to', () => {
    const state = board();
    const city = town(state);
    city.autoBuild = 'beakers';
    city.producing = { kind: 'coin' };

    beginPlayerTurn(state, 0);

    expect(city.producing.kind).toBe('beakers');
  });
});

describe('the lap of honour', () => {
  it('pays a content citizen for a palace finished to its last tier', () => {
    const state = board();
    const city = state.cities[0];
    const player = state.players[0];
    const before = contentLimit(state, city);

    for (const module of PALACE_MODULES) {
      for (let tier = 0; tier < PALACE_TIERS; tier++) takePride(player, module.id);
    }

    expect(palaceComplete(player)).toBe(true);
    expect(contentLimit(state, city)).toBe(before + PALACE_COMPLETE_CONTENT);
  });

  it('pays another, and a harder swing, for knowing everything', () => {
    const state = board();
    const city = state.cities[0];
    const player = state.players[0];
    const calmBefore = contentLimit(state, city);
    const orc = spawnUnit(state, 0, 'orc', 8, 10, false);
    const foe = spawnUnit(state, 1, 'footman', 9, 10, false);

    const all = techsForFaction(player.faction).map((t) => t.id);
    // One short of everything, and short of something that changes nothing on
    // its own: learning the *whole* tree also learns Happiness, which is worth
    // a content citizen by itself, so comparing against an empty tree would be
    // measuring two bonuses and calling it one.
    const harmless = all.find((id) => id !== 'happiness')!;
    player.techs = all.filter((id) => id !== harmless);
    expect(knowsEverything(player)).toBe(false);
    const oneShort = contentLimit(state, city);
    // The same trick for the swing: a full tree also carries the berserk flag,
    // which multiplies attacks by a quarter all by itself.
    const swingOneShort = attackStrength(state, orc, foe).total;

    player.techs = all;

    expect(knowsEverything(player)).toBe(true);
    expect(contentLimit(state, city)).toBe(oneShort + OMNISCIENCE.content);
    expect(attackStrength(state, orc, foe).total).toBeCloseTo(
      swingOneShort * (1 + OMNISCIENCE.attack),
      5,
    );
    void calmBefore;
  });

  it('pays nobody who has not finished', () => {
    const state = board();
    const player = state.players[0];
    takePride(player, PALACE_MODULES[0].id);
    expect(palaceComplete(player)).toBe(false);
    expect(knowsEverything(player)).toBe(false);
  });
});
