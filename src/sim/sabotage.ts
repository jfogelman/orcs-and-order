import { BUILDINGS, BUILDING_IDS } from '../model/buildings';
import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import { adjustStanding } from './diplomacy';
import { uncover } from './disguise';
import { isEndingPiece } from './endings';
import { destroyUnit } from './combat';
import { log, withRng } from './gamestate';
import { RISK_BANDS, SPY, SPY_ACTIONS, bareExposure, canReach } from './spying';

/**
 * Section 136 slice 5: wrecking what somebody has been building.
 *
 * The first rung that *does* something. Reading and searching are both
 * information -- nothing on the board changes and nobody is any worse off --
 * and this is where a spy stops being a pair of eyes. It takes the shields out
 * of whatever the town is building and leaves the town itself alone, because a
 * spy is one person with a bad idea and not an army.
 *
 * **The risk is priced off what is being wrecked, not off the spy.** A town
 * putting up a granary is barely watched; a town three hundred shields into
 * something that ends the game has every eye in the empire on it, which is the
 * shape Jeremy asked for. It climbs in *phases* rather than smoothly, so the
 * question a player faces is "which band is this in", not an arithmetic
 * problem -- and the bands are read off the banked shields against a fixed
 * reference, so they cannot drift as costs are tuned.
 */
export const SABOTAGE = {
  /** The switch, for sweeps. */
  enabled: true,
  /**
   * The share of the banked shields a successful sabotage destroys.
   *
   * All of it. The risk is already priced to match -- and a saboteur that is
   * caught does not come home (see `caughtDies`), which is what makes the top
   * of this ladder a real decision rather than a free roll at somebody's
   * Portal.
   */
  takes: 1,
  /**
   * **A caught saboteur is lost.**
   *
   * The sharpest difference between this and the rungs below it. Being noticed
   * while *looking* costs you the disguise and some standing; being caught with
   * your hands on somebody's half-built Portal costs you the agent. Without
   * this the trade is absurdly one-sided: thirty shields and a 70% chance of
   * deleting four hundred.
   */
  caughtDies: true,
  /**
   * Where the phases fall, as shares of the reference work.
   *
   * Three cuts, four bands, deliberately coarse. A granular curve would make
   * the displayed risk twitch every turn as a city banks another six shields,
   * which is a number nobody can plan against.
   */
  phases: [0.25, 0.5, 0.75],
  /** What `sabotage`'s base risk is multiplied by, in each of the four bands. */
  weights: [0.4, 0.7, 1.1, 1.5],
  /**
   * And what anything that would *win the game* is multiplied by, whatever is
   * banked in it.
   *
   * Above the top band by construction rather than by having a large number of
   * shields in it: a Portal at twenty shields is already the most closely
   * watched building site in the world, because of what it is and not because
   * of how far along it is.
   */
  endingWeight: 2,
  /**
   * The part of being caught at this that experience cannot drill away, per
   * point of phase weight.
   *
   * **Much larger than the reading ladder's, and for a plain reason.** Reading
   * a town is standing about looking interested; this is being found with your
   * hands in somebody's half-built Portal, and no amount of skill makes that
   * explicable. Without it a rank-3 agent came out at **4%** on an ending work
   * -- "barely any risk" for deleting four hundred shields -- which is the same
   * collapse the reading ladder had and the same fix.
   *
   * At the top band it holds a veteran at one in five, every time, for the
   * biggest prize on the board.
   */
  irreducible: 0.1,
  /** Whether the other side does this too. */
  ai: true,
  /**
   * How exposed the other side will let itself get for one of these.
   *
   * The same shape as `RUINS.aiOdds`: a bar on a fight you choose. A veteran
   * agent clears it against an ending work and a green one does not, which is
   * the right answer -- losing your only agent to delete twenty shields of
   * somebody's Portal is a bad trade, and the AI should not take it either.
   */
  aiOdds: 0.45,
};

/**
 * The yardstick the phases are measured against: the dearest folly in the game.
 *
 * Read off the data rather than written down, so tuning a folly's cost moves
 * the scale with it and nothing here needs remembering. A folly rather than an
 * ending because the endings are the thing sitting *above* the scale -- using
 * one as the yardstick would squash every ordinary building into the bottom
 * band.
 */
export function referenceWork(): number {
  return BUILDING_IDS.reduce((best, id) => {
    const b = BUILDINGS[id];
    return b.folly !== undefined && b.cost > best ? b.cost : best;
  }, 1);
}

/** How many shields are sitting in this city's current job, wherever they live. */
export function investedIn(state: GameState, city: City): number {
  const item = city.producing;
  if (item.kind !== 'building') return city.shields;
  const def = BUILDINGS[item.id];
  // Follies and ending works bank at the empire, not in the city's box.
  if (def && (def.folly !== undefined || isEndingPiece(def))) {
    return (state.players[city.owner]?.worksBanked?.[item.id] ?? 0) + city.shields;
  }
  return city.shields;
}

/** Whether this city's job is one that would end the game. */
export function isEndingWork(city: City): boolean {
  const item = city.producing;
  return item.kind === 'building' && isEndingPiece(BUILDINGS[item.id]);
}

