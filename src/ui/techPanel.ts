import { BUILDINGS } from '../model/buildings';
import { techsForFaction, TECHS_BY_ID } from '../model/techs';
import type { TechDef } from '../model/techs';
import { UNIT_TYPES } from '../model/units';
import type { GameState, Player } from '../model/types';
import { knowsTech, researchableTechs, setResearch, techCost } from '../sim/research';
import { bar, escapeHtml, openModal } from './dom';

/**
 * The tech tree, laid out in dependency tiers.
 *
 * Depth is computed from the prerequisite graph rather than hand-assigned, so
 * adding another rung to the counting ladder places itself.
 */
function depthOf(t: TechDef, cache = new Map<string, number>()): number {
  const seen = cache.get(t.id);
  if (seen !== undefined) return seen;
  cache.set(t.id, 0); // guards against a malformed cyclic entry
  const d =
    t.prereqs.length === 0
      ? 0
      : 1 + Math.max(...t.prereqs.map((p) => (TECHS_BY_ID[p] ? depthOf(TECHS_BY_ID[p], cache) : 0)));
  cache.set(t.id, d);
  return d;
}

function unlockSummary(t: TechDef, player: Player): string {
  const bits: string[] = [];
  for (const u of t.units) {
    const def = UNIT_TYPES[u];
    if (def && def.faction === player.faction) bits.push(def.name);
  }
  for (const b of t.buildings) {
    const def = BUILDINGS[b];
    if (def && (def.faction === 'both' || def.faction === player.faction)) bits.push(def.name);
  }
  for (const f of t.flags) bits.push(FLAG_LABELS[f] ?? f);
  return bits.join(', ');
}

const FLAG_LABELS: Record<string, string> = {
  coordination: 'Big groups stop losing a movement point',
  mapmaking: '+1 sight for every unit',
  bridges: 'Forest and swamp cost 1 movement',
  watchtower: 'Cities see one tile further',
  contentment: '+1 content citizen everywhere',
  berserk: '+25% attack, -25% defence, army-wide',
};

export function openTechPanel(state: GameState, player: Player, onChange: () => void): void {
  const cache = new Map<string, number>();
  const all = techsForFaction(player.faction);
  const available = new Set(researchableTechs(player).map((t) => t.id));
  const maxDepth = Math.max(...all.map((t) => depthOf(t, cache)));

  const columns: string[] = [];
  for (let d = 0; d <= maxDepth; d++) {
    const tier = all.filter((t) => depthOf(t, cache) === d);
    if (tier.length === 0) continue;
    const cards = tier
      .map((t) => {
        const known = knowsTech(player, t.id);
        const canResearch = available.has(t.id);
        const active = player.researching === t.id;
        const cls = known ? 'known' : active ? 'active' : canResearch ? 'open' : 'locked';
        const unlocks = unlockSummary(t, player);
        const missing = t.prereqs
          .filter((p) => !knowsTech(player, p))
          .map((p) => TECHS_BY_ID[p]?.name ?? p);
        return `
          <div class="tech-card ${cls}" data-id="${escapeHtml(t.id)}" ${canResearch ? '' : 'data-locked="1"'}>
            <div class="tech-name">${escapeHtml(t.name)}</div>
            <div class="tech-cost">${known ? 'known' : `${techCost(player, t)} beakers`}</div>
            ${unlocks ? `<div class="tech-unlocks">${escapeHtml(unlocks)}</div>` : ''}
            ${missing.length > 0 && !known ? `<div class="tech-needs">needs ${escapeHtml(missing.join(', '))}</div>` : ''}
            <div class="tech-flavor">${escapeHtml(t.flavor)}</div>
          </div>`;
      })
      .join('');
    columns.push(`<div class="tech-col"><div class="tech-tier">Tier ${d + 1}</div>${cards}</div>`);
  }

  const current = player.researching ? TECHS_BY_ID[player.researching] : null;
  const body = `
    <div class="panel-body">
      ${
        current
          ? `<div class="stat-row"><span class="label">Currently researching</span><span class="value">${escapeHtml(current.name)} — ${player.beakers} / ${techCost(player, current)}</span></div>
             ${bar(player.beakers, techCost(player, current))}`
          : '<span class="muted">No research under way. Pick something.</span>'
      }
      <p class="flavor">Click any advance you have the prerequisites for. Switching targets abandons progress on the old one.</p>
    </div>
    <div class="tech-tree">${columns.join('')}</div>`;

  openModal({
    title: `Advances of ${player.name}`,
    body,
    width: 'min(1400px, 97vw)',
    onMount: (root, close) => {
      root.querySelectorAll<HTMLElement>('.tech-card').forEach((card) => {
        if (card.dataset.locked) return;
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          if (!id) return;
          setResearch(state, player, id);
          onChange();
          close();
        });
      });
    },
  });
}
