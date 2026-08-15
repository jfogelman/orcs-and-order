import './style.css';

import { runAiTurn } from './ai/ai';
import { audio } from './audio/audio';
import { idx } from './engine/grid';
import { FACTIONS } from './model/factions';
import { TERRAIN } from './model/terrain';
import { TECHS_BY_ID } from './model/techs';
import { unitType } from './model/units';
import type { City, GameState, Unit } from './model/types';
import { Camera } from './render/camera';
import { EMPTY_OVERLAY, MapRenderer } from './render/mapRenderer';
import type { MapOverlay } from './render/mapRenderer';
import { Minimap } from './render/minimap';
import { canFoundCity, foundCity, productionName } from './sim/city';
import type { NewGameOptions } from './sim/gamestate';
import { cityAt, createGame, playerCities, playerUnits, unitAt } from './sim/gamestate';
import {
  attackTargets,
  estimateTurns,
  moveToward,
  reachableTiles,
  routeTo,
  tryStep,
} from './sim/movement';
import { researchableTechs, techCost } from './sim/research';
import { beginPlayerTurn, endPlayerTurn, idleUnits, scoreBreakdown } from './sim/turn';
import { openCityPanel } from './ui/cityPanel';
import { closeModal, el, escapeHtml, isModalOpen, openModal } from './ui/dom';
import { openAudioMenu, openNewGameMenu, openSaveMenu } from './ui/menus';
import { openPedia } from './ui/pedia';
import { openTechPanel } from './ui/techPanel';

/** Turns the battle theme keeps playing after the last enemy is lost from sight. */
const BATTLE_LINGER_TURNS = 2;

/** Any of these count as the user gesture browsers require before playback. */
const AUDIO_UNLOCK_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const;

const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

class App {
  private canvas = el<HTMLCanvasElement>('map');
  private minimapCanvas = el<HTMLCanvasElement>('minimap');
  private state: GameState;
  private camera: Camera;
  private renderer: MapRenderer;
  private minimap: Minimap;
  private overlay: MapOverlay = { ...EMPTY_OVERLAY };

  /** The person at the keyboard. */
  private readonly viewerId = 0;
  private lastFrame = performance.now();
  private held = new Set<string>();
  private dragging = false;
  private dragMoved = 0;
  private lastPointer: { x: number; y: number } | null = null;
  /** Turn on which the battle theme may give way to the world theme again. */
  private calmAgainOnTurn = -1;

