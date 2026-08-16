import { describe, it } from 'vitest';
import { runAiTurn } from '../src/ai/ai';
import { BUILDINGS } from '../src/model/buildings';
import { createGame, playerCities, playerUnits } from '../src/sim/gamestate';
import { beginPlayerTurn, endPlayerTurn, scoreBreakdown } from '../src/sim/turn';

/**
 * THROWAWAY. Delete after reading.
 *
 * Do garrison-gated economy buildings move the balance?
 *
 * The idea is that a building which pays only while a unit stands in the city
 * rewards holding ground, which is exactly what the Horde is bad at. The
 * worry is the opposite: the Kingdom garrisons more because it is cautious, so
 * a reward for garrisoning may simply pay the side that was already winning.
 *
 * Reasoning about it has been wrong four times out of five this session, so it
 * gets measured. Three arms, restoring the table between each:
 *
 *   OFF      the old flat 50%, no condition   -- what shipped before today
 *   BOTH     doubled but gated, both sides    -- what is in the tree now
 *   ORC ONLY gated for the Horde alone        -- gated as a deliberate lever
 *
 * Population, advances and buildings are collected as well as cities, because
 * the caution swap moved wins without moving city counts and nobody has yet
 * established where that came from.
 */

declare const process: { env: Record<string, string | undefined> };
const SEED_COUNT = Number(process.env.BALANCE_SEEDS ?? 18);
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1 + i * 7919);
const HALF_TURNS = 700;

const BASE = {
  treasury: { ...BUILDINGS.treasury },
  market: { ...BUILDINGS.market },
};

function play(seed: number) {
  const state = createGame({ seed });
  state.players[0].controller = 'ai';
  beginPlayerTurn(state, 0);

  const owners = new Map<number, { owner: number; since: number }>();
  const holds: number[][] = [[], []];
  const sweep = () => {
    for (const c of state.cities) {
      const prev = owners.get(c.id);
      if (prev && prev.owner !== c.owner) holds[prev.owner].push(state.turn - prev.since);
      if (!prev || prev.owner !== c.owner) owners.set(c.id, { owner: c.owner, since: state.turn });
    }
  };
  sweep();
  for (let i = 0; i < HALF_TURNS && state.winner === null; i++) {
    runAiTurn(state, state.activePlayer);
    endPlayerTurn(state);
    sweep();
  }

  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const per = (p: number) => {
    const score = scoreBreakdown(state, p);
    return {
      cities: playerCities(state, p).length,
      population: playerCities(state, p).reduce((n, c) => n + c.size, 0),
      buildings: playerCities(state, p).reduce((n, c) => n + c.buildings.length, 0),
      techs: state.players[p].techs.length,
      units: playerUnits(state, p).length,
      gold: state.players[p].gold,
      score: score.total,
      medianHold: median(holds[p]),
    };
  };
  return { winner: state.winner, sides: [per(0), per(1)] as const };
}

function arm(label: string, orcGated: boolean, humanGated: boolean): void {
  const set = (id: 'treasury' | 'market', gated: boolean) => {
    const b = BUILDINGS[id] as { goldBonus: number; needsGarrison?: boolean };
    b.goldBonus = gated ? 1 : 0.5;
    if (gated) b.needsGarrison = true;
    else delete b.needsGarrison;
  };
  set('treasury', orcGated);
  set('market', humanGated);

  const games = SEEDS.map(play);
  const avg = (pick: (g: (typeof games)[number]) => number) =>
    (games.reduce((s, g) => s + pick(g), 0) / games.length).toFixed(1);
  console.log(
    `\n=== ${label} === (orc gated ${orcGated}, human gated ${humanGated})\n` +
      `wins: orc ${games.filter((g) => g.winner === 0).length} / human ${games.filter((g) => g.winner === 1).length}\n` +
      ['orc', 'human']
        .map(
          (n, i) =>
            `${n.padEnd(6)} score ${avg((g) => g.sides[i].score)} | cities ${avg((g) => g.sides[i].cities)} | ` +
            `pop ${avg((g) => g.sides[i].population)} | bldgs ${avg((g) => g.sides[i].buildings)} | ` +
            `techs ${avg((g) => g.sides[i].techs)} | units ${avg((g) => g.sides[i].units)} | ` +
            `gold ${avg((g) => g.sides[i].gold)} | medHold ${avg((g) => g.sides[i].medianHold)}`,
        )
        .join('\n'),
  );

  Object.assign(BUILDINGS.treasury, BASE.treasury);
  Object.assign(BUILDINGS.market, BASE.market);
}

describe('garrison-gated economy buildings', () => {
  it('off: flat 50%, no condition', () => arm('OFF', false, false), SEED_COUNT * 60_000);
  it('both: doubled but gated', () => arm('BOTH', true, true), SEED_COUNT * 60_000);
  it('orc only: gated as a lever', () => arm('ORC ONLY', true, false), SEED_COUNT * 60_000);
});
