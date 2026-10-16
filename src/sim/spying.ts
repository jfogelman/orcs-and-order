import { distance } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import type { City, GameState, Unit } from '../model/types';
import { headcount, unitType } from '../model/units';
import { awardXp, XP } from './combat';
import { STANDING, adjustStanding } from './diplomacy';
import { isDisguised, uncover } from './disguise';
import { endingFor, endingWorks, isEndingPiece } from './endings';
import { log, withRng } from './gamestate';
import { seenBy } from './burrow';

/**
 * Section 136 slice 2: what a spy is actually for.
 *
 * Reading a city is the first thing on the ladder and the one that makes the
 * unit worth its thirty shields. Everything about it is information: it takes
 * nothing, breaks nothing, and the side being read is not told it happened
 * unless the spy is *caught*.
 *
 * **Failure and exposure are two different rolls**, which is the shape the
 * whole feature hangs off. A spy that fails has wasted a turn. A spy that is
 * *noticed* has caused a diplomatic incident, and it is the only moment the
 * other side learns whose spy it was -- everything a spy does is anonymous
 * until then. That separation is what lets a promotion make a spy **safe**
 * rather than merely effective, which is the more interesting thing to promote
 * toward.
 */
export const SPY = {
  /** The switch, for sweeps. Off, a spy is a thirty-shield unit that walks. */
  enabled: true,
  /** How far a spy can read from: its own tile, or the one beside it. */
  reach: 1,
  /** Chance of getting a reading at all, at rank 0. */
  reads: 0.75,
  /** Added to that per rank. */
  readsPerRank: 0.07,
  /**
   * Chance that a *failed* reading is noticed, at rank 0.
   *
   * The number a promotion is really buying down. A spy that fails quietly can
   * try again next turn; one that is noticed is uncovered, and the side it was
   * reading now knows whose it was.
   */
  noticed: 0.5,
  /** Taken off that per rank, so rank 3 is noticed one time in five. */
  noticedPerRank: 0.1,
  /**
   * What a reading is worth in experience, and what a quiet failure is worth.
   *
   * **A spy cannot earn experience any other way.** `XP` is awarded for
   * fighting, and a spy never fights -- `attack: 0` sees to that -- so without
   * this the promotion half of the feature does not exist at all. The quiet
   * failure pays something because it learned where not to stand.
   */
  xpRead: XP.survive * 2,
  xpQuietFailure: XP.survive / 2,
  /** What being caught costs between the two sides. */
  caught: STANDING.fight,
  /**
   * A thumb on the scale for every risk on the ladder at once.
   *
   * Nothing moves it today. It is here because the interesting lever on a spy
   * programme is not any one action's odds but *the weather* -- a folly, a
   * building or an advance that makes the whole country harder or easier to
   * work in. One multiplier that everything goes through means such a thing
   * lands in one place rather than in five action tables.
   */
  weather: 1,
  /**
   * The part of being seen that no amount of experience drills away.
   *
   * Scaled by how far up the ladder the action sits, so spying on a town has
   * none of it and turning somebody's soldier has the most.
   *
   * **Without this the top of the ladder collapses.** Exposure is the product
   * of two rolls that *both* improve with rank, so a rank-3 spy came out at
   * under one percent on every action in the table -- turning an enemy unit
   * included -- and the risk words all read "barely any risk" at once. A
   * promotion should make an agent good, not make the act invisible: a
   * sabotaged building is a sabotaged building whoever did it, and somebody
   * whose soldier has changed sides knows that much happened.
   */
  irreducible: 0.03,
  /**
   * How many turns a report is worth acting on before it is only a rumour.
   *
   * The dialog says a reading is good for today, and it is: what it *reports*
   * is a snapshot. This is a different question -- how long an empire goes on
   * planning off the last thing it heard -- and the answer is not one turn, or
   * a spy would be worth nothing to anybody who could not act in the same
   * breath.
   */
  remembers: 12,
  /**
   * Whether the other side builds spies, and how many it wants.
   *
   * **Section 125 is the reason this exists.** The Burrower-caste shipped with
   * no want of its own, `worth()` ranks a unit on strength and price, and a
   * digger is an expensive soldier by those lights -- so the AI built 0.2 a
   * game and a sweep of the mechanic came back with *identical numbers on both
   * arms*, because it was never once on the board. A spy has `attack: 0`. It
   * would have ranked dead last of everything, forever, and the measurement
   * would have said espionage changes nothing.
   */
  ai: true,
  /**
   * How many agents a side keeps.
   *
   * **Two, since the probe.** One is not enough to do both halves of this: an
   * agent abroad reading towns is never at home sweeping, and with one agent
   * the counter-espionage half of the feature measured `0.00 sweeps per game`
   * over twenty-four games -- built, documented, and never once on the board.
   *
   * The second is the home one. See `actSpy`: the side's first agent works
   * abroad and the rest watch their own ground, which is also the division
   * the disguise rules already describe -- wearing your own colours buys
   * nothing abroad and everything at home.
   */
  aiWants: 2,
  /** How near one of our own towns counts as "at home", for the watcher. */
  homeReach: 2,
  /**
   * What a tile of walking is worth against a turn of staleness, when an agent
   * abroad is choosing where to go next.
   *
   * Above one, so a town going stale next door beats an unread one across the
   * world. At one the agent still crossed the map for marginally older news,
   * which is how it came to spend its life walking.
   */
  travelWeight: 1.5,
  /**
   * Chance of seeing through a disguise, between agents of equal rank.
   *
   * Under a half on purpose. A sweep that reliably found everybody would make
   * the disguise half of this feature pointless the turn the advance landed;
   * one that reliably found nobody would make searching a wasted turn. At even
   * rank it is a coin that lands wrong slightly more often than right, and
   * rank is what moves it.
   */
  finds: 0.4,
  /** How much a rank of difference between the two is worth. */
  findPerRank: 0.12,
  /** Nobody is ever impossible to find, and nobody is ever certain to be found. */
  findFloor: 0.1,
  findCap: 0.85,
};