  constructor() {
    this.state = createGame({ playerFaction: 'orc' });
    beginPlayerTurn(this.state, this.viewerId);
    this.camera = new Camera(this.state.width, this.state.height);
    this.renderer = new MapRenderer(this.canvas);
    this.minimap = new Minimap(this.minimapCanvas);

    this.resize();
    this.centerOnHome();
    this.bindEvents();
    this.selectNextIdle();
    this.refreshHud();
    this.promptResearchIfIdle();
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------- lifecycle

  private centerOnHome(): void {
    const own = playerUnits(this.state, this.viewerId);
    if (own.length > 0) this.camera.centerOnTile(own[0].x, own[0].y);
  }

  private startGame(options: NewGameOptions): void {
    closeModal();
    this.adopt(createGame(options));
    beginPlayerTurn(this.state, this.viewerId);
    this.selectNextIdle();
    this.refreshHud();
    this.promptResearchIfIdle();
  }

  /** Swap in a different game state — new game, or one loaded from a save. */
  private adopt(state: GameState): void {
    this.state = state;
    // A new or loaded game starts from a clean slate musically.
    this.calmAgainOnTurn = -1;
    this.camera.setMapSize(state.width, state.height);
    this.overlay = { ...EMPTY_OVERLAY, showGrid: this.overlay.showGrid };
    this.centerOnHome();
    this.refreshHud();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.setViewport(w, h);
  }

  // ------------------------------------------------------------- selection

  private get selected(): Unit | undefined {
    return this.state.units.find((u) => u.id === this.overlay.selectedUnitId);
  }

  private select(unit: Unit | null): void {
    this.overlay.selectedUnitId = unit?.id ?? null;
    this.refreshOverlays();
    this.refreshSidebar();
  }

  private refreshOverlays(): void {
    const unit = this.selected;
    if (!unit || unit.owner !== this.viewerId) {
      this.overlay.reachable = null;
      this.overlay.attacks = null;
      this.overlay.path = null;
      this.overlay.gotoPath = null;
      return;
    }
    this.overlay.reachable = new Set(reachableTiles(this.state, unit).keys());
    this.overlay.attacks = attackTargets(this.state, unit);
    // A standing order is invisible otherwise, and looks like it was forgotten.
    this.overlay.gotoPath = unit.goto
      ? routeTo(this.state, unit, unit.goto.x, unit.goto.y)
      : null;
    this.updatePathPreview();
  }

  private updatePathPreview(): void {
    const unit = this.selected;
    const hover = this.overlay.hover;
    if (!unit || !hover || unit.owner !== this.viewerId) {
      this.overlay.path = null;
      return;
    }
    if (hover.x === unit.x && hover.y === unit.y) {
      this.overlay.path = null;
      return;
    }
    this.overlay.path = routeTo(this.state, unit, hover.x, hover.y);
  }

  /** Jump to the next unit that still has something to do. */
  private selectNextIdle(): void {
    const idle = idleUnits(this.state, this.viewerId);
    if (idle.length === 0) {
      this.select(null);
      return;
    }
    const current = this.selected;
    const startAt = current ? idle.findIndex((u) => u.id === current.id) + 1 : 0;
    const next = idle[startAt % idle.length] ?? idle[0];
    this.select(next);
    this.camera.centerOnTile(next.x, next.y);
  }

  // ---------------------------------------------------------------- action

  private actOn(x: number, y: number): void {
    const unit = this.selected;
    if (!unit || unit.owner !== this.viewerId || this.state.winner !== null) return;
    if (unit.x === x && unit.y === y) return;

    // Note both types up front: either combatant may not survive the call.
    const attackerType = unit.type;
    const defenderType = unitAt(this.state, x, y)?.type;

    const targets = attackTargets(this.state, unit);
    const outcome = targets.has(idx(x, y, this.state.width))
      ? tryStep(this.state, unit, x, y)
      : moveToward(this.state, unit, x, y);

    if (outcome.kind === 'blocked') {
      this.flash(outcome.reason);
    } else if (outcome.kind === 'combat') {
      audio.playForUnit(attackerType, 'attack');
      const loser = outcome.defenderDied ? defenderType : attackerType;
      // Let the swing land before the scream.
      if (loser) window.setTimeout(() => audio.playForUnit(loser, 'death'), 280);
    } else if (outcome.kind === 'captured') {
      audio.play('sword');
    }
    // The unit may have died attacking.
    if (!this.state.units.includes(unit)) this.select(null);
    else if (unit.moves <= 0) this.selectNextIdle();

    this.refreshHud();
    this.refreshOverlays();
  }

  private orderFortify(): void {
    const unit = this.selected;
    if (!unit) return;
    unit.order = unit.order === 'fortified' ? 'none' : 'fortified';
    unit.goto = null;
    this.refreshSidebar();
  }

  private orderSentry(): void {
    const unit = this.selected;
    if (!unit) return;
    unit.order = 'sentry';
    unit.goto = null;
    this.selectNextIdle();
  }

  private orderSkip(): void {
    const unit = this.selected;
    if (!unit) return;
    unit.order = 'skip';
    unit.moves = 0;
    this.selectNextIdle();
  }

  private orderFound(): void {
    const unit = this.selected;
    if (!unit) return;
    const check = canFoundCity(this.state, unit, unit.x, unit.y);
    if (!check.ok) {
      this.flash(check.reason ?? 'Not here.');
      return;
    }
    const city = foundCity(this.state, unit);
    this.select(null);
    this.refreshHud();
    if (city) this.openCity(city);
  }

  private openCity(city: City): void {
    openCityPanel(this.state, city, () => this.refreshHud());
  }

  private endTurn(): void {
    if (this.state.winner !== null) return;
    closeModal();
    endPlayerTurn(this.state);

    // Play out every AI in sequence until control returns here.
    let guard = 0;
    while (
      this.state.winner === null &&
      this.state.players[this.state.activePlayer].controller === 'ai' &&
      guard++ < 64
    ) {
      runAiTurn(this.state, this.state.activePlayer);
      endPlayerTurn(this.state);
    }

    this.select(null);
    this.selectNextIdle();
    this.refreshHud();
    if (this.state.winner !== null) {
      this.showVictory();
      return;
    }
    this.promptResearchIfIdle();
  }

  /**
   * Ask what to research next rather than choosing silently.
   *
   * Beakers bank up while nothing is selected, so being asked never costs
   * progress -- but the direction of an empire's research is exactly the sort
   * of decision that should not happen behind the player's back.
   */
  private promptResearchIfIdle(): void {
    const player = this.state.players[this.viewerId];
    if (player.researching || isModalOpen() || this.state.winner !== null) return;
    if (researchableTechs(player).length === 0) return;
    openTechPanel(this.state, player, () => this.refreshHud());
  }

  private showVictory(): void {
    const winner = this.state.players[this.state.winner!];
    const you = winner.id === this.viewerId;
    audio.playMusic('victory');
    // Show the breakdown, not just a total: a player who lost on points
    // deserves to see which column beat them.
    const scores = this.state.players
      .map((p) => {
        const s = scoreBreakdown(this.state, p.id);
        return `
          <div class="stat-row">
            <span class="label" style="color:${p.color}">${escapeHtml(p.name)}</span>
            <span class="value">${s.total} pts</span>
          </div>
          <div class="stat-row">
            <span class="label muted" style="padding-left:12px">citizens · advances · structures</span>
            <span class="value muted">${s.population} + ${s.advances} + ${s.buildings}</span>
          </div>`;
      })
      .join('');

    openModal({
      title: you ? 'You have won' : 'You have lost',
      width: 'min(600px, 94vw)',
      body: `
        <div class="panel-body">
          <p style="font-size:16px">${escapeHtml(winner.name)} comes out on top after ${this.state.turn} turns.</p>
          ${scores}
          <p class="flavor">${
            you
              ? 'History will record this as inevitable. History was not watching turns 4 through 30.'
              : 'The survivors have agreed never to discuss what happened here.'
          }</p>
        </div>
        <div class="button-row" style="justify-content:flex-end">
          <button class="primary" id="btn-again">Another Go</button>
        </div>`,
      onMount: (root, close) => {
        root.querySelector('#btn-again')?.addEventListener('click', () => {
          close();
          this.openNewGame();
        });
      },
    });
  }

  private flash(message: string): void {
    const box = el('logbox');
    const div = document.createElement('div');
    div.className = 'entry k-bad';
    div.textContent = message;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  // ----------------------------------------------------------------- input

  private bindEvents(): void {
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Browsers block all playback until the user has interacted with the page,
    // so the soundtrack starts on whatever they touch first.
    // Listen for several kinds of first contact, not just pointerdown: some
    // input paths deliver mousedown or touchstart without a pointer event, and
    // missing the gesture means the soundtrack never starts at all.
    const startAudio = () => {
      audio.unlock();
      // Pick the theme that fits the situation rather than always opening calm.
      this.updateMusic();
      this.refreshMuteButton();
      for (const type of AUDIO_UNLOCK_EVENTS) {
        window.removeEventListener(type, startAudio);
      }
    };
    for (const type of AUDIO_UNLOCK_EVENTS) {
      window.addEventListener(type, startAudio);
    }

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        const t = this.tileFromEvent(e);
        if (t) this.actOn(t.x, t.y);
        return;
      }
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // Capture is an optimisation for dragging outside the canvas; if the
        // browser refuses it, panning still works without it.
      }
      this.dragging = true;
      this.dragMoved = 0;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const t = this.tileFromEvent(e);
      this.overlay.hover = t;
      this.updatePathPreview();
      if (!this.selected) this.refreshSidebar();

      if (!this.dragging || !this.lastPointer) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.dragMoved > 4) {
        this.canvas.classList.add('panning');
        this.camera.panByScreen(dx, dy);
      }
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.canvas.classList.remove('panning');
      if (this.dragMoved <= 4) {
        const t = this.tileFromEvent(e);
        if (t) this.onLeftClick(t.x, t.y);
      }
      this.lastPointer = null;
    });
    this.canvas.addEventListener('pointercancel', () => {
      this.dragging = false;
      this.canvas.classList.remove('panning');
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        this.camera.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );

    this.minimapCanvas.addEventListener('pointerdown', (e) => {
      const rect = this.minimapCanvas.getBoundingClientRect();
      const t = this.minimap.tileAt(e.clientX - rect.left, e.clientY - rect.top);
      this.camera.centerOnTile(t.x, t.y);
    });

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.held.delete(e.key));
    window.addEventListener('blur', () => this.held.clear());

    el<HTMLButtonElement>('btn-new').addEventListener('click', () => this.openNewGame());
    el<HTMLButtonElement>('btn-save').addEventListener('click', () => this.openSaves());
    el<HTMLButtonElement>('btn-mute').addEventListener('click', () =>
      openAudioMenu(() => this.refreshMuteButton()),
    );
    el<HTMLButtonElement>('btn-endturn').addEventListener('click', () => this.endTurn());
    el<HTMLButtonElement>('btn-tech').addEventListener('click', () =>
      openTechPanel(this.state, this.state.players[this.viewerId], () => this.refreshHud()),
    );
  }

  /** Any enemy unit the local player can see right now. */
  private enemyInSight(): boolean {
    const viewer = this.state.players[this.viewerId];
    for (const u of this.state.units) {
      if (u.owner === this.viewerId) continue;
      if (viewer.visible[idx(u.x, u.y, this.state.width)]) return true;
    }
    return false;
  }

  /**
   * Switch between the world and battle themes as enemies come and go.
   *
   * Deliberately only enemy *units* count. Enemy cities never move, so once
   * your border touched theirs the battle theme would simply never stop.
   *
   * The linger is what makes it listenable: without it, a scout stepping in and
   * out of sight would flip the soundtrack back and forth every single turn.
   */
  private updateMusic(): void {
    // The victory theme outranks everything.
    if (this.state.winner !== null) return;
    if (this.enemyInSight()) {
      this.calmAgainOnTurn = this.state.turn + BATTLE_LINGER_TURNS;
    }
    audio.playMusic(this.state.turn <= this.calmAgainOnTurn ? 'battle' : 'world');
  }

  private toggleMute(): void {
    audio.toggleMute();
    this.refreshMuteButton();
  }

  private refreshMuteButton(): void {
    el('btn-mute').textContent = audio.muted ? 'Sound: off' : 'Sound: on';
  }

  private openNewGame(): void {
    openNewGameMenu(this.state.players[this.viewerId].faction, (options) =>
      this.startGame(options),
    );
  }

  private openSaves(): void {
    openSaveMenu(
      this.state,
      (loaded) => {
        this.adopt(loaded);
        this.selectNextIdle();
        this.flash('Game loaded.');
      },
      (message) => this.flash(message),
    );
  }

  private tileFromEvent(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const t = this.camera.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    if (t.x < 0 || t.y < 0 || t.x >= this.state.width || t.y >= this.state.height) return null;
    return t;
  }

  private onLeftClick(x: number, y: number): void {
    const unit = unitAt(this.state, x, y);
    const city = cityAt(this.state, x, y);
    const visible = this.state.players[this.viewerId].visible[idx(x, y, this.state.width)] === 1;
    const mine = unit && unit.owner === this.viewerId && visible;
    const myCity = city && city.owner === this.viewerId;

    if (mine) {
      // A garrison sits on top of its city, so the unit would otherwise swallow
      // every click and the city could never be opened. Clicking a unit that is
      // already selected falls through to whatever it is standing on.
      if (this.overlay.selectedUnitId !== unit.id) {
        this.select(unit);
        return;
      }
      if (myCity) {
        this.openCity(city);
        return;
      }
    }

    if (myCity && !mine) {
      this.openCity(city);
      return;
    }

    // Left-click on open ground doubles as a move order, which is what most
    // people reach for first. Ordering a unit *into* one of your own cities is
    // a right-click, since a left-click there means "show me this city".
    const selected = this.selected;
    if (selected) {
      const i = idx(x, y, this.state.width);
      if (this.overlay.reachable?.has(i) || this.overlay.attacks?.has(i)) {
        this.actOn(x, y);
        return;
      }
    }
    this.select(null);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.openSaves();
      return;
    }
    if (e.key in PAN_KEYS) {
      this.held.add(e.key);
      e.preventDefault();
      return;
    }
    if (isModalOpen()) return;
    const unit = this.selected;
    switch (e.key.toLowerCase()) {
      case 'enter':
        this.endTurn();
        break;
      case ' ':
        e.preventDefault();
        this.orderSkip();
        break;
      case 'f':
        this.orderFortify();
        break;
      case 's':
        this.orderSentry();
        break;
      case 'b':
        this.orderFound();
        break;
      case 'n':
        this.selectNextIdle();
        break;
      case 'c':
        if (unit) this.camera.centerOnTile(unit.x, unit.y);
        break;
      case 't':
        openTechPanel(this.state, this.state.players[this.viewerId], () => this.refreshHud());
        break;
      case 'g':
        this.overlay.showGrid = !this.overlay.showGrid;
        break;
      case 'm':
        this.toggleMute();
        break;
      case 'p':
        openPedia(this.state.players[this.viewerId], this.selected?.type);
        break;
      case 'escape':
        this.select(null);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------- HUD

  private refreshHud(): void {
    const p = this.state.players[this.viewerId];
    const faction = FACTIONS[p.faction];
    el('stat-civ').textContent = faction.civName;
    el('stat-turn').textContent = `Turn ${this.state.turn}`;
    el('stat-gold').textContent = `${p.gold}g`;

    const research = p.researching ? TECHS_BY_ID[p.researching] : null;
    el('stat-research').textContent = research
      ? `${research.name} — ${p.beakers}/${techCost(p, research)}`
      : 'Researching nothing in particular';

    this.refreshLog();
    this.refreshOverlays();
    this.refreshSidebar();
    this.updateMusic();
  }

  private refreshLog(): void {
    const box = el('logbox');
    const mine = this.state.log.filter((e) => e.player === null || e.player === this.viewerId);
    box.innerHTML = mine
      .slice(-40)
      .map(
        (e) =>
          `<div class="entry k-${e.kind}"><span class="muted">T${e.turn}</span> ${escapeHtml(e.text)}</div>`,
      )
      .join('');
    box.scrollTop = box.scrollHeight;
  }

  private refreshSidebar(): void {
    const panel = el('selection');
    const unit = this.selected;

    if (unit) {
      const t = unitType(unit.type);
      const canSettle = t.settler && canFoundCity(this.state, unit, unit.x, unit.y).ok;
      const cityHere = cityAt(this.state, unit.x, unit.y);
      panel.innerHTML = `
        <div class="panel-title">
          <a href="#" class="pedia-link" data-pedia="${escapeHtml(t.id)}"
             title="Look it up in the Orcpedia">${escapeHtml(t.name)}</a>${unit.veteran ? ' <span class="muted">· veteran</span>' : ''}
        </div>
        <div class="panel-body">
          <div class="stat-row"><span class="label">Attack / Defence</span><span class="value">${t.attack} / ${t.defense}</span></div>
          <div class="stat-row"><span class="label">Health</span><span class="value">${unit.hp} / ${t.hp}</span></div>
          <div class="stat-row"><span class="label">Movement</span><span class="value">${unit.moves} / ${t.move}</span></div>
          ${
            t.crowded
              ? `<div class="stat-row"><span class="label">Crowd</span><span class="value k-bad">${t.count} of them, nobody agreeing</span></div>`
              : ''
          }
          ${unit.order !== 'none' ? `<div class="chip">${unit.order}</div>` : ''}
          ${
            unit.goto
              ? `<div class="chip">marching to (${unit.goto.x}, ${unit.goto.y})${
                  this.overlay.gotoPath
                    ? ` &middot; ~${estimateTurns(this.state, unit, this.overlay.gotoPath)} turns`
                    : ''
                }</div>`
              : ''
          }
          <p class="flavor">${escapeHtml(t.blurb)}</p>
        </div>
        <div class="button-row">
          ${canSettle ? '<button class="small" data-act="found">Found City (B)</button>' : ''}
          ${
            cityHere
              ? `<button class="small" data-act="city">Open ${escapeHtml(cityHere.name)}</button>`
              : ''
          }
          <button class="small" data-act="fortify">${unit.order === 'fortified' ? 'Wake (F)' : 'Fortify (F)'}</button>
          <button class="small" data-act="sentry">Sentry (S)</button>
          <button class="small" data-act="skip">Skip (Space)</button>
          <button class="small" data-act="next">Next (N)</button>
        </div>`;
      panel.querySelectorAll<HTMLElement>('[data-pedia]').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          openPedia(this.state.players[this.viewerId], link.dataset.pedia);
        });
      });
      panel.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          switch (btn.dataset.act) {
            case 'found':
              this.orderFound();
              break;
            case 'fortify':
              this.orderFortify();
              break;
            case 'sentry':
              this.orderSentry();
              break;
            case 'skip':
              this.orderSkip();
              break;
            case 'next':
              this.selectNextIdle();
              break;
            case 'city':
              if (cityHere) this.openCity(cityHere);
              break;
          }
        });
      });
      return;
    }

    panel.innerHTML = `${this.tileReadout()}${this.cityList()}`;
    panel.querySelectorAll<HTMLElement>('[data-city]').forEach((row) => {
      row.addEventListener('click', () => {
        const city = this.state.cities.find((c) => c.id === Number(row.dataset.city));
        if (city) {
          this.camera.centerOnTile(city.x, city.y);
          this.openCity(city);
        }
      });
    });
  }

  private tileReadout(): string {
    const h = this.overlay.hover;
    if (!h) {
      return `<div class="panel-title">Nothing selected</div>
        <div class="panel-body muted">Left-click a unit to select it. Right-click to send it somewhere.</div>`;
    }
    const i = idx(h.x, h.y, this.state.width);
    const viewer = this.state.players[this.viewerId];
    if (!viewer.explored[i]) {
      return `<div class="panel-title">Unknown</div>
        <div class="panel-body muted">Nobody has been here. Nobody is volunteering.</div>`;
    }
    const def = TERRAIN[this.state.terrain[i]];
    const special = this.state.specials[i] && def.special ? def.special : null;
    const occupant = viewer.visible[i] ? unitAt(this.state, h.x, h.y) : undefined;
    const city = cityAt(this.state, h.x, h.y);
    return `
      <div class="panel-title">${escapeHtml(def.name)} <span class="muted">(${h.x}, ${h.y})</span></div>
      <div class="panel-body">
        <div class="stat-row"><span class="label">Food / Shields / Trade</span><span class="value">${special ? special.food : def.food} / ${special ? special.shields : def.shields} / ${special ? special.trade : def.trade}</span></div>
        <div class="stat-row"><span class="label">Move cost</span><span class="value">${def.moveCost}</span></div>
        <div class="stat-row"><span class="label">Defence</span><span class="value">x${def.defense}</span></div>
        ${special ? `<div class="chip">${escapeHtml(special.name)}</div>` : ''}
        ${city ? `<div class="chip ${this.state.players[city.owner].faction}">${escapeHtml(city.name)} (${city.size})</div>` : ''}
        ${occupant ? `<div class="chip ${this.state.players[occupant.owner].faction}">${escapeHtml(unitType(occupant.type).name)}</div>` : ''}
      </div>`;
  }

  private cityList(): string {
    const cities = playerCities(this.state, this.viewerId);
    if (cities.length === 0) return '';
    const rows = cities
      .map(
        (c) => `
        <div class="city-row" data-city="${c.id}">
          <span>${escapeHtml(c.name)} <span class="muted">(${c.size})</span></span>
          <span class="muted">${escapeHtml(productionName(c.producing))}</span>
        </div>`,
      )
      .join('');
    return `<div class="panel-title" style="margin-top:8px">Cities</div><div class="panel-body">${rows}</div>`;
  }

  // ------------------------------------------------------------------ loop

  /**
   * One full render. Split out from the animation loop so a headless check or
   * a screenshot tool can paint a frame without an animation frame firing.
   */
  renderOnce(dt = 0): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round((this.canvas.clientWidth || window.innerWidth) * dpr)) {
      this.resize();
    }
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.renderer.draw(this.state, this.viewerId, this.camera, this.overlay, dt);
    }
    this.minimap.draw(this.state, this.viewerId, this.camera);
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.held.size > 0) {
      let dx = 0;
      let dy = 0;
      for (const key of this.held) {
        const d = PAN_KEYS[key];
        if (d) {
          dx += d[0];
          dy += d[1];
        }
      }
      if (dx || dy) this.camera.panByScreen(-dx * 900 * dt, -dy * 900 * dt);
    }

    this.renderOnce(dt);
    requestAnimationFrame(this.frame);
  };
}

const app = new App();

// Development handle: lets a console (or a headless check) poke at the running
// game and force a repaint without waiting for an animation frame.
if (import.meta.env.DEV) {
  const scope = window as unknown as Record<string, unknown>;
  scope.game = app;
  // The audio manager is a module singleton; exposing the app's own reference
  // avoids a console `import()` handing back a second, unrelated instance.
  scope.audio = audio;
}
