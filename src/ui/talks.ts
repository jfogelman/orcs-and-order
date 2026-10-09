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
  moodName,
  standing,
  talksWith,
} from '../sim/diplomacy';
import { type Opening, haveMet, metOn, openingBy } from '../sim/contact';
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
type Voice = { id: string; name: string };

/**
 * Who speaks for peace, and who against, on each side that has a table.
 *
 * **Total since section 135 slice 3b**, where it was partial before: the
 * Hivekin were fought and not talked to, so they had no seat here and the
 * missing key was what made `talks()` load-bearing rather than decorative. It
 * is still typed `Partial`, because a later faction may arrive before its
 * advisors are written and an empty screen is a better failure than a crash.
 *
 * The Voice is the joke the whole slice rests on -- a diplomat sent to mimic
 * an emotion the thing she speaks for does not have -- so every Hive line
 * below is written at slightly the wrong angle to the sentence it is imitating.
 */
const VOICES: Partial<
  Record<FactionId, { peace: Voice; war: Voice }>
> = {
  orc: {
    peace: { id: 'troll-headhunter', name: 'Troll Headhunter' },
    war: { id: 'blademaster', name: 'Blademaster' },
  },
  human: {
    peace: { id: 'herald', name: 'Herald' },
    war: { id: 'knight-marshal', name: 'Knight-Marshal' },
  },
  hivekin: {
    peace: { id: 'voice', name: 'The Voice' },
    war: { id: 'bladeguard', name: 'The Bladeguard' },
  },
};

/** How the relationship opened, for the note on the Talks screen. */
function startedWith(opening: Opening | undefined): string {
  switch (opening) {
    case 'greeting':
      return 'They opened with a greeting.';
    case 'border':
      return 'They opened by telling you where their land stops.';
    case 'tribute':
      return 'They opened by asking to be paid.';
    case 'declaration':
      return 'They opened by declaring war.';
    case 'statement':
      return 'They opened with whatever that was.';
    default:
      return 'Nobody said anything when you met.';
  }
}

