import { BUILDINGS } from '../model/buildings';
import { TERRAIN } from '../model/terrain';
import type { GameState, TurnRecord } from '../model/types';
import { replayFrames, ROW } from '../sim/history';
import { playerScore } from '../sim/turn';
import { escapeHtml, openModal } from './dom';

/**
 * The game again, from the top: section 15's post-game summary.
 *
 * Shown only once a game is over, because it shows everything -- every city
 * either side ever held, across a map with no fog on it. Mid-game it would be a
 * spyglass.
 *
 * A map where each side's land spreads, meets and changes hands, a score chart
 * with a cursor on it, and the moments worth jumping to: every city taken or
 * lost. All of it drawn from the record in `state.history`, which is kept in
 * the save.
 */

/** Pixels a tile on the replay map, before CSS fits it to the dialog. */
const PX = 6;
/** How far a city's land reaches on the replay map. Its working radius. */
const REACH = 2;
/** Turns a second while playing. */
const SPEED = 8;

/** "1 city", "5 cities": figures, not words, in a row of them. */
const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

interface Moment {
  frame: number;
  turn: number;
  text: string;
}

/** Owner and size of each city in a frame, by id. */
function citiesOf(frame: TurnRecord): Map<number, { owner: number; size: number }> {
  const out = new Map<number, { owner: number; size: number }>();
  for (let i = 0; i + 2 < frame.cities.length; i += 3) {
    out.set(frame.cities[i], { owner: frame.cities[i + 1], size: frame.cities[i + 2] });
  }
  return out;
}

/**
 * Every folly and ending work, as its own moment. There is one of each in the
 * world, so these are what a game is remembered by -- and the turn the Portal
 * went up is the turn somebody won.
 */
function worksRaised(state: GameState, frames: TurnRecord[]): Moment[] {
  const sites = state.sites ?? {};
  return (state.landmarks ?? []).map((w) => {
    // The frame this turn belongs to, so clicking it lands on the right one.
    let frame = frames.findIndex((f) => f.turn >= w.turn);
    if (frame < 0) frame = frames.length - 1;
    const where = sites[w.city]?.[2];
    const who = state.players[w.owner]?.name ?? 'Somebody';
    const what = BUILDINGS[w.id]?.name ?? w.id;
    return {
      frame: Math.max(0, frame),
      turn: w.turn,
      text: where ? `${who} raises ${what} in ${where}.` : `${who} raises ${what}.`,
    };
  });
}

/** Every city taken or lost, read off the difference between turns. */
export function momentsOf(state: GameState, frames: TurnRecord[]): Moment[] {
  const sites = state.sites ?? {};
  const name = (id: number) => sites[id]?.[2] ?? 'a city';
  const side = (id: number) => state.players[id]?.name ?? 'Somebody';
  const out: Moment[] = [];
  let before = new Map<number, { owner: number; size: number }>();
  frames.forEach((frame, f) => {
    const now = citiesOf(frame);
    for (const [id, c] of now) {
      const was = before.get(id);
      if (f > 0 && was && was.owner !== c.owner) {
        out.push({ frame: f, turn: frame.turn, text: `${side(c.owner)} takes ${name(id)}.` });
      }
    }
    for (const [id, c] of before) {
      if (!now.has(id)) out.push({ frame: f, turn: frame.turn, text: `${name(id)} of ${side(c.owner)} is gone.` });
    }
    before = now;
  });
  // The works belong in the same list, in the order they happened.
  return [...out, ...worksRaised(state, frames)].sort((a, b) => a.turn - b.turn);
}

