import { describe, expect, it } from 'vitest';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { capitalOf, foundCity } from '../src/sim/city';
import {
  BRIBE,
  aiTownOffer,
  buyOdds,
  buyTown,
  canBuyTown,
  settling,
  townPrice,
} from '../src/sim/bribery';
import { SPY, SPY_TRACE } from '../src/sim/spying';
import { standing } from '../src/sim/diplomacy';
import { appearsTo } from '../src/sim/disguise';
import { deserialize, serialize } from '../src/persist/save';
import { TECHS } from '../src/model/techs';
import type { City, GameState, Unit } from '../src/model/types';

/**
 * Section 184: buying somebody else's town.
 *
 * Three things are worth testing hardest, because all three are easy to get
 * subtly wrong and each one is a ruling rather than a number:
 *
 * - **Nothing is sacked.** The whole design statement is that gold buys the
 *   place whole where an army only ever buys the ruins of one, so size and
 *   buildings must come through untouched.
 * - **The garrison is pushed out**, in the order Jeremy's ruling implies:
 *   their nearest other town, else out of the gate, else gone.
 * - **A capital is never for sale**, at any price, which is a refusal and not
 *   a multiplier.
 */
function board(): { state: GameState; spy: Unit; town: City; seat: City } {
  const state = createGame({ seed: 61, width: 40, height: 20, barbarians: false });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  state.ruins = [];
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.techs = TECHS.map((t) => t.id);
    p.gold = 5000;
  }
  // Their capital is the oldest town they founded, so it has to exist and be
  // somewhere else, or every test here would be testing the capital rule --
  // and they need a *second* town, or the last-town rule refuses as well.
  const seat = foundCity(state, spawnUnit(state, 1, 'peasant', 30, 10))!;
  const town = foundCity(state, spawnUnit(state, 1, 'peasant', 12, 10))!;
  // Big enough that the other side thinks it worth being named over, which is
  // a separate bar from anything the player faces.
  town.size = 4;
  // And we hold a town of our own, so a town we buy is not instantly *our*
  // capital -- which is what `capitalOf` would make it, and which would then
  // refuse every test about buying one back.
  foundCity(state, spawnUnit(state, 0, 'peon', 3, 10));
  state.units = state.units.filter((u) => u.type === 'skulker' || u.owner === 2);
  const spy = spawnUnit(state, 0, 'skulker', 11, 10);
  return { state, spy, town, seat };
}

/** Force the dice one way without touching the odds model. */
function rig(take: boolean, body: () => void): void {
  const { atAsking, best, worst } = BRIBE;
  BRIBE.atAsking = take ? 100 : 0;
  BRIBE.best = take ? 1 : 0;
  BRIBE.worst = take ? 1 : 0;
  try {
    body();
  } finally {
    BRIBE.atAsking = atAsking;
    BRIBE.best = best;
    BRIBE.worst = worst;
  }
}

describe('what a town is asking', () => {
  it('reads the size, the buildings, the bodies and the owner’s bank', () => {
    const { state, town } = board();
    const bare = townPrice(state, town);

    town.size += 2;
    const bigger = townPrice(state, town);
    expect(bigger - bare).toBe(2 * BRIBE.perSize);

    town.buildings.push('barracks');
    expect(townPrice(state, town) - bigger).toBe(BRIBE.perBuilding);

    // The anti-runaway term, and the reason this is not rush-buying: a rich
    // empire is dear to buy from.
    const withTheirPurse = townPrice(state, town);
    state.players[1].gold += 1000;
    expect(townPrice(state, town) - withTheirPurse).toBe(
      Math.round(1000 * BRIBE.ofTheirPurse),
    );
  });

  it('charges for every body billeted there, not just the fortified ones', () => {
    const { state, town } = board();
    const empty = townPrice(state, town);
    // Deliberately *not* fortified: `garrisonOf` would miss this one, and a
    // soldier standing in a town is a soldier who has to be turned out of it
    // whatever its orders say.
    const idle = spawnUnit(state, 1, 'footman', town.x, town.y);
    idle.order = 'none';
    expect(townPrice(state, town)).toBeGreaterThan(empty);
  });

  it('comes down when somebody has already been round making it unhappy', () => {
    const { state, town } = board();
    const full = townPrice(state, town);
    town.unrest = { until: state.turn + 4 };
    expect(townPrice(state, town)).toBe(Math.round(full * (1 - BRIBE.unrestCut)));

    // A riot does the same thing, and for the same reason: this is a town with
    // other things on its mind.
    delete town.unrest;
    town.disorder = true;
    expect(townPrice(state, town)).toBe(Math.round(full * (1 - BRIBE.unrestCut)));
  });

  it('pays at the asking price and is never certain either way', () => {
    const { state, spy, town } = board();
    const asking = townPrice(state, town);
    expect(buyOdds(state, spy, town, asking)).toBeCloseTo(BRIBE.atAsking, 5);
    expect(buyOdds(state, spy, town, asking * 100)).toBe(BRIBE.best);
    expect(buyOdds(state, spy, town, 0)).toBe(BRIBE.worst);
    expect(BRIBE.best).toBeLessThan(1);
  });
});

