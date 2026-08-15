import { BUILDINGS, BUILDING_IDS } from '../model/buildings';
import { FACTIONS } from '../model/factions';
import { TERRAIN, TERRAIN_IDS } from '../model/terrain';
import { TECHS, TECHS_BY_ID } from '../model/techs';
import { CREATURES, CREATURES_BY_ID, UNIT_TYPES, unitType } from '../model/units';
import type { UnitTypeDef } from '../model/units';
import type { FactionId, Player, UnitTypeId } from '../model/types';
import { SpriteCache } from '../render/spriteCache';
import { escapeHtml, openModal } from './dom';

/**
 * The Orcpedia: what everything is, what it costs, and what unlocks it.
 *
 * Reachable from any unit's name, so the answer to "what *is* this thing"
 * is always one click away rather than something you infer from losing.
 */

let sprites: SpriteCache | null = null;

/**
 * Point straight at the artwork on disk rather than at the sprite cache.
 *
 * Asking the cache would hand back whatever is loaded at this instant, which
 * for a unit not yet seen on the map is the procedural placeholder -- so the
 * encyclopedia would show placeholder art for the very units the player has
 * not met and most wants to look up. A missing file falls back to the
 * placeholder in `onMount` instead.
 */
function artPath(creatureId: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}units/${creatureId}.png`;
}

/** The procedural drawing, for when there is no artwork to point at. */
function placeholderFor(id: UnitTypeId): string {
  if (!sprites) sprites = new SpriteCache();
  const art = sprites.unit(id) as HTMLCanvasElement;
  return typeof art.toDataURL === 'function' ? art.toDataURL() : '';
}

/** Which advance makes this unit buildable, if any. */
function unlockedBy(id: UnitTypeId): string | null {
  const tech = TECHS.find((t) => t.units.includes(id));
  return tech ? tech.name : null;
}

function unitCard(def: UnitTypeDef): string {
  const tech = unlockedBy(def.id);
  const notes: string[] = [];
  if (def.settler) notes.push('founds cities');
  if (def.flies) notes.push('flies over anything');
  if (def.siegeBonus > 1) notes.push(`x${def.siegeBonus} against cities`);
  if (def.crowded) notes.push('-1 movement until coordinated');

  return `
    <div class="pedia-card" id="pedia-${escapeHtml(def.id)}">
      <img class="pedia-art" src="${artPath(def.base)}" data-unit="${escapeHtml(def.id)}" alt="" />
      <div class="pedia-body">
        <div class="pedia-name">${escapeHtml(def.name)}</div>
        <div class="pedia-stats">
          <span title="Attack">A ${def.attack}</span>
          <span title="Defence">D ${def.defense}</span>
          <span title="Health">HP ${def.hp}</span>
          <span title="Movement">M ${def.move}</span>
          <span title="Shield cost">${def.cost}s</span>
        </div>
        ${tech ? `<div class="pedia-tech">Needs ${escapeHtml(tech)}</div>` : ''}
        ${notes.length ? `<div class="pedia-notes">${escapeHtml(notes.join(' &middot; '))}</div>` : ''}
        <div class="pedia-flavor">${escapeHtml(def.blurb)}</div>
      </div>
    </div>`;
}

function creatureSection(faction: FactionId): string {
  const creatures = CREATURES.filter((c) => c.faction === faction);
  return creatures
    .map((c) => {
      const variants = c.counts.map((n) => UNIT_TYPES[n === 1 ? c.id : `${c.id}_x${n}`]);
      const base = variants[0];
      const ladder =
        variants.length > 1
          ? `<div class="pedia-ladder">${variants
              .map(
                (v) =>
                  `<span class="chip" title="${escapeHtml(v.name)}: A${v.attack} D${v.defense} HP${v.hp} ${v.cost}s">${v.count}</span>`,
              )
              .join('')}<span class="pedia-ladder-note">group sizes</span></div>`
          : '';
      return unitCard(base).replace('</div>\n    </div>', `${ladder}</div>\n    </div>`);
    })
    .join('');
}

/**
 * Open the encyclopedia, optionally jumping to one entry.
 *
 * `focus` takes either a unit type or a building id and works out which it is,
 * so callers can pass whatever they happen to be showing without caring.
 */
export function openPedia(player: Player, focus?: string): void {
  const faction = player.faction;
  const other: FactionId = faction === 'orc' ? 'human' : 'orc';

  const techList = TECHS.filter((t) => t.faction === 'both' || t.faction === faction)
    .map(
      (t) => `
      <div class="pedia-tech-row">
        <span class="pedia-tech-name">${escapeHtml(t.name)}</span>
        <span class="pedia-tech-cost">${t.cost === 0 ? 'known from the start' : `${t.cost} beakers`}</span>
        <span class="pedia-tech-needs">${
          t.prereqs.length
            ? escapeHtml(t.prereqs.map((p) => TECHS_BY_ID[p]?.name ?? p).join(' + '))
            : '&mdash;'
        }</span>
        <span class="pedia-flavor">${escapeHtml(t.flavor)}</span>
      </div>`,
    )
    .join('');

  const terrainList = TERRAIN_IDS.map((id) => {
    const t = TERRAIN[id];
    return `
      <div class="pedia-tech-row">
        <span class="pedia-tech-name">${escapeHtml(t.name)}</span>
        <span class="pedia-tech-cost">${t.food}/${t.shields}/${t.trade}</span>
        <span class="pedia-tech-needs">move ${t.moveCost} &middot; defence x${t.defense}</span>
        <span class="pedia-flavor">${t.water ? 'Land units cannot enter.' : ''}${
          t.noCity ? ' No cities here.' : ''
        }${t.blocksSight ? ' Blocks line of sight.' : ''}</span>
      </div>`;
  }).join('');

  const buildingList = BUILDING_IDS.map((id) => BUILDINGS[id])
    .filter((b) => b.faction === 'both' || b.faction === faction)
    .map(
      (b) => `
      <div class="pedia-tech-row" id="pedia-b-${escapeHtml(b.id)}">
        <span class="pedia-tech-name">${escapeHtml(b.name)}</span>
        <span class="pedia-tech-cost">${b.cost}s &middot; ${b.upkeep}g/turn</span>
        <span class="pedia-tech-needs">${escapeHtml(
          TECHS.find((t) => t.buildings.includes(b.id))?.name ?? '&mdash;',
        )}</span>
        <span class="pedia-flavor">${escapeHtml(b.blurb)}</span>
      </div>`,
    )
    .join('');

  openModal({
    title: 'Orcpedia',
    width: 'min(1100px, 96vw)',
    body: `
      <div class="pedia-tabs">
        <button class="pedia-tab active" data-tab="yours">${escapeHtml(FACTIONS[faction].name)}</button>
        <button class="pedia-tab" data-tab="theirs">${escapeHtml(FACTIONS[other].name)}</button>
        <button class="pedia-tab" data-tab="techs">Advances</button>
        <button class="pedia-tab" data-tab="buildings">Structures</button>
        <button class="pedia-tab" data-tab="terrain">Terrain</button>
      </div>

      <div class="pedia-pane" data-pane="yours">
        <p class="flavor">${escapeHtml(FACTIONS[faction].blurb)}</p>
        <div class="pedia-grid">${creatureSection(faction)}</div>
      </div>
      <div class="pedia-pane" data-pane="theirs" hidden>
        <p class="flavor">${escapeHtml(FACTIONS[other].blurb)}</p>
        <div class="pedia-grid">${creatureSection(other)}</div>
      </div>
      <div class="pedia-pane" data-pane="techs" hidden>
        <p class="flavor">Costs shown are the base price, before the surcharge for
        everything already known.</p>
        <div class="pedia-rows">${techList}</div>
      </div>
      <div class="pedia-pane" data-pane="buildings" hidden>
        <div class="pedia-rows">${buildingList}</div>
      </div>
      <div class="pedia-pane" data-pane="terrain" hidden>
        <p class="flavor">Yields are food / shields / trade.</p>
        <div class="pedia-rows">${terrainList}</div>
      </div>`,
    onMount: (root) => {
      // Swap in the procedural drawing wherever there is no artwork yet, so a
      // gap in the art shows a sprite rather than a broken-image icon.
      root.querySelectorAll<HTMLImageElement>('.pedia-art').forEach((img) => {
        img.addEventListener('error', () => {
          const id = img.dataset.unit;
          if (id) img.src = placeholderFor(id);
        });
      });

      const panes = root.querySelectorAll<HTMLElement>('.pedia-pane');
      root.querySelectorAll<HTMLButtonElement>('.pedia-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          root
            .querySelectorAll('.pedia-tab')
            .forEach((t) => t.classList.toggle('active', t === tab));
          panes.forEach((p) => {
            p.hidden = p.dataset.pane !== tab.dataset.tab;
          });
        });
      });

      // Jump to whatever we were asked to show.
      const jumpTo = (tab: string, selector: string) => {
        root.querySelector<HTMLButtonElement>(`.pedia-tab[data-tab="${tab}"]`)?.click();
        const target = root.querySelector(selector);
        target?.scrollIntoView({ block: 'center' });
        target?.classList.add('pedia-highlight');
      };

      if (focus && UNIT_TYPES[focus]) {
        const creature = CREATURES_BY_ID[unitType(focus).base];
        jumpTo(
          creature.faction === faction ? 'yours' : 'theirs',
          `#pedia-${CSS.escape(creature.id)}`,
        );
      } else if (focus && BUILDINGS[focus]) {
        jumpTo('buildings', `#pedia-b-${CSS.escape(focus)}`);
      }
    },
  });
}
