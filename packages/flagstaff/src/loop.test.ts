/**
 * R1 â one component, five modes, one answer each; R5 â nothing but text off a terminal;
 * R9 â the same bytes every run. The runtime is a literal and the clock is manual, so every
 * assertion here is exact.
 */
import { describe, expect, it } from 'vitest';

import { hoist, manualClock, type Runtime } from './loop.js';
import { type Component } from './plugin.js';
import { HIDE_CURSOR, SHOW_CURSOR } from './projection.js';

const ESC = '\u001B';
/** What one repaint writes before the next frame: column 1, clear to the end of the screen. */
const ERASE_ONE = `${ESC}[1G${ESC}[0J`;
/**
 * Every frame goes out inside one synchronized-output block, through `frameWriter()`
 * (controlroom R3) â the seam a compositor paints through too.
 */
const synced = (bytes: string): string => `${ESC}[?2026h${bytes}${ESC}[?2026l`;

interface Count {
  n: number;
}
const INTERVAL = 100;
const counter: Component<Count> = {
  name: 'counter',
  interval: INTERVAL,
  static: (s) => `count ${s.n}`,
  frame: (t, s) => `count ${s.n} @${t}`,
};

/** A static that carries colour, the way an explicit `FORCE_COLOR` / `--color` ask does. */
const GREEN = `${ESC}[32m`;
const RESET = `${ESC}[39m`;
const painted: Component<Count> = {
  name: 'painted',
  interval: INTERVAL,
  static: (s) => `${GREEN}count ${s.n}${RESET}`,
  frame: (t, s) => `${GREEN}count ${s.n} @${t}${RESET}`,
};

type Mode = 'tty' | 'pipe' | 'ci' | 'json' | 'accessible';
const ENV: Record<Mode, Record<string, string>> = { tty: {}, pipe: {}, ci: { CI: 'true' }, json: {}, accessible: { CLI_ACCESSIBLE: '1' } };

function world(mode: Mode, columns?: number) {
  const out: string[] = [];
  const err: string[] = [];
  const clock = manualClock();
  const rt: Runtime = { env: ENV[mode], isTTY: { stdout: mode === 'tty' }, stdout: { write: (s: string) => out.push(s), columns }, stderr: { write: (s: string) => err.push(s) }, clock };
  return { rt, clock, json: mode === 'json', stdout: () => out.join(''), stderr: () => err.join('') };
}

/**
 * Just enough of a terminal to grade a repaint: autowrap with a pending wrap at the last
 * column, `\n` as a newline, the CSI forms the tty projection writes (`nG`, `nA`, `0J`, `2K`,
 * and the private modes `?25l`/`?25h` and `?2026h`/`?2026l`, which move nothing), and DECSC/DECRC.
 */
class Terminal {
  readonly #columns: number;
  readonly #rows: string[][] = [[]];
  #row = 0;
  #col = 0;

  #saved: [number, number] = [0, 0];

  constructor(columns: number) {
    this.#columns = columns;
  }

  /** DECSC / DECRC: an in-place edit keeps the cursor across itself. */
  save(): void {
    this.#saved = [this.#row, this.#col];
  }