describe('who may be approached at all', () => {
  it('needs a spy, the advance, somebody else’s town and a short walk', () => {
    const { state, spy, town } = board();
    expect(canBuyTown(state, spy, town).ok).toBe(true);

    const soldier = spawnUnit(state, 0, 'goblin', 11, 10);
    expect(canBuyTown(state, soldier, town).ok).toBe(false);

    state.players[0].techs = [];
    expect(canBuyTown(state, spy, town).ok).toBe(false);
    state.players[0].techs = TECHS.map((t) => t.id);

    spy.x = 1;
    expect(canBuyTown(state, spy, town).reason).toMatch(/Too far/);
    spy.x = 11;

    spy.moves = 0;
    expect(canBuyTown(state, spy, town).ok).toBe(false);
  });

  it('never sells a capital, at any price', () => {
    const { state, spy, seat } = board();
    expect(capitalOf(state, 1)?.id).toBe(seat.id);
    // Standing right beside it, with five thousand in the bank.
    spy.x = seat.x - 1;
    spy.y = seat.y;
    spy.moves = 1;
    expect(canBuyTown(state, spy, seat).ok).toBe(false);
    expect(canBuyTown(state, spy, seat).reason).toMatch(/capital/);
    expect(buyTown(state, spy, seat, 5000)).toEqual({ kind: 'impossible' });
    expect(seat.owner).toBe(1);
    // And refusing it costs nothing: an impossible order is not an attempt.
    expect(state.players[0].gold).toBe(5000);
  });

  it('will not sell the same town twice in a fortnight', () => {
    const { state, spy, town } = board();
    rig(true, () => buyTown(state, spy, town, townPrice(state, town)));
    expect(town.owner).toBe(0);
    expect(settling(state, town)).toBe(true);

    // Them trying to buy it straight back is the failure this exists to stop.
    const theirs = spawnUnit(state, 1, 'mimic', town.x + 1, town.y);
    expect(canBuyTown(state, theirs, town).reason).toMatch(/just changed hands/);

    state.turn += BRIBE.settles;
    expect(settling(state, town)).toBe(false);
    expect(canBuyTown(state, theirs, town).ok).toBe(true);
  });
});

describe('what the money buys', () => {
  it('takes the town whole: nothing sacked, nothing razed, nobody dead', () => {
    const { state, spy, town } = board();
    town.size = 7;
    town.buildings = ['walls', 'granary', 'barracks'];
    const price = townPrice(state, town);
    const purse = state.players[0].gold;

    rig(true, () => {
      expect(buyTown(state, spy, town, price)).toEqual({ kind: 'bought', gold: price });
    });

    expect(town.owner).toBe(0);
    expect(town.size).toBe(7);
    expect(town.buildings).toEqual(['walls', 'granary', 'barracks']);
    expect(town.ruinedUntil).toBeUndefined();
    expect(state.players[0].gold).toBe(purse - price);
  });

  it('hands over a town that knows what it went for', () => {
    const { state, spy, town } = board();
    rig(true, () => buyTown(state, spy, town, townPrice(state, town)));
    expect(town.unrest?.until).toBe(state.turn + BRIBE.resentment);
    expect(town.sold).toEqual({ by: 0, on: state.turn });
  });

  it('marches the garrison home to their nearest other town', () => {
    const { state, spy, town, seat } = board();
    const guard = spawnUnit(state, 1, 'footman', town.x, town.y);
    guard.order = 'fortified';
    rig(true, () => buyTown(state, spy, town, townPrice(state, town)));

    expect(town.owner).toBe(0);
    // Still theirs, and standing somewhere else: not bought, not killed.
    expect(guard.owner).toBe(1);
    expect([guard.x, guard.y]).toEqual([seat.x, seat.y]);
    expect(state.units).toContain(guard);
  });

  /**
   * **There is no "nowhere to march to", and that is the interesting part.**
   *
   * Jeremy asked what happens to a garrison with nowhere to go. The answer is
   * that his two rulings together make the case impossible: a side whose only
   * town is this one cannot sell it, so there is always a town to march to.
   * So the thing to test is the rule that closes the gap, not the branch
   * behind it -- and this is also the floor under section 184's second
   * registered risk, that a side too weak to defend a frontier town could be
   * bought out of the game.
   */
  it('never sells a side’s last town, so there is always somewhere to march', () => {
    const { state, spy, town, seat } = board();
    state.cities = state.cities.filter((c) => c.id !== seat.id);
    expect(state.cities.filter((c) => c.owner === 1)).toHaveLength(1);

    expect(canBuyTown(state, spy, town).ok).toBe(false);
    expect(canBuyTown(state, spy, town).reason).toMatch(/all they have left/);
    expect(buyTown(state, spy, town, 5000)).toEqual({ kind: 'impossible' });
    expect(town.owner).toBe(1);
  });

  it('survives a save and a load', () => {
    const { state, spy, town } = board();
    rig(true, () => buyTown(state, spy, town, townPrice(state, town)));
    const back = deserialize(serialize(state));
    const same = back.cities.find((c) => c.id === town.id)!;
    expect(same.sold).toEqual({ by: 0, on: state.turn });
    expect(settling(back, same)).toBe(true);
  });
});

