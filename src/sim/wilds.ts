import { DIRS8, distance, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import type { GameState, Unit, UnitTypeId } from '../model/types';
import { unitType } from '../model/units';
import { barbarianOf, contenders, log, spawnUnit } from './gamestate';
import { COWED, applyStatus } from './status';
import { destroyUnit } from './combat';
import { citySight } from './rules';

/**
 * Section 115: the wilds grow with the empires.
 *
 * A wave of grunts is news at turn thirty and a chore at turn a hundred and
 * thirty. Waves already grew in *number* with the average advances known, but
 * four skirmishers are still four skirmishers to anything wearing armour. So
 * the same measure brings harder things: an Ogre Clan Brute once both sides are
 * some way along, and a Warband Chieftain leading the late ones.
 *
 * Measured off advances rather than the turn, for the reason `waveSize` is: a
 * slow game is not punished for being slow, and a fast one cannot outrun the
 * wilds.
 *
 * Killing one pays, and only these two do. A band that leaves nothing behind is
 * a chore; the purse is what makes running a Chieftain down worth the detour it
 * costs. The grunt pays nothing, so a hundred of them are still not a living.
 *
 * Kept here rather than in `barbarians.ts` so that the fighting code can pay a
 * bounty without importing that file, which imports movement in turn.
 */
export const RAIDER_TIERS = {
  /** The switch, for sweeps: off is the game with grunts only. */
  enabled: true,
  elite: {
    id: 'brute' as UnitTypeId,
    /** Average advances known before one joins a wave. */
    from: 8,
    /** Share of a wave that arrives as elites, once they are coming at all. */
    share: 0.34,
    /** Gold to whoever kills it. */
    bounty: 20,
  },
  leader: {
    id: 'chieftain' as UnitTypeId,
    from: 18,
    bounty: 50,
    /**
     * Whether a chieftain calls anybody up. **On since section 120.**
     *
     * The rule works and reads well -- it retreats out of sight of a town to
     * grow, which is the right shape -- but three measurements in a row put it
     * on the Horde's side of the scales: 42-66 at one every three turns with a
     * cap of eight, 44-64 capped tighter, 47-61 at one every six with a cap of
     * five, against 53-55 for the tiers with no summons at all and 56-51 for
     * grunts alone. Each is close to the noise a hundred-odd games can produce;
     * three pointing the same way is not.
     *
     * The cause is not this rule, and the cause written here was wrong.
     * Section 120 went and measured it: the Horde keeps a body in its towns
     * *more* often than the Kingdom does (towns standing open 25% against 45%),
     * and sacking is four tenths of a game each. What the wilds actually took
     * off the Horde was soldiers in the field -- eleven a game against four --
     * because raiders walked at the nearest thing and the Horde's army is the
     * one out walking. Every raider added charged that tax again, which is what
     * these three measurements were seeing.
     *
     * With that rule changed -- a band goes for towns and diggings now, not for
     * whoever is nearest -- this was measured again over 108 games an arm, and
     * the thing it was blamed for is gone:
     *
     *   the wilds as they were, no summons   47-61
     *   bands after somebody's work          52-55
     *   ...and the chieftain calling people  **55-52**
     *
     * Summoning costs the Horde nothing it can be shown to mind once the wilds
     * stop taxing whoever marches, so it comes on. `summonEvery` and `bandCap`
     * are unchanged: they were tuned against the old rule, and the arm above
     * says they need no second look yet.
     */
    summons: true,
    /**
     * Turns between the ones it calls up. The bible says three; measurement
     * says six. At three the wilds took the game off the Horde -- see the cap
     * below -- because summons added raiders faster than waves do, and every
     * extra raider was another tax on the side that marches (section 120). At
     * six they add pressure at about the pace a wave already does, and six is
     * what the arm that switched summoning on was measured at.
     */
    summonEvery: 6,
    /**
     * Raiders alive in the world before a chieftain stops calling anybody.
     *
     * Measured: with summons every three turns and a cap of eight the wilds
     * took the game off the Horde -- 42-66 uncapped, 44-64 capped, against
     * 56-51 with grunts alone. (Section 120 found the real reason for that: the
     * wilds hunted whoever was out walking. The cap stays regardless.) Eight
     * rarely bound at all, since a wave brings at most five. Five does.
     *
     * A band is pressure; an army is a third empire, and section 69 is
     * emphatic that the wilds must not become one.
     */
    bandCap: 5,
  },
};

/** The grunt, and what a wave is made of until the empires grow. */
export const RAIDER_GRUNT = 'skirmisher' as UnitTypeId;

/**
 * Section 122: the Sunken Legion, the raider bible's second faction.
 *
 * The wilds' coastal half. Where the Wildland Raiders come out of the long
 * grass and run at you, these walk **up out of the shallows** -- slow, hard to
 * shift, and arriving from the one direction nobody garrisons. Three rungs
 * again, paced off the same measure of how far along the empires are, because a
 * second clock would be a second thing to tune for no gain.
 *
 * Same pressure, not more of it: a wave that is due rolls for the sea when the
 * map offers one, and a Legion wave lands **instead of** a Wildland wave rather
 * than as well as. That was the decision (Jeremy, 2026-09-24), and it is what
 * keeps this a new kind of game rather than a harder one.
 */
export const LEGION = {
  /** The switch, for sweeps. Off is the game with the Wildland Raiders alone. */
  enabled: true,
  /**
   * Share of due waves that come out of the sea, where there is a sea to come
   * out of. A coastal map therefore sees both kinds and an inland one sees none
   * of these, which is the rule doing its own geography.
   *
   * **A balance lever, not a flavour one, and measured twice.** Because a
   * Legion wave lands *instead of* a Wildland one, this number decides how much
   * of the wilds' pressure moves from inland to the coast -- and the two
   * empires do not have the same amount of coast. At 0.4 the Horde was raided
   * less than it used to be (sackings 1.45 a game down to 1.20) and the Kingdom
   * more (1.10 up to 1.30), and eight games moved with it: 48-60 became 56-52
   * across 108 games an arm, both seed sets agreeing, cities and population
   * moving too.
   *
   * At **0.2 every one of those columns is back where the control had it** --
   * 48-60, cities 5.10/6.38, sackings 1.45/1.15 -- while a coastal map still
   * sees three or four Legion waves in a game. So the sea gets a fifth of the
   * waves, and the faction is a new kind of raid rather than a thumb on the
   * scales.
   */
  share: 0.2,
  /** How far off a coast the shallows may be and still land a wave. */
  shoreReach: 2,
  grunt: { id: 'drowned' as UnitTypeId },
  elite: {
    id: 'wraith' as UnitTypeId,
    /** Average advances known before one joins a wave -- the brute's measure. */
    from: 8,
    share: 0.34,
    bounty: 20,
  },
  leader: {
    id: 'captain' as UnitTypeId,
    from: 18,
    bounty: 50,
    /** Drowned sailors left standing when a captain goes down. */
    lastWords: 2,
    /**
     * How near a ship has to be for a dying captain to take it with him.
     *
     * Jeremy's constraint (2026-09-24): *within 2 vision spots, not any*. A
     * captain drowning a boat on the far side of the map would be a die roll
     * rather than a rule -- this way it is something that happens to a fleet
     * that came to the fight, and the answer is to kill him with soldiers.
     */
    dragsUnder: 2,
  },
};

/** The average number of advances the empires know, which paces the wilds. */
function empireProgress(state: GameState): number {
  const empires = contenders(state);
  if (empires.length === 0) return 0;
  return empires.reduce((n, p) => n + p.techs.length, 0) / empires.length;
}

/**
 * What this wave is made of, worst first: the leader lands on the tile the band
 * arrives at and the rest fill in around it.
 *
 * **One chieftain in the world at a time.** A late game is a parade of waves,
 * and a parade of chieftains is a war rather than a raid.
 */
export function waveRoster(state: GameState, size: number, fromSea = false): UnitTypeId[] {
  const tiers = fromSea
    ? { grunt: LEGION.grunt.id, elite: LEGION.elite, leader: LEGION.leader }
    : { grunt: RAIDER_GRUNT, elite: RAIDER_TIERS.elite, leader: RAIDER_TIERS.leader };
  // The tiers lever governs both factions: off is grunts, whichever shore they
  // came from.
  if (!RAIDER_TIERS.enabled) return new Array(size).fill(tiers.grunt);
  const advances = empireProgress(state);
  const out: UnitTypeId[] = [];
  if (advances >= tiers.leader.from && !state.units.some((u) => u.type === tiers.leader.id)) {
    out.push(tiers.leader.id);
  }
  if (advances >= tiers.elite.from) {
    const elites = Math.min(
      Math.max(0, size - out.length),
      Math.max(1, Math.round(size * tiers.elite.share)),
    );
    for (let i = 0; i < elites; i++) out.push(tiers.elite.id);
  }
  while (out.length < size) out.push(tiers.grunt);
  return out.slice(0, size);
}

/**
 * Whether this tile is watched from a town.
 *
 * A **city's** own sight, not a unit's: a chieftain will not call anybody up
 * where a town can see it happening, so it has to give ground to grow -- which
 * is the whole balance of the thing. A patrol that walks past does not stop it,
 * because a band that could be pinned by one wandering scout would never grow
 * at all.
 */
export function watchedFromATown(state: GameState, x: number, y: number): boolean {
  return state.cities.some((c) => {
    const owner = state.players[c.owner];
    if (!owner || owner.barbarian) return false;
    return distance(c.x, c.y, x, y) <= citySight(owner);
  });
}

/** Free land beside this unit: where somebody called up could stand. */
function roomBeside(state: GameState, unit: Unit, wading = false): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRS8) {
    const x = unit.x + dx;
    const y = unit.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    const def = TERRAIN[state.terrain[idx(x, y, state.width)]];
    // Section 122: for the Legion the shallows are room as well -- a drowned
    // thing standing up out of the water is where it ought to be -- but the
    // deep is nobody's.
    if (def.water && !(wading && !def.deepWater)) continue;
    if (state.units.some((u) => u.x === x && u.y === y)) continue;
    if (state.cities.some((c) => c.x === x && c.y === y)) continue;
    out.push([x, y]);
  }
  return out;
}

