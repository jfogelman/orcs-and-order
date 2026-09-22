import { portraitPath } from './advisors';

/**
 * Section 46: advisors that move while they talk.
 *
 * Every advisor has a still and a four-frame talking cycle, `<id>_talking.png`,
 * a row of portrait-sized frames matched to the still so the face does not jump
 * when it starts to speak. This plays the cycle on the portrait that is already
 * on screen -- the same `<img>`, so nothing in the layout moves -- for about as
 * long as the line takes to read, and then puts the still back.
 *
 * **Only while somebody is speaking.** Six faces looping in a panel somebody is
 * trying to read is a lot of movement for nothing; a face that moves when its
 * owner has something to say is the whole point.
 */

/** Frames of a cycle, as image URLs, once cut. Absent until asked for. */
const cut = new Map<string, Promise<string[] | null>>();

/** Order the four frames play in: open, and close again, rather than snapping shut. */
const ORDER = [0, 1, 2, 3, 2, 1];

/** Milliseconds a frame. About eight a second, which reads as speech rather than chattering. */
const FRAME_MS = 120;

/** Cut an advisor's cycle into frames, once, or null if it has not been drawn. */
function framesOf(id: string): Promise<string[] | null> {
  let ready = cut.get(id);
  if (ready) return ready;
  ready = new Promise((resolve) => {
    const sheet = new Image();
    sheet.onload = () => {
      const size = sheet.naturalHeight;
      const count = Math.max(1, Math.round(sheet.naturalWidth / size));
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(sheet, i * size, 0, size, size, 0, 0, size, size);
        out.push(canvas.toDataURL('image/png'));
      }
      resolve(out);
    };
    sheet.onerror = () => resolve(null);
    sheet.src = portraitPath(`${id}_talking`);
  });
  cut.set(id, ready);
  return ready;
}

/** How long a line takes to say: long enough to read along, never an age. */
export function speakingTime(line: string): number {
  return Math.max(900, Math.min(3600, 500 + line.length * 22));
}

/** The portraits currently mid-sentence, so a second request cuts the first short. */
const running = new WeakMap<HTMLImageElement, () => void>();

/**
 * Make this portrait talk for `ms`, then show the still again. Resolves when it
 * has finished -- at once, if the advisor has no cycle drawn -- so a room can
 * take turns.
 */
export async function talk(img: HTMLImageElement | null, id: string, ms: number): Promise<void> {
  if (!img || !img.isConnected) return;
  const frames = await framesOf(id);
  if (!frames || frames.length === 0 || !img.isConnected) return;
  running.get(img)?.();
  const still = portraitPath(id);
  img.classList.add('speaking');
  return new Promise((resolve) => {
    let step = 0;
    const timer = window.setInterval(() => {
      if (!img.isConnected) return stop();
      img.src = frames[ORDER[step % ORDER.length] % frames.length];
      step++;
    }, FRAME_MS);
    const until = window.setTimeout(() => stop(), ms);
    function stop(): void {
      window.clearInterval(timer);
      window.clearTimeout(until);
      running.delete(img!);
      if (img!.isConnected) {
        img!.src = still;
        img!.classList.remove('speaking');
      }
      resolve();
    }
    running.set(img, stop);
  });
}

/** Take turns: each speaker finishes before the next begins. */
export async function takeTurns(
  turns: Array<{ img: HTMLImageElement | null; id: string; line: string }>,
): Promise<void> {
  for (const t of turns) await talk(t.img, t.id, speakingTime(t.line));
}
