import type { FactionId, GameState, Player } from '../model/types';
import { aiAccepts, wantPeace } from '../ai/diplomacy';
import {
  PEACE,
  affordable,
  ashamed,
  atPeace,
  betrayals,
  breakPeace,
  peaceLeft,
  signPeace,
  type PeaceTerms,
} from '../sim/diplomacy';
import { portraitPath } from './advisors';
import { takeTurns } from './talking';
import { confirmAction, escapeHtml, openModal } from './dom';

/**
 * Section 116's talks, in the council's own style: a banner, where things
 * stand, your diplomacy advisor making the case, your war advisor objecting,
 * and the offers you can make.
 *
 * The other side answers at once. The Kingdom's answer is written as though a
 * committee took three turns over it, which is true in spirit.
 */

const base = import.meta.env.BASE_URL;
const scene = (id: string) => `${base.endsWith('/') ? base : `${base}/`}diplomacy/${id}.jpg`;

/** Who speaks for peace, and who against, on each side. */
const VOICES: Record<FactionId, { peace: { id: string; name: string }; war: { id: string; name: string } }> = {
  orc: {
    peace: { id: 'troll-headhunter', name: 'Troll Headhunter' },
    war: { id: 'blademaster', name: 'Blademaster' },
  },
  human: {
    peace: { id: 'herald', name: 'Herald' },
    war: { id: 'knight-marshal', name: 'Knight-Marshal' },
  },
};

/** What the peace advisor says, from how the war is going for us. */
function forPeace(faction: FactionId, peace: boolean, weWant: number): string {
  if (faction === 'orc') {
    if (peace) return 'Da peace holds. Heads stay on. I like it when heads stay on, boss.';
    return weWant > 0
      ? 'Dey are bigger dan us right now. Make peace, grow, and hit dem later when we are bigger. Patience is a weapon.'
      : 'We could talk. Or we could not. I only say dat talking is cheaper dan dying.';
  }
  if (peace) return 'The peace holds. Four centuries of orcs, and this is the quietest I have known them. Do not waste it.';
  return weWant > 0
    ? 'We are not winning this. A peace buys time, and time is the one thing we have always had more of than they do.'
    : 'We are not obliged to talk. I merely note that nobody was ever the worse for listening.';
}

/** What the war advisor says back. */
function forWar(faction: FactionId, peace: boolean, weWant: number): string {
  if (faction === 'orc') {
    if (peace) return 'Peace. We sit here. Dey build dat thing. Den we lose. Tear it up, boss.';
    return weWant > 0
      ? 'Talk? Talking is what you do after you lose. I have not finished losing yet.'
      : 'Dey are soft and we are close. Nobody talks when dey are winning.';
  }
  if (peace) return 'A treaty with orcs is a treaty with weather. It holds until it does not. Keep the men ready.';
  return weWant > 0
    ? 'Peace with them? Then they rebuild, and we fight this again with fewer men.'
    : 'We have them. A peace now hands back everything the dead paid for.';
}

/** How the other side seems to feel about it, in words. */
function mood(want: number): string {
  if (want >= 0.35) return 'They want this, and would probably say yes to it for nothing.';
  if (want >= 0) return 'They could be talked round.';
  if (want >= -0.5) return 'They are not interested. Gold might change that.';
  return 'They are looking for a reason not to. Not much will change that.';
}

/** What an answer sounds like, in the answering side's own voice. */
function answerLine(them: Player, yes: boolean): string {
  if (them.faction === 'human') {
    return yes
      ? 'The committee has considered the proposal and, after four pages of minutes, agrees.'
      : 'The committee has considered the proposal and declines, in writing, at length.';
  }
  return yes
    ? 'Dey grunt, and one of dem nods. Dat is a yes.'
    : 'Dey laugh. One of dem throws a bone at your envoy. Dat is a no.';
}

/**
 * What your diplomacy advisor makes of an offer somebody has put to you.
 *
 * The same sum the other side's AI uses, read from our chair: how the war is
 * going, plus whatever gold is on the table. It is advice and not arithmetic,
 * so it comes out as four degrees of enthusiasm rather than a number -- and it
 * is the advisor's own opinion, which means it is in character and occasionally
 * wrong.
 */
function counsel(state: GameState, me: Player, them: Player, terms: PeaceTerms): string {
  const worth = wantPeace(state, me, them) + terms.gold / 100;
  const owed = betrayals(state, them.id) > 0;
  if (me.faction === 'orc') {
    if (worth >= 0.5) {
      return owed
        ? 'Take it, boss. Dey broke der word before, so watch dem -- but we are da ones who need da quiet right now.'
        : 'Take it, boss. We are not winning dis. Peace now, axes later, when da axes are bigger.';
    }
    if (worth >= 0) return 'It is not a bad deal. Heads stay on. Dat is usually worth something.';
    if (worth >= -0.5) return 'We do not need dis. Dey are da ones sweating. Still -- gold is gold, boss.';
    return 'No. We are winning. You do not shake hands wid somebody you are already standing on.';
  }
  if (worth >= 0.5) {
    return owed
      ? 'Accept. They have broken their word before and will again, but we need the years more than we need to be right about them.'
      : 'Accept. This war costs us more than it costs them, and a treaty is cheaper than a season of it.';
  }
  if (worth >= 0) return 'A reasonable proposal, on reasonable terms. I would sign it and keep the men ready.';
  if (worth >= -0.5) return 'We are not the ones who need this. Refuse, or accept and take their gold for the trouble.';
  return 'Decline. They are asking because they must, which is precisely the moment one does not agree.';
}