/** The map at one frame: terrain, each side's land, and its cities. */
function drawFrame(canvas: HTMLCanvasElement, state: GameState, frame: TurnRecord, base: ImageData): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(base, 0, 0);
  const w = state.width;
  const h = state.height;
  const sites = state.sites ?? {};
  const cities = citiesOf(frame);

  // Land: each tile to the nearest city within reach, a tint of its owner.
  const owner = new Int16Array(w * h).fill(-1);
  const best = new Float32Array(w * h).fill(Infinity);
  for (const [id, c] of cities) {
    const site = sites[id];
    if (!site) continue;
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const x = site[0] + dx;
        const y = site[1] + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (TERRAIN[state.terrain[i]].water) continue;
        const d = Math.hypot(dx, dy);
        if (d < best[i]) {
          best[i] = d;
          owner[i] = c.owner;
        }
      }
    }
  }
  ctx.globalAlpha = 0.42;
  for (let i = 0; i < w * h; i++) {
    if (owner[i] < 0) continue;
    ctx.fillStyle = state.players[owner[i]]?.color ?? '#888';
    ctx.fillRect((i % w) * PX, Math.floor(i / w) * PX, PX, PX);
  }
  ctx.globalAlpha = 1;

  // Cities holding a work, by this turn: a folly or an ending work is one of a
  // kind, and where it stands is half the story of the game.
  const works = new Set(
    (state.landmarks ?? []).filter((w) => w.turn <= frame.turn).map((w) => w.city),
  );

  // Cities: a square that grows with the city, edged so it reads on any land.
  for (const [id, c] of cities) {
    const site = sites[id];
    if (!site) continue;
    const r = Math.min(PX * 1.6, PX * 0.55 + c.size * 0.45);
    const cx = site[0] * PX + PX / 2;
    const cy = site[1] * PX + PX / 2;
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
    ctx.fillStyle = state.players[c.owner]?.color ?? '#888';
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    if (works.has(id)) {
      // A gold pip above the town, which reads at this size where a monument
      // drawn to scale would be three pixels of mud.
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(cx - 2, cy - r - 5, 4, 4);
      ctx.fillStyle = '#e8c45a';
      ctx.fillRect(cx - 1.5, cy - r - 4.5, 3, 3);
    }
  }
}

/** The terrain, drawn once and laid under every frame. */
function terrainImage(state: GameState): ImageData {
  const w = state.width * PX;
  const h = state.height * PX;
  const img = new ImageData(w, h);
  for (let ty = 0; ty < state.height; ty++) {
    for (let tx = 0; tx < state.width; tx++) {
      const n = parseInt(TERRAIN[state.terrain[ty * state.width + tx]].base.slice(1), 16);
      const r = ((n >> 16) & 255) * 0.8;
      const g = ((n >> 8) & 255) * 0.8;
      const b = (n & 255) * 0.8;
      for (let py = 0; py < PX; py++) {
        let o = ((ty * PX + py) * w + tx * PX) * 4;
        for (let px = 0; px < PX; px++, o += 4) {
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = b;
          img.data[o + 3] = 255;
        }
      }
    }
  }
  return img;
}

/** Score over the game, one line a side, as an SVG. */
function chart(state: GameState, frames: TurnRecord[]): string {
  const W = 600;
  const H = 120;
  const top = Math.max(1, ...frames.flatMap((f) => f.players.map((p) => p[ROW.score])));
  const x = (f: number) => (frames.length === 1 ? W / 2 : (f / (frames.length - 1)) * W);
  const y = (v: number) => H - 4 - (v / top) * (H - 8);
  const lines = state.players
    .map((p) => {
      const pts = frames.map((f, i) => `${x(i).toFixed(1)},${y(f.players[p.id]?.[ROW.score] ?? 0).toFixed(1)}`);
      return `<polyline fill="none" stroke="${p.color}" stroke-width="2" points="${pts.join(' ')}" />`;
    })
    .join('');
  return `<svg class="replay-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${lines}
    <line class="replay-cursor" x1="0" x2="0" y1="0" y2="${H}" />
  </svg>`;
}

/** Whether there is anything to replay: at least one turn kept. */
export function canReplay(state: GameState): boolean {
  return (state.history?.length ?? 0) >= 1;
}

