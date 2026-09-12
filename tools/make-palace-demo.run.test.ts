import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { City, GameState } from '../src/model/types';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { assignWorkers } from '../src/sim/city';
import { serialize } from '../src/persist/save';

declare const process: { env: Record<string, string | undefined> };

it('writes a palace demo save', () => {
  const state: GameState = createGame({ seed: 20260920, width: 40, height: 20 });
  state.units.length = 0;
  state.cities.length = 0;
  state.terrain.fill('grass');
  for (const p of state.players) {
    p.explored.fill(1);
    p.visible.fill(1);
    p.gold = 400;
  }
  state.players[0].controller = 'human';
  if (process.env.PALACE_SIDE === 'human') {
    state.players[0].faction = 'human';
    state.players[1].faction = 'orc';
  }
  const side = state.players[0].faction;
  state.players[0].palace = { wing: 3, tower: 2, banners: 1, gate: 3, grounds: 2 };
  for (const [n, name] of ['Grubhollow', 'Stonefist', 'Bonepile'].entries()) {
    const city: City = {
      id: n + 1, owner: 0, name, x: 6 + n * 8, y: 8, size: 6,
      food: 0, shields: 0, buildings: [], producing: { kind: 'coin' },
      workedTiles: [], disorder: false, foundedTurn: 1 + n, foundedBy: 0,
    };
    state.cities.push(city);
    assignWorkers(state, city);
    spawnUnit(state, 0, 'orc', city.x, city.y, false).order = 'fortified';
  }
  spawnUnit(state, 1, 'footman', 38, 18, false);
  writeFileSync(`public/palace-demo-${side}.w2c`, serialize(state), 'utf8');
});
