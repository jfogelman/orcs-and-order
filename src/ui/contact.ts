import type { GameState } from '../model/types';
import { advisorsFor } from '../model/advisors';
import { STANDING, moodName, standing } from '../sim/diplomacy';
import { type Opening, openingBy, openingTitle, pairOpening } from '../sim/contact';
import { portraitPath } from './advisors';
import { escapeHtml, openModal } from './dom';

/**
 * Section 135 slice 3: the dialog that says somebody is out there.
 *
 * It is modal for the reason the section 124 list is modal -- it changes what
 * you should do next. Finding out that a third side exists, and that it has
 * just declared war on you, is not a line in the log.
 *
 * What it shows is the one thing the sim decided and the two things it can be
 * read off: who spoke, what they said, and where that leaves the pair. The
 * number is shown beside the name because a mood nobody can explain is the
 * thing the derived ladder exists to avoid.
 */

const base = import.meta.env.BASE_URL;
const scene = (id: string) => `${base.endsWith('/') ? base : `${base}/`}diplomacy/${id}.jpg`;

/**
 * The art for a meeting, by how it went.
 *
 * A missing file is removed on its own `error`, which is the established rule
 * for these scenes: the dialog falls back to the two envoys, who are already
 * drawn, and nothing looks broken. That is why `emergence` can be named here
 * before it is drawn -- and why it has to be, rather than borrowing `talks`: a
 * hole opening in the ground is not two delegations at a table in a field, and
 * the banquet over the top of the Voice reads as the game not having noticed
 * what it is looking at.
 */
function picture(opening: Opening | undefined): string {
  if (opening === 'statement') return scene('emergence');
  return scene(opening === 'declaration' ? 'peace-broken' : 'talks');
}

/**
 * A line of our own, under theirs: the player's diplomacy advisor saying what
 * to make of it. One sentence, by opening, and the joke is that each side's
 * envoy reads the same four messages completely differently.
 */
function ourRead(faction: string, opening: Opening | undefined): string {
  const orc = faction === 'orc';
  switch (opening) {
    case 'greeting':
      return orc
        ? 'Dey are being nice. Dat is either a gift or a trap, and boss, it is usually a gift.'
        : 'Cordial, and unsolicited. I have filed it, and I have also read it twice.';
    case 'border':
      return orc
        ? 'Dey have told us where deir hill is. Now we know where deir hill is.'
        : 'A boundary stated is a boundary they expect to defend. Useful of them.';
    case 'tribute':
      return orc
        ? 'Dey want paying. Boss, dey have not met us.'
        : 'An opening demand. One pays it, or one does not, and either way one remembers it.';
    case 'declaration':
      return orc
        ? 'Dat saves us a conversation. I hate conversations.'
        : 'Then we are at war from today, which at least spares us the ambiguity.';
    case 'statement':
      return orc
        ? 'Boss. Dat came out of da ground. I do not know what it wants and I do not think it does either.'
        : 'It spoke. I have written down what it said. I cannot tell you what it means.';
    default:
      return orc
        ? 'Dey are out dere now. Dat is all I have got.'
        : 'Contact is established. Beyond that I would be guessing, and I will not.';
  }
}

/** The envoy's portrait and name, for a side, or nothing if it has no envoy. */
function envoyOf(faction: string): { id: string; name: string } | undefined {
  const who = advisorsFor(faction as never).find((a) => a.role === 'diplomacy');
  return who ? { id: who.id, name: who.name } : undefined;
}

/**
 * Said once, when this player meets somebody for the first time.
 *
 * `them` is the side just met; everything else is read back out of the record
 * the sim wrote, so the dialog cannot disagree with the game about what
 * happened.
 */
export function openFirstContact(
  state: GameState,
  viewerId: number,
  them: number,
): void {
  const me = state.players[viewerId];
  const they = state.players[them];
  if (!me || !they) return;
  // **Theirs, not the pair's.** The title and the advisor's reading are both
  // about what the other side said, so asking the pair -- which keeps the
  // harder of the two -- put the player's own declaration in their envoy's
  // mouth. Caught in the browser: "They Declare War" over the Herald asking
  // politely to be paid.
  const opening = openingBy(state, viewerId, them, them);
  // The picture is about the *relationship*, so it takes the pair's word for
  // it rather than theirs. A meeting where you declared war and they asked
  // politely for tribute is still a meeting with a war in it, and the civil
  // banquet over the top of it reads as the game not having noticed.
  const mood = pairOpening(state, viewerId, them);
  const where = standing(state, viewerId, them);
  const sign = where > 0 ? '+' : '';
  const theirEnvoy = envoyOf(they.faction);
  const mine = envoyOf(me.faction);
  // The scale, spelled out, because the first question a player asks about a
  // number is what the number is out of.
  const worst = STANDING.worst;
  const best = STANDING.best;

  const voice = (
    who: { id: string; name: string } | undefined,
    whose: string,
    line: string,
    across = false,
  ) =>
    who
      ? `
      <div class="advisor talks-voice${across ? ' talks-them' : ''}">
        <img class="advisor-face" src="${portraitPath(who.id)}" alt="" />
        <div class="advisor-who"><span class="advisor-name">${escapeHtml(who.name)}</span>
          <span class="advisor-role muted">${escapeHtml(whose)}</span></div>
        <div class="advisor-line">${escapeHtml(line)}</div>
      </div>`
      : '';

  openModal({
    title: `${they.name}: ${openingTitle(opening ?? 'statement')}`,
    width: 'min(680px, 96vw)',
    body: `
      <img class="victory-art talks-art" src="${picture(mood)}" alt="" />
      <div class="panel-body">
        <p style="font-size:15px">You have met <strong>${escapeHtml(they.name)}</strong>.
          Each of you now knows roughly where the other lives.</p>
        <p style="font-size:15px"><strong>${escapeHtml(moodName(state, viewerId, them))}</strong>
          <span class="muted">(${sign}${where}, on a scale of ${worst} to +${best})</span></p>
      </div>
      <div class="advisors talks-voices talks-across">
        ${voice(theirEnvoy, they.name, theirWord(state, them, viewerId, opening), true)}
      </div>
      <div class="advisors talks-voices">
        ${voice(mine, me.name, ourRead(me.faction, opening))}
      </div>`,
    onMount: (root) => {
      root
        .querySelector<HTMLImageElement>('.talks-art')
        ?.addEventListener('error', (e) => (e.target as HTMLElement).remove());
    },
  });
}

/**
 * What their envoy is shown saying.
 *
 * Read off the log line the sim already wrote rather than regenerated here, so
 * there is exactly one copy of each of these sentences and the dialog can
 * never put words in a side's mouth that the log does not have.
 */
function theirWord(
  state: GameState,
  speaker: number,
  viewerId: number,
  opening: Opening | undefined,
): string {
  const said = [...state.log]
    .reverse()
    .find((e) => e.actor === speaker && e.player === viewerId && e.subject === 'first-contact');
  if (said) return said.text;
  return opening === undefined
    ? 'They have said nothing at all, which is itself a position.'
    : 'They have made their position known.';
}
