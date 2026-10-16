import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import { atPeace, atWarLately, moodName, peek, standing } from './diplomacy';
import { contenders, log } from './gamestate';
import { hasFlag } from './rules';
import { SPY, SPY_TRACE, canReach } from './spying';

/**
 * Section 136 slice 7: asking a town what it thinks of everybody.
 *
 * **The only rung that is about somebody who is not in the room.** Everything
 * else a spy does concerns the two of you -- their town, their works, their
 * soldier, their agent in your streets. This is about the people *next to*
 * them, and it is the one piece of information the game has never had a way to
 * hand over: the Talks screen says what you and they make of each other, and
 * nothing anywhere says what two other sides make of one another.
 *
 * Which matters, because an empire fighting on its far side is a different
 * proposition from one that is not -- and a side that hates its other
 * neighbour is a side that can be left alone for a while.
 */
export const GOSSIP = {
  /** The switch, for sweeps. */
  enabled: true,
  /** How many turns a report is worth acting on, as `SPY.remembers` is. */
  remembers: 20,
  /** Whether the other side asks around too. */
  ai: true,
};

/** What a town will say about its neighbours. */
export interface StandingReading {
  /** The side that was asked. */
  about: number;
  rows: {
    other: number;
    mood: string;
    standing: number;
    /**
     * Whether blood has actually been spilt lately.
     *
     * **Not `hostile`, which only means "no treaty".** Every pair without a
     * truce is hostile, including two sides at mood *Peace* who have never
     * exchanged a blow -- so the first version of this report said
     * "Peace (+14) -- at war" on one line, which is the same two-opposite-
     * things-at-once that the spy dialogs were pulled up for. `atWarLately`
     * asks whether anybody has been shooting, which is what a market would
     * actually know.
     */
    fighting: boolean;
    truce: boolean;
  }[];
}

/** Whether this unit could ask here, and why not. */
export function canAsk(state: GameState, unit: Unit, city: City): { ok: boolean; reason?: string } {
  if (!GOSSIP.enabled || !SPY.enabled || !unitType(unit.type).spy) {
    return { ok: false, reason: 'Only a spy knows who to ask.' };
  }
  if (!hasFlag(state.players[unit.owner], 'gossip')) {
    return { ok: false, reason: 'Nobody here has thought of simply asking around.' };
  }
  if (city.owner === unit.owner) return { ok: false, reason: 'You may simply ask at home.' };
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  if (!canReach(unit, city)) return { ok: false, reason: 'Too far away to overhear anything.' };
  return { ok: true };
}

/**
 * Spend the turn listening, and come back with what they think of everybody.
 *
 * **No roll.** Every other rung is a gamble; this is not, and deliberately.
 * You are not doing anything to anybody -- you are standing in a market asking
 * who people are cross with, which is a thing one may simply find out. What it
 * costs is the day and the risk of having been seen hanging about, which is
 * priced on the button like every other order.
 *
 * It is also why this rung tells you about *third parties*: a thing you could
 * reliably learn about the side in front of you would make the city report
 * pointless, and a thing nobody will reliably tell you is not worth a turn.
 */
export function askAround(state: GameState, unit: Unit, city: City): StandingReading | null {
  if (!canAsk(state, unit, city).ok) return null;
  SPY_TRACE.asked++;
  unit.moves = 0;
  unit.order = 'none';

  const about = city.owner;
  const rows = contenders(state)
    .filter((p) => p.id !== about)
    // Only sides this town has actually met. A town cannot tell you its
    // opinion of somebody it has never heard of, and a row of zeroes for a
    // stranger would read as indifference rather than ignorance.
    .filter((p) => peek(state, about, p.id) !== undefined)
    .map((p) => ({
      other: p.id,
      mood: moodName(state, about, p.id),
      standing: standing(state, about, p.id),
      fighting: atWarLately(state, about, p.id),
      truce: atPeace(state, about, p.id),
    }));

  remember(state, unit.owner, about, rows);
  log(
    state,
    `Our agent at ${city.name} spent the day listening.`,
    'good',
    unit.owner,
    undefined,
    [city.x, city.y],
  );
  return { about, rows };
}

/** File it, so the empire can act on it after the agent has walked away. */
function remember(
  state: GameState,
  viewerId: number,
  about: number,
  rows: StandingReading['rows'],
): void {
  const side = state.players[viewerId];
  if (!side) return;
  const standings: Record<number, number> = {};
  for (const r of rows) standings[r.other] = r.standing;
  (side.gossip ??= {})[about] = {
    turn: state.turn,
    atWarWith: rows.filter((r) => r.fighting).map((r) => r.other),
    standings,
  };
}

/** What this side last heard about that one, if it is still worth acting on. */
export function lastGossip(
  state: GameState,
  viewerId: number,
  about: number,
): { turn: number; atWarWith: number[]; standings: Record<number, number> } | null {
  if (!GOSSIP.enabled) return null;
  const filed = state.players[viewerId]?.gossip?.[about];
  if (!filed) return null;
  return state.turn - filed.turn <= GOSSIP.remembers ? filed : null;
}

/**
 * Whether we have *heard* that this side is busy fighting somebody else.
 *
 * **Heard, not known.** The whole point of the rung is that this is something
 * an empire has to find out: reading it off the live relations would be the AI
 * seeing through the fog, and would make the agent that went and asked
 * pointless. Somebody else's war that nobody has reported is a war we are not
 * entitled to take advantage of.
 */
export function heardIsDistracted(state: GameState, viewerId: number, about: number): boolean {
  const filed = lastGossip(state, viewerId, about);
  if (!filed) return false;
  return filed.atWarWith.some((other) => other !== viewerId);
}
