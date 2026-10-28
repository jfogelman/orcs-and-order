import { idx } from '../engine/grid';
import { headcount, unitType } from '../model/units';
import type { GameState, Unit } from '../model/types';
import { log, withRng } from './gamestate';
import { adjustStanding } from './diplomacy';
import { CARAVANS, caravansOf, hasCaravan } from './caravans';
import { cityFollyBonus, empireBonus } from './follyEffects';
import { hasFlag } from './rules';
import { fatCrossIndices } from '../engine/grid';

/**
 * Recruit: asking somebody else's soldier to come and work here. Section 145.
 *
 * The Wandering Folk's whole reason to exist. From `WANDERERS_PLAN.md`: two
 * ways onto the roster, *"deliberately priced apart"* -- **Create**, the
 * ordinary training path at a quarter more than anybody else pays, and
 * **Recruit**, always cheaper, only available where a Caravan can see the
 * target, and carrying real risk.
 *
 * **Sibling of `turning.ts`, not a copy of it.** Section 136's bribe is a spy
 * standing next to somebody with a purse; this is an empire asking through a
 * structure it planted. Three differences carry the faction:
 *
 * - **No agent.** The Caravan is the reach. There is no unit to lose, no rank
 *   to improve the odds, and nothing to uncover -- which is why the attempt is
 *   limited per Caravan per turn instead of by a spy's movement.
 * - **Barbarians are in.** Turning refuses them, because a raiding band is not
 *   an employer and has no loyalty to buy out of. Recruit takes them and
 *   charges *more*, which is the bible's own joke and its best line: *"you
 *   can't offer someone something better than what they already have if they
 *   don't have anything to compare it to."*
 * - **The unit changes into something else.** A bought soldier keeps being
 *   what it was; a recruit **renormalises** to the Wandering Folk tier it
 *   corresponds to, which is what stops a recruited Knight being a better
 *   Knight than anybody could build.
 */
/**
 * Counters, for asking whether any of this ever happens. Section 157.
 *
 * Section 156 measured the Wandering Folk winning **0 games of 324** and
 * holding under one city, and two hypotheses were put forward at once -- that
 * the AI under-uses Recruit, and that they need a better gold supply. Both are
 * theories about behaviour, and the rule this project keeps is that an extreme
 * number wants an instrumented probe rather than a story: see
 * `check-it-exists-before-fixing-it` and `a-zero-explains-nothing`.
 *
 * So these count *existence and reach* before anybody tunes anything: were
 * there targets at all, could they be afforded, were they asked, did they come.
 * A zero in `targets` and a zero in `asked` mean opposite things.
 *
 * Reset by the probe that reads them; nothing in the game clears them, and
 * nothing reads them in a shipped build.
 */
export const RECRUIT_TRACE = {
  /** Half-turns on which this side had a Caravan standing at all. */
  withCaravan: 0,
  /** Somebody else's soldier inside a ring, summed over half-turns. */
  targets: 0,
  /** Of those, the ones the AI could actually afford at `aiPurse`. */
  affordable: 0,
  /** Asks made, and how they went. */
  asked: 0,
  came: 0,
  refused: 0,
  /** Gold spent asking, whatever the answer. */
  spent: 0,
};

