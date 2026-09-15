/**
 * The raw renderer, driven by synthetic keypresses.
 *
 * The load-bearing case is the last block: **raw mode and line mode answer the same
 * questions with the same values.** That is the arrangement the whole package rests on —
 * line mode is the floor, this is decoration on top — and it is asserted rather than
 * asserted-about, by running both over the same spec and comparing.
 *
 * The other one that would be a bug report: the terminal is left as it was found. A prompt
 * that exits still in raw mode with the cursor hidden leaves the shell unusable, and a
 * person who pressed Ctrl-C is exactly the person who will not think to run `reset`.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HIDE_CURSOR, SHOW_CURSOR } from 'closeout/cursor';
import { describe, expect, it } from 'vitest';

import { ask, type Reader, type Writer } from './ask.js';
import { askList, canRender, keyOf, type KeyStream, renderList } from './raw.js';
import { type PromptSpec } from './spec.js';

const ESC = '\u001B';
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const ENTER = '\r';
const SPACE = ' ';
const CTRL_C = '\u0003';

const select: PromptSpec = { kind: 'select', message: 'Which host?', choices: [{ value: 'ora' }, { value: 'log-update', hint: '99 tests' }, { value: 'chalk' }] };
const multi: PromptSpec = { kind: 'multiselect', message: 'Which hosts?', choices: [{ value: 'ora' }, { value: 'chalk' }, { value: 'yargs' }] };

/** A key stream that replays a script, and remembers what was done to the terminal. */
function keyboard(script: string[]) {
  const listeners: ((c: string) => void)[] = [];
  const rawCalls: boolean[] = [];
  const out: string[] = [];
  const keys: KeyStream = {
    isTTY: true,
    setRawMode: (raw: boolean) => rawCalls.push(raw),
    on: (_e, l) => listeners.push(l as (c: string) => void),
    off: (_e, l) => listeners.splice(listeners.indexOf(l as (c: string) => void), 1),
    resume: () => undefined,
    pause: () => undefined,
  };
  const writer: Writer = { write: (t: string) => out.push(t) };
  // Nothing reads lines in raw mode; a reader is present only to satisfy the shape.
  const reader: Reader = { line: () => Promise.resolve(undefined) };
  const play = (): void => {
    for (const key of script) for (const l of [...listeners]) l(key);
  };
  return { io: { keys, writer, reader }, play, rawCalls, written: () => out.join('') };
}

/** Line mode reads a number; raw mode moves and presses enter. Same choice either way. */
function lineIo(lines: string[]) {
  let at = 0;
  return { reader: { line: () => Promise.resolve(lines[at++]) }, writer: { write: () => undefined } };
}

async function run(spec: PromptSpec, script: string[], multiselect = false) {
  const k = keyboard(script);
  const answer = askList(spec, k.io, multiselect);
  k.play();
  return { answer: await answer, ...k };
}

describe('keyOf', () => {
  it.each([
    [UP, 'up'],
    ['k', 'up'],
    [DOWN, 'down'],
    ['j', 'down'],
    [SPACE, 'space'],
    ['\r', 'enter'],
    ['\n', 'enter'],
    [CTRL_C, 'cancel'],
    ['\u0004', 'cancel'],
    [ESC, 'cancel'],
    ['q', 'other'],
  ])('reads %j as %s', (data, key) => {
    expect(keyOf(data)).toBe(key);
  });
});

describe('canRender', () => {
  it('needs a terminal that can be put into raw mode, and says so', () => {
    expect(canRender({ isTTY: true, setRawMode: () => undefined, on: () => undefined, off: () => undefined })).toBe(true);
    expect(canRender({ isTTY: false, setRawMode: () => undefined, on: () => undefined, off: () => undefined })).toBe(false);
    expect(canRender({ isTTY: true, on: () => undefined, off: () => undefined })).toBe(false);
  });
});

describe('select', () => {
  it('starts on the first choice and takes it on enter', async () => {
    const { answer } = await run(select, [ENTER]);
    expect(answer).toEqual({ ok: true, value: 'ora' });
  });

  it('moves with the arrows', async () => {
    expect((await run(select, [DOWN, ENTER])).answer).toEqual({ ok: true, value: 'log-update' });
    expect((await run(select, [DOWN, DOWN, ENTER])).answer).toEqual({ ok: true, value: 'chalk' });
    expect((await run(select, [DOWN, UP, ENTER])).answer).toEqual({ ok: true, value: 'ora' });
  });

  it('wraps at both ends, so a long list is reachable from either side', async () => {
    expect((await run(select, [UP, ENTER])).answer).toEqual({ ok: true, value: 'chalk' });
    expect((await run(select, [DOWN, DOWN, DOWN, ENTER])).answer).toEqual({ ok: true, value: 'ora' });
  });

  it('ignores a key with no meaning, and repaints nothing for it', async () => {
    const a = await run(select, [ENTER]);
    const b = await run(select, ['q', 'z', ENTER]);
    expect(b.answer).toEqual(a.answer);
    expect(b.written()).toBe(a.written());
  });
});

