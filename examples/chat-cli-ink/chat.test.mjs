/**
 * R22's check for the Ink chat boilerplate, mirroring `examples/chat-cli/chat.test.mjs`, and
 * R17's for a whole app: every `'ink'` this app reaches — its own, `ink-text-input`'s and
 * `ink-spinner`'s — is `controlroom/ink`, through the package.json line and nothing else.
 *
 * Piped, it reads a prompt a line and prints a clean transcript (no escape sequence, no carriage
 * return) and exits on its own when stdin ends. `--json` is refused, because Ink has no
 * structured output to project, and the refusal says where NDJSON is. On a terminal, driven
 * in-process so the check runs everywhere, a reply streams under a status line and commits once,
 * Esc interrupts it, Tab completes a slash command, ↑ recalls an entry, and Ctrl+C quits.
 *
 * `node:test`, so the boilerplate needs nothing installed to check itself: `npm test`.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { run, TICK } from './chat.mjs';

const APP = fileURLToPath(new URL('chat.mjs', import.meta.url));
const chat = (input, args = []) => spawnSync(process.execPath, [APP, ...args], { input, encoding: 'utf8' });

/** Where `import 'ink'` lands for one importer, resolved as Node does: from the importer's own file. */
const inkFrom = (file) => realpathSync(createRequire(file).resolve('ink'));

describe("'ink' is controlroom/ink, for the app and for the components it installs", () => {
  const shim = realpathSync(fileURLToPath(new URL('ink/index.js', import.meta.url)));

  for (const [name, file] of [
    ['chat.mjs', APP],
    ['ink-text-input', fileURLToPath(import.meta.resolve('ink-text-input'))],
    ['ink-spinner', fileURLToPath(import.meta.resolve('ink-spinner'))],
  ]) {
    it(name, () => {
      // A package manager that hoisted a component next to a real ink would hand it that ink and
      // this app would still run; this is the line that makes it a failure instead of a pass.
      assert.equal(inkFrom(file), shim);
    });
  }

  it('and the shim is the drop-in itself, not a copy of it', async () => {
    const [shimmed, dropIn] = await Promise.all([import('ink'), import('controlroom/ink')]);
    assert.equal(shimmed.render, dropIn.render);
    assert.equal(shimmed.Text, dropIn.Text);
  });
});

describe('the chat, as a pipe sees it', () => {
  it('answers each piped prompt in order, asks before a tool, and exits when stdin ends', () => {
    const { stdout, status } = chat('hello\n/help\nlist the files\ny\n/nope\n');
    assert.equal(status, 0);
    assert.ok(!stdout.includes('\u001B'), 'no escape sequence');
    assert.ok(!stdout.includes('\r'), 'no carriage return');
    const order = ['> hello', 'You said: *hello*', '> /help', '/exit  leave', '> list the files', 'Allow ls? Type y or n.', '⏺ ran ls', '- `chat.mjs`', 'unknown command /nope'];
    const at = order.map((line) => stdout.indexOf(line));
    assert.ok(
      at.every((i) => i >= 0),
      `missing from:\n${stdout}`,
    );
    assert.deepEqual(
      [...at].sort((a, b) => a - b),
      at,
    );
  });

  it('prints each entry once', () => {
    // Says what came back when it fails: on Windows this once saw no `> hello` at all, and the bare count said nothing more (A-20261009-chat-ink-windows-lost-line).
    const { stdout, stderr, status, signal } = chat('hello\n');
    const seen = `status ${String(status)} signal ${String(signal)}\nstdout:\n${stdout}\nstderr:\n${stderr}`;
    assert.equal(stdout.split('> hello').length, 2, seen);
    assert.equal(stdout.split('You said').length, 2, seen);
  });

  it('a refused tool is not run, and empty stdin ends the program at once', () => {
    assert.ok(chat('list files\nn\n').stdout.includes('✗ ls was not run'));
    assert.equal(chat('').status, 0);
  });
});

describe('--json, which Ink has no equivalent for', () => {
  it('is refused with exit 2 and a pointer to the native boilerplate, and writes nothing to stdout', () => {
    const { stdout, stderr, status } = chat('hello\n', ['--json']);
    assert.equal(status, 2);
    assert.equal(stdout, '');
    assert.ok(stderr.includes('Ink has no structured output'));
    assert.ok(stderr.includes('examples/chat-cli'));
  });
});

/** Ink draws at most 30 frames a second; a few frames' wait lets the last state reach the stream. */
const FRAME_MS = 40;
const settle = () => new Promise((resolve) => setTimeout(resolve, FRAME_MS));
/**
 * How long `until` waits for a frame before it fails: only a ceiling for one that never comes.
 * Ink holds a lone Esc 20 ms in case a sequence follows it, and a frame waits out its 33 ms
 * throttle, both on the real clock; on a busy Windows runner (2026-11-13) `(interrupted)` was
 * drawn after a fixed `settle` had already looked.
 */
const NEVER_MS = 10_000;

