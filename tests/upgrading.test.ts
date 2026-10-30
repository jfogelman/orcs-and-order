import { afterEach, describe, expect, it } from 'vitest';
import { createGame, findCity, spawnUnit } from '../src/sim/gamestate';
import { foundCity } from '../src/sim/city';
import { deserialize, serialize } from '../src/persist/save';
import {
  UPGRADES,
  applyUpgrades,
  branchGivenUp,
  rivalBranch,
  upgradeHeld,
  UPGRADES_BY_ID,
} from '../src/model/upgrades';
import { buyUpgrade, upgradeBlocked, upgradeFee } from '../src/sim/upgrading';
import { knowsEverything, researchableTechs } from '../src/sim/research';
import { runAiTurn } from '../src/ai/ai';
import { abilityNotes } from '../src/ui/pedia';
import { unitType } from '../src/model/units';
import { TECHS, techsForFaction } from '../src/model/techs';
import { techInPlay } from '../src/sim/research';
import type { GameState } from '../src/model/types';

/**
 * Section 155 slice 4: the mechanism.
 *
 * Slice 2 was the thirty-six upgrades as data and slice 3 was their art. This
 * is the part that makes a unit carry one: the branch locking empire-wide, the
 * fee for a creature already standing, and the free current model out of a
 * city that has just built one.
 *
 * **Nothing here tests an effect**, because no upgrade has one yet -- that is
 * slice 5. What is tested is that a unit can come to carry an upgrade by each
 * of the two routes, that it cannot come to carry two of a family, and that
 * turning the whole thing on does not move the game underneath the numbers
 * every other test in this suite was measured on.
 */

/** Put the lever back, so a file that runs after this one gets the real game. */
afterEach(() => {
  UPGRADES.enabled = false;
});

function game(): GameState {
  const state = createGame({
    seed: 155,
    width: 30,
    height: 20,
    barbarians: false,
    playerFaction: 'orc',
    opponents: ['human'],
    upgrades: true,
  });
  state.terrain.fill('grass');
  state.units.length = 0;
  state.cities.length = 0;
  return state;
}

describe('the branch is empire-wide and permanent', () => {
  it('shuts the other door the moment one is taken', () => {
    expect(branchGivenUp(['losing-it'], 'standing-still-on-purpose')).toBe(true);
    expect(branchGivenUp(['standing-still-on-purpose'], 'losing-it')).toBe(true);
    // Neither taken: both still open, which is the state a game starts in.
    expect(branchGivenUp(['doing-this-before'], 'losing-it')).toBe(false);
    // The linear upgrade gives nothing up, so it is never shut out.
    expect(rivalBranch(UPGRADES_BY_ID['orc-veteran'])).toBeNull();
    expect(branchGivenUp(['losing-it', 'standing-still-on-purpose'], 'doing-this-before')).toBe(false);
  });

  it('takes the shut branch out of what can be researched', () => {
    const state = game();
    const p = state.players[0];
    p.techs = [...p.techs, 'doing-this-before', 'losing-it'];
    const open = researchableTechs(p).map((t) => t.id);
    expect(open, 'the branch taken is known, so not offered').not.toContain('losing-it');
    expect(open, 'the branch given up is gone for good').not.toContain('standing-still-on-purpose');
  });

  /**
   * **The trap slice 2 fell into, in a new shape.**
   *
   * Slice 2 added thirty-six advances and `knowsEverything` counted them, so a
   * side that had been omniscient silently stopped being and a fixture moved
   * with the lever off. `techInPlay` fixed that.
   *
   * With the lever *on*, the same function has the same problem for a new
   * reason: twelve of the thirty-six advances are branches nobody may ever
   * learn, so an empire that has learned everything it is allowed to learn
   * would still be one short per family, forever. Omniscience would become
   * unreachable in any game with the box ticked, which is not a rule anybody
   * asked for and would not show up as a failure anywhere.
   */
  it('still lets an empire know everything, with the box ticked', () => {
    const state = game();
    const p = state.players[0];
    expect(UPGRADES.enabled, 'the lever follows the settings').toBe(true);
    // Learn everything the tree will ever offer this side: every advance in
    // play, except the second branch of each family, which the first shuts.
    for (const t of techsForFaction(p.faction).filter(techInPlay)) {
      if (branchGivenUp(p.techs, t.id)) continue;
      p.techs.push(t.id);
    }
    expect(researchableTechs(p), 'nothing left to study').toEqual([]);
    expect(knowsEverything(p), 'and that is omniscience').toBe(true);
  });
});

