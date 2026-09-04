import { audio } from '../audio/audio';
import { FACTIONS, FACTION_IDS } from '../model/factions';
import { perkName } from '../model/perks';
import type { PerkDef } from '../model/perks';
import type { FactionId, GameState } from '../model/types';
import type { NewGameOptions } from '../sim/gamestate';
import {
  deleteSlot,
  downloadSave,
  listSlots,
  loadFromSlot,
  promptForSaveFile,
  SaveError,
  saveToSlot,
} from '../persist/save';
import { escapeHtml, openModal } from './dom';

/** Setup and save menus. */

export function openNewGameMenu(
  current: FactionId,
  onStart: (options: NewGameOptions) => void,
): void {
  const factionCards = FACTION_IDS.map((id) => {
    const f = FACTIONS[id];
    return `
      <label class="choice-card${id === current ? ' selected' : ''}" data-faction="${id}">
        <input type="radio" name="faction" value="${id}" ${id === current ? 'checked' : ''} />
        <span class="choice-name" style="color:${f.color}">${escapeHtml(f.civName)}</span>
        <span class="choice-sub">${escapeHtml(f.leader)}</span>
        <span class="choice-blurb">${escapeHtml(f.blurb)}</span>
      </label>`;
  }).join('');

  openModal({
    title: 'A New World',
    width: 'min(720px, 94vw)',
    body: `
      <div class="panel-body">
        <div class="field-label">Play as</div>
        <div class="choice-row">${factionCards}</div>

        <div class="field-label" style="margin-top:12px">World size</div>
        <div class="choice-row">
          <label class="choice-card" data-size="small">
            <input type="radio" name="size" value="small" />
            <span class="choice-name">Cramped</span>
            <span class="choice-sub">48 x 36 — you will meet early</span>
          </label>
          <label class="choice-card selected" data-size="normal">
            <input type="radio" name="size" value="normal" checked />
            <span class="choice-name">Normal</span>
            <span class="choice-sub">64 x 48</span>
          </label>
          <label class="choice-card" data-size="large">
            <input type="radio" name="size" value="large" />
            <span class="choice-name">Roomy</span>
            <span class="choice-sub">88 x 60 — time to build</span>
          </label>
        </div>

        <div class="field-row" style="margin-top:12px">
          <label class="field">
            <span class="field-label">Seed <span class="muted">(blank for random)</span></span>
            <input type="text" id="seed-input" placeholder="e.g. 20250813" />
          </label>
          <label class="field">
            <span class="field-label">Turn limit</span>
            <input type="number" id="turns-input" value="300" min="50" max="2000" step="50" />
          </label>
        </div>
        <p class="flavor">
          At the turn limit, whoever has built the most is declared the winner, which
          nobody involved finds satisfying.
        </p>
      </div>
      <div class="button-row" style="justify-content:flex-end">
        <button class="primary" id="btn-start">Begin</button>
      </div>`,
    onMount: (root, close) => {
      // Keep the visual selection in step with the radio buttons.
      root.querySelectorAll<HTMLElement>('.choice-card').forEach((card) => {
        card.addEventListener('click', () => {
          const group = card.dataset.faction ? 'faction' : 'size';
          root
            .querySelectorAll<HTMLElement>(
              `.choice-card[data-${group === 'faction' ? 'faction' : 'size'}]`,
            )
            .forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
        });
      });

      root.querySelector('#btn-start')?.addEventListener('click', () => {
        const faction =
          (root.querySelector<HTMLInputElement>('input[name="faction"]:checked')?.value as
            | FactionId
            | undefined) ?? current;
        const size =
          root.querySelector<HTMLInputElement>('input[name="size"]:checked')?.value ?? 'normal';
        const dims =
          size === 'small'
            ? { width: 48, height: 36 }
            : size === 'large'
              ? { width: 88, height: 60 }
              : { width: 64, height: 48 };

        const rawSeed = root.querySelector<HTMLInputElement>('#seed-input')?.value.trim() ?? '';
        const parsedSeed = rawSeed.length > 0 ? Number(rawSeed) : NaN;
        const maxTurns = Number(
          root.querySelector<HTMLInputElement>('#turns-input')?.value ?? 300,
        );

        close();
        onStart({
          playerFaction: faction,
          ...dims,
          maxTurns: Number.isFinite(maxTurns) ? maxTurns : 300,
          ...(Number.isFinite(parsedSeed) ? { seed: parsedSeed >>> 0 } : {}),
        });
      });
    },
  });
}

