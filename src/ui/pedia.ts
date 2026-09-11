import { BUILDINGS, BUILDING_IDS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
import { FACTIONS } from '../model/factions';
import { TERRAIN, TERRAIN_IDS } from '../model/terrain';
import type { TerrainDef, TerrainSpecial } from '../model/terrain';
import { SPECIALS } from '../model/terrain';
import { TECHS, TECHS_BY_ID } from '../model/techs';
import { CREATURES, CREATURES_BY_ID, UNIT_TYPES, unitType } from '../model/units';
import type { UnitTypeDef } from '../model/units';
import type { FactionId, GameState, Player, UnitTypeId } from '../model/types';
import { SpriteCache } from '../render/spriteCache';
import { escapeHtml, openModal } from './dom';
import { controlsMarkup } from './controls';
import { BARBARIANS, RAIDER } from '../sim/barbarians';
import { ROADS } from '../sim/roads';

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

/**
 * What a special is actually worth, written as a gain.
 *
 * The rule is that a special **replaces** the tile's yields rather than adding
 * to them, which is not what "bonus" leads anybody to expect -- so the numbers
 * shown are the ones the tile really produces, and this says what changed. As
 * it happens every special is a strict improvement, so there is never a minus
 * sign here, but the sum is done rather than assumed.
 */
function specialGain(t: TerrainDef, sp: TerrainSpecial): string {
  const parts: string[] = [];
  const say = (label: string, from: number, to: number) => {
    if (to !== from) parts.push(`${to > from ? '+' : ''}${to - from} ${label}`);
  };
  say('food', t.food, sp.food);
  say('shields', t.shields, sp.shields);
  say('trade', t.trade, sp.trade);
  const movedYields = parts.length > 0;
  // A special that is a rule rather than a number says so -- and says only
  // that, since "instead of 2/1/0" in front of it is naming yields that did not
  // move and reads as though they had.
  if (sp.defense !== undefined && sp.defense !== t.defense) {
    parts.push(`defence x${sp.defense} rather than x${t.defense}`);
  }
  if (!movedYields) return parts.join(', ');
  // A literal dash, not an entity: this string is escaped on the way out, so
  // an entity here would reach the player as the characters "&mdash;".
  return parts.length ? `instead of ${t.food}/${t.shields}/${t.trade} — ${parts.join(', ')}` : '';
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
  if (b.suppliesArmy) {
    out.push(
      'links this city into your supply chain, so units nearby fight at full strength and heal',
    );
    out.push(
      'must be within reach of somewhere already supplied — a depot with nothing behind it carries nothing',
    );
    out.push(
      'costs more the further it is from your capital',
    );
  }
  // Said first, because it is the condition on everything below it.
  if (b.needsGarrison) {
    out.push('pays nothing at all unless a unit is standing in the city');
  }
  // A city holds one unit, so a building that wants several counts the tiles
  // around it too. It never said it wanted soldiers at all until section 101.
  if (b.garrisonNeeded) {
    out.push(
      `pays nothing at all unless ${b.garrisonNeeded} soldiers stand in the city or right beside it`,
    );
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
  // Wild things belong to nobody, so they are in neither roster. A raiding
  // party is not something the Horde can put in a queue.
  const creatures = CREATURES.filter((c) => c.faction === faction && !c.wild);
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
export function openPedia(state: GameState, player: Player, focus?: string): void {
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
    // Every special this ground can carry, not just the first: one art file
    // each, keyed by name, since a terrain may now offer several.
    const specials = t.specials
      .map(
        (sp, n) => `
          <div class="pedia-special">
            <img class="pedia-special-icon"
                 src="${assetPath('specials', n === 0 ? id : `${id}_${n + 1}`)}"
                 data-fallback="${assetPath('specials', n === 0 ? `${id}_1` : id)}" alt="" />
            <span class="pedia-special-name">${escapeHtml(sp.name)}</span>
            <span class="pedia-special-yield">${sp.food}/${sp.shields}/${sp.trade}</span>
            <span class="pedia-special-gain">${escapeHtml(specialGain(t, sp))}</span>
          </div>`,
      )
      .join('');
    return `
      <div class="pedia-tech-row">
        <img class="pedia-row-icon terrain" src="${assetPath('terrain', `${id}_0`)}" alt="" />
        <span class="pedia-tech-name">${escapeHtml(t.name)}</span>
        <span class="pedia-tech-cost">${t.food}/${t.shields}/${t.trade}</span>
        <span class="pedia-tech-needs">move ${t.moveCost} &middot; defence x${t.defense}</span>
        <span class="pedia-flavor">${t.water ? 'Land units cannot enter.' : ''}${
          t.noCity ? ' No cities here.' : ''
        }${t.blocksSight ? ' Blocks line of sight.' : ''}</span>
        ${specials}
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
        <button class="pedia-tab" data-tab="wilds">The Wilds</button>
        <button class="pedia-tab" data-tab="controls">Controls</button>
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
        <p class="flavor">
          Yields are food / shields / trade. About one tile in ${Math.round(1 / SPECIALS.chance)} carries a
          <em>land special</em> &mdash; the marked ones on the map. A special
          <strong>replaces</strong> what the tile would otherwise produce rather than
          adding to it, and it is always worth having. Some are worth more to
          <strong>work</strong>; others are worth more to <strong>stand on</strong>, and
          change nothing about what the tile grows.
        </p>
        <p class="flavor">
          <strong>Roads.</strong> Once you know <strong>Bridge Building</strong>, a Peon or Peasant can lay one where it stands (<kbd>R</kbd>):
          ${ROADS.turns.grass} turns on grass or wastes, ${ROADS.turns.forest} in forest, hills or
          swamp, ${ROADS.turns.mountains} up a mountain. Walking off abandons the job. <kbd>Shift+R</kbd> and a click lays a road all the way to that tile, digging where the ground needs it and walking over any road already down. A step from one
          road tile to the next costs <strong>a third of a move</strong>, so a worker that has joined
          two cities has shortened every march between them. A city counts as a road already, and a
          road does not know whose it is &mdash; the other lot may use yours.
        </p>
        <div class="pedia-rows">${terrainList}</div>
      </div>
      <div class="pedia-pane" data-pane="wilds" hidden>
        <p class="flavor">
          ${
            state.settings.barbarians
              ? 'This game has raiders in it. They were decided when it began and will not go away.'
              : 'This game has no raiders. It is a choice made when a game is started, on the new-game screen, and it holds for the whole game.'
          }
        </p>
        <p class="flavor">
          Raiders belong to nobody. They attack the Horde and the Kingdom alike, refuse
          every conversation, and hold no ground &mdash; there is no arrangement to be
          reached and no border to agree. They come out of the unclaimed wilds in
          <strong>waves</strong>, and a wave grows with how far along the two empires
          are between them, so falling behind does not make them easier and racing ahead
          does not make them worse for you alone.
        </p>
        <div class="panel-body">
          <div class="stat-row"><span class="label">First wave</span><span class="value">turn ${BARBARIANS.notBefore}, then every ${BARBARIANS.every} turns</span></div>
          <div class="stat-row"><span class="label">How many</span><span class="value">grows with the average advances known, up to ${BARBARIANS.cap}</span></div>
          <div class="stat-row"><span class="label">Where</span><span class="value">open ground, at least ${BARBARIANS.clearOfCities} tiles from any city</span></div>
          <div class="stat-row"><span class="label">Cities</span><span class="value">they cannot take one, ever</span></div>
        </div>
        <p class="flavor">
          What they <em>can</em> do is walk into a city nobody is defending and take
          something: a building if there is one, and people if there is not. It keeps its
          name and its owner. The walls stay standing &mdash; they have not brought
          anything that would trouble a wall.
          <strong>One unit in a city is usually enough to stop them</strong>, which is the
          entire lesson.
        </p>
        <p class="flavor">
          You are told twice, and the two mean different things. When a wave lands
          somewhere in the wilds you hear that <em>something has come out</em> &mdash;
          a rumour, with no place attached, because nobody of yours was standing there
          to see it. When one of them actually comes into view you get
          <strong>&ldquo;Raiders spotted&rdquo;</strong>, and the map turns to look at
          them, because that time we really did see them.
        </p>
        <div class="pedia-grid">${unitCard(UNIT_TYPES[RAIDER])}</div>
      </div>
      <div class="pedia-pane" data-pane="controls" hidden>
        <p class="flavor">
          Two of these are worth knowing and neither is guessable.
          <strong>Right-click is the order button</strong>: it acts with the unit you
          already have in hand and asks no questions about what is on the tile, which
          is how you walk a unit <em>onto</em> one of your own cities. A
          <strong>left click on your own city opens the city</strong> instead, whatever
          is standing there &mdash; and everything standing there is listed in the
          panel, including whatever the city has just finished building.
          A left click on open ground sets a march, which carries on across as many
          turns as it takes.
        </p>
        <div class="pedia-controls">${controlsMarkup()}</div>
      </div>`,
    onMount: (root) => {
      // Swap in the procedural drawing wherever there is no artwork yet, so a
      // gap in the art shows a sprite rather than a broken-image icon.
      root.querySelectorAll<HTMLImageElement>('.pedia-row-icon').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
      // A terrain used to carry one special, so its art was keyed by terrain.
      // Now that several are possible the files are keyed per special -- and the
      // old single file is tried once as a fallback, so nothing that already had
      // a picture lost one. Failing both, the row reads fine without it.
      root.querySelectorAll<HTMLImageElement>('.pedia-special-icon').forEach((img) => {
        img.addEventListener('error', () => {
          const fallback = img.dataset.fallback;
          if (fallback && img.src !== fallback) {
            delete img.dataset.fallback;
            img.src = fallback;
            return;
          }
          img.remove();
        });
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
