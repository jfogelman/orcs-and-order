import { BUILDINGS, BUILDING_IDS } from '../model/buildings';
import type { BuildingDef } from '../model/buildings';
import { FACTIONS, rivalFactions } from '../model/factions';
import { TERRAIN, TERRAIN_IDS } from '../model/terrain';
import type { TerrainDef, TerrainSpecial } from '../model/terrain';
import { SPECIALS } from '../model/terrain';
import { TECHS, TECHS_BY_ID } from '../model/techs';
import type { TechFlag } from '../model/techs';
import { CREATURES, CREATURES_BY_ID, UNIT_TYPES, unitType } from '../model/units';
import type { CreatureDef, UnitTypeDef } from '../model/units';
import type { FactionId, GameState, Player, UnitTypeId } from '../model/types';
import { SpriteCache } from '../render/spriteCache';
import { escapeHtml, openModal } from './dom';
import { controlsMarkup } from './controls';
import { BARBARIANS, PREY, RAIDER_TIERS, raidPace } from '../sim/barbarians';
import { LEGION, RAIDER_GRUNT } from '../sim/wilds';
import { RUINS, WARDENS } from '../sim/ruins';
import { COWED } from '../sim/status';
import { HIVEKIN, QUEEN } from '../sim/hivekin';
import { ARRIVALS } from '../sim/arrivals';
import { BURROW, burrows } from '../sim/burrow';
import { DIFFICULTIES, difficultyOf } from '../sim/difficulty';
import { MOODS, PEACE, STANDING } from '../sim/diplomacy';
import { RISK_BANDS, SPY, SPY_ACTIONS } from '../sim/spying';
import { UNSEEN } from '../sim/unseen';
import { SABOTAGE } from '../sim/sabotage';
import { ROADS } from '../sim/roads';
import { TRADE } from '../sim/trade';
import { POSTS } from '../sim/posts';
import { CITY_DAMAGE, CIVIC_PRIDE, POSTING } from '../sim/city';
import { ALT_VICTORY } from '../sim/endings';
import { FOLLIES } from '../sim/follyEffects';
import { TERRAFORM, jobName } from '../sim/terraform';

/**
 * The Orcpedia: what everything is, what it costs, and what unlocks it.
 *
 * Reachable from any unit's name, so the answer to "what *is* this thing"
 * is always one click away rather than something you infer from losing.
 */

let sprites: SpriteCache | null = null;

/**
 * Point straight at the artwork on disk rather than at the sprite cache.
 *
 * Asking the cache would hand back whatever is loaded at this instant, which
 * for a unit not yet seen on the map is the procedural placeholder -- so the
 * encyclopedia would show placeholder art for the very units the player has
 * not met and most wants to look up. A missing file falls back to the
 * placeholder in `onMount` instead.
 */
function artPath(creatureId: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}units/${creatureId}.png`;
}

/** Icons for the non-unit tabs, all of which are already on disk. */
function assetPath(folder: string, name: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}${folder}/${name}.png`;
}

/** The procedural drawing, for when there is no artwork to point at. */
function placeholderFor(id: UnitTypeId): string {
  if (!sprites) sprites = new SpriteCache();
  const art = sprites.unit(id) as HTMLCanvasElement;
  return typeof art.toDataURL === 'function' ? art.toDataURL() : '';
}

/**
 * What a special is actually worth, written as a gain.
 *
 * The rule is that a special **replaces** the tile's yields rather than adding
 * to them, which is not what "bonus" leads anybody to expect -- so the numbers
 * shown are the ones the tile really produces, and this says what changed. As
 * it happens every special is a strict improvement, so there is never a minus
 * sign here, but the sum is done rather than assumed.
 */
function specialGain(t: TerrainDef, sp: TerrainSpecial): string {
  const parts: string[] = [];
  const say = (label: string, from: number, to: number) => {
    if (to !== from) parts.push(`${to > from ? '+' : ''}${to - from} ${label}`);
  };
  say('food', t.food, sp.food);
  say('shields', t.shields, sp.shields);
  say('trade', t.trade, sp.trade);
  const movedYields = parts.length > 0;
  // A special that is a rule rather than a number says so -- and says only
  // that, since "instead of 2/1/0" in front of it is naming yields that did not
  // move and reads as though they had.
  if (sp.defense !== undefined && sp.defense !== t.defense) {
    parts.push(`defence x${sp.defense} rather than x${t.defense}`);
  }
  if (!movedYields) return parts.join(', ');
  // A literal dash, not an entity: this string is escaped on the way out, so
  // an entity here would reach the player as the characters "&mdash;".
  return parts.length ? `instead of ${t.food}/${t.shields}/${t.trade} — ${parts.join(', ')}` : '';
}

/** Which advance makes this unit buildable, if any. */
function unlockedBy(id: UnitTypeId): string | null {
  const tech = TECHS.find((t) => t.units.includes(id));
  return tech ? tech.name : null;
}

/**
 * The advance carrying a rule flag, by name.
 *
 * Prose that names an advance should read it off the tree rather than spell it
 * out, or renaming one leaves the book describing an advance that no longer
 * exists -- the same drift `buildingEffects` avoids by reading off the data.
 */
function techNamed(flag: TechFlag, fallback = 'a later advance'): string {
  return TECHS.find((t) => t.flags.includes(flag))?.name ?? fallback;
}

