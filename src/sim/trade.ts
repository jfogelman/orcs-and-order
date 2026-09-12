import { idx } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import type { BuildingId, City, GameState, Player } from '../model/types';
import { cityGoldBonus, workingBuildings } from './city';
import { log } from './gamestate';
import { connectedByRoad } from './roads';

/**
 * Trade routes: what a road is for, once it has stopped being a shortcut.
 *
 * Section 27's third step and section 106's rule. Two of your own cities joined
 * by an unbroken road, each with something in it that makes money, pay a little
 * gold a turn for the trouble of having dug it.
 *
 * The rules, and why each one is the way it is:
 *
 * - **Both ends need a gold building.** The Goblin Treasury or the Simple
 *   Market, or the bigger ones that stand on those. A road between two villages
 *   with nothing to sell is a road, not a trade route.
 * - **It pays only while both ends are earning.** Those buildings pay nothing
 *   without a soldier standing in the city, and a link cannot pay a city that is
 *   itself paying nothing. The link is still listed, marked idle, because a
 *   garrison that has wandered off is a thing a player should be able to see.
 * - **Distance is measured straight, not along the road.** Measured along the
 *   road, a deliberately winding road would pay more than a direct one, which
 *   rewards building badly.
 * - **Scaled to the map.** A link spanning the whole map is worth about the same
 *   on a small map as on a large one, because the scale is the map's own size.
 *   Gold rounds, so a short link on a large map is worth nothing and is dropped.
 * - **And a floor that does not move with the map.** Cities are founded three
 *   tiles apart at the closest, and on a small map the rounding alone would pay
 *   a coin for a road three tiles long. Five tiles, on every map size, so the
 *   reward is for digging rather than for founding two cities side by side.
 * - **Two links a city.** Every pair is n-squared, and a web of small cities all
 *   joined to each other would multiply into an economy of its own. A city is
 *   paid for its best two, which keeps this a reason to dig rather than a reason
 *   to found.
 */
export const TRADE = {
  /**
   * Whether trade routes pay at all. A lever, so the sweep can measure the
   * economy with them and without.
   */
  enabled: true,
  /** Gold a turn for a link spanning the map's scale: half its width plus height. */
  goldAtFullSpan: 6,
  /** Links a city is paid for: its best ones, by what they pay. */
  maxLinksPerCity: 2,
  /** Tiles apart, at the least, before a pair of cities is a trade route at all. */
  minDistance: 5,
};

/** A pair of one player's cities joined by road, and what the pair pays. */
export interface TradeLink {
  /** City ids, smaller first, so a link has one name from either end. */
  a: number;
  b: number;
  /** Straight-line (Chebyshev) tiles between the two cities. */
  distance: number;
  /** Gold a turn, while it is paying. */
  gold: number;
  /** Whether both ends' gold buildings are actually earning right now. */
  paying: boolean;
}

/** One name for a link, whichever end asks. */
export function linkKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** The thing in this city that makes money, if it has one and it is open. */
export function goldBuildingIn(state: GameState, city: City): BuildingId | null {
  return workingBuildings(state, city).find((b) => BUILDINGS[b]?.goldBonus) ?? null;
}

/**
 * Gold a turn for a link of this length.
 *
 * Rounded, so on a large map a short road is worth nothing at all. The floor
 * that does not depend on the map is `minDistance`, applied where links are
 * found rather than here.
 */
export function linkGold(state: GameState, distance: number): number {
  const scale = (state.width + state.height) / 2;
  return Math.round((TRADE.goldAtFullSpan * distance) / scale);
}

/**
 * Every trade link this player has, paying or idle.
 *
 * Cheap in the common case: no road anywhere on the map, or fewer than two
 * cities with anything to sell, and there is nothing to walk.
 */
