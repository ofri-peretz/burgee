/**
 * R2/R4 — the four remaining built-ins, each the same shape a third-party plugin writes.
 *
 * The assertions that matter are the static ones. Every one of these components draws
 * something on a terminal that is unreadable off it — a bar of blocks, a grid of box
 * characters — and R1 says the static projection is what a pipe, an agent and a screen
 * reader get. So each case checks the static line *is the information*, not a stripped
 * version of the drawing, and R5 checks that nothing but text leaves in that mode.
 *
 * The width locks are the other half: `box` and `table` are string functions over `width()`
 * (R7), and a drawing that overruns the width it was given is the bug that function exists
 * to prevent — so every drawn row is measured, wide characters and all.
 */
import cliBoxes from 'cli-boxes';
import cliSpinners from 'cli-spinners';
import { width } from 'linegauge';
import { flown } from 'roundel/policy';
import { describe, expect, it, vi } from 'vitest';

import { box, boxComponent } from './box.js';
import { builtins } from './builtins.js';
import { STATIC } from './link.js';
import { hoist, manualClock, type Runtime } from './loop.js';
import { type Component, register } from './plugin.js';
import { progress } from './progress.js';
import { table, tableComponent } from './table.js';
import { tasks } from './tasks.js';

const ESCAPE = /[\r\u001B]/;

/** Widest drawn row, measured — what a terminal actually needs to render it unbroken. */
const drawnWidth = (drawing: string): number => Math.max(...drawing.split('\n').map((line) => width(line)));

/** A pipe: not a terminal, so `hoist` takes the static path. */
function piped() {
  const out: string[] = [];
  const rt: Runtime = { env: {}, isTTY: { stdout: false }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => undefined }, clock: manualClock() };
  return { rt, text: () => out.join('') };
}

describe('the built-in plugin', () => {
  it.each(['dots', 'line'] as const)('the %s spinner is cli-spinners’ own, frame for frame', (name) => {
    const { frames, interval } = cliSpinners[name];
    expect(builtins.spinners?.[name]).toEqual({ frames, interval, static: '…' });
  });

  it.each(['round', 'single', 'double', 'bold', 'classic'] as const)('the %s border is cli-boxes’ own, piece for piece', (name) => {
    expect(builtins.borders?.[name]).toEqual(cliBoxes[name]);
  });

  it('the none border draws nothing at all, so a box without one is its padded text', () => {
    expect(Object.values(builtins.borders?.['none'] ?? {}).join('')).toBe('');
    expect(Object.keys(builtins.borders?.['none'] ?? {})).toHaveLength(8);
    expect(box('x', { border: 'none', width: 5 })).toBe(' x   ');
  });
});

describe('progress', () => {
  it('the static line is the count and the percentage — the numbers, not the bar', () => {
    const p = progress();
    expect(p.static({ done: 12, total: 30, label: 'files' })).toBe('12/30 files · 40%');
    expect(p.static({ done: 0, total: 4 })).toBe('0/4 · 0%');
    expect(p.static({ done: 4, total: 4 })).toBe('4/4 · 100%');
  });

  it('clamps a count outside its total rather than drawing past the end', () => {
    const p = progress({ width: 10 });
    expect(p.static({ done: 9, total: 4 })).toBe('9/4 · 100%');
    expect(p.static({ done: -1, total: 4 })).toBe('-1/4 · 0%');
    // A total of zero is complete, not NaN.
    expect(p.static({ done: 0, total: 0 })).toBe('0/0 · 100%');
    expect(drawnWidth(p.frame?.(0, { done: 9, total: 4 }) ?? '')).toBe(10 + ' 9/4'.length);
    // A total of one is a total, not the empty one.
    expect(p.static({ done: 0, total: 1 })).toBe('0/1 · 0%');
  });

  it('fills the bar in proportion, 24 cells by default, and an empty label is no label', () => {
    expect(progress({ width: 10 }).frame?.(0, { done: 1, total: 2 })).toBe('█████░░░░░ 1/2');
    expect(progress().frame?.(0, { done: 1, total: 4 })).toBe(`${'█'.repeat(6)}${'░'.repeat(18)} 1/4`);
    expect(progress().static({ done: 1, total: 2, label: '' })).toBe('1/2 · 50%');
    expect(progress().name).toBe('progress');
  });

  it('the drawn bar is exactly the width it was given', () => {
    for (const done of [0, 1, 3, 7, 10]) {
      const frame = progress({ width: 20 }).frame?.(0, { done, total: 10 }) ?? '';
      expect(drawnWidth(frame), `done=${done}`).toBe(20 + ` ${done}/10`.length);
    }
  });
});

