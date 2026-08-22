import { BUILDINGS } from '../model/buildings';
import type { AutoBuild, City, GameState, ProductionItem, Unit } from '../model/types';
import {
  CALM_BONUS,
  autoBuildOf,
  garrisonOf,
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
  unitUpkeep, isGarrisoned,
  rushBlocked,
  rushBuy,
  rushCost,
  productionCostIn,
  syncCitizens,
  isRuined
} from '../sim/city';
import { bar, closeModal, escapeHtml, openModal } from './dom';
import { splitTrade } from '../sim/research';
import { openPedia } from './pedia';
import { CITIZEN_BY_ID, CITIZEN_MOODS } from '../model/citizens';
import { unitType } from '../model/units';

/**
 * Edge of one citizen portrait **as rendered**, which is what the offset below
 * has to be counted in.
 *
 * Not the 64px the sheet is cut at: `.citizen` sets `background-size: auto
 * 32px`, so the four faces occupy 128px on screen rather than 256. Stepping by
 * the source size walked straight off the end of the sheet -- a city of size 4
 * asked for -128px on a 128px-wide image and drew nothing at all. Size 1
 * looked fine only because its offset is zero either way.
 *
 * If the CSS height changes, this changes with it.
 */
const CITIZEN_FACE = 32;

/** Where a building's icon lives. Missing icons are removed on error. */
function buildingIconPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}buildings/${id}.png`;
}

/** Turns remaining on the current build, or null when it will never finish. */
/**
 * How the people here feel, from 0 (delighted) to 3 (furious).
 *
 * Rioting is its own answer. Otherwise it is how much room the city has left
 * before it stops being content: plenty of room and everyone is pleased,
 * standing at the limit and they are not.
 */
function moodOf(city: City, limit: number): number {
  if (city.disorder) return CITIZEN_MOODS - 1;
  const headroom = limit - city.size;
  if (headroom >= 3) return 0;
  if (headroom >= 2) return 1;
  if (headroom >= 1) return 2;
  return CITIZEN_MOODS - 1;
}

/**
 * A face per citizen.
 *
 * The roster is filled in on demand rather than required to exist, so a city
 * from an older save simply acquires people the first time it is opened.
 */
function citizenFaces(state: GameState, city: City, limit: number): string {
  const folk = syncCitizens(state, city);
  const mood = moodOf(city, limit);
  const base = import.meta.env.BASE_URL;
  const root = base.endsWith('/') ? base : `${base}/`;
  return folk
    .map((raceId, i) => {
      const race = CITIZEN_BY_ID[raceId];
      const name = race ? race.name : raceId;
      // Alternate the two sheets where a race has both, so a crowd is not
      // uniformly one or the other.
      const variant = race?.hasFemale && i % 2 === 1 ? `${raceId}-female` : raceId;
      return (
        `<span class="citizen" title="${escapeHtml(name)}${race ? ` — ${escapeHtml(race.blurb)}` : ''}" ` +
        `style="background-image:url('${root}citizens/${variant}.png');` +
        `background-position:-${mood * CITIZEN_FACE}px 0"></span>`
      );
    })
    .join('');
}

function turnsLeft(city: City, perTurn: number): number | null {
  const cost = productionCost(city.producing);
  // None of the standing choices finishes, so none of them has a countdown.
  if (city.producing.kind !== 'unit' && city.producing.kind !== 'building') return null;
  if (perTurn <= 0) return null;
  return Math.max(1, Math.ceil((cost - city.shields) / perTurn));
}

