/**
 * R22's check for the chat boilerplate. Piped, it reads a prompt a line and prints a clean
 * transcript, R6's rule: no escape sequence, no carriage return, and it exits on its own when
 * stdin ends (R7). Under --json the transcript is NDJSON on stderr. On a terminal, driven
 * in-process so the check runs everywhere, a reply streams and commits once, Esc interrupts it,
 * Tab completes a slash command, and Ctrl+C quits.
 */
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { manualClock } from 'flagstaff/loop';
import { describe, expect, it } from 'vitest';

import { run, TICK } from './chat.mjs';

const APP = fileURLToPath(new URL('chat.mjs', import.meta.url));
const chat = (input, args = []) => spawnSync(process.execPath, [APP, ...args], { input, encoding: 'utf8' });

describe('the chat, as a pipe or an agent sees it', () => {
  it('answers each piped prompt in order, asks before a tool, and exits when stdin ends', () => {
    const { stdout, status } = chat('hello\n/help\nlist the files\ny\n/nope\n');
    expect(status).toBe(0);
    expect(stdout).not.toContain('\u001B');
    expect(stdout).not.toContain('\r');
    const order = ['> hello', 'You said: *hello*', '> /help', '/exit  leave', '> list the files', 'Allow ls? Type y or n.', '⏺ ran ls', '- `chat.mjs`', 'unknown command /nope'];
    const at = order.map((line) => stdout.indexOf(line));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('a refused tool is not run, and empty stdin ends the program at once', () => {
    expect(chat('list files\nn\n').stdout).toContain('✗ ls was not run');
    expect(chat('').status).toBe(0);
  });

  it('--json is NDJSON on stderr, one commit event per transcript entry, and stdout stays empty', () => {
    const { stdout, stderr } = chat('hello\n', ['--json']);
    expect(stdout).toBe('');
    const events = stderr.trim().split('\n').map((line) => JSON.parse(line));
    expect(events.map((e) => e.event)).toEqual(['commit', 'commit']);
    expect(events[0].state).toBe('> hello');
  });
});

/** A terminal that is not one: buffers, a manual clock, a stdin that can go raw. */
function terminal() {
  const out = [];
  const stdin = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => undefined });
  const clock = manualClock();
  const rt = { env: {}, isTTY: { stdout: true }, stdout: { write: (s) => out.push(s), isTTY: true, columns: 80, rows: 24 }, stderr: { write: () => undefined }, stdin, clock };
  return { rt, out, stdin, clock };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
/** readline's escape timeout: a lone ESC is a key only once no sequence follows it. */
const ESCAPE_SETTLES = 600;
const A_FEW_WORDS = 3;
const THE_WHOLE_REPLY = 100;
const type = async (t, keys) => {
  t.stdin.write(keys);
  await flush();
};

describe('the chat, on a terminal', () => {
  it('a reply streams under a status line, then settles with the status cleared; Ctrl+C quits', async () => {
    const t = terminal();
    const done = run(t.rt);
    await type(t, 'hello');
    await type(t, '\r');
    t.clock.tick(TICK * A_FEW_WORDS);
    expect(t.out.join('')).toMatch(/thinking · \d+\.\ds · 3 tokens/u);
    t.out.length = 0;
    t.clock.tick(TICK * THE_WHOLE_REPLY);
    const settled = t.out.join('');
    // The reply is committed after the last frame that showed the status line, not before it.
    expect(settled.lastIndexOf('real client')).toBeGreaterThan(settled.lastIndexOf('thinking'));
    await type(t, '\u0003');
    await done;
  });

  it('Esc interrupts a reply mid-stream', async () => {
    const t = terminal();
    const done = run(t.rt);
    await type(t, 'hello\r');
    t.clock.tick(TICK * 2);
    t.stdin.write('\u001B');
    await new Promise((resolve) => setTimeout(resolve, ESCAPE_SETTLES));
    expect(t.out.join('')).toContain('(interrupted)');
    await type(t, '\u0003');
    await done;
  });

  it('Tab completes a slash command', async () => {
    const t = terminal();
    const done = run(t.rt);
    await type(t, '/he');
    await type(t, '\t');
    await type(t, '\r');
    expect(t.out.join('')).toContain('/help  show the commands');
    await type(t, '\u0003');
    await done;
  });
});
