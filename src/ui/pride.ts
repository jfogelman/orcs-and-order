import type { GameState } from '../model/types';
import { PALACE_TIERS, palaceArt, palaceOf, prideOffer, takePride } from '../model/palace';
import type { PalaceModuleId } from '../model/palace';
import { log } from '../sim/gamestate';
import { escapeHtml, openModal } from './dom';

/**
 * Section 67: the council asks what to add to the capital.
 *
 * Civ2's throne room, and the shape of it matters more than the art. This is
 * **offered**, never bought: no shields, no queue, no turn spent. An empire that
 * is doing especially well is asked which piece it would like, and the answer is
 * the whole mechanic. A wing that cost a hundred and forty shields would be
 * competing with an army, which makes it a cost with a picture attached rather
 * than a reward for having done well.
 *
 * One piece per asking and no way to decline: declining would mean asking again
 * next turn, which is nagging, or never, which quietly loses the reward. The
 * choice is which, not whether.
 */
export function openPrideOffer(
  state: GameState,
  playerId: number,
  onTaken: () => void,
): void {
  const player = state.players[playerId];
  const faction = player.faction;
  const offers = prideOffer(player);
  if (offers.length === 0) return;
  const have = palaceOf(player);
  const first = Object.keys(have).length === 0;

  const cards = offers
    .map(({ module, tier }) => {
      const name = module.tiers[faction][tier - 1];
      const standing = have[module.id] ?? 0;
      return `
        <button class="pride-card" data-module="${escapeHtml(module.id)}">
          <img class="pride-art" src="${escapeHtml(artPath(palaceArt(faction, module.id, tier)))}" alt="" />
          <span class="pride-name">${escapeHtml(name)}</span>
          <span class="muted">${escapeHtml(module.name)} &middot; ${
            standing === 0 ? 'new' : `replaces ${module.tiers[faction][standing - 1]}`
          } &middot; tier ${tier} of ${PALACE_TIERS}</span>
          <span class="pride-blurb">${escapeHtml(module.blurb)}</span>
        </button>`;
    })
    .join('');

  openModal({
    title: faction === 'orc' ? 'The camp is doing well' : 'The realm is doing well',
    width: 'min(720px, 94vw)',
    sticky: true,
    body: `
      <div class="panel-body">
        <p class="flavor">
          ${
            faction === 'orc'
              ? first
                ? 'Everybody is fed, nobody is shouting, and somebody has noticed there is spare timber. The question has been put to you, apparently formally.'
                : 'Things are still going well, which everybody finds slightly unnerving. There is more spare timber.'
              : first
                ? 'The books balance, the granaries are full, and the guilds have begun making suggestions about the capital. They would like a decision.'
                : 'The realm prospers, and the guilds have prepared a further set of suggestions. They are very pleased with them.'
          }
        </p>
        <div class="pride-cards">${cards}</div>
        <p class="flavor muted">
          It does nothing whatsoever. That is not an oversight: a capital that paid for itself would
          be a reward for winning, handed to whoever was already winning.
        </p>
      </div>`,
    onMount: (root, close) => {
      root.querySelectorAll<HTMLButtonElement>('[data-module]').forEach((b) =>
        b.addEventListener('click', () => {
          const id = b.dataset.module as PalaceModuleId;
          const tier = (palaceOf(player)[id] ?? 0) + 1;
          if (!takePride(player, id)) return;
          player.prideTaken = (player.prideTaken ?? 0) + 1;
          const module = offers.find((o) => o.module.id === id)!.module;
          log(
            state,
            `The capital gains ${module.tiers[faction][tier - 1]}.`,
            'good',
            playerId,
            'built',
          );
          close();
          onTaken();
        }),
      );
    },
  });
}

/** Where a palace piece's art lives. */
function artPath(name: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}palace/${name}.png`;
}