export function openAudioMenu(onChange: () => void): void {
  const pct = (v: number) => Math.round(v * 100);

  openModal({
    title: 'Sound',
    width: 'min(460px, 94vw)',
    body: `
      <div class="panel-body">
        <label class="slider-row">
          <span class="field-label" style="margin:0">Music</span>
          <input type="range" id="vol-music" min="0" max="100" value="${pct(audio.musicVolume)}" />
          <span class="slider-value" id="vol-music-out">${pct(audio.musicVolume)}%</span>
        </label>
        <label class="slider-row">
          <span class="field-label" style="margin:0">Effects</span>
          <input type="range" id="vol-sfx" min="0" max="100" value="${pct(audio.sfxVolume)}" />
          <span class="slider-value" id="vol-sfx-out">${pct(audio.sfxVolume)}%</span>
        </label>
        <div class="button-row" style="padding-left:0">
          <button id="btn-toggle-mute">${audio.muted ? 'Unmute everything' : 'Mute everything'}</button>
          <button class="small" id="btn-test-sfx">Test</button>
        </div>
        <p class="flavor">Settings are remembered in this browser. <b>M</b> mutes at any time.</p>
      </div>`,
    onMount: (root) => {
      const music = root.querySelector<HTMLInputElement>('#vol-music')!;
      const sfx = root.querySelector<HTMLInputElement>('#vol-sfx')!;
      const musicOut = root.querySelector<HTMLElement>('#vol-music-out')!;
      const sfxOut = root.querySelector<HTMLElement>('#vol-sfx-out')!;

      // `input` rather than `change`, so the music volume tracks the drag live
      // and you can find the right level by ear instead of by guessing.
      music.addEventListener('input', () => {
        const v = Number(music.value) / 100;
        audio.setMusicVolume(v);
        musicOut.textContent = `${music.value}%`;
      });
      sfx.addEventListener('input', () => {
        const v = Number(sfx.value) / 100;
        audio.setSfxVolume(v);
        sfxOut.textContent = `${sfx.value}%`;
      });
      // Preview on release, so dragging does not machine-gun the sound.
      sfx.addEventListener('change', () => audio.play('sword', 0));

      root.querySelector('#btn-test-sfx')?.addEventListener('click', () => audio.play('sword', 0));
      const muteBtn = root.querySelector<HTMLButtonElement>('#btn-toggle-mute')!;
      muteBtn.addEventListener('click', () => {
        const muted = audio.toggleMute();
        muteBtn.textContent = muted ? 'Unmute everything' : 'Mute everything';
        onChange();
      });
    },
  });
}

const SLOTS = ['1', '2', '3'];