describe('multiselect', () => {
  it('toggles with space and returns the choices in list order', async () => {
    const { answer } = await run(multi, [SPACE, DOWN, DOWN, SPACE, ENTER], true);
    expect(answer).toEqual({ ok: true, value: ['ora', 'yargs'] });
  });

  it('toggles off again', async () => {
    const { answer } = await run(multi, [SPACE, SPACE, ENTER], true);
    expect(answer).toEqual({ ok: true, value: [] });
  });

  it('is order-independent: selecting bottom-up gives list order, not press order', async () => {
    const { answer } = await run(multi, [DOWN, DOWN, SPACE, UP, UP, SPACE, ENTER], true);
    expect(answer).toEqual({ ok: true, value: ['ora', 'yargs'] });
  });
});

describe('the terminal is left as it was found', () => {
  it('raw mode is turned on and off again, whatever the answer', async () => {
    expect((await run(select, [ENTER])).rawCalls).toEqual([true, false]);
    expect((await run(select, [CTRL_C])).rawCalls).toEqual([true, false]);
  });

  it('the cursor is hidden once and shown again', async () => {
    const { written } = await run(select, [DOWN, ENTER]);
    expect(written().match(/\u001B\[\?25l/g)).toHaveLength(1);
    expect(written().match(/\u001B\[\?25h/g)).toHaveLength(1);
    expect(written().endsWith(`${ESC}[?25h`)).toBe(true);
  });

  it('Ctrl-C cancels, and still restores the terminal', async () => {
    const { answer, written, rawCalls } = await run(select, [DOWN, CTRL_C]);
    expect(answer).toEqual({ ok: false, reason: 'cancelled' });
    expect(rawCalls).toEqual([true, false]);
    expect(written()).toContain(`${ESC}[?25h`);
  });
});

describe('renderList', () => {
  it('points at the cursor and marks what is selected', () => {
    const frame = renderList(multi, multi.choices ?? [], { cursor: 1, selected: new Set([1, 2]) }, true);
    expect(frame).toBe(['Which hosts?', '  ◯ ora', '❯ ◉ chalk', '  ◉ yargs'].join('\n'));
  });

  it('shows a hint, and no marks for a single select', () => {
    const frame = renderList(select, select.choices ?? [], { cursor: 0, selected: new Set() }, false);
    expect(frame).toBe(['Which host?', '❯ ora', '  log-update — 99 tests', '  chalk'].join('\n'));
  });
});

describe('raw mode and line mode answer the same question the same way', () => {
  const cases: { typed: string; keys: string[] }[] = [
    { typed: '1', keys: [ENTER] },
    { typed: '2', keys: [DOWN, ENTER] },
    { typed: '3', keys: [DOWN, DOWN, ENTER] },
  ];
  it.each(cases)('typing $typed and arrowing to it give the same value', async ({ typed, keys }) => {
    const viaLine = await ask(select, lineIo([typed]));
    const viaRaw = (await run(select, keys)).answer;
    expect(viaRaw).toEqual(viaLine);
  });

  it('multiselect agrees too', async () => {
    const viaLine = await ask(multi, lineIo(['1, 3']));
    const viaRaw = (await run(multi, [SPACE, DOWN, DOWN, SPACE, ENTER], true)).answer;
    expect(viaRaw).toEqual(viaLine);
  });

  it('and both cancel the same way', async () => {
    const viaLine = await ask(select, lineIo([]));
    const viaRaw = (await run(select, [CTRL_C])).answer;
    expect(viaRaw).toEqual(viaLine);
  });
});

/**
 * The restore a keypress loop cannot do, which is the case caique's own suite was silent
 * about. Every block above drives the prompt in-process and lets it end; none of them
 * kills it. So the 180 said nothing about the guarantee a person is most likely to notice
 * losing: a prompt on screen, the process signalled from outside the tty, and a shell left
 * with no cursor until they type `reset`.
 *
 * Raw mode is exactly what hides this. Ctrl-C typed at a terminal in raw mode arrives as a
 * byte, `keyOf` reads it as `cancel`, and the loop restores — which is what `Ctrl-C
 * cancels, and still restores the terminal` asserts, and it passes on the broken code. A
 * `SIGINT` from a parent process, a `SIGTERM`, a crash, or a `process.exit()` elsewhere in
 * the program never reaches that loop at all.
 *
 * This runs the **built** entry (`dist/raw.js`, guaranteed by turbo's `test` depending on
 * `build`), because what is under test is what ships. fd 2 is handed to the child already
 * pointing at a file — writes to a file descriptor are synchronous in node, so nothing is
 * lost when the process is killed outright.
 *
 * Proven to fail on the unfixed state (the local `SHOW_CURSOR`, written only from
 * `done()`): hide 1, show 0, for `SIGINT` and `SIGTERM` alike.
 *
 * `SIGHUP` is not graded. `closeout/exit-hook` listens on `SIGINT` and `SIGTERM`, which is
 * the pair its incumbent listens on; a case demanding a third would be grading a change to
 * somebody else's package rather than this one.
 *
 * Skipped on Windows, where `process.kill(process.pid, ...)` is an unconditional terminate
 * rather than a real signal delivery, so the assertion would grade node's emulation.
 */
const distRaw = new URL('../dist/raw.js', import.meta.url).href;

interface SignalOutcome {
  hide: number;
  show: number;
  status: number | null;
}

/**
 * Put a list prompt on screen in a child, then do something to the child.
 *
 * `answerFirst` presses enter before the signal: a prompt that ended has already restored
 * and unregistered, so exit must not write a second show. That is the half of the pairing
 * a handler which only ever adds would get wrong.
 */
function promptThenSignal(signal: string, answerFirst = false): SignalOutcome {
  const dir = mkdtempSync(join(tmpdir(), 'caique-raw-signal-'));
  const log = join(dir, 'fd2');
  const child = join(dir, 'child.mjs');
  writeFileSync(
    child,
    [
      'const listeners = [];',
      'const keys = {',
      '  isTTY: true,',
      '  setRawMode: () => true,',
      '  on: (_e, l) => listeners.push(l),',
      '  off: (_e, l) => listeners.splice(listeners.indexOf(l), 1),',
      '  resume: () => undefined,',
      '  pause: () => undefined,',
      '};',
      'const io = { keys, writer: { write: (t) => process.stderr.write(t) }, reader: { line: () => Promise.resolve(undefined) } };',
      `const { askList } = await import(${JSON.stringify(distRaw)});`,
      `askList({ kind: 'select', message: 'Which host?', choices: [{ value: 'ora' }, { value: 'chalk' }] }, io);`,
      answerFirst ? `setTimeout(() => { for (const l of [...listeners]) l(${JSON.stringify(ENTER)}); }, 40);` : '',
      `setTimeout(() => process.kill(process.pid, '${signal}'), 120);`,
      'setTimeout(() => process.exit(0), 5000);',
    ].join('\n'),
  );

  const fd = openSync(log, 'w');
  // `execFileSync` throws when the child does not exit 0 — which is every case here, since
  // the point is that the signal still ends it. The throw carries `.status`.
  let status: number | null = 0;
  try {
    execFileSync(process.execPath, [child], { stdio: ['ignore', 'pipe', fd], timeout: 20_000 });
  } catch (error) {
    status = (error as { status?: number | null }).status ?? null;
  } finally {
    closeSync(fd);
  }

  const written = readFileSync(log, 'utf8');
  const count = (needle: string): number => written.split(needle).length - 1;
  return { hide: count(HIDE_CURSOR), show: count(SHOW_CURSOR), status };
}

describe.skipIf(process.platform === 'win32')('a cursor hidden mid-prompt comes back when the process is signalled', () => {
  it.each(['SIGINT', 'SIGTERM'])('%s puts the cursor back, and still ends the process', (signal) => {
    const observed = promptThenSignal(signal);
    expect(observed.hide).toBe(1);
    expect(observed.show).toBe(1);
    // 128 plus the signal number: the process still leaves, and leaves with the code the
    // signal names. A restore that swallowed the signal would be the worse bug.
    expect(observed.status).toBe(signal === 'SIGINT' ? 130 : 143);
  });

  it('a prompt that already ended leaves nothing for exit to do', () => {
    const observed = promptThenSignal('SIGTERM', true);
    expect(observed.hide).toBe(1);
    // One show, not two: `restore()` unregistered the hook when the prompt was answered.
    expect(observed.show).toBe(1);
  });
});