/**
 * What a spy can be told to do, and how exposed each one leaves it.
 *
 * `risk` is **relative to spying on a town, which is 1**. Walking up to a gate
 * and taking an interest is the cheapest thing on the ladder; everything else
 * involves doing something to somebody, and a thing that is done is a thing
 * that can be traced.
 *
 * **The unbuilt ones are listed deliberately.** A risk band means nothing in
 * isolation -- "slight" is only slight next to something that is not -- so the
 * scale has to be calibrated against the whole ladder, or every slice would
 * recalibrate it and the word printed on the button would change meaning under
 * a player who had learned it. They are marked `ready: false` and are not
 * offered anywhere.
 */
export interface SpyAction {
  /** What it is called where it is offered. */
  verb: string;
  /** Exposure relative to spying on a town. */
  risk: number;
  /** Whether it can be ordered yet. */
  ready: boolean;
}

export const SPY_ACTIONS: Record<string, SpyAction> = {
  /**
   * Looking, rather than doing. **The only rung that costs nothing to try.**
   *
   * Everything else on this ladder is something done *to* somebody, and a
   * thing that is done can be traced back. Standing still and paying attention
   * is not: there is nobody to notice you looking. What it costs is the turn,
   * which for a unit that cannot fight is the whole of its day.
   *
   * It is also the only defensive rung, and a counter-espionage move that
   * might itself blow your agent would be one nobody used at home -- which is
   * exactly where it is meant to be used.
   */
  search: { verb: 'Search for spies', risk: 0, ready: true },
  read: { verb: 'Spy on', risk: 1, ready: true },
  /**
   * Asking a town what it thinks of its neighbours.
   *
   * Dearer than watching a town and cheaper than doing anything to one: you
   * are not hiding in a hedge, you are standing in a market talking to people,
   * and people remember a stranger who asked a lot of questions.
   */
  gossip: { verb: 'Ask around in', risk: 1.4, ready: true },
  incite: { verb: 'Foment discontent in', risk: 2.2, ready: false },
  sabotage: { verb: 'Sabotage the works at', risk: 2.8, ready: true },
  turn: { verb: 'Turn', risk: 3.6, ready: false },
  double: { verb: 'Turn their agent in', risk: 4.5, ready: false },
};