/** A terminal that is not one: buffers, a stepped clock, a stdin that can go raw. */
function terminal() {
  const out = [];
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 80, rows: 24 });
  // Read off the stream rather than by replacing `write`: Ink settles its exit on a write's
  // callback, so a `write` that drops the callback is a terminal on which Ctrl+C never returns.
  stdout.on('data', (chunk) => out.push(String(chunk)));
  const stdin = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => undefined, ref: () => undefined, unref: () => undefined });
  const stderr = new PassThrough();
  let now = 0;
  let timers = [];
  const clock = {
    now: () => now,
    schedule(fn, ms) {
      const timer = { at: now + ms, fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
  };
  /** Fire the next timer due by `until`, let Ink draw, and go on until none is due: one at a time, in order. */
  const fire = async (until) => {
    const [next] = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at);
    if (next === undefined) return;
    timers = timers.filter((t) => t !== next);
    now = next.at;
    next.fn();
    await settle();
    await fire(until);
  };
  /** Advance the clock by `ms`. */
  const tick = async (ms) => {
    const until = now + ms;
    await fire(until);
    now = until;
    await settle();
  };
  /** One key or one typed run: Ink reads a chunk as one input, so Enter is its own write, as a key is. */
  const type = async (keys) => {
    stdin.write(keys);
    await settle();
  };
  /**
   * Resolve once what was drawn satisfies `drawn`, checked again on every write: a wait for the
   * frame, not a guess at how fast the machine draws one. A frame that never comes fails after
   * `NEVER_MS`, saying what was drawn instead.
   */
  const until = (drawn, what) =>
    new Promise((resolve, reject) => {
      const check = () => {
        if (!drawn(plain(out.join('')))) return;
        stdout.off('data', check);
        clearTimeout(ceiling);
        resolve();
      };
      const ceiling = setTimeout(() => {
        stdout.off('data', check);
        reject(new assert.AssertionError({ message: `never drew ${what}; drew:\n${plain(out.join(''))}` }));
      }, NEVER_MS);
      // Added after `out`'s own listener, so the chunk that satisfies `drawn` is already in `out`.
      stdout.on('data', check);
      check();
    });
  return { io: { stdin, stdout, stderr, clock }, out, tick, type, until };
}

/** The frames without their colour, for an assertion about the words on them. */
const plain = (s) => s.replaceAll(/\u001B\[[\d;?]*[A-Za-z]/gu, '');
const A_FEW_WORDS = 3;
const THE_WHOLE_REPLY = 100;
/** The whole reply is on the screen, below the last frame that still showed the status line. */
const committed = (s) => s.lastIndexOf('real client') > s.lastIndexOf('thinking');

/**
 * Run the chat on a fresh terminal, drive it with `body`, then press Ctrl+C, and resolve to the
 * exit code. Ctrl+C is pressed when `body` fails too: a status line left on screen keeps its
 * spinner's interval running, and that would hold the test process open instead of failing it.
 */
async function session(body) {
  const t = terminal();
  const done = run([], t.io);
  try {
    await body(t);
  } finally {
    await t.type('\u0003');
  }
  return done;
}

describe('the chat, on a terminal', () => {
  // Ink decides from `CI` whether anyone is watching, and under it draws only the last frame —
  // the stand-in below is a terminal even inside a CI job, so it runs as ink's own suite does,
  // under `CI=false`. The piped cases above keep whatever `CI` the job has: both paths are clean.
  const ci = process.env['CI'];
  before(() => {
    process.env['CI'] = 'false';
  });
  after(() => {
    if (ci === undefined) delete process.env['CI'];
    else process.env['CI'] = ci;
  });

  it('a reply streams under a status line, then settles with the status cleared; Ctrl+C quits', async () => {
    const code = await session(async (t) => {
      await t.type('hello');
      // Enter submits what the field holds when the key is read, so it waits until the field holds it.
      await t.until((s) => s.includes('> hello'), 'the typed prompt');
      await t.type('\r');
      // The first word is due at once and each next one a TICK later, so this is A_FEW_WORDS words.
      await t.tick(TICK * (A_FEW_WORDS - 1));
      await t.until((s) => /thinking · \d+\.\ds · 3 tokens/u.test(s), 'the status line at 3 tokens');
      t.out.length = 0;
      await t.tick(TICK * THE_WHOLE_REPLY);
      // The reply is committed after the last frame that showed the status line, not before it.
      await t.until(committed, 'the reply after the last status line');
      await settle();
      assert.ok(committed(plain(t.out.join(''))), 'a status line was drawn after the reply was committed');
    });
    assert.equal(code, 0);
  });

  it('Esc interrupts a reply mid-stream', async () => {
    await session(async (t) => {
      await t.type('hello');
      await t.until((s) => s.includes('> hello'), 'the typed prompt');
      await t.type('\r');
      await t.tick(TICK * 2);
      await t.until((s) => s.includes('thinking'), 'the reply streaming');
      await t.type('\u001B');
      await t.until((s) => s.includes('(interrupted)'), 'the interrupted reply');
    });
  });

  it('Tab completes a slash command', async () => {
    await session(async (t) => {
      await t.type('/he');
      await t.until((s) => s.includes('> /he'), 'the typed prefix');
      await t.type('\t');
      await t.until((s) => s.includes('> /help'), 'the completed command');
      await t.type('\r');
      await t.until((s) => s.includes('/help  show the commands'), "/help's answer");
    });
  });

  it('↑ brings back the last entry', async () => {
    await session(async (t) => {
      await t.type('/help');
      await t.until((s) => s.includes('> /help'), 'the typed command');
      await t.type('\r');
      // Every frame of the entry (its echo, its answer) is in before the slate is wiped for ↑'s.
      await t.until((s) => s.includes('/exit  leave'), "/help's answer");
      await settle();
      t.out.length = 0;
      await t.type('\u001B[A');
      await t.until((s) => s.includes('> /help'), 'the recalled entry');
    });
  });
});
