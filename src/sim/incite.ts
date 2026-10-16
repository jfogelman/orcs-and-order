import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import { adjustStanding } from './diplomacy';
import { uncover } from './disguise';
import { hasFlag } from './rules';
import { log, withRng } from './gamestate';
import { SPY, SPY_ACTIONS, SPY_TRACE, bareExposure, canReach } from './spying';
import { INCITE as LEVER, talkingAlready as isTalking } from './unrest';

/**
 * Section 136 slice 8: setting a town talking against its own rulers.
 *
 * **It takes away patience, not order.** A city riots when it grows past what
 * it can be kept calm at, and this subtracts from the second number rather
 * than forcing the first -- so a town with room to spare shrugs it off and a
 * town already stretched tips over. That is the judgement the order asks for,
 * and it is why the city report from slice 2 is worth having first: size
 * against standing structures is most of what tells you whether a place is
 * near its limit.
 *
 * Nothing is invented and nothing is even untrue. The grievance was already
 * there; all an agent does is mention it to the right person at the right
 * hour, which is also why the town knows perfectly well that it happened and
 * has no idea who to blame.
 */
export { INCITE, talkingAlready, unrestBite } from './unrest';

/** Whether this unit could set this town talking, and why not. */
export function canIncite(
  state: GameState,
  unit: Unit,
  city: City,
): { ok: boolean; reason?: string } {
  if (!LEVER.enabled || !SPY.enabled || !unitType(unit.type).spy) {
    return { ok: false, reason: 'Only a spy knows which ear to use.' };
  }
  if (!hasFlag(state.players[unit.owner], 'incite')) {
    return { ok: false, reason: 'Nobody here has the knack of it yet.' };
  }
  if (city.owner === unit.owner) return { ok: false, reason: 'Those are your own people.' };
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  if (!canReach(unit, city)) return { ok: false, reason: 'Too far away to say it to anybody.' };
  if (isTalking(state, city)) {
    return { ok: false, reason: 'They are already talking of nothing else.' };
  }
  return { ok: true };
}

/** The chance an attempt here ends with the agent named. */
export function inciteExposure(unit: Unit): number {
  const act = SPY_ACTIONS.incite;
  const floor = (act.risk - 1) * SPY.irreducible;
  return Math.max(floor, Math.min(0.95, bareExposure(unit) * act.risk * SPY.weather));
}

export type InciteOutcome = { kind: 'talking'; until: number } | { kind: 'caught' };

/**
 * Say the thing, to the person most likely to repeat it.
 *
 * **The town is told, and is not told by whom** -- Jeremy's rule from the
 * start of this section. Something was done to them and they can see it was,
 * so the news is theirs by right; a name is the prize for catching somebody,
 * and nobody was caught.
 */
export function incite(state: GameState, unit: Unit, city: City): InciteOutcome {
  if (!canIncite(state, unit, city).ok) return { kind: 'caught' };
  SPY_TRACE.incites++;
  unit.moves = 0;
  unit.order = 'none';

  if (withRng(state, (rng) => rng.chance(inciteExposure(unit)))) {
    SPY_TRACE.incitesCaught++;
    uncover(unit, city.owner);
    adjustStanding(state, unit.owner, city.owner, SPY.caught);
    const them = state.players[unit.owner]?.name ?? 'Somebody';
    log(
      state,
      `A stranger in ${city.name} was caught saying a great deal to the wrong people. They were ${them}'s.`,
      'bad',
      city.owner,
      undefined,
      [city.x, city.y],
    );
    log(
      state,
      `Our agent was caught talking in ${city.name}. They know whose it was.`,
      'bad',
      unit.owner,
      undefined,
      [city.x, city.y],
    );
    return { kind: 'caught' };
  }

  const until = state.turn + LEVER.lasts;
  city.unrest = { until };
  SPY_TRACE.incitesTook++;
  log(
    state,
    `${city.name} is talking of nothing but its grievances, and nobody can say who started it.`,
    'bad',
    city.owner,
    undefined,
    [city.x, city.y],
  );
  return { kind: 'talking', until };
}
