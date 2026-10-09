import { talks } from '../model/factions';
import type { GameState } from '../model/types';
import { idx } from '../engine/grid';
import { log } from './gamestate';
import {
  STANDING,
  adjustStanding,
  between,
  noteClash,
  pairKey,
  peek,
} from './diplomacy';

/**
 * Section 135 slice 3: meeting somebody.
 *
 * Jeremy, on finding a third side on the board: *"default is 'war' right now
 * but instead I think we should hear from them, which they can default to war
 * or aggression if they want (which they might)."*
 *
 * So the rule is not that war stops being the default. It is that **war stops
 * being silent**. A side you have never spoken to walks over the hill, and
 * before slice 3 the only way you found out what it thought of you was that
 * something of yours died. Now it says one thing, once, and the thing it says
 * is chosen from four by two numbers that already existed.
 *
 * Three facts come out of a meeting, and all three are cheap:
 *
 * - **A record that it happened**, per pair, which is the first time this game
 *   has been able to distinguish "at war with" from "has not met".
 * - **A reveal, both ways.** Whoever walks into whom, both sides learn where
 *   the other's nearest town is. Jeremy: *"vice versa so it's fair to both
 *   sides"* -- and it makes scouting a thing you do *to* somebody rather than
 *   a thing you get away with.
 * - **An opening**, which moves `standing` and is said in the log.
 *
 * **The reveal is the half that moves the game**, and it is worth being plain
 * about why: `nearestEnemyTarget` will not consider a tile the AI has not
 * explored, so an empire that has never scouted its way to a rival's land has
 * literally nothing to march at. Handing both sides a town on first sight
 * gives the war somewhere to go. That is a balance change, it is behind
 * `CONTACT.enabled`, and it is measured against off rather than argued about.
 */
export const CONTACT = {
  /** The switch, for sweeps. Off is the game before anybody said hello. */
  enabled: true,
  /**
   * How far around the other side's nearest town the meeting reveals, in tiles.
   *
   * Written into `explored` and never into `visible`: you learn the shape of
   * the place, not what is standing in it this morning. A permanent fact about
   * the map, which is what "we know where they live" means.
   */
  revealRadius: 2,
  /**
   * Towns this close to each other at first sight means the two sides are
   * already in each other's way, and the meeting starts worse for it.
   */
  crowded: 8,
  /** What being that crowded is worth. */
  crowdedCost: -8,
  /** What somebody already running for an ending is worth, to either side. */
  endingCost: -10,
  /** Being half again the other side's strength, in cities. What it is worth. */
  strongerCost: -6,
  /**
   * Meeting the Hivekin, before anybody has said anything.
   *
   * Not malice and not a grudge: they are *alien*, and a hole opening in the
   * ground is not a diplomatic overture. Jeremy: "alien to orcs/humans, not
   * silent". They still speak -- see `OPENINGS.statement` -- and what they say
   * does not help.
   */
  alienCost: -10,
  /**
   * Off. When set, every meeting is appended to `MEETINGS` with how much the
   * reveal actually told each side.
   *
   * Here because slice 3's sweep came back flat on every column the reveal was
   * supposed to move -- fights, captures, turns, conquest endings -- and a
   * lever that measures as nothing is either a lever that does nothing or a
   * lever that is not reaching the thing it was aimed at. The one honest way
   * to tell those apart is to count how many tiles a meeting *newly* explores,
   * which nothing else in the game records.
   */
  trace: false,
};

/** One meeting, recorded only while `CONTACT.trace` is on. */
export interface Meeting {
  turn: number;
  a: number;
  b: number;
  /** Tiles each side learned that it did not already know, by player id. */
  fresh: Record<number, number>;
}

/** Meetings seen since this was last emptied. Only written while tracing. */
export const MEETINGS: Meeting[] = [];