describe('tasks', () => {
  const three = {
    tasks: [
      { title: 'install', status: 'ok' as const },
      { title: 'build', status: 'running' as const, detail: 'compiling' },
      { title: 'test' },
    ],
  };

  it('the static projection is only what has settled — a pipe is not told twice', () => {
    expect(tasks().static(three)).toBe('✔ install');
    expect(tasks().static({ tasks: [] })).toBe('');
  });

  it('on a terminal, a settled task shows its glyph, a running one its spinner frame at t, a pending one muted', () => {
    expect(tasks().name).toBe('tasks');
    expect(tasks().frame?.(0, { tasks: [{ title: 'a', status: 'ok' }] })).toBe('✔ a');
    // 880 ms is the eleventh step of dots' ten frames: the second frame again.
    expect(tasks().frame?.(880, { tasks: [{ title: 'b', status: 'running' }] })).toBe('⠙ b');
    flown.level = 1;
    flown.paint = { muted: ['dim'] };
    try {
      expect(tasks().frame?.(0, { tasks: [{ title: 'p' }, { title: 'a', status: 'ok' }] })).toBe('\u001B[2m \u001B[22m \u001B[2mp\u001B[22m\n✔ a');
    } finally {
      flown.level = 0;
      flown.paint = {};
    }
  });

  it('every settled status gets its glyph, in order', () => {
    const state = { tasks: [{ title: 'a', status: 'ok' as const }, { title: 'b', status: 'fail' as const }, { title: 'c', status: 'warn' as const }, { title: 'd', status: 'info' as const }] };
    expect(tasks().static(state)).toBe('✔ a\n✖ b\n⚠ c\nℹ d');
  });

  it('the frame draws every task, and the detail only under the running one', () => {
    const frame = tasks().frame?.(0, three) ?? '';
    expect(frame.split('\n')).toHaveLength(4);
    expect(frame).toContain('compiling');
    expect(tasks().frame?.(0, { tasks: [{ title: 'x', status: 'ok', detail: 'hidden' }] })).not.toContain('hidden');
  });

  it('a clock that steps backwards draws a blank frame for the running task, never `undefined`', () => {
    // `t` is the caller's clock minus the hoist time; a wall clock corrected backwards makes it
    // negative, and a negative index has no frame.
    expect(tasks().frame?.(-1, { tasks: [{ title: 'build', status: 'running' }] })).toBe(' build');
  });

  it('hoisted on a pipe, each settling prints one line and nothing is printed twice', () => {
    const w = piped();
    const flag = hoist(tasks(), w.rt, { tasks: [{ title: 'a' }, { title: 'b' }] });
    flag.update({ tasks: [{ title: 'a', status: 'running' }, { title: 'b' }] });
    flag.update({ tasks: [{ title: 'a', status: 'ok' }, { title: 'b', status: 'running' }] });
    flag.lower({ tasks: [{ title: 'a', status: 'ok' }, { title: 'b', status: 'ok' }] });
    expect(w.text()).toBe('✔ a\n✔ b\n');
    expect(w.text()).not.toMatch(ESCAPE);
  });

  it('a growing list never repeats a line, however many times it changes', () => {
    const w = piped();
    const titles = ['a', 'b', 'c', 'd'];
    const at = (settled: number) => ({ tasks: titles.map((title, i) => ({ title, ...(i < settled ? { status: 'ok' as const } : {}) })) });
    const flag = hoist(tasks(), w.rt, at(0));
    for (let settled = 1; settled <= titles.length; settled += 1) flag.update(at(settled));
    flag.lower(at(titles.length));
    const lines = w.text().trimEnd().split('\n');
    expect(lines).toEqual(['✔ a', '✔ b', '✔ c', '✔ d']);
    expect(new Set(lines).size, 'a line was printed twice').toBe(lines.length);
  });

  it('the pending mark is the `pending` glyph, a space until a plugin replaces it (controlroom R3)', () => {
    const waiting = { tasks: [{ title: 'test' }] };
    expect(tasks().frame?.(0, waiting)).toBe('  test');
    register({ name: 'boxes', glyphs: { pending: '◻' } });
    try {
      expect(tasks().frame?.(0, waiting)).toBe('◻ test');
      // Still nothing off a terminal: a task that has not started has not settled.
      expect(tasks().static(waiting)).toBe('');
    } finally {
      register({ name: 'flagstaff', glyphs: { pending: ' ' } });
    }
  });

  it('a component with nothing to say yet costs no blank line', () => {
    const w = piped();
    const flag = hoist(tasks(), w.rt, { tasks: [{ title: 'a' }] });
    flag.update({ tasks: [{ title: 'a', status: 'running' }] });
    expect(w.text()).toBe('');
    flag.lower({ tasks: [{ title: 'a', status: 'ok' }] });
    expect(w.text()).toBe('✔ a\n');
  });
});

