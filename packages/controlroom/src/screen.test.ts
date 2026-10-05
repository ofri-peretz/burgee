import { PassThrough } from 'node:stream';

import { manualClock } from 'flagstaff/loop';
import { type Component, register as registerFlagstaff } from 'flagstaff/plugin';
import { describe, expect, it, vi } from 'vitest';

import { type Layout } from './layout.js';
import { register } from './plugin.js';
import { processRuntime, type Runtime } from './runtime.js';
import { open, type ScreenOptions } from './screen.js';

const ESC = '\u001B';
const SYNC = `${ESC}[?2026h`;
const ALT_ON = `${ESC}[?1049h`;
const ALT_OFF = `${ESC}[?1049l`;
const HIDE = `${ESC}[?25l`;
const SHOW = `${ESC}[?25h`;

const text: Component<string> = { name: 'text', static: (s) => s };
const spinner: Component<string> = { name: 'spin', static: (s) => `✔ ${s}`, frame: (t, s) => `${['|', '/'][Math.floor(t / 100) % 2]} ${s}`, interval: 100 };

const nothing = (): void => undefined;

/**
 * Just enough of a terminal to read back what a screen left behind: the lines a person would
 * see, scrollback included, after replaying every byte written. It understands the sequences
 * flagstaff's frame writer and closeout emit (cursor moves, erases, save and restore) and
 * ignores modes and colour. It does not wrap: a frame is never wider than its terminal.
 */
function replay(bytes: string): string[] {
  const lines: string[] = [''];
  let row = 0;
  let col = 0;
  let saved = { row: 0, col: 0 };
  const put = (ch: string): void => {
    const line = (lines[row] ?? '').padEnd(col);
    lines[row] = line.slice(0, col) + ch + line.slice(col + 1);
    col += 1;
  };
  const tokens = bytes.matchAll(/\u001B\[([?\d;]*)([A-Za-z])|\u001B([78])|(\n)|(\r)|([^\u001B\n\r])/gu);
  for (const [, args = '', op, dec, nl, cr, ch] of tokens) {
    const n = Number.parseInt(args, 10) || 1;
    if (ch !== undefined) put(ch);
    else if (nl !== undefined) {
      row += 1;
      col = 0;
      lines[row] ??= '';
    } else if (cr !== undefined) col = 0;
    else if (dec === '7') saved = { row, col };
    else if (dec === '8') ({ row, col } = saved);
    else if (op === 'A') row = Math.max(0, row - n);
    else if (op === 'B') row += n;
    else if (op === 'G') col = n - 1;
    else if (op === 'K') lines[row] = '';
    else if (op === 'J') {
      lines[row] = (lines[row] ?? '').slice(0, col);
      lines.length = row + 1;
    }
  }
  return lines.map((line) => line.trimEnd());
}


const tree: Layout = { direction: 'column', parts: [{ size: 'fit', content: 'learn' }, { size: 'fit', content: 'tasks' }] };

function options(extra: Partial<ScreenOptions> = {}): ScreenOptions {
  return {
    layout: tree,
    panes: { learn: { component: text, state: 'read the docs', label: 'Learn' }, tasks: { component: text, state: '◻ install', label: 'Tasks' } },
    ...extra,
  };
}

interface Fake {
  rt: Runtime;
  out: string[];
  err: string[];
  stdin: PassThrough & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (raw: boolean) => void };
  raw: boolean[];
  resize: () => void;
  clock: ReturnType<typeof manualClock>;
}

/** A world: a terminal or not, a stdin that can go raw or not, and an environment. */
function fake({ tty = true, raw = true, env = {} as Record<string, string> } = {}): Fake {
  const out: string[] = [];
  const err: string[] = [];
  const modes: boolean[] = [];
  const stdin = Object.assign(new PassThrough(), raw ? { isTTY: true, isRaw: false, setRawMode: (on: boolean) => void modes.push(on) } : {});
  let onResize = nothing;
  const clock = manualClock();
  const rt: Runtime = {
    env,
    isTTY: { stdout: tty },
    stdout: {
      write: (s: string) => out.push(s),
      isTTY: tty,
      columns: 20,
      rows: 6,
      on: (_: 'resize', fn: () => void) => (onResize = fn),
      off: () => (onResize = nothing),
    },
    stderr: { write: (s: string) => err.push(s) },
    stdin,
    clock,
  };
  return { rt, out, err, stdin, raw: modes, resize: () => onResize(), clock };
}