describe('what an empire builds now', () => {
  it('prefers the branch it took over the rung it climbed', () => {
    expect(upgradeHeld([], 'orc')).toBeNull();
    expect(upgradeHeld(['doing-this-before'], 'orc')?.id).toBe('orc-veteran');
    expect(upgradeHeld(['doing-this-before', 'losing-it'], 'orc')?.id).toBe('orc-berserker');
  });

  it('knows nothing about a creature the bible has not reached', () => {
    // The three newer factions and the ships have their own doc and are not in
    // this slice; asking must be null rather than throwing.
    expect(upgradeHeld(TECHS.map((t) => t.id), 'grub')).toBeNull();
  });
});

describe('paying for one already standing', () => {
  function town(): { state: GameState; unitId: number } {
    const state = game();
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    foundCity(state, peon);
    const orc = spawnUnit(state, 0, 'orc', 5, 5, false);
    state.players[0].techs = [...state.players[0].techs, 'doing-this-before'];
    state.players[0].gold = 500;
    return { state, unitId: orc.id };
  }

  it('turns an orc into a veteran for gold', () => {
    const { state, unitId } = town();
    const orc = state.units.find((u) => u.id === unitId)!;
    const fee = upgradeFee(state, orc);
    expect(fee, 'costs something').toBeGreaterThan(0);
    expect(upgradeBlocked(state, orc)).toBeNull();
    const before = state.players[0].gold;
    expect(buyUpgrade(state, orc)).toBe(true);
    expect(orc.upgrade).toBe('orc-veteran');
    expect(state.players[0].gold).toBe(before - fee);
    // And it is the rest of its turn, the same price `resupply` charges.
    expect(orc.moves).toBe(0);
  });

  it('refuses it twice, and refuses it for nothing', () => {
    const { state, unitId } = town();
    const orc = state.units.find((u) => u.id === unitId)!;
    buyUpgrade(state, orc);
    expect(upgradeBlocked(state, orc), 'already the current model').not.toBeNull();
    expect(buyUpgrade(state, orc)).toBe(false);
  });

  it('refuses it in the field, and refuses it without the gold', () => {
    const { state, unitId } = town();
    const orc = state.units.find((u) => u.id === unitId)!;
    orc.x = 12;
    orc.y = 12;
    expect(upgradeBlocked(state, orc), 'no city of its own').toMatch(/city/i);
    orc.x = 5;
    orc.y = 5;
    state.players[0].gold = 0;
    expect(upgradeBlocked(state, orc)).toMatch(/gold/i);
    expect(buyUpgrade(state, orc)).toBe(false);
    expect(orc.upgrade).toBeUndefined();
  });

  it('is cheaper than buying a whole new one', () => {
    // The point of the split: improving what you have beats replacing it, or
    // nobody would ever pay this instead of rushing a fresh unit.
    const { state, unitId } = town();
    const orc = state.units.find((u) => u.id === unitId)!;
    const city = findCity(state, state.cities[0].id)!;
    city.producing = { kind: 'unit', id: 'orc' };
    city.shields = 0;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expect(upgradeFee(state, orc)).toBeLessThan(900);
  });

  it('charges nothing at all when the box is unticked', () => {
    const state = createGame({ seed: 155, width: 30, height: 20, barbarians: false });
    expect(UPGRADES.enabled, 'off is the default').toBe(false);
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    foundCity(state, peon);
    const orc = spawnUnit(state, 0, 'orc', 5, 5, false);
    state.players[0].techs = [...state.players[0].techs, 'doing-this-before'];
    state.players[0].gold = 500;
    expect(upgradeBlocked(state, orc), 'there is no such thing in this game').not.toBeNull();
    expect(buyUpgrade(state, orc)).toBe(false);
  });
});

