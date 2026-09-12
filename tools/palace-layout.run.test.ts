import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { PALACE_MODULES, palaceLayout } from '../src/model/palace';
import type { PalaceModuleId } from '../src/model/palace';

declare const process: { env: Record<string, string | undefined> };

// Dumps what `palaceLayout` draws, so the capital can be looked at offline from
// the game's own arithmetic rather than from a second copy of it.
it('dumps palace layouts', () => {
  const shots: Record<string, Partial<Record<PalaceModuleId, number>>> = {
    'all at three': { grounds: 3, wing: 3, tower: 3, gate: 3, banners: 3 },
    mixed: { grounds: 2, wing: 3, tower: 2, gate: 3, banners: 1 },
    'first pieces': { grounds: 1, wing: 1, tower: 1 },
  };
  const out: Record<string, unknown> = {};
  for (const faction of ['orc', 'human'] as const) {
    for (const [name, tiers] of Object.entries(shots)) {
      const standing = PALACE_MODULES.filter((m) => tiers[m.id]).map((module) => ({
        module,
        tier: tiers[module.id]!,
      }));
      out[`${faction}|${name}`] = palaceLayout(faction, standing, 380);
    }
  }
  writeFileSync(process.env.LAYOUT_OUT ?? 'palace-layout.json', JSON.stringify(out), 'utf8');
});