export function openCityPanel(
  state: GameState,
  city: City,
  onChange: () => void,
  onWake?: (unit: Unit) => void,
): void {
  const yields = cityYield(state, city);
  const surplus = foodSurplus(state, city);
  const options = buildOptions(state, city);
  const limit = contentLimit(state, city);
  const upkeep = unitUpkeep(state, city);
  const goldBonus = cityGoldBonus(state, city);
  const scienceBonus = cityScienceBonus(state, city);
  // What this city actually contributes, worked out the same way runEconomy
  // does it. Trade comes from worked tiles and every citizen works one, so
  // this is where a city's size turns into research -- which was true before
  // and simply never shown.
  const split = splitTrade(state.players[city.owner], yields.trade);
  const goldPerTurn = Math.round(split.gold * (1 + goldBonus));
  const beakersPerTurn = Math.round(split.beakers * (1 + scienceBonus));
  // A building that has stopped paying because nobody is standing in the city
  // otherwise just shows as a bonus of zero, which reads as the building being
  // broken rather than as a rule the player can act on.
  const idleGuarded = city.buildings.filter(
    (b) => BUILDINGS[b]?.needsGarrison && !isGarrisoned(state, city),
  );
  const netShields = yields.shields - upkeep;
  const eta = turnsLeft(city, netShields);

  // What this city does when it runs out of orders. Marked with the same
  // `armed` style the ability buttons use, so a set city reads at a glance.
  // Units resting here are drawn as a number on the city rather than on the
  // tile, so this list is the only way back to them.
  const garrison = garrisonOf(state, city);
  const auto = autoBuildOf(city);
  const autoBtn = (mode: AutoBuild, label: string, title: string) =>
    `<button class="small${auto === mode ? ' armed' : ''}" data-auto="${mode}"
             title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;

  const optionRow = (item: ProductionItem, name: string, cost: number, blurb: string) => {
    const active =
      (city.producing.kind === item.kind &&
        'id' in city.producing &&
        'id' in item &&
        city.producing.id === item.id) ||
      // The standing choices carry no id, so matching on kind is the whole of it.
      (city.producing.kind === item.kind && !('id' in item));
    const turns = netShields > 0 ? Math.max(1, Math.ceil((cost - city.shields) / netShields)) : null;
    return `
      <button class="build-option${active ? ' active' : ''}"
              data-kind="${item.kind}" data-id="${'id' in item ? escapeHtml(item.id) : ''}">
        <span class="build-name">${escapeHtml(name)}</span>
        <span class="build-cost">${cost > 0 ? `${cost}s` : '—'}${turns !== null && cost > 0 ? ` · ${turns}t` : ''}</span>
        ${
          'id' in item
            ? `<span class="build-info" data-pedia="${escapeHtml(item.id)}" title="Look it up in the Orcpedia">?</span>`
            : ''
        }
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
          <div class="citizen-row">${citizenFaces(state, city, limit)}</div>
          <div class="stat-row"><span class="label">Food</span><span class="value">${yields.food} (${surplus >= 0 ? '+' : ''}${surplus})</span></div>
          ${
            isRuined(state, city)
              ? `<div class="stat-row"><span class="label k-bad">Sacked</span><span class="value k-bad">still clearing the rubble &middot; nothing grows here for ${(city.ruinedUntil ?? 0) - state.turn} more turns</span></div>`
              : ''
          }
          ${bar(city.food, foodToGrow(city.size))}
          <div class="stat-row"><span class="label">Trade</span><span class="value">${yields.trade}/turn <span class="muted">(${goldPerTurn}g, ${beakersPerTurn} beakers)</span></span></div>
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
          ${
            idleGuarded.length
              ? `<div class="stat-row"><span class="label k-bad">Unguarded</span><span class="value k-bad">${idleGuarded
                  .map((b) => escapeHtml(BUILDINGS[b]?.name ?? b))
                  .join(', ')} pays nothing until a unit stands here</span></div>`
              : ''
          }
          <div class="stat-row"><span class="label">Founded</span><span class="value">Turn ${city.foundedTurn}</span></div>
        </div>
        <div class="panel-title">Garrison</div>
        <div class="panel-body garrison-row">
          ${
            garrison.length === 0
              ? '<span class="muted">Nobody is watching the gate.</span>'
              : garrison
                  .map(
                    (u) =>
                      `<button class="small" data-wake="${u.id}"
                               title="${escapeHtml(unitType(u.type).blurb)}">
                         ${escapeHtml(unitType(u.type).name)}
                         <span class="muted">${escapeHtml(u.order)}${
                           u.rank > 0 ? ` &middot; rank ${u.rank}` : ''
                         }</span>
                       </button>`,
                  )
                  .join(' ')
          }
        </div>
        <div class="panel-title">Standing Structures</div>
        <div class="panel-body">
          ${
            city.buildings.length === 0
              ? '<span class="muted">Nothing but tents and optimism.</span>'
              : city.buildings
                  .map(
                    (b) =>
                      `<a href="#" class="chip building-chip pedia-link" data-pedia="${escapeHtml(b)}"
                          title="${escapeHtml(BUILDINGS[b]?.blurb ?? '')}">
                        <img class="building-icon" src="${buildingIconPath(b)}" alt="" />
                        ${escapeHtml(BUILDINGS[b]?.name ?? b)}
                      </a>`,
                  )
                  .join('')
          }
        </div>
      </div>

      <div>
        <div class="panel-title">Building: ${escapeHtml(productionName(city.producing))}${eta !== null ? ` <span class="muted">(${eta} turns)</span>` : ''}</div>
        <div class="panel-body">
          ${bar(city.shields, Math.max(1, productionCost(city.producing)))}
          ${
            rushCost(state, city) > 0
              ? `<button class="small rush" data-rush="1"${rushBlocked(state, city) ? ' disabled' : ''}>
                   Buy for ${rushCost(state, city)}g
                 </button>
                 <span class="muted">${escapeHtml(rushBlocked(state, city) ?? `you have ${state.players[city.owner].gold}g`)}</span>`
              : ''
          }
        </div>
        <div class="panel-body auto-build">
          <span class="muted">When it finishes:</span>
          ${autoBtn('ask', 'Ask me', 'Stop and wait to be told what to build next')}
          ${autoBtn('repeat', 'Auto same unit', 'Go back to making the unit it was making')}
          ${autoBtn('coin', 'Auto coin', 'Bank the shields as gold and stop asking')}
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
                  .map((b) =>
                    optionRow(
                      { kind: 'building', id: b.id },
                      b.name,
                      // What this city will actually charge, which for an
                      // outpost depends on how far out it is.
                      productionCostIn(state, city, { kind: 'building', id: b.id }),
                      b.blurb,
                    ),
                  )
                  .join('')
          }
          ${optionRow({ kind: 'coin' }, 'Coin', 0, 'Turn production straight into gold.')}
          ${optionRow({ kind: 'beakers' }, 'Study', 0, 'Turn production straight into research.')}
          ${optionRow(
            { kind: 'calm' },
            'Placating',
            0,
            `Spend everything on keeping people calm. Worth ${CALM_BONUS} content citizens, and the one thing a rioting city can always get on with.`,
          )}
        </div>
      </div>
    </div>`;

  openModal({
    title: `${city.name} — size ${city.size}`,
    body,
    width: 'min(920px, 94vw)',
    onMount: (root) => {
      // Waking is the way back out: these units are not on the map to click.
      root.querySelectorAll<HTMLButtonElement>('[data-wake]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const unit = garrison.find((u) => u.id === Number(btn.dataset.wake));
          if (!unit) return;
          unit.order = 'none';
          closeModal();
          onWake?.(unit);
        });
      });
      root.querySelectorAll<HTMLImageElement>('.building-icon').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
      root.querySelectorAll<HTMLElement>('[data-pedia]').forEach((link) => {
        link.addEventListener('click', (e) => {
          // Stop the click reaching the build button underneath it.
          e.preventDefault();
          e.stopPropagation();
          openPedia(state.players[city.owner], link.dataset.pedia);
        });
      });
      root.querySelector<HTMLButtonElement>('[data-rush]')?.addEventListener('click', () => {
        if (!rushBuy(state, city)) return;
        onChange();
        openCityPanel(state, city, onChange);
      });
      root.querySelectorAll<HTMLButtonElement>('[data-auto]').forEach((btn) => {
        btn.addEventListener('click', () => {
          city.autoBuild = btn.dataset.auto as AutoBuild;
          onChange();
          openCityPanel(state, city, onChange);
        });
      });
      root.querySelectorAll<HTMLButtonElement>('.build-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          const kind = btn.dataset.kind as ProductionItem['kind'];
          const id = btn.dataset.id ?? '';
          // Switching build targets keeps accumulated shields, Civ2 style.
          city.producing = id
            ? ({ kind, id } as ProductionItem)
            : ({ kind } as ProductionItem);
          onChange();
          openCityPanel(state, city, onChange);
        });
      });
    },
  });
}