export const RECRUIT = {
  /** The switch, for sweeps. Off is a Wandering Folk who can only Create. */
  enabled: true,
  /**
   * Gold per shield of the unit you end up with.
   *
   * Under `TURNING.perShield` of 2.5, and that is the whole design: a bribe
   * swings twice -- a soldier taken *and* a soldier gained -- where a recruit
   * swings once and a half, because what you get is a Wandering Folk unit
   * rather than the thing you took. Priced so that Recruit undercuts Create
   * at every tier, which the bible requires in those words.
   *
   * **Not measured yet.** This and everything below it are the "directional,
   * not numeric" modifiers the bible flags as wanting a real balance pass,
   * and the sweep is what settles them.
   */
  perShield: 1.6,
  /**
   * What a target at death's door takes off the price.
   *
   * *"A battered unit is cheaper to talk over than a fresh one."* Scaled by
   * the share of its health that is gone, so a unit at full health pays none
   * of it and one on its last point pays nearly all.
   */
  hurtDiscount: 0.45,
  /**
   * Taken off per friendly unit standing near the asking Caravan, and the
   * most that can come off that way.
   *
   * *"Safety-in-numbers making defection look like the obvious choice rather
   * than a desperate one."* Capped, because without a ceiling the answer to
   * every price is to park the army next door.
   */
  perFriend: 0.08,
  friendCap: 0.32,
  /** How close a friend has to be to the Caravan to count as nearby. */
  friendReach: 2,
  /**
   * Charged extra to somebody with nothing to be disaffected from.
   *
   * Barbarians, and -- pending Jeremy's ruling -- nobody else, because the
   * Hive is excluded by having no equivalent to convert into rather than by
   * price. See `RECRUIT_AS`.
   */
  outsider: 1.6,
  /**
   * What a Hivekin caste costs, and how badly it goes wrong.
   *
   * Jeremy's framing, and it is the whole of why this is not just another
   * price: *"keep it in character, tricking the lower castes into accidentally
   * betraying the hive instead of outright buying them."*
   *
   * You are not making an offer. There is nobody there to weigh one -- the
   * caste was grown for a job and is doing the job. What you are doing is
   * putting something shiny where it will be followed. **So it is cheap and it
   * is unreliable**, which is the opposite profile to the raiders above and
   * gives the Hive matchup a shape of its own rather than a surcharge:
   *
   * - a raider has nothing to be dissatisfied about, so persuading one is
   *   dear and no less likely to work;
   * - a caste has nobody to persuade, so misleading one is cheap and very
   *   often simply does not take.
   *
   * Neither number is measured. Both are the obvious first thing to push on.
   */
  shiny: 0.55,
  shinyFail: 1.5,
  /**
   * What *The First Ones Who Stayed* takes off the price, empire-wide.
   *
   * Section 148, and the split it rests on: **this advance makes asking
   * cheaper and the First Caravan folly makes it likelier to work.** Two
   * levers on one mechanic that do not overlap, so a player who has both
   * feels both, and a player with one can tell which.
   *
   * The reasoning in the faction's own terms: the price is what somebody
   * asks to leave a job, and it falls once word has got round that the
   * people who went across are still there. That is a fact about reputation
   * rather than about this particular soldier, which is why it is empire-wide
   * and flat rather than scaled by anything on the target.
   *
   * Not measured. Twelve per cent is a first guess at "worth twenty beakers
   * early and never decisive", and the sweep is what settles it.
   */
  staying: 0.12,
  /**
   * The chance an attempt simply fails, and the band it is held inside.
   *
   * *"Gold spent, no unit gained. Modified by the same factors as cost (a
   * tougher, healthier target is both pricier and more likely to simply
   * refuse)."* So the discounts above buy odds as well as price, and one
   * number moves both -- which is the bible's rule and also the only way the
   * two can be kept from disagreeing.
   */
  failBase: 0.34,
  failFloor: 0.06,
  failCap: 0.66,
  /**
   * What being caught poaching costs with the side poached from.
   *
   * Confirmed in the bible to carry **both** consequences at once -- *"a
   * diplomacy hit against the poached-from faction, and a real retaliation
   * risk"* -- rather than one or the other, and to land *"regardless of
   * whether the attempt succeeds"*. You are openly taking their soldier in
   * front of them; they notice either way.
   *
   * **One number buys both**, and that is not a shortcut. `ai.ts`'s `grudge()`
   * reads `standing` directly and multiplies it into the effective distance of
   * every city and unit of ours, so a side we have poached from finds our
   * towns and our soldiers *nearer* than they were -- which is their units
   * responding, in the only vocabulary this game's AI has for it. A separate
   * retaliation flag would have been a second system saying the same thing,
   * and a config field that did nothing would be worse than no field at all.
   */
  provokeStanding: -10,
  /** Attempts one Caravan may make in a turn. */
  perCaravanPerTurn: 1,
  /** Whether the other side asks too. */
  ai: true,
  /**
   * The share of the bank the AI will put into asking in one turn.
   *
   * Lower than `TURNING.aiPurse` of 0.5, because the Wandering Folk have a
   * standing use for gold that the empires do not -- everything they build
   * costs a quarter more -- so an AI that spent half its purse on one soldier
   * would stop building any.
   */
  aiPurse: 0.3,
  /**
   * The worst odds the AI will accept before it bothers asking.
   *
   * It is not being named by a refusal the way a bribe is -- there is no agent
   * to uncover -- so this is purely about not throwing gold at long shots.
   */
  aiWorstOdds: 0.5,
};

