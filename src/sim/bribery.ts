import type { City, GameState, Unit } from '../model/types';
import { headcount, unitType } from '../model/units';
import { DIRS8, distance } from '../engine/grid';
import { capitalOf, unitsInCity } from './city';
import { adjustStanding, noteCityTaken } from './diplomacy';
import { uncover } from './disguise';
import { hasFlag } from './rules';
import { cityAt, log, recomputeVisibility, unitAt, withRng } from './gamestate';
import { costFnFor } from './movement';
import { SPY, SPY_ACTIONS, SPY_TRACE, bareExposure, canReach } from './spying';
import { talkingAlready } from './unrest';

/**
 * Section 184: buying somebody else's town.
 *
 * The last of section 154's three cheapest-first answers to dead gold, and
 * the only one left untouched -- tribute shipped in section 180 and
 * mercenaries are closed as measured-and-wrong.
 *
 * **It is not a military action with a price on it.** Storming a town costs
 * the town: `captureCity` takes `sackSeverity` off its size, razes a building
 * for every point of that, and sets `ruinedUntil` so nothing grows there for a
 * while. A bought town is whole -- every building standing, the walls intact,
 * nobody dead. That is what makes it worth a great deal of money and it is the
 * whole design statement: gold buys you the place as a place, where an army
 * only ever buys you the ruins of one.
 *
 * **Why this is a sink where rush-buying was a lead.** Section 4e retired
 * rush-buying for the AI and the reason still holds -- it scales with how many
 * cities you have to spend it in, so it pays whoever is already winning. This
 * rung has the opposite shape, and it is designed in rather than hoped for:
 * the asking price carries a term in the *victim's* treasury. A rich side is
 * dear to buy from. So the hoard that makes a side the best buyer is the same
 * hoard that makes it the hardest to buy from, and a side that spends its
 * hoard down is a side that has become cheap. That is Civ 2's own shape, and
 * the lever is `ofTheirPurse`.
 */
export const BRIBE = {
  /** The switch, for sweeps. */
  enabled: true,
  /**
   * What a town costs, term by term.
   *
   * All of it a fact about the **target**, exactly as `askingPrice` is a fact
   * about a soldier, so that two agents are quoted the same figure and the
   * only dial a player turns is what they *offer*.
   */
  base: 80,
  perSize: 45,
  perBuilding: 40,
  /**
   * Per body standing in the town.
   *
   * A defended town is dearer than an empty one, which keeps the purchase
   * honest without making it a combat calculation: you are paying for the
   * trouble of turning that many soldiers out of their billets, not fighting
   * them.
   */
  perBody: 20,
  /**
   * The share of the owner's banked gold that goes into the asking price.
   *
   * **The anti-runaway term, and the reason this rung is not rush-buying.**
   * See the note above. If a sweep ever shows the leader converting a dead
   * hoard into cities, this number goes *up* rather than the rung coming out.
   */
  ofTheirPurse: 0.15,
  /**
   * What it is worth to have somebody talking first. Section 136 slice 8.
   *
   * Jeremy's ruling, and the two-step play is intended: foment, then buy. It
   * gives the cheapest offensive rung on the ladder a second purpose, and it
   * means the dearest rung rewards a player who planned two turns ago rather
   * than one who happens to be rich today.
   */
  unrestCut: 0.3,
  /**
   * What the asking price buys, and what paying it does to the odds. The same
   * shape as `TURNING`: paying the asking price exactly gives `atAsking`, half
   * gives proportionally less, and nothing is ever certain.
   *
   * Lower at the asking price than turning a soldier's 0.6, because the person
   * being bought has more to lose and further to fall.
   */
  atAsking: 0.55,
  best: 0.85,
  worst: 0.05,
  /** Added to the odds per rank of the agent making the offer. */
  perAgentRank: 0.05,
  /**
   * What being refused costs between the two sides.
   *
   * Twice what a caught spy costs, because this is not a caught spy: it is a
   * formal attempt to buy a town out from under an empire, reported by the
   * magistrate it was offered to.
   */
  refused: SPY.caught * 2,
  /**
   * How long a bought town stays sore about it.
   *
   * The townsfolk were sold and they know what they went for, so the buyer
   * inherits `city.unrest` rather than a grateful new province. Reuses slice
   * 8's field, which is the same fact about a town.
   */
  resentment: 8,
  /**
   * How long before a town that has changed hands this way may do so again.
   *
   * **Without this the two richest sides pass a border town back and forth**
   * for the rest of the game, which is exactly the failure `razeCity`'s note
   * describes for storming one: whatever is lost is taken straight back and no
   * war ever resolves.
   */
  settles: 15,
  /**
   * How many towns a side keeps, whatever anybody offers. Jeremy, after the
   * 324-game run: *"floor at four"*.
   *
   * **Four, not one, and the difference is which empires this rung is aimed
   * at.** At a floor of one it was only the elimination case that was closed:
   * a side could be bought down to its last town and left there. Four means a
   * purse can only take from an empire that still has an empire after the
   * sale.
   *
   * Measured city counts put that squarely on the two largest -- the Kingdom
   * ends on 7.4 towns and the Horde on 5.1, while the Hive (3.0), the Unbound
   * (3.2) and the Wandering Folk (2.4-3.4) are at or under the floor for most
   * of a game. So this is close to "only the big empires are for sale", which
   * is the opposite of where a purse naturally points and is the reason for
   * stating it as a number rather than leaving it at the last town.
   *
   * **It is not free.** The 324-game run measured the rule at a floor of one.
   * Whatever this does to how often the rung fires at all is unmeasured until
   * the probe says otherwise, and `BRIBE.floor` is in `LEVERS` so an arm of it
   * is a real arm.
   */
  floor: 4,
  /** Whether the other side buys towns too. */
  ai: true,
  /** The most it will spend on one town, as a share of what is in the bank. */
  aiPurse: 0.6,
  /**
   * The odds it insists on before making an offer. The same shape as
   * `TURNING.aiOdds`: being refused is being named, so thin offers would spend
   * the purse buying diplomatic incidents.
   */
  aiOdds: 0.55,
  /** The smallest town it thinks worth the risk of being named over. */
  aiSize: 2,
  /**
   * How likely to be named the other side will accept before it tries.
   *
   * **Deliberately permissive**, so that a green agent may try at all. The
   * gradient is tempting -- a bar of 0.45 would mean only a promoted agent
   * dares this, which is the shape sabotage uses and reads well -- but section
   * 136's own lesson is the dearer one: a rule the AI never reaches measures
   * as a rule that does nothing, and this one is already gated by a purse
   * most sides cannot fill. Tighten it after a probe says how often it fires,
   * not before.
   */
  aiNamed: 0.55,
};