export interface SabotagePhase {
  /** 0 to `weights.length - 1`, or the ending band above all of them. */
  band: number;
  /** Whether this is the ending band. */
  ending: boolean;
  /** What the action's base risk is multiplied by. */
  weight: number;
  /** What would be destroyed. */
  invested: number;
}

/** Which phase this city's works sit in, and therefore how closely watched. */
export function sabotagePhase(state: GameState, city: City): SabotagePhase {
  const invested = investedIn(state, city);
  if (isEndingWork(city)) {
    return {
      band: SABOTAGE.weights.length,
      ending: true,
      weight: SABOTAGE.endingWeight,
      invested,
    };
  }
  const share = invested / referenceWork();
  const band = SABOTAGE.phases.filter((p) => share >= p).length;
  return { band, ending: false, weight: SABOTAGE.weights[band], invested };
}

/** Whether this unit could wreck this city's works, and why not. */
export function canSabotage(unit: Unit, city: City, state: GameState): { ok: boolean; reason?: string } {
  if (!SABOTAGE.enabled || !SPY.enabled || !unitType(unit.type).spy) {
    return { ok: false, reason: 'Only a spy knows where to put the sand.' };
  }
  if (city.owner === unit.owner) return { ok: false, reason: 'Those are your own works.' };
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  if (!canReach(unit, city)) return { ok: false, reason: 'Too far away to reach the works.' };
  if (investedIn(state, city) <= 0) {
    // Nothing to wreck is not a failure, it is a thing worth saying: the whole
    // point of this order is the shields, and a town that has banked none is a
    // town where there is nothing to do but be seen trying.
    return { ok: false, reason: 'There is nothing in there worth wrecking yet.' };
  }
  return { ok: true };
}

/** The chance a sabotage here ends with the agent caught. */
export function sabotageExposure(state: GameState, unit: Unit, city: City): number {
  const phase = sabotagePhase(state, city);
  const base = SPY_ACTIONS.sabotage.risk;
  const floor = phase.weight * SABOTAGE.irreducible;
  return Math.max(floor, Math.min(0.95, bareExposure(unit) * base * phase.weight * SPY.weather));
}

export type SabotageOutcome =
  | { kind: 'wrecked'; shields: number; what: string }
  | { kind: 'failed' }
  | { kind: 'caught'; lost: boolean };

/**
 * Put the sand in the gears.
 *
 * **The victim is told, and is not told by whom.** That is Jeremy's rule from
 * the start of this section, and sabotage is the first rung where it bites:
 * something has been done to them and they can see it has, so the news is
 * theirs by right -- but a name is the prize for catching somebody, and nobody
 * was caught.
 */
export function sabotage(state: GameState, unit: Unit, city: City): SabotageOutcome {
  if (!canSabotage(unit, city, state).ok) return { kind: 'failed' };
  unit.moves = 0;
  unit.order = 'none';

  const phase = sabotagePhase(state, city);
  const caught = withRng(state, (rng) => rng.chance(sabotageExposure(state, unit, city)));

  if (caught) {
    uncover(unit, city.owner);
    adjustStanding(state, unit.owner, city.owner, SPY.caught);
    const them = state.players[unit.owner]?.name ?? 'Somebody';
    log(
      state,
      `Somebody was caught at the works in ${city.name}, with their hands full. They were ${them}'s.`,
      'bad',
      city.owner,
      undefined,
      [city.x, city.y],
    );
    log(
      state,
      `Our agent was caught at the works in ${city.name}. They know whose it was.`,
      'bad',
      unit.owner,
      undefined,
      [city.x, city.y],
    );
    if (SABOTAGE.caughtDies) {
      destroyUnit(state, unit, 'is taken at the works');
      return { kind: 'caught', lost: true };
    }
    return { kind: 'caught', lost: false };
  }

  const taken = Math.floor(phase.invested * SABOTAGE.takes);
  const item = city.producing;
  const what =
    item.kind === 'building'
      ? (BUILDINGS[item.id]?.name ?? 'the works')
      : item.kind === 'unit'
        ? unitType(item.id).name
        : 'the works';
  // Taken out of the empire's bank first, then out of the city's box, because
  // that is the order the shields went in.
  if (item.kind === 'building') {
    const bank = state.players[city.owner]?.worksBanked;
    if (bank?.[item.id] !== undefined) {
      delete bank[item.id];
      if (Object.keys(bank).length === 0) delete state.players[city.owner].worksBanked;
    }
  }
  city.shields = 0;

  log(
    state,
    `The works at ${city.name} are wrecked. ${taken} shields of ${what}, and nobody will say how.`,
    'bad',
    city.owner,
    undefined,
    [city.x, city.y],
  );
  return { kind: 'wrecked', shields: taken, what };
}

/** What to call the risk of wrecking this town's works, where a player can see it. */
export function sabotageBand(state: GameState, unit: Unit, city: City): string {
  const odds = sabotageExposure(state, unit, city);
  if (odds <= 0) return 'no risk';
  return (RISK_BANDS.find((b) => odds < b.under) ?? RISK_BANDS[RISK_BANDS.length - 1]).label;
}
