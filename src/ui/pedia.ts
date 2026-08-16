import { BUILDINGS, BUILDING_IDS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
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

/** Icons for the non-unit tabs, all of which are already on disk. */
function assetPath(folder: string, name: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}${folder}/${name}.png`;
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

/**
 * Everything this unit can do that the four numbers above it do not say.
 *
 * Written out rather than left as icons: a player who cannot find out that a
 * sapper detonates, or that an axethrower is ruined by throwing its axe, will
 * read both as the unit being broken.
 */
function abilityNotes(def: UnitTypeDef): string[] {
  const notes: string[] = [];
  if (def.settler) notes.push('founds cities');
  if (def.flies) notes.push('flies over anything, at no extra cost');
  if (def.siegeBonus > 1) notes.push(`×${def.siegeBonus} attacking a city`);
  if (def.range > 1) {
    notes.push(
      `strikes from exactly ${def.range} tiles for a few rounds, and is not struck back — costs the whole turn`,
    );
  }
  if (def.throwsWeapon) {
    notes.push(
      'throws harder than it swings, but has only the one axe: afterwards it fights at a quarter strength until it reaches a friendly city or kills somebody',
    );
  }
  if (def.healsTo > 0) {
    // The card is the single-creature one, but the interesting fact is that
    // the heal scales -- a pair finish the job a lone one leaves half done.
    const counts = CREATURES_BY_ID[def.base]?.counts ?? [1];
    const biggest = UNIT_TYPES[`${def.base}_x${counts[counts.length - 1]}`];
    const scales =
      def.count === 1 && biggest !== undefined && biggest.healsTo > def.healsTo
        ? ` — ${biggest.name} take them all the way to ${Math.round(biggest.healsTo * 100)}%`
        : '';
    notes.push(
      `patches up a neighbour to ${Math.round(def.healsTo * 100)}% of their health, for the whole turn${scales}`,
    );
  }
  if (def.lineBreath) {
    notes.push('breath carries into the tile behind the target — including your own units');
  }
  if (def.explodes > 0) {
    notes.push(
      `killed defending, it detonates for ${Math.round(def.explodes * 100)}% of the health of everything adjacent — friend and enemy alike`,
    );
  }
  if (def.demolishes) notes.push('brings a city’s walls down, and goes with them');
  if (def.executeChance > 0) {
    notes.push(
      `${Math.round(def.executeChance * 100)}% chance to finish off a defender already under half health, if it is no larger`,
    );
  }
  if (def.regenMultiplier > 1) notes.push(`heals ${def.regenMultiplier}× as fast as anything else`);
  if (def.crowded) notes.push('−1 movement until coordinated: too many of them, nobody agreeing');
  return notes;
}

/**
 * What a structure actually does, in words.
 *
 * The blurbs are jokes and the cost is a number; between them a player had no
 * way to find out that Walls stop mattering the moment a siege engine turns
 * up, or that a Broken Catapult does nothing whatsoever for a garrison that
 * stays put. Read off the data so it cannot drift from the rules.
 */
function buildingEffects(b: BuildingDef): string[] {
  const out: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  if (b.defenseMult !== undefined && b.defenseMult !== 1) {
    out.push(
      `×${b.defenseMult} defence for units in this city` +
        (b.negatedBySiege
          ? ' — but a siege engine ignores it entirely'
          : ', and a siege engine cannot ignore it'),
    );
  }
  if (b.sallyBonus) {
    out.push(
      `+${pct(b.sallyBonus)} attack for a unit attacking out of this city — and nothing whatsoever for one that sits still`,
    );
  }
  // Said first, because it is the condition on everything below it.
  if (b.needsGarrison) {
    out.push('pays nothing at all unless a unit is standing in the city');
  }
  if (b.goldBonus) out.push(`+${pct(b.goldBonus)} gold from this city`);
  if (b.scienceBonus) out.push(`+${pct(b.scienceBonus)} research from this city`);
  if (b.contentBonus) {
    out.push(`${b.contentBonus} more content citizens, holding off disorder`);
  }
  if (b.foodKept) out.push(`keeps ${pct(b.foodKept)} of the food store each time the city grows`);
  if (b.veteranUnits) out.push('land units built here start as veterans');
  return out;
}

function unitCard(def: UnitTypeDef): string {
  const tech = unlockedBy(def.id);
  const notes = abilityNotes(def);

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
        ${
          notes.length
            ? `<ul class="pedia-notes">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
            : ''
        }
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
        <img class="pedia-row-icon" src="${assetPath('tech', t.id)}" alt="" />
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
        <img class="pedia-row-icon terrain" src="${assetPath('terrain', `${id}_0`)}" alt="" />
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
        <img class="pedia-row-icon" src="${assetPath('buildings', b.id)}" alt="" />
        <span class="pedia-tech-name">${escapeHtml(b.name)}</span>
        <span class="pedia-tech-cost">${b.cost}s &middot; ${b.upkeep}g/turn</span>
        <span class="pedia-tech-needs">${escapeHtml(
          TECHS.find((t) => t.buildings.includes(b.id))?.name ?? '&mdash;',
        )}</span>
        <span class="pedia-flavor">${escapeHtml(b.blurb)}</span>
        ${
          buildingEffects(b).length
            ? `<ul class="pedia-notes">${buildingEffects(b)
                .map((n) => `<li>${escapeHtml(n)}</li>`)
                .join('')}</ul>`
            : ''
        }
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
      root.querySelectorAll<HTMLImageElement>('.pedia-row-icon').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
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