export interface BribeTally {
  /** Towns this side has bought. */
  bought: number;
  /** Towns bought out from under it. */
  lost: number;
}

function tally(state: GameState, playerId: number): BribeTally {
  const all = (state.bribes ??= {});
  return (all[playerId] ??= { bought: 0, lost: 0 });
}

/**
 * What this side has bought and had bought from it.
 *
 * Returns zeroes rather than `undefined`, so *never bought from* is
 * distinguishable from *not recorded* -- the same shape as `tributeTally`, and
 * for the same reason: a column that cannot tell those apart reads a game
 * where nothing happened as a game that was not measured.
 */
export function bribeTally(state: GameState, playerId: number): BribeTally {
  const got = state.bribes?.[playerId];
  return { bought: got?.bought ?? 0, lost: got?.lost ?? 0 };
}

/** Whether this town has changed hands for money too recently to do it again. */
export function settling(state: GameState, city: City): boolean {
  return city.sold !== undefined && state.turn < city.sold.on + BRIBE.settles;
}

/**
 * What a town is asking.
 *
 * Read off its size, what is standing in it, who is standing in it and how
 * much its owner has in the bank -- and discounted if somebody has already
 * been round making the place unhappy.
 */
export function townPrice(state: GameState, city: City): number {
  const bodies = unitsInCity(state, city).reduce((n, u) => n + headcount(u), 0);
  const theirs = state.players[city.owner]?.gold ?? 0;
  const raw =
    BRIBE.base +
    city.size * BRIBE.perSize +
    city.buildings.length * BRIBE.perBuilding +
    bodies * BRIBE.perBody +
    theirs * BRIBE.ofTheirPurse;
  const unhappy = talkingAlready(state, city) || city.disorder;
  return Math.max(1, Math.round(raw * (unhappy ? 1 - BRIBE.unrestCut : 1)));
}

