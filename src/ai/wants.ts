import type { BuildingDef } from '../model/buildings';
import type { GameState, Player, ProductionItem, Unit } from '../model/types';
import type { UnitTypeDef } from '../model/units';
import { unitType } from '../model/units';
import { allUnitsOf } from '../sim/ships';
import { BURROW, burrows } from '../sim/burrow';
import { SPY } from '../sim/spying';
import { UNSEEN, goesUnseen } from '../sim/unseen';
import { DISPERSAL, REFORM_SITES, dispersingSide, reformBuildings } from '../sim/dispersal';

/**
 * Things a side should keep a couple of, that nothing else will ever ask for.
 *
 * **This list exists because the same bug has been found four times.**
 * `chooseProduction` ranks units on strength, health and price and buildings
 * on gold, science, defence and a barracks. Anything whose reason to exist is
 * none of those is, by every number the chooser reads, the worst thing in the
 * yard -- forever, in every city, on every map.
 *
 * | section | the thing | what it measured before the fix |
 * |---|---|---|
 * | 125 | Burrower-caste | 0.2 built a game; the sweep arms were identical |
 * | 136 | the spy | no attack at all, so the worst soldier buildable |
 * | 138 | the unseen agent | a Skulker at nearly twice the price |
 * | 152 | the reform sites | 0 of 12 games ever had one standing |
 *
 * Every one was found by a probe **after shipping**, and every fix was the
 * same four lines pasted into `chooseProduction` with a fresh comment
 * explaining the same thing. Section 154 asked for the class to be retired
 * rather than the fifth instance fixed, and this is that: the want is
 * declared next to the rule it belongs to, and the chooser reads the list.
 *
 * **What this does not do is notice.** A new mechanic with no entry here is
 * still invisible to the AI; what has changed is that adding one is a
 * declaration rather than an edit to the chooser, and that the four existing
 * ones are in one place where a fifth is an obvious omission. The test that
 * guards it asserts every want is reachable, not that the list is complete --
 * no test can know about a rule nobody wrote down.
 */
export interface StandingWant {
  /** For tests and for reading a trace; never shown to a player. */
  id: string;
  /**
   * Whether this side is playing with the rule on and should want the thing.
   *
   * Carries the lever's own `enabled` and `ai` switches, because a want for a
   * mechanic that is switched off would have the chooser build it anyway.
   */
  when: (state: GameState, player: Player) => boolean;
  /** How many the side already has, counted across the whole empire. */
  have: (state: GameState, player: Player) => number;
  /** How many it should keep. Read each time, so a sweep can move it. */
  target: (state: GameState, player: Player) => number;
  /** Which of the things this city is offered satisfies the want. */
  pick: (offered: Offered) => ProductionItem | null;
}

/** What a city can build this turn, ships already removed. */
export interface Offered {
  units: UnitTypeDef[];
  buildings: BuildingDef[];
}

const unit = (def: UnitTypeDef | undefined): ProductionItem | null =>
  def ? { kind: 'unit', id: def.id } : null;

const building = (def: BuildingDef | undefined): ProductionItem | null =>
  def ? { kind: 'building', id: def.id } : null;

/**
 * In the order they are asked, which is the order they were added except where
 * a comment says otherwise. A want that returns something stops the search, so
 * this is a priority list and not a set.
 */
export const STANDING_WANTS: StandingWant[] = [
  {
    // Section 125. Two, and a small number on purpose: a Burrower hides,
    // crosses what cannot be walked round, and swings harder coming up out of
    // the ground, and the chooser can see none of those. By the numbers it is
    // a Soldier-caste costing three quarters again as much.
    id: 'burrower',
    when: () => BURROW.ai && BURROW.enabled,
    have: (state, player) => allUnitsOf(state, player.id).filter((u: Unit) => burrows(u)).length,
    target: () => BURROW.aiWants,
    pick: (offered) => unit(offered.units.find((u) => burrows({ type: u.id }))),
  },
  {
    // Section 136. One: a second spy reads the same towns the first one does.
    id: 'spy',
    when: () => SPY.ai && SPY.enabled,
    have: (state, player) =>
      allUnitsOf(state, player.id).filter((u: Unit) => unitType(u.type).spy).length,
    target: () => SPY.aiWants,
    // The cheap one, explicitly. Once section 138's advance is known both
    // tiers are offered, and taking whichever happens to be first would have
    // the chooser spending fifty-five shields on its *first* agent, in a yard
    // that is usually also the yard that should be building the garrison.
    pick: (offered) =>
      unit(offered.units.find((u) => u.spy && !u.hidden) ?? offered.units.find((u) => u.spy)),
  },
  {
    // Section 138. A want of its own rather than a larger `SPY.aiWants`,
    // because the two tiers are not interchangeable and the chooser cannot
    // tell them apart: by every number it reads a Nobody is a Skulker that
    // costs very nearly twice as much, so a shared want would buy two
    // Skulkers every time and the high tier would sit in the tree unbuilt.
    //
    // One, and only once the side already has its cheap agents: the expensive
    // one is a thing you add to a programme, not a thing you start with.
    id: 'unseen-agent',
    when: () => UNSEEN.ai && UNSEEN.enabled,
    have: (state, player) =>
      allUnitsOf(state, player.id).filter((u: Unit) => unitType(u.type).spy && goesUnseen(u)).length,
    target: (state, player) =>
      allUnitsOf(state, player.id).filter((u: Unit) => unitType(u.type).spy).length >= SPY.aiWants
        ? UNSEEN.aiWants
        : 0,
    pick: (offered) => unit(offered.units.find((u) => u.hidden)),
  },
  {
    // Section 152. `chooseProduction` ranks buildings on gold, science,
    // defence and a barracks, and a Retrieval Circle carries none of those --
    // by every number that function reads it is fifty-five shields of
    // nothing. The first Unbound probe measured 0 of 12 games with a reform
    // site ever standing, which means every spirit that fell was lost and the
    // faction was its stat line, which is deliberately nobody's own.
    //
    // **Last of the four, which is where section 152 put it**, and worth a
    // note because its own comment reads as though it should be first: it
    // says the site belongs "ahead of the riots and the endings below", and
    // it is -- all four of these are. It was never ahead of the diggers and
    // the spies, and moving it here would be a balance change wearing a
    // refactor's clothes.
    id: 'reform-site',
    when: (_state, player) => DISPERSAL.ai && DISPERSAL.enabled && dispersingSide(player),
    have: (state, player) => reformBuildings(state, player.id).length,
    target: () => DISPERSAL.aiWants,
    pick: (offered) => {
      // The Totem first where both are offered. A Circle only works while
      // nothing stands in its city and this AI garrisons every city, so a
      // Circle is the one it can afford early rather than the one it wants.
      const sites = offered.buildings.filter((b) =>
        (REFORM_SITES as readonly string[]).includes(b.id),
      );
      return building(sites.find((b) => b.id === REFORM_SITES[0]) ?? sites[0]);
    },
  },
];

/**
 * The first standing want this city can do something about, if any.
 *
 * Order is priority: the first want that is short and can be satisfied here
 * wins, and the rest are not asked. A want that is short but not offered
 * anything in this yard falls through to the next, which is what lets a side
 * with one Hive and no Totem still build its garrison.
 */
export function wantedHere(
  state: GameState,
  player: Player,
  offered: Offered,
): ProductionItem | null {
  for (const want of STANDING_WANTS) {
    if (!want.when(state, player)) continue;
    if (want.have(state, player) >= want.target(state, player)) continue;
    const item = want.pick(offered);
    if (item) return item;
  }
  return null;
}