/**
 * What a recruited unit becomes.
 *
 * **The bible's own "Rough equivalent" column, and nothing beyond it.** A
 * source unit with no entry here is unrecruitable, which is a stronger and
 * tidier rule than a list of exceptions: there is simply nothing to turn it
 * into.
 *
 * That rule happens to deliver the four the bible names outright -- *"Dragon,
 * Paladin, Death Knight, and Mage stay unrecruitable, too bonded, too
 * trained, too specific to just walk over"* -- and it also catches the cases
 * the bible never had to think about: scouts, sappers, outriders, every ship,
 * every siege engine and every spy, none of which has a Wandering Folk tier
 * to become.
 *
 * **The Hivekin are absent, and that is a question rather than a decision.**
 * The bible was written before they were at the table and prices only *"Orc
 * Horde and Human Alliance regulars"* against *"neutral/barbarian"*. A caste
 * grown for a job, by a Queen who is already aware, is a poor candidate for a
 * better offer -- but excluding a whole faction from the mechanic that
 * defines another one is Jeremy's call, not mine. Flagged, not invented.
 */
export const RECRUIT_AS: Record<string, string> = {
  // Peon / Peasant -> the weakest, which founds Caravans.
  peon: 'wanderer',
  peasant: 'wanderer',
  // Goblin -> cheap and spammable.
  goblin: 'wf-skirmisher',
  // Orc / Footman -> the standard line trooper.
  orc: 'warband',
  footman: 'warband',
  // Troll / Knight -> stronger melee.
  troll: 'outcast',
  knight: 'outcast',
  // Ogre -> heavy melee.
  ogre: 'wf-brute',
  // Axethrower / Archer -> ranged.
  axethrower: 'slinger',
  archer: 'slinger',

  // ----------------------------------------------------------- the Hivekin
  //
  // **Jeremy's ruling**, and it fixed a balance hole I had left open by
  // excluding them: *"the lower castes be susceptible to something shiny
  // (i.e. gold), but higher castes are built too loyal (literally), like our
  // higher level orc and human ones."*
  //
  // So the line is drawn in exactly the same place as the empires': the four
  // the Hive grows for a purpose stay where they are, and everything below
  // them can be led off. Broodlord, Princess, Warden and Queen are the Hive's
  // Dragon, Paladin, Death Knight and Mage -- too bonded, too specific, and
  // in the Hive's case literally built that way.
  //
  // The castes fall onto the tiers without argument, which is a good sign
  // that the tier list really is unified: Grub and Worker do the Peon's job,
  // Fodder is the cheap spammable one, Soldier is the line, Spitter is the
  // ranged one and Elite is the step up.
  grub: 'wanderer',
  worker: 'wanderer',
  fodder: 'wf-skirmisher',
  soldier: 'warband',
  spitter: 'slinger',
  elite: 'outcast',
};

/** Whether this is a caste rather than somebody with opinions. Section 145. */
function isCaste(state: GameState, target: Unit): boolean {
  return state.players[target.owner]?.faction === 'hivekin';
}

/** "a" or "an", so the log does not say "a Outcast". */
function a(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}

/** The same, starting a sentence. */
function A(name: string): string {
  const said = a(name);
  return said[0].toUpperCase() + said.slice(1);
}

/** What this unit would become, or null if there is nothing to make of it. */
export function recruitsAs(target: Unit): string | null {
  return RECRUIT_AS[unitType(target.type).base] ?? null;
}

/** Whether this target has nothing to be disaffected from. */
function isOutsider(state: GameState, target: Unit): boolean {
  return !!state.players[target.owner]?.barbarian;
}

/** Friendly units standing within reach of the Caravan doing the asking. */
export function friendsNear(state: GameState, playerId: number, at: number): number {
  const cx = at % state.width;
  const cy = Math.floor(at / state.width);
  let near = 0;
  for (const u of state.units) {
    if (u.owner !== playerId) continue;
    if (Math.max(Math.abs(u.x - cx), Math.abs(u.y - cy)) <= RECRUIT.friendReach) near++;
  }
  return near;
}

