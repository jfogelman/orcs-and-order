import { unitType } from '../model/units';
import { BUILDINGS } from '../model/buildings';
import type { GameState, Player } from '../model/types';
import {
  buildingUpkeep,
  cityGoldBonus,
  cityScienceBonus,
  cityYield,
  defaultProduction,
  processCity,
} from './city';
import { log, playerCities, playerUnits, recomputeVisibility } from './gamestate';
import { resumeGotoOrders } from './movement';
import { addBeakers, splitTrade } from './research';
import { effectiveMove } from './rules';

/**
 * The turn pipeline.
 *
 * Each player's turn begins with their empire ticking over — cities grow and
 * build, trade becomes gold and research, units refresh and heal — and then
 * control passes to them. The calendar advances once everyone has played.
 */

/** Fraction of maximum health recovered per turn in each situation. */
const HEAL_IN_CITY = 1 / 3;
const HEAL_BARRACKS = 1;
const HEAL_FORTIFIED = 1 / 10;

function healUnits(state: GameState, playerId: number): void {
  for (const unit of state.units) {
    if (unit.owner !== playerId) continue;
    const max = unitType(unit.type).hp;
    if (unit.hp >= max) continue;
    const city = state.cities.find(
      (c) => c.x === unit.x && c.y === unit.y && c.owner === playerId,
    );
    let rate = 0;
    if (city) rate = city.buildings.includes('barracks') ? HEAL_BARRACKS : HEAL_IN_CITY;
    else if (unit.order === 'fortified') rate = HEAL_FORTIFIED;
    if (rate > 0) unit.hp = Math.min(max, unit.hp + Math.max(1, Math.round(max * rate)));
  }
}

function refreshUnits(state: GameState, player: Player): void {
  for (const unit of state.units) {
    if (unit.owner !== player.id) continue;
    unit.moves = effectiveMove(player, unit.type);
    if (unit.order === 'skip') unit.order = 'none';
  }
}

/**
 * Empire bookkeeping: cities, treasury, research.
 *
 * Trade is split into gold and beakers per city rather than once for the whole
 * empire, because a treasury or a library only enriches the city it stands in.
 */
function runEconomy(state: GameState, player: Player): void {
  let goldIncome = 0;
  let beakerIncome = 0;
  let upkeep = 0;

  for (const city of playerCities(state, player.id)) {
    if (city.producing.kind === 'coin' && city.size > 0) {
      // A city left on Coin picks something up as soon as it can.
      const suggestion = defaultProduction(state, city);
      if (suggestion.kind !== 'coin') city.producing = suggestion;
    }
    const events = processCity(state, city);
    const split = splitTrade(player, cityYield(state, city).trade);
    goldIncome += Math.round(split.gold * (1 + cityGoldBonus(city)));
    beakerIncome += Math.round(split.beakers * (1 + cityScienceBonus(city)));
    upkeep += buildingUpkeep(city);

    if (events.grew) log(state, `${city.name} grows to ${city.size}.`, 'growth', player.id);
    if (events.starved) log(state, `${city.name} is starving.`, 'bad', player.id);
    if (events.enteredDisorder) {
      log(state, `${city.name} has fallen into disorder.`, 'bad', player.id);
    }
    if (events.completed) {
      log(state, `${city.name} completes ${events.completed}.`, 'good', player.id);
    }
    if (events.blocked) {
      log(state, `${city.name} has nowhere to put what it just built.`, 'bad', player.id);
    }
  }

  player.gold += goldIncome - upkeep;
  addBeakers(state, player, beakerIncome);

  // Bankruptcy sells something off rather than going negative forever.
  while (player.gold < 0) {
    const victim = playerCities(state, player.id).find((c) => c.buildings.length > 0);
    if (!victim) {
      player.gold = 0;
      break;
    }
    const sold = victim.buildings.pop()!;
    player.gold += Math.floor(BUILDINGS[sold].cost / 2);
    log(state, `${victim.name} sells its ${BUILDINGS[sold].name} to cover the books.`, 'bad', player.id);
  }
}

