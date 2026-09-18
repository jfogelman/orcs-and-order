/**
 * The full text of anything the layout has cut short, on hover.
 *
 * Asked for because a narrow window shrinks the interface into fragments -- the
 * top bar's last buttons run off the edge and read "Advis", the research readout
 * ellipses itself to "Re...", a long build option clips -- and there was no way to
 * find out what the rest said. Two ways text goes missing, and both are caught:
 *
 * - the element overflows its own box (an ellipsis, or a `nowrap` label wider than
 *   the button holding it);
 * - something around it clips it: a panel with `overflow: hidden`, or the window
 *   edge itself, which is what cuts the top bar.
 *
 * Only then. A tooltip on every button would be noise; this appears exactly when a
 * player cannot read what is there. An element with its own native `title` has it
 * folded in and held back while the pop-up shows, so there are never two.
 */

/** What counts as a thing with a label worth reading. */
const CANDIDATES = 'button, a, .stat, .chip, .panel-title, .build-option, [data-tip]';

/** Whether any of this element's text is out of sight. */
function isCutShort(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1) return true;
  const r = el.getBoundingClientRect();
  if (r.right > window.innerWidth + 1 || r.left < -1) return true;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (style.overflowX === 'visible' && style.overflow === 'visible') continue;
    const pr = p.getBoundingClientRect();
    if (r.right > pr.right + 1 || r.left < pr.left - 1) return true;
  }
  return false;
}

/** Put the pop-up under the element, or over it near the bottom, inside the window. */
function place(tip: HTMLElement, el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4));
  const below = r.bottom + 6;
  const top = below + h > window.innerHeight - 4 ? Math.max(4, r.top - h - 6) : below;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

export function installOverflowTips(): void {
  const tip = document.createElement('div');
  tip.className = 'overflow-tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  let current: HTMLElement | null = null;
  let heldTitle: string | null = null;

  const hide = () => {
    tip.hidden = true;
    if (current && heldTitle !== null) current.title = heldTitle;
    current = null;
    heldTitle = null;
  };

  document.addEventListener('mouseover', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(CANDIDATES) ?? null;
    if (el === current) return;
    hide();
    if (!el || !isCutShort(el)) return;
    const full = (el.dataset.tip ?? el.innerText).replace(/\s+/g, ' ').trim();
    if (!full) return;
    current = el;
    if (el.title) {
      heldTitle = el.title;
      el.removeAttribute('title');
    }
    tip.textContent = heldTitle && heldTitle !== full ? `${full} — ${heldTitle}` : full;
    tip.hidden = false;
    place(tip, el);
  });
  document.addEventListener('mouseout', (e) => {
    if (current && !current.contains(e.relatedTarget as Node | null)) hide();
  });
  // Anything that moves the element out from under the pop-up takes it away.
  document.addEventListener('mousedown', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}
