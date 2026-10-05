/**
 * `burgee migrate`'s guided rules — blessed, neo-blessed and terminal-kit (controlroom R18).
 *
 * Every rule reports and none rewrites, so each fixture is a source and the sites it must
 * produce: the line, the incumbent and the guide section. The idioms are each library's own
 * README shapes. The negative fixtures matter as much as the positive ones: a rule that
 * reported `screen.key(` by name would light up every file with a variable called `screen`,
 * and `.render(` on a React root, so each kind of evidence has a case where it is absent.
 *
 * Mutations, each red against a case below:
 *   M-g  method names matched without a binding (`.key(` anywhere in a file that imports blessed).
 *        → "reports nothing on a receiver the evidence does not bind"
 *   M-h  a guided file is rewritten, or its sites raise the exit code.
 *        → "reports a blessed project and leaves every byte of it alone"
 *   M-i  the lexer's `str` stand-in compared instead of the source text: a variable named
 *        `str` bound to blessed then matched every string literal.
 *        → "binds by source text, so a variable named str is not every string"
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import { BLESSED_FACTORIES, GUIDE_BASE, guideFor, guidedSites, hostOf, mentionsAGuided, METHODS, SECTIONS, TERMKIT_MEMBERS } from './migrate-guided.js';
import { migrate, tokensOf } from './migrate.js';

/** `[line, incumbent, pattern]` for every site in `source`. */
const sites = (source: string): [number, string, string][] => guidedSites(tokensOf(source)).map((s) => [s.line, s.from, s.pattern]);

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'burgee-migrate-guided-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const clean = (): undefined => undefined;

describe('blessed: screen, box, list, key handling and the render loop', () => {
  it("reports blessed's README program line by line", () => {
    const source = [
      "const blessed = require('blessed');",
      'const screen = blessed.screen({ smartCSR: true });',
      "const box = blessed.box({ top: 'center', left: 'center', content: 'Hello' });",
      "const list = blessed.list({ items: ['one', 'two'], keys: true });",
      'screen.append(box);',
      "screen.key(['escape', 'q', 'C-c'], () => process.exit(0));",
      "box.key('enter', () => box.setContent('pressed'));",
      'screen.render();',
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'screen'],
      [3, 'blessed', 'box'],
      [4, 'blessed', 'list'],
      [6, 'blessed', 'key'],
      [7, 'blessed', 'key'],
      [8, 'blessed', 'render'],
    ]);
  });

  it('follows the alternate buffer through screen.program and through a program of its own', () => {
    const source = [
      "import * as blessed from 'blessed';",
      'const screen = new blessed.Screen();',
      'screen.program.alternateBuffer();',
      'const program = blessed.program();',
      'program.normalBuffer();',
      "program.key('q', quit);",
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'screen'],
      [3, 'blessed', 'alternate-screen'],
      [4, 'blessed', 'screen'],
      [5, 'blessed', 'alternate-screen'],
      [6, 'blessed', 'key'],
    ]);
  });

  it('reads key events off on() and once(), and the event names that are not keys as nothing', () => {
    const source = [
      "import blessed from 'blessed';",
      'const screen = blessed.screen();',
      "screen.on('keypress', (ch, key) => {});",
      "screen.once('key q', quit);",
      "screen.on('resize', relayout);",
      'screen.on(handler);',
      "screen.onceKey('x', quit);",
      "screen.unkey('x', quit);",
      "screen.removeKey('x', quit);",
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'screen'],
      [3, 'blessed', 'key'],
      [4, 'blessed', 'key'],
      [7, 'blessed', 'key'],
      [8, 'blessed', 'key'],
      [9, 'blessed', 'key'],
    ]);
  });

  it('binds destructured factories, renamed or not, from require and from import', () => {
    const required = ["const { screen: makeScreen, list, log = fallback } = require('blessed');", 'const s = makeScreen();', 'list({});', 'log({});', "s.key('q', quit);"].join('\n');
    expect(sites(required)).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'screen'],
      [3, 'blessed', 'list'],
      [5, 'blessed', 'key'],
    ]);
    const imported = ["import blessed, { textbox, box as makeBox, type Widgets } from 'blessed';", 'textbox({});', 'makeBox({});', 'blessed.textarea({});'].join('\n');
    expect(sites(imported)).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'text-input'],
      [3, 'blessed', 'box'],
      [4, 'blessed', 'text-input'],
    ]);
  });

  it('reports the mouse, which has no controlroom equivalent, wherever the evidence reaches it', () => {
    const source = [
      "const blessed = require('blessed');",
      'const screen = blessed.screen();',
      'screen.enableMouse();',
      'const box = blessed.box({});',
      "box.on('click', open);",
      "box.on('focus', open);",
      'box.screen.render();',
      'box.enableMouse();',
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'screen'],
      [3, 'blessed', 'mouse'],
      [4, 'blessed', 'box'],
      [5, 'blessed', 'mouse'],
      [7, 'blessed', 'render'],
      [8, 'blessed', 'mouse'],
    ]);
  });
});