const press = (f: Fake, bytes: string): void => void f.stdin.write(bytes);
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('R6 — the static session', () => {
  it('a pipe gets every pane under its label, in declared order, with no escape sequence at all', () => {
    const f = fake({ tty: false });
    const screen = open(f.rt, options());
    expect(screen.mode).toBe('pipe');
    expect(screen.interactive).toBe(false);
    screen.update('tasks', '◼ install');
    screen.close();
    const printed = f.out.join('');
    expect(printed).toBe('Learn\nread the docs\nTasks\n◻ install\n◼ install\n');
    expect(printed).not.toContain(ESC);
    expect(printed).not.toContain('\r');
  });

  it('committed text prints once, as it commits', () => {
    const f = fake({ tty: false });
    const screen = open(f.rt, options({ panes: {} }));
    screen.commit('one');
    screen.commit('two');
    screen.close();
    screen.close();
    expect(f.out.join('')).toBe('one\ntwo\n');
  });

  it('--json is NDJSON on stderr, one event per pane transition and per commit, and stdout stays empty', () => {
    const f = fake({ tty: true });
    const screen = open(f.rt, { ...options(), json: true });
    expect(screen.mode).toBe('json');
    screen.update('tasks', '◼ install');
    screen.commit('done');
    const events = f.err.join('').trim().split('\n').map((line) => JSON.parse(line) as unknown);
    expect(events).toContainEqual({ event: 'tasks', state: '◼ install' });
    expect(events).toContainEqual({ event: 'commit', state: 'done' });
    expect(f.out).toEqual([]);
  });

  it('accessible and ci are static too', () => {
    expect(open(fake({ env: { CLI_ACCESSIBLE: '1' } }).rt, options()).mode).toBe('accessible');
    expect(open(fake({ tty: false, env: { CI: 'true' } }).rt, options()).mode).toBe('ci');
  });

  it('R7 — a terminal whose stdin cannot go raw gets the static session, and never waits for a key', () => {
    const f = fake({ tty: true, raw: false });
    const screen = open(f.rt, options());
    expect(screen.interactive).toBe(false);
    expect(f.out.join('')).not.toContain(ESC);
    expect(f.stdin.listenerCount('keypress')).toBe(0);
  });

  it('dispatch is what a static session has instead of keys, and the program hears every action', () => {
    const heard: string[] = [];
    const screen = open(fake({ tty: false }).rt, options({ tabs: ['Status', 'Logs'], onAction: (a) => heard.push(a) }));
    screen.dispatch('tab.next');
    expect(screen.state.active).toBe(1);
    expect(heard).toEqual(['tab.next']);
  });

  it('updating a pane that does not exist throws instead of drawing nothing, live or not', () => {
    expect(() => open(fake({ tty: false }).rt, options()).update('nope', 1)).toThrow(/no pane named "nope"/u);
    const screen = open(fake().rt, options());
    expect(() => screen.update('nope', 1)).toThrow(/no pane named "nope"/u);
    screen.close();
  });

  it('R6 — a live-only pane (a hint line, a tab bar) is left out of the static projection, and updating it is a no-op', () => {
    const f = fake({ tty: false });
    const screen = open(f.rt, options({ panes: { hint: { component: text, state: '←→ switch tab', liveOnly: true }, body: { component: text, state: 'content' } } }));
    screen.update('hint', 'changed');
    screen.close();
    expect(f.out.join('')).toBe('content\n');
  });

  it('a pane with no label prints its projection alone', () => {
    const f = fake({ tty: false });
    open(f.rt, options({ panes: { bare: { component: text, state: 'just this' } } })).close();
    expect(f.out.join('')).toBe('just this\n');
  });
});

