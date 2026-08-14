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
}

let closeCurrent: (() => void) | null = null;

export function isModalOpen(): boolean {
  return closeCurrent !== null;
}

export function closeModal(): void {
  closeCurrent?.();
}

export function openModal(options: ModalOptions): void {
  closeModal();
  const root = el('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="width:${options.width ?? 'auto'}">
      <div class="modal-head">
        <h2>${escapeHtml(options.title)}</h2>
        <div style="flex:1"></div>
        <button class="modal-close">Close</button>
      </div>
      <div class="modal-content">${options.body}</div>
    </div>`;
  root.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    if (closeCurrent === close) closeCurrent = null;
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  closeCurrent = close;

  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  window.addEventListener('keydown', onKey);
  options.onMount?.(backdrop, close);
}

/** Progress bar markup used in several panels. */
export function bar(current: number, total: number): string {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return `<div class="bar"><span style="width:${pct}%"></span></div>`;
}