/**
 * The chance an action ends with this spy uncovered.
 *
 * **Not the notice roll.** Being noticed is conditional on having failed, so
 * the number a player actually wants is the compound one: a rank-0 spy fails a
 * quarter of the time and is noticed half of those, which is one in eight, not
 * one in two. Quoting the notice roll would have told them the truth about a
 * number they never face.
 */
/**
 * The chance this agent is noticed doing *something*, before the action it is
 * doing is taken into account.
 *
 * Pulled out so the rungs that price themselves off the board -- sabotage
 * scales with what is being wrecked -- multiply the same number everything
 * else does, instead of writing the two rolls out again and drifting from it.
 */
export function bareExposure(unit: Unit): number {
  return (1 - readOdds(unit)) * noticeOdds(unit);
}

export function exposureOdds(unit: Unit, action = 'read'): number {
  const act = SPY_ACTIONS[action];
  if (!act) return 0;
  const bare = bareExposure(unit);
  // Never below nothing: an action milder than reading a town (searching is
  // `risk: 0`) would otherwise be handed a negative floor.
  const floor = Math.max(0, (act.risk - 1) * SPY.irreducible);
  return Math.max(floor, Math.min(0.95, bare * act.risk * SPY.weather));
}

/** The bands a risk is reported in, loosest first. */
export const RISK_BANDS: { under: number; label: string }[] = [
  { under: 0.05, label: 'barely any risk' },
  // A green spy reading a town is exposed one time in eight, and the first cut
  // of this put that a hair the wrong side of the line and called it "fair".
  // The mildest thing on the ladder should read as mild, or the scale has
  // nowhere left to go when the ladder gets longer.
  { under: 0.15, label: 'slight risk' },
  { under: 0.25, label: 'fair risk' },
  { under: 0.45, label: 'real risk' },
  { under: 0.65, label: 'reckless' },
  // Section 136 slice 5 added a rung that can reach here: sabotaging something
  // that would win the game. The ladder needed a word above `reckless` or the
  // most dangerous order available would have read the same as a merely bad
  // one, and the whole point of pricing sabotage off what is being wrecked is
  // that the player can see the difference.
  { under: 1.01, label: 'all but certain' },
];

/**
 * What to call a risk where a player can see it.
 *
 * Words rather than a percentage, and on purpose. A spy programme is a thing
 * you are meant to have a *feeling* about; a number invites arithmetic, and
 * arithmetic on a figure the game could change next patch is a false promise.
 * The bands are read off the real odds, so they cannot drift from the rules.
 */
export function riskBand(unit: Unit, action = 'read'): string {
  const odds = exposureOdds(unit, action);
  // Said plainly when it is actually nothing. "Barely any risk" for an action
  // that carries none is a small lie, and the one rung that is free is worth
  // being able to recognise at a glance.
  if (odds <= 0) return 'no risk';
  return (RISK_BANDS.find((b) => odds < b.under) ?? RISK_BANDS[RISK_BANDS.length - 1]).label;
}

/**
 * A tally of what agents actually did, for probes. Section 136.
 *
 * **Counted here rather than read off the log or the board afterwards.** The
 * first probe asked how many towns were on file at the end of a game and got
 * 0.71, which cannot tell a spy that read one town forty times from one that
 * read forty towns once -- `readings` is keyed by city, so re-reading the same
 * gate every turn files one entry. And the log is a 400-entry window on a
 * 300-turn game, so counting incidents from it is counting the end of the game.
 *
 * Nothing in the game reads this. It is off to one side on purpose.
 */