describe('R19 — inline, the default', () => {
  it('stays on the main screen, hides the cursor, and paints the live region in one synchronized write', () => {
    const f = fake();
    const screen = open(f.rt, options());
    expect(screen.interactive).toBe(true);
    const painted = f.out.join('');
    expect(painted).toContain(HIDE);
    expect(painted).toContain(SYNC);
    expect(painted).not.toContain(ALT_ON);
    expect(painted).toContain('read the docs');
    expect(f.raw).toEqual([true]);
    screen.close();
  });

  it('committed text is written once and never repainted; the live region is painted again under it', () => {
    const f = fake();
    const screen = open(f.rt, options());
    const opened = f.out.join('');
    f.out.length = 0;
    screen.commit('> hello');
    screen.update('tasks', '◼ install');
    screen.update('tasks', '◼ install, ◻ build');
    const after = f.out.join('');
    expect(after.split('> hello').length - 1).toBe(1);
    expect(after).toContain('◻ build');
    screen.close();
    // What the person sees, scrollback included: the commit took the live region's place,
    // once, and the region settled under it with its final state.
    expect(replay(opened + f.out.join(''))).toEqual(['> hello', 'read the docs', '◼ install, ◻ build', '']);
  });

  it('closing prints the final state once as its static projection, gives the cursor back and leaves raw mode', () => {
    const f = fake();
    const screen = open(f.rt, { ...options(), panes: { s: { component: spinner, state: 'build' } }, layout: { direction: 'column', parts: [{ size: 'fit', content: 's' }] } });
    f.out.length = 0;
    screen.close();
    screen.close();
    const out = f.out.join('');
    expect(out).toContain('✔ build');
    expect(out.endsWith(SHOW)).toBe(true);
    expect(f.raw).toEqual([true, false]);
  });

  it('an animated pane repaints on its own interval, and stops when the screen closes', () => {
    const f = fake();
    const screen = open(f.rt, { ...options(), panes: { s: { component: spinner, state: 'build' } }, layout: 's' });
    f.out.length = 0;
    f.clock.tick(100);
    expect(f.out.join('')).toContain('/ build');
    screen.close();
    f.out.length = 0;
    f.clock.tick(1000);
    expect(f.out).toEqual([]);
  });

  it('a resize lays out again at the new width', () => {
    const f = fake();
    const screen = open(f.rt, options());
    (f.rt.stdout as { columns: number }).columns = 8;
    f.out.length = 0;
    f.resize();
    expect(f.out.join('')).toContain('read th');
    expect(f.out.join('')).not.toContain('read the docs');
    screen.close();
  });
});

describe('a terminal that does not report its size', () => {
  it('is drawn at 80 × 24, and an animated pane with no interval of its own repaints at flagstaff\'s 80 ms', () => {
    const f = fake();
    const stdout = f.rt.stdout as { columns?: number; rows?: number };
    delete stdout.columns;
    delete stdout.rows;
    const bare: Component<string> = { name: 'bare', static: (s) => s, frame: (t) => `t=${t}` };
    const screen = open(f.rt, { layout: { direction: 'column', parts: [{ size: 1, content: 'b' }] }, panes: { b: { component: bare, state: '' } }, screen: 'alternate' });
    f.out.length = 0;
    f.clock.tick(80);
    expect(f.out.join('')).toContain(`t=80${' '.repeat(76)}`);
    screen.close();
  });
});

describe('R4 — the alternate screen', () => {
  it('enters it, and on close leaves it and hands committed text to the main screen', () => {
    const f = fake();
    const screen = open(f.rt, options({ screen: 'alternate' }));
    expect(f.out.join('')).toContain(ALT_ON);
    screen.commit('kept for later');
    expect(f.out.join('')).not.toContain('kept for later');
    screen.close();
    const out = f.out.join('');
    expect(out.indexOf(ALT_OFF)).toBeGreaterThan(-1);
    expect(out.indexOf('kept for later')).toBeGreaterThan(out.indexOf(ALT_OFF));
  });

  it('with nothing committed, closing leaves the main screen as it was', () => {
    const f = fake();
    const screen = open(f.rt, options({ screen: 'alternate' }));
    screen.close();
    expect(f.out.join('').split(ALT_OFF)[1]).toBe(SHOW);
  });
});

