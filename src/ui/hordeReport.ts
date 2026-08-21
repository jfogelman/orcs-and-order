import { TECHS_BY_ID } from '../model/techs';
import { unitType } from '../model/units';
import type { City, GameState, Unit } from '../model/types';
import {
  buildingUpkeep,
  capitalOf,
  cityIncome,
  cityYield,
  contentLimit,
  foodSurplus,
  foodToGrow,
  isRuined,
  productionCostIn,
  productionName,
  supplyQuality,
} from '../sim/city';
import { playerCities, playerUnits } from '../sim/gamestate';
import { techCost } from '../sim/research';
import { escapeHtml, openModal } from './dom';

/**
 * Everything you own, on one screen.
 *
 * Answers "where do I stand", which is a different question from the
 * end-of-turn summary's "what happened while I was not looking" -- one is a
 * snapshot and the other a log. Neither replaces the other.
 *
 * **Your own empire only.** There is no spying in this game, and inventing some
 * to feed a screen would be the tail wagging the dog. Nothing here reads any
 * player but the viewer's, which also means it can never leak a position the
 * fog is hiding.
 *
 * **Read-only and entirely derived.** It computes from `GameState` on open,
 * stores nothing and changes nothing, so it stays out of saves and cannot
 * break a game. Opened when wanted rather than pushed every turn, which would
 * be forty dismissals a game.
 */

/** What the empire earns and spends in a turn, computed the way the turn does. */
function economy(state: GameState, playerId: number) {
  const player = state.players[playerId];
  let gold = 0;
  let beakers = 0;
  let upkeep = 0;
  for (const city of playerCities(state, playerId)) {
    const income = cityIncome(state, city, player);
    gold += income.gold;
    beakers += income.beakers;
    upkeep += buildingUpkeep(city);
  }
  return { gold: gold - upkeep, beakers, upkeep };
}

/** Turns until the current advance lands, or null if that cannot be said. */
function researchEta(state: GameState, playerId: number, beakersPerTurn: number): number | null {
  const player = state.players[playerId];
  if (!player.researching || beakersPerTurn <= 0) return null;
  const tech = TECHS_BY_ID[player.researching];
  if (!tech) return null;
  const left = techCost(player, tech) - player.beakers;
  return left <= 0 ? 1 : Math.ceil(left / beakersPerTurn);
}

/** The short note after a city's name: what it most needs you to know. */
function cityFlags(state: GameState, city: City, capitalId: number | null): string {
  const flags: string[] = [];
  if (city.id === capitalId) flags.push('capital');
  if (city.disorder) flags.push('in disorder');
  if (isRuined(state, city)) flags.push('sacked');
  if (city.size > contentLimit(state, city)) flags.push('unhappy');
  return flags.join(', ');
}

function cityRow(state: GameState, city: City, capitalId: number | null): string {
  const yields = cityYield(state, city);
  const item = city.producing;
  const eta =
    item.kind === 'coin' || yields.shields <= 0
      ? null
      : Math.max(1, Math.ceil((productionCostIn(state, city, item) - city.shields) / yields.shields));
  const flags = cityFlags(state, city, capitalId);
  // The real helper rather than size * FOOD_PER_CITIZEN spelled out again,
  // which would quietly stop agreeing with the rules if the constant moved.
  const surplus = foodSurplus(state, city);
  return `
    <tr>
      <td>${escapeHtml(city.name)}${flags ? ` <span class="muted">(${escapeHtml(flags)})</span>` : ''}</td>
      <td class="num">${city.size}</td>
      <td class="num ${surplus < 0 ? 'bad-text' : ''}">${city.food}/${foodToGrow(city.size)}
        <span class="muted">${surplus >= 0 ? '+' : ''}${surplus}</span></td>
      <td>${escapeHtml(productionName(item))}${eta !== null ? ` <span class="muted">${eta}t</span>` : ''}</td>
    </tr>`;
}

/** Units gathered by what they are, since a list of ninety is not a report. */
function armyRows(state: GameState, units: Unit[]): string {
  const byType = new Map<string, Unit[]>();
  for (const u of units) {
    const list = byType.get(u.type) ?? [];
    list.push(u);
    byType.set(u.type, list);
  }
  if (byType.size === 0) {
    return '<tr><td colspan="4" class="muted">Nobody at all. This is a problem.</td></tr>';
  }
  return [...byType.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, list]) => {
      const promoted = list.filter((u) => u.rank > 0).length;
      // Out of supply is the one thing about a unit you cannot see on the map
      // without selecting it, and it decides how hard it fights.
      const stranded = list.filter((u) => supplyQuality(state, u) <= 0).length;
      return `
        <tr>
          <td>${escapeHtml(unitType(type as Unit['type']).name)}</td>
          <td class="num">${list.length}</td>
          <td class="num">${promoted || '—'}</td>
          <td class="num ${stranded > 0 ? 'bad-text' : ''}">${stranded || '—'}</td>
        </tr>`;
    })
    .join('');
}

export function openHordeReport(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  const cities = playerCities(state, playerId);
  const units = playerUnits(state, playerId);
  const capital = capitalOf(state, playerId);
  const { gold, beakers, upkeep } = economy(state, playerId);
  const eta = researchEta(state, playerId, beakers);
  const researching = player.researching ? TECHS_BY_ID[player.researching] : null;

  // The Horde gets a Report; the Kingdom gets something drier for the same
  // screen, because the joke costs nothing but the word.
  const title = player.faction === 'orc' ? 'Horde Report' : 'Kingdom Survey';

  openModal({
    title,
    width: 'min(720px, 96vw)',
    body: `
      <div class="panel-body report-summary">
        <div><span class="label">Cities</span><span class="value">${cities.length}</span></div>
        <div><span class="label">Units</span><span class="value">${units.length}</span></div>
        <div><span class="label">Treasury</span><span class="value">${player.gold}g
          <span class="muted ${gold < 0 ? 'bad-text' : ''}">(${gold >= 0 ? '+' : ''}${gold}/turn)</span></span></div>
        <div><span class="label">Upkeep</span><span class="value">${upkeep}g/turn</span></div>
        <div><span class="label">Research</span><span class="value">${
          researching
            ? `${escapeHtml(researching.name)} <span class="muted">${
                eta !== null ? `${eta}t` : 'stalled'
              }</span>`
            : '<span class="muted">nothing in particular</span>'
        }</span></div>
        <div><span class="label">Beakers</span><span class="value">${beakers}/turn</span></div>
      </div>

      <div class="panel-title">Cities</div>
      <div class="report-scroll">
        <table class="report-table">
          <thead><tr><th>Name</th><th class="num">Size</th><th class="num">Food</th><th>Building</th></tr></thead>
          <tbody>
            ${
              cities.length === 0
                ? '<tr><td colspan="4" class="muted">No cities. That is usually the end of it.</td></tr>'
                : cities.map((c) => cityRow(state, c, capital?.id ?? null)).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="panel-title">The army</div>
      <div class="report-scroll">
        <table class="report-table">
          <thead><tr><th>Kind</th><th class="num">Have</th><th class="num">Promoted</th><th class="num">Unsupplied</th></tr></thead>
          <tbody>${armyRows(state, units)}</tbody>
        </table>
      </div>`,
  });
}