describe('the lever and the save', () => {
  it('comes back on when a game that had it is reopened', () => {
    const state = game();
    expect(state.settings.upgrades).toBe(true);
    const text = serialize(state);
    UPGRADES.enabled = false;
    const back = deserialize(text);
    expect(back.settings.upgrades).toBe(true);
    expect(UPGRADES.enabled, 'loading a save is enough to get its rules').toBe(true);
  });

  it('comes back off for a save written without it', () => {
    const plain = createGame({ seed: 155, width: 30, height: 20, barbarians: false });
    const text = serialize(plain);
    UPGRADES.enabled = true;
    deserialize(text);
    expect(UPGRADES.enabled).toBe(false);
  });

  it('takes the lever as the default, so a sweep gets the arm it asked for', () => {
    UPGRADES.enabled = true;
    const swept = createGame({ seed: 155, width: 30, height: 20, barbarians: false });
    expect(swept.settings.upgrades, 'control.ts set the lever, not the option').toBe(true);
    expect(UPGRADES.enabled).toBe(true);
    applyUpgrades({});
    expect(UPGRADES.enabled).toBe(false);
  });
});

describe('the AI actually does it', () => {
  /**
   * **Reachability, which is the thing this project keeps getting wrong.**
   *
   * Four mechanics -- the Burrower-caste, the spy, the unseen agent and the
   * reform sites -- shipped working and were never once used by an AI, so
   * every sweep of them returned identical numbers on both arms having
   * measured nothing. A fee the AI never pays is the same bug wearing gold.
   */
  it('pays to upgrade a garrison that was standing still anyway', () => {
    const state = game();
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    foundCity(state, peon);
    const orc = spawnUnit(state, 0, 'orc', 5, 5, false);
    orc.order = 'fortified';
    const p = state.players[0];
    p.techs = [...p.techs, 'doing-this-before'];
    p.gold = 1000;
    runAiTurn(state, 0);
    expect(orc.upgrade, 'the AI found the gold and the unit').toBe('orc-veteran');
  });

  it('leaves the field army alone', () => {
    const state = game();
    const peon = spawnUnit(state, 0, 'peon', 5, 5, false);
    foundCity(state, peon);
    const orc = spawnUnit(state, 0, 'orc', 5, 5, false);
    orc.order = 'none';
    const p = state.players[0];
    p.techs = [...p.techs, 'doing-this-before'];
    p.gold = 1000;
    runAiTurn(state, 0);
    // Not fortified, so it was on its way somewhere and `buyUpgrade` would
    // have cost it the turn. It can pay next time it stops.
    expect(orc.upgrade).toBeUndefined();
  });
});

describe('what the book says about it', () => {
  it('tells a creature’s card what it can become, when the box is ticked', () => {
    UPGRADES.enabled = true;
    const notes = abilityNotes(unitType('orc'));
    expect(notes.join(' ')).toContain('Orc Veteran');
    expect(notes.join(' '), 'and that the two roads are exclusive').toMatch(/never both/);
    expect(notes.join(' ')).toContain('Orc Berserker');
  });

  it('says nothing at all when it is not', () => {
    UPGRADES.enabled = false;
    expect(abilityNotes(unitType('orc')).join(' ')).not.toContain('Orc Veteran');
  });

  it('says nothing for a creature with no upgrades written yet', () => {
    UPGRADES.enabled = true;
    // The three newer factions are slice 6 and their bible is separate; a
    // caste must not get half a sentence about a road that does not exist.
    expect(abilityNotes(unitType('fodder')).join(' ')).not.toMatch(/improved to/);
  });
});