/** The one other empire the talks are with. */
function rivalOf(state: GameState, viewerId: number): Player | undefined {
  return state.players.find((p) => p.id !== viewerId && !p.barbarian && p.alive);
}

/** The offers on the table, as buttons: [label, gold]. Positive gold we pay. */
function offers(me: Player, peace: boolean): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  const verb = peace ? `Renew for ${PEACE.term} turns` : 'Offer peace';
  out.push([verb, 0]);
  for (const gold of [25, 50]) {
    if (me.gold >= gold) out.push([`${verb}, and pay ${gold} gold`, gold]);
  }
  if (!peace) out.push(['Demand 25 gold for peace', -25]);
  return out;
}

export function openTalks(state: GameState, viewerId: number, onChange: () => void): void {
  const me = state.players[viewerId];
  const them = rivalOf(state, viewerId);
  if (!me || !them) return;

  const render = (said = ''): string => {
    const peace = atPeace(state, me.id, them.id);
    const weWant = wantPeace(state, me, them);
    const theyWant = wantPeace(state, them, me);
    const voices = VOICES[me.faction];
    const status = peace
      ? `<strong>At peace</strong> with ${escapeHtml(them.name)} &mdash; ${peaceLeft(state)} turns left.`
      : `<strong>At war</strong> with ${escapeHtml(them.name)}.`;
    const notes = [
      ashamed(state, me.id)
        ? 'Your own people are still restless over the last peace you broke.'
        : '',
      betrayals(state, them.id) > 0
        ? `They have gone back on their word ${betrayals(state, them.id) === 1 ? 'once' : `${betrayals(state, them.id)} times`}.`
        : '',
      betrayals(state, me.id) > 0
        ? `You have gone back on yours ${betrayals(state, me.id) === 1 ? 'once' : `${betrayals(state, me.id)} times`}, and they know it.`
        : '',
    ].filter(Boolean);
    const voice = (who: { id: string; name: string }, line: string) => `
      <div class="advisor talks-voice">
        <img class="advisor-face" src="${portraitPath(who.id)}" alt="" />
        <div class="advisor-who"><span class="advisor-name">${escapeHtml(who.name)}</span></div>
        <div class="advisor-line">${escapeHtml(line)}</div>
      </div>`;
    return `
      <img class="victory-art talks-art" src="${scene('talks')}" alt="" />
      <div class="panel-body">
        <p style="font-size:15px">${status}</p>
        <p class="flavor">${escapeHtml(mood(theyWant))}</p>
        ${notes.map((n) => `<p class="flavor">${escapeHtml(n)}</p>`).join('')}
        ${said ? `<p class="talks-said">${escapeHtml(said)}</p>` : ''}
      </div>
      <div class="advisors talks-voices">
        ${voice(voices.peace, forPeace(me.faction, peace, weWant))}
        ${voice(voices.war, forWar(me.faction, peace, weWant))}
      </div>
      <div class="button-row talks-offers">
        ${offers(me, peace)
          .map(
            ([label, gold]) =>
              `<button class="small" data-gold="${gold}">${escapeHtml(label)}</button>`,
          )
          .join('')}
        ${peace ? '<button class="small danger" data-break="1">Break the peace</button>' : ''}
      </div>`;
  };

  openModal({
    title: 'The Talks',
    width: 'min(760px, 96vw)',
    body: `<div class="talks">${render()}</div>`,
    onMount: (root) => {
      const holder = root.querySelector<HTMLElement>('.talks')!;
      // Section 46: the case for, then the case against, each face moving while
      // its owner speaks.
      const argue = () => {
        const voices = VOICES[me.faction];
        const faces = [...holder.querySelectorAll<HTMLImageElement>('.talks-voice .advisor-face')];
        const said = [...holder.querySelectorAll<HTMLElement>('.talks-voice .advisor-line')].map(
          (l) => l.textContent ?? '',
        );
        void takeTurns([
          { img: faces[0] ?? null, id: voices.peace.id, line: said[0] ?? '' },
          { img: faces[1] ?? null, id: voices.war.id, line: said[1] ?? '' },
        ]);
      };
      const wire = () => {
        holder.querySelector<HTMLImageElement>('.talks-art')?.addEventListener('error', (e) =>
          (e.target as HTMLElement).remove(),
        );
        holder.querySelectorAll<HTMLButtonElement>('[data-gold]').forEach((b) =>
          b.addEventListener('click', () => {
            const terms: PeaceTerms = { from: me.id, to: them.id, gold: Number(b.dataset.gold) };
            if (!affordable(state, terms)) {
              holder.innerHTML = render('That is more gold than the table has.');
              wire();
              return;
            }
            const yes = aiAccepts(state, terms);
            if (yes) signPeace(state, terms);
            holder.innerHTML = render(answerLine(them, yes));
            wire();
            argue();
            onChange();
          }),
        );
        holder.querySelector<HTMLButtonElement>('[data-break]')?.addEventListener('click', () => {
          confirmAction({
            title: 'Break the peace?',
            body:
              `The peace ends now and you may attack at once. Your own cities will be a ` +
              `citizen less patient for ${PEACE.shameTurns} turns, and ${them.name} will not ` +
              `believe you so easily again.`,
            confirm: 'Break it',
            onConfirm: () => {
              breakPeace(state, me.id);
              onChange();
            },
          });
        });
      };
      wire();
      argue();
    },
  });
}

