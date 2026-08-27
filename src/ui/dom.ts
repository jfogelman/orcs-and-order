/** Small DOM helpers shared by the panels. Deliberately not a framework. */

export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export interface ModalOptions {
  title: string;
  /** Rendered as trusted HTML — callers are responsible for escaping. */
  body: string;
  width?: string;
  /** Wired up after the modal is in the document. */
  onMount?: (root: HTMLElement, close: () => void) => void;
  /**
   * No close button, no escape, no clicking the backdrop away.
   *
   * For the title screen, which has nothing behind it worth dismissing to --
   * closing it would leave the player looking at a map they never asked for.
   */
  sticky?: boolean;
}

let closeCurrent: (() => void) | null = null;
let pendingAfterClose: Array<() => void> = [];
/** True while `openModal` is dismissing whatever it is about to replace. */
let replacing = false;

export function isModalOpen(): boolean {
  return closeCurrent !== null;
}

/**
 * Run something once the modal on screen has gone.
 *
 * The end of a turn asks up to three questions -- a promotion, what to
 * research, what to build -- and every one of them declines to open while
 * another is up. Asked in a row that meant only the first was ever asked: a
 * player with a promotion waiting was never asked what to build, and the city
 * quietly banked its shields as Coin instead. This is how each answer hands on
 * to the next question.
 *
 * Not fired when a modal is merely being replaced by another, which would
 * reopen the chain underneath the modal that replaced it.
 */
export function afterModalCloses(fn: () => void): void {
  if (!isModalOpen()) {
    fn();
    return;
  }
  pendingAfterClose.push(fn);
}

export function closeModal(): void {
  closeCurrent?.();
}

export function openModal(options: ModalOptions): void {
  replacing = true;
  closeModal();
  replacing = false;
  const root = el('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="width:${options.width ?? 'auto'}">
      <div class="modal-head">
        <h2>${escapeHtml(options.title)}</h2>
        <div style="flex:1"></div>
        ${options.sticky ? '' : '<button class="modal-close">Close</button>'}
      </div>
      <div class="modal-content">${options.body}</div>
    </div>`;
  root.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    if (closeCurrent === close) closeCurrent = null;
    window.removeEventListener('keydown', onKey);
    if (replacing) return;
    const waiting = pendingAfterClose;
    pendingAfterClose = [];
    for (const fn of waiting) fn();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  closeCurrent = close;

  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  if (!options.sticky) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    window.addEventListener('keydown', onKey);
  }
  options.onMount?.(backdrop, close);
}

/** Progress bar markup used in several panels. */
export function bar(current: number, total: number): string {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return `<div class="bar"><span style="width:${pct}%"></span></div>`;
}

/**
 * Ask before doing something that cannot be undone.
 *
 * The game has exactly one button that destroys something of the player's on
 * purpose, and a misclick that quietly deletes a dragon is not a thing anybody
 * should have to find out about from the log. Escape and the backdrop both
 * cancel, so the safe answer is the easy one.
 */
export function confirmAction(options: {
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
}): void {
  openModal({
    title: options.title,
    width: 'min(420px, 92vw)',
    body: `
      <div class="panel-body">
        <p class="confirm-body">${escapeHtml(options.body)}</p>
        <div class="confirm-row">
          <button class="small" data-choice="no">Cancel</button>
          <button class="small danger" data-choice="yes">${escapeHtml(options.confirm)}</button>
        </div>
      </div>`,
    onMount: (root, close) => {
      root.querySelector('[data-choice="no"]')?.addEventListener('click', () => close());
      root.querySelector('[data-choice="yes"]')?.addEventListener('click', () => {
        close();
        options.onConfirm();
      });
    },
  });
}
