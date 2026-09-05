import { BUILDINGS } from '../model/buildings';
import { techsForFaction, TECHS_BY_ID } from '../model/techs';
import type { TechDef } from '../model/techs';
import { UNIT_TYPES } from '../model/units';
import type { GameState, Player } from '../model/types';
import { knowsTech, researchableTechs, setResearch, techCost } from '../sim/research';
import { advisorSuggestions } from '../model/suggestions';
import { afterModalCloses, bar, escapeHtml, openModal } from './dom';
import { openPedia } from './pedia';

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

/**
 * Where an advance's icon lives. Missing files are expected: the icon is
 * hidden on error, and the card reads perfectly well without one.
 */
function techIconPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}tech/${id}.png`;
}

/**
 * What an advance unlocks, with units linked into the Orcpedia.
 *
 * "Unlocks: Two Orcs" is only useful if you can find out what Two Orcs *is*
 * without closing the screen and hunting for one on the map.
 */
function unlockSummary(t: TechDef, player: Player): string {
  const bits: string[] = [];
  for (const u of t.units) {
    const def = UNIT_TYPES[u];
    if (def && def.faction === player.faction) {
      bits.push(
        `<a href="#" class="pedia-link" data-pedia="${escapeHtml(def.id)}">${escapeHtml(def.name)}</a>`,
      );
    }
  }
  for (const b of t.buildings) {
    const def = BUILDINGS[b];
    if (def && (def.faction === 'both' || def.faction === player.faction)) {
      bits.push(
        `<a href="#" class="pedia-link" data-pedia="${escapeHtml(def.id)}">${escapeHtml(def.name)}</a>`,
      );
    }
  }
  for (const f of t.flags) bits.push(escapeHtml(FLAG_LABELS[f] ?? f));
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
            <div class="tech-head">
              <img class="tech-icon" src="${techIconPath(t.id)}" alt="" />
              <div class="tech-name">${escapeHtml(t.name)}</div>
            </div>
            <div class="tech-cost">${known ? 'known' : `${techCost(player, t)} beakers`}</div>
            ${unlocks ? `<div class="tech-unlocks">${unlocks}</div>` : ''}
            ${missing.length > 0 && !known ? `<div class="tech-needs">needs ${escapeHtml(missing.join(', '))}</div>` : ''}
            <div class="tech-flavor">${escapeHtml(t.flavor)}</div>
          </div>`;
      })
      .join('');
    columns.push(`<div class="tech-col"><div class="tech-tier">Tier ${d + 1}</div>${cards}</div>`);
  }

  const current = player.researching ? TECHS_BY_ID[player.researching] : null;
  const open = researchableTechs(player);
  // Nothing to pick is a different thing from declining to pick, and only the
  // second is worth refusing to close over.
  const mustChoose = !current && open.length > 0;

  // Six people who each want one thing, arguing for their own department. The
  // list is worth more than any one line in it: they disagree, visibly.
  const suggestions = advisorSuggestions(player.faction, open, (t) => techCost(player, t));
  const invested = suggestions.filter((s) => s.stake);
  const shrugging = suggestions.filter((s) => !s.stake);
  const row = (who: string, why: string, id: string) => `
      <button class="advice-row" data-id="${escapeHtml(id)}"
              title="Start researching ${escapeHtml(TECHS_BY_ID[id]?.name ?? id)}">
        <span class="advice-who">${escapeHtml(who)}</span>
        <span class="advice-why">${escapeHtml(why)}</span>
      </button>`;
  const council = [
    ...invested.map((s) => row(s.advisor.name, s.why, s.tech.id)),
    // Everybody with nothing at stake wants the quickest thing, which is the
    // same advance for all of them. Six identical rows would be a worse screen
    // and no more true than one line saying so.
    ...(shrugging.length > 0
      ? [
          row(
            shrugging.length === suggestions.length ? 'The council' : 'The rest of them',
            `Have no view, and would take ${shrugging[0].tech.name} to be rid of the question.`,
            shrugging[0].tech.id,
          ),
        ]
      : []),
  ].join('');

  const body = `
    <div class="panel-body">
      ${
        current
          ? `<div class="stat-row"><span class="label">Currently researching</span><span class="value">${escapeHtml(current.name)} — ${player.beakers} / ${techCost(player, current)}</span></div>
             ${bar(player.beakers, techCost(player, current))}`
          : mustChoose
            ? '<span class="k-bad">Nothing is being studied. Beakers are piling up in a shed. Pick something.</span>'
            : '<span class="muted">Nothing left to research.</span>'
      }
      <p class="flavor">
        Click any advance you have the prerequisites for. Switching keeps the work
        you have already done &mdash; but changing to something you have
        <em>already paid for</em> spends the surplus.
      </p>
      ${
        council
          ? `<div class="panel-title">What the council would do</div>
             <div class="advice-list">${council}</div>`
          : ''
      }
    </div>
    <div class="tech-tree">${columns.join('')}</div>`;

  openModal({
    title: `Advances of ${player.name}`,
    body,
    width: 'min(1400px, 97vw)',
    // Beakers bank whether or not anything is being studied, so declining to
    // choose is choosing to leave them in a shed. There is no reason to allow
    // it and nothing in the interface ever said what it cost. Section 75.
    sticky: mustChoose,
    onMount: (root, close) => {
      // No icon yet for this advance is the normal case, not an error.
      root.querySelectorAll<HTMLImageElement>('.tech-icon').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
      // Unit links open the Orcpedia rather than picking the advance.
      root.querySelectorAll<HTMLElement>('[data-pedia]').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPedia(player, link.dataset.pedia);
          // Looking something up should not cost you your place. `openModal`
          // has no stack, and one is more than this problem deserves: the
          // Orcpedia is opened from four places and only this one wants to
          // come back. Registered after the replacement, which leaves the
          // queue alone, so this fires when the Orcpedia itself closes.
          afterModalCloses(() => openTechPanel(state, player, onChange));
        });
      });
      root.querySelectorAll<HTMLButtonElement>('.advice-row').forEach((row) => {
        row.addEventListener('click', () => {
          const id = row.dataset.id;
          if (!id) return;
          setResearch(state, player, id);
          onChange();
          close();
        });
      });
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