function withArticle(name: string): string {
  return /^[AEIOU]/i.test(name) ? `an ${name}` : `a ${name}`;
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * Who can actually put a missile into this piece of artillery, by name.
 *
 * Read off the same two predicates `targetsFor` uses, because the surprising
 * half of the rule is not that a magazine runs dry -- it is **who is allowed to
 * fill it**. A ballista is fed by the archery line and nobody else, so a player
 * who parks one behind a wall of footmen cannot reload it and was never told
 * why. A catapult is fed by whoever is standing closest and least able to
 * argue, and does not give them back.
 */
function feedersFor(def: UnitTypeDef): string[] {
  const wants =
    def.reloadsBy === 'sacrifice'
      ? (c: CreatureDef) => c.expendable === true
      : (c: CreatureDef) => (c.firstStrikes ?? 0) > 0;
  return CREATURES.filter((c) => !c.wild && c.faction === def.faction && wants(c)).map((c) =>
    withArticle(c.name),
  );
}

/**
 * The artillery this unit could put a missile into, by name.
 *
 * The other half of the same gap. Knowing that a ballista is fed only by the
 * archery line is no use if it is written on the ballista alone -- the player
 * deciding what to build next is reading the *archer*, whose card said nothing
 * whatsoever. It is also the funnier half, since what the card has to tell a
 * goblin is that it is ammunition.
 */
function feedsWhat(def: UnitTypeDef): string[] {
  if (def.ammo > 0 || def.settler || def.sails) return [];
  return CREATURES.filter((c) => {
    if (c.wild || c.faction !== def.faction) return false;
    const gun = UNIT_TYPES[c.id];
    if (gun === undefined || gun.ammo <= 0) return false;
    return gun.reloadsBy === 'sacrifice' ? def.expendable : def.firstStrikes > 0;
  }).map((c) => withArticle(c.name));
}

/**
 * Everything this unit can do that the four numbers above it do not say.
 *
 * Written out rather than left as icons: a player who cannot find out that a
 * sapper detonates, or that an axethrower is ruined by throwing its axe, will
 * read both as the unit being broken.
 *
 * Exported for the tests. The rest of this module draws HTML and wants a
 * document; this is the part with rules in it, and the rules are what want
 * holding to account.
 */
export function abilityNotes(def: UnitTypeDef): string[] {
  const notes: string[] = [];
  if (def.settler) notes.push('founds cities');
  // Section 136: and the one that digs is not always the one that founds.
  if (def.works) notes.push('builds roads and improves the ground');
  // Section 137: **a spy's card said nothing a spy does.** Eight rungs of
  // ladder shipped over sections 136's slices and every word about them lived
  // in the Espionage pane, so the entry for the unit itself showed A0 D1 and a
  // joke -- which reads as a broken soldier. Summarised here, in order of what
  // it costs to try, with the details one click away.
  if (def.spy) {
    notes.push('never fights: no attack at all, so there is no way to use one as a bad soldier');
    // Risk order, read off the table, so a rung added later lands in the right
    // place here without anybody remembering to come and move it.
    const ready = Object.values(SPY_ACTIONS)
      .filter((a) => a.ready && a.risk > 0)
      .sort((a, b) => a.risk - b.risk)
      .map((a) => a.verb);
    notes.push(
      `beside somebody else’s town: ${ready.join(', ')} — in that order of risk, and some of them behind their own advance`,
    );
    notes.push(
      'beside somebody else’s soldier, it can walk up and make an offer — priced in gold rather than in risk, because a refusal names you for certain',
    );
    notes.push(
      'anywhere at all it can search the ground for other sides’ agents, which is the one order that risks nothing',
    );
    // **Low tier only**, and the card said it of both for one run of the
    // probe. A hidden agent cannot wear colours -- `canDisguise` refuses it,
    // and there is nobody to show them to -- so the entry for the expensive
    // unit was offering an order that does not exist, two lines above the one
    // explaining why it cannot.
    if (!def.hidden) {
      notes.push(
        'can wear somebody’s colours — your own, so nobody can tell which soldier is looking, or theirs, so their armies leave it alone',
      );
    }
    notes.push(
      'every order says what it risks before you give it, and only being caught tells the other side whose it was',
    );
    // Section 138: and now there are two tiers, so the card has to say which
    // one it is holding. The low tier is *seen the whole time* -- a disguise
    // is an answer to "what am I looking at". The high tier is the answer to
    // "can I see it", and the two notes are written against each other on
    // purpose.
    if (def.hidden) {
      notes.push(
        'nobody else can see it at all: it is not drawn on their map, and no disguise is needed or possible',
      );
      notes.push(
        'it does not block anybody — walk onto the tile and you find it, which costs that unit the rest of its turn and leaves the agent in plain sight to you until it moves',
      );
      notes.push(
        'found for good by a searching agent or a town paying attention, and by that side only — everybody else goes on not seeing it at all',
      );
    } else {
      notes.push(
        'it is in plain sight throughout: a disguise changes who they think it belongs to, never whether they can see it standing there',
      );
    }
  }
  // Section 137: Sink and Burrow were written up in the Hive's rules and
  // nowhere else, so the one unit they are about had a card that did not
  // mention the ground.
  if (burrows({ type: def.id })) {
    notes.push(
      `Sink (G) takes it under the ground where it stands: nobody else can see it and it blocks nobody — but the disturbed dirt shows something went down, until ${techNamed('quiet-sinking')} teaches it to leave none`,
    );
    notes.push(
      `Burrow (Shift+G) crosses up to ${BURROW.range} tiles through whatever is in the way — a wall, a river, an army — and comes up on free ground beyond (${BURROW.deepRange} once ${techNamed('deep-burrowing')} is known)`,
    );
    notes.push(
      `with ${techNamed('ambush-burrowing')}, coming up next to somebody is worth ×${BURROW.ambush} on the blow it strikes that turn`,
    );
    notes.push('both cost the whole turn, so it cannot hit somebody and vanish in the same breath');
    notes.push(
      'walk onto a tile with one under it and you find it out: it is pushed clear and loses its turn, and with nowhere to go it stays down',
    );
  }
  if (def.flies) notes.push('flies over anything, at no extra cost');
  if (def.siegeBonus > 1) notes.push(`×${def.siegeBonus} attacking a city`);
  if (def.range > 1) {
    notes.push(
      `strikes from exactly ${def.range} tiles for a few rounds, and is not struck back — costs the whole turn`,
    );
  }
  // Section 137: **what "ranged" has meant since section 38, written down at
  // last.** An Archer, an Axethrower and a Spitter-caste are all marked
  // `role: 'ranged'` and none of them shoots from a distance -- they walk up
  // and fight like everything else, and the whole of the difference is a free
  // opening blow. A card showing A4 D1 beside a Footman's A3 D2 made a ranged
  // unit read as a worse soldier with a misleading label, which is precisely
  // backwards: the free round is worth more than the point of attack.
  if (def.firstStrikes > 0) {
    const blows = def.firstStrikes === 1 ? 'one free blow' : `${def.firstStrikes} free blows`;
    notes.push(
      `strikes first: ${blows} at the start of every fight, before anything can hit back — whether it attacks or is attacked`,
    );
    notes.push(
      'only the difference counts, so against something else that strikes first they simply fight',
    );
    // The counting ladder makes this one worth saying out loud: health does not
    // scale with a group and neither does this, so the instinct that ten of
    // them get ten free blows is wrong in the direction that loses battles.
    //
    // Keyed to the *creature* having a ladder rather than to this entry being
    // a group, because the book only ever draws the single and hangs the
    // ladder off it as chips -- a note written for `count > 1` would have been
    // perfectly correct and never once rendered.
    if ((CREATURES_BY_ID[def.base]?.counts.length ?? 1) > 1) {
      notes.push(
        'however many of them stand together it is still the one opening blow — it simply lands harder',
      );
    }
  }
  // Section 125: artillery carries a magazine, runs dry, and is fussy about who
  // refills it -- and not one word of that was anywhere in the game. The card
  // said it strikes from two tiles and stopped, so a ballista standing empty
  // behind a line of footmen read as a unit that had simply broken.
  if (def.ammo > 0) {
    notes.push(
      `carries ${def.ammo} missiles and starts loaded — with the magazine empty it cannot strike at range at all`,
    );
    const feeders = listOf(feedersFor(def));
    if (def.reloadsBy === 'sacrifice') {
      notes.push(
        feeders
          ? `reloaded in the field by feeding it ${feeders} from the next tile, who is eaten doing it — and a group loads one missile for each of them`
          : 'cannot be reloaded in the field: nothing on this side is expendable enough',
      );
    } else {
      notes.push(
        feeders
          ? `reloaded in the field by ${feeders} standing next to it, which costs that unit its whole turn — and nobody else can do it`
          : 'cannot be reloaded in the field: nobody on this side makes missiles',
      );
    }
    notes.push(
      'beside a city of yours, Resupply fills the whole magazine instead, for the rest of the turn',
    );
  }
  if (def.throwsWeapon) {
    notes.push(
      'throws harder than it swings, but has only the one axe: afterwards it fights at a quarter strength until it reaches a friendly city or kills somebody',
    );
  }
  if (def.healsTo > 0) {
    // The card is the single-creature one, but the interesting fact is that
    // the heal scales -- a pair finish the job a lone one leaves half done.
    const counts = CREATURES_BY_ID[def.base]?.counts ?? [1];
    const biggest = UNIT_TYPES[`${def.base}_x${counts[counts.length - 1]}`];
    const scales =
      def.count === 1 && biggest !== undefined && biggest.healsTo > def.healsTo
        ? ` — ${biggest.name} take them all the way to ${Math.round(biggest.healsTo * 100)}%`
        : '';
    notes.push(
      `patches up a neighbour to ${Math.round(def.healsTo * 100)}% of their health, for the whole turn${scales}`,
    );
  }
  if (def.lineBreath) {
    notes.push('breath carries into the tile behind the target — including your own units');
  }
  if (def.explodes > 0) {
    notes.push(
      `killed defending, it detonates for ${Math.round(def.explodes * 100)}% of the health of everything adjacent — friend and enemy alike`,
    );
  }
  if (def.demolishes) notes.push('brings a city’s walls down, and goes with them');
  if (def.executeChance > 0) {
    notes.push(
      `${Math.round(def.executeChance * 100)}% chance to finish off a defender already under half health, if it is no larger`,
    );
  }
  const feeds = feedsWhat(def);
  if (feeds.length > 0) {
    const eaten = Object.values(UNIT_TYPES).some(
      (gun) => gun.ammo > 0 && gun.faction === def.faction && gun.reloadsBy === 'sacrifice',
    );
    notes.push(
      eaten
        ? `can be loaded into ${listOf(feeds)} standing next to it, which is the end of it — and a group of them loads one missile each`
        : `can hand a missile to ${listOf(feeds)} standing next to it, at the cost of its own whole turn`,
    );
  }
  if (def.regenMultiplier > 1) notes.push(`heals ${def.regenMultiplier}× as fast as anything else`);
  // Only where it can actually bite. `effectiveMove` floors at one, so a group
  // of something that moves one loses nothing to disagreement -- and promising
  // a penalty that cannot happen is worse than saying nothing. True of Five
  // Goblins since the ladder was built, and of every Hivekin group, which is
  // the whole of their version of the joke: ten of them were always one
  // thought, and the card should not claim otherwise.
  if (def.crowded && def.move > 1) {
    notes.push('−1 movement until coordinated: too many of them, nobody agreeing');
  }
  return notes;
}

/**
 * What a structure actually does, in words.
 *
 * The blurbs are jokes and the cost is a number; between them a player had no
 * way to find out that Walls stop mattering the moment a siege engine turns
 * up, or that a Broken Catapult does nothing whatsoever for a garrison that
 * stays put. Read off the data so it cannot drift from the rules.
 */
function buildingEffects(b: BuildingDef): string[] {
  const out: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  if (b.defenseMult !== undefined && b.defenseMult !== 1) {
    out.push(
      `×${b.defenseMult} defence for units in this city` +
        (b.negatedBySiege
          ? ' — but a siege engine ignores it entirely'
          : ', and a siege engine cannot ignore it'),
    );
  }
  if (b.sallyBonus) {
    out.push(
      `+${pct(b.sallyBonus)} attack for a unit attacking out of this city — and nothing whatsoever for one that sits still`,
    );
  }
  if (b.suppliesArmy) {
    out.push(
      'links this city into your supply chain, so units nearby fight at full strength and heal',
    );
    out.push(
      'must be within reach of somewhere already supplied — a depot with nothing behind it carries nothing',
    );
    out.push(
      'costs more the further it is from your capital',
    );
  }
  // Said first, because it is the condition on everything below it.
  if (b.needsGarrison) {
    out.push('pays nothing at all unless a unit is standing in the city');
  }
  // A city holds one unit, so a building that wants several counts the tiles
  // around it too. It never said it wanted soldiers at all until section 101.
  if (b.garrisonNeeded) {
    out.push(
      `pays nothing at all unless ${b.garrisonNeeded} soldiers stand in the city or right beside it`,
    );
  }
  if (b.goldBonus) out.push(`+${pct(b.goldBonus)} gold from this city`);
  // Section 106: a gold building is also one end of a trade route, which is
  // worth knowing while deciding where the second one goes.
  if (b.goldBonus) out.push('anchors a trade route: a road to another city with one pays gold');
  if (b.scienceBonus) out.push(`+${pct(b.scienceBonus)} research from this city`);
  if (b.contentBonus) {
    out.push(`${b.contentBonus} more content citizens, holding off disorder`);
  }
  if (b.foodKept) out.push(`keeps ${pct(b.foodKept)} of the food store each time the city grows`);
  if (b.veteranUnits) out.push('land units built here start as veterans');
  // Section 111: what a folly is, then what this one does.
  if (b.folly === 'world') out.push('a folly: only one in the whole game, and whoever finishes it first has it');
  if (b.folly === 'faction') out.push('a folly: one per empire, torn down if its city falls to the other side');
  if (b.folly) out.push('never bought with gold, never sold, never sacked; shields put into it are kept if the city switches');
  if (b.citySight) {
    out.push(`+${b.citySight} sight for this city${b.sightUnblocked ? ', seeing over hills and forest alike' : ''}`);
  }
  if (b.empireContent) out.push(`+${b.empireContent} content citizen in every city you hold`);
  if (b.spellTurnsMult) out.push(`burning and freezing from your magic last ${b.spellTurnsMult} times as long`);
  if (b.builtAttack) out.push(`units built here get +${b.builtAttack} attack, for good`);
  if (b.builtRanks) out.push(`units built here start ${b.builtRanks} rank higher, up to the top rank`);
  if (b.builtReach) out.push(`mages built here may also strike from ${b.builtReach} tile further away`);
  if (b.bargainTakes) {
    out.push(`a Dark Bargain takes ${Math.round(b.bargainTakes * 100)}% of the donor's health rather than half, for the same healing`);
  }
  if (b.homeMoves) out.push(`+${b.homeMoves} movement for a unit that starts its turn on your own land`);
  if (b.mountedDefense) out.push(`+${b.mountedDefense} defence for Outriders, Knights and Paladins`);
  if (b.unitSight) out.push(`+${b.unitSight} sight for every unit you have`);
  if (b.empireContent || b.spellTurnsMult || b.bargainTakes || b.homeMoves || b.mountedDefense || b.unitSight) {
    out.push('works for the whole empire, from whichever city holds it');
  }
  return out;
}

function unitCard(def: UnitTypeDef): string {
  const tech = unlockedBy(def.id);
  const notes = abilityNotes(def);

  return `
    <div class="pedia-card" id="pedia-${escapeHtml(def.id)}">
      <img class="pedia-art" src="${artPath(def.base)}" data-unit="${escapeHtml(def.id)}" alt="" />
      <div class="pedia-body">
        <div class="pedia-name">${escapeHtml(def.name)}</div>
        <div class="pedia-stats">
          <span title="Attack">A ${def.attack}</span>
          <span title="Defence">D ${def.defense}</span>
          <span title="Health">HP ${def.hp}</span>
          <span title="Movement">M ${def.move}</span>
          <span title="Shield cost">${def.cost}s</span>
        </div>
        ${tech ? `<div class="pedia-tech">Needs ${escapeHtml(tech)}</div>` : ''}
        ${
          notes.length
            ? `<ul class="pedia-notes">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
            : ''
        }
        <div class="pedia-flavor">${escapeHtml(def.blurb)}</div>
      </div>
    </div>`;
}

/**
 * Everything wild, in the one pane that is about wild things.
 *
 * **They were in no roster at all.** Every other list filters on
 * `!c.wild` -- correctly, since a raiding party is not something the Horde can
 * put in a queue -- and nothing picked them up afterwards. So nine creatures a
 * player can be killed by had no entry, and `openPedia(…, 'sentinel')` sent
 * them to the Kingdom's pane looking for an anchor that was never written,
 * which is why the link out of the ruin dialog did nothing at all.
 *
 * Grouped, because "wild" covers three unrelated things: a band that walks at
 * you, something that drowned, and something standing in a doorway waiting.
 */
function wildSection(): string {
  // Read off the tables that define each group rather than three lists written
  // out again here, which would be three more places to forget.
  const wardens: string[] = Object.values(WARDENS);
  const sea: string[] = [LEGION.grunt.id, LEGION.elite.id, LEGION.leader.id];
  const land: string[] = [RAIDER_GRUNT, RAIDER_TIERS.elite.id, RAIDER_TIERS.leader.id];
  const groups: { title: string; of: (c: CreatureDef) => boolean }[] = [
    { title: 'Raiders', of: (c) => land.includes(c.id) },
    { title: 'What comes out of the sea', of: (c) => sea.includes(c.id) },
    { title: 'What stands in the ruins', of: (c) => wardens.includes(c.id) },
  ];
  const seen = new Set<string>();
  const parts = groups.map((g) => {
    const of = CREATURES.filter((c) => c.wild && g.of(c));
    for (const c of of) seen.add(c.id);
    return of.length === 0
      ? ''
      : `<h4 class="pedia-subhead">${g.title}</h4>${of.map((c) => unitCard(UNIT_TYPES[c.id])).join('')}`;
  });
  // Anything wild that no group claimed still gets an entry, or this fix would
  // quietly reintroduce the bug it exists to close the next time one is added.
  const rest = CREATURES.filter((c) => c.wild && !seen.has(c.id));
  if (rest.length > 0) {
    parts.push(
      `<h4 class="pedia-subhead">Other wild things</h4>${rest.map((c) => unitCard(UNIT_TYPES[c.id])).join('')}`,
    );
  }
  return parts.join('');
}

function creatureSection(faction: FactionId): string {
  // Wild things belong to nobody, so they are in neither roster. A raiding
  // party is not something the Horde can put in a queue -- they are in the
  // Wilds pane instead, via `wildSection`.
  const creatures = CREATURES.filter((c) => c.faction === faction && !c.wild);
  return creatures
    .map((c) => {
      const variants = c.counts.map((n) => UNIT_TYPES[n === 1 ? c.id : `${c.id}_x${n}`]);
      const base = variants[0];
      const ladder =
        variants.length > 1
          ? `<div class="pedia-ladder">${variants
              .map(
                (v) =>
                  `<span class="chip" title="${escapeHtml(v.name)}: A${v.attack} D${v.defense} HP${v.hp} ${v.cost}s">${v.count}</span>`,
              )
              .join('')}<span class="pedia-ladder-note">group sizes</span></div>`
          : '';
      return unitCard(base).replace('</div>\n    </div>', `${ladder}</div>\n    </div>`);
    })
    .join('');
}

/**
 * One topic in a long pane: a heading, and the paragraphs that belong under it.
 *
 * Section 137. **Three panes had grown into walls.** Diplomacy was twenty-three
 * consecutive `<p class="flavor">` with no heading between any of them, and by
 * the time espionage had eight rungs it was two unrelated subjects sharing one
 * scroll -- so the way to find out what sabotage costs was to read about peace
 * treaties until you reached it. The Wilds and the Hive's rules were going the
 * same way. A topic is the unit of looking something up, and the book did not
 * have one.
 */
interface Topic {
  /** The heading, and the words in the pane's own contents strip. */
  title: string;
  /** Already-built HTML. Empty means the topic is switched off, and it is dropped. */
  body: string;
}

/** The anchor a topic is reachable at, derived from its pane and its title. */
function topicId(pane: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `pedia-s-${pane}-${slug}`;
}

/**
 * A long pane written as topics, with a contents strip of its own at the top.
 *
 * The strip is the half that makes this worth doing: a heading helps somebody
 * who is already scrolling past it, and a list of the headings at the top is
 * what answers "is the answer to my question even in here". Topics with an
 * empty body are dropped from both, so a pane whose lever is off does not
 * advertise a heading that goes nowhere.
 */
function topicPane(pane: string, intro: string, topics: Topic[]): string {
  const live = topics.filter((t) => t.body.trim() !== '');
  const strip = live
    .map(
      (t) =>
        `<button class="pedia-toc-item" data-jump="${topicId(pane, t.title)}">${escapeHtml(
          t.title,
        )}</button>`,
    )
    .join('');
  const body = live
    .map(
      (t) => `
      <section class="pedia-topic" id="${topicId(pane, t.title)}">
        <h3 class="pedia-head">${escapeHtml(t.title)}</h3>
        ${t.body}
      </section>`,
    )
    .join('');
  return `${intro}<nav class="pedia-toc">${strip}</nav>${body}`;
}

/**
 * A link from the prose to another topic in the book.
 *
 * `onMount` finds whichever pane the anchor turns out to be in and switches to
 * it, so a cross-reference names the topic and nothing else. One that had to
 * name the pane as well would be a second thing to keep in step, and the pane
 * is the half that would go stale.
 */
function seeTopic(pane: string, title: string, text: string): string {
  return `<a href="#" class="pedia-link" data-jump="${topicId(pane, title)}">${escapeHtml(text)}</a>`;
}

/**
 * A link from the prose to a unit's or a building's own card.
 *
 * Resolved by the same `locate` that the `focus` argument goes through, so a
 * link written in the prose and a link arriving from outside the book cannot
 * land in two different places.
 */
function seeEntry(id: string, text?: string): string {
  const name = text ?? UNIT_TYPES[id]?.name ?? BUILDINGS[id]?.name ?? id;
  return `<a href="#" class="pedia-link" data-see="${escapeHtml(id)}">${escapeHtml(name)}</a>`;
}

/** A sub-heading inside a topic: the rungs of a ladder, and the like. */
function subhead(title: string): string {
  return `<h4 class="pedia-subhead">${escapeHtml(title)}</h4>`;
}

/**
 * The Hive's rules that are not on any card. Sections 125 and 137.
 *
 * Written here rather than left to the units, because none of them is a fact
 * about one creature: the Queen is a rule about a *city*, going to ground is a
 * rule about what enemies can see, and the Princesses are a rule about what
 * happens after something goes wrong. A player who meets the Hivekin and loses
 * a city to something that came up out of the floor deserves to be able to
 * look it up.
 *
 * **It opens by saying who everybody is**, which it did not. The first line
 * used to be "She does not move", with no antecedent for "she" anywhere above
 * it except a flavour blurb -- and nothing at all to say that a Hive is their
 * word for a city, that a caste is their word for a unit, that they are not on
 * the map when the game begins, or that they will not be talked to. Every rule
 * below assumes those four things.
 *
 * Shown in two places, so it is written in the third person throughout: the
 * Hivekin player's own pane and, for everybody else, the pane about them. One
 * of the two at a time, which is what lets the topic anchors be fixed.
 */
export const HIVE_RULES = topicPane(
  'hive',
  '',
  [
    {
      title: 'Who they are',
      body: `
  <p class="flavor">Their cities are <strong>Hives</strong> and their
  units are <strong>castes</strong> &mdash; one shape per job, grown rather than
  recruited &mdash; and there is exactly one <strong>Queen</strong>, who is the
  reason any of it works. When they are not on the map at the start of a game
  the ground simply opens somewhere nobody had claimed and they are there,
  with no explanation offered and none apparently required.</p>
  <p class="flavor">
  <strong>When that happens is not their rule any more.</strong> Section 139
  made arrival a fact about <em>the level and the order you picked your
  opponents in</em> rather than about the Hivekin, who used to be the only
  side that turned up late and now are simply whoever happens to be next in
  the queue &mdash; chosen as your only opponent they start on the map like
  anybody else. It is written up
  ${seeTopic('difficulty', 'Who turns up, and when', 'under Difficulty')}.</p>`,
    },
    {
      title: 'They will talk, and they want different things',
      body: `
  <p class="flavor">The Voice
  speaks for the Queen and attempts, throughout, an expression. They hold no
  grudges, take no view of anybody who has broken their word, and read one thing
  before anything else: whether they would survive the war. Much the weaker,
  they will take almost any peace; much the stronger, they are only mildly
  interested in carrying on. A treaty with them covers them and you and nobody
  else &mdash; whatever the other empire has signed, it has signed for itself.
  For the first ${HIVEKIN.grace} turns after they come up they cannot be
  attacked at all, which is the only courtesy in the arrangement and runs in
  their favour. How a table works at all is
  ${seeTopic('diplomacy', 'Where you stand', 'under Diplomacy')}.</p>`,
    },
    {
      title: 'Their ending is priced by how long they have had',
      body: `
  <p class="flavor">The
  three works cost less than either empire's ending, because a Hive pays for
  them out of fewer and smaller towns. The earlier they arrive, the more of the
  game they have to pay with, and the more the works cost &mdash; a Hive that
  had been there from the first turn would pay exactly what an empire pays.</p>`,
    },
    {
      title: 'She does not move',
      body: `
  <p class="flavor">The Queen sits in the first Hive and never
  leaves it. That Hive <em>makes nothing at all</em> while she is not in it &mdash;
  production there is a thing she is doing, not a thing it is doing.</p>`,
    },
    {
      title: 'Losing her is not the end, but it is a clock',
      body: `
  <p class="flavor">The Hive has
  ${QUEEN.countdown} turns to grow a replacement. A ${seeEntry('princess', 'Princess-caste')} standing
  in that Hive becomes the new Queen &mdash; walked in on the last turn still counts.
  If nobody does, the place is given up and everything the Hive owned stops taking
  instructions and starts wandering about on its own.</p>
  <p class="flavor"><strong>Spare Princesses are not wasted.</strong> Any others waiting when a new
  Queen is grown become part of that Hive instead, as shields, calm, study or coin
  &mdash; and <em>which</em> is decided then, not when they were built.</p>`,
    },
    {
      title: 'A Burrower-caste goes under the ground',
      body: `
  <p class="flavor"><em>Sink</em> (G) hides
  it where it stands: nobody else can see it, and it does not block anyone, but the
  disturbed dirt shows where something went down. <em>Burrow</em> (Shift+G) crosses up
  to ${BURROW.range} tiles <strong>through</strong> whatever is in the way &mdash; a
  wall, a river, an army &mdash; and comes up on free ground on the other side. Both
  cost the whole turn.</p>
  <p class="flavor">Walk onto a tile with one hiding under it and you find it out: it is pushed clear
  and loses its turn. With nowhere to be pushed, it stays down there. The
  advances that deepen it and sharpen it are on the
  ${seeEntry('burrower')}'s own card.</p>
  <p class="flavor"><strong>It is the only thing in the game that cannot be seen</strong>,
  which is worth holding apart from a spy in a disguise: a disguise is an
  answer to <em>what am I looking at</em>, and this is an answer to <em>can I
  see it at all</em>. ${seeTopic('espionage', 'Wearing somebody’s colours', 'The agents are the other case')}.</p>`,
    },
  ],
);

export function openPedia(state: GameState, player: Player, focus?: string): void {
  const faction = player.faction;
  // Everybody else, in order, rather than "the other one". The roster used to
  // be two tabs because there were two sides; a third would simply not have
  // been in the book at all, which is the one place a player goes to find out
  // what the thing that just appeared can do.
  const others: FactionId[] = rivalFactions(faction);
  /** The pane a creature of this faction lives in. */
  const paneFor = (f: FactionId) => (f === faction ? 'yours' : `them-${f}`);

  const techList = TECHS.filter((t) => t.faction === 'both' || t.faction === faction)
    .map(
      (t) => `
      <div class="pedia-tech-row">
        <img class="pedia-row-icon" src="${assetPath('tech', t.id)}" alt="" />
        <span class="pedia-tech-name">${escapeHtml(t.name)}</span>
        <span class="pedia-tech-cost">${t.cost === 0 ? 'known from the start' : `${t.cost} beakers`}</span>
        <span class="pedia-tech-needs">${
          t.prereqs.length
            ? escapeHtml(t.prereqs.map((p) => TECHS_BY_ID[p]?.name ?? p).join(' + '))
            : '&mdash;'
        }</span>
        <span class="pedia-flavor">${escapeHtml(t.flavor)}</span>
      </div>`,
    )
    .join('');

  const terrainList = TERRAIN_IDS.map((id) => {
    const t = TERRAIN[id];
    // Every special this ground can carry, not just the first: one art file
    // each, keyed by name, since a terrain may now offer several.
    const specials = t.specials
      .map(
        (sp, n) => `
          <div class="pedia-special">
            <img class="pedia-special-icon"
                 src="${assetPath('specials', n === 0 ? id : `${id}_${n + 1}`)}"
                 data-fallback="${assetPath('specials', n === 0 ? `${id}_1` : id)}" alt="" />
            <span class="pedia-special-name">${escapeHtml(sp.name)}</span>
            <span class="pedia-special-yield">${sp.food}/${sp.shields}/${sp.trade}</span>
            <span class="pedia-special-gain">${escapeHtml(specialGain(t, sp))}</span>
          </div>`,
      )
      .join('');
    return `
      <div class="pedia-tech-row">
        <img class="pedia-row-icon terrain" src="${assetPath('terrain', `${id}_0`)}" alt="" />
        <span class="pedia-tech-name">${escapeHtml(t.name)}</span>
        <span class="pedia-tech-cost">${t.food}/${t.shields}/${t.trade}</span>
        <span class="pedia-tech-needs">move ${t.moveCost} &middot; defence x${t.defense}</span>
        <span class="pedia-flavor">${t.water ? 'Land units cannot enter. Ships go nowhere else.' : ''}${
          t.noCity ? ' No cities here.' : ''
        }${t.blocksSight ? ' Blocks line of sight.' : ''}</span>
        ${specials}
      </div>`;
  }).join('');

  const buildingList = BUILDING_IDS.map((id) => BUILDINGS[id])
    .filter((b) => b.faction === 'both' || b.faction === faction)
    // A Posting pays nothing and is not offered while section 102's lever is off,
    // so listing one here is the same trap `buildOptions` refuses to set: an entry
    // for a building the player can never have, with no art to draw it by.
    .filter((b) => POSTING.enabled || !(b.garrisonNeeded && b.contentBonus))
    .map(
      (b) => `
      <div class="pedia-tech-row" id="pedia-b-${escapeHtml(b.id)}">
        <img class="pedia-row-icon" src="${assetPath('buildings', b.id)}" alt="" />
        <span class="pedia-tech-name">${escapeHtml(b.name)}</span>
        <span class="pedia-tech-cost">${b.cost}s &middot; ${b.upkeep}g/turn</span>
        <span class="pedia-tech-needs">${escapeHtml(
          TECHS.find((t) => t.buildings.includes(b.id))?.name ?? '&mdash;',
        )}</span>
        <span class="pedia-flavor">${escapeHtml(b.blurb)}</span>
        ${
          buildingEffects(b).length
            ? `<ul class="pedia-notes">${buildingEffects(b)
                .map((n) => `<li>${escapeHtml(n)}</li>`)
                .join('')}</ul>`
            : ''
        }
      </div>`,
    )
    .join('');

  // Section 137: the Wilds pane as topics. Nine subjects that had been one
  // scroll -- raiders, what they want, what they take, what grows, the shout,
  // the sea and the ruins -- so a player who had just lost a road to somebody
  // had to read about drowned captains to find out why.
  const wildsPane = topicPane(
    'wilds',
    `<p class="flavor">
      ${
        state.settings.barbarians
          ? 'This game has raiders in it. They were decided when it began and will not go away.'
          : 'This game has no raiders. It is a choice made when a game is started, on the new-game screen, and it holds for the whole game.'
      }
    </p>`,
    [
      {
        title: 'Raiders belong to nobody',
        body: `
        <p class="flavor">
          They attack the Horde and the Kingdom alike, refuse
          every conversation, and hold no ground &mdash; there is no arrangement to be
          reached and no border to agree. Nothing in
          ${seeTopic('diplomacy', 'The talks', 'the talks')} touches them. They come out
          of the unclaimed wilds in <strong>waves</strong>, and a wave grows with how far
          along the two empires are between them, so falling behind does not make them
          easier and racing ahead does not make them worse for you alone.
        </p>
        <div class="panel-body">
          <div class="stat-row"><span class="label">First wave</span><span class="value">turn ${raidPace(state).notBefore}, then every ${raidPace(state).every} turns</span></div>
          <div class="stat-row"><span class="label">How many</span><span class="value">grows with the average advances known, up to ${BARBARIANS.cap}</span></div>
          <div class="stat-row"><span class="label">Where</span><span class="value">open ground, at least ${BARBARIANS.clearOfCities} tiles from any city</span></div>
          <div class="stat-row"><span class="label">Cities</span><span class="value">they cannot take one, ever</span></div>
        </div>`,
      },
      {
        title: 'What they can take',
        body: `
        <p class="flavor">
          Not a city. What they <em>can</em> do is walk into one nobody is defending and take
          something: a building if there is one, and people if there is not. It keeps its
          name and its owner. The walls stay standing &mdash; they have not brought
          anything that would trouble a wall.
          <strong>One unit in a city is usually enough to stop them</strong>, which is the
          entire lesson.
        </p>`,
      },
      {
        title: 'What they are after',
        body: `
        <p class="flavor">
          <strong>They are after what somebody built.</strong> A band walks at the nearest
          town, and after that at roads, ditches, mines and garrison posts &mdash; each
          worth several times the walk they would make for somebody standing in a field.
          A unit in the way is still hit, because the step into it is an attack, and two
          things make them turn on one on purpose: <strong>a mob</strong> of
          ${PREY.mob} or more of them within sight of each other, which will have a go at
          anything however badly it ends, and <strong>one of them cornered</strong>, with
          somebody next to it and nowhere to back off to. A lone raider with room to walk
          away will walk away: soldiers are not what it came for.
        </p>`,
      },
      {
        title: 'You are told twice, and the two mean different things',
        body: `
        <p class="flavor">
          When a wave lands
          somewhere in the wilds you hear that <em>something has come out</em> &mdash;
          a rumour, with no place attached, because nobody of yours was standing there
          to see it. When one of them actually comes into view you get
          <strong>&ldquo;Raiders spotted&rdquo;</strong>, and the map turns to look at
          them, because that time we really did see them.
        </p>`,
      },
      {
        title: 'They grow as you do',
        body: `
        <p class="flavor">
          A wave is skirmishers while the world is
          young. Once the two empires average ${RAIDER_TIERS.elite.from} advances between
          them an <strong>${escapeHtml(UNIT_TYPES[RAIDER_TIERS.elite.id].name)}</strong> comes with them, and past
          ${RAIDER_TIERS.leader.from} a <strong>${escapeHtml(UNIT_TYPES[RAIDER_TIERS.leader.id].name)}</strong> leads them
          &mdash; one of those in the world at a time. It is counted in advances rather
          than turns, so a slow game is not punished for being slow and a fast one cannot
          outrun the wilds.
        </p>
        ${
          RAIDER_TIERS.leader.summons
            ? `<p class="flavor">
          <strong>A Chieftain left alone grows a band.</strong> Every
          ${RAIDER_TIERS.leader.summonEvery} turns it calls somebody up &mdash; but only
          onto free ground beside it, and never where one of your towns can see it
          happening. So it backs away from your walls to do it, and a band grows out in
          the wilds where nobody is watching. A unit standing next to it does not stop
          it; a town does, and so does penning it in, since one unit to a tile holds for
          them too.
        </p>`
            : ''
        }
        <p class="flavor">
          The two big ones are worth killing: a Brute is carrying
          ${RAIDER_TIERS.elite.bounty} gold and a Chieftain ${RAIDER_TIERS.leader.bounty},
          and whoever puts it down keeps it. A skirmisher is carrying nothing, so a
          hundred of them are still not a living.
        </p>`,
      },
      {
        title: 'Standing next to an Ogre Clan Brute costs you the first blow',
        body: `
        <p class="flavor">
          Anything of yours within reach of one at the end of their turn is
          <em>cowed</em>: it attacks at ${COWED.attack} less for that turn, never below
          ${COWED.floor}. Anything that already swings at ${COWED.floor} is not marked at all
          &mdash; a Goblin cannot be made worse at fighting, and is too stupid to be
          frightened besides. Killing the brute afterwards does not undo it; the only way
          out of it is not to be standing there when the horn goes. The brute swings no
          harder for any of it, which is not what it is for.
        </p>`,
      },
      {
        title: 'And some of them come out of the sea',
        body: !LEGION.enabled
          ? ''
          : `
        <p class="flavor">
          Where there is a coast,
          about ${Math.round(LEGION.share * 100)} waves in a hundred are the
          <strong>Sunken Legion</strong> instead: drowned sailors who stand up in the
          shallows and walk ashore. They are not extra &mdash; a Legion wave lands
          <em>instead of</em> one out of the wilds, on the same clock &mdash; and an
          inland map never sees one.
        </p>
        <p class="flavor">
          They <strong>wade</strong>, which nothing else in the game does: shallow water
          and dry land both, never the deep. So they can be met at the water's edge, and
          hit while they are still in it &mdash; a unit on the beach may swing at a
          drowned thing standing in the surf, and it may swing back. Slow, and hard to
          shift: every one of them moves one tile a turn and would rather be hit than
          killed.
        </p>
        <p class="flavor">
          A <strong>${seeEntry(LEGION.elite.id)}</strong> walks through walls. Not over them and not
          through a gate: a city's walls, and anything else standing that adds to its
          defence, simply do not count against one. The ground underfoot, fortifying and
          veterancy still do. A <strong>${seeEntry(LEGION.leader.id)}</strong> is worse dead than alive
          &mdash; ${LEGION.leader.lastWords} of his crew stand up where he fell, and if
          one of your ships is within ${LEGION.leader.dragsUnder} tiles when he goes, it
          goes with him. Kill him with soldiers, and keep the boats out of it.
        </p>`,
      },
      {
        title: 'Ruins, and what is standing in them',
        body: `
        <p class="flavor">
          <strong>Some of it never went anywhere.</strong> Scattered over the map are
          <strong>ruins</strong> &mdash; something that was standing here long before either
          of you, with something still in it. Walking into one wakes what is inside, and
          that costs the rest of that unit's turn: a ruin is a fight you have decided to
          start, not a thing you collect on the way past. <strong>You do not get in on
          that turn.</strong> What is in there stands up <em>in the doorway</em> and your
          unit stays where it was, so the knock buys you the fight and nothing else.
        </p>
        <p class="flavor">
          <strong>Hold it once it is quiet and it is yours.</strong> The prize comes to
          whoever is standing in the ruin at the start of a turn with nothing of theirs
          left alive around it &mdash; gold, an advance off your own tree, somebody who
          walks out with you, or a lesson for the unit that cracked it. What guards them
          are the <strong>Tomb Wardens</strong> (${seeEntry(WARDENS.sentinel)} and worse), who defend far better than they attack,
          and who <em>never leave the doorway</em>: walk away and a ruin stops mattering
          until you come back. Leave one awake for ${RUINS.keeperAfter} turns and a
          <strong>${seeEntry(WARDENS.keeper)}</strong> comes up the stairs, so half-finishing one is the
          worst way to do it. And hitting ${seeEntry(WARDENS.guardian, 'an Animated Guardian')} hurts &mdash; it is made of
          stone, and it does not give.
        </p>`,
      },
      {
        title: 'Everything wild, by name',
        body: `
        <p class="flavor">
          None of this belongs to anybody, so none of it is in either roster. It is all
          here instead &mdash; including the things that stand in ruins, which had no
          entry anywhere at all.
        </p>
        <div class="pedia-grid">${wildSection()}</div>`,
      },
    ],
  );

  // Section 137: espionage out of the Diplomacy pane and into its own.
  //
  // **They were never one subject.** Diplomacy is what you say to somebody who
  // knows you are saying it; espionage is the whole of what you do because
  // they do not. They shared a pane for the accident that both arrived in
  // section 135-136, and by the eighth rung the ladder was ten unheaded
  // paragraphs buried under the peace rules.
  const spyPane = topicPane(
    'espionage',
    `<p class="flavor">
      Everything here is anonymous until it is not. Being <em>caught</em> is the
      one moment the other side learns whose agent it was, and the whole of the
      ladder is priced on how likely that is.
    </p>`,
    [
      {
        title: 'What a spy is',
        body: `
        <p class="flavor">
          <strong>Spies</strong> arrive with ${escapeHtml(TECHS_BY_ID['someone-elses-business'].name)},
          and every side builds one: a ${seeEntry('skulker')} for the Horde, a
          ${seeEntry('factor')} for the Kingdom, a ${seeEntry('mimic')} for the Hive.
          A spy never attacks &mdash; it has no attack at all &mdash; so there is no way
          to use it as a bad soldier, and nothing of yours can be ordered to attack with
          one. It is a unit whose entire value is in what it finds out and what it
          quietly ruins.
        </p>
        <p class="flavor">
          <strong>It is also visible the whole time.</strong> An agent stands on the map
          like anything else; what it changes is <em>whose</em> people think it is. That
          is worth holding apart from the one thing in the game that genuinely cannot be
          seen, which is a ${seeEntry('burrower')} under the ground.
        </p>`,
      },
      {
        title: 'Wearing somebody’s colours',
        body: `
        <p class="flavor">
          Your own, and then nobody can
          tell which of your soldiers is the one doing the looking &mdash; useful at home.
          Or <em>theirs</em>, and then their armies will not come for it at all, which is
          how it walks in. The second is far stronger and breaks the moment anything
          touches it: a fight uncovers a spy to whoever was in it, permanently, and only
          to them.
        </p>`,
      },
      {
        title: 'Failing, and being caught',
        body: `
        <p class="flavor">
          <strong>They are two different things.</strong> An order that fails has wasted
          the turn and told nobody anything. Being <em>noticed</em> is the one moment the
          other side learns whose it was, and they will hold it against you &mdash; which
          is a number you can watch move on ${seeTopic('diplomacy', 'Where you stand', 'the standing track')}.
          A promoted spy reads better; more to the point, it is noticed far less, which
          is the thing worth promoting toward.
        </p>
        <p class="flavor">
          A spy cannot fight, so it can earn its promotions no other way: the experience
          comes from the work, failures included. An agent you keep alive and keep busy
          becomes a different unit from the one you built.
        </p>`,
      },
      {
        title: 'What an order risks',
        body: `
        <p class="flavor">
          <strong>Every spy order says what it is likely to cost you</strong> &mdash; from
          <em>${RISK_BANDS[0].label}</em> up through
          <em>${RISK_BANDS[RISK_BANDS.length - 1].label}</em> &mdash; and the words are
          read off the real odds rather than written on by hand, so they cannot drift
          from the rules. The figure quoted is the chance the order ends with your agent
          uncovered, not the chance it fails: those are two different rolls, and failing
          quietly costs you a turn and nothing else.
        </p>
        <p class="flavor">
          Standing at a gate and taking an interest is the mildest thing on the ladder.
          Everything further up involves doing something <em>to</em> somebody, and a
          thing that is done is a thing that can be traced. Rank makes every rung safer
          and never makes one safe.
        </p>`,
      },
      {
        title: 'The ladder, cheapest first',
        body: `
        <p class="flavor">
          In the order the risk goes. Searching, watching a town and wrecking its
          works come with the spy itself; the other three each want an advance of
          their own, named where they appear.
        </p>
        ${subhead(SPY_ACTIONS.search.verb)}
        <p class="flavor">
          <strong>A spy is the only thing that finds another spy.</strong> Any agent
          can spend its turn searching the ground it stands on, which looks at
          everything of somebody else's it can see and tries to see through it. It costs
          nothing but the day &mdash; there is nobody to notice you looking, which makes
          it the one order on the whole ladder that carries <em>no risk at all</em>.
          Rank tells on both sides: a veteran finds more, and a veteran is harder to
          find, so a green agent sweeping for a good one is the worst version of it.
        </p>
        <p class="flavor">
          <strong>Whoever you see through is not told.</strong> Seeing through a disguise
          is permanent and it is yours alone &mdash; the other side goes on walking that
          agent about believing it still passes, and on your map it is wearing its own
          face again while on theirs it is not. That asymmetry <em>is</em> the prize. It
          also means a sweep that finds nothing has told you nothing: there may be
          nobody there, or there may be somebody better at this than you are.
        </p>
        ${subhead(`${SPY_ACTIONS.read.verb} a town`)}
        <p class="flavor">
          Stand next to somebody else's town and find out what is in it: what they are
          building, who is garrisoning it, what they have put up, and how far along the
          thing they mean to win with &mdash; the Portal, the Object, the Shell &mdash;
          has got <em>in that town</em>. The reading is good for that turn and no longer,
          which is why an agent parked at a gate is worth more than one that read it once.
        </p>
        ${subhead(`${SPY_ACTIONS.gossip.verb} a town — ${techNamed('gossip')}`)}
        <p class="flavor">
          <strong>The one order that is about somebody who is not in the room.</strong>
          An agent beside a rival town can spend the day listening, and comes back with
          what <em>that</em> side makes of all its neighbours &mdash; who they like, who
          they cannot stand, and who they are at war with. Nothing else in the game will
          ever tell you this: ${seeTopic('diplomacy', 'The talks', 'the talks screen')}
          says what you and they think of each other, and two other empires' opinion of
          one another has always been none of your business.
        </p>
        <p class="flavor">
          <strong>It cannot fail</strong>, because you are not doing anything to anybody
          &mdash; you are standing in a market asking who people are cross with, which is
          a thing one may simply find out. It still costs the day, and people remember a
          stranger who asked a great many questions, which is why it is priced above
          watching a town and below touching one. And it keeps: opinions move slowly, so
          a report is worth acting on long after a note about somebody's garrison has
          gone stale.
        </p>
        <p class="flavor">
          <strong>What it is for.</strong> An empire with a war on its far side has its
          army somewhere else, and that is the moment to walk at it. The other sides
          think so too &mdash; and they can only act on a war they have actually heard
          about, which is exactly what their own agents are out there doing.
        </p>
        ${subhead(`${SPY_ACTIONS.incite.verb} a town — ${techNamed('incite')}`)}
        <p class="flavor">
          A word in the wrong ear sets a town chewing over its own grievances. Nothing
          is invented and nothing is even untrue &mdash; the complaints were already
          there, and all an agent does is mention the right one to the right person at
          the right hour. It <em>takes patience away</em> rather than forcing a riot, so
          a town with room to spare shrugs it off and a town already stretched tips into
          disorder. Knowing which is which is what the city report is for.
        </p>
        <p class="flavor">
          They can see perfectly well that something has got into the place, and they
          have no idea who to blame. Being caught at it costs you the agent's name and
          their good opinion, but <em>not the agent</em>: being the stranger who was in
          the market on the day everybody got cross is not the same as being found in
          somebody's works with your hands full.
        </p>
        ${subhead(`${SPY_ACTIONS.sabotage.verb} a town`)}
        <p class="flavor">
          <strong>The first thing on this list that actually <em>does</em> something.</strong>
          An agent beside somebody else's town can spend the day
          wrecking whatever it is building, which takes every shield banked in it and
          leaves the town itself untouched &mdash; a spy is one person with a bad idea,
          not an army. <strong>They are told it happened and are not told by whom.</strong>
        </p>
        <p class="flavor">
          <strong>What it costs you depends on what they are building.</strong> A town
          putting up a granary is barely watched. A town most of the way through something
          large has eyes on it, and the risk climbs in steps as the shields go in &mdash;
          ${SABOTAGE.phases.length + 1} of them, so the question is which band you are in
          rather than a sum. Anything that would <em>win the game</em> sits above all of
          them, whatever is banked in it: a Portal at twenty shields is already the most
          closely watched building site in the world, because of what it is.
          <strong>And being caught at this costs you the agent</strong>, which is what
          makes the top of the ladder a decision rather than a free roll.
        </p>
        ${subhead(`Make an offer to a soldier — ${techNamed('turning')}`)}
        <p class="flavor">
          <strong>A soldier is a person, which is the expensive discovery.</strong>
          An agent standing beside somebody else's
          unit can walk up and make it an offer. The asking price is a fact about
          <em>them</em> &mdash; what they cost to raise, how many of them there are, how
          decorated &mdash; and what you choose is how generous to be. A thin offer is a
          long shot; a fat one is good and never certain, because a soldier who could be
          bought for certain would make a full purse a way of winning.
        </p>
        <p class="flavor">
          <strong>Or buy them for later.</strong> A delayed betrayal is cheaper, because
          people will agree to a great deal when the bill is some other week's problem
          &mdash; and until that week they are <em>entirely theirs</em>: fighting for
          them, holding their gate, counted in their garrison. Then they turn round. You
          pick the week, which is most of what you are paying for.
        </p>
        <p class="flavor">
          <strong>The money is gone either way, and a refusal names you.</strong> This is
          the one thing on the whole ladder done by walking up and speaking, so there was
          never a version of it that stayed quiet when it failed: they are told what was
          offered and by whom, and they will remember. That is why the button quotes a
          price in gold where the others quote a risk &mdash; the cost of failing here is
          not a chance, it is a certainty you are choosing to pay for.
        </p>`,
      },
      {
        title: 'The agent nobody can see',
        body: !UNSEEN.enabled
          ? ''
          : `
        <p class="flavor">
          <strong>${escapeHtml(techNamed('unseen'))}</strong> buys a second kind of agent
          entirely, and it is the one thing in this section that is not about lying.
          Everything above is an answer to <em>what am I looking at</em>. ${seeEntry('nobody')},
          the ${seeEntry('intelligencer')} and the ${seeEntry('hollow', 'Hollow-caste')} answer
          <em>can I see it at all</em>, and the answer is no. They are simply not
          drawn on anybody else's map, from the turn they are built.
        </p>
        <p class="flavor">
          <strong>They wear no colours, and cannot.</strong> There is nobody to show
          them to. That is also what keeps the two tiers apart &mdash; one lies and
          the other is not there &mdash; and it is why finding one is a different roll
          from seeing through a Skulker: a disguise is a wrong answer you can catch,
          and this is no answer at all.
        </p>
        <p class="flavor">
          <strong>Nothing is in anybody's way.</strong> An agent standing in a field
          does not stop an army walking through it &mdash; if it did, a patch of grass
          nobody could march onto would give the whole thing away. What happens instead
          is that somebody walks <em>into</em> it. That costs the walker the rest of its
          turn and puts the agent in plain sight, to <em>them</em>, until it moves:
          long enough to bring something over and deal with it, and not a moment longer.
          You are not fighting what you have not noticed.
        </p>
        <p class="flavor">
          <strong>So being trodden on is a fright rather than an ending.</strong> Come
          its own turn it walks away and is a secret again. The two orders below
          &mdash; a searching agent and a town paying attention &mdash; are the ones
          that find one <em>for good</em>.
        </p>
        <p class="flavor">
          <strong>Being found properly is permanent, and it is one side's secret.</strong>
          The same bargain a disguise is uncovered under: the side that found it can see it
          for the rest of the game and the others go on not seeing it at all &mdash; so
          an agent that has been rumbled in one empire is still invisible in the next
          one along. The unit's own panel says which, by name.
        </p>
        <p class="flavor">
          It costs rather more than the low tier, sees a tile further &mdash; which is
          what a ${seeTopic('espionage', 'The ladder, cheapest first', 'search')} is
          measured in &mdash; and does everything else on the ladder exactly as a
          Skulker does, at exactly the same risk. What you are buying is the walk in.
        </p>`,
      },
      {
        title: 'What a town notices by itself',
        body: !UNSEEN.enabled
          ? ''
          : `
        <p class="flavor">
          <strong>A side that has built no agents is not defenceless.</strong> Searching
          is the counter to all of this and searching needs an agent of your own, which
          is a fine answer for somebody who has one and no answer whatsoever for
          somebody who has not. So a town looks for itself, every turn, at anybody
          concealed standing on or near its own land.
        </p>
        <p class="flavor">
          <strong>What makes a town good at it is being happy.</strong> A town that is
          content, fed and growing is one where everybody knows everybody and the
          stranger is conspicuous; soldiers standing in it help, up to a point; and a
          town in disorder has other things on its mind and is as bad at this as a town
          can be. There is no building for it and there is not going to be one &mdash;
          the price is keeping your towns pleased with themselves, which the game has
          never otherwise paid you for.
        </p>
        <p class="flavor">
          The odds in any one turn are small on purpose. It is a clock rather than a
          wall: an agent parked at the same gate for twenty turns is taking a risk it
          would not take by walking home, and an agent passing through is almost
          certainly fine. Both tiers are in scope &mdash; the tell for the low one is a
          garrison that comes to a different number depending on who counts it.
        </p>`,
      },
      {
        title: 'Everybody does this',
        body: `
        <p class="flavor">
          The other sides build agents too, dress
          them in somebody's colours and walk them to your gates, and what they learn
          goes in a file they plan off: an army that knows which of your towns is empty
          marches on that one. A report keeps for about ${SPY.remembers} turns before it is only
          a rumour, and a town somebody can actually <em>see</em> is never read off a
          file &mdash; eyes are never out of date. The same is true the other way round,
          which is what your own agent is buying you.
        </p>`,
      },
    ],
  );

  // Section 137: diplomacy as topics, with the espionage half lifted out.
  const diploPane = topicPane(
    'diplomacy',
    `<p class="flavor">
      Everything here is said out loud, to somebody who knows you are saying it.
      The half that is not is ${seeTopic('espionage', 'What a spy is', 'under Espionage')}.
    </p>`,
    [
      {
        title: 'Meeting somebody',
        body: `
        <p class="flavor">
          The first time anything of yours can see
          anything of theirs, the two of you have met, and you hear from them. They send
          a greeting, or mention where their border is, or ask to be paid, or declare war
          &mdash; the Horde leans to the last two and the Kingdom to the first two, and
          what the board looks like at the time decides the rest. <strong>War is still a
          perfectly ordinary opening</strong>; it is simply announced now rather than
          assumed. Whatever is said, <strong>the meeting reveals both ways</strong>: each
          of you comes away knowing roughly where the other's nearest town is. Scouting
          is a thing you do to somebody, not a thing you get away with.
        </p>`,
      },
      {
        title: 'Where you stand',
        body: `
        <p class="flavor">
          With every side you have met it is one number,
          ${STANDING.worst} to +${STANDING.best}, with a name for the band it is in:
          ${MOODS.map((m) => m.name).join(', ')} &mdash; and <em>War</em>, which overrides
          all of them while you are actually fighting. Fighting costs
          ${Math.abs(STANDING.fight)}, taking a town of theirs costs
          ${Math.abs(STANDING.cityTaken)}, signing a peace is worth +${STANDING.signed} and
          keeping one to its end another +${STANDING.kept}; going back on one costs
          ${Math.abs(STANDING.broken)}. A grudge nobody is feeding creeps back toward
          nothing at ${STANDING.forgets} a turn, and never past it: time forgets a grudge,
          it does not manufacture a friendship. The number and the name are both on the
          talks screen, so a side being angry always has a reason you could have watched
          happen &mdash; including
          ${seeTopic('espionage', 'Failing, and being caught', 'an agent of yours being caught')}.
        </p>
        <p class="flavor">
          <strong>They remember, and it shows in where their armies go.</strong> A side
          you have ground down to <em>Angered</em> will not come to the table at all &mdash;
          no offer, no counter-offer, and no sum of gold that changes it &mdash; and while
          you are down there its armies will walk past a nearer enemy to get to you.
          Climbing back out is a matter of time.
        </p>`,
      },
      {
        title: 'The Hive wants different things',
        body: `
        <p class="flavor">
          It has no
          disposition to be warm or cold, it does not hold your broken promises against
          you, and it reads one thing before anything else: whether it would survive the
          war. Much the weaker it will take almost any peace; much the stronger it is only
          mildly interested in carrying on, because a war it is winning is still a war it
          is spending itself on. Short of room to grow, it wants ground, and ground is
          what somebody else is standing on. The Voice will relay all of this while
          attempting an expression. The rest of what they are is
          ${seeTopic('hive', 'Who they are', 'in their own pane')}.
        </p>`,
      },
      {
        title: 'A peace, and what it is for',
        body: `
        <p class="flavor">
          A peace is an agreement to stop, and you may hold one with each
          side separately &mdash; the Hive included, which will sign and will keep to it
          for exactly as long as the arithmetic says. It is worth
          having because the game can be won without a war &mdash; the ending works,
          dominance, the turn limit &mdash; and a peace is time to build. Whoever is ahead
          on works likes peace; whoever is ahead on armies likes war.
        </p>
        <p class="flavor">
          <strong>It stops the fighting, and only the fighting.</strong> Nobody
          attacks, nobody shoots, no walls come down and no town changes hands. Units still
          walk wherever they like &mdash; and so, pointedly, do agents: nothing on the
          ${seeTopic('espionage', 'The ladder, cheapest first', 'spy ladder')} is covered by a
          treaty. The raiders are never part of it either: they refuse every conversation.
        </p>
        <p class="flavor">
          <strong>It lasts ${PEACE.term} turns,</strong> then lapses unless somebody renews
          it. The button on the top bar counts it down while it holds.
        </p>
        <p class="flavor">
          <strong>A long war is easier to end than a short one.</strong> Both sides tire
          of a war that has run ${PEACE.longWar} turns, and each counts its own dead and
          not the other side's &mdash; so the side that is losing asks first, and the side
          that is winning holds out. Signing wipes both clocks: the next war is argued
          about on its own terms.
        </p>`,
      },
      {
        title: 'The talks',
        body: `
        <p class="flavor">
          They are on the top bar. Offer peace for nothing, pay them
          gold to take it, or demand gold of them as the price of stopping. They answer at
          once, and you can see beforehand how keen they seem. They will also come to you:
          once the two of you have actually fought, a side that is losing, or building an
          ending, or beset by raiders, may ask &mdash; and offers made to you wait for the
          start of your turn.
        </p>`,
      },
      {
        title: 'Breaking it',
        body: `
        <p class="flavor">
          Done in the talks, deliberately &mdash; an attack
          while at peace is refused rather than starting a war by accident. The side that
          breaks it has cities a citizen less patient for ${PEACE.shameTurns} turns, and
          the other side remembers: every broken peace makes the next one harder to get.
          <strong>So does everybody else</strong>, a little &mdash; it was not their
          treaty, but nobody likes a side that breaks its word.
        </p>`,
      },
    ],
  );

  // Section 137: the Structures pane as topics. Three subjects sat above the
  // list -- what the capital does on its own, what ends the game, and what a
  // folly is -- and none of them had a heading.
  const buildingsPane = topicPane(
    'buildings',
    '',
    [
      { title: 'Civic Pride', body: `<p class="flavor">
          Your <strong>capital</strong> grows a piece at a time: a
          watchtower at one corner, a gate at the front, a wing at one side, grounds out front and
          banners along the roof, three tiers each. You never build these and they never cost
          anything &mdash; when the empire has done well enough, and while nobody is rioting and
          nobody is hungry (${CIVIC_PRIDE.cities} cities and ${CIVIC_PRIDE.gold} gold at the least),
          the council asks which piece to add. They do <em>nothing</em> whatsoever: no yields, no
          defence, no upkeep. The capital is a picture of how the game has gone, and the city view
          draws it.
        </p>` },
      { title: 'Three works end the game', body: `${
          ALT_VICTORY.enabled
            ? `<p class="flavor">
          The Horde's <em>Demonic Portal</em>, the
          Kingdom's <em>Mysterious Object</em> and the Hive's <em>Second Queen's Shell</em> each
          need two lesser works first; the last one goes up in a city holding one of them, and its
          builder wins if it still holds that city ${ALT_VICTORY.portalTurns} turns later. One of
          each per side, never bought with gold, and everybody is told when work begins and as
          each is finished. Take the city and whatever stands in it is torn down.
        </p>
        <p class="flavor">
          <strong>The two empires keep theirs at the far end of their own tree. The Hive does
          not.</strong> <em>All Is The Hive</em> sits four advances in, behind the Soldier-caste,
          and its three works cost six hundred shields against the empires' thousand. The Hive
          comes up out of the ground around turn a hundred with two Grubs, against empires six
          cities deep, and studies at a third their rate &mdash; so where they can afford an
          ending at the end of everything else, the Hive can only afford one it was always going
          to walk past. It is the only road it has, and it is a short one.
        </p>`
            : ''
        }` },
      { title: 'Follies', body: `${
          FOLLIES.enabled
            ? `<p class="flavor">
          They are buildings there is only one of. Four are shared: only one
          stands in the whole game, and both sides may race for it. Four more belong to each side,
          one per empire. They come with advances you would learn anyway, apart from The Argument
          With The Sky, which needs both kinds of magic. Some help the city holding them and some
          the whole empire, but only once built and only while you hold that city. None can be
          bought with gold, and shields put into one are kept if the city switches to something
          else. <strong>Lose a race and the shields go back into that city's stores.</strong> Take
          a city and a shared folly works for you; the other side's own follies are torn down.
        </p>`
            : ''
        }` },
      { title: 'Every structure, by name', body: `<div class="pedia-rows">${buildingList}</div>` },
    ],
  );

  // Section 137: and the Terrain pane, which had grown six unrelated subjects
  // above its table -- roads, posts, pillaging, trade, and the ditches.
  const terrainPane = topicPane(
    'terrain',
    '',
    [
      { title: 'What the ground is worth', body: `<p class="flavor">
          Yields are food / shields / trade. About one tile in ${Math.round(1 / SPECIALS.chance)} carries a
          <em>land special</em> &mdash; the marked ones on the map. A special
          <strong>replaces</strong> what the tile would otherwise produce rather than
          adding to it, and it is always worth having. Some are worth more to
          <strong>work</strong>; others are worth more to <strong>stand on</strong>, and
          change nothing about what the tile grows.
        </p>` },
      { title: 'Roads', body: `<p class="flavor">
          Once you know <strong>Bridge Building</strong>, a Peon or Peasant can lay one where it stands (<kbd>R</kbd>):
          ${ROADS.turns.grass} turns on grass or wastes, ${ROADS.turns.forest} in forest, hills or
          swamp, ${ROADS.turns.mountains} up a mountain. Walking off abandons the job. <kbd>Shift+R</kbd> and a click lays a road all the way to that tile, digging where the ground needs it and walking over any road already down. A step from one
          road tile to the next costs <strong>a third of a move</strong>, so a worker that has joined
          two cities has shortened every march between them. A city counts as a road already, and a
          road does not know whose it is &mdash; the other lot may use yours.
        </p>` },
      { title: 'Garrison posts', body: `<p class="flavor">
          A worker can put up a post on any dry tile (<kbd>G</kbd>,
          ${POSTS.turns} turns): a hut with a spear leaning on it. A soldier of yours standing on one
          that sits on a city's own land keeps ${POSTS.contentBonus} more citizen content there, up
          to ${POSTS.maxPerCity} posts a city. It is somewhere to stand that is not the city gate,
          which matters because only one unit fits on a tile &mdash; two soldiers watching a city now
          need two huts, which is what the old Posting always meant and could never arrange.
        </p>` },
      { title: 'Pillaging', body: `<p class="flavor">
          Any soldier standing on a road &mdash; yours or theirs, since a
          road does not know whose it is &mdash; can tear it up with <kbd>P</kbd>, which costs it the
          rest of the turn. Workers build; soldiers wreck. A cut road is a march slowed and, if it
          was the only road between two of your counting-houses, a trade route gone: the log says
          which one, by name, the turn it happens. Raiders do this too, which is what makes an
          unwatched border expensive.
        </p>` },
      { title: 'Trade routes', body: `<p class="flavor">
          A road joining two of your own cities, each with a
          <strong>Goblin Treasury</strong> or <strong>Simple Market</strong> (or one of the larger
          buildings that stand on those), is a <em>trade route</em>: gold every turn, and the further
          apart the two cities the more it pays, measured straight and scaled to the size of the map.
          A city is paid for its best ${TRADE.maxLinksPerCity}. Both ends must actually be earning
          &mdash; those buildings pay nothing with nobody standing in the city &mdash; and the city
          view lists every route a city has, what it pays, and whether it is paying at all.
        </p>` },
      { title: 'Improving the land', body: `${
          TERRAFORM.enabled
            ? `<p class="flavor">
          Once ${escapeHtml(
            TECHS.find((t) => t.flags.includes('terraform'))?.name ?? 'the right advance',
          )} is known -- having hugged the trees, everybody agrees they are in the way -- a
          worker can <strong>irrigate</strong> grassland or wastes for +${TERRAFORM.food} food, as
          long as there is water beside it: the coast, a city, or another ditch
          (<em>${escapeHtml(jobName('irrigate', faction))}</em>, Shift+I). It can
          <strong>mine</strong> hills for +1 shield and mountains for +2
          (<em>${escapeHtml(jobName('mine', faction))}</em>, Shift+M), and <strong>clear</strong>
          forest or swamp to grassland (<em>${escapeHtml(jobName('clear', faction, 'forest'))}</em> and
          <em>${escapeHtml(jobName('clear', faction, 'swamp'))}</em>, Shift+C), which also clears
          whatever special was on it and what the ground was worth to defend. What a worker
          makes adds to whatever the tile already grows, special included. Raiders can tear it up.
        </p>
        <p class="flavor">
          <strong>Irrigate To</strong> (Shift+W) walks a worker out from the water to a tile you
          click, digging a ditch wherever the ground will take one, the way Road To lays a road.
          <strong>Auto work</strong> (Shift+A) leaves a worker to find land worth improving by
          itself, as the other side's workers do. Once ${escapeHtml(
            TECHS.find((t) => t.flags.includes('channels'))?.name ?? 'the right advance',
          )} is known, water no longer has to be next door.
        </p>`
            : ''
        }` },
      { title: 'Every kind of ground', body: `<div class="pedia-rows">${terrainList}</div>` },
    ],
  );

  // Section 137: the Controls pane, four subjects deep, given the same topics
  // as the rest of the book.
  const controlsPane = topicPane(
    'controls',
    '',
    [
      { title: 'Clicking, marching and exploring', body: `<p class="flavor">
          Two of these are worth knowing and neither is guessable.
          <strong>Right-click is the order button</strong>: it acts with the unit you
          already have in hand and asks no questions about what is on the tile, which
          is how you walk a unit <em>onto</em> one of your own cities. A
          <strong>left click on your own city opens the city</strong> instead, whatever
          is standing there &mdash; and everything standing there is listed in the
          panel, including whatever the city has just finished building.
          A left click on open ground sets a march, which carries on across as many
          turns as it takes. <strong>Explore</strong> (E) is a march with no end in
          mind: any soldier walks toward the nearest dark edge of the map, turn after
          turn, and halts the moment it sees something new &mdash; an enemy, a raider,
          a city not yours, or a ruin nobody has opened &mdash; so it is never walked
          unattended into a fight. It will not attack anything, it will not go into
          anything, and it gives up when there is nothing left it can reach. When a game is over, <strong>Watch It Again</strong> on the final
          screen plays the whole thing back: each side's land spreading and changing
          hands, the score pulling apart, and every city taken or lost, to jump to.
        </p>` },
      { title: 'Borders', body: `<p class="flavor">
          Each town claims the twenty-one tiles it could put a
          citizen on, and the map edges that land in its owner's colour. Where two towns
          want the same tile the nearer one has it, and a tie goes to the older town.
          Nothing is forbidden by a border &mdash; you may walk wherever you like, at
          peace or at war &mdash; but it shows at a glance whose fields you are standing
          in. <strong>V</strong> hides them and shows them again.
        </p>` },
      { title: 'City markers', body: `<p class="flavor">
          A small picture at the bottom-left of a city of
          yours says the one thing most worth knowing about it, worst news first:
          <em>besieged</em> (enemies next to it), <em>unrest</em> (rioting),
          <em>starving</em>, <em>ruined</em> (still being resettled after it changed
          hands), <em>damaged</em> (raiders carried something off or sappers brought the
          walls down, within the last ${CITY_DAMAGE.turns} turns), <em>idle</em> (banking
          shields with nothing chosen), <em>supplied</em> (it feeds an army), and last,
          because it asks for nothing, <em>celebration</em> (big, content with room to
          spare, and still growing).
        </p>` },
      { title: 'Ships', body: `<p class="flavor">
          They come with Mapmaking, and a warship with the Horde's
          Throwing Buddies or the Kingdom's Join the Army. They are built only in a city
          beside the sea, go into the water next to it, and never come ashore. A
          carrier takes three land units: <strong>right-click it</strong> from the shore
          beside it to go aboard, which ends that unit's turn. The ship's panel lists who
          is aboard; <strong>Ashore</strong> lights the free shore next to the ship for
          one of them, and <strong>W</strong> puts everybody off. Nobody can land straight
          into somebody else's town &mdash; land beside it, then attack. If a ship sinks,
          everybody aboard goes down with it. A warship sinks ships and attacks the shore
          next to it without landing, and nobody on land can fight back at a ship. Ships
          need no supply line. On <strong>an Archipelago</strong>, chosen on the new-game
          screen, each side starts on an island of its own and ships are the only way to
          meet.
        </p>` },
      { title: 'Every key', body: `<div class="pedia-controls">${controlsMarkup()}</div>` },
    ],
  );

  // Section 139: the difficulty pane, as topics, and carrying the arrival
  // rules that used to live in the Hive's own.
  //
  // **Jeremy's ruling when he settled "the slot, not the faction":** the
  // Hivekin pane stops saying when they turn up, because arrival is no longer
  // a fact about them. It is a fact about the level, and this is the level's
  // section. The half of that text which really is about the Hive -- that
  // their cities are Hives, their units castes, and that there is a Queen --
  // stays where it was.
  const difficultyPane = topicPane(
    'difficulty',
    '',
    [
      {
        title: 'The level, and what it changes',
        body: `
        <p class="flavor">
          This game is <strong>${escapeHtml(difficultyOf(state.settings).name)}</strong>. The
          level is chosen on the new-game screen and kept for the whole game. The other
          sides play the same way at every level; what changes is how patient your cities
          are, what they pay for their buildings and their advances, in a
          game with raiders how soon and how often they come, and
          ${seeTopic('difficulty', 'Who turns up, and when', 'when the sides who are not here yet arrive')}.
        </p>
        <table class="report-table pedia-difficulty">
          <thead>
            <tr><th>Level</th><th>Your cities riot</th><th>Their costs</th><th>Raiders</th><th>Latecomers</th></tr>
          </thead>
          <tbody>
            ${DIFFICULTIES.map(
              (d) => `<tr${d.id === difficultyOf(state.settings).id ? ' class="current"' : ''}>
                <td>${escapeHtml(d.name)}</td>
                <td>${d.content === 0 ? 'as measured' : `${Math.abs(d.content)} citizen${Math.abs(d.content) === 1 ? '' : 's'} ${d.content > 0 ? 'later' : 'sooner'}`}</td>
                <td>${Math.round(d.aiCost * 100)}%</td>
                <td>from turn ${d.raidNotBefore}, every ${d.raidEvery}</td>
                <td>${d.hiveArrives === 0 ? 'as measured' : `${Math.abs(d.hiveArrives)} turns ${d.hiveArrives > 0 ? 'later' : 'sooner'}`}</td>
              </tr>`,
            ).join('')}
          </tbody>
        </table>`,
      },
      {
        title: 'Who turns up, and when',
        body: `
        <p class="flavor">
          <strong>You choose who you are playing against</strong> on the new-game screen,
          and you may pick more than one. <strong>The first of them is on the map from
          the first turn.</strong> Everybody else is coming, and has not arrived yet.
        </p>
        <p class="flavor">
          A side that is still on its way turns up somewhere around turn
          ${ARRIVALS.from} to ${ARRIVALS.until}, and each one after that roughly
          ${ARRIVALS.spacing} turns behind the last &mdash; so a four-sided game is one
          rival at the start, one in the middle, and one rather late. They appear on
          <strong>ground nobody has claimed</strong>, well away from anybody's towns,
          with a couple of settlers and an escort, and for their first
          ${HIVEKIN.grace} turns they cannot be attacked at all.
        </p>
        <p class="flavor">
          <strong>The level moves the whole schedule.</strong> Later on an easy game,
          which is more of the map to yourself before anybody else wants any of it;
          sooner on a hard one. The exact turn is drawn once, from the map's own seed,
          and never changes afterwards &mdash; near enough to plan against, not near
          enough to diarise.
        </p>
        <p class="flavor">
          <strong>Everybody is told the moment it happens</strong>, wherever they are
          standing. A new contender is the largest single thing that can happen to a
          game, and finding out by losing a town to one would not be fair.
        </p>`,
      },
    ],
  );

  openModal({
    title: 'Orcpedia',
    width: 'min(1100px, 96vw)',
    body: `
      <div class="pedia-tabs">
        <button class="pedia-tab active" data-tab="yours">${escapeHtml(FACTIONS[faction].name)}</button>
        ${others
          .map(
            (f) =>
              `<button class="pedia-tab" data-tab="${paneFor(f)}">${escapeHtml(FACTIONS[f].name)}</button>`,
          )
          .join('')}
        <button class="pedia-tab" data-tab="techs">Advances</button>
        <button class="pedia-tab" data-tab="buildings">Structures</button>
        <button class="pedia-tab" data-tab="terrain">Terrain</button>
        <button class="pedia-tab" data-tab="wilds">The Wilds</button>
        <button class="pedia-tab" data-tab="difficulty">Difficulty</button>
        <button class="pedia-tab" data-tab="espionage">Espionage</button>
        <button class="pedia-tab" data-tab="diplomacy">Diplomacy</button>
        <button class="pedia-tab" data-tab="controls">Controls</button>
      </div>

      <div class="pedia-pane" data-pane="yours">
        <p class="flavor">${escapeHtml(FACTIONS[faction].blurb)}</p>
        ${faction === 'hivekin' ? HIVE_RULES : ''}
        <div class="pedia-grid">${creatureSection(faction)}</div>
      </div>
      ${others
        .map(
          (f) => `
      <div class="pedia-pane" data-pane="${paneFor(f)}" hidden>
        <p class="flavor">${escapeHtml(FACTIONS[f].blurb)}</p>
        ${f === 'hivekin' ? HIVE_RULES : ''}
        <div class="pedia-grid">${creatureSection(f)}</div>
      </div>`,
        )
        .join('')}
      <div class="pedia-pane" data-pane="techs" hidden>
        <p class="flavor">Costs shown are the base price, before the surcharge for
        everything already known.</p>
        ${
          ALT_VICTORY.enabled
            ? `<p class="flavor">
          <strong>Two advances end the game.</strong> At the far end of each side's tree, one
          advance unlocks <strong>three works</strong>: two that may stand in any city, and a final
          one in a <strong>city holding one of the others</strong>, once both stand. One of each, never
          bought with gold, and <strong>everybody is told the moment work begins</strong> and as each
          work is finished. Shields put into a work are <strong>kept by the empire</strong>: switch a
          city to something else, or start the work again in another city, and it carries on from
          where it stopped. When the Horde's <em>Demonic Portal</em> opens, the Horde wins if it
          still holds that city ${ALT_VICTORY.portalTurns} turns later. When the Kingdom's
          <em>Mysterious Object</em> appears -- with a button nobody will explain -- the Kingdom wins
          if it still holds that city ${ALT_VICTORY.objectTurns} turns later. Take a city and
          whatever works stand in it are torn down.
        </p>`
            : ''
        }
        <div class="pedia-rows">${techList}</div>
      </div>
      <div class="pedia-pane" data-pane="buildings" hidden>
        ${buildingsPane}
      </div>
      <div class="pedia-pane" data-pane="terrain" hidden>
        ${terrainPane}
      </div>
      <div class="pedia-pane" data-pane="wilds" hidden>
        ${wildsPane}
      </div>
      <div class="pedia-pane" data-pane="difficulty" hidden>
        ${difficultyPane}
      </div>
      <div class="pedia-pane" data-pane="espionage" hidden>
        ${spyPane}
      </div>
      <div class="pedia-pane" data-pane="diplomacy" hidden>
        ${diploPane}
      </div>
      <div class="pedia-pane" data-pane="controls" hidden>
        ${controlsPane}
      </div>`,
    onMount: (root) => {
      // Swap in the procedural drawing wherever there is no artwork yet, so a
      // gap in the art shows a sprite rather than a broken-image icon.
      root.querySelectorAll<HTMLImageElement>('.pedia-row-icon').forEach((img) => {
        img.addEventListener('error', () => img.remove());
      });
      // A terrain used to carry one special, so its art was keyed by terrain.
      // Now that several are possible the files are keyed per special -- and the
      // old single file is tried once as a fallback, so nothing that already had
      // a picture lost one. Failing both, the row reads fine without it.
      root.querySelectorAll<HTMLImageElement>('.pedia-special-icon').forEach((img) => {
        img.addEventListener('error', () => {
          const fallback = img.dataset.fallback;
          if (fallback && img.src !== fallback) {
            delete img.dataset.fallback;
            img.src = fallback;
            return;
          }
          img.remove();
        });
      });
      root.querySelectorAll<HTMLImageElement>('.pedia-art').forEach((img) => {
        img.addEventListener('error', () => {
          const id = img.dataset.unit;
          if (id) img.src = placeholderFor(id);
        });
      });

      const panes = root.querySelectorAll<HTMLElement>('.pedia-pane');
      root.querySelectorAll<HTMLButtonElement>('.pedia-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          root
            .querySelectorAll('.pedia-tab')
            .forEach((t) => t.classList.toggle('active', t === tab));
          panes.forEach((p) => {
            p.hidden = p.dataset.pane !== tab.dataset.tab;
          });
        });
      });

      // Jump to whatever we were asked to show.
      const jumpTo = (tab: string, selector: string) => {
        root.querySelector<HTMLButtonElement>(`.pedia-tab[data-tab="${tab}"]`)?.click();
        const target = root.querySelector(selector);
        target?.scrollIntoView({ block: 'center' });
        // Cleared first, or a reader following three cross-references ends up
        // with three things glowing and no idea which one they arrived at.
        root.querySelectorAll('.pedia-highlight').forEach((el) => {
          if (el !== target) el.classList.remove('pedia-highlight');
        });
        target?.classList.add('pedia-highlight');
      };

      /**
       * Where an entry lives, asked once.
       *
       * The `focus` argument and the cross-references written in the prose go
       * through the same function on purpose: two copies of "which pane is a
       * Bone Sentinel in" is how the ruin dialog's link came to point at a
       * pane that filters wild things out.
       */
      const locate = (id: string): { tab: string; selector: string } | null => {
        if (UNIT_TYPES[id]) {
          const creature = CREATURES_BY_ID[unitType(id).base];
          // A wild thing carries a faction for its art -- a Bone Sentinel is
          // `human` -- so asking `paneFor` sent it to the Kingdom's roster,
          // where wild things are filtered out and the anchor has never
          // existed. That is why the link out of the ruin dialog did nothing.
          return {
            tab: creature.wild ? 'wilds' : paneFor(creature.faction),
            selector: `#pedia-${CSS.escape(creature.id)}`,
          };
        }
        if (BUILDINGS[id]) return { tab: 'buildings', selector: `#pedia-b-${CSS.escape(id)}` };
        return null;
      };

      // A cross-reference to another entry, written in the prose.
      root.querySelectorAll<HTMLElement>('[data-see]').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const where = locate(link.dataset.see ?? '');
          if (where) jumpTo(where.tab, where.selector);
        });
      });

      // A cross-reference to another topic. The pane is not written into the
      // link -- it is whichever one the anchor turns out to be sitting in, so
      // moving a topic between panes cannot leave a link behind.
      root.querySelectorAll<HTMLElement>('[data-jump]').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const id = link.dataset.jump ?? '';
          const pane = root.querySelector(`#${CSS.escape(id)}`)?.closest<HTMLElement>('.pedia-pane');
          if (pane?.dataset.pane) jumpTo(pane.dataset.pane, `#${CSS.escape(id)}`);
        });
      });

      if (focus) {
        const where = locate(focus);
        if (where) jumpTo(where.tab, where.selector);
      }
    },
  });
}
