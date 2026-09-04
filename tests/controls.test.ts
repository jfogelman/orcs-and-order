import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/abilities';
import { MOUSE, SHORTCUTS, allControls, controlsMarkup } from '../src/ui/controls';

/**
 * Section 73 exists because there were two lists of shortcuts and they drifted:
 * Reload, Split and Drain each advertised a key that did nothing at all. There
 * are two *surfaces* again now -- the list on `?` and the Orcpedia's tab -- so
 * the guard is that both print from one table and the table is generated from
 * what the game actually reads.
 */
describe('the list of controls', () => {
  it('offers every ability, from the table the handler uses', () => {
    const listed = allControls();
    for (const spec of Object.values(ABILITIES)) {
      const row = listed.find((c) => c.keys === spec.key.toUpperCase() && c.does.startsWith(spec.label));
      // An ability whose key is not printed anywhere is one nobody can find.
      expect(row, `${spec.label} is not in the list`).toBeDefined();
    }
  });

  it('never lists the same key twice for the same thing', () => {
    const seen = new Map<string, string>();
    for (const c of [...SHORTCUTS, ...Object.values(ABILITIES).map((a) => ({
      group: 'Abilities, when the unit has one',
      keys: a.key.toUpperCase(),
      does: a.label,
    }))]) {
      const at = `${c.group}/${c.keys}`;
      expect(seen.has(at), `${at} is listed twice`).toBe(false);
      seen.set(at, c.does);
    }
  });

  it('says what the mouse does, which the buttons cannot', () => {
    // Every other control is advertised somewhere else too -- the unit buttons
    // print their own key. The mouse has nowhere else to be written down.
    expect(MOUSE.length).toBeGreaterThan(0);
    const said = MOUSE.map((m) => `${m.keys} ${m.does}`.toLowerCase()).join(' | ');
    // The two that are not guessable: the order button, and what happens when
    // you click your own city.
    expect(said).toMatch(/right click/);
    expect(said).toMatch(/city/);
  });

  it('has something to say in every row', () => {
    for (const c of allControls()) {
      expect(c.keys.trim()).not.toBe('');
      expect(c.does.trim()).not.toBe('');
      expect(c.group.trim()).not.toBe('');
    }
  });

  it('renders one row per control, under a heading each', () => {
    const html = controlsMarkup();
    const rows = html.match(/class="stat-row"/g) ?? [];
    const titles = html.match(/class="panel-title"/g) ?? [];
    expect(rows).toHaveLength(allControls().length);
    expect(titles).toHaveLength(new Set(allControls().map((c) => c.group)).size);
  });

  it('escapes what it prints', () => {
    // Nothing in the table today contains markup, so this puts something there
    // rather than asserting a property the current strings satisfy by accident.
    MOUSE.push({ group: 'The mouse', keys: '<b>x</b>', does: 'Tom & Jerry' });
    try {
      const html = controlsMarkup();
      expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
      expect(html).toContain('Tom &amp; Jerry');
    } finally {
      MOUSE.pop();
    }
  });
});