/** What the peace advisor says, from how the war is going for us. */
function forPeace(faction: FactionId, peace: boolean, weWant: number): string {
  if (faction === 'hivekin') {
    if (peace) return 'The agreement holds. Nothing is being spent. The Hive approves of nothing being spent.';
    return weWant > 0
      ? 'They are larger. A Hive that is destroyed expands no further. End it, and grow.'
      : 'We may stop. We may continue. I am asked to present this to you as a choice.';
  }
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
  if (faction === 'hivekin') {
    if (peace) return 'We are not growing. Everything that is not growing is waiting to be eaten.';
    return weWant > 0
      ? 'They are larger today. Today is not the only day, and we have more of them than they do.'
      : 'There is ground, and they are standing on it. That is the whole of the argument.';
  }
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

/**
 * What their diplomat says back, across the table. Section 124.
 *
 * Asked for from play: *"in the diplomacy screen I think it would be fun to
 * see the two factions' diplo advisors talking"*. It was your own two arguing
 * with each other, which is a council meeting rather than a negotiation -- the
 * other side was a line of narration and a yes or no.
 *
 * Written from the same number their AI decides with (`wantPeace`), so the
 * envoy is not bluffing: a Herald who says the Kingdom is listening is a
 * Kingdom that will take the offer. It is the one place in the game where the
 * other side speaks for itself, and it should be worth reading for that alone.
 */
function theirWord(faction: FactionId, peace: boolean, theyWant: number): string {
  if (faction === 'hivekin') {
    if (peace) return 'The agreement holds. I am to tell you the Queen is delighted. I have not told the Queen.';
    if (theyWant >= 0.35) return 'We are receptive. I have been instructed to appear eager. Is this eager. I can do more.';
    if (theyWant >= 0) return 'The Hive will consider it. I am told to smile at this point in the sentence.';
    if (theyWant >= -0.5) return 'The Hive does not require this. I have been asked to sound regretful, and I am sounding it.';
    return 'No. I was going to soften that, and then calculated that softening it changes nothing.';
  }
  if (faction === 'orc') {
    if (peace) return 'Da treaty is on da wall in da big tent. Nobody has eaten it yet. Dat is respect.';
    if (theyWant >= 0.35) return 'We is listening, elf. Say a number. Say it slow, we is not good wif numbers.';
    if (theyWant >= 0) return 'We could stop. We is not tired, you understand. We could just stop. For a price.';
    if (theyWant >= -0.5) return 'Why would we stop? You is losing interestingly. Bring gold and we will pretend to think.';
    return 'No. Da lads have made plans. Dere is a rota.';
  }
  if (peace) return 'The treaty stands, filed in triplicate, and I have read all three. Let us both keep it that way.';
  if (theyWant >= 0.35) return 'We are, I will admit it plainly, receptive. Name your terms before somebody senior arrives and I have to stop admitting things.';
  if (theyWant >= 0) return 'The realm is willing to hear a proposal. Willing. That is the word I am authorised to use.';
  if (theyWant >= -0.5) return 'The realm is not seeking an arrangement. Gold has been known to reopen a file that was closed.';
  return 'No. And the committee asked me to say it in that tone.';
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
  if (them.faction === 'hivekin') {
    return yes
      ? 'The Voice nods, several times, at very slightly the wrong speed. That is a yes.'
      : 'The Voice says she is "so terribly sorry" in a tone nobody has ever used for that sentence.';
  }
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
  if (me.faction === 'hivekin') {
    // No line here mentions their word, because the Hive does not weigh it --
    // see `hiveWants`, which has no distrust term at all.
    if (worth >= 0.5) return 'Accept. We survive this way. The Hive has no other preference.';
    if (worth >= 0) return 'Acceptable. Nothing is lost that was growing.';
    if (worth >= -0.5) return 'Unnecessary. They need this and we do not. I am told that is leverage.';
    return 'Refuse. They are smaller than they were. We are not.';
  }
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

/**
 * Everybody across the table. Section 135 slice 3b.
 *
 * **This returned one side**, which was the only possible answer when there
 * were two empires and became a coin flip the moment the Hive learned to sign
 * things -- the side it did not pick could never be talked to at all.
 *
 * `talksWith` is the one place the rule lives, and it has always asked whether
 * *both* of them come to a table. Met-ness is asked here and not there: the
 * sim may perfectly well have a standing with somebody you have not seen, and
 * what a *screen* must not do is offer you a treaty with a side you have never
 * laid eyes on.
 */
function rivalsOf(state: GameState, viewerId: number): Player[] {
  return talksWith(state, viewerId)
    .filter((id) => haveMet(state, viewerId, id))
    .map((id) => state.players[id])
    .filter((p) => VOICES[p.faction]);
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
  const sides = me ? rivalsOf(state, viewerId) : [];
  if (!me || sides.length === 0) return;
  const voices = VOICES[me.faction];
  if (!voices) return;

  // Which chair is being looked at. Mutable because the tabs change it in
  // place and everything below reads it fresh -- the alternative is rebuilding
  // the dialog per side, which loses the advisors mid-sentence.
  let them = sides[0];
  let theirVoices = VOICES[them.faction]!;

  /**
   * One tab a side, when there is more than one.
   *
   * The mood goes on the tab rather than inside, because the first question
   * with three sides on the board is not "what will they take" but "which of
   * these two is the problem".
   */
  const tabs = (): string => {
    if (sides.length < 2) return '';
    return `<div class="button-row talks-sides">${sides
      .map(
        (p) =>
          `<button class="small${p.id === them.id ? ' primary' : ''}" data-side="${p.id}">` +
          `${escapeHtml(p.name)} &mdash; ${escapeHtml(moodName(state, me.id, p.id))}</button>`,
      )
      .join('')}</div>`;
  };

  const render = (said = ''): string => {
    const peace = atPeace(state, me.id, them.id);
    const weWant = wantPeace(state, me, them);
    const theyWant = wantPeace(state, them, me);
    // Section 135: the mood and the treaty are two different facts, and the
    // screen says both. A side can be furious and bound, or friendly and
    // unbound, and one word for the pair of them could only ever lie about one.
    const where = standing(state, me.id, them.id);
    const sign = where > 0 ? '+' : '';
    const truce = peace
      ? ` &mdash; truce, ${peaceLeft(state, me.id, them.id)} turns left`
      : '';
    const status =
      `<strong>${escapeHtml(moodName(state, me.id, them.id))}</strong> ` +
      `<span class="muted">(${sign}${where})</span> with ${escapeHtml(them.name)}${truce}.`;
    const notes = [
      // Section 135: how this started. A pair that opened with a declaration
      // is a different relationship from one that opened with a gift basket,
      // and three hundred turns later the number alone cannot say which.
      metOn(state, me.id, them.id) !== undefined
        ? `${startedWith(openingBy(state, me.id, them.id, them.id))} You met on turn ${metOn(state, me.id, them.id)}.`
        : '',
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
    // `across` is their envoy rather than one of ours: the portrait is flipped
    // so the two of them face each other, and the card is lit the other side's
    // colour so there is never a moment's doubt about who just said that.
    const voice = (who: { id: string; name: string }, line: string, across = false) => `
      <div class="advisor talks-voice${across ? ' talks-them' : ''}">
        <img class="advisor-face" src="${portraitPath(who.id)}" alt="" />
        <div class="advisor-who"><span class="advisor-name">${escapeHtml(who.name)}</span>${
          across ? `<span class="advisor-role muted">${escapeHtml(them.name)}</span>` : ''
        }</div>
        <div class="advisor-line">${escapeHtml(line)}</div>
      </div>`;
    return `
      <img class="victory-art talks-art" src="${
        // The banquet is two delegations at a table, and one of the sides at
        // this table does not attend tables. Same rule as the meeting dialog.
        them.faction === 'hivekin' ? scene('emergence') : scene('talks')
      }" alt="" />
      ${tabs()}
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
      <div class="advisors talks-voices talks-across">
        ${voice(theirVoices.peace, theirWord(them.faction, peace, theyWant), true)}
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
        const faces = [...holder.querySelectorAll<HTMLImageElement>('.talks-voice .advisor-face')];
        const said = [...holder.querySelectorAll<HTMLElement>('.talks-voice .advisor-line')].map(
          (l) => l.textContent ?? '',
        );
        // Section 124: your envoy makes the case, **their envoy answers**, and
        // then your war advisor says what he thinks of all that. The order is
        // the joke: the objection lands after the other side has spoken, which
        // is how it goes at every table anybody has ever sat at.
        void takeTurns([
          { img: faces[0] ?? null, id: voices.peace.id, line: said[0] ?? '' },
          { img: faces[2] ?? null, id: theirVoices.peace.id, line: said[2] ?? '' },
          { img: faces[1] ?? null, id: voices.war.id, line: said[1] ?? '' },
        ]);
      };
      const wire = () => {
        holder.querySelector<HTMLImageElement>('.talks-art')?.addEventListener('error', (e) =>
          (e.target as HTMLElement).remove(),
        );
        // Changing chairs. The dialog is not rebuilt -- `them` moves and the
        // body is redrawn around it -- so the advisors keep their places and
        // nobody is interrupted mid-sentence by a modal replacing itself.
        holder.querySelectorAll<HTMLButtonElement>('[data-side]').forEach((b) =>
          b.addEventListener('click', () => {
            const picked = sides.find((p) => p.id === Number(b.dataset.side));
            if (!picked || picked.id === them.id) return;
            them = picked;
            theirVoices = VOICES[them.faction]!;
            holder.innerHTML = render();
            wire();
          }),
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
  // An offer can only ever have come from a side with a table, but reading it
  // off the data rather than trusting that is what keeps the `Partial` honest.
  const myVoice = VOICES[me.faction]?.peace;
  if (!myVoice) return false;
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
          <img class="advisor-face" src="${portraitPath(myVoice.id)}" alt="" />
          <div class="advisor-who"><span class="advisor-name">${escapeHtml(
            myVoice.name,
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
          id: myVoice.id,
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
