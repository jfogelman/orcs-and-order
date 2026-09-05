import { BUILDINGS } from '../model/buildings';
import type { FactionId, GameState } from '../model/types';
import { unitType } from '../model/units';
import {
  ROLE_NAMES,
  type Situation,
  advisorConcern,
  advisorLine,
  advisorsFor,
  objectionsTo,
} from '../model/advisors';
import {
  buildingUpkeep,
  cityIncome,
  contentLimit,
  foodSurplus,
  isGarrisoned,
} from '../sim/city';
import { playerCities, playerUnits } from '../sim/gamestate';
import { CLOCK_WARNINGS, DOMINANCE, playerScore, turnsLeft } from '../sim/turn';
import { TECHS } from '../model/techs';
import { tradeRates, unlockedBuildings } from '../sim/research';
import { TECHS_BY_ID } from '../model/techs';
import { escapeHtml, openModal } from './dom';

/**
 * The advisor panel: six opinions about the same empire.
 *
 * Read-only and entirely derived, like the report. It reads nothing but the
 * viewer's own player, so it can no more leak a hidden position than the report
 * can -- an advisor may only be alarmed about enemies the viewer has actually
 * seen.
 */

/**
 * Where an advisor's portrait lives. Missing art leaves the name and the line.
 *
 * Exported because the advances screen shows the same faces beside the same
 * people, and two places that each know where the art lives is one place too
 * many the day it moves.
 */