export const SPY_TRACE = {
  attempts: 0,
  read: 0,
  missed: 0,
  caught: 0,
  /** Sweeps run, and disguises seen through. Slice 4. */
  swept: 0,
  found: 0,
  /** Sabotage: tried, works wrecked, agents taken at them. Slice 5. */
  wrecks: 0,
  wrecked: 0,
  lostAtWorks: 0,
  /** Of those wrecks, the ones against something that would end the game. */
  wreckedEndings: 0,
  /**
   * What the other side's agent abroad actually *did* with each of its turns.
   *
   * Added because two rounds of fixing what I thought was wrong moved the
   * readings from 1.21 a game to 1.42, which is the measurement saying my
   * theory was wrong twice. A zero explains nothing; count the branches.
   */
  turnRead: 0,
  turnWrecked: 0,
  turnWalked: 0,
  turnStuck: 0,
  turnNoTarget: 0,
  turnFresh: 0,
  /**
   * Slice 6: offers made, taken, taken for later, and refused.
   *
   * Counted from the day the rung was built rather than after a measurement
   * came back zero, which is the one thing this session cost most to learn.
   */
  /** Slice 7: times an agent spent the day listening. */
  asked: 0,
  offers: 0,
  offersTaken: 0,
  offersLater: 0,
  offersRefused: 0,
  goldSpentBuying: 0,
};

/** What a reading tells you about a city. */
export interface CityReading {
  city: string;
  size: number;
  /** What it is building, by name, or null for a standing choice. */
  building: string | null;
  /** How many units are standing in it. */
  garrison: number;
  /**
   * How much defence is standing in it, counted the way the attacker counts it.
   *
   * The number with teeth. Everything else in a reading is for the player to
   * read; this is the one an empire can *plan* off, and it is deliberately the
   * same arithmetic `nearestEnemyTarget` does when it can see the gate, so a
   * report and a pair of eyes say the same thing about the same town.
   */
  held: number;
  /** The strongest thing in it, by name, or null for an empty town. */
  strongest: string | null;
  /** Buildings already up, by name. */
  standing: string[];
  /**
   * The thing this side wins with, named, and how far along it is here.
   *
   * **Named rather than called "their ending".** That label told a player
   * nothing: it is a word this game uses about itself, not about anything on
   * the board. The Demonic Portal is a thing you can picture, worry about and
   * march on, which is the entire reason to have sent a spy.
   */
  greatWork: { name: string; begun: boolean; parts: number } | null;
}

/** Whether this unit is close enough to a town to do anything to it. */
export function canReach(unit: Unit, city: City): boolean {
  return distance(unit.x, unit.y, city.x, city.y) <= SPY.reach;
}

/** Whether this unit could read this city, and why not. */
export function canRead(unit: Unit, city: City): { ok: boolean; reason?: string } {
  if (!SPY.enabled || !unitType(unit.type).spy) {
    return { ok: false, reason: 'Only a spy reads a town.' };
  }
  if (city.owner === unit.owner) {
    return { ok: false, reason: 'You may simply look at your own towns.' };
  }
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  if (distance(unit.x, unit.y, city.x, city.y) > SPY.reach) {
    return { ok: false, reason: 'Too far away to see anything worth reporting.' };
  }
  return { ok: true };
}

/** The chance this unit gets a reading, by rank. */
export function readOdds(unit: Unit): number {
  return Math.min(0.98, SPY.reads + unit.rank * SPY.readsPerRank);
}

/** The chance a failure by this unit is noticed, by rank. */
export function noticeOdds(unit: Unit): number {
  return Math.max(0.05, SPY.noticed - unit.rank * SPY.noticedPerRank);
}

export type ReadOutcome =
  | { kind: 'read'; reading: CityReading }
  | { kind: 'missed' }
  /** `wore` is whether it was in a disguise at the moment it was noticed. */
  | { kind: 'caught'; wore: boolean };

/**
 * Read a town, and spend the turn doing it.
 *
 * The turn goes whatever happens: standing about a rival's gate looking
 * interested is the whole of the action, and it is not something that can be
 * half done and walked away from.
 */