/** How many raiders the wilds have on the map. */
export function bandSize(state: GameState, wildId: number): number {
  return state.units.filter((u) => u.owner === wildId).length;
}

/** Whether this unit is a chieftain with somebody due to be called up. */
export function summonDue(state: GameState, unit: Unit): boolean {
  if (!RAIDER_TIERS.enabled || !RAIDER_TIERS.leader.summons) return false;
  if (unit.type !== RAIDER_TIERS.leader.id) return false;
  return state.turn >= (unit.summonAt ?? state.turn);
}

/**
 * Call somebody up, if the chieftain is somewhere it can.
 *
 * Three things hold it down, and between them they are the balance: one unit to
 * a tile, so only the free ground beside it counts; nothing on water and nothing
 * in a town; and never within sight of a town, so a chieftain that wants a band
 * has to walk away from the fighting to get one.
 */
export function trySummon(state: GameState, chief: Unit): Unit | null {
  if (!summonDue(state, chief)) return null;
  // Enough of them out there already. Counted across the wilds rather than per
  // chieftain, so two bands cannot quietly add up to an army.
  if (bandSize(state, chief.owner) >= RAIDER_TIERS.leader.bandCap) return null;
  if (watchedFromATown(state, chief.x, chief.y)) return null;
  const room = roomBeside(state, chief);
  if (room.length === 0) return null;
  const [x, y] = room[0];
  const called = spawnUnit(state, chief.owner, RAIDER_GRUNT, x, y);
  chief.summonAt = state.turn + RAIDER_TIERS.leader.summonEvery;
  return called;
}