export function portraitPath(id: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}advisors/${id}.png`;
}

/**
 * Gather everything the six of them might have an opinion about, once.
 *
 * Done in one pass and handed to all of them, so nobody re-walks the city list
 * and two advisors cannot end up disagreeing about the *facts*. They are only
 * meant to disagree about what to do.
 */
export function situationOf(state: GameState, playerId: number): Situation {
  const player = state.players[playerId];
  const cities = playerCities(state, playerId);
  const units = playerUnits(state, playerId);

  let goldPerTurn = 0;
  let beakersPerTurn = 0;
  let rioting = 0;
  let restless = 0;
  let starving = 0;
  let undefended = 0;
  let walled = 0;
  let barracks = 0;
  let coinBuildings = 0;
  let calmBuildings = 0;
  let supplyPosts = 0;

  for (const city of cities) {
    const income = cityIncome(state, city, player);
    goldPerTurn += income.gold - buildingUpkeep(state, city);
    beakersPerTurn += income.beakers;

    if (city.disorder) rioting++;
    // One short of the line counts as restless: an advisor warning you the turn
    // after it happens is a historian.
    else if (city.size >= contentLimit(state, city)) restless++;
    if (foodSurplus(state, city) < 0) starving++;
    if (!isGarrisoned(state, city)) undefended++;

    if (city.buildings.includes('walls')) walled++;
    for (const id of city.buildings) {
      const def = BUILDINGS[id];
      if (!def) continue;
      if (def.startingRank !== undefined || id === 'barracks') barracks++;
      if (def.goldBonus) coinBuildings++;
      if (def.contentBonus) calmBuildings++;
      if (def.suppliesArmy) supplyPosts++;
    }
  }

  const seen = player.visible;
  const w = state.width;
  const enemiesSeen = state.units.filter(
    (u) => u.owner !== playerId && unitType(u.type).attack > 0 && seen[u.y * w + u.x],
  ).length;

  const fighters = units.filter((u) => unitType(u.type).attack > 0);

  // Can this side build anything at all that calms a city, and if not, which
  // advance would let them? Naming it is the whole point: "your cities riot" is
  // an observation, and "your cities riot and the answer is called Joy Making"
  // is advice.
  const calmingUnlocked = unlockedBuildings(player).some((b) => (b.contentBonus ?? 0) > 0);
  const calmAdvance = calmingUnlocked
    ? null
    : (TECHS.find(
        // 'both' is a real value here, not an absent one -- Joy Making is
        // shared. Testing only for a missing faction or an exact match found
        // nothing at all, which read as "no such advance exists" rather than
        // as a bug, and quietly turned the advice back into an observation.
        (t) =>
          (!t.faction || t.faction === 'both' || t.faction === player.faction) &&
          t.buildings.some((b) => (BUILDINGS[b]?.contentBonus ?? 0) > 0),
      )?.name ?? null);

  // Who, if anybody, is one clock away from winning outright.
  let dominance: Situation['dominance'] = null;
  for (const p of state.players) {
    if (p.dominantSince === undefined) continue;
    const left = DOMINANCE.turns - (state.turn - p.dominantSince);
    if (left <= 0) continue;
    dominance = { turnsLeft: left, theirs: p.id !== playerId };
  }

  // The deadline, once it is close enough to plan around. `CLOCK_WARNINGS[0]`
  // rather than a number of its own, so the advisors start talking about it on
  // the same turn the log first mentions it.
  const left = turnsLeft(state);
  const scores = state.players.filter((p) => p.alive).map((p) => ({ id: p.id, score: playerScore(state, p.id) }));
  const best = Math.max(...scores.map((s) => s.score));
  const deadline: Situation['deadline'] =
    left > CLOCK_WARNINGS[0] || left < 0
      ? null
      : {
          turnsLeft: left,
          ahead: playerScore(state, playerId) >= best,
          level: scores.filter((s) => s.score === best).length > 1,
        };

  return {
    turn: state.turn,
    faction: player.faction,
    deadline,
    cities: cities.length,
    rioting,
    restless,
    starving,
    gold: player.gold,
    goldPerTurn,
    beakersPerTurn,
    rates: tradeRates(player),
    researching: player.researching ? TECHS_BY_ID[player.researching]?.name ?? null : null,
    undefended,
    enemiesSeen,
    army: fighters.length,
    magicUnits: fighters.filter((u) => unitType(u.type).damageKind === 'magic').length,
    // The cheap and numerous, which is exactly who the Death Knight means.
    // Reuses the flag the Goblin Catapult loads itself with, since "expendable"
    // is already the game's word for these two.
    rankAndFile: fighters.filter((u) => unitType(u.type).expendable).length,
    paladins: fighters.filter((u) => unitType(u.type).base === 'paladin').length,
    walled,
    wallsAvailable: unlockedBuildings(player).some((b) => b.id === 'walls'),
    calmAvailable: calmingUnlocked,
    calmNeedsAdvance: calmingUnlocked ? null : calmAdvance,
    barracks,
    coinBuildings,
    calmBuildings,
    supplyPosts,
    dominance,
  };
}

/**
 * The council asking to be heard, before it says anything.
 *
 * Deliberately a doorway rather than the advice itself. A player mid-turn wants
 * to know **whether** this is worth their attention, and the headline answers
 * that in one line; the arguing, the six opinions and the suggested fixes are
 * behind a click, where they cost nothing to anybody who does not want them.
 *
 * Dismissable, and dismissing is not punished: the crisis is remembered as
 * raised either way, so it will not ask again about the same thing. Everything
 * here is also in the log, which is where a player who waves this away will
 * find it.
 */
export function openCrisisCall(
  headlines: string[],
  faction: FactionId,
  onHear: () => void,
): void {
  const lines = headlines
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join('');
  openModal({
    title: 'Your advisors request an audience',
    width: 'min(560px, 94vw)',
    body: `
      <div class="panel-body">
        <p class="flavor">
          ${
            faction === 'orc'
              ? 'Six of them are outside. They are being unusually polite about it, which is itself alarming.'
              : 'The council has convened without being summoned. Somebody has brought a folder.'
          }
        </p>
        <ul class="crisis-list">${lines}</ul>
      </div>
      <div class="button-row" style="justify-content:flex-end">
        <button class="small" data-act="later">Not Now</button>
        <button class="primary" data-act="hear">Hear Them Out</button>
      </div>`,
    onMount: (root, close) => {
      root.querySelector('[data-act="later"]')?.addEventListener('click', () => close());
      root.querySelector('[data-act="hear"]')?.addEventListener('click', () => {
        close();
        onHear();
      });
    },
  });
}

export function openAdvisors(state: GameState, playerId: number): void {
  const player = state.players[playerId];
  const situation = situationOf(state, playerId);
  const advisors = advisorsFor(player.faction);

  const card = (a: (typeof advisors)[number]) => {
    // Only somebody with something to say back is worth clicking, so the ones
    // who would draw nothing out of the room do not pretend otherwise.
    const concern = advisorConcern(a, situation);
    const contested = objectionsTo(a, concern).length > 0;
    // Two marks, because there are two different things worth knowing and the
    // cursor changing shape on hover told you neither.
    //
    //   speech  -- ask this one and somebody will argue back
    //   thought -- something they actually care about is happening, but the
    //              room agrees, so there is nothing to draw out
    //
    // No mark at all means they are talking to fill the silence, which is most
    // of them on most turns and is worth being able to see at a glance.
    const mark = contested ? 'speech' : concern ? 'thought' : null;
    const markTitle = contested
      ? 'Ask them. Somebody will disagree.'
      : 'Something they mind about is happening.';
    return `
    <div class="advisor${contested ? ' contested' : ''}" data-advisor="${escapeHtml(a.id)}"
         ${contested ? 'role="button" tabindex="0" title="Ask them, and see who objects"' : ''}>
      <img class="advisor-face" src="${portraitPath(a.id)}" alt="" />
      ${
        mark
          ? `<img class="advisor-bubble ${mark}" src="${portraitPath(`bubble_${mark}`)}"
                  alt="" title="${escapeHtml(markTitle)}" />`
          : ''
      }
      <div class="advisor-who">
        <span class="advisor-name">${escapeHtml(a.name)}</span>
        <span class="advisor-role muted">${escapeHtml(ROLE_NAMES[a.role])}</span>
        <span class="advisor-blurb muted">${escapeHtml(a.blurb)}</span>
      </div>
      <div class="advisor-line">${escapeHtml(advisorLine(a, situation))}</div>
      <div class="advisor-replies" hidden></div>
    </div>`;
  };

  openModal({
    title: player.faction === 'orc' ? 'Those Who Advise' : 'The Council',
    width: 'min(760px, 96vw)',
    body: `
      <div class="panel-body advisor-note muted">
        Six people with opinions. They are not experts and they do not agree;
        each one wants what they have always wanted, and will find a reason.
      </div>
      <div class="advisors">${advisors.map(card).join('')}</div>`,
    onMount: (root) => {
      // Art arrives a file at a time, so a missing portrait leaves the name and
      // the opinion rather than a broken-image glyph.
      root.querySelectorAll<HTMLImageElement>('.advisor-face').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });

      // Ask one, and let the others interrupt.
      //
      // Section 46 settled the shape: six faces all talking at once is a lot of
      // movement on a screen somebody is reading, and six opinions in a list is
      // not an argument. You pick somebody, and only those who *disagree* say
      // anything back -- which is what turns a panel of characters into a room.
      const speak = (holder: HTMLElement) => {
        const who = advisors.find((a) => a.id === holder.dataset.advisor);
        if (!who) return;
        const replies = holder.querySelector<HTMLElement>('.advisor-replies');
        if (!replies) return;
        if (!replies.hidden) {
          // Asking again puts the room away rather than repeating itself.
          replies.hidden = true;
          replies.innerHTML = '';
          return;
        }
        // Close anybody else's, so only one argument is running at a time.
        root.querySelectorAll<HTMLElement>('.advisor-replies').forEach((r) => {
          r.hidden = true;
          r.innerHTML = '';
        });
        const objections = objectionsTo(who, advisorConcern(who, situation));
        if (objections.length === 0) return;
        replies.innerHTML = objections
          .map(
            (o) => `
            <div class="advisor-reply">
              <img class="advisor-reply-face" src="${portraitPath(o.advisor.id)}" alt="" />
              <div>
                <span class="advisor-name">${escapeHtml(o.advisor.name)}</span>
                <div>${escapeHtml(o.says)}</div>
              </div>
            </div>`,
          )
          .join('');
        replies.hidden = false;
        replies.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
          img.addEventListener('error', () => img.remove());
        });
      };

      root.querySelectorAll<HTMLElement>('.advisor.contested').forEach((holder) => {
        holder.addEventListener('click', () => speak(holder));
        holder.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            speak(holder);
          }
        });
      });
    },
  });
}
