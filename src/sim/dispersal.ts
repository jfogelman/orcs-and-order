import { distance } from '../engine/grid';
import { FACTIONS } from '../model/factions';
import { TERRAIN } from '../model/terrain';
import type { City, GameState, Player, Scattered, Unit, UnitTypeId } from '../model/types';
import { CREATURES, unitType } from '../model/units';
import { exorcises } from './exorcism';
import { empireBonus } from './follyEffects';
import { log, spawnUnit, withRng } from './gamestate';
import { hasFlag } from './rules';

/**
 * Dispersal and reform: what happens when an Unbound unit loses. Section 152.
 *
 * `UNBOUND_PLAN.md` is built on one rule -- *"ordinary defeat doesn't end an
 * Unbound unit; it disperses, and may or may not come back"* -- and on one
 * promise about that rule: *"there is always a hard counter (exorcism), so
 * 'hard to kill' never quietly becomes 'impossible to kill.'"* Section 150
 * shipped the counter first, for exactly that reason. This is the half it
 * counters.
 *
 * **What a spirit pays is infrastructure, not arithmetic.** This faction's
 * units are the named equivalent's stats unchanged -- a Revenant is a Footman
 * -- so the cost of coming back is not a worse line on the card. It is that
 * coming back needs a building standing somewhere, and with neither on the map
 * a spirit is gone for good. An Unbound player who never builds a Retrieval
 * Circle has an ordinary army that is slightly worse at scouting.
 *
 * So the ladder, and each rung is the bible's:
 *
 * 1. **Beaten by an exorcist** -- it is simply dead, like anybody else.
 * 2. **An Effigy** -- simply dead, always. *"Purely physical, a bound idol,
 *    not a proper spirit."* The cheapest thing they field is the one thing
 *    anybody can just kill, which puts the fairness promise in the power
 *    curve rather than in a special case in combat.
 * 3. **Nowhere to come back to** -- gone. Real permanence, gated behind
 *    infrastructure instead of behind combat.
 * 4. **A site, and the roll fails** -- gone. Two advances and a folly make
 *    that likelier not to happen; none of those numbers is measured.
 * 5. **A site, and the roll holds** -- it stands up in that city next turn,
 *    whole, and keeps what it had learned.
 *
 * The **Archon** is outside the ladder in both directions, which is the point
 * of it: an ordinary defeat sends it home at once, at full strength, with no
 * site and no roll, and an exorcism destroys it outright.
 */

export const DISPERSAL = {
  /**
   * The switch, for sweeps. Off, an Unbound unit dies like anybody else's and
   * the faction is its stats -- which is the arm worth measuring against,
   * since the stats are deliberately nobody's own.
   */
  enabled: true,
  /**
   * The flat chance a reform simply fails, with a site standing and nothing
   * learned. **Unmeasured**, and the first number a sweep should take apart:
   * the bible says only *"exact percentages on both are a balance question for
   * later"*, and a third is a guess at "often enough to notice, rarely enough
   * to build around".
   */
  failBase: 0.35,
  /** Taken off by Sigil-Bound. */
  sigil: 0.12,
  /** Taken off again by The Ankh, which stacks with it. */
  ankh: 0.12,
  /** Never certain, however much has been learned. */
  failFloor: 0.05,
  /**
   * Whether the AI asks for somewhere to gather. Section 152.
   *
   * **This is the fourth time this switch has had to exist**, and the probe
   * found it the same way each time: section 125's Burrower measured 0.2 a
   * game, section 136's spy and section 138's unseen agent measured zero, and
   * the first Unbound probe came back `ever had somewhere to gather: 0/12`.
   *
   * The cause is always the same. `chooseProduction` ranks buildings by the
   * numbers on them -- gold, science, defence, a barracks -- and a Retrieval
   * Circle has none of those. By every figure the chooser reads it is fifty-
   * five shields of nothing, so it is never built, so nothing ever gathers,
   * so the whole faction is its stat line and its stat line is deliberately
   * nobody's own. A sweep of dispersal would have come back identical on both
   * arms.
   */
  ai: true,
  /**
   * Sites a side wants standing, counted as buildings rather than as sites
   * currently *usable*.
   *
   * The difference matters and is not pedantry: a Retrieval Circle only works
   * while nothing stands in its city, and this AI keeps a garrison in every
   * city -- so a want measured in usable sites would see zero, build a second
   * Circle, see zero, and spend the whole game laying circles.
   *
   * Two: one to have one, and a second so that losing a town is not losing
   * the mechanic. **Unmeasured.**
   */
  aiWants: 2,
};