/**
 * An offer the AI made, put to the human at the top of their turn. Answered
 * here, once: the offer is cleared whichever way it goes.
 */
export function openPeaceOffer(state: GameState, viewerId: number, onChange: () => void): boolean {
  const pending = state.diplomacy?.pending;
  if (!pending || pending.to !== viewerId) return false;
  delete state.diplomacy!.pending;
  const them = state.players[pending.from];
  const me = state.players[viewerId];
  if (!them?.alive || !me?.alive) return false;
  const renewing = atPeace(state, me.id, them.id);
  const terms: PeaceTerms = { ...pending };
  const price =
    terms.gold > 0
      ? ` They will pay you ${terms.gold} gold for it.`
      : terms.gold < 0
        ? ` They want ${-terms.gold} gold from you for it.`
        : '';
  const ask = renewing
    ? `${them.name} would like to renew the peace for another ${PEACE.term} turns.${price}`
    : `${them.name} proposes peace, for ${PEACE.term} turns.${price}`;
  openModal({
    title: renewing ? 'They Ask to Renew' : 'They Ask for Peace',
    width: 'min(640px, 96vw)',
    sticky: true,
    body: `
      <img class="victory-art talks-art" src="${scene('talks')}" alt="" />
      <div class="panel-body"><p style="font-size:15px">${escapeHtml(ask)}</p></div>
      <div class="advisors talks-voices">
        <div class="advisor talks-voice">
          <img class="advisor-face" src="${portraitPath(VOICES[me.faction].peace.id)}" alt="" />
          <div class="advisor-who"><span class="advisor-name">${escapeHtml(
            VOICES[me.faction].peace.name,
          )}</span></div>
          <div class="advisor-line">${escapeHtml(counsel(state, me, them, terms))}</div>
        </div>
      </div>
      <div class="button-row" style="justify-content:flex-end">
        <button class="small" id="offer-no">Refuse</button>
        <button class="primary" id="offer-yes" ${affordable(state, terms) ? '' : 'disabled title="You cannot pay that"'}>Accept</button>
      </div>`,
    onMount: (root, close) => {
      root.querySelector<HTMLImageElement>('.talks-art')?.addEventListener('error', (e) =>
        (e.target as HTMLElement).remove(),
      );
      root.querySelector<HTMLImageElement>('.advisor-face')?.addEventListener('error', (e) =>
        (e.target as HTMLElement).remove(),
      );
      // They say their piece while you decide.
      void takeTurns([
        {
          img: root.querySelector<HTMLImageElement>('.talks-voice .advisor-face'),
          id: VOICES[me.faction].peace.id,
          line: root.querySelector<HTMLElement>('.talks-voice .advisor-line')?.textContent ?? '',
        },
      ]);
      root.querySelector('#offer-yes')?.addEventListener('click', () => {
        signPeace(state, terms);
        close();
        onChange();
      });
      root.querySelector('#offer-no')?.addEventListener('click', () => {
        close();
        onChange();
      });
    },
  });
  return true;
}

/** Said when a peace is broken, by either side, over the picture of it. */
export function openPeaceBroken(state: GameState, viewerId: number, breaker: number): void {
  const who = state.players[breaker];
  const us = breaker === viewerId;
  openModal({
    title: us ? 'You Break the Peace' : 'The Peace Is Broken',
    width: 'min(640px, 96vw)',
    body: `
      <img class="victory-art talks-art" src="${scene('peace-broken')}" alt="" />
      <div class="panel-body">
        <p style="font-size:15px">${
          us
            ? `The peace is over, and you may fight again. Your own cities will be restless for ${PEACE.shameTurns} turns.`
            : `${escapeHtml(who?.name ?? 'They')} ${who ? 'have' : 'have'} torn up the peace. Their armies may attack at once.`
        }</p>
      </div>`,
    onMount: (root) => {
      root.querySelector<HTMLImageElement>('.talks-art')?.addEventListener('error', (e) =>
        (e.target as HTMLElement).remove(),
      );
    },
  });
}