describe('box', () => {
  it('draws the border it was asked for, at the width it was given', () => {
    expect(box('hi', { width: 10 })).toBe(['╭────────╮', '│ hi     │', '╰────────╯'].join('\n'));
    expect(box('hi', { width: 10, border: 'classic' })).toBe(['+--------+', '| hi     |', '+--------+'].join('\n'));
  });

  it('sets a title into the top border, and cuts one that does not fit', () => {
    const titled = box('x', { width: 20, title: 'build' }).split('\n')[0] ?? '';
    expect(titled).toBe('╭─ build ──────────╮');
    expect(width(titled)).toBe(20);
    const cut = box('x', { width: 12, title: 'a very long title' }).split('\n')[0] ?? '';
    expect(cut).toContain('…');
    expect(width(cut)).toBe(12);
  });

  it('wraps text too wide for the box, and pads every row to the same width', () => {
    const drawn = box('the quick brown fox jumps', { width: 16 });
    expect(drawnWidth(drawn)).toBe(16);
    for (const line of drawn.split('\n')) expect(width(line)).toBe(16);
  });

  it.each([10, 16, 24, 40])('a wide-character body still fits exactly %i columns', (columns) => {
    const drawn = box('古池や蛙飛び込む水の音', { width: columns });
    for (const line of drawn.split('\n')) expect(width(line)).toBe(columns);
  });

  it('the component says the text off a terminal, and draws only on one', () => {
    const component = boxComponent({ width: 20 });
    expect(component.static({ text: 'done', title: 'build' })).toBe('build: done');
    expect(component.static({ text: 'done' })).toBe('done');
    expect(component.frame?.(0, { text: 'done' })).toContain('╭');
  });

  it('draws with a style object passed inline, and a style with no run on a side draws no border there', () => {
    // No top or bottom run, no sides: corners alone are not a border, so neither row is drawn,
    // and with no side cells the whole width is the text and its padding.
    const open = { topLeft: '┌', top: '', topRight: '┐', left: '', right: '', bottomLeft: '└', bottom: '', bottomRight: '┘' };
    expect(box('hi', { width: 6, border: open })).toBe(' hi   ');
    expect(box('hi', { width: 6, border: { ...open, top: '─', bottom: '─' } })).toBe(['┌──────┐', ' hi   ', '└──────┘'].join('\n'));
  });

  it('a title with no room for even one character is left out, not drawn as a lone ellipsis', () => {
    // Four inner cells leave 0 for the title once its spaces and border run are paid; five leave 1.
    expect(box('x', { width: 6, title: 'abc' }).split('\n')[0]).toBe('╭────╮');
    expect(box('x', { width: 6, title: 'T' }).split('\n')[0]).toBe('╭────╮');
    // A title exactly as wide as its room is drawn whole, not cut.
    expect(box('x', { width: 10, title: 'abcd' }).split('\n')[0]).toBe('╭─ abcd ─╮');
    expect(box('x', { width: 7, title: 'abc' }).split('\n')[0]).toBe('╭─────╮');
    // Two cells is the first room a cut title has: one character and the ellipsis.
    expect(box('x', { width: 8, title: 'abc' }).split('\n')[0]).toBe('╭─ a… ─╮');
  });

  it('is 80 columns wide by default, and keeps a cell of border run and of text however narrow it is asked to be', () => {
    expect(box('x').split('\n').map((line) => width(line))).toEqual([80, 80, 80]);
    expect(box('x', { width: 2 })).toBe(['╭─╮', '│ x │', '╰─╯'].join('\n'));
    expect(box('x', { width: 4 })).toBe(['╭──╮', '│ x │', '╰──╯'].join('\n'));
    expect(box('', { width: 4 })).toBe(['╭──╮', '│   │', '╰──╯'].join('\n'));
  });

  it('keeps the spaces a body starts with: indentation is content', () => {
    expect(box('  x', { width: 10 }).split('\n')[1]).toBe('│   x    │');
  });

  it('an empty title is no title, on the terminal and off it', () => {
    expect(boxComponent({ width: 10 }).static({ text: 'x', title: '' })).toBe('x');
    expect(box('x', { width: 10, title: '' }).split('\n')[0]).toBe('╭────────╮');
  });

  it('is the component named `box`, the event its JSON lines carry', () => {
    expect(boxComponent().name).toBe('box');
  });

  it('vertical padding is blank rows inside the border, the full width', () => {
    expect(box('hi', { width: 10, padding: { y: 1 } })).toBe(['╭────────╮', '│        │', '│ hi     │', '│        │', '╰────────╯'].join('\n'));
  });

  it('the drawn frame takes the title and the destination from the state', () => {
    const component = boxComponent({ width: 30, terminal: STATIC });
    expect(component.frame?.(0, { text: 'done', title: 'build' }).split('\n')[0]).toContain('╭─ build ─');
    // Off OSC 8 the destination is written out after the text, so the frame carries it.
    expect(component.frame?.(0, { text: 'doc', href: 'https://x.y' })).toContain('doc (https://x.y)');
    expect(component.frame?.(0, { text: 'doc' })).not.toContain('https://x.y');
  });

  it('a state with no title or destination keeps the ones the component was built with', () => {
    const component = boxComponent({ width: 30, terminal: STATIC, title: 'T', href: 'https://x.y' });
    expect(component.frame?.(0, { text: 'doc' })).toBe(['╭─ T ────────────────────────╮', '│ doc (https://x.y)          │', '╰────────────────────────────╯'].join('\n'));
  });

  it('on a terminal that does OSC 8, an empty destination and a blank padding row carry no link', () => {
    const live = { env: { TERM_PROGRAM: 'iTerm.app' }, isTTY: { stdout: true } };
    expect(box('x', { href: '', terminal: live, width: 8 })).toBe(['╭──────╮', '│ x    │', '╰──────╯'].join('\n'));
    expect(box('x', { href: 'https://a', padding: { y: 1 }, terminal: live, width: 8 })).toBe(
      ['╭──────╮', '│      │', '│ \u001B]8;;https://a\u0007x\u001B]8;;\u0007    │', '│      │', '╰──────╯'].join('\n'),
    );
  });

  it('with no terminal given, asks the process: OSC 8 where stdout is a terminal that does it, the url written out where it is not', () => {
    const was = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      expect(box('x', { href: 'https://a', width: 8 }).split('\n')[1]).toBe('│ \u001B]8;;https://a\u0007x\u001B]8;;\u0007    │');
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
      expect(box('x', { href: 'https://a', width: 20 }).split('\n')[1]).toBe('│ x (https://a)    │');
    } finally {
      if (was === undefined) Reflect.deleteProperty(process.stdout, 'isTTY');
      else Object.defineProperty(process.stdout, 'isTTY', was);
      vi.unstubAllEnvs();
    }
  });
});

