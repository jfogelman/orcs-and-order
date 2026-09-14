import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { PERSONALITIES } from '../src/ai/ai';
import { BUILDINGS } from '../src/model/buildings';
import { TECHS, TECHS_BY_ID } from '../src/model/techs';
import type { TechDef } from '../src/model/techs';
import type { FactionId } from '../src/model/types';
import { unitType } from '../src/model/units';
import { TECH_ESCALATION } from '../src/sim/research';

/**
 * Writes `docs/TECH_TREE.md`: both tech trees as they stand in `model/techs.ts`,
 * for reference while designing. Generated rather than written by hand so it
 * cannot drift from the game -- rerun it whenever the tree changes:
 *
 *   npx vitest run --config vitest.sweep.config.ts tools/tech-tree.run.test.ts
 */

const SIDE_NAME: Record<FactionId, string> = { orc: 'Horde', human: 'Kingdom' };
const ENDING: Record<FactionId, string> = { orc: 'somebody-knocked', human: 'do-not-touch' };

const nameOf = (id: string) => TECHS_BY_ID[id]?.name ?? id;
const nodeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_');
const cell = (text: string) => text.replace(/\|/g, '\\|');

function depthOf(t: TechDef, memo = new Map<string, number>()): number {
  if (memo.has(t.id)) return memo.get(t.id)!;
  const d = t.prereqs.length === 0 ? 0 : 1 + Math.max(...t.prereqs.map((p) => depthOf(TECHS_BY_ID[p], memo)));
  memo.set(t.id, d);
  return d;
}

/** Every advance needed to learn this one, itself included. */
function road(id: string): TechDef[] {
  const seen = new Map<string, TechDef>();
  const walk = (at: string) => {
    if (seen.has(at)) return;
    const t = TECHS_BY_ID[at];
    seen.set(at, t);
    for (const p of t.prereqs) walk(p);
  };
  walk(id);
  return [...seen.values()].sort((a, b) => depthOf(a) - depthOf(b) || a.cost - b.cost);
}

/**
 * What learning a set of advances costs from a standing start, in the order given,
 * with each price marked up by everything already known -- the same rule as
 * `techCost`. The advances a side starts with cost nothing and are counted as known.
 */
function escalatedCost(order: TechDef[]): number {
  let known = order.filter((t) => t.cost === 0).length;
  let total = 0;
  for (const t of order) {
    if (t.cost === 0) continue;
    total += Math.round(t.cost * (1 + Math.max(0, known - 1) * TECH_ESCALATION));
    known++;
  }
  return total;
}

function unlocks(t: TechDef): { units: string; buildings: string } {
  return {
    units: t.units.map((u) => unitType(u).name).join(', ') || '--',
    buildings: t.buildings.map((b) => BUILDINGS[b]?.name ?? b).join(', ') || '--',
  };
}

function table(techs: TechDef[]): string[] {
  const out = [
    '| Advance | Cost | Needs | Units | Structures | Effect | Depth | Flavour |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const t of [...techs].sort((a, b) => depthOf(a) - depthOf(b) || a.cost - b.cost)) {
    const u = unlocks(t);
    out.push(
      `| **${cell(t.name)}** \`${t.id}\` | ${t.cost} | ${t.prereqs.map(nameOf).join(', ') || '--'} | ` +
        `${cell(u.units)} | ${cell(u.buildings)} | ${t.flags.join(', ') || '--'} | ${depthOf(t)} | ` +
        `${cell(t.flavor)} |`,
    );
  }
  return out;
}

function diagram(faction: FactionId): string[] {
  const techs = TECHS.filter((t) => t.faction === 'both' || t.faction === faction);
  const out = ['```mermaid', 'flowchart LR'];
  for (const t of techs) out.push(`  ${nodeId(t.id)}["${t.name.replace(/"/g, "'")}<br/>${t.cost}"]`);
  for (const t of techs) for (const p of t.prereqs) out.push(`  ${nodeId(p)} --> ${nodeId(t.id)}`);
  out.push('  classDef shared fill:#e8e2d0,stroke:#8a7a55,color:#222');
  out.push('  classDef ending fill:#f3d36b,stroke:#9a6b00,color:#222,stroke-width:2px');
  const shared = techs.filter((t) => t.faction === 'both').map((t) => nodeId(t.id));
  if (shared.length) out.push(`  class ${shared.join(',')} shared`);
  const endings = techs.filter((t) => t.flags.includes('ending')).map((t) => nodeId(t.id));
  if (endings.length) out.push(`  class ${endings.join(',')} ending`);
  out.push('```');
  return out;
}