export function openReplay(state: GameState, onBack: () => void): void {
  const score = (id: number) => playerScore(state, id);
  const frames = replayFrames(state, score);
  const moments = momentsOf(state, frames);
  const firstKept = frames[0]?.turn ?? 1;
  const last = frames.length - 1;

  openModal({
    title: 'The Game Again',
    width: 'min(760px, 96vw)',
    sticky: true,
    body: `
      <div class="panel-body replay">
        ${
          firstKept > 1
            ? `<p class="flavor">This game was begun before the game kept a record, so it
               replays from turn ${firstKept}, where the record starts.</p>`
            : ''
        }
        <canvas class="replay-map" width="${state.width * PX}" height="${state.height * PX}"></canvas>
        <div class="replay-controls">
          <button class="small" id="replay-play">Play</button>
          <input type="range" id="replay-turn" min="0" max="${last}" value="0" />
          <span class="replay-turn-label"></span>
        </div>
        ${chart(state, frames)}
        <div class="replay-stats"></div>
        ${
          moments.length
            ? `<div class="field-label">What happened</div>
               <div class="replay-moments">${moments
                 .map(
                   (m) =>
                     `<button class="replay-moment" data-frame="${m.frame}"><span class="muted">Turn ${m.turn}</span> ${escapeHtml(m.text)}</button>`,
                 )
                 .join('')}</div>`
            : '<p class="flavor">No city ever changed hands, and nothing great was raised.</p>'
        }
      </div>
      <div class="button-row" style="justify-content:flex-end">
        <button class="primary" id="replay-back">Back</button>
      </div>`,
    onMount: (root, close) => {
      const canvas = root.querySelector<HTMLCanvasElement>('.replay-map')!;
      const slider = root.querySelector<HTMLInputElement>('#replay-turn')!;
      const label = root.querySelector<HTMLElement>('.replay-turn-label')!;
      const stats = root.querySelector<HTMLElement>('.replay-stats')!;
      const cursor = root.querySelector<SVGLineElement>('.replay-cursor')!;
      const play = root.querySelector<HTMLButtonElement>('#replay-play')!;
      const base = terrainImage(state);
      let timer: number | null = null;

      const show = (f: number) => {
        const frame = frames[f];
        slider.value = String(f);
        label.textContent = `Turn ${frame.turn}`;
        drawFrame(canvas, state, frame, base);
        const cx = last === 0 ? 300 : (f / last) * 600;
        cursor.setAttribute('x1', String(cx));
        cursor.setAttribute('x2', String(cx));
        stats.innerHTML = state.players
          .map((p) => {
            const row = frame.players[p.id] ?? [0, 0, 0, 0, 0];
            return `<div class="stat-row">
              <span class="label" style="color:${p.color}">${escapeHtml(p.name)}</span>
              <span class="value">${row[ROW.score]} pts · ${n(row[ROW.cities], 'city', 'cities')} · ${n(row[ROW.citizens], 'citizen')} · ${n(row[ROW.units], 'unit')} · ${n(row[ROW.advances], 'advance')}</span>
            </div>`;
          })
          .join('');
      };
      const stop = () => {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
        play.textContent = 'Play';
      };
      play.addEventListener('click', () => {
        if (timer !== null) return stop();
        if (Number(slider.value) >= last) show(0);
        play.textContent = 'Pause';
        timer = window.setInterval(() => {
          const next = Number(slider.value) + 1;
          if (next > last) return stop();
          show(next);
        }, 1000 / SPEED);
      });
      slider.addEventListener('input', () => {
        stop();
        show(Number(slider.value));
      });
      root.querySelectorAll<HTMLElement>('.replay-moment').forEach((b) =>
        b.addEventListener('click', () => {
          stop();
          show(Number(b.dataset.frame));
        }),
      );
      root.querySelector('#replay-back')?.addEventListener('click', () => {
        stop();
        close();
        onBack();
      });
      show(0);
    },
  });
}
