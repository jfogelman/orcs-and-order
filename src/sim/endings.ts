import { BUILDINGS, BUILDING_IDS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
import type { City, GameState, ProductionItem } from '../model/types';
import { contenders, log, playerCities } from './gamestate';

/**
 * Section 110: the two joke endings, and the first way to win a game on purpose
 * that is neither conquest nor outlasting the clock.
 *
 * Built the way a Civilization tech victory is built. One advance at the far end
 * of each tree unlocks **three works**: two that may stand in any city, and a
 * final one -- the Demonic Portal or the Mysterious Object -- that stands only in
 * a city holding one of the others, once both of them do. Each is one of a kind per empire,
 * none can be bought with gold, and:
 *
 * - **everybody is told the moment work begins**, not when it is finished;
 * - everybody is told as each work is finished, so progress can be watched;
 * - when the final work stands, its builder wins if it still holds that city
 *   `portalTurns` or `objectTurns` turns later;
 * - taking a city tears down whatever works are standing in it.
 *
 * The first version was a single capital build, and the Object was silent. It
 * ended seventeen games in thirty-one. Announcing it on completion changed almost
 * nothing -- sixteen -- because the war could not reach a capital in ten turns and
 * whoever finished first won. Three works, known from the start, turn a research
 * race into a production race the other side can watch and interrupt.
 */
export const ALT_VICTORY = {
  /**
   * Whether the endings exist at all. When off, the two advances are not
   * researchable and the works are not offered, so an arm with this off is the
   * game from before section 110 rather than a game with a dead branch in it.
   */
  enabled: true,
  /** Turns the Portal must stay open, in the Horde's hands, before it counts. */
  portalTurns: 15,
  /** Turns between the Object standing and somebody pressing the button. */
  objectTurns: 15,
};

export type EndingKind = 'portal' | 'object';

/** Whether a building is one of the works towards an ending. */
export function isEndingPiece(b: BuildingDef | undefined): boolean {
  return !!(b?.victory || b?.endingPart);
}

/** Which ending a work belongs to. */
export function endingKindOf(b: BuildingDef): EndingKind | null {
  return b.victory ?? b.endingPart ?? null;
}

/** Every work towards one ending, the lesser ones first and the final one last. */
export function endingWorks(kind: EndingKind): BuildingDef[] {
  const works = BUILDING_IDS.map((id) => BUILDINGS[id]).filter((b) => endingKindOf(b) === kind);
  return [...works.filter((b) => !b.victory), ...works.filter((b) => b.victory)];
}

/** The final work standing in a city, if there is one. */
export function endingIn(city: City): BuildingDef | null {
  for (const id of city.buildings) {
    const b = BUILDINGS[id];
    if (b?.victory) return b;
  }
  return null;
}

/** Whether a city holds any work towards an ending. */
export function hasEndingPiece(city: City): boolean {
  return city.buildings.some((id) => isEndingPiece(BUILDINGS[id]));
}

/** Whether this empire has its final work standing somewhere. */
export function endingBuilt(state: GameState, playerId: number): boolean {
  return playerCities(state, playerId).some((c) => endingIn(c) !== null);
}

/** Whether a work stands in any of this empire's cities. */
export function workStanding(state: GameState, playerId: number, id: string): boolean {
  return playerCities(state, playerId).some((c) => c.buildings.includes(id));
}

/**
 * Whether this city may be offered this work.
 *
 * Everything else about a building is decided by `buildOptions`; this is only
 * what makes a work a work. One of a kind: not if it stands anywhere in the
 * empire, and not if another city is already building it. The final work only in
 * a city that holds one of the other two, and only once both of them stand.
 *
 * **Not the capital.** It was, and the capital is the one city an empire cannot
 * choose: a Horde capital that rioted Placated for forty-eight turns (seed 42) with
 * both lesser works standing and a thousand gold in the treasury, and the Portal,
 * which nowhere else could build, waited. A city that already holds a work is still
 * somewhere everybody has been told about.
 */
export function endingOffered(state: GameState, city: City, b: BuildingDef): boolean {
  if (!isEndingPiece(b)) return true;
  if (!ALT_VICTORY.enabled) return false;
  const mine = playerCities(state, city.owner);
  if (mine.some((c) => c.buildings.includes(b.id))) return false;
  if (mine.some((c) => c.id !== city.id && c.producing.kind === 'building' && c.producing.id === b.id)) {
    return false;
  }
  if (!b.victory) return true;
  const lesser = endingWorks(b.victory).filter((w) => !w.victory);
  return (
    lesser.some((w) => city.buildings.includes(w.id)) &&
    lesser.every((w) => workStanding(state, city.owner, w.id))
  );
}

/**
 * Shields this city's empire has already put into a work -- the one it is building
 * unless another is named -- or 0 for anything that is not a work.
 *
 * A work's shields are banked with the empire, not left in the city's box. Left in
 * the box, a Horde city that rioted halfway through switched to a temple or a
 * unit, the half-built work paid for it, and the work began again from nothing --
 * so the Horde learned its advance in 22 games of 31 and finished the works in
 * none. Banked, every shield put in stays put in, the way Civilization keeps a
 * wonder's progress when a city switches between wonders.
 */
export function workBanked(state: GameState, city: City, item: ProductionItem = city.producing): number {
  // Section 111's follies bank the same way.
  if (item.kind !== 'building' || !(isEndingPiece(BUILDINGS[item.id]) || BUILDINGS[item.id]?.folly)) return 0;
  return state.players[city.owner]?.worksBanked?.[item.id] ?? 0;
}

/**
 * Move a city's shield box into its empire's bank for the work it is building, and
 * finish the work when the bank covers it. Returns whether it finished; the
 * caller does everything a finished building needs. Anything over the cost goes
 * back in the box.
 */
export function bankWork(state: GameState, city: City, cost: number): boolean {
  const item = city.producing;
  if (item.kind !== 'building') return false;
  const owner = state.players[city.owner];
  const bank = (owner.worksBanked ??= {});
  bank[item.id] = (bank[item.id] ?? 0) + city.shields;
  city.shields = 0;
  if (bank[item.id] < cost) return false;
  city.shields = bank[item.id] - cost;
  delete bank[item.id];
  if (Object.keys(bank).length === 0) delete owner.worksBanked;
  return true;
}

/** An ending counting down, which everybody has been told about. */
export function endingOpen(city: City): boolean {
  return endingIn(city) !== null && city.endingSince !== undefined;
}

/** An open Portal in particular: the one ending with a mark on the map. */
export function portalOpen(city: City): boolean {
  return endingOpen(city) && endingIn(city)?.victory === 'portal';
}

/** Turns left before this city's ending lands, or null if it holds none. */
export function endingTurnsLeft(state: GameState, city: City): number | null {
  const built = endingIn(city);
  if (!built || city.endingSince === undefined) return null;
  const wait = built.victory === 'portal' ? ALT_VICTORY.portalTurns : ALT_VICTORY.objectTurns;
  return Math.max(0, wait - (state.turn - city.endingSince));
}

/** Tell everybody, with a line for the builder and a line for everyone else. */
function tellEverybody(
  state: GameState,
  builder: number,
  ours: string,
  theirs: string,
  at: readonly [number, number] | undefined,
): void {
  for (const p of contenders(state)) {
    const mine = p.id === builder;
    log(state, mine ? ours : theirs, mine ? 'good' : 'bad', p.id, undefined, at);
  }
}

/** The moment a work is finished. Called from the city's production. */
export function pieceFinished(state: GameState, city: City, built: BuildingDef): void {
  const kind = endingKindOf(built);
  if (!kind) return;
  const owner = state.players[city.owner];
  const at = [city.x, city.y] as const;

  if (!built.victory) {
    const works = endingWorks(kind).filter((w) => !w.victory);
    const done = works.filter((w) => workStanding(state, city.owner, w.id)).length;
    const last = kind === 'portal' ? 'the Portal' : 'the Object';
    tellEverybody(
      state,
      city.owner,
      `${built.name} is finished in ${city.name}, ${done} of ${works.length}. ` +
        (done === works.length ? `Either city holding one can begin ${last}.` : 'One more work to go.'),
      `${owner.name} has finished ${built.name} in ${city.name}, ${done} of ${works.length} ` +
        `towards ${last}.`,
      at,
    );
    return;
  }

  city.endingSince = state.turn;
  if (built.victory === 'portal') {
    tellEverybody(
      state,
      city.owner,
      `The Demonic Portal in ${city.name} is open. Hold the city for ${ALT_VICTORY.portalTurns} ` +
        'turns and whatever is on the other side will be very grateful.',
      `${owner.name} has opened a Demonic Portal in ${city.name}. Take the city within ` +
        `${ALT_VICTORY.portalTurns} turns, or meet whatever comes through it.`,
      at,
    );
    return;
  }
  // Told that it exists, and where, and how long. Never told what it does.
  tellEverybody(
    state,
    city.owner,
    `The Mysterious Object is finished in ${city.name}. It has a button. Nobody knows what the ` +
      `button does. In ${ALT_VICTORY.objectTurns} turns somebody is going to find out.`,
    `Something large, grey and featureless has appeared in ${owner.name}'s ${city.name}, with ` +
      `a single button on top. Nobody there will say what it does. Taking the city within ` +
      `${ALT_VICTORY.objectTurns} turns seems wise.`,
    at,
  );
}

/**
 * Announce an ending that has begun, tear down works whose city has fallen, and
 * declare an ending that has landed.
 *
 * Run from `checkElimination`, below the guard for a game being played on, so a
 * game somebody has already won cannot be won again this way.
 *
 * **Only on the builder's own turn.** A final work is finished at the start of its
 * builder's turn; read on the other side's turn as well, it would land before that
 * side had its last move to stop it.
 */
export function checkEndings(state: GameState): void {
  if (state.winner !== null || state.victory !== undefined) return;
  for (const p of contenders(state)) {
    if (!p.alive) continue;
    const cities = playerCities(state, p.id);

    // Begun: told to everybody the first time any work goes into production.
    if (ALT_VICTORY.enabled && p.endingBegunAt === undefined) {
      const starting = cities.find(
        (c) => c.producing.kind === 'building' && isEndingPiece(BUILDINGS[c.producing.id]),
      );
      if (starting) {
        p.endingBegunAt = state.turn;
        if (p.faction === 'orc') {
          tellEverybody(
            state,
            p.id,
            'Work has begun towards a Demonic Portal, and somebody shouted about it, so everybody ' +
              'knows. Two works in any city, then the Portal itself in a city holding one of them.',
            `${p.name} has begun work towards a Demonic Portal. Two lesser works come first, and ` +
              'the Portal will stand in a city holding one of them.',
            [starting.x, starting.y],
          );
        } else {
          tellEverybody(
            state,
            p.id,
            'A committee has begun work towards the Mysterious Object. Everybody has been told it ' +
              'is coming. Nobody has been told what it does.',
            `${p.name} has formed a committee about an object. Two lesser works come first, it will ` +
              'stand in a city holding one of them, and nobody there will say what it does.',
            [starting.x, starting.y],
          );
        }
      }
    }

    for (const city of cities) {
      // Taken. Whoever holds the city now did not build the works standing in it.
      for (const id of [...city.buildings]) {
        const work = BUILDINGS[id];
        if (!isEndingPiece(work) || work.faction === 'both' || work.faction === p.faction) continue;
        city.buildings = city.buildings.filter((b) => b !== id);
        if (work.victory) delete city.endingSince;
        const line =
          work.victory === 'portal'
            ? `The Demonic Portal in ${city.name} closes behind its new owners, with a sound like ` +
              'something very large being disappointed.'
            : work.victory === 'object'
              ? `Nobody in ${city.name} can work out what the grey object with the button is for. ` +
                'It is being used to prop a door open.'
              : `${work.name} in ${city.name} is torn down by its new owners, who could not see the point of it.`;
        for (const q of contenders(state)) {
          log(state, line, q.id === p.id ? 'good' : 'bad', q.id, undefined, [city.x, city.y]);
        }
      }

      // A count with nothing left to count for. A capture is handled above and
      // bankruptcy will not sell a work, but a count left running on an empty
      // plinth is a game that can never end the way it says it will -- which is
      // exactly what selling the newest building once did.
      if (city.endingSince !== undefined && !endingIn(city)) {
        delete city.endingSince;
        for (const q of contenders(state)) {
          log(
            state,
            `Whatever was counting down in ${city.name} is gone, and the count with it.`,
            q.id === p.id ? 'bad' : 'good',
            q.id,
            undefined,
            [city.x, city.y],
          );
        }
      }

      const built = endingIn(city);
      if (!built || !ALT_VICTORY.enabled || city.endingSince === undefined) continue;
      if (state.activePlayer !== p.id) continue;
      if ((endingTurnsLeft(state, city) ?? 1) > 0) continue;

      state.winner = p.id;
      state.victory = built.victory;
      log(
        state,
        built.victory === 'portal'
          ? `The Portal in ${city.name} has been open for ${ALT_VICTORY.portalTurns} turns. ` +
              'Something comes through, and the Horde throws it a party.'
          : `Somebody in ${city.name} pressed the button.`,
        'good',
      );
      return;
    }
  }
}
