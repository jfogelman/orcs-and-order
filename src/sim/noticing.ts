import { distance } from '../engine/grid';
import { unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { isCelebrating, garrisonOf } from './city';
import { hostile } from './diplomacy';
import { isDisguised, uncover } from './disguise';
import { log, withRng } from './gamestate';
import { UNSEEN, UNSEEN_TRACE, hiddenFrom, townNotice } from './unseen';

/**
 * Section 138: what a town notices on its own.
 *
 * **The defence for a side that owns no agents at all**, and until this there
 * was not one. Section 136 shipped searching as the counter to a disguise,
 * which is a fine answer for somebody who has built a spy and a terrible one
 * for somebody who has not -- and the side least likely to have built a spy is
 * the side least able to cope with somebody else's.
 *
 * Jeremy settled the shape of it twice. On whether that side is simply
 * helpless: *"You can potentially notice an extra unit you own."* And on what
 * makes a town good at it: *"More joyful cities are more likely to notice
 * spies, including ones with barracks."*
 *
 * So it costs no new building, and it is paid for in a currency the game
 * already has and does not otherwise reward: a town that is **content, fed and
 * growing** is one where everybody knows everybody and the stranger stands
 * out. A rioting one has other things on its mind and is at the floor.
 *
 * ## Why this is its own module
 *
 * `unseen.ts` is deliberately a leaf -- `burrow.ts` asks it a question and
 * half the simulation goes through `burrow.ts`. This needs `isCelebrating` out
 * of `city.ts`, which would have turned that leaf into a cycle. Same split as
 * `unrest.ts` and `incite.ts` in slice 8, and for the same reason.
 */

/**
 * Every concealed agent of somebody else's standing on or near this side's
 * towns, and the chance each town has of noticing one this turn.
 *
 * Runs once at the start of a side's own turn. Both tiers are in scope: a
 * disguised agent is an extra soldier nobody remembers building, and a hidden
 * one is a nagging sense that the market was busier than it should have been.
 */
export function noticeStrangers(state: GameState, playerId: number): void {
  if (!UNSEEN.enabled) return;
  const side = state.players[playerId];
  if (!side?.alive || side.barbarian) return;

  // Gathered once rather than per town. A map with three sides and sixty towns
  // asks this every turn, and the units list is the long one.
  const strangers = state.units.filter(
    (u) =>
      u.owner !== playerId &&
      unitType(u.type).spy &&
      !u.uncoveredBy?.includes(playerId) &&
      (hiddenFrom(u, playerId) || isDisguised(u)) &&
      hostile(state, playerId, u.owner),
  );
  if (strangers.length === 0) return;

  // Section 138: how much of the game a hidden agent actually spends standing
  // where it is useful. The question the probe exists to answer -- an agent
  // that never leaves its own fields is fifty-five shields of nothing, and
  // that is exactly the failure sections 125 and 136 both shipped once.
  for (const u of strangers) {
    if (!hiddenFrom(u, playerId)) continue;
    if (state.cities.some((c) => c.owner === playerId && distance(u.x, u.y, c.x, c.y) <= UNSEEN.noticeReach)) {
      UNSEEN_TRACE.abroad++;
      break;
    }
  }

  for (const city of state.cities) {
    if (city.owner !== playerId) continue;
    const near = strangers.filter(
      (u) => distance(u.x, u.y, city.x, city.y) <= UNSEEN.noticeReach,
    );
    if (near.length === 0) continue;

    const odds = townNotice({
      celebrating: isCelebrating(state, city),
      disorder: city.disorder,
      guards: garrisonOf(state, city).length,
    });
    UNSEEN_TRACE.townRolls++;

    for (const stranger of near) {
      // **One roll per stranger, not one per town.** Two agents at the same
      // gate are two separate questions, the way a sweep is -- noticing one
      // tells the town nothing whatsoever about the other, and a town that
      // caught both at once would make a pair of agents strictly worse than
      // one, which is backwards.
      if (!withRng(state, (rng) => rng.chance(odds))) continue;
      const wasHidden = hiddenFrom(stranger, playerId);
      if (!uncover(stranger, playerId)) continue;
      if (wasHidden) UNSEEN_TRACE.foundByTown++;
      else UNSEEN_TRACE.disguisedFoundByTown++;
      announce(state, playerId, city.name, stranger, wasHidden);
    }
  }
}

/**
 * Tell both sides, and tell them different things.
 *
 * The town gets a name and a place. The agent's owner is told it has been
 * found and *not* told how, because from where they are standing there is no
 * difference between a sharp-eyed baker and a counter-agent -- and the
 * decision they have to make, which is whether to walk it home, is the same
 * either way.
 */
function announce(
  state: GameState,
  finderId: number,
  where: string,
  stranger: Unit,
  wasHidden: boolean,
): void {
  log(
    state,
    wasHidden
      ? `Somebody in ${where} is quite sure there is a stranger about, and this time they are right.`
      : `Somebody in ${where} has counted the garrison twice and got a different answer.`,
    'good',
    finderId,
    undefined,
    [stranger.x, stranger.y],
  );
  log(
    state,
    `${unitType(stranger.type).name} has been noticed near ${where}. They know.`,
    'bad',
    stranger.owner,
    undefined,
    [stranger.x, stranger.y],
  );
}
