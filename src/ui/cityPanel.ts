import { idx } from '../engine/grid';
import { BUILDINGS } from '../model/buildings';
import { TERRAIN } from '../model/terrain';
import type {
  AutoBuild,
  City,
  GameState,
  ProductionItem,
  Unit,
  UnitOrder,
  UnitTypeId,
} from '../model/types';
import {
  CALM_BONUS,
  autoBuildOf,
  unitsInCity,
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
  isRuined,
  tileYield,
  tileWorkable,
  toggleChosenTile,
  clearChosenTiles,
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
/**
 * What a unit standing in a city is doing, in words the panel can show.
 *
 * `none` is the interesting one: the raw order reads as "nothing", when what it
 * means is that the unit is awake and has not been told to do anything -- which
 * is every unit the city has just finished building.
 */
const POSTURE: Record<UnitOrder, string> = {
  none: 'ready',
  skip: 'passed',
  sentry: 'sentry',
  fortified: 'fortified',
};

const CITIZEN_FACE = 32;

/** Terrain and land-special art, for the tiles in the fat cross. */
function terrainIconPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}terrain/${id}_0.png`;
}

function specialIconPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}specials/${id}.png`;
}

/**
 * The twenty-one tiles this city can reach, drawn as they sit on the map.
 *
 * Section 16: the greedy assignment was fine while every tile of a kind was
 * worth the same, and stopped being fine when land specials arrived -- at that
 * point it is choosing between things the player cannot see, and choosing
 * wrongly is invisible. So the yields are on the tiles, and the tiles can be
 * clicked.
 *
 * The four corners of the five-by-five are not in the fat cross, so they are
 * rendered as holes rather than left out, which would collapse the grid.
 */
function fatCross(state: GameState, city: City): string {
  const worked = new Set(city.workedTiles);
  const chosen = new Set(city.chosenTiles ?? []);
  const cells: string[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = city.x + dx;
      const y = city.y + dy;
      const corner = Math.abs(dx) === 2 && Math.abs(dy) === 2;
      if (corner || x < 0 || y < 0 || x >= state.width || y >= state.height) {
        cells.push('<div class="crop-cell empty"></div>');
        continue;
      }
      const i = idx(x, y, state.width);
      const t = state.terrain[i];
      const def = TERRAIN[t];
      const y2 = tileYield(state, i, dx === 0 && dy === 0);
      const special = state.specials[i] && def.special ? def.special : null;
      if (dx === 0 && dy === 0) {
        cells.push(
          `<div class="crop-cell centre" title="${escapeHtml(city.name)} itself, worked for free">
             <img src="${terrainIconPath(t)}" alt="" />
             <span class="crop-here">&#9733;</span>
             <span class="crop-yield">${y2.food}/${y2.shields}/${y2.trade}</span>
           </div>`,
        );
        continue;
      }
      const canWork = tileWorkable(state, city, i);
      const isWorked = worked.has(i);
      const isChosen = chosen.has(i);
      const classes = [
        'crop-cell',
        isWorked ? 'worked' : '',
        isChosen ? 'chosen' : '',
        !canWork && !isWorked ? 'blocked' : '',
      ].filter(Boolean).join(' ');
      const why = !canWork
        ? 'Somebody else has this one.'
        : isChosen
          ? 'Picked by you. Click to let it go.'
          : isWorked
            ? 'Worked by the usual arrangement. Click to keep it that way on purpose.'
            : 'Click to put somebody on it.';
      cells.push(
        `<button class="${classes}" data-tile="${i}" title="${escapeHtml(`${def.name}${special ? ` — ${special.name}` : ''}. ${why}`)}">
           <img src="${terrainIconPath(t)}" alt="" />
           ${special ? `<img class="crop-special" src="${specialIconPath(t)}" alt="" />` : ''}
           <span class="crop-yield">${y2.food}/${y2.shields}/${y2.trade}</span>
         </button>`,
      );
    }
  }
  return cells.join('');
}

/** Where a building's icon lives. Missing icons are removed on error. */
function buildingIconPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}buildings/${id}.png`;
}

/**
 * Where a creature's portrait lives.
 *
 * Keyed on the *base* creature rather than the group, because Three Orcs are
 * orcs: the map composes a group sprite at runtime by stamping the single
 * portrait, and a list one line high has no room for the crowd anyway.
 */
function unitIconPath(id: UnitTypeId): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}units/${unitType(id).base}.png`;
}

