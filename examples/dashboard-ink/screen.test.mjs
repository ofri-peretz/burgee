/**
 * controlroom criteria 3 and 6 for the Ink screen fixture: every `'ink'` it reaches — its own and
 * `@inkjs/ui`'s — is `controlroom/ink`, through the package.json line and nothing else; piped it
 * prints each finished step once with no escape sequence; it exits on its own in 100 of 100 runs
 * with stdin at /dev/null and 100 of 100 with stdin a pipe nobody writes to; and on a terminal,
 * driven in-process so the check runs everywhere, ← and → switch tabs and q quits.
 *
 * `node:test`, so the fixture needs nothing installed to check itself: `npm test`.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { run, STEPS } from './screen.mjs';

const APP = fileURLToPath(new URL('screen.mjs', import.meta.url));
const DONE = `Done: Progress: ${String(STEPS.length)}/${String(STEPS.length)} completed`;

/** Where `import 'ink'` lands for one importer, resolved as Node does: from the importer's own file. */
const inkFrom = (file) => realpathSync(createRequire(file).resolve('ink'));

describe("'ink' is controlroom/ink, for the screen and for @inkjs/ui", () => {
  const shim = realpathSync(fileURLToPath(new URL('ink/index.js', import.meta.url)));

  for (const [name, file] of [
    ['screen.mjs', APP],
    ['@inkjs/ui', fileURLToPath(import.meta.resolve('@inkjs/ui'))],
  ]) {
    it(name, () => {
      assert.equal(inkFrom(file), shim);
    });
  }

  it('and the shim is the drop-in itself, not a copy of it', async () => {
    const [shimmed, dropIn] = await Promise.all([import('ink'), import('controlroom/ink')]);
    assert.equal(shimmed.render, dropIn.render);
    assert.equal(shimmed.Box, dropIn.Box);
  });
});

describe('the screen, as a pipe sees it', () => {
  it('prints each finished step once, with no escape sequence, and exits on its own', () => {
    const { stdout, status } = spawnSync(process.execPath, [APP], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    assert.equal(status, 0);
    assert.ok(!stdout.includes('\u001B'), 'no escape sequence');
    assert.ok(!stdout.includes('\r'), 'no carriage return');
    for (const { title } of STEPS) assert.equal(stdout.split(`◼ ${title}\n`).length, 2, stdout);
    assert.equal(stdout.trimEnd().split('\n').at(-1), DONE);
  });
});

/**
 * Criterion 3: no run waits for a key nobody can press. 100 runs with stdin at /dev/null and 100
 * with stdin a pipe that is opened and never written to or closed — the one a program reading
 * stdin would hang on. Twenty at a time, because each run takes the screen's own five ticks.
 */
const RUNS = 100;
const AT_ONCE = 20;
const RUN_GIVES_UP_MS = 30_000;

function once(stdin) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [APP], { stdio: [stdin, 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), RUN_GIVES_UP_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve(signal === 'SIGKILL' ? 'hung' : `${String(code)} ${String(out.trimEnd().endsWith(DONE))}`);
    });
  });
}

async function hundred(stdin) {
  const outcomes = [];
  for (let started = 0; started < RUNS; started += AT_ONCE) {
    // eslint-disable-next-line reliability/no-await-in-loop -- batches, so a hundred node processes never start at once
    outcomes.push(...(await Promise.all(Array.from({ length: Math.min(AT_ONCE, RUNS - started) }, () => once(stdin)))));
  }
  return outcomes;
}

describe('criterion 3 — the screen exits on its own in 100 of 100 runs', () => {
  for (const [name, stdin] of [
    ['/dev/null', 'ignore'],
    ['a pipe nobody writes to', 'pipe'],
  ]) {
    it(`with stdin at ${name}`, async () => {
      const outcomes = await hundred(stdin);
      assert.deepEqual(
        outcomes.filter((o) => o !== '0 true'),
        [],
      );
      assert.equal(outcomes.length, RUNS);
    });
  }
});

/** Ink draws at most 30 frames a second; a few frames' wait lets the last state reach the stream. */
const FRAME_MS = 40;
const settle = () => new Promise((resolve) => setTimeout(resolve, FRAME_MS));

/** A terminal that is not one: buffers, a stepped clock, a stdin that can go raw. */
function terminal() {
  const out = [];
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 80, rows: 24 });
  // Read off the stream rather than by replacing `write`: Ink settles its exit on a write's callback.
  stdout.on('data', (chunk) => out.push(String(chunk)));
  const stdin = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => undefined, ref: () => undefined, unref: () => undefined });
  let timers = [];
  const clock = {
    now: () => 0,
    schedule(fn, ms) {
      const timer = { ms, fn };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
  };
  /** Fire every timer that is due, then let Ink draw. */
  const tick = async () => {
    const due = timers;
    timers = [];
    for (const t of due) t.fn();
    await settle();
  };
  const type = async (keys) => {
    stdin.write(keys);
    await settle();
  };
  return { io: { stdin, stdout, stderr: new PassThrough(), clock }, out, tick, type };
}

const plain = (s) => s.replaceAll(/\u001B\[[\d;?]*[A-Za-z]/gu, '');

describe('the screen, on a terminal', () => {
  // Ink decides from `CI` whether anyone is watching; the stand-in is a terminal even inside a CI job.
  const ci = process.env['CI'];
  before(() => {
    process.env['CI'] = 'false';
  });
  after(() => {
    if (ci === undefined) delete process.env['CI'];
    else process.env['CI'] = ci;
  });

  it('shows the tab line, the learn panel beside the checklist, and the hint line', async () => {
    const t = terminal();
    const done = run(t.io);
    await t.tick();
    await t.tick();
    const drawn = plain(t.out.join(''));
    assert.match(drawn, /\[Status\] · Tail logs · Visualizer · HN/u);
    assert.match(drawn, /The wizard installs the SDK +◼ Detect the framework/u);
    assert.match(drawn, /◻ Write the config/u);
    assert.match(drawn, /←→ switch tab {2}q quit/u);
    await t.type('q');
    assert.equal(await done, 0);
  });

  it('→ switches to the log pane, ← comes back, q quits', async () => {
    const t = terminal();
    const done = run(t.io);
    await t.tick();
    await t.type('\u001B[C');
    assert.match(plain(t.out.join('')), /Status · \[Tail logs\]/u);
    assert.match(plain(t.out.join('')), /◆ Detect the framework\n┊ found package\.json/u);
    t.out.length = 0;
    await t.type('\u001B[D');
    assert.match(plain(t.out.join('')), /\[Status\] · Tail logs/u);
    await t.type('q');
    assert.equal(await done, 0);
  });

  it('runs to the end by itself when nobody presses a key', async () => {
    const t = terminal();
    const done = run(t.io);
    for (let i = 0; i <= STEPS.length + 1; i += 1) {
      // eslint-disable-next-line reliability/no-await-in-loop -- one tick, then its frame, in order
      await t.tick();
    }
    assert.equal(await done, 0);
    assert.ok(plain(t.out.join('')).includes(DONE));
  });
});
