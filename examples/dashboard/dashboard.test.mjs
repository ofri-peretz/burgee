/**
 * R22's check for the reference dashboard, and controlroom's criteria 1–3 for it: in `pipe`, `ci`
 * and `accessible` mode the clean-transcript rule of R6 holds (no escape sequence, no carriage
 * return), under --json stdout is empty and stderr is NDJSON naming a pane, and the program exits
 * by itself — once per mode, and 100 times each with stdin at /dev/null and at a pipe nobody
 * writes to (R7). On a terminal — a fake one, driven in-process so the check runs on every
 * platform — the keys do what the hint line says, and under `manualClock()` the bytes it writes are
 * the same in 20 runs out of 20. On a real one, where the system has a pseudo-terminal to lend,
 * a keystroke script drives it and the terminal itself says it was handed back cooked.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { manualClock } from 'flagstaff/loop';
import { afterAll, describe, expect, it } from 'vitest';

import { run, STEPS, TICK } from './dashboard.mjs';

const APP = fileURLToPath(new URL('dashboard.mjs', import.meta.url));
const spawn_ = (args, env = {}) =>
  execFileSync(process.execPath, [APP, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, ...env } });
const DONE = `Done: Progress: ${String(STEPS.length)}/${String(STEPS.length)} completed`;

describe('the dashboard, as a pipe, CI, a screen reader or an agent sees it', () => {
  it.each([
    ['pipe', {}],
    ['ci', { CI: 'true' }],
    ['accessible', { CLI_ACCESSIBLE: '1' }],
  ])('%s: prints clean lines, every step once, and exits on its own with stdin closed', (_, env) => {
    const out = spawn_([], env);
    expect(out).not.toContain('\u001B');
    expect(out).not.toContain('\r');
    for (const { title } of STEPS) expect(out.split(`◼ ${title}\n`)).toHaveLength(2);
    expect(out.trimEnd().split('\n').at(-1)).toBe(DONE);
    expect(out).not.toContain('switch tab');
  });

  it('--json writes parseable NDJSON to stderr, one event per pane change and one for the commit, and leaves stdout empty', () => {
    const { stdout, stderr, status } = spawnSync(process.execPath, [APP, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(status).toBe(0);
    expect(stdout).toBe('');
    const events = stderr.trim().split('\n').map((line) => JSON.parse(line));
    expect(events.filter((e) => e.event === 'commit')).toEqual([{ event: 'commit', state: DONE }]);
    expect(new Set(events.map((e) => e.event))).toEqual(new Set(['status', 'learn', 'tasks', 'log', 'hn', 'commit']));
  });
});

/**
 * Criterion 3: no run waits for a key nobody can press. 100 runs with stdin at /dev/null and 100
 * with stdin a pipe that is opened and never written to or closed — the one a program that reads
 * stdin would hang on. Twenty at a time, because each run takes the demo's own five ticks.
 */
const RUNS = 100;
const AT_ONCE = 20;
const RUN_GIVES_UP_MS = 30_000;
const HUNDRED_RUNS_MS = 300_000;

/** One run: its exit code, or `'hung'` when it outlived the give-up, and whether it finished its work. */
function once(stdin) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [APP], { stdio: [stdin, 'pipe', 'ignore'], env: { PATH: process.env.PATH } });
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

describe('criterion 3 — the dashboard exits on its own in 100 of 100 runs', () => {
  it.each([
    ['/dev/null', 'ignore'],
    ['a pipe nobody writes to', 'pipe'],
  ])('with stdin at %s', async (_, stdin) => {
    const outcomes = await hundred(stdin);
    expect(outcomes.filter((o) => o !== '0 true')).toEqual([]);
    expect(outcomes).toHaveLength(RUNS);
  }, HUNDRED_RUNS_MS);
});

