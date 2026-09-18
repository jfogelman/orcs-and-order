/**
 * A "More" menu for whatever the top bar cannot fit.
 *
 * The top bar is a row of labels that will not wrap, and a narrow window pushed
 * its last buttons clean off the right-hand edge -- Advisors, the Orcpedia, Saves,
 * New Game, even End Turn -- with nothing left to hover and no way to click them.
 * Now, when the row overflows, the research readout gives up space first (it
 * ellipses, and the overflow tooltip still shows it in full), then buttons fold
 * into a More menu, least-used first, until the rest fits.
 *
 * **End Turn never folds.** It is the one button every turn needs.
 *
 * The menu's items click the real buttons, so every behaviour and keyboard
 * shortcut is untouched, and a button that comes back when the window widens is
 * the same element it always was.
 */

/** Folded first to last: the least-used button goes first. End Turn is not here. */
const FOLD_ORDER = ['btn-new', 'btn-save', 'btn-pedia', 'btn-advisors', 'btn-report', 'btn-tech', 'btn-mute'];

export function installTopbarMore(): void {
  const bar = document.getElementById('topbar');
  const endTurn = document.getElementById('btn-endturn');
  if (!bar || !endTurn) return;

  const more = document.createElement('button');
  more.id = 'btn-more';
  more.className = 'topbar-more';
  more.title = 'Everything the bar has no room for';
  more.textContent = 'More ▾';
  more.style.display = 'none';
  bar.insertBefore(more, endTurn);

  const menu = document.createElement('div');
  menu.className = 'topbar-menu';
  menu.hidden = true;
  document.body.appendChild(menu);

  const buttons = FOLD_ORDER.map((id) => document.getElementById(id)).filter(
    (b): b is HTMLButtonElement => b instanceof HTMLButtonElement,
  );
  let folded: HTMLButtonElement[] = [];

  const closeMenu = () => {
    menu.hidden = true;
    more.classList.remove('armed');
  };

  const fits = () => bar.scrollWidth <= bar.clientWidth + 1;

  const fit = () => {
    for (const b of buttons) b.style.display = '';
    more.style.display = 'none';
    folded = [];
    if (fits()) {
      closeMenu();
      return;
    }
    more.style.display = '';
    for (const b of buttons) {
      if (fits()) break;
      b.style.display = 'none';
      folded.push(b);
    }
    if (!menu.hidden) renderMenu();
  };

  const renderMenu = () => {
    menu.replaceChildren(
      ...folded.map((b) => {
        const item = document.createElement('button');
        item.className = b.classList.contains('primary') ? 'primary' : '';
        item.textContent = b.textContent;
        // The shortcut, pulled from the button's own description, where it has one.
        const key = b.title.match(/\(([^)]+)\)\s*$/)?.[1];
        if (key) {
          const hint = document.createElement('span');
          hint.className = 'hint';
          hint.textContent = key;
          item.appendChild(hint);
        }
        if (b.title) item.title = b.title;
        item.addEventListener('click', () => {
          closeMenu();
          b.click();
        });
        return item;
      }),
    );
    const r = more.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.right = `${Math.max(4, window.innerWidth - r.right)}px`;
  };

  more.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) {
      closeMenu();
      return;
    }
    renderMenu();
    menu.hidden = false;
    more.classList.add('armed');
  });
  document.addEventListener('mousedown', (e) => {
    if (menu.hidden) return;
    const t = e.target as Node;
    if (!menu.contains(t) && !more.contains(t)) closeMenu();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });

  // Re-fit when the window changes, and when a label does: the research readout
  // and the sound button change their text as the game goes on.
  let queued = false;
  const refit = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fit();
    });
  };
  window.addEventListener('resize', refit);
  // The bar's own width, however it changes: a window resize is not the only way,
  // and a folded bar left folded after the room came back is the bug this caught.
  new ResizeObserver(refit).observe(bar);
  new MutationObserver(refit).observe(bar, { childList: true, characterData: true, subtree: true });
  fit();
}
