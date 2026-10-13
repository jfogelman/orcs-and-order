import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import type { CityReading } from '../sim/spying';
import { escapeHtml, openModal } from './dom';

/**
 * Section 136: what the spy came back with.
 *
 * A plain report rather than a scene. The joke in this feature lives in the
 * units and in what the other side is told, not in a banner -- and a dialog
 * that arrives every time a spy does its job is a dialog that wants reading
 * quickly.
 *
 * Everything here is read off the city as it stands at the moment of the
 * reading. It is a snapshot and is not kept: a spy tells you what is there
 * today, and tomorrow is another turn's work. That is deliberate and is the
 * difference between a spy and a permanent window.
 */
export function openReading(reading: CityReading, name: string): void {
  const line = (label: string, value: string) =>
    `<div class="stat-row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(
      value,
    )}</span></div>`;
  const ending = reading.ending;
  openModal({
    title: `A Report on ${name}`,
    width: 'min(560px, 96vw)',
    body: `
      <div class="panel-body">
        ${line('Size', String(reading.size))}
        ${line('Building', reading.building ?? 'nothing in particular')}
        ${line(
          'Garrison',
          reading.garrison === 0
            ? 'nobody at all'
            : `${reading.garrison}, the stoutest a ${reading.strongest ?? 'something'}`,
        )}
        ${line(
          'Standing structures',
          reading.standing.length === 0 ? 'none worth the ink' : reading.standing.join(', '),
        )}
        ${
          ending
            ? line(
                'Their ending',
                ending.begun
                  ? `under way, ${ending.parts} ${ending.parts === 1 ? 'piece' : 'pieces'} of it standing here`
                  : 'not begun, as far as anybody here knows',
              )
            : ''
        }
      </div>
      <div class="panel-body">
        <p class="flavor">Good for today. Towns are not in the habit of staying the same,
        and nobody there has any idea you asked.</p>
      </div>`,
  });
}

/**
 * Said when a spy is caught.
 *
 * **This is the only moment the other side learns whose it was**, and the
 * dialog says so plainly, because the cost of being caught is the whole price
 * of the feature and a player who does not notice paying it will not weigh it.
 */
export function openCaught(state: GameState, unit: Unit, city: City): void {
  const them = state.players[city.owner]?.name ?? 'They';
  openModal({
    title: 'Our Agent Was Noticed',
    width: 'min(560px, 96vw)',
    body: `
      <div class="panel-body">
        <p style="font-size:15px">The ${escapeHtml(
          unitType(unit.type).name,
        )} outside ${escapeHtml(city.name)} was noticed, and came back with nothing.</p>
        <p class="flavor">Everything a spy does is anonymous until it is caught. This one
        was caught, so ${escapeHtml(them)} now know whose it was, and will remember it.
        Whatever it was wearing, it is not wearing it convincingly any more.</p>
      </div>`,
  });
}