/** Whether this agent could buy this town at all, and why not. */
export function canBuyTown(
  state: GameState,
  unit: Unit,
  city: City,
): { ok: boolean; reason?: string } {
  if (!BRIBE.enabled || !SPY.enabled || !unitType(unit.type).spy) {
    return { ok: false, reason: 'Only a spy carries that kind of purse.' };
  }
  if (!hasFlag(state.players[unit.owner], 'turning')) {
    return { ok: false, reason: 'Nobody here has thought of simply asking.' };
  }
  if (city.owner === unit.owner) return { ok: false, reason: 'Those are your own people.' };
  if (state.players[city.owner]?.barbarian) {
    return { ok: false, reason: 'There is nobody there who owns anything.' };
  }
  // **A side keeps `BRIBE.floor` towns, whatever is offered.** Its own rule
  // rather than something left to fall out of the capital rule below.
  //
  // **Asked first, and the order is the message.** Both rules refuse a side
  // down to one town, because `capitalOf` falls back to the oldest town a side
  // *holds* -- so whichever is asked first is the reason the player is given,
  // and "they are down to their last few" is the true one. A capital is a
  // thing an empire has; a floor is a thing a side is down to.
  //
  // At a floor of one it would have fallen out of the capital rule anyway, in
  // another module, to vanish the day `capitalOf` stopped falling back. At
  // four it does not fall out of anything, and the elimination case it closes
  // is the one section 184 registered as a risk before the arm ran -- the
  // Wandering Folk, who cannot defend a frontier town, being bought out of the
  // game rather than fought out of it.
  if (state.cities.filter((c) => c.owner === city.owner).length <= BRIBE.floor) {
    return { ok: false, reason: 'They are down to their last few. Nobody there is for sale.' };
  }
  // **Jeremy's ruling: a capital is never for sale, at any price.** Not dearer
  // -- refused. It takes the worst case off the board (an empire decapitated
  // by a purse) and gives every side one place that cannot be taken this way.
  if (capitalOf(state, city.owner)?.id === city.id) {
    return { ok: false, reason: 'This is their capital. Nobody here is for sale.' };
  }
  if (settling(state, city)) {
    return { ok: false, reason: 'This place has only just changed hands once.' };
  }
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  if (!canReach(unit, city)) return { ok: false, reason: 'Too far away to say it to anybody.' };
  return { ok: true };
}

/** The chance an attempt here ends with the agent named. */
export function buyExposure(unit: Unit): number {
  const act = SPY_ACTIONS.buy;
  const floor = (act.risk - 1) * SPY.irreducible;
  return Math.max(floor, Math.min(0.95, bareExposure(unit) * act.risk * SPY.weather));
}

/** The chance an offer of this size is taken. */
export function buyOdds(state: GameState, unit: Unit, city: City, gold: number): number {
  const share = gold / townPrice(state, city);
  const odds = BRIBE.atAsking * share + unit.rank * BRIBE.perAgentRank;
  return Math.max(BRIBE.worst, Math.min(BRIBE.best, odds));
}

export type BuyOutcome =
  | { kind: 'bought'; gold: number }
  | { kind: 'refused'; gold: number }
  | { kind: 'impossible' };

/**
 * Where a soldier turned out of a bought town goes.
 *
 * **Jeremy's ruling: pushed out, not bought and not killed.** They refuse to
 * serve a bought magistrate and will not fight their own townsfolk either, so
 * they walk home -- to their side's nearest remaining town. He flagged the
 * edge case himself, so the fallback is explicit and in this order:
 *
 * 1. Their side's nearest other town, however far.
 * 2. Out of the gate: the nearest tile beside the town it can stand on.
 * 3. Failing even that, it stays where it stands.
 *
 * The ordering matters because the alternative -- enemy soldiers standing
 * inside a town somebody else owns -- is a board state nothing else in this
 * game produces, and every rule that reads a tile would have to learn it.
 *
 * **Steps 2 and 3 are unreachable today, and that is a finding rather than an
 * oversight.** Jeremy asked what happens to a garrison with nowhere to go;
 * the answer is that his two rulings together make the case impossible. A side
 * whose only town is this one cannot sell it -- the last-town rule in
 * `canBuyTown` -- so there is always somewhere to march. They are kept because
 * a rule above may be relaxed later, and they are kept **non-destructive** for
 * the same reason: an unreachable branch that deletes somebody's soldiers is
 * the worst thing to be wrong about, so the deepest fallback leaves the unit
 * standing rather than removing it from the game.
 */
function turnOut(state: GameState, unit: Unit, city: City): 'home' | 'gate' | 'stayed' {
  const homes = state.cities.filter((c) => c.owner === unit.owner && c.id !== city.id);
  let best: City | null = null;
  for (const c of homes) {
    if (!best || distance(c.x, c.y, city.x, city.y) < distance(best.x, best.y, city.x, city.y)) {
      best = c;
    }
  }
  if (best) {
    unit.x = best.x;
    unit.y = best.y;
    unit.moves = 0;
    unit.order = 'none';
    unit.goto = null;
    recomputeVisibility(state, unit.owner);
    return 'home';
  }

  // Nowhere to march to: put them outside the gate. Same shape as `stepBack`
  // in movement.ts -- the cost function answers "may this unit stand here",
  // and a tile with anybody or anything on it is not an answer.
  const cost = costFnFor(state, unit);
  for (const [dx, dy] of DIRS8) {
    const x = city.x + dx;
    const y = city.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    const step = cost(x, y, city.x, city.y);
    if (step === null || !Number.isFinite(step)) continue;
    if (unitAt(state, x, y)) continue;
    if (cityAt(state, x, y)) continue;
    unit.x = x;
    unit.y = y;
    unit.moves = 0;
    unit.order = 'none';
    unit.goto = null;
    recomputeVisibility(state, unit.owner);
    return 'gate';
  }

  return 'stayed';
}