export function tradeLinks(state: GameState, playerId: number): TradeLink[] {
  if (!TRADE.enabled || !state.roads) return [];
  const cities = state.cities.filter((c) => c.owner === playerId && goldBuildingIn(state, c));
  if (cities.length < 2) return [];

  // Road networks, walked once per network rather than once per city: the second
  // city on a network is found inside the first one's set.
  const networks: Array<Set<number>> = [];
  const networkOf = new Map<number, number>();
  for (const c of cities) {
    const here = idx(c.x, c.y, state.width);
    let found = networks.findIndex((n) => n.has(here));
    if (found < 0) {
      networks.push(connectedByRoad(state, playerId, c.x, c.y));
      found = networks.length - 1;
    }
    networkOf.set(c.id, found);
  }

  const earning = new Map(cities.map((c) => [c.id, cityGoldBonus(state, c) > 0]));
  const pairs: TradeLink[] = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const a = cities[i];
      const b = cities[j];
      if (networkOf.get(a.id) !== networkOf.get(b.id)) continue;
      const distance = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      if (distance < TRADE.minDistance) continue;
      const gold = linkGold(state, distance);
      if (gold <= 0) continue;
      pairs.push({
        a: Math.min(a.id, b.id),
        b: Math.max(a.id, b.id),
        distance,
        gold,
        paying: !!earning.get(a.id) && !!earning.get(b.id),
      });
    }
  }

  // Each city keeps its best links. An idle link still takes a place, because it
  // is still one of the city's best two: a garrison walking back in should not
  // have to wait for the bookkeeping to notice.
  pairs.sort((p, q) => q.gold - p.gold || q.distance - p.distance || p.a - q.a || p.b - q.b);
  const taken = new Map<number, number>();
  const at = (id: number) => taken.get(id) ?? 0;
  const kept: TradeLink[] = [];
  for (const p of pairs) {
    if (at(p.a) >= TRADE.maxLinksPerCity || at(p.b) >= TRADE.maxLinksPerCity) continue;
    taken.set(p.a, at(p.a) + 1);
    taken.set(p.b, at(p.b) + 1);
    kept.push(p);
  }
  kept.sort((p, q) => p.a - q.a || p.b - q.b);
  return kept;
}

/** Gold a turn from this player's trade routes. */
export function tradeGold(state: GameState, playerId: number): number {
  return tradeLinks(state, playerId).reduce((sum, l) => sum + (l.paying ? l.gold : 0), 0);
}

/** This city's links, for the city view. */
export function linksForCity(state: GameState, city: City): TradeLink[] {
  return tradeLinks(state, city.owner).filter((l) => l.a === city.id || l.b === city.id);
}

/** The other end of a link. */
export function otherEnd(state: GameState, link: TradeLink, cityId: number): City | undefined {
  return state.cities.find((c) => c.id === (link.a === cityId ? link.b : link.a));
}

/**
 * Tell the player what changed, and hand back what the routes pay.
 *
 * Gold that simply starts arriving is a rule nobody can see -- section 73's
 * finding about shortcuts that existed and were never shown. So a link that
 * opens says so, names both ends and what it pays, and points at one of them; a
 * link that closes says that too, whether the road was cut, a building sold, or
 * a city lost.
 *
 * The keys are kept on the player so the comparison survives a save, and a game
 * that has never had a trade route carries nothing.
 */
export function updateTradeLinks(state: GameState, player: Player): number {
  const links = tradeLinks(state, player.id);
  const before = new Set(player.tradeLinks ?? []);
  const now = links.map((l) => linkKey(l.a, l.b));
  const named = (id: number) => state.cities.find((c) => c.id === id)?.name ?? 'somewhere';

  for (const l of links) {
    if (before.has(linkKey(l.a, l.b))) continue;
    const seat = state.cities.find((c) => c.id === l.a);
    // A route that opens idle is still news, but saying "4 gold a turn" when it
    // is paying nothing would be a lie the player has no way to check.
    log(
      state,
      l.paying
        ? `The road joins ${named(l.a)} and ${named(l.b)}: a trade route, ${l.gold} gold a turn.`
        : `The road joins ${named(l.a)} and ${named(l.b)}: a trade route worth ${l.gold} gold a turn, ` +
          'once somebody stands guard over the gold at both ends.',
      l.paying ? 'good' : 'info',
      player.id,
      l.paying ? 'coin' : undefined,
      seat ? [seat.x, seat.y] : undefined,
    );
  }
  for (const key of before) {
    if (now.includes(key)) continue;
    const [a, b] = key.split('-').map(Number);
    log(state, `The trade route between ${named(a)} and ${named(b)} is no more.`, 'bad', player.id);
  }

  if (now.length > 0) player.tradeLinks = now;
  else delete player.tradeLinks;
  return links.reduce((sum, l) => sum + (l.paying ? l.gold : 0), 0);
}