export function readCity(state: GameState, unit: Unit, city: City): ReadOutcome {
  if (!canRead(unit, city).ok) return { kind: 'missed' };
  SPY_TRACE.attempts++;
  unit.moves = 0;
  unit.order = 'none';

  if (withRng(state, (rng) => rng.chance(readOdds(unit)))) {
    awardXp(state, unit, SPY.xpRead);
    SPY_TRACE.read++;
    const reading = readingOf(state, city);
    remember(state, unit.owner, city, reading);
    return { kind: 'read', reading };
  }

  // Failed. Whether anybody noticed is a second roll, and it is the one that
  // matters: a quiet failure is a wasted turn, and a noticed one is the only
  // way the other side ever learns whose spy this was.
  if (!withRng(state, (rng) => rng.chance(noticeOdds(unit)))) {
    awardXp(state, unit, SPY.xpQuietFailure);
    SPY_TRACE.missed++;
    return { kind: 'missed' };
  }

  SPY_TRACE.caught++;
  const wore = uncover(unit, city.owner);
  adjustStanding(state, unit.owner, city.owner, SPY.caught);
  const them = state.players[unit.owner]?.name ?? 'Somebody';
  log(
    state,
    `Somebody was caught taking an interest in ${city.name}. They were ${them}'s.`,
    'bad',
    city.owner,
    undefined,
    [city.x, city.y],
  );
  log(
    state,
    `Our agent at ${city.name} was noticed. They know whose it was.`,
    'bad',
    unit.owner,
    undefined,
    [city.x, city.y],
  );
  return { kind: 'caught', wore };
}

/**
 * Looking along the eyeline for somebody who is not what they appear to be.
 *
 * **The counter to slice 1**, and the reason a disguise is a gamble rather than
 * a free pass. Until now a lie could only be broken by walking into it: a fight
 * uncovered a spy to whoever was in it, which meant the only way to find an
 * agent was to attack something that turned out to be one. This is the
 * deliberate version -- a spy of your own, standing still, paying attention.
 *
 * Three things it is careful about:
 *
 * **It can only find what it can see.** Asked through `seenBy`, the same
 * question everything else asks, so fog and burrowing still hide people.
 * Searching is attention, not omniscience.
 *
 * **Rank tells on both sides.** A searcher is better at looking and a hider is
 * better at being looked at, so the roll is the difference between them. A
 * green agent sweeping for a veteran is the worst version of this and should
 * be.
 *
 * **The side that is found is not told.** Being uncovered is permanent and
 * per-viewer, so what you have won is that *you* know and they do not -- they
 * will walk that agent somewhere believing it still passes. That is the whole
 * prize, and telling them would hand most of it back. It is not a breach of
 * the rule that a victim learns something was done to them: nothing was done
 * to them. They were looked at.
 */
export function canSearch(unit: Unit): { ok: boolean; reason?: string } {
  if (!SPY.enabled || !unitType(unit.type).spy) {
    return { ok: false, reason: 'Only a spy knows what to look for.' };
  }
  if (unit.moves <= 0) return { ok: false, reason: 'No movement left this turn.' };
  return { ok: true };
}

/** The chance this searcher sees through this hider, by the ranks of both. */
export function findOdds(searcher: Unit, hider: Unit): number {
  const edge = (searcher.rank - hider.rank) * SPY.findPerRank;
  return Math.max(SPY.findFloor, Math.min(SPY.findCap, SPY.finds + edge));
}

export type SearchOutcome = { kind: 'found'; found: Unit[] } | { kind: 'nothing' };

/**
 * Spend the turn looking, and name whoever is seen through.
 *
 * Everything in sight is examined, not the first thing found: a sweep is a
 * sweep. Each one is its own roll, so two agents standing together are two
 * separate questions and finding one tells you nothing about the other.
 */
