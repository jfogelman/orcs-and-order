import { DIRS8, distance, idx, inBounds } from '../engine/grid';
import { Rng } from '../engine/rng';
import { FACTIONS } from '../model/factions';
import { TERRAIN } from '../model/terrain';
import { UNIT_TYPES, unitType } from '../model/units';
import type { FactionId, GameState, Ruin, RuinPrize, Unit, UnitTypeId } from '../model/types';
import { contenders, log, spawnUnit } from './gamestate';
import { ensureWilds } from './barbarians';
import { researchableTechs } from './research';
import { XP, awardXp } from './combat';

/**
 * Section 123: what was standing here before anybody arrived.
 *
 * Ruins are the map's own invitation to go and look at something. Each one has
 * a prize in it and something standing over the prize, so walking into one is a
 * decision rather than a lottery: **you wake it, you fight it, and then it is
 * yours**. That was the shape Jeremy chose out of the three on offer, and it is
 * the one that makes scouting a judgement instead of a dice roll.
 *
 * Three things follow from "you chose this fight", and all three are why the
 * Tomb Wardens are built the way they are:
 *
 * - **They do not come after you.** A guardian stays within `leash` of its ruin
 *   for ever. A ruin you walked away from is a ruin that stops mattering, which
 *   is what lets a player leave one for later without being punished for it.
 * - **They defend far better than they attack.** Every one of them is a wall
 *   with arms. Attacking into a ruin is expensive and being attacked by one is
 *   survivable, so the cost falls on the side that started it.
 * - **The Vault Keeper is late.** It arrives `keeperAfter` turns after the noise
 *   starts, so a ruin left half-cleared gets worse rather than staying still --
 *   and a player who commits properly is finished before it shows up.
 *
 * Placed when the map is made and never after. A seed's ruins are part of its
 * world, like its mountains, which is also what lets a sweep measure them.
 */

export const RUINS = {
  /** The switch, for sweeps and for a world nobody built in first. */
  enabled: true,
  /**
   * Tiles of land per ruin. At a thousand a 64x48 map with a third of it dry
   * carries about ten -- enough that a scout finds two or three in a game and
   * few enough that they stay events rather than scenery.
   */
  perLand: 100,
  /** Never nearer than this to anybody's start, so nobody opens one on turn two. */
  clearOfStarts: 8,
  /** Nor nearer than this to each other. */
  apart: 6,
  /** How far a woken guardian will go from its ruin. Beyond that it goes back. */
  leash: 2,
  /** Guardians standing up when somebody first walks in. */
  wakes: 2,
  /** Turns of being awake before the Vault Keeper arrives. */
  keeperAfter: 3,
  /**
   * Average advances known before the ruin wakes something better than bones.
   *
   * The same measure the wilds use, for the same reason: a ruin cracked at turn
   * thirty should be a different proposition from one cracked at turn a
   * hundred and thirty, and the turn number is the wrong way to say so.
   */
  guardianFrom: 8,
  /** What is in them, as weights. Gold is the common case and an advance is not. */
  prizes: { gold: 5, promotion: 3, unit: 2, advance: 1 } as Record<RuinPrize, number>,
  /** Coins in a ruin worth the walk. */
  gold: 90,
  /**
   * Advances the world must average before the soldier in a ruin is a rung
   * better. Six, so a standard game walks a side up two or three rungs before
   * the mid-tier cap catches it -- see `oldGarrison`.
   */
  soldierPerAdvances: 6,
  /**
   * What a warden's defence is multiplied by, and why this is a lever.
   *
   * Measured: ruins as first built took the game off the Horde, 55-53 becoming
   * 40-68 over 108 games an arm. Not because the Kingdom collected more -- the
   * Horde opens *more* ruins, 3.9 a game against 3.2 -- but because fights rose
   * from 22.5 a game to 27.5 and a guardian defending at four to six eats the
   * army of whoever attacks it. The Horde is the side that attacks.
   *
   * Same shape as section 120's wilds and section 122's sea: a neutral feature
   * landing unevenly because the two sides play differently.
   */
  wardenDefence: 1,
  /**
   * Whether a ruin is a soldier's business, and nobody else's.
   *
   * A worker that walks over a ruin does not wake it, and nothing standing in
   * one will swing at somebody who cannot fight back. Both halves of one rule,
   * and the rule follows from the principle the whole feature is built on: the
   * cost falls on whoever *chose* the fight. A Peon crossing a tile has chosen
   * nothing.
   *
   * Measured, and it is the rest of section 123's balance problem. With ruins
   * on, the Horde ended games with **fewer cities than it had without them** --
   * 6.00 down to 5.22 on the held-out seeds -- while opening *more* ruins than
   * the Kingdom and taking more of every prize. Settlers were walking over
   * doorways, waking what was in them, and dying there; and a dead Peon is a
   * town that never happened, which is a far worse price than any prize in the
   * ruin was worth.
   */
  soldiersOnly: true,
  /**
   * Whether a guardian will only ever swing at somebody standing *in* its ruin.
   *
   * Measured, and it is the whole of section 123's balance problem. Guardians
   * that lunge at whatever walks past make a woken ruin a fight nobody can
   * decline -- fighting rose from 22.5 a game to 27.5 and stayed there however
   * picky the AI was made, because the choosing was never the AI's. The side
   * that wakes more ruins pays more, and that is the Horde.
   *
   * Holding instead keeps everything the design wanted -- they are still a wall
   * in the doorway, they still have to be cleared before the prize is yours,
   * they still never leave -- and gives the cost back to the player who chose
   * it. A statue does not chase you; it waits.
   */
  wardensHold: true,
  /**
   * The odds the AI wants before it will swing at something standing in a ruin.
   *
   * A ruin is an *optional* fight, and the Horde's `caution` is 0.25 -- it will
   * attack at one-in-four odds, which is right for a war and ruinous against a
   * statue. This is the bar for fights nobody has to pick.
   */
  aiOdds: 0.25,
};