describe('neo-blessed: the same rules, pointed at its own guide', () => {
  it('names neo-blessed as the incumbent and links its guide', () => {
    const found = guidedSites(tokensOf("import blessed from 'neo-blessed';\nconst screen = blessed.screen();\nscreen.key('q', quit);\n"));
    expect(found.map((s) => [s.line, s.from, s.pattern])).toEqual([
      [1, 'neo-blessed', 'import'],
      [2, 'neo-blessed', 'screen'],
      [3, 'neo-blessed', 'key'],
    ]);
    expect(found[2]?.guide).toBe(`${GUIDE_BASE}/neo-blessed#key-handling`);
  });
});

describe('terminal-kit: fullscreen, grabInput, key events, menus and screen buffers', () => {
  it("reports terminal-kit's README program line by line", () => {
    const source = [
      "const term = require('terminal-kit').terminal;",
      'term.fullscreen(true);',
      "term.grabInput({ mouse: 'button' });",
      "term.on('key', (name) => { if (name === 'CTRL_C') term.processExit(0); });",
      "term.on('mouse', (name, data) => {});",
      "term.singleColumnMenu(['a', 'b'], (error, response) => {});",
      'term.inputField({}, (error, input) => {});',
      'const width = term.width;',
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'terminal-kit', 'import'],
      [2, 'terminal-kit', 'alternate-screen'],
      [3, 'terminal-kit', 'key'],
      [3, 'terminal-kit', 'mouse'],
      [4, 'terminal-kit', 'key'],
      [5, 'terminal-kit', 'mouse'],
      [6, 'terminal-kit', 'list'],
      [7, 'terminal-kit', 'text-input'],
    ]);
  });

  it('follows the module through ESM, destructuring, createTerminal and a ScreenBuffer', () => {
    const source = [
      "import termkit from 'terminal-kit';",
      'const term = termkit.terminal;',
      'const buffer = new termkit.ScreenBuffer({ dst: term });',
      'buffer.draw({ delta: true });',
      'const { terminal: t2, realTerminal } = termkit;',
      't2.gridMenu([]);',
      'const t3 = termkit.createTerminal();',
      't3.fullscreen(false);',
      'realTerminal.singleLineMenu([]);',
      'termkit.nothing.here();',
      'term.grabInput(mouse);',
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'terminal-kit', 'import'],
      [3, 'terminal-kit', 'screen'],
      [4, 'terminal-kit', 'render'],
      [6, 'terminal-kit', 'list'],
      [7, 'terminal-kit', 'screen'],
      [8, 'terminal-kit', 'alternate-screen'],
      [9, 'terminal-kit', 'list'],
      [11, 'terminal-kit', 'key'],
    ]);
  });

  it('keeps a call terminal-kit chains, so term() still holds the terminal', () => {
    expect(sites("const term = require('terminal-kit').terminal;\nconst t = term('hello');\nt.fullscreen(true);\n")).toEqual([
      [1, 'terminal-kit', 'import'],
      [3, 'terminal-kit', 'alternate-screen'],
    ]);
  });
});

