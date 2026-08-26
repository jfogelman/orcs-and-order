import { BUILDINGS } from '../model/buildings';
import type { GameState } from '../model/types';
import { unitType } from '../model/units';
import {
  ROLE_NAMES,
  type Situation,
  advisorLine,
  advisorsFor,
} from '../model/advisors';
import {
  buildingUpkeep,
  cityIncome,
  contentLimit,
  foodSurplus,
  isGarrisoned,
} from '../sim/city';
import { playerCities, playerUnits } from '../sim/gamestate';
import { tradeRates, unlockedBuildings } from '../sim/research';
import { TECHS_BY_ID } from '../model/techs';
import { escapeHtml, openModal } from './dom';

/**
 * The advisor panel: six opinions about the same empire.
 *
 * Read-only and entirely derived, like the report. It reads nothing but the
 * viewer's own player, so it can no more leak a hidden position than the report
 * can -- an advisor may only be alarmed about enemies the viewer has actually
 * seen.
 */

/** Where an advisor's portrait lives. Missing art leaves the name and the line. */
function portraitPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}advisors/${id}.png`;
}

/**
 * Gather everything the six of them might have an opinion about, once.
 *
 * Done in one pass and handed to all of them, so nobody re-walks the city list
 * and two advisors cannot end up disagreeing about the *facts*. They are only
 * meant to disagree about what to do.
 */
export function situationOf(state: GameState, playerId: number): Situation {
  const player = state.players[playerId];
  const cities = playerCities(state, playerId);
  const units = playerUnits(state, playerId);

  let goldPerTurn = 0;
  let beakersPerTurn = 0;
  let rioting = 0;
  let restless = 0;
  let starving = 0;
  let undefended = 0;
  let walled = 0;
  let barracks = 0;
  let coinBuildings = 0;
  let calmBuildings = 0;
  let supplyPosts = 0;

  for (const city of cities) {
    const income = cityIncome(state, city, player);
    goldPerTurn += income.gold - buildingUpkeep(city);
    beakersPerTurn += income.beakers;

    if (city.disorder) rioting++;
    // One short of the line counts as restless: an advisor warning you the turn
    // after it happens is a historian.
    else if (city.size >= contentLimit(state, city)) restless++;
    if (foodSurplus(state, city) < 0) starving++;
    if (!isGarrisoned(state, city)) undefended++;

    if (city.buildings.includes('walls')) walled++;
    for (const id of city.buildings) {
      const def = BUILDINGS[id];
      if (!def) continue;
      if (def.startingRank !== undefined || id === 'barracks') barracks++;
      if (def.goldBonus) coinBuildings++;
      if (def.contentBonus) calmBuildings++;
      if (def.suppliesArmy) supplyPosts++;
    }
  }

  const seen = player.visible;
  const w = state.width;
  const enemiesSeen = state.units.filter(
    (u) => u.owner !== playerId && unitType(u.type).attack > 0 && seen[u.y * w + u.x],
  ).length;

  const fighters = units.filter((u) => unitType(u.type).attack > 0);

  return {
    turn: state.turn,
    faction: player.faction,
    cities: cities.length,
    rioting,
    restless,
    starving,
    gold: player.gold,
    goldPerTurn,
    beakersPerTurn,
    rates: tradeRates(player),
    researching: player.researching ? TECHS_BY_ID[player.researching]?.name ?? null : null,
    undefended,
    enemiesSeen,
    army: fighters.length,
    magicUnits: fighters.filter((u) => unitType(u.type).damageKind === 'magic').length,
    // The cheap and numerous, which is exactly who the Death Knight means.
    // Reuses the flag the Goblin Catapult loads itself with, since "expendable"
    // is already the game's word for these two.
    rankAndFile: fighters.filter((u) => unitType(u.type).expendable).length,
    paladins: fighters.filter((u) => unitType(u.type).base === 'paladin').length,
    walled,
    wallsAvailable: unlockedBuildings(player).some((b) => b.id === 'walls'),
    barracks,
    coinBuildings,
    calmBuildings,
    supplyPosts,
  };
}

export function openAdvisors(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  const situation = situationOf(state, playerId);
  const advisors = advisorsFor(player.faction);

  const card = (a: (typeof advisors)[number]) => `
    <div class="advisor">
      <img class="advisor-face" src="${portraitPath(a.id)}" alt="" />
      <div class="advisor-who">
        <span class="advisor-name">${escapeHtml(a.name)}</span>
        <span class="advisor-role muted">${escapeHtml(ROLE_NAMES[a.role])}</span>
        <span class="advisor-blurb muted">${escapeHtml(a.blurb)}</span>
      </div>
      <div class="advisor-line">${escapeHtml(advisorLine(a, situation))}</div>
    </div>`;

  openModal({
    title: player.faction === 'orc' ? 'Those Who Advise' : 'The Council',
    width: 'min(760px, 96vw)',
    body: `
      <div class="panel-body advisor-note muted">
        Six people with opinions. They are not experts and they do not agree;
        each one wants what they have always wanted, and will find a reason.
      </div>
      <div class="advisors">${advisors.map(card).join('')}</div>`,
    onMount: (root) => {
      // Art arrives a file at a time, so a missing portrait leaves the name and
      // the opinion rather than a broken-image glyph.
      root.querySelectorAll<HTMLImageElement>('.advisor-face').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
    },
  });
}
