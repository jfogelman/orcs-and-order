import type { GameState, Player } from '../model/types';
import { SAVE_VERSION } from '../sim/gamestate';

/**
 * Saving and loading.
 *
 * `GameState` is already plain JSON, so the only real work here is squeezing
 * the two big per-tile bitmaps. Fog data is long runs of zeroes and ones, so
 * run-length encoding takes a 3000-element array down to a short string and
 * keeps saves small enough to paste around.
 */

export const SAVE_EXTENSION = 'w2c';
const SLOT_PREFIX = 'orcs-and-order:save:';

/** "0,120;1,44;0,9" — value,runLength pairs. */
export function packBits(bits: number[]): string {
  if (bits.length === 0) return '';
  const parts: string[] = [];
  let value = bits[0];
  let run = 1;
  for (let i = 1; i < bits.length; i++) {
    if (bits[i] === value) {
      run++;
    } else {
      parts.push(`${value},${run}`);
      value = bits[i];
      run = 1;
    }
  }
  parts.push(`${value},${run}`);
  return parts.join(';');
}

export function unpackBits(packed: string, expectedLength: number): number[] {
  const out: number[] = [];
  if (packed.length > 0) {
    for (const part of packed.split(';')) {
      const [rawValue, rawRun] = part.split(',');
      const value = Number(rawValue);
      const run = Number(rawRun);
      for (let i = 0; i < run; i++) out.push(value);
    }
  }
  // Tolerate a truncated or oversized payload rather than corrupting the map.
  if (out.length > expectedLength) out.length = expectedLength;
  while (out.length < expectedLength) out.push(0);
  return out;
}

interface PackedPlayer extends Omit<Player, 'explored' | 'visible'> {
  explored: string;
  visible: string;
}

interface SaveFile extends Omit<GameState, 'players'> {
  players: PackedPlayer[];
  savedAt: string;
}

export function serialize(state: GameState): string {
  const file: SaveFile = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      explored: packBits(p.explored),
      visible: packBits(p.visible),
    })),
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(file);
}

export class SaveError extends Error {}

export function deserialize(text: string): GameState {
  let file: SaveFile;
  try {
    file = JSON.parse(text) as SaveFile;
  } catch {
    throw new SaveError('That file is not a saved game.');
  }
  if (!file || typeof file !== 'object' || !Array.isArray(file.players)) {
    throw new SaveError('That save is missing the bits that make it a game.');
  }
  if (file.version !== SAVE_VERSION) {
    throw new SaveError(
      `That save is from version ${file.version}; this build reads version ${SAVE_VERSION}.`,
    );
  }

  const tiles = file.width * file.height;
  // Drop the save-only metadata and re-expand the packed fog bitmaps.
  const { savedAt: _savedAt, players, ...rest } = file;
  return {
    ...rest,
    players: players.map((p) => ({
      ...p,
      explored: unpackBits(p.explored, tiles),
      visible: unpackBits(p.visible, tiles),
    })),
  };
}

// ------------------------------------------------------------ local slots

export interface SlotInfo {
  slot: string;
  turn: number;
  civ: string;
  savedAt: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveToSlot(state: GameState, slot: string): void {
  storage()?.setItem(SLOT_PREFIX + slot, serialize(state));
}

export function loadFromSlot(slot: string): GameState | null {
  const text = storage()?.getItem(SLOT_PREFIX + slot);
  return text ? deserialize(text) : null;
}

export function deleteSlot(slot: string): void {
  storage()?.removeItem(SLOT_PREFIX + slot);
}

export function listSlots(): SlotInfo[] {
  const store = storage();
  if (!store) return [];
  const out: SlotInfo[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !key.startsWith(SLOT_PREFIX)) continue;
    try {
      const file = JSON.parse(store.getItem(key) ?? '{}') as SaveFile;
      out.push({
        slot: key.slice(SLOT_PREFIX.length),
        turn: file.turn ?? 0,
        civ: file.players?.[0]?.name ?? 'Unknown',
        savedAt: file.savedAt ?? '',
      });
    } catch {
      // A corrupt slot should not take the whole list down with it.
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

// -------------------------------------------------------------- file i/o

export function downloadSave(state: GameState, filename?: string): void {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `orcs-and-order-t${state.turn}.${SAVE_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a moment to start before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function promptForSaveFile(): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.${SAVE_EXTENSION},application/json`;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new SaveError('No file chosen.'));
        return;
      }
      file
        .text()
        .then((text) => resolve(deserialize(text)))
        .catch(reject);
    });
    input.click();
  });
}