/** Whether this faction's units disperse at all. */
export function dispersingSide(player: Player | undefined): boolean {
  return DISPERSAL.enabled && player?.faction === 'unbound';
}

/**
 * Creatures of theirs that do not disperse, and why each one does not.
 *
 * Only the Effigy, and it is the bible's own exception rather than a balance
 * patch: *"no dispersal, no reform, no exorcism requirement at all; an
 * ordinary attack just ends it, same as any normal unit on any other
 * faction's roster."*
 *
 * A set rather than a flag on the creature, for the reason section 111's
 * `MOUNTED` is one: this is a rule about named creatures, and the rule is the
 * place to say which.
 */
export const PHYSICAL = new Set(['effigy']);

/** The one that goes home instead of scattering. */
export const UNIQUE = 'archon';

/**
 * The two that arrive by arrangement rather than by being made.
 *
 * What The Read Terms is cheaper for: *"Jinn and Archon reformed or bound in
 * this settlement cost 15% less."* Named, for `PHYSICAL`'s reason -- a rule
 * about two creatures says which two, in the rule.
 */
export const BOUND = new Set(['jinn', UNIQUE]);

/** Whether this unit, beaten by this attacker, scatters rather than dying. */
export function scatters(state: GameState, unit: Unit, killer?: Unit): boolean {
  if (!dispersingSide(state.players[unit.owner])) return false;
  const base = unitType(unit.type).base;
  if (PHYSICAL.has(base)) return false;
  // The whole of section 150, asked here and nowhere else.
  if (killer && exorcises(state, killer)) return false;
  return true;
}

/**
 * The cities this empire could bring a spirit back in, best first.
 *
 * Both of the bible's conditions, and the difference between them is the whole
 * of why there are two buildings: *"Anchor Totem -- any city with one can
 * reform a dispersed unit, no other condition. Retrieval Circle -- a city with
 * one can also reform a dispersed unit, but only if that city currently has
 * zero units in it."*
 *
 * So the Circle is early, cheap and awkward -- a town you are using as a
 * barracks cannot also be a doorway -- and the Totem is the one that stops you
 * having to keep somewhere empty.
 */
/**
 * The two buildings a spirit can gather in: the unconditional one first.
 *
 * Exported so nothing has to name them twice. `tests/tech-useful.test.ts`
 * counts every side's ordinary buildings and expects the counts to match, and
 * these two are the one pair in the game that is not a job a city needs
 * doing -- they are the faction's mechanic wearing a building's clothes. A
 * test that excluded them by id would be a third copy of this list.
 */
export const REFORM_SITES = ['anchorTotem', 'retrievalCircle'] as const;

export function reformSites(state: GameState, playerId: number): City[] {
  const totems: City[] = [];
  const circles: City[] = [];
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    if (c.buildings.includes(REFORM_SITES[0])) {
      totems.push(c);
      continue;
    }
    if (!c.buildings.includes(REFORM_SITES[1])) continue;
    if (state.units.some((u) => u.x === c.x && u.y === c.y)) continue;
    circles.push(c);
  }
  // Totems first, so an empire with both does not spend the empty town it is
  // keeping clear on a spirit the Totem would have taken anyway.
  return [...totems, ...circles];
}

/**
 * The chance a reform fails for this empire, with a site already found.
 *
 * Taken off rather than added to, which is how the bible says it and how
 * section 146's `recruitOdds` reads the same shape: both advances *"reduce
 * failure chance"*, and The First Binding *"reduces it further, faction-wide;
 * stacks with Sigil-Bound, Anchor Totem, and The Ankh"*.
 */
export function reformFailOdds(state: GameState, playerId: number): number {
  const player = state.players[playerId];
  let fail = DISPERSAL.failBase;
  if (hasFlag(player, 'sigil-bound')) fail -= DISPERSAL.sigil;
  if (hasFlag(player, 'the-ankh')) fail -= DISPERSAL.ankh;
  fail -= empireBonus(state, playerId, (b) => b.reformOdds);
  return Math.max(DISPERSAL.failFloor, fail);
}