/**
 * Where the icon for a standing order lives -- banking coin, study, or buying
 * the mob a drink. Optional, like every other icon: a missing one leaves the
 * slot empty rather than breaking the column.
 */
function orderIconPath(kind: 'coin' | 'beakers' | 'calm'): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}orders/${kind}.png`;
}

/**
 * The little picture beside a line in the build list.
 *
 * Deliberately its own class rather than the one the chips use. A missing icon
 * here is *hidden* rather than removed, because removing it would collapse the
 * grid column and step every name on the list left by twenty-six pixels.
 */
function productionIcon(item: ProductionItem): string {
  const src =
    item.kind === 'unit'
      ? unitIconPath(item.id)
      : item.kind === 'building'
      ? buildingIconPath(item.id)
      : orderIconPath(item.kind);
  return `<img class="build-icon" src="${src}" alt="" />`;
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
  // Everything standing here, not only what is resting out of sight. Clicking
  // the city opens the city, so for a unit with no orders yet -- anything this
  // city has just built -- this list is the only way back to it.
  const garrison = unitsInCity(state, city);
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
        ${productionIcon(item)}
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
          <div class="crop-head">
            <span class="label">Land worked</span>
            ${
              city.chosenTiles?.length
                ? `<button class="small" data-clear-tiles>Let the game decide</button>`
                : '<span class="muted">Click a tile to work it yourself</span>'
            }
          </div>
          <div class="crop-grid">${fatCross(state, city)}</div>
          <div class="stat-row"><span class="label">Food</span><span class="value">${yields.food} (${surplus >= 0 ? '+' : ''}${surplus})</span></div>
          ${
            isRuined(state, city)
              ? `<div class="stat-row"><span class="label k-bad">Resettling</span><span class="value k-bad">the old lot are still leaving &middot; ${(city.ruinedUntil ?? 0) - state.turn} more turns before anyone grows, builds, or opens up</span></div>`
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
                      `<button class="small garrison-unit" data-wake="${u.id}"
                               title="${escapeHtml(unitType(u.type).blurb)}">
                         <img class="unit-icon" src="${unitIconPath(u.type)}" alt="" />
                         ${escapeHtml(unitType(u.type).name)}
                         <span class="muted">${escapeHtml(POSTURE[u.order])}${
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
      // Icons that sit inline -- on a structure chip or a garrison button --
      // are removed outright when the art is missing, because the text beside
      // them closes the gap tidily.
      root.querySelectorAll<HTMLImageElement>('.building-icon, .unit-icon').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
      // Icons in the build list hold a grid column open, so a missing one is
      // hidden in place. Removing it would shunt every name on the list left.
      root.querySelectorAll<HTMLImageElement>('.build-icon').forEach((img) => {
        img.addEventListener('error', () => {
          img.style.visibility = 'hidden';
        });
      });
      root.querySelectorAll<HTMLElement>('[data-pedia]').forEach((link) => {
        link.addEventListener('click', (e) => {
          // Stop the click reaching the build button underneath it.
          e.preventDefault();
          e.stopPropagation();
          openPedia(state.players[city.owner], link.dataset.pedia);
        });
      });
      // The fat cross. Redrawn wholesale after a click rather than patched:
      // one pick can move several citizens, since the greedy fill runs again
      // over whatever is left.
      root.querySelectorAll<HTMLButtonElement>('[data-tile]').forEach((cell) => {
        cell.addEventListener('click', () => {
          if (!toggleChosenTile(state, city, Number(cell.dataset.tile))) return;
          onChange();
          openCityPanel(state, city, onChange, onWake);
        });
      });
      root.querySelector<HTMLButtonElement>('[data-clear-tiles]')?.addEventListener('click', () => {
        clearChosenTiles(state, city);
        onChange();
        openCityPanel(state, city, onChange, onWake);
      });
      // Terrain art is optional like everything else; a missing tile picture
      // leaves the cell showing its yields, which is the part that matters.
      root.querySelectorAll<HTMLImageElement>('.crop-cell img').forEach((img) => {
        img.addEventListener('error', () => img.remove());
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