/**
 * Make the offer.
 *
 * The gold is spent either way, as with turning a soldier and for the same
 * reason: a free attempt would be a button to press every turn until it
 * worked.
 */
export function buyTown(state: GameState, unit: Unit, city: City, gold: number): BuyOutcome {
  if (!canBuyTown(state, unit, city).ok) return { kind: 'impossible' };
  const buyer = state.players[unit.owner];
  const from = state.players[city.owner];
  const paid = Math.max(0, Math.min(gold, buyer.gold));
  unit.moves = 0;
  unit.order = 'none';
  buyer.gold -= paid;
  SPY_TRACE.townOffers++;
  SPY_TRACE.goldSpentOnTowns += paid;

  if (!withRng(state, (rng) => rng.chance(buyOdds(state, unit, city, paid)))) {
    // **Refused is being named**, as with turning and for the same reason: you
    // did not watch from a hedge, you walked up and made an offer to somebody
    // with a report to write. The agent lives -- a saboteur is caught at the
    // works, a negotiator is merely shown the door.
    SPY_TRACE.townOffersRefused++;
    uncover(unit, city.owner);
    adjustStanding(state, unit.owner, city.owner, BRIBE.refused);
    const them = buyer?.name ?? 'Somebody';
    log(
      state,
      `Somebody offered to buy ${city.name} outright, and was shown the door. The offer was ${them}'s.`,
      'bad',
      city.owner,
      undefined,
      [city.x, city.y],
    );
    log(
      state,
      `${city.name} is not for sale, and they know whose money it was.`,
      'bad',
      unit.owner,
      undefined,
      [city.x, city.y],
    );
    return { kind: 'refused', gold: paid };
  }

  // Turned out before the owner changes, so "their side's nearest town" still
  // means theirs.
  const garrison = unitsInCity(state, city);
  let marched = 0;
  for (const soldier of garrison) {
    if (turnOut(state, soldier, city) !== 'stayed') marched++;
  }

  // Section 135: a city changing hands is the thing two sides really remember,
  // and it is no less true for having been paid for. Before the owner changes,
  // so the side it is being taken from is still on the record.
  noteCityTaken(state, unit.owner, city.owner);
  city.owner = unit.owner;
  city.sold = { by: unit.owner, on: state.turn };
  city.workedTiles = [];
  city.producing = { kind: 'coin' };
  city.shields = 0;
  // Nothing is sacked, nothing is razed and nobody dies: that is what the money
  // bought. What the buyer inherits instead is a town that knows what it went
  // for.
  city.unrest = { until: state.turn + BRIBE.resentment };
  SPY_TRACE.townsBought++;
  tally(state, unit.owner).bought += 1;
  tally(state, from.id).lost += 1;
  recomputeVisibility(state, unit.owner);
  recomputeVisibility(state, from.id);

  log(
    state,
    `${city.name} has been bought. It is ours, and its people know exactly what they went for.`,
    'good',
    unit.owner,
    'capture',
    [city.x, city.y],
  );
  log(
    state,
    marched > 0
      ? `${city.name} has been sold out from under us. The garrison would not serve a bought magistrate and has marched home.`
      : `${city.name} has been sold out from under us.`,
    'bad',
    from.id,
    'city-lost',
    [city.x, city.y],
  );
  return { kind: 'bought', gold: paid };
}

/**
 * What the other side would offer for this town, or nothing.
 *
 * The **cheapest offer that clears its bar**, which is the shape of a buyer
 * rather than a spender -- the same reading as `aiOffer` for soldiers. It is
 * not trying to be generous, it is trying to be sure enough.
 */
export function aiTownOffer(state: GameState, spy: Unit, city: City): { gold: number } | null {
  if (!BRIBE.ai) return null;
  if (city.size < BRIBE.aiSize) return null;
  if (!canBuyTown(state, spy, city).ok) return null;
  const purse = Math.floor((state.players[spy.owner]?.gold ?? 0) * BRIBE.aiPurse);
  const need = Math.max(0, (BRIBE.aiOdds - spy.rank * BRIBE.perAgentRank) / BRIBE.atAsking);
  const gold = Math.ceil(townPrice(state, city) * need);
  if (gold > purse) return null;
  if (buyOdds(state, spy, city, gold) < BRIBE.aiOdds) return null;
  return { gold };
}
