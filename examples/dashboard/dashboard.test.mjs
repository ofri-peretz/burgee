/**
 * R22's check for the reference dashboard: under a pipe and under --json the clean-transcript
 * rule of R6 holds (no escape sequence, no carriage return, NDJSON that parses) and the program
 * exits by itself with stdin closed (R7). On a terminal — a fake one, driven in-process so the
 * check runs on every platform — the keys do what the hint line says.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { manualClock } from 'flagstaff/loop';
import { describe, expect, it } from 'vitest';

import { run, STEPS, TICK } from './dashboard.mjs';

const APP = fileURLToPath(new URL('dashboard.mjs', import.meta.url));
const spawn = (args, env = {}) =>
  execFileSync(process.execPath, [APP, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, ...env } });

describe('the dashboard, as a pipe, CI or an agent sees it', () => {
  it('prints clean lines, every step once, and exits on its own with stdin closed', () => {
    const out = spawn([]);
    expect(out).not.toContain('\u001B');
    expect(out).not.toContain('\r');
    for (const { title } of STEPS) expect(out).toContain(`✔ ${title}`);
    expect(out.trimEnd().split('\n').at(-1)).toBe(`Done: Progress: ${String(STEPS.length)}/${String(STEPS.length)} completed`);
    expect(out).not.toContain('switch tab');
  });

  it('--json writes parseable NDJSON to stderr, one event per pane change and one for the commit, and leaves stdout empty', () => {
    const { stdout, stderr, status } = spawnSync(process.execPath, [APP, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(status).toBe(0);
    expect(stdout).toBe('');
    const events = stderr.trim().split('\n').map((line) => JSON.parse(line));
    expect(events.filter((e) => e.event === 'commit')).toEqual([{ event: 'commit', state: `Done: Progress: ${String(STEPS.length)}/${String(STEPS.length)} completed` }]);
    expect(new Set(events.map((e) => e.event))).toEqual(new Set(['status', 'learn', 'tasks', 'log', 'commit']));
  });
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

  it('runs to the end by itself, and hands the summary to the main screen', async () => {
    const t = terminal();
    const done = run(t.rt);
    t.clock.tick(TICK * (STEPS.length + 1));
    expect(await done).toBe('done');
    const out = t.out.join('');
    expect(out.indexOf('Done: Progress')).toBeGreaterThan(out.indexOf('\u001B[?1049l'));
  });
});