/** The three of them, worst last. */
export const WARDENS = {
  sentinel: 'sentinel' as UnitTypeId,
  guardian: 'guardian' as UnitTypeId,
  keeper: 'keeper' as UnitTypeId,
};

/** Whether this unit is one of the things that stands in ruins. */
export function isWarden(unit: Unit): boolean {
  return (
    unit.type === WARDENS.sentinel ||
    unit.type === WARDENS.guardian ||
    unit.type === WARDENS.keeper
  );
}

/** The ruin on this tile, if there is one. */
export function ruinAt(state: GameState, x: number, y: number): Ruin | undefined {
  return state.ruins?.find((r) => r.x === x && r.y === y);
}

/** Ruins still holding something. */
export function standingRuins(state: GameState): Ruin[] {
  return (state.ruins ?? []).filter((r) => r.takenOn === undefined);
}

/**
 * Scatter ruins over a finished map.
 *
 * Off its own `Rng` rather than the game's live stream, exactly as world
 * generation is: where the ruins are and what is in them are facts about the
 * seed, settled before anybody has taken a turn, and nothing a player does can
 * shift them.
 */
export function placeRuins(
  seed: number,
  width: number,
  height: number,
  terrain: GameState['terrain'],
  starts: Array<{ x: number; y: number }>,
): Ruin[] {
  if (!RUINS.enabled) return [];
  const rng = new Rng((seed ^ 0x51ed270b) >>> 0);
  const land: number[] = [];
  for (let i = 0; i < terrain.length; i++) {
    const def = TERRAIN[terrain[i]];
    if (def.water || def.noCity) continue;
    land.push(i);
  }
  const wanted = Math.floor(land.length / RUINS.perLand);
  const out: Ruin[] = [];
  // Weighted once, here, so the table is read in one place.
  const table: RuinPrize[] = [];
  for (const [prize, weight] of Object.entries(RUINS.prizes) as Array<[RuinPrize, number]>) {
    for (let n = 0; n < weight; n++) table.push(prize);
  }

  // Bounded rather than exhaustive: a map that cannot fit its quota gets fewer
  // ruins, which is correct, and never a loop that cannot end.
  for (let tries = 0; tries < land.length * 4 && out.length < wanted; tries++) {
    const i = land[rng.int(land.length)];
    const x = i % width;
    const y = Math.floor(i / width);
    if (starts.some((s) => distance(s.x, s.y, x, y) < RUINS.clearOfStarts)) continue;
    if (out.some((r) => distance(r.x, r.y, x, y) < RUINS.apart)) continue;
    out.push({ x, y, prize: table[rng.int(table.length)] });
  }
  void height;
  return out;
}

