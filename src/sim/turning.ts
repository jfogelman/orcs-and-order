import type { GameState, Unit } from '../model/types';
import { headcount, unitType } from '../model/units';
import { adjustStanding } from './diplomacy';
import { uncover } from './disguise';
import { hasFlag } from './rules';
import { log, withRng } from './gamestate';
import { SPY } from './spying';

/**
 * Section 136 slice 6: buying somebody else's soldier.
 *
 * The rung with a price on it. Everything else a spy does is paid for in
 * turns; this is paid for in **gold**, and the gold is the dial -- a thin
 * offer is refused more often than a fat one, and the asking price is a fact
 * about the unit rather than about the agent.
 *
 * Two shapes, which is Jeremy's design and the more interesting half:
 *
 * **Now**, and it changes sides where it stands. You see what you bought and
 * so does everybody looking at that tile.
 *
 * **Later**, and it stays theirs -- fighting for them, holding their gate,
 * counted in their garrison -- until the turn you named, when it turns round.
 * A delayed betrayal is cheaper, because a soldier will agree to far more
 * when the bill is some other week's problem, and it is worth more, because
 * you choose the week.
 *
 * **Failing is being caught.** There is no quiet failure here and that is
 * deliberate: the thing you are trying to buy is a person, and a person who
 * says no has something to report. It is the one rung where the victim always
 * learns *who*, because the agent did not watch from a hedge -- it walked up
 * and made an offer.
 */
export const TURNING = {
  /** The switch, for sweeps. */
  enabled: true,
  /**
   * What a unit costs to buy, per shield it cost to build.
   *
   * Dear on purpose. A soldier bought is a soldier taken *and* a soldier
   * gained, so it swings twice, and at a cheap rate the answer to every war
   * would be a purse rather than an army.
   */
  perShield: 2.5,
  /** Added per rank: a veteran knows its own worth. */
  perRank: 0.35,
  /**
   * What the asking price buys, and what paying it does to the odds.
   *
   * Paying the asking price exactly gives `atAsking`. Paying half gives
   * proportionally less, paying double proportionally more, up to `best`.
   * Nothing is ever certain -- `best` is short of one -- because a unit that
   * could be bought for certain would make gold a win condition.
   */
  atAsking: 0.6,
  best: 0.9,
  worst: 0.08,
  /** Added to the odds per rank of the agent making the offer. */
  perAgentRank: 0.05,
  /**
   * What a delayed betrayal is discounted by, per turn of delay, and how long
   * a delay may be.
   *
   * A soldier will agree to far more when the bill is some other week's
   * problem -- and the longer the wait, the more chances for the unit to die
   * of something else first, which is the risk the discount pays for.
   */
  delayDiscount: 0.03,
  maxDelay: 12,
  /** What being refused costs between the two sides. */
  refused: SPY.caught,
  /** Whether the other side buys units too. */
  ai: true,
  /** The most it will pay, as a share of what it has in the bank. */
  aiPurse: 0.5,
};

