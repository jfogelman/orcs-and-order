import { BUILDINGS } from '../model/buildings';
import type { City, GameState, ProductionItem } from '../model/types';
import {
  buildOptions,
  cityYield,
  contentLimit,
  foodSurplus,
  cityGoldBonus,
  cityScienceBonus,
  foodToGrow,
  freeSupport,
  productionCost,
  productionName,
  unitUpkeep,
} from '../sim/city';
import { bar, escapeHtml, openModal } from './dom';

/** Where a building's icon lives. Missing icons are removed on error. */
function buildingIconPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}buildings/${id}.png`;
}

/** Turns remaining on the current build, or null when it will never finish. */
function turnsLeft(city: City, perTurn: number): number | null {
  const cost = productionCost(city.producing);
  if (city.producing.kind === 'coin') return null;
  if (perTurn <= 0) return null;
  return Math.max(1, Math.ceil((cost - city.shields) / perTurn));
}

export function openCityPanel(
  state: GameState,
  city: City,
  onChange: () => void,
): void {
  const yields = cityYield(state, city);
  const surplus = foodSurplus(state, city);
  const options = buildOptions(state, city);
  const limit = contentLimit(state, city);
  const upkeep = unitUpkeep(state, city);
  const goldBonus = cityGoldBonus(city);
  const scienceBonus = cityScienceBonus(city);
  const netShields = yields.shields - upkeep;
  const eta = turnsLeft(city, netShields);

  const optionRow = (item: ProductionItem, name: string, cost: number, blurb: string) => {
    const active =
      (city.producing.kind === item.kind &&
        'id' in city.producing &&
        'id' in item &&
        city.producing.id === item.id) ||
      (city.producing.kind === 'coin' && item.kind === 'coin');
    const turns = netShields > 0 ? Math.max(1, Math.ceil((cost - city.shields) / netShields)) : null;
    return `
      <button class="build-option${active ? ' active' : ''}"
              data-kind="${item.kind}" data-id="${'id' in item ? escapeHtml(item.id) : ''}">
        <span class="build-name">${escapeHtml(name)}</span>
        <span class="build-cost">${cost > 0 ? `${cost}s` : '—'}${turns !== null && cost > 0 ? ` · ${turns}t` : ''}</span>
        <span class="build-blurb">${escapeHtml(blurb)}</span>
      </button>`;
  };

  const body = `
    <div class="city-grid">
      <div>
        <div class="panel-title">The State of ${escapeHtml(city.name)}</div>
        <div class="panel-body">
          <div class="stat-row"><span class="label">Citizens</span><span class="value">${city.size}${city.disorder ? ' <span class="k-bad">(disorder)</span>' : ''}</span></div>
          <div class="stat-row"><span class="label">Content up to</span><span class="value">${limit}</span></div>
          <div class="stat-row"><span class="label">Food</span><span class="value">${yields.food} (${surplus >= 0 ? '+' : ''}${surplus})</span></div>
          ${bar(city.food, foodToGrow(city.size))}
          <div class="stat-row"><span class="label">Shields</span><span class="value">${netShields}/turn${upkeep > 0 ? ` <span class="muted">(${yields.shields} − ${upkeep} rations)</span>` : ''}</span></div>
          <div class="stat-row"><span class="label">Supports free</span><span class="value">${freeSupport(city)} units</span></div>
          <div class="stat-row"><span class="label">Trade</span><span class="value">${yields.trade}/turn</span></div>
          ${
            goldBonus > 0
              ? `<div class="stat-row"><span class="label">Gold here</span><span class="value">+${Math.round(goldBonus * 100)}%</span></div>`
              : ''
          }
          ${
            scienceBonus > 0
              ? `<div class="stat-row"><span class="label">Research here</span><span class="value">+${Math.round(scienceBonus * 100)}%</span></div>`
              : ''
          }
          <div class="stat-row"><span class="label">Founded</span><span class="value">Turn ${city.foundedTurn}</span></div>
        </div>
        <div class="panel-title">Standing Structures</div>
        <div class="panel-body">
          ${
            city.buildings.length === 0
              ? '<span class="muted">Nothing but tents and optimism.</span>'
              : city.buildings
                  .map(
                    (b) =>
                      `<div class="chip building-chip" title="${escapeHtml(BUILDINGS[b]?.blurb ?? '')}">
                        <img class="building-icon" src="${buildingIconPath(b)}" alt="" />
                        ${escapeHtml(BUILDINGS[b]?.name ?? b)}
                      </div>`,
                  )
                  .join('')
          }
        </div>
      </div>

      <div>
        <div class="panel-title">Building: ${escapeHtml(productionName(city.producing))}${eta !== null ? ` <span class="muted">(${eta} turns)</span>` : ''}</div>
        <div class="panel-body">
          ${bar(city.shields, Math.max(1, productionCost(city.producing)))}
        </div>
        <div class="panel-title">Units</div>
        <div class="build-list">
          ${options.units.map((u) => optionRow({ kind: 'unit', id: u.id }, u.name, u.cost, u.blurb)).join('')}
        </div>
        <div class="panel-title">Structures</div>
        <div class="build-list">
          ${
            options.buildings.length === 0
              ? '<div class="panel-body muted">Nothing new to put up.</div>'
              : options.buildings
                  .map((b) => optionRow({ kind: 'building', id: b.id }, b.name, b.cost, b.blurb))
                  .join('')
          }
          ${optionRow({ kind: 'coin' }, 'Coin', 0, 'Turn production straight into gold.')}
        </div>
      </div>
    </div>`;

  openModal({
    title: `${city.name} — size ${city.size}`,
    body,
    width: 'min(920px, 94vw)',
    onMount: (root) => {
      root.querySelectorAll<HTMLImageElement>('.building-icon').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
      root.querySelectorAll<HTMLButtonElement>('.build-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const kind = btn.dataset.kind as ProductionItem['kind'];
          const id = btn.dataset.id ?? '';
          // Switching build targets keeps accumulated shields, Civ2 style.
          city.producing = kind === 'coin' ? { kind: 'coin' } : ({ kind, id } as ProductionItem);
          onChange();
          openCityPanel(state, city, onChange);
        });
      });
    },
  });
}