/** What stands up when a ruin is first disturbed. */
function wardenFor(state: GameState): UnitTypeId {
  const empires = contenders(state);
  const advances = empires.length
    ? empires.reduce((n, p) => n + p.techs.length, 0) / empires.length
    : 0;
  return advances >= RUINS.guardianFrom ? WARDENS.guardian : WARDENS.sentinel;
}

/**
 * Whoever was garrisoning the ruin when it stopped being a place, section 124.
 *
 * **A low-tier soldier, and how low depends on the age of the world.** The
 * prize was each side's *worker* before this, which was even on paper and not
 * in play: an AI stops founding at its target -- five for the Horde, six for
 * the Kingdom -- so a free settler was a town for one side and a road crew for
 * the other. That was the second time the same shape caught this feature out,
 * and it cost twenty games in a 216-a-side sweep. A soldier has no such
 * second life: it is worth what it is worth to anybody.
 *
 * Three rules, all of them Jeremy's (2026-09-28):
 *
 * - **Scaled off the whole world**, not off the finder's own research: the
 *   average advances the empires know between them, the same measure that
 *   paces the wilds. A ruin cracked on turn ten holds a Goblin or a Footman; a
 *   ruin cracked on turn a hundred and forty holds something that has been
 *   waiting a while.
 * - **Capped at mid-tier.** The good half of a roster is what an empire builds
 *   for itself; a ruin is not a shortcut to a dragon.
 * - **Never a group.** One of them, always: the counting ladder is a thing you
 *   pay for, and handing over Ten Orcs for walking into a doorway would undo
 *   the whole joke of it.
 *
 * `cost > 0` is what separates an empire's roster from the wilds' -- every
 * raider and warden in the game is costed zero, because nobody builds them.
 *
 * Two filters beyond that, both there so the rungs read as *soldiers*:
 *
 * - **Melee and missile only.** Sorting the whole roster by price put a Goblin
 *   Sapper at the Horde's middle rung and a Ballista at the Kingdom's, and a
 *   siege engine left behind in a doorway for six hundred years is a different
 *   joke from the one this is telling. Casters are out for the same reason.
 * - **Nothing cheaper than the faction's own first soldier**, which is what
 *   makes the bottom rung a Goblin and a Footman rather than a Goblin and an
 *   *Outrider* -- the Kingdom's scout undercuts its infantry by five shields
 *   and would otherwise have been the thing every early ruin handed over.
 */
function oldGarrison(state: GameState, faction: FactionId): UnitTypeId | null {
  const floor = UNIT_TYPES[FACTIONS[faction].starterUnit as UnitTypeId]?.cost ?? 0;
  const roster = Object.values(UNIT_TYPES)
    .filter(
      (u) =>
        u.faction === faction &&
        u.count === 1 &&
        u.cost >= floor &&
        u.attack > 0 &&
        (u.role === 'melee' || u.role === 'ranged') &&
        !u.settler &&
        !u.sails,
    )
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  if (roster.length === 0) return null;

  const empires = contenders(state);
  const advances = empires.length
    ? empires.reduce((n, p) => n + p.techs.length, 0) / empires.length
    : 0;
  const midTier = Math.floor((roster.length - 1) / 2);
  const rung = Math.min(midTier, Math.floor(advances / RUINS.soldierPerAdvances));
  return roster[rung].id;
}

/** Free ground beside a tile, for something to stand up on. */
function roomAround(state: GameState, x: number, y: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(nx, ny, state.width, state.height)) continue;
    if (TERRAIN[state.terrain[idx(nx, ny, state.width)]].water) continue;
    if (state.units.some((u) => u.x === nx && u.y === ny)) continue;
    if (state.cities.some((c) => c.x === nx && c.y === ny)) continue;
    out.push([nx, ny]);
  }
  return out;
}

