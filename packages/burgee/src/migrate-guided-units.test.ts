/**
 * The guided walk's edges (`migrate-guided.ts`): each factory and mouse event by name, the
 * shapes of a load and an import clause, and the evidence a binding needs. `migrate-guided.test.ts`
 * holds each library's README programs; these are the cases those programs never write.
 */
import { describe, expect, it } from 'vitest';

import { guidedSites, hostOf, mentionsAGuided } from './migrate-guided.js';
import { tokensOf } from './migrate.js';

/** `[line, pattern]` for every site in `source`. */
const sites = (source: string): [number, string][] => guidedSites(tokensOf(source)).map((s) => [s.line, s.pattern]);

const blessed = "const blessed = require('blessed');\n";
const term = "const term = require('terminal-kit').terminal;\n";

describe('the tables, entry by entry', () => {
  it.each([
    ['screen', 'screen'],
    ['program', 'screen'],
    ['box', 'box'],
    ['text', 'box'],
    ['element', 'box'],
    ['log', 'box'],
    ['layout', 'box'],
    ['list', 'list'],
    ['listtable', 'list'],
    ['listbar', 'list'],
    ['textbox', 'text-input'],
    ['textarea', 'text-input'],
  ])('reads blessed.%s() as the %s section', (factory, pattern) => {
    expect(sites(`${blessed}blessed.${factory}();`)).toEqual([
      [1, 'import'],
      [2, pattern],
    ]);
  });

  it('hands out the real terminal as a terminal', () => {
    expect(sites("const t = require('terminal-kit').realTerminal;\nt.fullscreen();")).toEqual([
      [1, 'import'],
      [2, 'alternate-screen'],
    ]);
  });

  it.each(['mouse', 'click', 'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'wheeldown', 'wheelup'])('reads a %s subscription as the mouse section', (event) => {
    expect(sites(`${blessed}const screen = blessed.screen();\nscreen.on('${event}', f);`)).toContainEqual([3, 'mouse']);
  });

  it('finds a host in a Buffer as in a string', () => {
    expect([mentionsAGuided(Buffer.from('x terminal-kit')), mentionsAGuided('x blessed'), mentionsAGuided(Buffer.from('chalk'))]).toEqual([true, true, false]);
    expect(hostOf(undefined)).toBeUndefined();
  });
});

describe('a load: require(…) and import(…)', () => {
  it('reads only the whole call, with one string in it', () => {
    expect(sites("f(require, 'blessed');")).toEqual([]);
    expect(sites("require('blessed' + x);")).toEqual([]);
    expect(sites('require(name);')).toEqual([]);
  });

  it('reports the specifier’s line, and a factory by its name’s line', () => {
    expect(sites("const b = require(\n  'blessed'\n);")).toEqual([[2, 'import']]);
    expect(sites(`${blessed}const s = blessed.screen\n({});`)).toEqual([
      [1, 'import'],
      [2, 'screen'],
    ]);
  });

  it('follows no member a module does not have', () => {
    expect(sites(`${blessed}blessed.nothing.key('q', f);`)).toEqual([[1, 'import']]);
  });
});

describe('a call chain', () => {
  it('steps over a factory’s arguments, parens and all, to the call after them', () => {
    expect(sites(`${blessed}blessed.screen(opts(1), { a: (2) }).key('q', f);`)).toEqual([
      [1, 'import'],
      [2, 'screen'],
      [2, 'key'],
    ]);
  });

  it('reports a site once per line and pattern, in line order', () => {
    expect(sites(`${blessed}const screen = blessed.screen();\nscreen.key('a', f); screen.key('b', g);`)).toEqual([
      [1, 'import'],
      [2, 'screen'],
      [3, 'key'],
    ]);
    expect(sites(`${blessed}const screen = blessed.screen();\nblessed.box({\n  x: screen.render(),\n}).key('q', f);`)).toEqual([
      [1, 'import'],
      [2, 'screen'],
      [3, 'box'],
      [4, 'render'],
      [5, 'key'],
    ]);
  });

  it('does not start an expression at a property name', () => {
    expect(sites(`${blessed}const screen = blessed.screen();\nother.screen.key('q', f);`)).toEqual([
      [1, 'import'],
      [2, 'screen'],
    ]);
  });
});

describe("terminal-kit's grabInput", () => {
  it('reports the mouse only for a mouse option inside its own parentheses', () => {
    expect(sites(`${term}term.grabInput({ mouse: 'button' });`)).toEqual([
      [1, 'import'],
      [2, 'key'],
      [2, 'mouse'],
    ]);
    expect(sites(`${term}term.grabInput(f(1), {\n  mouse: 'button' });`)).toContainEqual([3, 'mouse']);
    expect(sites(`${term}term.grabInput({ safe: true });\nfoo({ mouse: 1 });`)).toEqual([
      [1, 'import'],
      [2, 'key'],
    ]);
    expect(sites(`${term}term.grabInput(true)\nmouse: for (;;) break mouse;`)).toEqual([
      [1, 'import'],
      [2, 'key'],
    ]);
  });

  it('reads no other method’s options', () => {
    expect(sites(`${blessed}const screen = blessed.screen();\nscreen.key('q', () => ({ mouse: 1 }));`)).not.toContainEqual([3, 'mouse']);
  });
});

describe('binding a name', () => {
  it('binds an assignment target only when it is a plain name', () => {
    expect(sites(`${blessed}a.b = blessed.screen();\nb.key('q', f);`)).toEqual([
      [1, 'import'],
      [2, 'screen'],
    ]);
    expect(sites(`${blessed}a[0] = blessed.screen();\na[1].key('q', f);`)).toEqual([
      [1, 'import'],
      [2, 'screen'],
    ]);
  });

  it('keeps a binding through a later assignment it cannot follow', () => {
    expect(sites(`${blessed}let box = blessed.box;\nvoid ({ nothing: box } = blessed);\nbox();`)).toContainEqual([4, 'box']);
    expect(sites(`${blessed}let screen = blessed.screen();\nscreen = other();\nscreen.render();`)).toContainEqual([4, 'render']);
  });

  it('skips a destructured element with a default', () => {
    expect(sites(`${blessed}const { box: b = x } = blessed;\nb();`)).toEqual([[1, 'import']]);
    expect(sites(`${blessed}const { box = make } = blessed;\nmake();`)).toEqual([[1, 'import']]);
  });
});

describe('an import clause', () => {
  it('binds a default import named type, and nothing from a type-only one', () => {
    expect(sites("import type from 'blessed';\ntype.screen();")).toEqual([
      [1, 'import'],
      [2, 'screen'],
    ]);
    expect(sites("import type * as blessed from 'blessed';\nblessed.screen();")).toEqual([[1, 'import']]);
  });

  it('binds what follows a default import, a namespace or named members', () => {
    expect(sites("import b, * as c from 'blessed';\nc.screen();")).toEqual([
      [1, 'import'],
      [2, 'screen'],
    ]);
    expect(sites("import b, { box } from 'blessed';\nbox();")).toEqual([
      [1, 'import'],
      [2, 'box'],
    ]);
    expect(sites("import { list, box as make } from 'blessed';\nmake();\nlist();")).toEqual([
      [1, 'import'],
      [2, 'box'],
      [3, 'list'],
    ]);
  });
});
