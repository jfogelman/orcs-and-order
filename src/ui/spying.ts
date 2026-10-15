import type { City, GameState, Unit } from '../model/types';
import { unitType } from '../model/units';
import type { CityReading } from '../sim/spying';
import type { SabotageOutcome, SabotagePhase } from '../sim/sabotage';
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
/**
 * Whether anybody noticed, said as its own bordered box.
 *
 * **The most important line in any of these dialogs**, and it was a clause at
 * the end of a flavour paragraph. Whether the spy got away with it decides
 * whether the unit still exists as an asset and whether a rival is now holding
 * a grudge -- it is not a footnote on the size of a town. Same box, same place,
 * same dashed border in all three dialogs, so a player learns where to look
 * once and then always looks there.
 */
function noticedBox(safe: boolean, said: string): string {
  return `<div class="spy-notice ${safe ? 'safe' : 'blown'}">
      <strong>${safe ? 'Nobody noticed.' : 'We were noticed.'}</strong> ${said}
    </div>`;
}

export function openReading(reading: CityReading, name: string): void {
  const line = (label: string, value: string) =>
    `<div class="stat-row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(
      value,
    )}</span></div>`;
  const work = reading.greatWork;
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
          work
            ? line(
                `Work on ${work.name}`,
                work.parts > 0
                  ? `${work.parts} ${work.parts === 1 ? 'piece' : 'pieces'} of it standing here`
                  : work.begun
                    ? 'begun, though not in this town'
                    : 'nothing of it started anywhere, that we can tell',
              )
            : ''
        }
      </div>
      <div class="panel-body">
        ${noticedBox(true, 'Nobody there has any idea you asked.')}
        <p class="flavor">Good for today only. Towns are not in the habit of staying
        the same.</p>
      </div>`,
  });
}

/**
 * Said when a spy comes back with nothing and nobody minded.
 *
 * **Every spy action gets a dialog, including this one.** The first version put
 * the quiet failure in the log instead, which put it one line under the
 * *caught* entry from an earlier attempt with no turn marker between them -- so
 * "they know whose it was" and "nobody seems to have minded" read as one
 * sentence contradicting itself. Three outcomes, three dialogs, and the player
 * is never left to work out which of two log lines was about this turn.
 */
export function openQuiet(unit: Unit, city: City): void {
  openModal({
    title: 'Nothing To Report',
    width: 'min(560px, 96vw)',
    body: `
      <div class="panel-body">
        <p style="font-size:15px">The ${escapeHtml(
          unitType(unit.type).name,
        )} spent the day outside ${escapeHtml(city.name)} and learned nothing useful.</p>
        ${noticedBox(true, 'It is still where it was, and still nobody’s business but ours.')}
        <p class="flavor">A wasted day and nothing worse. Try again tomorrow.</p>
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
export function openCaught(state: GameState, unit: Unit, city: City, wore: boolean): void {
  const them = state.players[city.owner]?.name ?? 'They';
  openModal({
    title: 'Our Agent Was Noticed',
    width: 'min(560px, 96vw)',
    body: `
      <div class="panel-body">
        <p style="font-size:15px">The ${escapeHtml(
          unitType(unit.type).name,
        )} outside ${escapeHtml(city.name)} was noticed, and came back with nothing.</p>
        ${noticedBox(
          false,
          `${escapeHtml(them)} now know whose it was, and will remember it.${
            wore ? ' Whatever it was wearing, it is not wearing it convincingly any more.' : ''
          }`,
        )}
        <p class="flavor">Everything a spy does is anonymous until it is caught. This one
        was caught.</p>
      </div>`,
  });
}

/**
 * What a sweep turned up, or did not.
 *
 * **The empty result gets a dialog too**, and the same one, because most
 * sweeps find nothing and a player who is only told when it works cannot tell
 * "nobody is here" from "the button did nothing". It also says plainly that
 * the people found do not know they were found, since that is the entire prize
 * and it is invisible on the map -- their sprites do not change for anybody but
 * you.
 */
