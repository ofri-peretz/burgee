import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { ExitCode } from 'burgee/testing';
import { describe, expect, it } from 'vitest';

import { ENVELOPE, HOSTS, type HostName } from './hosts.js';

/** T1 conformance: the harness contract, on both hosts. Cases are added per floor id as intents land. */
/** The demo each host family runs; the floor row spawns it. Workspace-relative: no exports map needed. */
const DEMO_BIN: Record<'burgee' | 'commander' | 'yargs', string> = {
  burgee: fileURLToPath(new URL('../../demo-cli-burgee/dist/bin.js', import.meta.url)),
  commander: fileURLToPath(new URL('../../demo-cli-commander/dist/bin.js', import.meta.url)),
  yargs: fileURLToPath(new URL('../../demo-cli-yargs/dist/bin.js', import.meta.url)),
};
function familyOf(host: string): keyof typeof DEMO_BIN {
  if (host.includes('yargs')) return 'yargs';
  if (host.includes('commander')) return 'commander';
  return 'burgee';
}

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

  it('is fast: a warm in-process run beats half a spawned run of the same CLI, measured in the same run', async () => {
    const RUNS = 50;
    const P95 = 0.95;
    const FLOOR_SAMPLES = 3;
    // T1's claim is that the harness runs a CLI in-process for less than spawning it. So the
    // floor row is a spawn of the *same demo CLI*, sampled in the same run: contention on a
    // shared runner inflates both sides together. Two earlier gates failed for PRs that did
    // not touch this code (#27): an absolute 20/40 ms ceiling, then "half a bare node -e ''"
    // — wrong floor, since an empty node on a fast macOS runner (36 ms) is faster than a warm
    // yargs run (23 ms). A spawned CLI run costs hundreds of ms; the harness must beat half.
    // ponytail: half, not a tenth — the margin that survives a loaded runner while still
    // failing the day T1 spawns a process itself.
    const bin = DEMO_BIN[familyOf(host)];
    const floor: number[] = [];
    for (let i = 0; i < FLOOR_SAMPLES; i++) {
      const t0 = performance.now();
      spawnSync(process.execPath, [bin, 'greet', 'x'], { stdio: 'ignore' });
      floor.push(performance.now() - t0);
    }
    floor.sort((a, b) => a - b);
    const spawnedCliMs = floor[Math.floor(FLOOR_SAMPLES / 2)] ?? 0;
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      // eslint-disable-next-line reliability/no-await-in-loop -- timing individual runs is the point
      const r = await run({ argv: ['greet', 'x'] });
      times.push(r.durationMs);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(RUNS * P95)] ?? 0;
    expect(p95, `harness p95 ${p95.toFixed(1)} ms vs spawned CLI ${spawnedCliMs.toFixed(1)} ms`).toBeLessThan(spawnedCliMs / 2);
  });
});
