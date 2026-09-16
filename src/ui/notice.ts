import { escapeHtml, openModal } from './dom';

/**
 * News that has to be seen rather than found.
 *
 * The log is where everything goes, which is exactly why it is no use for the
 * two or three things a turn that change what you should be building. Section
 * 111's shared follies are the case that prompted it: only one of each exists in
 * the whole game, and a player who misses the line saying somebody else has
 * started spends thirty turns on a building that cannot be finished -- which is
 * what happened in a real game, and read as the build vanishing.
 *
 * Deliberately plain: a title and the lines themselves. The modal's own close
 * button is the only way out, because anything that needs a decision belongs in
 * a dialog that offers one.
 */
export function openNotice(title: string, lines: string[]): void {
  openModal({
    title,
    width: 'min(520px, 92vw)',
    body: `
      <div class="panel-body">
        ${lines.map((line) => `<p class="flavor">${escapeHtml(line)}</p>`).join('')}
      </div>`,
  });
}