/**
 * Take a beaten unit off the board the Unbound way.
 *
 * Returns whether it scattered. `destroyUnit` asks this *before* it logs, so a
 * spirit that scattered is not also announced as wiped out -- the one thing
 * this rule must never do is read, in the log, like the ordinary death it is
 * replacing.
 */
export function scatter(state: GameState, unit: Unit, killer?: Unit): boolean {
  if (!scatters(state, unit, killer)) return false;
  const player = state.players[unit.owner];
  const type = unitType(unit.type);
  const where = [unit.x, unit.y] as const;

  // The Archon's soft defeat, which is the reason to build one: *"ordinary
  // defeat sends it home at full strength, instantly -- no site requirement,
  // no failure roll."* Home is the capital where there is one, because that is
  // what "home" means everywhere else in this game, and any city of theirs
  // otherwise. With no city at all there is no home to be sent to.
  if (unitType(unit.type).base === UNIQUE) {
    const home = homeFor(state, unit.owner, unit);
    if (home) {
      const back = spawnUnit(state, unit.owner, unit.type, home.x, home.y);
      back.rank = unit.rank;
      // It arrives having already been somewhere today.
      back.moves = 0;
      log(
        state,
        `${type.name} is put down, and is in ${home.name} before anybody can say so.`,
        'good',
        unit.owner,
        'promote',
        [home.x, home.y],
        back.id,
      );
      return true;
    }
    log(
      state,
      `${type.name} is put down with nowhere left to be put down in.`,
      'bad',
      unit.owner,
      undefined,
      where,
    );
    return true;
  }

  // Nowhere to come back to is the permanent answer, and it is answered here
  // rather than next turn so the player is told what it cost them on the turn
  // it cost them.
  if (reformSites(state, unit.owner).length === 0) {
    log(
      state,
      `${type.name} scatters, and there is nowhere for it to gather again.`,
      'bad',
      unit.owner,
      'lost-spirit',
      where,
    );
    return true;
  }

  (player.scattered ??= []).push({
    type: unit.type,
    rank: unit.rank,
    turn: state.turn,
    at: where,
  });
  log(state, `${type.name} scatters rather than falling.`, 'info', unit.owner, undefined, where);
  return true;
}

/**
 * Where an Archon is sent when it is put down: the nearest city of theirs.
 *
 * Nearest rather than the capital, which was the first draft. "Home" means the
 * capital everywhere else in this game, and here it should not: an Archon
 * fighting on a far border would appear on the other side of the map, which
 * reads as a retreat rather than as the thing not having been interrupted.
 * The nearest town is also the one the player is likeliest to be looking at.
 *
 * It does not use `capitalOf`, and that is deliberate as well -- `city.ts`
 * reads this file for the Archon's uniqueness, and a file that reads it back
 * would make the pair circular at load for a rule that does not need it.
 */
function homeFor(state: GameState, playerId: number, from: Unit): City | undefined {
  let best: City | undefined;
  let bestAt = Infinity;
  for (const c of state.cities) {
    if (c.owner !== playerId) continue;
    const d = distance(c.x, c.y, from.x, from.y);
    if (d < bestAt || (d === bestAt && best && c.id < best.id)) {
      best = c;
      bestAt = d;
    }
  }
  return best;
}

/**
 * Everybody scattered has a go at coming back. Called at the top of their turn.
 *
 * One attempt each and no queue: a spirit that finds no site, or fails its
 * roll, is gone. Waiting would make dispersal a resource that accumulates
 * while you build the building -- which is the opposite of the bible's
 * *"infrastructure, not luck alone"*, and would mean a long war ending with a
 * second army arriving all at once.
 *
 * Scattered *this* turn is left alone, so a spirit beaten on somebody else's
 * turn is not standing up again before that turn ends.
 */