/** The Caravan that would do the asking: the nearest of this side's that can see it. */
export function askingCaravan(state: GameState, playerId: number, target: Unit): number | null {
  let best: number | null = null;
  let bestAway = Infinity;
  for (const i of caravansOf(state, playerId)) {
    const cx = i % state.width;
    const cy = Math.floor(i / state.width);
    const away = Math.max(Math.abs(cx - target.x), Math.abs(cy - target.y));
    if (away > CARAVANS.sight) continue;
    if (away < bestAway) {
      bestAway = away;
      best = i;
    }
  }
  return best;
}

/** How much gold it would take, all the modifiers applied. */
export function recruitPrice(state: GameState, playerId: number, target: Unit): number {
  const becomes = recruitsAs(target);
  if (!becomes) return 0;
  // Priced off **what you get**, not off what you took. A recruited Knight is
  // an Outcast, and an Outcast is what you are paying for.
  const base = unitType(becomes).cost * headcount(target) * RECRUIT.perShield;
  const type = unitType(target.type);
  const hurt = type.hp > 0 ? Math.max(0, Math.min(1, 1 - target.hp / type.hp)) : 0;
  let price = base * (1 - hurt * RECRUIT.hurtDiscount);
  const at = askingCaravan(state, playerId, target);
  if (at !== null) {
    const crowd = Math.min(RECRUIT.friendCap, friendsNear(state, playerId, at) * RECRUIT.perFriend);
    price *= 1 - crowd;
  }
  if (isOutsider(state, target)) price *= RECRUIT.outsider;
  if (isCaste(state, target)) price *= RECRUIT.shiny;
  // Section 148: and what the empire has learned about keeping people.
  if (hasFlag(state.players[playerId], 'staying')) price *= 1 - RECRUIT.staying;
  return Math.max(1, Math.round(price));
}

/**
 * The chance an attempt fails outright.
 *
 * Moved by the same two factors the price is, and in the same direction, so a
 * cheap target is also an easy one. That is the bible's rule rather than a
 * simplification of it: *"a tougher, healthier target is both pricier and more
 * likely to simply refuse."*
 */
export function recruitFailOdds(state: GameState, playerId: number, target: Unit): number {
  const type = unitType(target.type);
  const hurt = type.hp > 0 ? Math.max(0, Math.min(1, 1 - target.hp / type.hp)) : 0;
  let fail = RECRUIT.failBase * (1 - hurt * RECRUIT.hurtDiscount);
  const at = askingCaravan(state, playerId, target);
  if (at !== null) {
    const crowd = Math.min(RECRUIT.friendCap, friendsNear(state, playerId, at) * RECRUIT.perFriend);
    fail *= 1 - crowd;
  }
  if (isOutsider(state, target)) fail *= RECRUIT.outsider;
  if (isCaste(state, target)) fail *= RECRUIT.shinyFail;
  // Section 146: the First Caravan, which is the one folly that touches this
  // and is empire-wide. Taken off the chance of failing rather than added to
  // the chance of success, which is the same number said the way the bible
  // says it: *"+15% chance to successfully Recruit"*.
  fail -= empireBonus(state, playerId, (b) => b.recruitOdds);
  return Math.max(RECRUIT.failFloor, Math.min(RECRUIT.failCap, fail));
}

/** Whether this side could ask this unit, and why not. */
export function canRecruit(
  state: GameState,
  playerId: number,
  target: Unit,
): { ok: boolean; reason?: string } {
  if (!RECRUIT.enabled || !CARAVANS.enabled) {
    return { ok: false, reason: 'Nobody does that here.' };
  }
  const us = state.players[playerId];
  if (us?.faction !== 'wandering') {
    return { ok: false, reason: 'Only the Wandering Folk ask.' };
  }
  if (target.owner === playerId) return { ok: false, reason: 'They are already yours.' };
  if (!recruitsAs(target)) {
    return { ok: false, reason: `There is nothing we could make of a ${unitType(target.type).name}.` };
  }
  const at = askingCaravan(state, playerId, target);
  if (at === null) return { ok: false, reason: 'No Caravan of ours can see them.' };
  if ((state.caravanAsked?.[at] ?? -1) >= state.turn) {
    return { ok: false, reason: 'That Caravan has already asked somebody today.' };
  }
  if (us.gold < recruitPrice(state, playerId, target)) {
    return { ok: false, reason: 'Not enough gold to make the offer.' };
  }
  return { ok: true };
}