/**
 * Somebody has walked into a ruin. Wake what is in it.
 *
 * Called from the movement rules the moment a unit lands on the tile, so the
 * guardians are standing there before its owner gets another turn -- the whole
 * point being that you do not get to take the prize on the way past.
 *
 * Nothing happens if the ruin is already awake or already emptied, so walking
 * back over a cleared ruin is just walking.
 */
export function disturb(state: GameState, ruin: Ruin, by: Unit): void {
  if (!RUINS.enabled) return;
  if (ruin.wokeOn !== undefined || ruin.takenOn !== undefined) return;
  // Somebody with a shovel, poking about: they disturb nothing, and nothing in
  // there minds them. See `RUINS.soldiersOnly` -- this is a fight you choose.
  if (RUINS.soldiersOnly && unitType(by.type).attack <= 0) return;
  ruin.wokeOn = state.turn;
  ruin.wokenBy = by.owner;

  // The wilds are conjured here if this game has none: a quiet game keeps its
  // two players until something in it actually stands up.
  const wild = ensureWilds(state);
  const room = roomAround(state, ruin.x, ruin.y);
  const standing = wild ? Math.min(RUINS.wakes, room.length) : 0;
  const kind = wardenFor(state);
  for (let n = 0; n < standing; n++) {
    spawnUnit(state, wild!.id, kind, room[n][0], room[n][1], false);
  }

  log(
    state,
    standing > 0
      ? `Something in the ruin stands up. ${standing === 1 ? 'It was' : 'They were'} not asleep, exactly.`
      : 'The ruin is empty, and the dust has not been disturbed in a very long time.',
    'bad',
    by.owner,
    undefined,
    [ruin.x, ruin.y],
  );
}

/**
 * The Vault Keeper, which is what being slow about it costs.
 *
 * Asked once a turn. A ruin that has been awake `keeperAfter` turns and still
 * holds its prize gets the thing that actually owns it -- once, and only while
 * something else of its own is still standing, because a keeper arriving to an
 * empty doorway would be a punishment for having already won.
 */
export function tickRuins(state: GameState): void {
  if (!RUINS.enabled) return;
  // No slot means nothing has ever woken, so there is nothing to keep.
  const wild = state.players.find((p) => p.barbarian);
  if (!wild) return;
  for (const ruin of standingRuins(state)) {
    if (ruin.wokeOn === undefined) continue;
    if (state.turn - ruin.wokeOn !== RUINS.keeperAfter) continue;
    const held = state.units.some(
      (u) => isWarden(u) && distance(u.x, u.y, ruin.x, ruin.y) <= RUINS.leash,
    );
    if (!held) continue;
    const room = roomAround(state, ruin.x, ruin.y);
    if (room.length === 0) continue;
    spawnUnit(state, wild.id, WARDENS.keeper, room[0][0], room[0][1], false);
    for (const p of contenders(state)) {
      if (p.visible[idx(ruin.x, ruin.y, state.width)] !== 1) continue;
      log(
        state,
        'Something far larger comes up the stairs. It has taken it three turns to decide you are serious.',
        'bad',
        p.id,
        undefined,
        [ruin.x, ruin.y],
      );
    }
  }
}

/** Whether anything is still standing over this ruin. */
export function guarded(state: GameState, ruin: Ruin): boolean {
  return state.units.some(
    (u) => isWarden(u) && distance(u.x, u.y, ruin.x, ruin.y) <= RUINS.leash,
  );
}

/**
 * Take what is in a ruin, if it is standing open and one of ours is in it.
 *
 * Asked at the top of a side's turn rather than the moment somebody steps in,
 * because the rule is *hold it, having cleared it* -- a unit that walks in,
 * takes the prize and walks out the same turn would make the guardians
 * optional, which is the one thing they must not be.
 */
export function claimRuins(state: GameState, playerId: number): void {
  if (!RUINS.enabled) return;
  for (const ruin of standingRuins(state)) {
    if (ruin.wokeOn === undefined) continue;
    if (guarded(state, ruin)) continue;
    const holder = state.units.find(
      (u) => u.owner === playerId && u.x === ruin.x && u.y === ruin.y,
    );
    if (!holder) continue;
    ruin.takenOn = state.turn;
    ruin.takenBy = playerId;
    give(state, ruin, holder);
  }
}