/** What killing this raider pays, if anything. */
export function bountyFor(unit: Unit): number {
  if (!RAIDER_TIERS.enabled) return 0;
  if (unit.type === RAIDER_TIERS.leader.id) return RAIDER_TIERS.leader.bounty;
  if (unit.type === RAIDER_TIERS.elite.id) return RAIDER_TIERS.elite.bounty;
  // The Legion's two big ones carry the same purses as the Wildland ones. A
  // drowned captain's takings are wetter and spend the same.
  if (unit.type === LEGION.leader.id) return LEGION.leader.bounty;
  if (unit.type === LEGION.elite.id) return LEGION.elite.bounty;
  return 0;
}

/**
 * Pay whoever just killed a raider worth killing. Nothing for a grunt, and
 * nothing for the wilds killing each other.
 */
export function claimBounty(state: GameState, killer: Unit, victim: Unit): void {
  const wild = barbarianOf(state);
  if (!wild || victim.owner !== wild.id || killer.owner === wild.id) return;
  const purse = bountyFor(victim);
  if (purse <= 0) return;
  const owner = state.players[killer.owner];
  if (!owner) return;
  owner.gold += purse;
  log(
    state,
    `${unitType(victim.type).name} is put down, and the ${purse} gold it was carrying is carried no further.`,
    'good',
    killer.owner,
    'coin',
    [victim.x, victim.y],
  );
}