export function searchFrom(state: GameState, unit: Unit): SearchOutcome {
  if (!canSearch(unit).ok) return { kind: 'nothing' };
  SPY_TRACE.swept++;
  unit.moves = 0;
  unit.order = 'none';

  const reach = unitType(unit.type).sight;
  const found: Unit[] = [];
  for (const other of state.units) {
    if (other.owner === unit.owner) continue;
    if (!isDisguised(other)) continue;
    if (other.uncoveredBy?.includes(unit.owner)) continue;
    if (distance(unit.x, unit.y, other.x, other.y) > reach) continue;
    // What it is wearing is what we can see, so the usual sight rules apply:
    // a disguise does not make somebody visible through fog.
    if (!seenBy(state, other, unit.owner)) continue;
    if (!withRng(state, (rng) => rng.chance(findOdds(unit, other)))) continue;
    uncover(other, unit.owner);
    awardXp(state, unit, SPY.xpRead);
    SPY_TRACE.found++;
    found.push(other);
  }

  if (found.length > 0) {
    log(
      state,
      found.length === 1
        ? 'One of the figures out there is not what it has been pretending to be.'
        : `${found.length} of the figures out there are not what they have been pretending to be.`,
      'good',
      unit.owner,
      undefined,
      [unit.x, unit.y],
    );
  }
  return found.length > 0 ? { kind: 'found', found } : { kind: 'nothing' };
}

/**
 * File the report, so the empire can plan off it after the spy has walked away.
 *
 * The player gets this as a dialog they read and remember themselves. An AI
 * cannot read a dialog, so for it the same information has to be *written
 * down* -- and it is written down for the player's empire too, so the two sides
 * are keeping the same kind of file rather than one of them being given a
 * private sense.
 */
function remember(state: GameState, viewerId: number, city: City, reading: CityReading): void {
  const side = state.players[viewerId];
  if (!side) return;
  (side.readings ??= {})[city.id] = { turn: state.turn, held: reading.held };
}

/**
 * What this side last heard about a town, if it is still worth acting on.
 *
 * Null for a town nobody has read, and for a report old enough to be a rumour.
 * Callers get the choice of believing it or not; nothing here decides.
 */
export function lastReading(
  state: GameState,
  viewerId: number,
  cityId: number,
): { turn: number; held: number } | null {
  if (!SPY.enabled) return null;
  const filed = state.players[viewerId]?.readings?.[cityId];
  if (!filed) return null;
  return state.turn - filed.turn <= SPY.remembers ? filed : null;
}

/** Everything a reading reports, gathered off the city as it stands. */
function readingOf(state: GameState, city: City): CityReading {
  const garrison = state.units.filter((u) => u.x === city.x && u.y === city.y);
  const strongest = garrison.reduce<Unit | null>((best, u) => {
    if (!best) return u;
    return unitType(u.type).defense >= unitType(best.type).defense ? u : best;
  }, null);
  const owner = state.players[city.owner];
  // `isEndingPiece`, not `endingPart`. The first version counted only the
  // lesser works, so a town with the Portal itself standing in it reported
  // nothing of the sort under way -- the one reading worth the whole feature.
  const parts = city.buildings.filter((b) => isEndingPiece(BUILDINGS[b])).length;
  const kind = owner ? endingFor(owner.faction) : null;
  const works = kind ? endingWorks(kind) : [];
  return {
    city: city.name,
    size: city.size,
    building: city.producing.kind === 'unit'
      ? unitType(city.producing.id).name
      : city.producing.kind === 'building'
        ? (BUILDINGS[city.producing.id]?.name ?? null)
        : null,
    garrison: garrison.length,
    // Only the unit on the gate itself, which is what `nearestEnemyTarget`
    // counts when it can see one. A report that counted the whole district
    // would make every read town look harder than a seen one.
    held: (() => {
      const guard = garrison.find((u) => u.x === city.x && u.y === city.y);
      return guard ? unitType(guard.type).defense * headcount(guard) : 0;
    })(),
    strongest: strongest ? unitType(strongest.type).name : null,
    standing: city.buildings.map((b) => BUILDINGS[b]?.name ?? b),
    greatWork:
      owner === undefined || works.length === 0
        ? null
        : {
            name: works[works.length - 1].name,
            begun: owner.endingBegunAt !== undefined,
            parts,
          },
  };
}
