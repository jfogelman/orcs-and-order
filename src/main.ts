import './style.css';

import { runAiTurn } from './ai/ai';
import { audio } from './audio/audio';
import type { SfxId } from './audio/audio';
import { idx } from './engine/grid';
import { FACTIONS } from './model/factions';
import { TERRAIN } from './model/terrain';
import { TECHS_BY_ID } from './model/techs';
import { unitType } from './model/units';
import type { City, GameState, Unit } from './model/types';
import { owedPerks, perkChoices, perkName, PERK_BY_ID } from './model/perks';
import { Camera } from './render/camera';
import { EffectLayer } from './render/effects';
import type { EffectId } from './render/effects';
import { EMPTY_OVERLAY, MapRenderer } from './render/mapRenderer';
import type { MapOverlay, RoutePreview } from './render/mapRenderer';
import { Minimap } from './render/minimap';
import { autoBuildOf, canFoundCity, foundCity, inSupply, productionName } from './sim/city';
import type { NewGameOptions } from './sim/gamestate';
import { cityAt, createGame, playerCities, playerUnits, unitAt } from './sim/gamestate';
import {
  attackTargets,
  estimateTurns,
  moveToward,
  reachableTiles,
  routeTo,
  stepsThisTurn,
  tryStep,
} from './sim/movement';
import { researchableTechs, techCost } from './sim/research';
import { beginPlayerTurn, endPlayerTurn, idleUnits, scoreBreakdown } from './sim/turn';
import { openCityPanel } from './ui/cityPanel';
import { closeModal, el, escapeHtml, isModalOpen, openModal } from './ui/dom';
import { ABILITIES, abilitiesOf, abilityReady, abilityTargets, useAbility } from './sim/abilities';
import type { AbilityId } from './sim/abilities';
import { openAudioMenu, openNewGameMenu, openPerkMenu, openSaveMenu, openTitleMenu } from './ui/menus';
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
  private effects = new EffectLayer();
  /**
   * The ability the selected unit has armed, if any. While this is set the map
   * is in target-select mode: the next click picks a *target* rather than a
   * destination, and nothing but a legal target does anything.
   */
  private armed: AbilityId | null = null;
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
  /** How much of the log has already been turned into noise. */
  private soundedLogEntries = 0;

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
    // The map behind this is a real game, generated so there is something to
    // look at rather than a blank canvas -- but it is nobody's game until a
    // choice is made here, and New Game replaces it wholesale.
    this.openTitle();
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
    // Selecting anything at all abandons an armed ability; keeping it armed
    // across a change of unit is how you fire the wrong thing at the wrong
    // target.
    this.disarm(false);
    if (unit && this.overlay.selectedUnitId !== unit.id) audio.play('select');
    this.overlay.selectedUnitId = unit?.id ?? null;
    this.refreshOverlays();
    this.refreshSidebar();
  }

  private refreshOverlays(): void {
    // Target-select mode owns the overlay while it is armed.
    if (this.armed !== null) {
      const unit = this.selected;
      const tiles = unit
        ? abilityTargets(this.state, unit, this.armed).map((t) => idx(t.x, t.y, this.state.width))
        : [];
      this.overlay.targets = new Set(tiles);
      if (tiles.length === 0) this.disarm(false);
    } else {
      this.overlay.targets = null;
    }
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
      ? this.previewTo(unit, unit.goto.x, unit.goto.y)
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
    this.overlay.path = this.previewTo(unit, hover.x, hover.y);
  }

  /** A route, split at the point this turn's movement runs out. */
  private previewTo(unit: Unit, x: number, y: number): RoutePreview | null {
    const tiles = routeTo(this.state, unit, x, y);
    if (!tiles || tiles.length < 2) return null;
    return {
      tiles,
      thisTurn: stepsThisTurn(this.state, unit, tiles),
      turns: estimateTurns(this.state, unit, tiles),
    };
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
    const attacking = targets.has(idx(x, y, this.state.width));
    // Started before the fight resolves, so the swing is already playing while
    // the result is worked out -- and so it still plays if the attacker dies.
    if (attacking) this.animateAttack(unit);
    const outcome = attacking
      ? tryStep(this.state, unit, x, y)
      : moveToward(this.state, unit, x, y);

    if (outcome.kind === 'blocked') {
      this.flash(outcome.reason);
    } else if (outcome.kind === 'moved') {
      audio.play('move');
    } else if (outcome.kind === 'combat') {
      audio.playForUnit(attackerType, 'attack');
      const loser = outcome.defenderDied ? defenderType : attackerType;
      // Let the swing land before the scream.
      if (loser) window.setTimeout(() => audio.playForUnit(loser, 'death'), 280);
    }
    // The unit may have died attacking.
    if (!this.state.units.includes(unit)) {
      this.select(null);
    } else if (unit.moves <= 0) {
      // Let the swing finish before moving on. Advancing immediately centred
      // the camera on the next idle unit somewhere else entirely, so the
      // animation played faithfully off the edge of the screen -- which is
      // why attacks looked like they simply were not animated.
      window.setTimeout(() => {
        if (this.state.units.includes(unit) && unit.moves <= 0) this.selectNextIdle();
        this.promptPerkIfOwed();
      }, ATTACK_HOLD_MS);
    }

    // Drain here, not only at end of turn. Without this a city razed by the
    // player's own move produced its animation on the *next* drain, which is
    // the end of the turn -- so the settlement came apart minutes after it
    // stopped existing.
    this.playLogCues();
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
    this.playLogCues();
    if (city) this.openCity(city);
  }

  private openCity(city: City): void {
    openCityPanel(this.state, city, () => this.refreshHud());
  }

  /**
   * Play a sound for anything that happened to the viewing player since last
   * checked. Driven off the log rather than hooked into each rule, so events
   * that happen during the AI's turn are heard too.
   */
  private playLogCues(): void {
    const entries = this.state.log.slice(this.soundedLogEntries);
    this.soundedLogEntries = this.state.log.length;
    const heard = new Set<string>();
    let shown = 0;
    for (const entry of entries) {
      // Sound is addressed: you hear about your own empire.
      const addressed = entry.player === null || entry.player === this.viewerId;
      if (addressed && entry.cue) {
        // One of each per batch: ten cities growing on one turn is a machine gun.
        if (!heard.has(entry.cue)) {
          heard.add(entry.cue);
          audio.play(entry.cue as SfxId, 0);
        }
      }

      // Sight is not addressed. A fight happening next to you is one you can
      // watch, whoever the message was written for -- and the common case is
      // an enemy killing one of your units, where the message is addressed to
      // them. Filtering visuals by the recipient meant most of the fighting on
      // screen animated nothing at all.
      const doer =
        entry.actor === undefined
          ? undefined
          : this.state.units.find((u) => u.id === entry.actor);
      if (doer && this.canSee(doer.x, doer.y)) this.animateAttack(doer);

      // Animations are not deduplicated the way sounds are -- three separate
      // fights should be three explosions -- but they are staggered and
      // capped, because a whole AI turn drains at once and would otherwise
      // play every one of them on a single frame.
      const effect = effectFor(entry);
      if (!effect || !entry.at || shown >= EFFECT_BURST) continue;
      const [ex, ey] = entry.at;
      // Never draw an event the viewer cannot see. The layer will happily
      // paint over unexplored black, and an explosion in fog would give away
      // exactly where an enemy is.
      if (!this.canSee(ex, ey)) continue;
      this.effects.spawn(effect, ex, ey, { delay: shown * EFFECT_STAGGER });
      shown++;
    }
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
    this.playLogCues();
    if (this.state.winner !== null) {
      this.showVictory();
      return;
    }
    audio.play('turn', 0);
    // Promotions first: they are about something that already happened, and
    // the other two are about what to do next.
    this.promptPerkIfOwed();
    this.promptResearchIfIdle();
    this.promptBuildIfIdle();
  }

  /**
   * Ask what to research next rather than choosing silently.
   *
   * Beakers bank up while nothing is selected, so being asked never costs
   * progress -- but the direction of an empire's research is exactly the sort
   * of decision that should not happen behind the player's back.
   */
  /**
   * Ask about any promotion the player has not answered yet.
   *
   * Driven off what a unit is owed rather than a queue of events, so
   * promotions earned during an AI turn, or several at once, all get asked
   * about eventually and none can be lost. One at a time, and only when
   * nothing else is open.
   */
  private promptPerkIfOwed(): void {
    if (isModalOpen() || this.state.winner !== null) return;
    const unit = playerUnits(this.state, this.viewerId).find((u) => owedPerks(u) > 0);
    if (!unit) return;
    const options = perkChoices(unit);
    if (options.length === 0) return;
    openPerkMenu(unitType(unit.type).name, this.state.players[this.viewerId].faction, options, (id) => {
      unit.perks = [...(unit.perks ?? []), id];
      this.refreshSidebar();
      // There may be more than one waiting.
      this.promptPerkIfOwed();
    });
  }

  /**
   * Raise a city that has finished what it was making and has no new orders.
   *
   * Only cities set to `ask`, which is the default. A city told to pick the
   * next thing itself, or to bank the shields, has already answered this and is
   * never raised again.
   *
   * One a turn, deliberately. Walking the player through every idle city in one
   * go would mean re-opening the panel from inside its own change handler,
   * which re-renders itself -- and the two would fight. The per-city setting is
   * the real answer to not wanting to be asked, and it is two clicks away in
   * the panel this opens.
   */
  private promptBuildIfIdle(): void {
    if (isModalOpen() || this.state.winner !== null) return;
    const city = playerCities(this.state, this.viewerId).find(
      (c) => c.size > 0 && c.producing.kind === 'coin' && autoBuildOf(c) === 'ask',
    );
    if (!city) return;
    openCityPanel(this.state, city, () => this.refreshHud());
  }

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

  /** Something the player tried to do and could not. Sounds like refusal. */
  private flash(message: string): void {
    audio.play('blocked');
    this.notify(message, 'k-bad');
  }

  /**
   * A neutral or positive aside, such as "Game saved". Deliberately separate
   * from `flash`: routing both through one method meant saving a game played
   * the rejection sound.
   */
  private notify(message: string, cls = 'k-info'): void {
    const box = el('logbox');
    const div = document.createElement('div');
    div.className = `entry ${cls}`;
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
    el<HTMLButtonElement>('btn-pedia').addEventListener('click', () =>
      openPedia(this.state.players[this.viewerId], this.selected?.type),
    );
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

  /** The first screen: start something, or pick up something saved. */
  private openTitle(): void {
    openTitleMenu(
      () => this.openNewGame(),
      () => this.openSaves(),
    );
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
        this.notify('Game loaded.', 'k-good');
      },
      (message, ok) => (ok ? this.notify(message, 'k-good') : this.flash(message)),
    );
  }

  private tileFromEvent(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const t = this.camera.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    if (t.x < 0 || t.y < 0 || t.x >= this.state.width || t.y >= this.state.height) return null;
    return t;
  }

  /**
   * Arm an ability, so the next click on the map picks a target for it.
   *
   * Refuses up front and says why rather than arming into a state where every
   * click is silently rejected -- a mode you cannot get out of and that does
   * nothing is worse than no mode at all.
   */
  private arm(ability: AbilityId): void {
    const unit = this.selected;
    if (!unit || unit.owner !== this.viewerId) return;
    if (this.armed === ability) {
      this.disarm();
      return;
    }
    const blocked = abilityReady(unit, ability);
    if (blocked) {
      this.flash(blocked);
      return;
    }
    const targets = abilityTargets(this.state, unit, ability);
    if (targets.length === 0) {
      this.flash(`Nothing in reach to ${ABILITIES[ability].verb}.`);
      return;
    }
    this.armed = ability;
    this.refreshOverlays();
    this.refreshSidebar();
    this.notify(`${ABILITIES[ability].label}: pick a target. Escape to cancel.`);
  }

  private disarm(redraw = true): void {
    if (this.armed === null) return;
    this.armed = null;
    this.overlay.targets = null;
    if (redraw) {
      this.refreshOverlays();
      this.refreshSidebar();
    }
  }

  /**
   * Handle a click while an ability is armed. Returns whether the click was
   * consumed, so a miss cannot fall through and order a march instead.
   */
  /**
   * Play a unit's attack animation, if it has art for one.
   *
   * Asked of the sprite cache rather than a table, so a creature whose
   * animation has not loaded (or does not exist) simply does not animate.
   */
  /** Can the viewer see this tile right now? */
  private canSee(x: number, y: number): boolean {
    return this.state.players[this.viewerId].visible[idx(x, y, this.state.width)] === 1;
  }

  private animateAttack(unit: Unit): void {
    const frames = this.renderer.sprites.attackFrames(unit.type);
    if (frames) this.renderer.animator.attack(unit.id, frames.length);
  }

  private clickWhileArmed(x: number, y: number): boolean {
    const unit = this.selected;
    const ability = this.armed;
    if (!unit || ability === null) return false;

    const target = abilityTargets(this.state, unit, ability).find((t) => t.x === x && t.y === y);
    if (!target) {
      this.disarm();
      this.flash('Not a target. Ability cancelled.');
      return true;
    }

    const from = { x: unit.x, y: unit.y };
    this.animateAttack(unit);
    const outcome = useAbility(this.state, unit, ability, target);
    this.disarm(false);
    if (!outcome.ok) {
      this.flash(outcome.reason ?? 'That did not work.');
      return true;
    }

    // The interface knows which creature acted, so it can throw the right
    // thing; the log only knows that a fight happened.
    const thrown = PROJECTILES[unitType(unit.type).base];
    if (ability === 'ranged' && thrown) {
      this.effects.spawn(thrown.effect, x, y, { from });
      audio.play(thrown.sound, 0);
    }
    this.playLogCues();
    this.refreshOverlays();
    this.refreshSidebar();
    this.refreshHud();
    this.promptPerkIfOwed();
    return true;
  }

  private onLeftClick(x: number, y: number): void {
    if (this.clickWhileArmed(x, y)) return;
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

    // Left-click on open ground is a move order at any distance. It used to
    // act only within this turn's reach, so clicking anywhere further simply
    // deselected the unit and nothing happened -- which reads as the game
    // ignoring the click. Longer marches are carried over turn by turn.
    const selected = this.selected;
    if (selected) {
      const i = idx(x, y, this.state.width);
      if (this.overlay.attacks?.has(i) || this.overlay.reachable?.has(i)) {
        this.actOn(x, y);
        return;
      }
      if (routeTo(this.state, selected, x, y)) {
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
      case 'r':
        this.arm('ranged');
        break;
      case 'h':
        this.arm('heal');
        break;
      case 'escape':
        // Back out of the ability first: escape should undo the most recent
        // thing, not drop the selection out from under it.
        if (this.armed !== null) this.disarm();
        else this.select(null);
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
      // Left-clicking one of your own cities opens it, so there was no obvious
      // gesture for "go and stand in it". Right-click always did; this says so.
      const garrisonTarget = this.state.cities.find(
        (c) =>
          c.owner === this.viewerId &&
          Math.max(Math.abs(c.x - unit.x), Math.abs(c.y - unit.y)) === 1 &&
          !unitAt(this.state, c.x, c.y),
      );
      panel.innerHTML = `
        <div class="panel-title">
          <a href="#" class="pedia-link" data-pedia="${escapeHtml(t.id)}"
             title="Look it up in the Orcpedia">${escapeHtml(t.name)}</a>${unit.rank > 0 ? ` <span class="muted">· ${RANK_NAMES[unit.rank] ?? 'veteran'}</span>` : ''}
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
          ${
            (unit.perks?.length ?? 0) > 0
              ? `<div class="stat-row"><span class="label">Learned</span><span class="value">${unit
                  .perks!.map((id) =>
                    escapeHtml(
                      PERK_BY_ID[id]
                        ? perkName(PERK_BY_ID[id], this.state.players[unit.owner].faction)
                        : id,
                    ),
                  )
                  .join(', ')}</span></div>`
              : ''
          }
          ${
            unit.disarmed
              ? `<div class="stat-row"><span class="label">Disarmed</span><span class="value k-bad">threw its axe &middot; quarter strength until it gets one back</span></div>`
              : ''
          }
          ${
            !inSupply(this.state, unit)
              ? `<div class="stat-row"><span class="label k-bad">Out of supply</span><span class="value k-bad">too far from any city of yours &middot; fights weakly and cannot heal</span></div>`
              : ''
          }
          ${unit.order !== 'none' ? `<div class="chip">${unit.order}</div>` : ''}
          ${
            unit.goto
              ? `<div class="chip">marching to (${unit.goto.x}, ${unit.goto.y})${
                  this.overlay.gotoPath ? ` &middot; ~${this.overlay.gotoPath.turns} turns` : ''
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
          ${
            !cityHere && garrisonTarget
              ? `<button class="small" data-act="garrison">Enter ${escapeHtml(garrisonTarget.name)}</button>`
              : ''
          }
          ${abilitiesOf(unit)
            .map((a) => {
              const spec = ABILITIES[a];
              const on = this.armed === a ? ' armed' : '';
              return `<button class="small${on}" data-act="ability" data-ability="${a}">${spec.label} (${spec.key.toUpperCase()})</button>`;
            })
            .join('')}
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
            case 'ability':
              this.arm(btn.dataset.ability as AbilityId);
              break;
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
            case 'garrison':
              if (garrisonTarget) this.actOn(garrisonTarget.x, garrisonTarget.y);
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
        <div class="panel-body muted">Left-click a unit to select it. Right-click to send it somewhere &mdash; including into your own cities.</div>`;
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
      // Over the map and under nothing: these are meant to read as happening
      // on the battlefield, not as part of the interface.
      this.effects.update(dt);
      this.effects.draw(ctx, this.camera);
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

/**
 * What each ranged creature throws. Keyed on the base creature, so Two Archers
 * loose the same arrow as one.
 */
const PROJECTILES: Record<string, { effect: EffectId; sound: SfxId } | undefined> = {
  archer: { effect: 'arrow', sound: 'arrow' },
  axethrower: { effect: 'axe', sound: 'axe-throw' },
  ballista: { effect: 'bolt', sound: 'siege' },
  mage: { effect: 'magic', sound: 'magic' },
};

/**
 * How long to leave a unit alone after it attacks, before jumping the
 * selection onward. Slightly longer than the swing itself.
 */
const ATTACK_HOLD_MS = 420;

/** What each rank is called in the readout. Index 0 is never shown. */
const RANK_NAMES = ['', 'veteran', 'hardened', 'notorious'] as const;

/** Most animations played for one drain of the log. */
const EFFECT_BURST = 8;
/** Seconds between them, so a busy turn reads as a sequence, not a flash. */
const EFFECT_STAGGER = 0.11;

/**
 * What an event looks like, if it looks like anything.
 *
 * Keyed off the cue the simulation already emits wherever there is one, so the
 * two presentation layers stay in step and `sim/` gains nothing new to know.
 */
function effectFor(entry: { kind: string; cue?: string; subject?: string }): EffectId | null {
  // A subject names its own picture, which is how a razed city shows the
  // settlement that was actually standing there rather than a generic puff.
  if (entry.subject?.startsWith('razed-')) return entry.subject as EffectId;
  switch (entry.cue) {
    case 'explosion':
      return 'explosion';
    case 'capture':
    case 'city-lost':
      return 'demolish';
    case 'holy':
      return 'heal';
    default:
      return entry.kind === 'combat' ? 'clash' : null;
  }
}

const app = new App();

// Development handle: lets a console (or a headless check) poke at the running
// game and force a repaint without waiting for an animation frame.
if (import.meta.env.DEV) {
  const scope = window as unknown as Record<string, unknown>;
  scope.game = app;
  scope.effects = (app as unknown as { effects: unknown }).effects;
  // The audio manager is a module singleton; exposing the app's own reference
  // avoids a console `import()` handing back a second, unrelated instance.
  scope.audio = audio;
}