/** A terminal that is not one: buffers for the streams, a manual clock, a stdin that can go raw. */
function terminal() {
  const out = [];
  const stdin = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => undefined });
  const clock = manualClock();
  const rt = { env: {}, isTTY: { stdout: true }, stdout: { write: (s) => out.push(s), isTTY: true, columns: 80, rows: 24 }, stderr: { write: () => undefined }, stdin, clock };
  return { rt, out, stdin, clock };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('the dashboard, on a terminal', () => {
  it('→ switches to the log tab, s collapses the status line, q quits and leaves the alternate screen', async () => {
    const t = terminal();
    const done = run(t.rt);
    t.clock.tick(0);
    t.stdin.write('\u001B[C');
    await flush();
    expect(t.out.join('')).toContain('◆ Detect the framework');
    t.stdin.write('s');
    await flush();
    t.out.length = 0;
    t.clock.tick(TICK);
    expect(t.out.join('')).not.toContain('Progress:');
    t.stdin.write('q');
    expect(await done).toBe('quit');
    expect(t.out.join('')).toContain('\u001B[?1049l');
  });

  it('shows four tabs, the wizard’s ◼ ◻ marks and a pulsing ▶ on the running step', async () => {
    const t = terminal();
    const done = run(t.rt);
    t.clock.tick(0);
    t.clock.tick(TICK);
    const drawn = t.out.join('');
    expect(drawn).toContain('[Status] · Tail logs · Visualizer · HN');
    expect(drawn).toContain('◼ Detect the framework');
    expect(drawn).toMatch(/[▶▷] Install the SDK/u);
    expect(drawn).toContain('◻ Write the config');
    t.stdin.write('q');
    await done;
  });

  it('runs to the end by itself, and hands the summary to the main screen', async () => {
    const t = terminal();
    const done = run(t.rt);
    t.clock.tick(TICK * (STEPS.length + 1));
    expect(await done).toBe('done');
    const out = t.out.join('');
    expect(out.indexOf('Done: Progress')).toBeGreaterThan(out.indexOf('\u001B[?1049l'));
  });

  /**
   * Criterion 1: under `manualClock()` the `tty` transcript is a function of the keys and the
   * clock and nothing else. Each run visits all four tabs, collapses the status line and comes
   * back, mid-run, and lets the work finish; a timestamp, a random id or an iteration order
   * leaking into any pane's frame makes one run differ.
   */
  it('writes byte-identical transcripts in 20 runs out of 20', async () => {
    const transcripts = [];
    for (let i = 0; i < 20; i += 1) {
      const t = terminal();
      const done = run(t.rt);
      t.clock.tick(0);
      for (const key of ['\u001B[C', 's', '\u001B[C', '\u001B[C', '\u001B[D', '\u001B[D', '\u001B[D']) {
        t.stdin.write(key);
        // eslint-disable-next-line reliability/no-await-in-loop -- one key, then its frame, in order
        await flush();
        t.clock.tick(TICK / 2);
      }
      t.clock.tick(TICK * STEPS.length);
      // eslint-disable-next-line reliability/no-await-in-loop -- each run ends before the next starts
      expect(await done).toBe('done');
      transcripts.push(t.out.join(''));
    }
    expect(transcripts[0]).toContain('\u001B[?1049h');
    expect(new Set(transcripts).size).toBe(1);
  });
});

/**
 * R22 under a real pseudo-terminal: a keystroke script presses →, s and q at the real screen, and
 * then the terminal is asked — by `stty -a`, the kernel's record, not Node's `isRaw` — whether it
 * was handed back cooked. Uses the repository's `scripts/pty-host.py`, so it runs here and is
 * skipped in a copy of this directory; POSIX only, as that host's `stty` is.
 */
const HOST = fileURLToPath(new URL('../../scripts/pty-host.py', import.meta.url));
/** A Python with `pty`, when this is a POSIX system and the host script is here to run. */
function ptyPython() {
  if (process.platform === 'win32' || !existsSync(HOST)) return undefined;
  for (const exe of ['python3', 'python']) {
    try {
      execFileSync(exe, ['-c', 'import pty, select, os'], { stdio: 'ignore' });
      return exe;
    } catch {
      continue;
    }
  }
  return undefined;
}
const python = ptyPython();
const PTY_CASE_MS = 60_000;

describe.skipIf(python === undefined)('the dashboard, on a real terminal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-pty-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('→, s and q do what the hints say, and the terminal comes back cooked, off the alternate screen, cursor shown', async () => {
    const program = join(dir, 'after.mjs');
    writeFileSync(
      program,
      [
        "import { execFileSync } from 'node:child_process';",
        `import { processRuntime } from ${JSON.stringify(import.meta.resolve('controlroom'))};`,
        `import { run } from ${JSON.stringify(new URL('dashboard.mjs', import.meta.url).href)};`,
        'const outcome = await run(processRuntime());',
        "const termios = execFileSync('stty', ['-a'], { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8' });",
        "process.stdout.write('\\nAFTER ' + outcome + ' ' + (/(?:^|\\s)-icanon(?=\\s|$)/mu.test(termios) ? 'RAW' : 'COOKED') + '\\n');",
      ].join('\n'),
    );
    const screen = await new Promise((resolve, reject) => {
      const host = spawn(python, [HOST, process.execPath, program], { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, TERM: 'xterm-256color', NO_COLOR: '1' } });
      let shown = '';
      const script = [
        ['[Status] · Tail logs', '\u001B[C'],
        ['◆ Detect the framework', 's'],
        ['q/^C quit', 'q'],
      ];
      host.stdout.on('data', (chunk) => {
        shown += String(chunk);
        // Each key is pressed when the screen shows what it acts on, never after a fixed wait.
        const [waitFor, key] = script[0] ?? [];
        if (waitFor !== undefined && shown.includes(waitFor)) {
          script.shift();
          host.stdin.write(key);
        }
      });
      host.on('error', reject);
      host.on('close', () => resolve(shown));
    });
    expect(screen).toContain('\u001B[?1049h');
    expect(screen).toContain('Status · [Tail logs]');
    expect(screen.lastIndexOf('\u001B[?1049l')).toBeGreaterThan(screen.lastIndexOf('Tail logs'));
    expect(screen.lastIndexOf('\u001B[?25h')).toBeGreaterThan(screen.lastIndexOf('\u001B[?25l'));
    expect(screen).toMatch(/AFTER quit COOKED/u);
  }, PTY_CASE_MS);
});