export function openSaveMenu(
  state: GameState,
  onLoad: (loaded: GameState) => void,
  /** `ok` distinguishes 'saved' from 'that would not load'. */
  onNotice: (message: string, ok: boolean) => void,
): void {
  const existing = new Map(listSlots().map((s) => [s.slot, s]));
  const rows = SLOTS.map((slot) => {
    const info = existing.get(slot);
    return `
      <div class="slot-row">
        <span class="slot-name">Slot ${slot}</span>
        <span class="slot-info muted">${
          info
            ? escapeHtml(`${info.civ} — turn ${info.turn}`)
            : 'empty'
        }</span>
        <button class="small" data-save="${slot}">Save</button>
        <button class="small" data-load="${slot}" ${info ? '' : 'disabled'}>Load</button>
        <button class="small" data-del="${slot}" ${info ? '' : 'disabled'}>Erase</button>
      </div>`;
  }).join('');

  openModal({
    title: 'Saved Games',
    width: 'min(620px, 94vw)',
    body: `
      <div class="panel-body">
        ${rows}
        <p class="flavor" style="margin-top:10px">
          Slots live in this browser only. Use the file buttons to keep a copy
          somewhere real, or to move a game to another machine.
        </p>
      </div>
      <div class="button-row" style="justify-content:flex-end">
        <button id="btn-download">Save to File</button>
        <button id="btn-upload">Load from File</button>
      </div>`,
    onMount: (root, close) => {
      root.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) =>
        b.addEventListener('click', () => {
          saveToSlot(state, b.dataset.save!);
          onNotice(`Game saved to slot ${b.dataset.save}.`, true);
          close();
        }),
      );
      root.querySelectorAll<HTMLButtonElement>('[data-load]').forEach((b) =>
        b.addEventListener('click', () => {
          try {
            const loaded = loadFromSlot(b.dataset.load!);
            if (loaded) {
              close();
              onLoad(loaded);
            }
          } catch (err) {
            onNotice(err instanceof SaveError ? err.message : 'That save would not load.', false);
          }
        }),
      );
      root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
        b.addEventListener('click', () => {
          deleteSlot(b.dataset.del!);
          close();
          openSaveMenu(state, onLoad, onNotice);
        }),
      );

      root.querySelector('#btn-download')?.addEventListener('click', () => {
        downloadSave(state);
        onNotice('Save file downloaded.', true);
        close();
      });
      root.querySelector('#btn-upload')?.addEventListener('click', () => {
        promptForSaveFile()
          .then((loaded) => {
            close();
            onLoad(loaded);
          })
          .catch((err: unknown) => {
            onNotice(err instanceof SaveError ? err.message : 'That file would not load.', false);
          });
      });
    },
  });
}

/**
 * The screen the game opens on.
 *
 * Loading straight into a playable map meant the first thing anybody saw was
 * somebody else's game already in progress, with the Advances panel over it
 * asking what to research -- a question about a civilisation the player had
 * not chosen and could not see. This asks the two questions that actually come
 * first instead.
 *
 * Sticky: there is nothing behind it worth dismissing to.
 */
export function openTitleMenu(onNew: () => void, onLoad: () => void): void {
  const saves = listSlots();
  openModal({
    title: 'Orcs & Order',
    width: 'min(560px, 94vw)',
    sticky: true,
    body: `
      <div class="panel-body">
        <p class="flavor">
          Two civilisations, neither of them ready. One has to be told what an
          orc is for; the other files a form about it.
        </p>
        <div class="button-row">
          <button class="small" data-act="new">New Game</button>
          <button class="small" data-act="load"${saves.length === 0 ? ' disabled' : ''}>
            Load Game${saves.length > 0 ? ` (${saves.length})` : ''}
          </button>
        </div>
        ${
          saves.length === 0
            ? '<p class="flavor">No saved games yet.</p>'
            : ''
        }
      </div>`,
    onMount: (root, close) => {
      root.querySelector<HTMLButtonElement>('[data-act="new"]')?.addEventListener('click', () => {
        close();
        onNew();
      });
      root.querySelector<HTMLButtonElement>('[data-act="load"]')?.addEventListener('click', () => {
        close();
        onLoad();
      });
    },
  });
}

/**
 * Ask what a newly promoted unit has learned.
 *
 * Sticky, because a promotion the player did not answer would sit owed
 * forever and the unit would quietly never get its perk. There is no wrong
 * choice here, so there is nothing to escape from.
 */
export function openPerkMenu(
  unitName: string,
  faction: FactionId,
  options: PerkDef[],
  onPick: (perkId: string) => void,
): void {
  const cards = options
    .map(
      (p) => `
      <button class="choice-card" data-perk="${escapeHtml(p.id)}">
        <span class="choice-name">${escapeHtml(perkName(p, faction))}</span>
        <span class="choice-blurb">${escapeHtml(p.blurb)}</span>
      </button>`,
    )
    .join('');

  openModal({
    title: `${unitName} has learned something`,
    width: 'min(720px, 94vw)',
    sticky: true,
    body: `<div class="panel-body"><div class="choice-row">${cards}</div></div>`,
    onMount: (root, close) => {
      root.querySelectorAll<HTMLButtonElement>('[data-perk]').forEach((btn) => {
        btn.addEventListener('click', () => {
          // Recorded before the menu goes, so that anything watching for the
          // close sees a unit that has already chosen.
          onPick(btn.dataset.perk ?? '');
          close();
        });
      });
    },
  });
}