export type RecruitOutcome =
  | { kind: 'joined'; gold: number; became: string; provoked: boolean }
  | { kind: 'refused'; gold: number; provoked: boolean }
  | { kind: 'blocked'; reason: string };

/**
 * Whether the side being poached from can see it happening.
 *
 * *"Attempting a recruit within an enemy faction's own sight-lines counts as a
 * hostile act against them regardless of whether the attempt succeeds."* Read
 * off their visibility of the tile their own soldier is standing on, which is
 * the only honest reading of "in front of them".
 */
export function poachingSeen(state: GameState, target: Unit): boolean {
  const them = state.players[target.owner];
  if (!them || them.barbarian) return false;
  return them.visible?.[idx(target.x, target.y, state.width)] === 1;
}

/**
 * Make the offer.
 *
 * The gold is spent either way, exactly as a bribe's is, and for the same
 * reason: a free attempt is a button to press every turn until it works.
 */
export function recruitUnit(
  state: GameState,
  playerId: number,
  target: Unit,
): RecruitOutcome {
  const check = canRecruit(state, playerId, target);
  if (!check.ok) return { kind: 'blocked', reason: check.reason ?? 'Not now.' };
  const us = state.players[playerId];
  const at = askingCaravan(state, playerId, target)!;
  const price = recruitPrice(state, playerId, target);
  const paid = Math.max(0, Math.min(price, us.gold));
  us.gold -= paid;
  (state.caravanAsked ??= {})[at] = state.turn;

  // **Provocation lands before the roll, not after it.** The bible is explicit
  // that it does not depend on the outcome -- they saw you asking.
  const provoked = poachingSeen(state, target);
  if (provoked) {
    adjustStanding(state, playerId, target.owner, RECRUIT.provokeStanding);
    log(
      state,
      `Somebody has been in among our soldiers with an offer. It was ${us.name}'s.`,
      'bad',
      target.owner,
      undefined,
      [target.x, target.y],
    );
  }

  RECRUIT_TRACE.asked++;
  RECRUIT_TRACE.spent += paid;
  const failed = withRng(state, (rng) => rng.chance(recruitFailOdds(state, playerId, target)));
  if (failed) RECRUIT_TRACE.refused++;
  else RECRUIT_TRACE.came++;
  if (failed) {
    log(
      state,
      // A caste did not consider and decline. It did not consider at all.
      isCaste(state, target)
        ? `${A(unitType(target.type).name)} looked at the shiny thing for a while, and went back to work.`
        : `${A(unitType(target.type).name)} heard us out and stayed where it was.`,
      'bad',
      playerId,
      undefined,
      [target.x, target.y],
    );
    return { kind: 'refused', gold: paid, provoked };
  }

  const became = recruitsAs(target)!;
  const was = unitType(target.type).name;
  /**
   * Section 146: the Head Count, *"units trained or Recruited in this
   * settlement start at +1 experience level"*.
   *
   * **A recruit is not made in a settlement**, which is the whole difficulty.
   * It is made wherever it was standing when it was asked. The honest reading
   * of "in this settlement" for something a Caravan does is the land that
   * settlement works -- the same twenty-one tiles a garrison post has to sit
   * on to calm it, which is the only boundary this game draws around a town.
   */
  const started = state.cities
    .filter((c) => c.owner === playerId)
    .filter((c) =>
      fatCrossIndices(c.x, c.y, state.width, state.height).includes(at),
    )
    .reduce((best, c) => Math.max(best, cityFollyBonus(c, (b) => b.builtRanks)), 0);
  // Read before the unit stops being theirs, because afterwards it is ours.
  const caste = isCaste(state, target);
  joinUp(target, playerId, became);
  if (started > 0) target.rank = Math.min(3, started);
  log(
    state,
    // **Nobody bought a caste.** Jeremy's ruling, and the line has to carry
    // it: what happened is that something shiny went one way and the caste
    // followed it, and by the time anybody noticed it was somewhere else.
    caste
      ? `${A(was)} followed the shiny thing out of the hive, and is ${a(unitType(became).name)} now. It does not appear to have noticed.`
      : `${A(was)} has thought better of it, and is ${a(unitType(became).name)} now.`,
    'good',
    playerId,
    undefined,
    [target.x, target.y],
  );
  return { kind: 'joined', gold: paid, became, provoked };
}