export function openSearch(state: GameState, unit: Unit, found: Unit[]): void {
  const named = found
    .map((u) => {
      const side = state.players[u.owner]?.name ?? 'somebody';
      return `<li>A ${escapeHtml(unitType(u.type).name)} of ${escapeHtml(side)}, at ${u.x}, ${u.y}</li>`;
    })
    .join('');
  openModal({
    title: found.length > 0 ? 'Not What They Appear' : 'Nothing Out Of Place',
    width: 'min(560px, 96vw)',
    body: `
      <div class="panel-body">
        <p style="font-size:15px">The ${escapeHtml(
          unitType(unit.type).name,
        )} spent the day watching the ground around it.</p>
        ${
          found.length > 0
            ? `<ul class="spy-found">${named}</ul>
               <div class="spy-notice safe">
                 <strong>They do not know.</strong> Being seen through is something only
                 we have learned. They will go on walking those about as though the
                 disguise still holds, which is the whole of what this was worth.
               </div>`
            : `<p class="flavor">Everything out there is what it says it is, as far as
               anybody of ours can tell. That is not the same as nobody being there.</p>`
        }
      </div>`,
  });
}

/**
 * What came of putting sand in the gears.
 *
 * The three outcomes are genuinely different here in a way the reading
 * ladder's are not, so the dialog says which plainly. A *failure* is a wasted
 * day. A *wreck* is somebody's season gone, and the victim is told it happened
 * and not by whom -- which the dialog says, because a player who does not
 * realise they stayed anonymous will not weigh the risk of the time they do
 * not. And being *caught* here costs the agent, which is the whole reason the
 * top of this ladder is a decision.
 */
export function openSabotage(
  state: GameState,
  unit: Unit,
  city: City,
  outcome: SabotageOutcome,
  phase: SabotagePhase,
): void {
  const them = state.players[city.owner]?.name ?? 'They';
  const name = unitType(unit.type).name;
  if (outcome.kind === 'caught') {
    openModal({
      title: 'Taken At The Works',
      width: 'min(560px, 96vw)',
      body: `
        <div class="panel-body">
          <p style="font-size:15px">The ${escapeHtml(name)} was caught at the works in
          ${escapeHtml(city.name)}, with their hands full.</p>
          <div class="spy-notice blown">
            <strong>We were caught.</strong> ${escapeHtml(them)} know whose it was, and
            will remember it.${
              outcome.lost ? ' The agent is not coming back.' : ''
            }</div>
          <p class="flavor">${
            phase.ending
              ? 'There was never going to be a quiet way to do that to a thing that ends the world. Every eye in their empire was already on it.'
              : 'Looking at a town is one thing. Being found inside its works is another.'
          }</p>
        </div>`,
    });
    return;
  }
  if (outcome.kind === 'failed') {
    openModal({
      title: 'Nothing Came Of It',
      width: 'min(560px, 96vw)',
      body: `
        <div class="panel-body">
          <p style="font-size:15px">The ${escapeHtml(name)} spent the day at
          ${escapeHtml(city.name)} and achieved nothing in particular.</p>
          <div class="spy-notice safe"><strong>Nobody noticed.</strong> The works are
          as they were, and so is the agent.</div>
        </div>`,
    });
    return;
  }
  openModal({
    title: 'The Works Are Wrecked',
    width: 'min(560px, 96vw)',
    body: `
      <div class="panel-body">
        <div class="stat-row"><span class="label">Town</span><span class="value">${escapeHtml(city.name)}</span></div>
        <div class="stat-row"><span class="label">What they were building</span><span class="value">${escapeHtml(outcome.what)}</span></div>
        <div class="stat-row"><span class="label">Shields gone</span><span class="value">${outcome.shields}</span></div>
        <div class="spy-notice safe">
          <strong>Nobody noticed.</strong> ${escapeHtml(them)} will find the works
          wrecked in the morning and will have no idea whose doing it was. Being caught
          is the only thing that ever puts a name to this.
        </div>
        ${
          phase.ending
            ? `<p class="flavor">And that was the thing they meant to win with. They will
               start it again, from nothing.</p>`
            : ''
        }
      </div>`,
  });
}