/**
 * Section 121: the Ogre Clan Brute's one trick, out of the raider bible.
 *
 * *Units next to it attack at -1 next turn.* A brute does not have to do
 * anything for it -- standing next to one is the whole rule -- so this is
 * asked at the **start of each side's turn**, of whoever is within reach of a
 * brute right then. Anybody who was beside an ogre when the horn went swings
 * softly for that turn, and steps away or lives with it.
 *
 * Asked at the turn's start rather than applied when the band moves, and the
 * difference matters: a brute walks on most turns, so marking its neighbours
 * as it left caught almost nobody, and whether you were cowed depended on the
 * order the wilds happened to move in. This way the question is the one the
 * rule actually asks -- *is there an ogre next to you?* -- and asking it again
 * every turn is also what ends it, since a mark lasts exactly the turn it was
 * given for.
 *
 * **Killing the brute afterwards does not undo it**, which is the point: the
 * cost is for standing there. The brute swings no harder for any of it -- it is
 * already the hardest thing in a wave, and an ability that improved its own
 * attacks as well would be two rules wearing one name.
 */
export const INTIMIDATE = {
  /** The switch, for sweeps. Off is section 115's brute: hard, and quiet. */
  enabled: true,
  /** How far the bellowing carries. One: this is a thing it does to its neighbours. */
  range: 1,
  /**
   * Turns the mark carries. One, because it is re-asked at the start of every
   * turn: standing beside the ogre a second morning earns a second one.
   */
  turns: 1,
};

/**
 * Mark this player's units that are standing next to a brute, and tell them.
 *
 * Called at the top of their turn, after conditions have ticked down, so the
 * mark laid here is the one this turn's fighting uses.
 */