it('writes docs/TECH_TREE.md', () => {
  const lines: string[] = [
    '# Tech trees',
    '',
    '> Generated from `src/model/techs.ts` by `tools/tech-tree.run.test.ts` -- do not edit by hand.',
    '> Regenerate with `npx vitest run --config vitest.sweep.config.ts tools/tech-tree.run.test.ts`.',
    '',
    `Costs are base prices. The real price of an advance is marked up by ${Math.round(TECH_ESCALATION * 1000) / 10}% ` +
      'for every advance already known (`techCost` in `src/sim/research.ts`), so the same advance ' +
      'costs more the later it is learned.',
    '',
  ];

  const shared = TECHS.filter((t) => t.faction === 'both');
  for (const faction of ['orc', 'human'] as const) {
    const own = TECHS.filter((t) => t.faction === faction);
    lines.push(
      `- **${SIDE_NAME[faction]}**: ${shared.length + own.length} advances -- ${shared.length} shared, ` +
        `${own.length} its own.`,
    );
  }
  lines.push('');

  // --------------------------------------------------------------- the endings
  lines.push('## The road to each ending', '');
  lines.push(
    'Everything a side must learn to reach its section 110 ending advance, in the order a ' +
      'straight run at it would take, and what that costs from a standing start with the markup ' +
      'applied. The AI does not take a straight run: the last column counts the advances its ' +
      'research list asks for first.',
    '',
    '| Side | Ending advance | Advances on the road | Base cost | Straight run, marked up | Asked for first by the AI list | Their base cost |',
    '|---|---|---|---|---|---|---|',
  );
  for (const faction of ['orc', 'human'] as const) {
    const id = ENDING[faction];
    const path = road(id);
    const base = path.reduce((n, t) => n + t.cost, 0);
    const list = PERSONALITIES[faction].techPriority.filter((x, i, all) => all.indexOf(x) === i);
    const at = list.indexOf(id);
    const ahead = (at < 0 ? list : list.slice(0, at)).map((x) => TECHS_BY_ID[x]).filter(Boolean);
    const aheadNotOnRoad = ahead.filter((t) => !path.some((p) => p.id === t.id));
    lines.push(
      `| ${SIDE_NAME[faction]} | ${nameOf(id)} | ${path.length} | ${base} | ${escalatedCost(path)} | ` +
        `${aheadNotOnRoad.length} not on the road | ${aheadNotOnRoad.reduce((n, t) => n + t.cost, 0)} |`,
    );
  }
  lines.push('');
  for (const faction of ['orc', 'human'] as const) {
    lines.push(
      `**${SIDE_NAME[faction]}:** ` + road(ENDING[faction]).map((t) => `${t.name} (${t.cost})`).join(' → '),
      '',
    );
  }

  // ----------------------------------------------------------------- diagrams
  for (const faction of ['orc', 'human'] as const) {
    lines.push(`## The ${SIDE_NAME[faction]}'s tree`, '');
    lines.push('Shared advances are pale; the ending advance is gold.', '');
    lines.push(...diagram(faction), '');
  }

  // ------------------------------------------------------------------- tables
  lines.push('## Shared advances', '', ...table(shared), '');
  for (const faction of ['orc', 'human'] as const) {
    lines.push(`## ${SIDE_NAME[faction]} advances`, '', ...table(TECHS.filter((t) => t.faction === faction)), '');
  }

  // ------------------------------------------------------------ leaves and AI
  const needed = new Set(TECHS.flatMap((t) => t.prereqs));
  lines.push('## Dead ends', '');
  lines.push('Advances nothing else depends on.', '');
  for (const group of ['both', 'orc', 'human'] as const) {
    const leaves = TECHS.filter((t) => t.faction === group && !needed.has(t.id));
    const label = group === 'both' ? 'Shared' : SIDE_NAME[group];
    lines.push(`- **${label}:** ${leaves.map((t) => t.name).join(', ') || '--'}`);
  }
  lines.push('');

  lines.push('## What the AI researches first', '');
  lines.push(
    'Each personality works down its `techPriority` list (`src/ai/ai.ts`), taking the first ' +
      'advance it can research, and falls back to the cheapest available once the list is ' +
      'exhausted. Advances on the road to its ending are marked.',
    '',
  );
  for (const faction of ['orc', 'human'] as const) {
    const onRoad = new Set(road(ENDING[faction]).map((t) => t.id));
    const list = PERSONALITIES[faction].techPriority.filter((x, i, all) => all.indexOf(x) === i);
    lines.push(`**${SIDE_NAME[faction]}**`, '');
    list.forEach((id, i) => {
      lines.push(`${i + 1}. ${nameOf(id)} (${TECHS_BY_ID[id]?.cost ?? '?'})${onRoad.has(id) ? ' — *on the road to its ending*' : ''}`);
    });
    lines.push('');
  }

  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/TECH_TREE.md', lines.join('\n'), 'utf8');
  console.log(`wrote docs/TECH_TREE.md (${lines.length} lines)`);
});