/**
 * Hand the unit over and make it one of ours.
 *
 * **Renormalised, not re-badged.** The bible asks for this in as many words:
 * a recruit *"converts to the Wandering Folk's own equivalent stat line for
 * that tier rather than carrying over whatever combat stats it had before"*,
 * so no veteran Knight becomes a better Outcast than anybody could build and
 * no half-dead Goblin becomes a uselessly weak Skirmisher.
 *
 * Rank goes with it. A unit's decorations were awarded by somebody else, for
 * something it did to you, and the bible's reason for renormalising at all is
 * that what arrives should be a unit you could have made yourself.
 */
function joinUp(unit: Unit, to: number, becomes: string): void {
  if (unit.recruitedFrom === undefined) unit.recruitedFrom = unit.owner;
  unit.owner = to;
  unit.type = becomes as Unit['type'];
  unit.hp = unitType(becomes).hp;
  unit.rank = 0;
  unit.moves = 0;
  unit.order = 'none';
  unit.goto = null;
  // Whatever it was pretending to be, and whoever had seen through that, was
  // about somebody else's unit. The same tidy-up `changeSides` does.
  delete unit.disguise;
  delete unit.uncoveredBy;
  delete unit.bought;
}

/** Everybody this side could ask right now. */
export function recruitTargets(state: GameState, playerId: number): Unit[] {
  if (!RECRUIT.enabled) return [];
  return state.units.filter((u) => canRecruit(state, playerId, u).ok);
}

/** Clear the per-turn asking record. Called at the top of this side's turn. */
export function resetAsking(state: GameState, playerId: number): void {
  if (state.players[playerId]?.faction !== 'wandering') return;
  for (const key of Object.keys(state.caravanAsked ?? {})) {
    const i = Number(key);
    // A Caravan that has been torn up since takes its record with it.
    if (!hasCaravan(state, i % state.width, Math.floor(i / state.width))) {
      delete state.caravanAsked![i];
    }
  }
}

/**
 * Who the other side would ask, best first, and whether it can afford to.
 *
 * Sorted by what it would *get* rather than by what it costs: the point of
 * asking is the unit that arrives, and the arriving unit is a Wandering Folk
 * tier regardless of how grand the thing being asked was. So a Knight and a
 * Troll are worth exactly the same here, which is the renormalising rule
 * showing up in the AI's priorities rather than being worked around in them.
 */
export function aiAsks(state: GameState, playerId: number): Unit[] {
  if (!RECRUIT.enabled || !RECRUIT.ai) return [];
  const purse = Math.floor((state.players[playerId]?.gold ?? 0) * RECRUIT.aiPurse);
  const targets = recruitTargets(state, playerId);
  // Section 157: counted here rather than in the probe, because *how many
  // could it have asked* and *how many could it afford* are the two numbers
  // that tell a shortage of gold apart from a shortage of anybody to ask.
  if (caravansOf(state, playerId).length > 0) RECRUIT_TRACE.withCaravan++;
  RECRUIT_TRACE.targets += targets.length;
  RECRUIT_TRACE.affordable += targets.filter(
    (u) => recruitPrice(state, playerId, u) <= purse,
  ).length;
  return targets
    .filter((u) => recruitPrice(state, playerId, u) <= purse)
    .filter((u) => 1 - recruitFailOdds(state, playerId, u) >= RECRUIT.aiWorstOdds)
    .sort(
      (a, b) =>
        unitType(recruitsAs(b)!).cost - unitType(recruitsAs(a)!).cost ||
        recruitPrice(state, playerId, a) - recruitPrice(state, playerId, b),
    );
}
