import { DIRS8, distance, idx } from '../engine/grid';
import { TERRAIN } from '../model/terrain';
import type { GameState, Unit, UnitTypeId } from '../model/types';
import { unitType } from '../model/units';
import { barbarianOf, contenders, log, spawnUnit } from './gamestate';
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
     * Whether a chieftain calls anybody up. **Off, and measured off.**
     *
     * The rule works and reads well -- it retreats out of sight of a town to
     * grow, which is the right shape -- but three measurements in a row put it
     * on the Horde's side of the scales: 42-66 at one every three turns with a
     * cap of eight, 44-64 capped tighter, 47-61 at one every six with a cap of
     * five, against 53-55 for the tiers with no summons at all and 56-51 for
     * grunts alone. Each is close to the noise a hundred-odd games can produce;
     * three pointing the same way is not.
     *
     * The cause is not this rule. Extra raiders land hardest on whoever keeps
     * the thinner garrisons, and that is the Horde, whose army is out. Fix that
     * and this can come on: the code and its tests stay for that day.
     */
    summons: false,
    /**
     * Turns between the ones it calls up. The bible says three; measurement
     * says six. At three the wilds took the game off the Horde -- see the cap
     * below -- because summons added raiders faster than waves do, and the
     * Horde keeps the thinner garrisons. At six they add pressure at about the
     * pace a wave already does.
     */
    summonEvery: 6,
    /**
     * Raiders alive in the world before a chieftain stops calling anybody.
     *
     * Measured: with summons every three turns and a cap of eight the wilds
     * took the game off the Horde -- 42-66 uncapped, 44-64 capped, against
     * 56-51 with grunts alone -- because the extra raiders land on whoever
     * keeps the thinner garrisons, and the Horde's army is out. Eight rarely
     * bound at all, since a wave brings at most five. Five does.
     *
     * A band is pressure; an army is a third empire, and section 69 is
     * emphatic that the wilds must not become one.
     */
    bandCap: 5,
  },
};

/** The grunt, and what a wave is made of until the empires grow. */
export const RAIDER_GRUNT = 'skirmisher' as UnitTypeId;

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
export function waveRoster(state: GameState, size: number): UnitTypeId[] {
  if (!RAIDER_TIERS.enabled) return new Array(size).fill(RAIDER_GRUNT);
  const advances = empireProgress(state);
  const out: UnitTypeId[] = [];
  if (
    advances >= RAIDER_TIERS.leader.from &&
    !state.units.some((u) => u.type === RAIDER_TIERS.leader.id)
  ) {
    out.push(RAIDER_TIERS.leader.id);
  }
  if (advances >= RAIDER_TIERS.elite.from) {
    const elites = Math.min(
      Math.max(0, size - out.length),
      Math.max(1, Math.round(size * RAIDER_TIERS.elite.share)),
    );
    for (let i = 0; i < elites; i++) out.push(RAIDER_TIERS.elite.id);
  }
  while (out.length < size) out.push(RAIDER_GRUNT);
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
function roomBeside(state: GameState, unit: Unit): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRS8) {
    const x = unit.x + dx;
    const y = unit.y + dy;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
    if (TERRAIN[state.terrain[idx(x, y, state.width)]].water) continue;
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