describe('evidence, not names', () => {
  it('reports nothing on a receiver the evidence does not bind', () => {
    // M-g. The same method names, on things that did not come from blessed.
    const source = ["import blessed from 'blessed';", 'const screen = getScreen();', "screen.key('q', quit);", 'root.render(app);', "term.on('key', quit);", 'foo.bar = blessed.screen();', 'foo.bar.render();'].join('\n');
    expect(sites(source)).toEqual([
      [1, 'blessed', 'import'],
      [6, 'blessed', 'screen'],
    ]);
  });

  it('reports nothing at all in a file that imports none of the three', () => {
    expect(sites("import React from 'react';\nconst screen = blessed.screen();\nscreen.render();\nobj.blessed.box();\n")).toEqual([]);
    expect(sites("import chalk from 'chalk';\nimport './side-effect.js';\nconst u = import.meta.url;\nconst m = require(name);\nconst c = require('chalk');\n")).toEqual([]);
  });

  it('binds by source text, so a variable named str is not every string', () => {
    // M-i: with the lexer's `str` stand-in as the token text, `str` bound to blessed matched
    // `'screen'` — every quoted literal in the file — and reported it.
    expect(sites("const str = require('blessed');\nconst s = 'screen';\nconst t = `lit`;\nstr.box({});\n")).toEqual([
      [1, 'blessed', 'import'],
      [4, 'blessed', 'box'],
    ]);
  });

  it('binds nothing from a type-only import, and still reports the import', () => {
    expect(sites("import type { Widgets } from 'blessed';\nimport type Blessed from 'blessed';\nWidgets.screen();\nBlessed.screen();\n")).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'import'],
    ]);
  });

  it("reads TypeScript's import-equals, an awaited import(), a side-effect import and a deep import", () => {
    const source = [
      "import blessed = require('blessed');",
      'blessed.list({});',
      "const neo = await import('neo-blessed');",
      'neo.listbar({});',
      "import 'terminal-kit';",
      "const Box = require('blessed/lib/widgets/box');",
      'Box({});',
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'list'],
      [3, 'neo-blessed', 'import'],
      [4, 'neo-blessed', 'list'],
      [5, 'terminal-kit', 'import'],
      [6, 'blessed', 'import'],
    ]);
  });

  it('stops at what it cannot follow: an unknown member, a factory used as a value, a comparison', () => {
    const source = [
      "const blessed = require('blessed');",
      "blessed.colors.match('red');",
      'blessed.screen.call(null);',
      'const make = blessed.box;',
      'if (x == blessed) make();',
      'const other = blessed;',
      'other.list({});',
      'const screen = blessed.screen();',
      "screen.title = 'x';",
      'screen.append(blessed.text({ content: label(name) }));',
      "const { colors, box: makeBox } = require('blessed');",
      'colors.match(makeBox);',
    ].join('\n');
    expect(sites(source)).toEqual([
      [1, 'blessed', 'import'],
      [5, 'blessed', 'box'],
      [7, 'blessed', 'list'],
      [8, 'blessed', 'screen'],
      [10, 'blessed', 'box'],
      [11, 'blessed', 'import'],
    ]);
  });

  it('reports a site once, however many expressions reach it', () => {
    // `new blessed.Screen()` is reached from `new` and again from `blessed`.
    expect(sites("const blessed = require('blessed');\nconst s = new blessed.Screen();\n")).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'screen'],
    ]);
  });

  it('survives a file that ends mid-expression', () => {
    expect(sites("const blessed = require('blessed');\nconst s = blessed.screen(")).toEqual([
      [1, 'blessed', 'import'],
      [2, 'blessed', 'screen'],
    ]);
    expect(sites("const term = require('terminal-kit').terminal;\nterm.grabInput({ mouse")).toEqual([
      [1, 'terminal-kit', 'import'],
      [2, 'terminal-kit', 'key'],
    ]);
    expect(sites("const term = require('terminal-kit').terminal;\nterm.on(")).toEqual([[1, 'terminal-kit', 'import']]);
    expect(sites("const blessed = require('blessed');\nblessed.")).toEqual([[1, 'blessed', 'import']]);
    expect(sites("} = require('blessed');\nimport blessed")).toEqual([[1, 'blessed', 'import']]);
  });
});