export function reformScattered(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player.scattered?.length) return;
  if (!dispersingSide(player)) {
    // The lever was switched off, or the save is from before this rule. Either
    // way nobody is coming back and the list should not sit there forever.
    delete player.scattered;
    return;
  }

  const trying = player.scattered.filter((s) => s.turn < state.turn);
  if (trying.length === 0) return;
  player.scattered = player.scattered.filter((s) => s.turn >= state.turn);

  const fail = reformFailOdds(state, playerId);
  for (const spirit of trying) {
    const name = unitType(spirit.type).name;
    // Asked per spirit rather than once, because a Retrieval Circle stops
    // being a site the moment the first spirit stands up in it.
    const site = reformSites(state, playerId)[0];
    if (!site) {
      log(
        state,
        `${name} does not gather. There is nowhere left that would hold it.`,
        'bad',
        playerId,
        undefined,
        spirit.at,
      );
      continue;
    }
    if (withRng(state, (rng) => rng.float() < fail)) {
      log(
        state,
        `${name} does not gather, and this time it does not try again.`,
        'bad',
        playerId,
        undefined,
        [site.x, site.y],
      );
      continue;
    }
    const back = spawnUnit(state, playerId, spirit.type, site.x, site.y);
    back.rank = spirit.rank;
    log(
      state,
      `${name} gathers again in ${site.name}, and resumes where it left off.`,
      'good',
      playerId,
      'promote',
      [site.x, site.y],
      back.id,
    );
  }
}

/**
 * The Spirit Party's conversion: *"anything that dies near it comes back as
 * Unbound."* Section 152.
 *
 * Jeremy picked this from four shapes for the ending's open question, and the
 * reasoning is recorded in `UNBOUND_PLAN.md`: it is the only one of the four
 * that is an **extension of this faction's own rule** rather than a new system
 * beside it. Dispersal and reform already bring their units back; the ending
 * turns that on everybody else's. It is answerable without a new rule to learn
 * -- fight further off, or take the city -- and it is roughly a quarter the
 * surface of a map-wide conversion, which would have meant a new per-unit and
 * per-city condition touching all five factions fifteen turns before the game
 * ends.
 *
 * It fires only while the Party is **standing and counting down**, which is
 * the fifteen turns its holder has to survive anyway. The trigger of the
 * ending itself is untouched, deliberately: section 146 settled that an ending
 * which fired off a bespoke counter is a second victory rule nobody else plays
 * by.
 */
export const GUEST_LIST = {
  /** The switch, for sweeps: the ending as flavour only, which was shape one. */
  enabled: true,
  /**
   * Tiles from the settlement throwing it. **Unmeasured.**
   *
   * Two is the fat cross -- the tiles the city itself works -- which is the
   * one radius in this game a player already has a feel for, and it makes the
   * answer legible: the ground it reaches is the ground you can see it on.
   */
  reach: 2,
};

/**
 * What a guest comes back as.
 *
 * Derived rather than tabulated, and that is the whole of the design here.
 * Section 146's `RECRUIT_AS` is a hand-written map of thirteen source ids to
 * Wandering Folk tiers, and it was already stale twice -- once when the Hive's
 * castes arrived and once when this faction did. A fifth faction would have
 * needed a sixth block of entries, which is the mistake `tools/manifest.ts`
 * exists to stop making.
 *
 * So the rule is read off the model: **the Unbound tier that does the same job
 * for about the same money.** Same role where they have one, nearest cost
 * within it, and melee as the fallback for a role they do not field -- a
 * siege engine and a ship both come back as something with hands.
 *
 * Nothing comes back as an Effigy, which is not a spirit, or as an Archon,
 * of which there is one.
 */
export function guestAs(type: string): UnitTypeId | null {
  const dead = unitType(type);
  const theirs = CREATURES.filter(
    (c) => c.faction === 'unbound' && !PHYSICAL.has(c.id) && c.id !== UNIQUE && !c.settler && !c.sails,
  );
  if (theirs.length === 0) return null;
  const sameJob = theirs.filter((c) => c.role === dead.role);
  const pool = sameJob.length > 0 ? sameJob : theirs.filter((c) => c.role === 'melee');
  if (pool.length === 0) return null;
  let best = pool[0];
  for (const c of pool) {
    if (Math.abs(c.cost - dead.cost) < Math.abs(best.cost - dead.cost)) best = c;
  }
  return best.id;
}

/**
 * The settlement throwing a Spirit Party near this tile, and whose it is.
 *
 * Asked of every Unbound empire rather than only of the one that killed
 * something: the Party converts *anything that dies near it*, and a Horde
 * unit killed by a Kingdom knight two tiles from the pavilion is exactly the
 * case the flavour is about. It is their party; they did not have to be there.
 */
function partyNear(state: GameState, x: number, y: number): City | undefined {
  if (!GUEST_LIST.enabled) return undefined;
  for (const c of state.cities) {
    if (!c.buildings.includes('spiritParty')) continue;
    if (c.endingSince === undefined) continue;
    if (!dispersingSide(state.players[c.owner])) continue;
    if (distance(c.x, c.y, x, y) <= GUEST_LIST.reach) return c;
  }
  return undefined;
}