describe('being told no', () => {
  it('names us, costs the standing, and keeps the money', () => {
    const { state, spy, town } = board();
    const before = standing(state, 0, 1);
    const price = townPrice(state, town);
    const purse = state.players[0].gold;

    rig(false, () => {
      expect(buyTown(state, spy, town, price)).toEqual({ kind: 'refused', gold: price });
    });

    expect(town.owner).toBe(1);
    // The money is gone: a free attempt would be a button to press every turn
    // until it worked.
    expect(state.players[0].gold).toBe(purse - price);
    // Named, which is the rule for anything done by walking up and speaking.
    expect(appearsTo(spy, 1).owner).toBe(0);
    expect(standing(state, 0, 1)).toBeLessThan(before);
    expect(standing(state, 0, 1) - before).toBe(BRIBE.refused);
  });

  it('spends what is in the purse and no more', () => {
    const { state, spy, town } = board();
    state.players[0].gold = 40;
    rig(false, () => {
      expect(buyTown(state, spy, town, 4000)).toEqual({ kind: 'refused', gold: 40 });
    });
    expect(state.players[0].gold).toBe(0);
  });

  it('counts every attempt, for the probe', () => {
    const { state, spy, town } = board();
    const offers = SPY_TRACE.townOffers;
    const bought = SPY_TRACE.townsBought;
    rig(true, () => buyTown(state, spy, town, townPrice(state, town)));
    expect(SPY_TRACE.townOffers).toBe(offers + 1);
    expect(SPY_TRACE.townsBought).toBe(bought + 1);
  });
});

describe('what the other side will offer', () => {
  it('makes the cheapest offer that clears its bar', () => {
    const { state, spy, town } = board();
    const offer = aiTownOffer(state, spy, town)!;
    expect(offer).not.toBeNull();
    expect(buyOdds(state, spy, town, offer.gold)).toBeGreaterThanOrEqual(BRIBE.aiOdds);
    // Cheapest: a gold less and the bar is not cleared.
    expect(buyOdds(state, spy, town, offer.gold - 1)).toBeLessThan(BRIBE.aiOdds);
  });

  it('will not spend more of the bank than it is willing to', () => {
    const { state, spy, town } = board();
    const offer = aiTownOffer(state, spy, town)!;
    // Just short of what the share of the purse would allow.
    state.players[0].gold = Math.ceil(offer.gold / BRIBE.aiPurse) - 10;
    expect(aiTownOffer(state, spy, town)).toBeNull();
  });

  it('does not bother with a hamlet', () => {
    const { state, spy, town } = board();
    town.size = BRIBE.aiSize - 1;
    expect(aiTownOffer(state, spy, town)).toBeNull();
  });

  it('is off entirely when the rule is off', () => {
    const { state, spy, town } = board();
    BRIBE.enabled = false;
    try {
      expect(canBuyTown(state, spy, town).ok).toBe(false);
      expect(aiTownOffer(state, spy, town)).toBeNull();
    } finally {
      BRIBE.enabled = true;
    }
    SPY.enabled = false;
    try {
      expect(canBuyTown(state, spy, town).ok).toBe(false);
    } finally {
      SPY.enabled = true;
    }
  });
});
