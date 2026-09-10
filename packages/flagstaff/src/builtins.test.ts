import { width } from 'linegauge';
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
import { describe, expect, it } from 'vitest';

import { box, boxComponent } from './box.js';
import { hoist, manualClock, type Runtime } from './loop.js';
import { type Component } from './plugin.js';
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