describe('the tables', () => {
  it('links every pattern to a section, and every section is a slug', () => {
    // `scripts/migrate-guides-lock.test.ts` holds each section to a heading on each guide.
    for (const section of Object.values(SECTIONS)) expect(section).toMatch(/^[a-z]+(?:-[a-z]+)*$/u);
    expect(guideFor('terminal-kit', 'key')).toBe('https://burgee.interlace.tools/docs/coming-from/terminal-kit#key-handling');
  });

  it('keeps every factory and method on a pattern a guide has a section for', () => {
    const patterns = new Set(Object.keys(SECTIONS));
    const used = [...Object.values(BLESSED_FACTORIES).map(([, p]) => p), ...Object.values(TERMKIT_MEMBERS).flatMap((m) => (m === 'terminal' ? [] : [m[1]])), ...Object.values(METHODS).flatMap((m) => Object.values(m))];
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((p) => !patterns.has(p))).toEqual([]);
  });

  it('names the incumbent of a specifier, deep imports included, and nothing else', () => {
    expect([hostOf('blessed'), hostOf('neo-blessed'), hostOf('terminal-kit/lib/termconfig/xterm.js'), hostOf('blessed-contrib'), hostOf('chalk')]).toEqual(['blessed', 'neo-blessed', 'terminal-kit', undefined, undefined]);
  });

  it('pre-filters on the bytes and on the text alike', () => {
    expect([mentionsAGuided('blessed'), mentionsAGuided('terminal-kit'), mentionsAGuided('ink')]).toEqual([true, true, false]);
    expect([mentionsAGuided(Buffer.from('neo-blessed')), mentionsAGuided(Buffer.from('ink'))]).toEqual([true, false]);
  });
});

describe('burgee migrate over a blessed project', () => {
  it('reports a blessed project and leaves every byte of it alone', async () => {
    // M-h. The guided file is not rewritten, its sites are not refusals, and the exit code is
    // OK. The chalk import beside it still moves: the two are independent.
    const ui = "const blessed = require('blessed');\nconst screen = blessed.screen();\nscreen.key('q', quit);\n";
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { blessed: '^0.1.81', chalk: '^6.0.0' } }),
      'src/ui.js': ui,
      'src/log.js': "import chalk from 'chalk';\n// blessed is mentioned here, in a comment only\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(readFileSync(join(dir, 'src/ui.js'), 'utf8')).toBe(ui);
    expect(readFileSync(join(dir, 'src/log.js'), 'utf8')).toContain("from 'roundel/chalk'");
    expect(report.refused).toEqual([]);
    expect(report.exitCode).toBe(ExitCode.OK);
    expect(report.guided).toEqual([
      { file: 'src/ui.js', line: 1, from: 'blessed', pattern: 'import', guide: `${GUIDE_BASE}/blessed#the-mapping` },
      { file: 'src/ui.js', line: 2, from: 'blessed', pattern: 'screen', guide: `${GUIDE_BASE}/blessed#screen` },
      { file: 'src/ui.js', line: 3, from: 'blessed', pattern: 'key', guide: `${GUIDE_BASE}/blessed#key-handling` },
    ]);
  });
});