  restore(): void {
    [this.#row, this.#col] = this.#saved;
  }

  csi(privateMode: string, n: number, op: string): void {
    if (privateMode !== '') return;
    if (op === 'G') this.#col = n - 1;
    else if (op === 'A') this.#row = Math.max(0, this.#row - n);
    else if (op === 'K') this.#rows[this.#row] = [];
    else if (op === 'J') {
      this.#rows[this.#row] = (this.#rows[this.#row] ?? []).slice(0, this.#col);
      this.#rows.length = this.#row + 1;
    }
  }

  print(ch: string): void {
    if (ch === '\n' || this.#col >= this.#columns) {
      this.#row += 1;
      this.#col = 0;
      while (this.#rows.length <= this.#row) this.#rows.push([]);
      if (ch === '\n') return;
    }
    (this.#rows[this.#row] ??= [])[this.#col] = ch;
    this.#col += 1;
  }

  get screen(): string[] {
    return this.#rows.map((r) => r.join(''));
  }
}

const CSI_FORM = new RegExp(`^${ESC}\\[(\\??)(\\d*)([A-Za-z])`);

/** What a terminal `columns` wide shows after `bytes`: the rows on screen, top to bottom. */
function screen(bytes: string, columns: number): string[] {
  const term = new Terminal(columns);
  for (let i = 0; i < bytes.length; ) {
    if (bytes.startsWith(`${ESC}7`, i) || bytes.startsWith(`${ESC}8`, i)) {
      if (bytes[i + 1] === '7') term.save();
      else term.restore();
      i += 2;
      continue;
    }
    const escape = CSI_FORM.exec(bytes.slice(i));
    if (escape === null) {
      term.print(bytes[i] ?? '');
      i += 1;
      continue;
    }
    const [whole, privateMode = '', arg = '', op = ''] = escape;
    term.csi(privateMode, arg === '' ? 1 : Number(arg), op);
    i += whole.length;
  }
  return term.screen;
}

/** Hoist a 100-column static at `columns` and lower it: the bytes written. */
function wideAt(columns: number | undefined): string {
  const w = world('tty', columns);
  // The final static differs from the frame, so lowering repaints it — an identical one writes nothing.
  hoist({ name: 'wide', static: (s: Count) => String(s.n).repeat(100) }, w.rt, { n: 1 }).lower({ n: 2 });
  return w.stdout();
}

/** Hoist at 0, let two frames pass, change once, one more frame, lower with a final state. */
function transcript(mode: Mode) {
  const w = world(mode);
  const flag = hoist(counter, w.rt, { n: 0 }, { json: w.json });
  w.clock.tick(INTERVAL * 2 + INTERVAL / 2);
  flag.update({ n: 1 });
  w.clock.tick(INTERVAL);
  flag.lower({ n: 2 });
  return { mode: flag.mode, stdout: w.stdout(), stderr: w.stderr() };
}

describe('R1 Â· one component, five modes', () => {
  it('tty: repaints in place on the clock, and leaves the static line behind', () => {
    const { mode, stdout, stderr } = transcript('tty');
    expect(mode).toBe('tty');
    expect(stdout).toBe(
      [HIDE_CURSOR, synced('count 0 @0'), ...['count 0 @100', 'count 0 @200', 'count 1 @250', 'count 1 @300', 'count 2'].map((f) => synced(ERASE_ONE + f)), '\n', SHOW_CURSOR].join(''),
    );
    expect(stderr).toBe('');
  });

  it.each<Mode>(['pipe', 'ci', 'accessible'])('%s: the static projection once per state change, no repaint', (mode) => {
    const t = transcript(mode);
    expect(t.mode).toBe(mode);
    expect(t.stdout).toBe('count 0\ncount 1\ncount 2\n');
    expect(t.stderr).toBe('');
  });

  it('json: one NDJSON event per transition on stderr, stdout untouched', () => {
    const { mode, stdout, stderr } = transcript('json');
    expect(mode).toBe('json');
    expect(stdout).toBe('');
    expect(stderr.trimEnd().split('\n').map((l) => JSON.parse(l) as unknown)).toEqual([
      { event: 'counter', state: { n: 0 } },
      { event: 'counter', state: { n: 1 } },
      { event: 'counter', state: { n: 2 } },
    ]);
  });

  it('a change that leaves the static text the same prints nothing off a terminal', () => {
    const w = world('pipe');
    const flag = hoist(counter, w.rt, { n: 0 });
    flag.update({ n: 0 });
    flag.update({ n: 0 });
    flag.lower();
    expect(w.stdout()).toBe('count 0\n');
  });

  it('a component with no frame still hoists on a terminal: its static text, repainted on change only', () => {
    const w = world('tty');
    const flag = hoist({ name: 'plain', static: (s: Count) => `n=${s.n}` }, w.rt, { n: 1 });
    w.clock.tick(INTERVAL * 5);
    flag.update({ n: 2 });
    flag.lower();
    // Lowering on the text already painted writes no repaint at all, only the newline.
    expect(w.stdout()).toBe(`${HIDE_CURSOR}${synced('n=1')}${synced(`${ERASE_ONE}n=2`)}\n${SHOW_CURSOR}`);
  });

  it('a multi-line frame is erased from its first changed line', () => {
    const w = world('tty');
    const flag = hoist({ name: 'two', static: (s: Count) => `a${s.n}\nb` }, w.rt, { n: 1 });
    flag.lower({ n: 2 });
    // The first line changed and the last did not: rewritten in place, the cursor kept.
    expect(w.stdout()).toBe(`${HIDE_CURSOR}${synced('a1\nb')}${synced(`${ESC}7${ESC}[1G${ESC}[1A${ESC}[2Ka2${ESC}8`)}\n${SHOW_CURSOR}`);
    expect(screen(w.stdout(), 80)).toEqual(['a2', 'b', '']);
  });

  it('a frame wider than the terminal repaints without leaving stale wrapped rows', () => {
    // 25 columns on a 10-column terminal paints three rows. Counting it as one line erased
    // only the last of them, and the first two stayed on screen under every repaint.
    const w = world('tty', 10);
    const flag = hoist({ name: 'wide', static: (s: Count) => String(s.n).repeat(25) }, w.rt, { n: 1 });
    expect(screen(w.stdout(), 10)).toEqual(['1111111111', '1111111111', '11111']);
    flag.update({ n: 2 });
    expect(screen(w.stdout(), 10)).toEqual(['2222222222', '2222222222', '22222']);
    flag.lower({ n: 3 });
    expect(screen(w.stdout(), 10)).toEqual(['3333333333', '3333333333', '33333', '']);
  });

  it('a frame that wraps is erased at the width the writer reports, and at 80 when it reports none', () => {
    // 100 columns is two rows at 80 and four at 30: the erase goes up one row and three.
    expect(wideAt(undefined)).toContain(`${ESC}[1G${ESC}[1A${ESC}[0J`);
    expect(wideAt(30)).toContain(`${ESC}[1G${ESC}[3A${ESC}[0J`);
  });

  it('after lower, update and lower are no-ops and the clock is released', () => {
    const w = world('tty');
    const flag = hoist(counter, w.rt, { n: 0 });
    flag.lower();
    const after = w.stdout();
    flag.update({ n: 9 });
    flag.lower({ n: 9 });
    w.clock.tick(INTERVAL * 10);
    expect(w.stdout()).toBe(after);
  });
});

describe('R5 Â· off a terminal, no carriage return and no cursor escape', () => {
  it.each<Mode>(['pipe', 'ci', 'json', 'accessible'])('%s output carries no carriage return and no escape', (mode) => {
    const { stdout, stderr } = transcript(mode);
    expect(stdout + stderr).not.toMatch(/[\r\u001B]/);
  });

  /**
   * The case above uses `counter`, whose `static` is plain text â it cannot contain an
   * escape whatever the loop does, so it tested neither reading of R5. This one paints the
   * static, which is what an explicit `FORCE_COLOR` / `--color` ask produces under
   * roundel's revised R2, and separates the two things the old wording ran together:
   * a colour escape is allowed off a terminal, a cursor escape is not.
   */
  it.each<Mode>(['pipe', 'ci', 'accessible'])('%s keeps colour and still moves no cursor', (mode) => {
    const w = world(mode);
    const flag = hoist(painted, w.rt, { n: 0 }, { json: w.json });
    w.clock.tick(INTERVAL * 2);
    flag.lower({ n: 1 });
    const out = w.stdout() + w.stderr();

    expect(out).not.toContain('\r');
    // By shape, not by the constants this file already builds: comparing against
    // `ERASE_ONE` alone lets a lone `ESC[1G` through, since that constant is two sequences
    // joined. Every CSI final byte is a cursor or erase command except `m`, which is SGR.
    expect(out.match(/\u001B\[[0-9;?]*[A-Za-z]/g) ?? []).toEqual(
      (out.match(/\u001B\[[0-9;]*m/g) ?? []),
    );
    // Without this the case would pass just as well if the loop stripped every escape,
    // which is the failure the plain-text component was already hiding.
    expect(out).toContain(GREEN);
  });
});

describe('R9 Â· deterministic', () => {
  it('the tty transcript is the same bytes twenty runs over', () => {
    const first = transcript('tty').stdout;
    for (let i = 0; i < 20; i += 1) expect(transcript('tty').stdout).toBe(first);
  });
});

describe('manualClock', () => {
  it('runs callbacks earliest first, in scheduling order among ties, and only up to the tick', () => {
    const clock = manualClock();
    const ran: string[] = [];
    clock.schedule(() => ran.push('b'), 20);
    clock.schedule(() => ran.push('a'), 10);
    clock.schedule(() => ran.push('a2'), 10);
    clock.schedule(() => ran.push('late'), 100);
    clock.tick(50);
    expect(ran).toEqual(['a', 'a2', 'b']);
    expect(clock.now()).toBe(50);
  });

  it('a cancelled callback never runs', () => {
    const clock = manualClock();
    let ran = false;
    const cancel = clock.schedule(() => {
      ran = true;
    }, 5);
    cancel();
    clock.tick(10);
    expect(ran).toBe(false);
  });

  it('a callback that reschedules itself at 0 ms hits the ceiling instead of hanging the test', () => {
    const clock = manualClock();
    const again = (): void => {
      clock.schedule(again, 0);
    };
    clock.schedule(again, 0);
    expect(() => clock.tick(1)).toThrow(/1000 callbacks/);
  });
});
