import { BUILDINGS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
import type { City, GameState } from '../model/types';
import { contenders, log, playerCities } from './gamestate';
import { FOLLIES, isFolly } from './follyEffects';

/**
 * Section 111: follies, Jeremy's wonders. Twelve buildings there is only one of --
 * four shared, four the Horde's, four the Kingdom's.
 *
 * - **A faction folly** stands once per empire.
 * - **A shared folly** stands once in the whole game, and both empires may be
 *   building it at once. Whoever finishes first has it; the other side's shields
 *   are not lost but go back into the box of the city that was building it.
 * - Shields put into a folly are banked with the empire, as section 110's works
 *   are, so switching away or rioting costs nothing (`bankWork` in `endings.ts`).
 * - None is bought with gold, sold by bankruptcy, or destroyed by sacking.
 * - Taken with its city, a shared folly works for its new owner. A faction folly
 *   is torn down, and its builder may raise it again.
 * - Everybody is told when one is finished.
 *
 * What each one does lives on its `BuildingDef` and is read in `follyEffects.ts`.
 */

/** Whether this city may be offered this folly. Not a folly: always yes. */
export function follyOffered(state: GameState, city: City, b: BuildingDef): boolean {
  if (!isFolly(b)) return true;
  if (!FOLLIES.enabled) return false;
  const where = b.folly === 'world' ? state.cities : playerCities(state, city.owner);
  if (where.some((c) => c.buildings.includes(b.id))) return false;
  // One city at a time within an empire. A shared one may be under way in both.
  return !playerCities(state, city.owner).some(
    (c) => c.id !== city.id && c.producing.kind === 'building' && c.producing.id === b.id,
  );
}

/**
 * Tell everybody, with a line for the builder and a line for everyone else. The
 * builder's line carries the fanfare; nobody else is in a mood to hear one.
 */
function tellEverybody(state: GameState, builder: number, ours: string, theirs: string, city: City): void {
  for (const p of contenders(state)) {
    const mine = p.id === builder;
    log(state, mine ? ours : theirs, mine ? 'good' : 'info', p.id, mine ? 'folly' : undefined, [city.x, city.y]);
  }
}

/**
 * The moment a folly is finished. Called from the city's production.
 *
 * For a shared one, this is also the end of the race: every other empire still
 * building it stops, and what it had banked goes back into the box of the city
 * that was building it -- or its oldest city, if nobody was building it right now.
 */
export function follyFinished(state: GameState, city: City, built: BuildingDef): void {
  if (!isFolly(built)) return;
  const owner = state.players[city.owner];

  if (built.folly === 'faction') {
    tellEverybody(
      state,
      city.owner,
      `${built.name} is finished in ${city.name}.`,
      `${owner.name} has finished ${built.name} in ${city.name}.`,
      city,
    );
    return;
  }

  tellEverybody(
    state,
    city.owner,
    `${built.name} is finished in ${city.name}. There is only one, and it is ours.`,
    `${owner.name} has finished ${built.name} in ${city.name}. There is only one.`,
    city,
  );

  for (const p of contenders(state)) {
    if (p.id === city.owner) continue;
    const mine = playerCities(state, p.id);
    const building = mine.filter((c) => c.producing.kind === 'building' && c.producing.id === built.id);
    const banked = p.worksBanked?.[built.id] ?? 0;
    if (banked === 0 && building.length === 0) continue;

    const home = building[0] ?? [...mine].sort((a, b) => a.foundedTurn - b.foundedTurn)[0];
    for (const c of building) c.producing = { kind: 'coin' };
    if (p.worksBanked) {
      delete p.worksBanked[built.id];
      if (Object.keys(p.worksBanked).length === 0) delete p.worksBanked;
    }
    if (!home) continue;
    home.shields += banked;
    log(
      state,
      banked > 0
        ? `${owner.name} finished ${built.name} first. The ${banked} shields put into ours go back into ${home.name}'s stores.`
        : `${owner.name} finished ${built.name} first. ${home.name} stops work on it.`,
      'bad',
      p.id,
      undefined,
      [home.x, home.y],
    );
  }
}

/**
 * Tear down a faction folly standing in a city its builder no longer holds.
 *
 * Run every turn from `endPlayerTurn`, beside section 110's `checkEndings`. A
 * shared folly is left alone: it is nobody's in particular, and it works for
 * whoever holds the city.
 */
export function checkFollies(state: GameState): void {
  for (const city of state.cities) {
    const owner = state.players[city.owner];
    if (!owner) continue;
    for (const id of [...city.buildings]) {
      const b = BUILDINGS[id];
      if (b?.folly !== 'faction' || b.faction === 'both' || b.faction === owner.faction) continue;
      city.buildings = city.buildings.filter((x) => x !== id);
      for (const q of contenders(state)) {
        log(
          state,
          `${b.name} in ${city.name} is torn down by its new owners, who were not about to keep ` +
            "somebody else's.",
          q.id === city.owner ? 'good' : 'bad',
          q.id,
          undefined,
          [city.x, city.y],
        );
      }
    }
  }
}
