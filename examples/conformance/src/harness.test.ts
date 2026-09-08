import { spawnSync } from 'node:child_process';

import { ExitCode } from 'burgee/testing';
import { describe, expect, it } from 'vitest';

import { ENVELOPE, HOSTS, type HostName } from './hosts.js';

/** T1 conformance: the harness contract, on both hosts. Cases are added per floor id as intents land. */
describe.each(Object.entries(HOSTS) as [HostName, (typeof HOSTS)[HostName]][])('%s · T1 harness', (host, run) => {
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
    // Same data, two encodings: the incumbents' demos print the raw record, burgee's
    // handler returns the value and the engine wraps it in the O1 envelope.
    expect(r.json).toMatchObject(ENVELOPE.has(host) ? { ok: true, data: 'ada' } : { key: 'user.name', value: 'ada' });
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

  it('is fast: a warm in-process run beats half a bare node spawn, measured in the same run', async () => {
    const RUNS = 50;
    const P95 = 0.95;
    const FLOOR_SAMPLES = 5;
    // The smoke is about order of magnitude, not the OS or the runner. An absolute ceiling
    // (20 ms, then 40 ms) failed twice in one day on shared runners for PRs that did not
    // touch this code (#27): the Quality Full job runs every suite at once on two cores,
    // where a warm run measured 40–52 ms. So the gate is relative, the B2 rule from the
    // benchmarks floor: sample a bare `node -e ''` spawn in the same run as the floor row,
    // and require the harness p95 to be under half of it. Contention inflates both sides.
    // ponytail: half, not a tenth — a tenth is what an idle machine shows (5 ms vs 30 ms);
    // half is the margin that survives a loaded runner while still failing if T1 ever
    // spawns a process.
    const floor: number[] = [];
    for (let i = 0; i < FLOOR_SAMPLES; i++) {
      const t0 = performance.now();
      // eslint-disable-next-line node-security/detect-child-process -- constant args, no shell: this IS the bare-node floor row
      spawnSync(process.execPath, ['-e', '']);
      floor.push(performance.now() - t0);
    }
    floor.sort((a, b) => a - b);
    const bareSpawnMs = floor[Math.floor(FLOOR_SAMPLES / 2)] ?? 0;
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      // eslint-disable-next-line reliability/no-await-in-loop -- timing individual runs is the point
      const r = await run({ argv: ['greet', 'x'] });
      times.push(r.durationMs);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(RUNS * P95)] ?? 0;
    expect(p95, `harness p95 ${p95.toFixed(1)} ms vs bare spawn ${bareSpawnMs.toFixed(1)} ms`).toBeLessThan(bareSpawnMs / 2);
  });
});
