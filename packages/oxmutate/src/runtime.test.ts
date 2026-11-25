import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACTIVE_MUTANT_ENV, FILE_KEY, INTERRUPTS, NAMESPACE, cwd, exit, killGroup, offSignal, onSignal, serverGroups } from './runtime.js';

// The emitter that writes the other half of the contract.
const emitter = readFileSync(new URL('../native/src/instrument.rs', import.meta.url), 'utf8');

describe('the instrumentation contract', () => {
  it('names the namespace the native emitter writes', () => {
    expect(emitter).toContain(`pub const NAMESPACE: &str = "${NAMESPACE}";`);
    expect(NAMESPACE).toBe('__oxmutate__');
  });
  it('arms a mutant from the variable the emitted header reads', () => {
    expect(emitter).toContain(`g.process.env.${ACTIVE_MUTANT_ENV}`);
    expect(ACTIVE_MUTANT_ENV).toBe('__OXMUTATE_ACTIVE_MUTANT__');
  });
  it('prefixes collection-time coverage keys with file:', () => {
    expect(FILE_KEY).toBe('file:');
  });
});

const stayAlive = (() => undefined) as never;

describe('the process seam', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cwd is the process working directory', () => {
    expect(cwd()).toBe(process.cwd());
  });
  it('exit hands the code to the process', () => {
    const spy = vi.spyOn(process, 'exit').mockImplementation(stayAlive);
    exit(3);
    expect(spy).toHaveBeenCalledWith(3);
  });
});

// The runner writes a mark and a record for every mutant run. Opening the file for each write cost
// 6.6 ms a run on a laptop whose endpoint scanner inspects every close, against 0.003 ms on an
// open descriptor, where the median test took 0.07 ms (burgee/paratext, 2026-11-11).
describe('the runner writes through open descriptors', () => {
  const runner = readFileSync(new URL('./runner.ts', import.meta.url), 'utf8');
  it('calls no fs function that opens and closes a file for one write', () => {
    expect(runner.match(/\b(?:writeFileSync|appendFileSync)\(/gu) ?? []).toEqual([]);
  });
  it('writes the mark through the one module that keeps it open', () => {
    expect(runner).toMatch(/progress \?\?= markWriter\(progressPath\)/u);
    const scheduler = readFileSync(new URL('./scheduler.ts', import.meta.url), 'utf8');
    expect(scheduler).toMatch(/const progress = markReader\(unit\.progress\)/u);
    expect(scheduler).toMatch(/const line = progress\.read\(\)/u);
  });
  it('closes what it opened when the run ends, for a pool whose workers are threads', () => {
    expect(runner).toMatch(/closeFiles\(\);\n\s+return super\.onAfterRunFiles/u);
  });
});

const alive = (p: number): boolean => {
  try {
    return process.kill(p, 0);
  } catch {
    return false;
  }
};

const reap = (p: number): void => {
  try {
    process.kill(p, 'SIGKILL');
  } catch {
    // ESRCH: already gone.
  }
};

describe.skipIf(!serverGroups)('killGroup', () => {
  // Every pid this suite starts. They ignore SIGTERM, so when killGroup fails (a surviving mutant does
  // exactly that, run after run) nothing else ends them: ~90 had piled up on one Mac. Reap them whatever
  // the assertions said, then prove they are gone.
  const spawned: number[] = [];
  afterEach(async () => {
    const pids = spawned.splice(0);
    for (const p of pids) {
      reap(-p);
      reap(p);
    }
    await vi.waitFor(() => expect(pids.filter(alive), 'a process this suite spawned outlived it').toEqual([]), { timeout: 5000 });
  });

  it('kills a group leader and the children it started', async () => {
    // A leader that starts a child of its own and reports it: the child is the one a plain kill left behind.
    // Both ignore SIGTERM, as a hung test's processes may: only SIGKILL ends them. The self-limit covers
    // the one case afterEach cannot: vitest killing the worker mid-test.
    const stay = "setTimeout(() => process.exit(0), 60_000); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
    const leader = spawn(process.execPath, ['-e', `const c = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(stay)}], { stdio: 'ignore' }); console.log(c.pid); ${stay}`], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
    if (leader.pid !== undefined) spawned.push(leader.pid);
    const child = Number(await new Promise<string>((resolve) => leader.stdout.once('data', (d: Buffer) => resolve(String(d)))));
    spawned.push(child);
    expect(killGroup(leader.pid ?? 0)).toBe(true);
    await vi.waitFor(() => expect(leader.exitCode !== null || leader.signalCode !== null).toBe(true), { timeout: 5000 });
    await vi.waitFor(() => expect(alive(child)).toBe(false), { timeout: 5000 });
  });
  it('answers false for a group that is not there', () => {
    expect(killGroup(2 ** 22 + 1)).toBe(false);
  });
});

describe('interrupts', () => {
  it('each exits 128 + its number, and a listener hears the signal until it is taken off', () => {
    expect(INTERRUPTS).toEqual({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 });
    const heard = vi.fn();
    onSignal('SIGHUP', heard);
    try {
      process.emit('SIGHUP');
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      offSignal('SIGHUP', heard);
    }
    expect(process.listeners('SIGHUP')).not.toContain(heard);
  });
});
