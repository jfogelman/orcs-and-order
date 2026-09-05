import { BUILDINGS } from './buildings';
import type { TechDef } from './techs';
import type { AdvisorDef, AdvisorRole } from './advisors';
import { ADVISORS } from './advisors';
import type { FactionId } from './types';
import { UNIT_TYPES } from './units';

/**
 * Which advance each advisor wants, and why they are wrong to.
 *
 * Section 75: choosing what to research is the least supported decision in the
 * game. The council already exists, already has an opinion about everything,
 * and already refuses to agree with itself -- so the advances screen can borrow
 * it rather than inventing a recommendation engine.
 *
 * **Self-serving on purpose.** These are not six attempts at the best advance;
 * they are six people arguing for their own department, which is what the
 * council is for. The Blademaster wants whatever hits hardest whether or not
 * the empire is at war. Reading them as a panel of experts is the mistake the
 * game is happy for you to make once.
 *
 * Every suggestion is **something that can actually be started now**: they are
 * chosen out of what the caller passes in, which is `researchableTechs`. An
 * advisor pointing at a locked advance would be advice you cannot take.
 */

export interface Suggestion {
  advisor: AdvisorDef;
  tech: TechDef;
  /** Their reason, which is a reason about them. */
  why: string;
  /**
   * Whether anything on offer is actually in their line.
   *
   * False means they are shrugging at the quickest thing going, and everybody
   * shrugging picks the same one -- so early on, six advisors would print six
   * identical rows. The screen collapses the shruggers into a line, which is
   * both tidier and more honest: at turn one there really is only one choice
   * worth having an opinion about.
   */
  stake: boolean;
}

/** What an advance is worth to somebody who only cares about one thing. */
function scoreFor(role: AdvisorRole, t: TechDef, faction: FactionId): number {
  const units = t.units.map((u) => UNIT_TYPES[u]).filter((u) => u && u.faction === faction);
  const buildings = t.buildings
    .map((b) => BUILDINGS[b])
    .filter((b) => b && (b.faction === 'both' || b.faction === faction));

  switch (role) {
    case 'military':
      // The biggest swing available, and nothing else counts.
      return Math.max(0, ...units.map((u) => u.attack));
    case 'diplomacy':
      // Walls, and failing walls, whatever is hardest to kill. Patience made
      // of stone is still the Headhunter's idea of diplomacy.
      return Math.max(
        0,
        ...buildings.map((b) => (b.defenseMult ?? 1) * 10 - 10),
        ...units.map((u) => u.defense),
      );
    case 'domestic':
      // Anything that keeps people fed, housed and not shouting.
      return Math.max(
        0,
        ...buildings.map((b) => (b.contentBonus ?? 0) * 4 + (b.foodKept ? 6 : 0)),
      );
    case 'trade':
      return Math.max(0, ...buildings.map((b) => (b.goldBonus ?? 0) * 8));
    case 'faith':
      // The same buildings as domestic, wanted for a different reason, which
      // is why they so often agree and never for the same cause.
      return Math.max(0, ...buildings.map((b) => (b.contentBonus ?? 0) * 5));
    case 'arcane':
      // Magic first; failing that, whatever is quickest to know, because
      // knowing things is the point and the subject is a detail.
      return Math.max(
        0,
        ...units.filter((u) => u.damageKind === 'magic').map(() => 20),
        t.cost > 0 ? 200 / t.cost : 0,
      );
  }
}

/** How they put it. Faction-split, because they do not talk the same way. */
const REASONS: Record<AdvisorRole, Record<FactionId, (name: string) => string>> = {
  military: {
    orc: (n) => `${n}. Hits things. I have not read the rest of it.`,
    human: (n) => `${n}. It sharpens the point of the spear, and the spear is the argument.`,
  },
  diplomacy: {
    orc: (n) => `${n}. They will come. Better we are difficult when they do.`,
    human: (n) => `${n}. Strength is what makes a conversation possible.`,
  },
  domestic: {
    orc: (n) => `${n}. People stop shouting. That is my whole job, boss.`,
    human: (n) => `${n}. Contented subjects. It is unglamorous and it is the foundation.`,
  },
  trade: {
    orc: (n) => `${n}. Both heads counted. It pays for itself, which is more than most of you do.`,
    human: (n) => `${n}. It pays for itself, and then it pays for the rest of you.`,
  },
  faith: {
    orc: (n) => `${n}. The spirits want it. I have not asked them, but I know.`,
    human: (n) => `${n}. It will be popular, and popular is not nothing.`,
  },
  arcane: {
    orc: (n) => `${n}. I want to know what happens. That is a reason.`,
    human: (n) => `${n}. Knowledge compounds. Everything else is a consequence of it.`,
  },
};

/** Nothing in their line is available, so they want the quickest thing going. */
const SHRUGS: Record<FactionId, (name: string) => string> = {
  orc: (n) => `${n}, then. Nothing here is mine. Get it over with.`,
  human: (n) => `${n}, I suppose. Nothing on offer concerns my department.`,
};

/**
 * One advance per advisor, out of what can be started now.
 *
 * Ties break on the cheaper advance, so an advisor with two equally good
 * options asks for the one you can actually have soon -- and so the list is
 * stable between openings of the screen, which matters more than it sounds:
 * advice that changes while you are reading it is not advice.
 */
export function advisorSuggestions(
  faction: FactionId,
  available: readonly TechDef[],
  cost: (t: TechDef) => number,
): Suggestion[] {
  if (available.length === 0) return [];
  const out: Suggestion[] = [];

  for (const advisor of ADVISORS.filter((a) => a.faction === faction)) {
    let best: TechDef | null = null;
    let bestScore = -1;
    for (const t of available) {
      const score = scoreFor(advisor.role, t, faction);
      if (score > bestScore || (score === bestScore && best && cost(t) < cost(best))) {
        best = t;
        bestScore = score;
      }
    }
    if (!best) continue;
    out.push({
      advisor,
      tech: best,
      why: bestScore > 0 ? REASONS[advisor.role][faction](best.name) : SHRUGS[faction](best.name),
      stake: bestScore > 0,
    });
  }
  return out;
}
