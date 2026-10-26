import { describe, expect, it } from 'vitest';
import { EXORCISM, EXORCISTS, couldExorcise, exorcises, exorcistsOf } from '../src/sim/exorcism';
import { createGame, spawnUnit } from '../src/sim/gamestate';
import { CREATURES, unitType } from '../src/model/units';
import { TECHS } from '../src/model/techs';
import { FACTION_IDS, FACTIONS } from '../src/model/factions';
import type { FactionId } from '../src/model/types';

/**
 * Section 150. The answer, shipped before the question.
 *
 * `UNBOUND_PLAN.md` builds a faction whose units disperse rather than die
 * unless the thing that beat them could exorcise. That rule is only playable
 * because every side has an answer to it -- so the answers go in first, and
 * the faction follows.
 *
 * Nothing disperses yet, so nothing is exorcised yet. What is tested here is
 * that the capability exists, is reachable, and is reachable *for everybody*
 * -- which is the half that would otherwise be discovered by playing the
 * Unbound and finding one side unable to beat them.
 */
function sideWith(faction: FactionId, techs: string[]) {
  const state = createGame({ seed: 17, width: 30, height: 20, playerFaction: faction });
  state.players[0].techs = [FACTIONS[faction].startTech, ...techs];
  return state;
}

describe('every side has an answer to something that does not stay dead', () => {
  /**
   * The check the whole section exists for, and the one that cannot be
   * written as a list: a faction added later with no exorcist would be a
   * faction the Unbound can never be permanently beaten by.
   */
  it('gives every faction at least one exorcist it can reach', () => {
    for (const faction of FACTION_IDS) {
      const theirs = CREATURES.filter((c) => c.faction === faction && couldExorcise(c.id));
      expect(theirs.length, `${faction} has nobody who can exorcise`).toBeGreaterThan(0);
      // And an advance actually unlocks one, or it is a creature with art and
      // no way into the game -- the shape section 138 hit with the high tier
      // of spies and section 147 hit with this faction's own citizens.
      for (const c of theirs) {
        expect(
          TECHS.some((t) => t.units.includes(c.id)),
          `${c.name} is unlocked by nothing`,
        ).toBe(true);
      }
    }
  });

  it('names a creature that exists for every entry in the table', () => {
    for (const base of Object.keys(EXORCISTS)) {
      expect(
        CREATURES.some((c) => c.id === base),
        `${base} is in EXORCISTS and is not a creature`,
      ).toBe(true);
    }
  });

  it('names a real flag wherever one is required', () => {
    const flags = new Set(TECHS.flatMap((t) => t.flags));
    for (const [base, needs] of Object.entries(EXORCISTS)) {
      if (needs === null) continue;
      expect(flags.has(needs as never), `${base} needs '${needs}', which nothing grants`).toBe(true);
    }
  });
});

describe('who can actually do it', () => {
  it('lets the three that can do it by being what they are', () => {
    for (const [faction, id] of [
      ['human', 'paladin'],
      ['hivekin', 'warden'],
      ['orc', 'orc-shaman'],
    ] as const) {
      const state = sideWith(faction, []);
      const u = spawnUnit(state, 0, id, 10, 10);
      expect(exorcises(state, u), `${id} should need no advance`).toBe(true);
    }
  });

  /**
   * The Mystic is the only one that has to be taught, which is the bible's
   * own shape: *"an upgrade tech later grants the Mystic exorcism
   * capability"*. Self-taught, so it learns this the way it learned the rest.
   */
  it('makes the Mystic learn it', () => {
    const state = sideWith('wandering', ['signature-mystic']);
    const u = spawnUnit(state, 0, 'mystic', 10, 10);
    expect(exorcises(state, u), 'untaught, it only scatters them').toBe(false);
    state.players[0].techs.push('mystic-exorcism');
    expect(exorcises(state, u)).toBe(true);
  });

  it('leaves everybody else out of it', () => {
    const state = sideWith('orc', []);
    for (const id of ['goblin', 'deathknight', 'dragon', 'peon']) {
      const u = spawnUnit(state, 0, id, 12, 12);
      expect(exorcises(state, u), `${id} is not an exorcist`).toBe(false);
    }
  });

  it('counts a group as readily as one', () => {
    const state = sideWith('human', []);
    const pair = spawnUnit(state, 0, 'paladin', 10, 10);
    // Whatever the group variant of a Paladin is called, it exorcises: the
    // table is keyed on the creature's base rather than on the stack size.
    expect(couldExorcise(pair.type)).toBe(true);
    expect(unitType(pair.type).base).toBe('paladin');
  });

  it('lists the ones a side has standing', () => {
    const state = sideWith('human', []);
    spawnUnit(state, 0, 'paladin', 10, 10);
    spawnUnit(state, 0, 'footman', 11, 10);
    spawnUnit(state, 1, 'paladin', 20, 10);
    const ours = exorcistsOf(state, 0);
    expect(ours).toHaveLength(1);
    expect(unitType(ours[0].type).base).toBe('paladin');
  });

  /** A lever, so a sweep can hold an arm with no answer to the Unbound. */
  it('can be switched off whole', () => {
    const state = sideWith('human', []);
    const u = spawnUnit(state, 0, 'paladin', 10, 10);
    EXORCISM.enabled = false;
    try {
      expect(exorcises(state, u)).toBe(false);
    } finally {
      EXORCISM.enabled = true;
    }
  });
});

describe('the Bone-Speaker', () => {
  it('is the Horde’s, and behind the advance the bible gives it', () => {
    const tech = TECHS.find((t) => t.id === 'bone-speaker');
    expect(tech, 'the advance the bible writes out in full').toBeTruthy();
    expect(tech!.faction).toBe('orc');
    expect(tech!.cost).toBe(140);
    expect(tech!.prereqs).toContain('dead-messed-up');
    expect(tech!.units).toContain('orc-shaman');
  });

  /**
   * Written as the Death Knight's opposite: *"living, not armored-undead,
   * marked as doing the unpopular 'send them back' job rather than the
   * 'command them' one."* Same tier and role, and it must not quietly be a
   * better Death Knight than the Death Knight.
   */
  it('is the Death Knight’s opposite rather than its replacement', () => {
    const shaman = unitType('orc-shaman');
    const knight = unitType('deathknight');
    expect(shaman.role).toBe(knight.role);
    expect(shaman.faction).toBe('orc');
    // Trades attack for defence, and does not take the other one's trick.
    expect(shaman.attack).toBeLessThan(knight.attack);
    expect(shaman.defense).toBeGreaterThan(knight.defense);
    expect(shaman.executeChance ?? 0).toBe(0);
  });
});