/**
 * Somebody has died beside the pavilion. They are now a guest.
 *
 * Called from `destroyUnit`, after the scatter above and before the death is
 * logged, so the line the player reads is the one that actually happened.
 * Returns whether anything was converted -- the unit is dead either way, so
 * this does not take the place of the ordinary message, it follows it.
 */
export function inviteIn(state: GameState, unit: Unit): void {
  const party = partyNear(state, unit.x, unit.y);
  if (!party) return;
  // Their own do not need inviting, and the one thing that is only an object
  // has nothing to invite. Asked here rather than in `partyNear` so the list
  // of exceptions reads beside the rule it excepts.
  if (state.players[unit.owner]?.faction === 'unbound') return;
  if (PHYSICAL.has(unitType(unit.type).base)) return;
  const becomes = guestAs(unit.type);
  if (!becomes) return;
  const guest = spawnUnit(state, party.owner, becomes, party.x, party.y);
  guest.moves = 0;
  const was = unitType(unit.type).name;
  log(
    state,
    `${was} is counted as having attended ${party.name}, and stays on as ${unitType(becomes).name}.`,
    'good',
    party.owner,
    'promote',
    [party.x, party.y],
    guest.id,
  );
  log(
    state,
    `${was} does not get up, exactly. It has been added to a list in ${party.name}.`,
    'bad',
    unit.owner,
    'ending',
    [party.x, party.y],
  );
}

/**
 * Whether this side already has its one Archon, built or scattered.
 *
 * *"World-unique per faction -- only one can exist at a time; a second can't
 * be built while the first lives."* The scattered list counts, because an
 * Archon in it is one that is coming back: a second built while the first is
 * away would be two, a turn later, which is the thing the rule forbids.
 */
export function holdsUnique(state: GameState, playerId: number): boolean {
  if (state.units.some((u) => u.owner === playerId && unitType(u.type).base === UNIQUE)) return true;
  return !!state.players[playerId].scattered?.some((s) => unitType(s.type).base === UNIQUE);
}

/**
 * The Naiad's water bonus, which the bible leaves open on purpose.
 *
 * *"Meaningfully stronger when adjacent to water terrain... not yet specified
 * how much stronger."* It lives here rather than in the creature table for the
 * reason the comment on the creature gives: a conditional bonus written into
 * base stats is a unit that is simply better, which is the opposite of
 * conditional.
 *
 * A share rather than a flat point, so it scales with what the Naiad is doing
 * -- attacking out of a river mouth is worth the same proportion as holding
 * one -- and **unmeasured**, like everything else with a number in this file.
 */
export const WATERSIDE = {
  /** Creatures it applies to. Named, for `PHYSICAL`'s reason. */
  who: new Set(['naiad']),
  /** Added to attack and to defence, as a fraction, beside water. */
  bonus: 0.4,
};

/** Whether this unit is one that cares about water, and is standing beside it. */
export function besideWater(state: GameState, unit: Unit): boolean {
  if (!WATERSIDE.who.has(unitType(unit.type).base)) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      // Deep and shallow both count; a Naiad is not particular.
      if (TERRAIN[state.terrain[y * state.width + x]].water) return true;
    }
  }
  return false;
}

/**
 * Cities of this empire with a reform building standing, usable or not.
 *
 * What the AI's want is counted in. `reformSites` answers *where could a
 * spirit gather right now*, which is a different question with a different
 * answer every turn -- see `DISPERSAL.aiWants`.
 */
export function reformBuildings(state: GameState, playerId: number): City[] {
  return state.cities.filter(
    (c) => c.owner === playerId && REFORM_SITES.some((id) => c.buildings.includes(id)),
  );
}

/** Every scattered spirit this side is waiting on, for the report and the AI. */
export function scatteredOf(state: GameState, playerId: number): Scattered[] {
  return state.players[playerId].scattered ?? [];
}

/** Whether this side has any road back at all, for the advisors and the AI. */
export function canReform(state: GameState, playerId: number): boolean {
  return dispersingSide(state.players[playerId]) && reformSites(state, playerId).length > 0;
}

/** The Unbound's own name for themselves, for messages that need it. */
export function sideName(state: GameState, playerId: number): string {
  return FACTIONS[state.players[playerId].faction].name;
}