describe('table', () => {
  const rows = [['ora', '99'], ['log-update', '99']];

  it('draws a grid whose every row is the same measured width', () => {
    const drawn = table(rows, { head: ['host', 'tests'], width: 40 });
    const widths = new Set(drawn.split('\n').map((line) => width(line)));
    expect(widths.size).toBe(1);
    expect(drawnWidth(drawn)).toBeLessThanOrEqual(40);
  });

  it.each([20, 40, 80])('never overruns the %i columns it was given, even with a wide cell', (columns) => {
    const drawn = table([['古池や蛙飛び込む水の音', 'x'], ['a', 'b']], { head: ['句', 'n'], width: columns });
    expect(drawnWidth(drawn)).toBeLessThanOrEqual(columns);
  });

  it('a cell too wide for its column wraps inside it rather than pushing the grid out', () => {
    const drawn = table([['a very long cell indeed', 'x']], { head: ['one', 'two'], width: 24 });
    expect(drawnWidth(drawn)).toBeLessThanOrEqual(24);
    expect(drawn.split('\n').length).toBeGreaterThan(5);
  });

  it('a row shorter than the others is drawn with empty cells', () => {
    expect(table([['a', 'b'], ['c']], { width: 20 })).toBe(['┌───┬───┐', '│ a │ b │', '│ c │   │', '└───┴───┘'].join('\n'));
  });

  it('aligns right where asked', () => {
    const drawn = table([['a', '1'], ['b', '22']], { head: ['k', 'n'], width: 20, align: ['left', 'right'] });
    expect(drawn).toContain('│  1 │');
    expect(drawn).toContain('│ 22 │');
  });

  it('the component emits header-and-value pairs off a terminal, not the grid', () => {
    const component = tableComponent({ head: ['host', 'tests'] });
    expect(component.static({ rows })).toBe('host: ora, tests: 99\nhost: log-update, tests: 99');
    // No `head` in the state: the component's own option is what it falls back to.
    expect(component.static({ rows: [['a', 'b']] })).toBe('host: a, tests: b');
    expect(component.frame?.(0, { rows })).toContain('┌');
  });

  it('with no header at all, the pairs fall back to tab-separated values', () => {
    expect(tableComponent().static({ rows })).toBe('ora\t99\nlog-update\t99');
  });

  it('too wide, the widest column gives way wherever it sits — not only the first', () => {
    // Natural widths 1 and 30 in 20 columns: only the second can shrink, and it must.
    const drawn = table([['a', 'b'.repeat(30)]], { width: 20 });
    for (const line of drawn.split('\n')) expect(width(line)).toBe(20);
    expect(drawn.split('\n')[1]).toBe(`│ a │ ${'b'.repeat(12)} │`);
  });

  it('a row shorter than the others draws blank cells, not `undefined`', () => {
    const drawn = table([['a', 'b'], ['c']], { width: 20 });
    expect(drawn).not.toContain('undefined');
    expect(drawn.split('\n')[2]).toBe('│ c │   │');
  });

  it('a column past the last header is labelled by its index off a terminal', () => {
    expect(tableComponent({ head: ['k'] }).static({ rows: [['a', 'b']] })).toBe('k: a, 1: b');
  });

  it('the drawn frame takes its header from the state when the state has one', () => {
    const frame = tableComponent({ head: ['from-options'] }).frame?.(0, { head: ['from-state'], rows: [['x']] }) ?? '';
    expect(frame).toContain('from-state');
    expect(frame).not.toContain('from-options');
  });
});

describe('R5 · every built-in is text off a terminal', () => {
  it.each([
    ['progress', progress(), { done: 1, total: 2 }],
    ['tasks', tasks(), { tasks: [{ title: 'a', status: 'ok' as const }] }],
    ['box', boxComponent(), { text: 'hi', title: 't' }],
    ['table', tableComponent({ head: ['a'] }), { rows: [['1']] }],
  ])('%s writes no carriage return and no escape on a pipe', (_name, component, state) => {
    const w = piped();
    // One table, four state shapes: the cast is the table's, not the component's.
    const flag = hoist(component as Component<unknown>, w.rt, state);
    flag.lower(state);
    expect(w.text()).not.toMatch(ESCAPE);
    expect(w.text().length).toBeGreaterThan(0);
  });
});