export function intimidateNeighbours(state: GameState, playerId: number): void {
  if (!RAIDER_TIERS.enabled || !INTIMIDATE.enabled) return;
  const brutes = state.units.filter(
    (u) => state.players[u.owner]?.barbarian && u.type === RAIDER_TIERS.elite.id,
  );
  if (brutes.length === 0) return;

  const cowed: Unit[] = [];
  for (const u of state.units) {
    if (u.owner !== playerId) continue;
    // Nobody who has nothing to lose by it. A Peon does not fight, and a Goblin
    // already swings at the floor -- marking either would put "swings softly"
    // on the panel of a unit swinging exactly as well as it did yesterday,
    // which is a lie the interface should not tell. It also means the ogre
    // frightens the things worth frightening, and the goblins are too stupid
    // to notice, which is the right joke as well as the right rule.
    if (unitType(u.type).attack + (u.drilled ?? 0) <= COWED.floor) continue;
    if (!brutes.some((b) => distance(u.x, u.y, b.x, b.y) <= INTIMIDATE.range)) continue;
    applyStatus(u, 'cowed', INTIMIDATE.turns);
    cowed.push(u);
  }
  if (cowed.length === 0) return;

  // One line a turn, not one per unit: a wave that catches four of yours would
  // otherwise file four separate complaints about the same ogre.
  const where = cowed[0];
  log(
    state,
    cowed.length === 1
      ? `${unitType(where.type).name} has an Ogre Clan Brute shouting into its face, and will swing badly for it.`
      : `An Ogre Clan Brute is bellowing at ${cowed.length} of ours. They will all swing badly for it.`,
    'bad',
    playerId,
    undefined,
    [where.x, where.y],
  );
}

/**
 * What a Drowned Captain does on the way down. Section 122.
 *
 * Two things, both out of the raider bible, and both deliberately narrow:
 *
 * - **The crew is still with him.** `lastWords` sailors stand up beside where
 *   he fell -- in the shallows as readily as on the sand -- so a captain is
 *   never quite dead when you thought he was, and killing one with your last
 *   healthy unit is a decision rather than a formality.
 * - **He takes a boat with him**, but only one that was *there*: within
 *   `dragsUnder` tiles, which is his own sight. Jeremy's constraint, and the
 *   right one -- a captain drowning a transport on the far side of the map
 *   would be a die roll dressed as a rule. Bring the fleet to the fight and it
 *   is part of the fight; kill him with soldiers and the fleet is fine.
 *
 * Nothing happens for a captain that dies with no room and no boats nearby,
 * which is the usual case and should be.
 */
export function lastWords(state: GameState, killer: Unit, victim: Unit): void {
  if (!RAIDER_TIERS.enabled || !LEGION.enabled) return;
  if (victim.type !== LEGION.leader.id) return;
  const wild = barbarianOf(state);
  if (!wild || victim.owner !== wild.id || killer.owner === wild.id) return;

  // The crew, up out of the water beside him.
  const room = roomBeside(state, victim, true);
  const called = Math.min(LEGION.leader.lastWords, room.length);
  for (let n = 0; n < called; n++) {
    spawnUnit(state, wild.id, LEGION.grunt.id, room[n][0], room[n][1], false);
  }
  if (called > 0) {
    log(
      state,
      called === 1
        ? 'The Drowned Captain goes down, and one of his crew stands up in his place.'
        : `The Drowned Captain goes down, and ${called} of his crew stand up in his place.`,
      'bad',
      killer.owner,
      undefined,
      [victim.x, victim.y],
    );
  }

  // And whatever of ours was floating close enough to be noticed.
  const boat = state.units
    .filter(
      (u) =>
        unitType(u.type).sails &&
        !state.players[u.owner]?.barbarian &&
        distance(u.x, u.y, victim.x, victim.y) <= LEGION.leader.dragsUnder,
    )
    .sort(
      (a, b) =>
        distance(a.x, a.y, victim.x, victim.y) - distance(b.x, b.y, victim.x, victim.y) ||
        a.id - b.id,
    )[0];
  if (!boat) return;
  log(
    state,
    `${unitType(boat.type).name} is pulled under after him. Whatever that was, it was not a drowning man.`,
    'bad',
    boat.owner,
    undefined,
    [boat.x, boat.y],
  );
  destroyUnit(state, boat, 'is dragged under');
}