describe('keys — routed through the keymap, as data', () => {
  it('a bound key runs its action, repaints, and the program hears it', async () => {
    const f = fake();
    const heard: string[] = [];
    const screen = open(f.rt, options({ tabs: ['Status', 'Logs'], keymap: { right: 'tab.next' }, onAction: (a) => heard.push(a) }));
    press(f, `${ESC}[C`);
    press(f, 'x');
    await flush();
    expect(screen.state.active).toBe(1);
    expect(heard).toEqual(['tab.next']);
    screen.close();
  });

  it('the layout can be a function of the state, so a tab changes what is shown', async () => {
    const f = fake();
    const screen = open(f.rt, options({ tabs: ['Learn', 'Tasks'], keymap: { right: 'tab.next' }, layout: (s) => (s.active === 0 ? 'learn' : 'tasks') }));
    f.out.length = 0;
    press(f, `${ESC}[C`);
    await flush();
    expect(f.out.join('')).toContain('◻ install');
    screen.close();
  });

  it('a toggle collapses a pane out of the frame', async () => {
    const f = fake();
    const screen = open(f.rt, options({ keymap: { s: 'toggle:learn' } }));
    f.out.length = 0;
    press(f, 's');
    await flush();
    expect(screen.state.collapsed.has('learn')).toBe(true);
    expect(f.out.join('')).not.toContain('read the docs');
    screen.close();
  });

  it('ctrl+c is quit unless the keymap binds it: the screen closes and the terminal is restored', async () => {
    const f = fake();
    const heard: string[] = [];
    const screen = open(f.rt, options({ onAction: (a) => heard.push(a) }));
    press(f, '\u0003');
    await flush();
    expect(heard).toEqual(['quit']);
    expect(f.raw).toEqual([true, false]);
    screen.dispatch('tab.next');
    expect(heard).toEqual(['quit']);
  });
});

describe('R10 — registered keymaps and panes', () => {
  it('the default keymap is the registered one: arrows switch tabs with no keymap passed', async () => {
    const f = fake();
    const screen = open(f.rt, options({ tabs: ['A', 'B'] }));
    press(f, `${ESC}[C`);
    await flush();
    expect(screen.state.active).toBe(1);
    screen.close();
  });

  it('a keymap can be named, and a registered pane draws with the flagstaff component it names', async () => {
    registerFlagstaff({ name: 'demo-components', components: { shout: { static: (s: unknown) => String(s).toUpperCase() } } });
    register({ name: 'demo', keymaps: { vim: { keys: { l: 'tab.next' } } }, panes: { loud: { component: 'shout', label: 'Loud' } } });
    const f = fake({ tty: false });
    const screen = open(f.rt, { layout: 'x', tabs: ['A', 'B'], keymap: 'vim', panes: { x: { pane: 'loud', state: 'hi' } } });
    screen.close();
    expect(f.out.join('')).toBe('Loud\nHI\n');
    const g = fake();
    const live = open(g.rt, { layout: 'x', tabs: ['A', 'B'], keymap: 'vim', panes: { x: { pane: 'loud', state: 'hi' } } });
    press(g, 'l');
    await flush();
    expect(live.state.active).toBe(1);
    live.close();
  });

  it('a registered pane with no label prints its projection alone', () => {
    register({ name: 'demo2', panes: { plain: { component: 'shout' } } });
    const f = fake({ tty: false });
    open(f.rt, { layout: 'x', panes: { x: { pane: 'plain', state: 'hi' } } }).close();
    expect(f.out.join('')).toBe('HI\n');
  });

  it('a name nothing registered throws with a fix, for a keymap, a pane, and a pane whose component is missing', () => {
    const rt = fake({ tty: false }).rt;
    expect(() => open(rt, { layout: 'x', keymap: 'nope', panes: {} })).toThrow(/no keymap named "nope"/u);
    expect(() => open(rt, { layout: 'x', panes: { x: { pane: 'nope', state: 0 } } })).toThrow(/no pane named "nope"/u);
    register({ name: 'demo3', panes: { ghost: { component: 'never-registered' } } });
    expect(() => open(rt, { layout: 'x', panes: { x: { pane: 'ghost', state: 0 } } })).toThrow(/"never-registered", which flagstaff has not registered/u);
  });
});

describe('processRuntime', () => {
  it('is the real process, with the mode read when asked and a clock that schedules and cancels', () => {
    const rt = processRuntime();
    expect(rt.stdout).toBe(process.stdout);
    expect(rt.stdin).toBe(process.stdin);
    expect(rt.isTTY.stdout).toBe(process.stdout.isTTY);
    const fn = vi.fn();
    rt.clock.schedule(fn, 1_000_000)();
    expect(typeof rt.clock.now()).toBe('number');
    expect(fn).not.toHaveBeenCalled();
  });
});