/** What each of the four openings is worth to the pair that just met. */
export const OPENINGS = {
  /** A greeting. The Kingdom's first instinct, and the Horde's last. */
  greeting: 6,
  /** A warning about a border. Civil, and not friendly. */
  border: 0,
  /** A demand for tribute. */
  tribute: -6,
  /**
   * A declaration.
   *
   * **This is the one that makes war announced rather than assumed.** It also
   * starts one, in the only sense this game has of starting one: `noteClash`
   * puts the pair inside `warMemory`, so `moodName` says War from the moment it
   * is said rather than from the first casualty.
   */
  declaration: -20,
  /**
   * The Hive, which does not open a position because it does not hold one.
   *
   * Same weight as a border warning: what you get is the fact of them. The
   * Voice says it in words, because mimicking humanoid emotion at something
   * that has none is the whole of that advisor's job.
   */
  statement: 0,
} as const;

export type Opening = keyof typeof OPENINGS;

/** Marks the log entry that says two sides have just laid eyes on each other. */
export const MET = 'first-contact';

/** Whether these two have ever laid eyes on each other. */
export function haveMet(state: GameState, a: number, b: number): boolean {
  return peek(state, a, b)?.met !== undefined;
}

/** The turn they met, or nothing if they have not. */
export function metOn(state: GameState, a: number, b: number): number | undefined {
  return peek(state, a, b)?.met;
}

/**
 * What one of them said when they met, or nothing if that side said nothing.
 *
 * **Asked per speaker, which is the only honest way to ask it.** An earlier
 * version kept one opening for the pair -- the harder of the two -- and the
 * dialog announcing a meeting read it as what the *other* side had said. A
 * player whose own Horde declared war got a title saying "They Declare War"
 * over the Kingdom's envoy politely asking for tribute.
 */
export function openingBy(
  state: GameState,
  a: number,
  b: number,
  speaker: number,
): Opening | undefined {
  return peek(state, a, b)?.openings?.[speaker] as Opening | undefined;
}

/**
 * The harder of what the two of them said, for anything that wants one word
 * for the pair. Nothing that names a speaker should use this.
 */
export function pairOpening(state: GameState, a: number, b: number): Opening | undefined {
  const said = peek(state, a, b)?.openings;
  if (!said) return undefined;
  return Object.values(said).reduce<Opening | undefined>(
    (worst, o) =>
      worst === undefined || OPENINGS[o as Opening] < OPENINGS[worst] ? (o as Opening) : worst,
    undefined,
  );
}

/** Everybody this side has met, excluding itself and the wilds. */
export function metSides(state: GameState, playerId: number): number[] {
  return state.players
    .filter((p) => p.id !== playerId && !p.barbarian && haveMet(state, playerId, p.id))
    .map((p) => p.id);
}

/** Two sides that can meet at all: not the wilds, not dead, not the same one. */
function meetable(state: GameState, a: number, b: number): boolean {
  const pa = state.players[a];
  const pb = state.players[b];
  if (!pa || !pb || a === b) return false;
  return !pa.barbarian && !pb.barbarian && pa.alive && pb.alive;
}