/** Whether this unit could be bought at all, and why not. */
export function canTurn(
  state: GameState,
  spy: Unit,
  target: Unit,
): { ok: boolean; reason?: string } {
  if (!TURNING.enabled || !SPY.enabled || !unitType(spy.type).spy) {
    return { ok: false, reason: 'Only a spy carries that kind of purse.' };
  }
  if (!hasFlag(state.players[spy.owner], 'turning')) {
    return { ok: false, reason: 'Nobody here has thought of simply asking.' };
  }
  if (target.owner === spy.owner) return { ok: false, reason: 'They are already yours.' };
  if (state.players[target.owner]?.barbarian) {
    // A raiding band is not an employer and has no loyalty to buy out of.
    return { ok: false, reason: 'There is nobody there to make an offer to.' };
  }
  if (unitType(target.type).spy) {
    // Turning somebody's agent is its own rung -- the double -- and a
    // different decision. Not this one.
    return { ok: false, reason: 'That one is in the same trade, and knows the signs.' };
  }
  if (target.bought) return { ok: false, reason: 'Somebody has already bought them.' };
  if (spy.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  if (Math.max(Math.abs(spy.x - target.x), Math.abs(spy.y - target.y)) > SPY.reach) {
    return { ok: false, reason: 'Too far away to say anything to them.' };
  }
  return { ok: true };
}

/**
 * What this unit is asking.
 *
 * Read off what it cost to build, how many of it there are and how decorated
 * it is -- all facts about the unit, so two agents get quoted the same price
 * and the dial a player turns is what they *offer*, not what they are asked.
 */
export function askingPrice(target: Unit, delay = 0): number {
  const type = unitType(target.type);
  const base = type.cost * headcount(target) * TURNING.perShield;
  const ranked = base * (1 + target.rank * TURNING.perRank);
  const waited = ranked * (1 - Math.min(delay, TURNING.maxDelay) * TURNING.delayDiscount);
  return Math.max(1, Math.round(waited));
}

/** The chance an offer of this size is taken. */
export function turnOdds(spy: Unit, target: Unit, gold: number, delay = 0): number {
  const asking = askingPrice(target, delay);
  // Proportional to the share of the asking price offered, so a thin offer is
  // a long shot rather than a refusal and a fat one is good but never sure.
  const share = gold / asking;
  const odds = TURNING.atAsking * share + spy.rank * TURNING.perAgentRank;
  return Math.max(TURNING.worst, Math.min(TURNING.best, odds));
}

export type TurnOutcome =
  | { kind: 'bought'; gold: number; on: number }
  | { kind: 'refused'; gold: number };

/**
 * Make the offer.
 *
 * The gold is spent either way. That is the point of a bribe: you do not get
 * it back because somebody said no, and a free attempt would make this a
 * button to press every turn until it worked.
 */
export function turnUnit(
  state: GameState,
  spy: Unit,
  target: Unit,
  gold: number,
  delay = 0,
): TurnOutcome {
  if (!canTurn(state, spy, target).ok) return { kind: 'refused', gold: 0 };
  const buyer = state.players[spy.owner];
  const paid = Math.max(0, Math.min(gold, buyer.gold));
  spy.moves = 0;
  spy.order = 'none';
  buyer.gold -= paid;

  const wait = Math.max(0, Math.min(delay, TURNING.maxDelay));
  if (withRng(state, (rng) => rng.chance(turnOdds(spy, target, paid, wait)))) {
    const on = state.turn + wait;
    if (wait === 0) {
      changeSides(state, target, spy.owner);
    } else {
      // **Still theirs until the day comes.** Nothing else in the game reads
      // `bought`, deliberately: it fights for them, is supplied by them and
      // holds their gate right up until it does not.
      target.bought = { by: spy.owner, on };
    }
    log(
      state,
      wait === 0
        ? `${unitType(target.type).name} has had a better offer, and took it.`
        : `${unitType(target.type).name} has taken our money. They will remember on turn ${on}.`,
      'good',
      spy.owner,
      undefined,
      [target.x, target.y],
    );
    return { kind: 'bought', gold: paid, on };
  }

  // **Refused is caught.** The thing being bought is a person, and a person
  // who says no has somebody to tell -- so unlike every rung below this one,
  // the other side always learns whose agent it was.
  uncover(spy, target.owner);
  adjustStanding(state, spy.owner, target.owner, TURNING.refused);
  const them = state.players[spy.owner]?.name ?? 'Somebody';
  log(
    state,
    `A ${unitType(target.type).name} was offered money to change sides, and reported it. The offer was ${them}'s.`,
    'bad',
    target.owner,
    undefined,
    [target.x, target.y],
  );
  log(
    state,
    `${unitType(target.type).name} refused us, and told somebody. They know whose offer it was.`,
    'bad',
    spy.owner,
    undefined,
    [target.x, target.y],
  );
  return { kind: 'refused', gold: paid };
}

/** Hand a unit over, and tidy up everything that was true of it before. */
function changeSides(_state: GameState, unit: Unit, to: number): void {
  unit.owner = to;
  unit.moves = 0;
  unit.order = 'none';
  unit.goto = null;
  // Whatever it was pretending to be, and whoever had seen through that, was
  // about somebody else's unit.
  delete unit.disguise;
  delete unit.uncoveredBy;
  delete unit.bought;
}

/**
 * The day somebody's money comes due.
 *
 * Called at the top of a side's turn, so a bought unit turns *before* it is
 * asked to do anything for the side that still thinks it owns it.
 */
export function collectDebts(state: GameState, playerId: number): void {
  if (!TURNING.enabled) return;
  for (const unit of state.units) {
    if (unit.owner !== playerId || !unit.bought) continue;
    if (state.turn < unit.bought.on) continue;
    const buyer = unit.bought.by;
    log(
      state,
      `${unitType(unit.type).name} turns round and walks away. It seems they were bought some time ago.`,
      'bad',
      playerId,
      undefined,
      [unit.x, unit.y],
    );
    log(
      state,
      `${unitType(unit.type).name} is ours now, as arranged.`,
      'good',
      buyer,
      undefined,
      [unit.x, unit.y],
    );
    changeSides(state, unit, buyer);
  }
}
