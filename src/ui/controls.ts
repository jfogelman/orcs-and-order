import { ABILITIES } from '../sim/abilities';
import { escapeHtml } from './dom';

/**
 * Every way of telling the game what to do, in one table.
 *
 * Printed in two places -- the list on `?` and the Orcpedia's own tab -- from
 * the same source the key handler reads, because the whole reason section 73
 * exists is that three advertised shortcuts had been dead for a while and
 * nobody could tell. A second hand-written copy for the Orcpedia would rot the
 * same way, only slower.
 */
export interface Control {
  group: string;
  keys: string;
  does: string;
}

export const SHORTCUTS: Control[] = [
  { group: 'Units', keys: 'Space', does: 'Skip this one for now' },
  { group: 'Units', keys: 'N', does: 'Next one with something left to do' },
  { group: 'Units', keys: 'F', does: 'Fortify, or wake something fortified' },
  { group: 'Units', keys: 'S', does: 'Sentry: sleep until something happens' },
  { group: 'Units', keys: 'B', does: 'Found a city' },
  { group: 'Units', keys: 'X', does: 'Halt a march' },
  { group: 'Units', keys: 'U', does: 'Resupply' },
  { group: 'Units', keys: 'C', does: 'Centre the view on it' },
  { group: 'Units', keys: 'Esc', does: 'Put down an ability, then deselect' },
  { group: 'Cities', keys: ', / .', does: 'Previous or next city of yours' },
  { group: 'Cities', keys: 'O', does: 'Open the city under the selected unit' },
  { group: 'The map', keys: 'Arrows', does: 'Pan' },
  { group: 'The map', keys: '+ / -', does: 'Zoom in or out' },
  { group: 'The map', keys: '0', does: 'Back to the middle zoom' },
  { group: 'The map', keys: 'G', does: 'Show or hide the grid' },
  { group: 'Screens', keys: 'T', does: 'Advances' },
  { group: 'Screens', keys: 'A', does: 'Advisors' },
  { group: 'Screens', keys: 'I', does: 'The empire report' },
  { group: 'Screens', keys: 'P', does: 'Orcpedia' },
  { group: 'Screens', keys: 'Ctrl+S', does: 'Saves' },
  { group: 'Screens', keys: '?', does: 'This list' },
  { group: 'Everything else', keys: 'Enter', does: 'End the turn' },
  { group: 'Everything else', keys: 'M', does: 'Sound on or off' },
];

/**
 * What the mouse does, which until now was written down nowhere at all.
 *
 * The one worth knowing is that **right-click is the order button**: it acts
 * with the unit already in hand and skips every question about what is on the
 * tile, so it is the way to walk a unit onto your own city, where a left click
 * opens the city instead. See section 80.
 */
export const MOUSE: Control[] = [
  { group: 'The mouse', keys: 'Left click', does: 'Your unit: pick it up. Your city: open it' },
  { group: 'The mouse', keys: 'Left click', does: 'Holding a unit: move, attack, or set off on a march' },
  { group: 'The mouse', keys: 'Left click', does: 'Somewhere it cannot get to: put the unit down' },
  { group: 'The mouse', keys: 'Right click', does: 'Order the unit in hand, even onto your own city' },
  { group: 'The mouse', keys: 'Drag', does: 'Pan the map' },
  { group: 'The mouse', keys: 'Wheel', does: 'Zoom, toward the pointer' },
  { group: 'The mouse', keys: 'Minimap', does: 'Jump the view there' },
  { group: 'The mouse', keys: 'A name, anywhere', does: 'Look it up in the Orcpedia' },
];

/**
 * The whole list, abilities included.
 *
 * Abilities are generated from `ABILITIES` for the same reason: the handler and
 * the unit buttons read that table, so a key listed here cannot drift from the
 * key that works.
 */
export function allControls(): Control[] {
  return [
    ...MOUSE,
    ...SHORTCUTS,
    ...Object.values(ABILITIES).map((a) => ({
      group: 'Abilities, when the unit has one',
      keys: a.key.toUpperCase(),
      does: `${a.label}: ${a.verb}`,
    })),
  ];
}

/** The list as rows, grouped in the order the table declares them. */
export function controlsMarkup(): string {
  const listed = allControls();
  return [...new Set(listed.map((k) => k.group))]
    .map((group) => {
      const rows = listed
        .filter((k) => k.group === group)
        .map(
          (k) =>
            `<div class="stat-row"><span class="label"><kbd>${escapeHtml(k.keys)}</kbd></span>` +
            `<span class="value">${escapeHtml(k.does)}</span></div>`,
        )
        .join('');
      return `<div class="panel-title">${escapeHtml(group)}</div>${rows}`;
    })
    .join('');
}