/** Hand over the prize, and say what it was. */
function give(state: GameState, ruin: Ruin, holder: Unit): void {
  const player = state.players[holder.owner];
  const where = [ruin.x, ruin.y] as [number, number];
  const tell = (text: string, cue?: string) =>
    log(state, text, 'good', holder.owner, cue as never, where, holder.id);

  switch (ruin.prize) {
    case 'gold': {
      player.gold += RUINS.gold;
      tell(`${RUINS.gold} gold, in a chest nobody had got around to.`, 'coin');
      return;
    }
    case 'promotion': {
      // A rank's worth of experience rather than a rank, so the unit's own
      // promotion machinery decides what that means -- including a unit that
      // was most of the way there already going up two.
      awardXp(state, holder, XP.thresholds[1]);
      tell(
        `${unitType(holder.type).name} comes out of the ruin having learned something in there.`,
      );
      return;
    }
    case 'unit': {
      const room = roomAround(state, ruin.x, ruin.y);
      if (room.length === 0) {
        player.gold += RUINS.gold;
        tell(`${RUINS.gold} gold, there being nowhere for anybody to stand.`, 'coin');
        return;
      }
      const kind = oldGarrison(state, player.faction);
      if (!kind) {
        player.gold += RUINS.gold;
        tell(`${RUINS.gold} gold, and nobody left in here to carry it.`, 'coin');
        return;
      }
      spawnUnit(state, holder.owner, kind, room[0][0], room[0][1], false);
      tell(
        `${unitType(kind).name} was still in the ruin, and has decided we are better than nothing.`,
      );
      return;
    }
    case 'advance': {
      // Off their own tree, and only something they could have taken anyway --
      // a ruin is not a way around the order of the world.
      const options = researchableTechs(player).filter((t) => !t.flags.includes('ending'));
      if (options.length === 0) {
        player.gold += RUINS.gold;
        tell(`${RUINS.gold} gold, there being nothing in here we did not know.`, 'coin');
        return;
      }
      const tech = options[0];
      player.techs = [...player.techs, tech.id];
      tell(`Somebody wrote ${tech.name} down in here, and left it where we could find it.`, 'tech');
      return;
    }
  }
}

/**
 * What a guardian does with its turn, which is mostly nothing.
 *
 * The one rule that matters: **it does not leave.** It will hit whatever is
 * beside it, and it will walk back if something pushed it off its step, and it
 * will not follow anybody home. A guardian that chased would turn every ruin
 * into a roaming band the player never chose to fight, which is the opposite of
 * the bargain -- and the bargain is the feature.
 *
 * Returns true when it has dealt with this one, so the raiders' own brain can
 * leave it alone.
 */
export function standWatch(state: GameState, warden: Unit, step: (x: number, y: number) => void): boolean {
  if (!isWarden(warden)) return false;
  const home = nearestRuin(state, warden.x, warden.y);

  // Anything of somebody else's within reach gets hit -- or, while `wardensHold`
  // is on, only somebody who has actually walked into the ruin. See the lever:
  // a guardian that lunges at passers-by turns a ruin into a fight nobody
  // chose, which is the thing that took fifteen games off the Horde.
  const reach = state.units.filter(
    (u) => u.owner !== warden.owner && distance(u.x, u.y, warden.x, warden.y) <= 1,
  );
  const armed = RUINS.soldiersOnly ? reach.filter((u) => unitType(u.type).attack > 0) : reach;
  const beside = RUINS.wardensHold
    ? armed.find((u) => !!home && u.x === home.x && u.y === home.y)
    : armed[0];
  if (beside) {
    step(beside.x, beside.y);
    return true;
  }

  // Off its step: back towards the doorway, one tile at a time.
  if (home && distance(warden.x, warden.y, home.x, home.y) > RUINS.leash) {
    step(home.x, home.y);
    return true;
  }
  return true;
}

/** The ruin this thing belongs to: the nearest one, which is the one it stood up in. */
export function nearestRuin(state: GameState, x: number, y: number): Ruin | undefined {
  let best: Ruin | undefined;
  let bestAway = Infinity;
  for (const r of state.ruins ?? []) {
    const away = distance(r.x, r.y, x, y);
    if (away < bestAway) {
      bestAway = away;
      best = r;
    }
  }
  return best;
}