/**
 * What the history books count.
 *
 * Deliberately measures what a civilisation *built*, not how much ground it
 * claimed. An earlier version paid a flat 10 points per city on top of
 * population, which meant planting a settlement and never developing it was
 * worth 13 points for the act of planting it. Since most games run to the turn
 * limit and are decided here, that quietly made "found cities everywhere and
 * ignore them" the winning strategy, and the sprawlier AI won 78% of games
 * while being behind on both research and army size.
 *
 * So there is no per-city term at all now. Cities still count, through the
 * citizens living in them and the things built there — which is the same
 * reward, paid for the parts that took effort.
 */
export const SCORE_WEIGHTS = {
  /** Citizens fed and housed. The main measure of a civilisation's size. */
  population: 4,
  /** The whole point of the game, so it had better be worth something. */
  advance: 6,
  /** Standing structures: what a city has actually invested in. */
  building: 4,
} as const;

export interface ScoreBreakdown {
  population: number;
  advances: number;
  buildings: number;
  total: number;
}

export function scoreBreakdown(state: GameState, playerId: number): ScoreBreakdown {
  const cities = playerCities(state, playerId);
  const population = cities.reduce((sum, c) => sum + c.size, 0);
  const buildings = cities.reduce((sum, c) => sum + c.buildings.length, 0);
  const advances = state.players[playerId].techs.length;

  const parts = {
    population: population * SCORE_WEIGHTS.population,
    advances: advances * SCORE_WEIGHTS.advance,
    buildings: buildings * SCORE_WEIGHTS.building,
  };
  return { ...parts, total: parts.population + parts.advances + parts.buildings };
}

export function playerScore(state: GameState, playerId: number): number {
  return scoreBreakdown(state, playerId).total;
}

/** Grace period before losing your last city counts as losing the game. */
const CAPITULATION_TURN = 15;

function checkElimination(state: GameState): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    const cities = playerCities(state, p.id).length;
    const units = playerUnits(state, p.id).length;
    if (cities > 0 || (units > 0 && state.turn <= CAPITULATION_TURN)) continue;

    // A power with no cities left is finished, whatever is still wandering
    // around out there. Without this, games never end: a few stray units keep
    // a dead empire technically alive forever.
    p.alive = false;
    for (let i = state.units.length - 1; i >= 0; i--) {
      if (state.units[i].owner === p.id) state.units.splice(i, 1);
    }
    log(state, `${p.name} has no cities left. What remains of them disperses.`, 'bad');
  }

  const survivors = state.players.filter((p) => p.alive);
  if (survivors.length === 1 && state.winner === null) {
    state.winner = survivors[0].id;
    log(state, `${survivors[0].name} stands alone. That is the whole of it.`, 'good');
    return;
  }

  // Nobody has managed it by the deadline: whoever built most, wins.
  if (state.winner === null && state.turn > state.settings.maxTurns) {
    const ranked = [...survivors].sort(
      (a, b) => playerScore(state, b.id) - playerScore(state, a.id),
    );
    if (ranked.length > 0) {
      state.winner = ranked[0].id;
      log(
        state,
        `Turn ${state.settings.maxTurns} passes. ${ranked[0].name} is declared ahead on points, which nobody finds satisfying.`,
        'good',
      );
    }
  }
}

export function beginPlayerTurn(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  if (!player.alive) return;

  refreshUnits(state, player);
  healUnits(state, playerId);
  runEconomy(state, player);
  resumeGotoOrders(state, playerId);
  recomputeVisibility(state, playerId);
  checkElimination(state);
}

/** Hand control to the next living player, advancing the calendar on wrap. */
export function endPlayerTurn(state: GameState): void {
  if (state.winner !== null) return;
  checkElimination(state);

  for (let step = 0; step < state.players.length; step++) {
    state.activePlayer++;
    if (state.activePlayer >= state.players.length) {
      state.activePlayer = 0;
      state.turn++;
    }
    if (state.players[state.activePlayer].alive) break;
  }

  beginPlayerTurn(state, state.activePlayer);
}

/** Units that still have moves and no standing order — the "anything left?" check. */
export function idleUnits(state: GameState, playerId: number) {
  return state.units.filter(
    (u) => u.owner === playerId && u.moves > 0 && u.order === 'none' && !u.goto,
  );
}
