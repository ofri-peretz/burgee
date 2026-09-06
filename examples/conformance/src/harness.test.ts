import { ExitCode } from '@interlace/cli-core';
import { describe, expect, it } from 'vitest';

import { HOSTS } from './hosts.js';

/** T1 conformance: the harness contract, on both hosts. Cases are added per floor id as intents land. */
describe.each(Object.entries(HOSTS))('%s · T1 harness', (_host, run) => {
  it('runs a command and captures stdout with exit OK', async () => {
    const r = await run({ argv: ['greet', 'ada'] });
    expect(r).toMatchObject({ code: ExitCode.OK, stdout: 'Hello, ada!\n', stderr: '' });
  });

  it('honours a boolean option', async () => {
    const r = await run({ argv: ['greet', 'ada', '--shout'] });
    expect(r.stdout).toBe('HELLO, ADA!\n');
  });

  it('reads an env-bound option from the injected env only', async () => {
    const r = await run({ argv: ['greet', 'ada'], env: { DEMO_GREETING: 'Hi' } });
    expect(r.stdout).toBe('Hi, ada!\n');
    expect(process.env.DEMO_GREETING).toBeUndefined();
  });

  it('reaches a nested subcommand', async () => {
    const r = await run({ argv: ['config', 'get', 'user.name'] });
    expect(r).toMatchObject({ code: ExitCode.OK, stdout: 'ada\n' });
  });

  it('parses stdout under --json', async () => {
    const r = await run({ argv: ['config', 'get', 'user.name', '--json'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.json).toEqual({ key: 'user.name', value: 'ada' });
  });

  it('a runtime failure is RUNTIME with the message on stderr and no help text', async () => {
    const r = await run({ argv: ['fail'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stderr).toContain('boom');
    expect(r.stdout).toBe('');
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/Usage:|Commands:|Options:/);
  });

  it('runtime.exit unwinds with its E1 code', async () => {
    const r = await run({ argv: ['fail', '--code', String(ExitCode.CONFIG)] });
    expect(r.code).toBe(ExitCode.CONFIG);
  });

  it('an unknown command is USAGE', async () => {
    const r = await run({ argv: ['confg'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).not.toBe('');
  });

  it('--help is OK and prints the command list', async () => {
    const r = await run({ argv: ['--help'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toMatch(/greet/);
    expect(r.stdout).toMatch(/config/);
  });

  it('leaves process.env byte-identical after a run that injected env and failed', async () => {
    const before = JSON.stringify(process.env);
    await run({ argv: ['fail'], env: { DEMO_GREETING: 'x' } });
    expect(JSON.stringify(process.env)).toBe(before);
  });

  it('is fast: p95 under 20 ms for a warm run', async () => {
    const RUNS = 50;
    const P95 = 0.95;
    const CEILING_MS = 20;
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      // eslint-disable-next-line reliability/no-await-in-loop -- timing individual runs is the point
      const r = await run({ argv: ['greet', 'x'] });
      times.push(r.durationMs);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(RUNS * P95)]).toBeLessThan(CEILING_MS);
  });
});