/** The closest pair of towns these two hold, in tiles, or Infinity. */
function townsApart(state: GameState, a: number, b: number): number {
  let best = Infinity;
  for (const mine of state.cities) {
    if (mine.owner !== a) continue;
    for (const theirs of state.cities) {
      if (theirs.owner !== b) continue;
      const d = Math.max(Math.abs(mine.x - theirs.x), Math.abs(mine.y - theirs.y));
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Where a pair starts, before either of them says a word.
 *
 * Off three facts a player could have worked out by looking at the map: are we
 * already in each other's way, is either of us visibly racing to end the game,
 * and is one of us plainly the bigger. Nothing here is a personality -- two
 * sides meeting in an empty corner of a quiet world start at nothing, whoever
 * they are, and the Hive is the one exception because the Hive is not a side so
 * much as a development.
 */
export function startingStanding(state: GameState, a: number, b: number): number {
  let n = 0;
  if (townsApart(state, a, b) <= CONTACT.crowded) n += CONTACT.crowdedCost;
  for (const id of [a, b]) {
    if (state.players[id]?.endingBegunAt !== undefined) {
      n += CONTACT.endingCost;
      break;
    }
  }
  const mine = state.cities.filter((c) => c.owner === a).length;
  const theirs = state.cities.filter((c) => c.owner === b).length;
  const big = Math.max(mine, theirs);
  const small = Math.min(mine, theirs);
  if (big >= 2 && big >= small * 1.5) n += CONTACT.strongerCost;
  for (const id of [a, b]) {
    if (!talks(state.players[id]?.faction ?? 'orc')) {
      n += CONTACT.alienCost;
      break;
    }
  }
  return Math.max(STANDING.worst, Math.min(STANDING.best, n));
}

/**
 * What this side opens with, given where the pair already stands.
 *
 * One number and one lean, which is the whole of it: a side that already has
 * reason to be wary opens harder, and the Horde opens harder than the Kingdom
 * at the same reading. No tree, because Jeremy asked for none -- *"We don't
 * need extensive conversation trees here or anything, just some simple
 * logic"*.
 *
 * The Hive is not on this ladder at all. It has no position to open with.
 */
export function openingFor(state: GameState, speaker: number, other: number): Opening {
  const p = state.players[speaker];
  if (!p || !talks(p.faction)) return 'statement';
  // The same lean the table already uses, so a side is not warm here and cold
  // there. Negative leans toward the hard end, which is the Horde.
  const lean = LEAN[p.faction] ?? 0;
  const read = startingStanding(state, speaker, other) + lean;
  if (read <= -22) return 'declaration';
  if (read <= -12) return 'tribute';
  if (read <= -2) return 'border';
  return 'greeting';
}

/**
 * Added to the reading before the opening is chosen, by side.
 *
 * Deliberately the same shape and sign as `DIPLOMACY_AI.lean`, and
 * deliberately *not* imported from it: that one is in points of wanting peace
 * and this one is in points of standing, and a shared constant in two units is
 * a constant that will eventually be rescaled for one of them and quietly
 * break the other. The Horde leans to the last two openings and the Kingdom to
 * the first two, which is the lean the plan asked for.
 */
const LEAN: Record<string, number> = { orc: -8, human: 8 };

/** What a side's envoy actually says, by opening. */
export function saidOn(opening: Opening, speaker: string, faction: string): string {
  switch (opening) {
    case 'greeting':
      return faction === 'human'
        ? `${speaker} send an envoy, a gift basket, and a sealed letter expressing cautious goodwill.`
        : `${speaker} send word that you seem fine, for now, and that they have not decided anything.`;
    case 'border':
      return faction === 'human'
        ? `${speaker} send a surveyor to explain, politely and at length, where your land stops.`
        : `${speaker} send word that this is their hill and you are standing near it.`;
    case 'tribute':
      return faction === 'human'
        ? `${speaker} send an itemised invoice for the privilege of their continued patience.`
        : `${speaker} send word that you will be paying them, and that the amount is "lots".`;
    case 'declaration':
      return faction === 'human'
        ? `${speaker} declare war, formally, in writing, with a copy kept for the archive.`
        : `${speaker} declare war. The messenger was already running when he started shouting.`;
    case 'statement':
      return `${speaker} say nothing you would call a greeting. The Voice calls it "a warm welcome".`;
  }
}

/** The headline for the pair, for the modal and the log. */
export function openingTitle(opening: Opening): string {
  switch (opening) {
    case 'greeting':
      return 'They Seem Pleased';
    case 'border':
      return 'They Mention the Border';
    case 'tribute':
      return 'They Would Like Paying';
    case 'declaration':
      return 'They Declare War';
    case 'statement':
      return 'Something Has Come Up';
  }
}

/**
 * Both sides learn where the other's nearest town is.
 *
 * `explored` and not `visible`, so it is map memory rather than live sight --
 * and written for the pair in both directions, which is the half of Jeremy's
 * answer that keeps it fair.
 */
function revealEachOther(state: GameState, a: number, b: number): void {
  const fresh: Record<number, number> = {};
  const show = (viewer: number, owner: number) => {
    const p = state.players[viewer];
    if (!p) return;
    fresh[viewer] = 0;
    const theirs = state.cities.filter((c) => c.owner === owner);
    if (theirs.length === 0) return;
    const nearest = theirs.reduce((best, c) => {
      const far = (t: { x: number; y: number }) =>
        state.cities
          .filter((m) => m.owner === viewer)
          .reduce(
            (d, m) => Math.min(d, Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y))),
            Infinity,
          );
      return far(c) < far(best) ? c : best;
    });
    const r = CONTACT.revealRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = nearest.x + dx;
        const y = nearest.y + dy;
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        const i = idx(x, y, state.width);
        if (!p.explored[i]) fresh[viewer]++;
        p.explored[i] = 1;
      }
    }
  };
  show(a, b);
  show(b, a);
  if (CONTACT.trace) MEETINGS.push({ turn: state.turn, a, b, fresh });
}

/**
 * Write the meeting down, reveal both ways, let whoever has something to say
 * say it, and move the number.
 *
 * Idempotent on `met`: a pair can be sighted from six directions on the same
 * turn and only meets once.
 */
export function noteMeeting(state: GameState, a: number, b: number): boolean {
  if (!CONTACT.enabled || !meetable(state, a, b) || haveMet(state, a, b)) return false;
  const pair = between(state, a, b);
  pair.met = state.turn;

  // Before the openings, so a declaration lands on top of the standing the
  // board already justified rather than replacing it.
  adjustStanding(state, a, b, startingStanding(state, a, b) - (pair.standing ?? 0));
  revealEachOther(state, a, b);

  const names = [state.players[a].name, state.players[b].name];
  for (const id of [a, b]) {
    log(
      state,
      `${names[0]} and ${names[1]} have met.`,
      'info',
      id,
      undefined,
      undefined,
      undefined,
      MET,
    );
  }

  // Both sides speak, and each hears the other. The plan had only the side
  // *being met* say something, which needs the game to know who walked into
  // whom -- and that is a fact a sighting does not carry: two units can walk
  // into each other on the same turn, and a side can be met by a town it did
  // not move. Both speaking is simpler, symmetric, and fair the way the reveal
  // is. A human side says nothing, having no personality to say it with.
  for (const [speaker, listener] of [
    [a, b],
    [b, a],
  ]) {
    const p = state.players[speaker];
    if (p.controller !== 'ai') continue;
    const opening = openingFor(state, speaker, listener);
    (pair.openings ??= {})[speaker] = opening;
    adjustStanding(state, a, b, OPENINGS[opening]);
    // Announced rather than assumed: a declaration is a war from the word, not
    // from the first casualty.
    if (opening === 'declaration') noteClash(state, a, b);
    const said = saidOn(opening, p.name, p.faction);
    for (const id of [a, b]) {
      log(state, said, opening === 'greeting' ? 'good' : 'bad', id, undefined, undefined, speaker, MET);
    }
  }
  return true;
}

/**
 * Anybody this player can now see who they have never seen before.
 *
 * Asked of the map as it is, the way `reportSightings` is: a sighting is a fact
 * about what is visible right now, so it has to be asked after visibility is
 * recomputed and not before.
 *
 * **One-sided detection, mutual recording.** Only the viewer's `visible` array
 * is fresh -- the other side's was computed on their own turn -- so asking
 * "can either of them see the other" would be asking one true question and one
 * stale one. Seeing somebody is enough, and the meeting is then a fact about
 * the pair.
 */
export function checkContacts(state: GameState, viewerId: number): void {
  if (!CONTACT.enabled) return;
  const viewer = state.players[viewerId];
  if (!viewer || viewer.barbarian || !viewer.alive) return;
  const seen = new Set<number>();
  for (const u of state.units) {
    if (u.owner === viewerId) continue;
    if (viewer.visible[idx(u.x, u.y, state.width)]) seen.add(u.owner);
  }
  for (const c of state.cities) {
    if (c.owner === viewerId) continue;
    if (viewer.visible[idx(c.x, c.y, state.width)]) seen.add(c.owner);
  }
  for (const id of seen) {
    if (!meetable(state, viewerId, id) || haveMet(state, viewerId, id)) continue;
    noteMeeting(state, viewerId, id);
  }
}

/**
 * Every pair this player has met, with the meeting still on record.
 *
 * Exported for the Talks screen and for the tests; `pairKey` is re-exported
 * through here so a caller reading meetings does not have to reach into
 * `sim/diplomacy` for the spelling of a pair.
 */
export { pairKey };
