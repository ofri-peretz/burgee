import { spawn } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { AUTO_SHARE, ceilingOf, cgroupLimit, formatBytes, memoryAvailable, memorySetting, MIN_CEILING, treeRss, vmRss } from './memory.js';

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

/** A /proc (or /sys) that holds only the files given; reading any other throws, as a missing file does. */
const files = (map: Record<string, string>) => (file: string): string => {
  const text = map[file];
  if (text === undefined) throw Object.assign(new Error(`ENOENT: ${file}`), { code: 'ENOENT' });
  return text;
};

describe('resources.workerMemoryLimit', () => {
  it('reads off, auto, a share, a size with a unit, and a number (or a string of one) as MiB', () => {
    expect(memorySetting(undefined)).toBeUndefined();
    expect(memorySetting(null)).toBeUndefined();
    for (const off of [false, 0, 'off']) expect(memorySetting(off)).toBe('off');
    expect(memorySetting('auto')).toBe('auto');
    expect(memorySetting('25%')).toEqual({ share: 0.25 });
    expect(memorySetting(' 12.5 % ')).toEqual({ share: 0.125 });
    expect(memorySetting('100%')).toEqual({ share: 1 });
    expect(memorySetting(800)).toEqual({ bytes: 800 * MIB });
    expect(memorySetting('800')).toEqual({ bytes: 800 * MIB });
    expect(memorySetting('1.5g')).toEqual({ bytes: 1.5 * GIB });
    expect(memorySetting('512MB')).toEqual({ bytes: 512 * MIB });
  });

  it('refuses anything else with the one line and its fix', () => {
    for (const bad of ['lots', '0%', '101%', '-5', -1, true, '5x', {}]) expect(() => memorySetting(bad)).toThrow("resources.workerMemoryLimit is 'auto', 'off', a share such as '25%', or a size such as '1.5g' or 800 (MiB), not");
    expect(() => memorySetting('lots')).toThrow(`not "lots". fix: resources.workerMemoryLimit: 'auto'`);
  });

  it('reads sizes as Docker writes them, with or without b, spaces between, decimals floored to bytes', () => {
    expect(memorySetting('4g')).toEqual({ bytes: 4 * GIB });
    expect(memorySetting('4gb')).toEqual({ bytes: 4 * GIB });
    expect(memorySetting('64k')).toEqual({ bytes: 64 * 1024 });
    expect(memorySetting('2b')).toEqual({ bytes: 2 });
    expect(memorySetting('512 mb')).toEqual({ bytes: 512 * MIB });
    expect(memorySetting(' 800 ')).toEqual({ bytes: 800 * MIB });
    expect(memorySetting('1.25g')).toEqual({ bytes: 1.25 * GIB });
    expect(memorySetting('0.5g')).toEqual({ bytes: 0.5 * GIB });
    expect(memorySetting('1.3b')).toEqual({ bytes: 1 });
    for (const bad of ['4t', '0m', '0g', 'g', 'x800', '25%x', '100.5%', '0%', '5 % %', '1.g']) expect(() => memorySetting(bad), bad).toThrow('resources.workerMemoryLimit is');
  });

  it('names a size in MiB below a GiB, and in GiB with a decimal from one up', () => {
    expect(formatBytes(800 * MIB)).toBe('800 MiB');
    expect(formatBytes(1.5 * GIB)).toBe('1.5 GiB');
    expect(formatBytes(GIB)).toBe('1.0 GiB');
    expect(formatBytes(1023 * MIB)).toBe('1023 MiB');
  });
});

describe('the memory the run has', () => {
  it("reads the cgroup's limit, v2 first, and none for 'max', v1's unlimited, garbage or no cgroup", () => {
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory.max': '4294967296\n' }))).toBe(4 * GIB);
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory.max': 'max\n', '/sys/fs/cgroup/memory/memory.limit_in_bytes': '1024' }))).toBeUndefined();
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': '2147483648' }))).toBe(2 * GIB);
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': '9223372036854771712' }))).toBeUndefined();
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory.max': 'nonsense' }))).toBeUndefined();
    expect(cgroupLimit(files({}))).toBeUndefined();
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory.max': '0' }))).toBeUndefined();
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory.max': String(2 ** 60) }))).toBeUndefined();
    expect(cgroupLimit(files({ '/sys/fs/cgroup/memory.max': String(2 ** 60 - 4096) }))).toBe(2 ** 60 - 4096);
  });

  it("is the cgroup's limit where there is one, else the machine's memory", () => {
    expect(memoryAvailable(files({ '/sys/fs/cgroup/memory.max': String(2 * GIB) }), 64 * GIB)).toBe(2 * GIB);
    expect(memoryAvailable(files({}), 64 * GIB)).toBe(64 * GIB);
  });
});

describe('the ceiling one server is held to', () => {
  const run = { servers: 4, available: 8 * GIB, limited: true };

  it('keeps 80% for the servers, and a floor of 256 MiB', () => {
    expect(AUTO_SHARE).toBe(0.8);
    expect(MIN_CEILING).toBe(256 * MIB);
  });

  it(`auto is ${String(AUTO_SHARE * 100)}% of a limited run's memory across its servers, and nothing where the run has no limit of its own`, () => {
    expect(ceilingOf(undefined, run)).toBe(Math.floor((8 * GIB * AUTO_SHARE) / 4));
    expect(ceilingOf('auto', run)).toBe(Math.floor((8 * GIB * AUTO_SHARE) / 4));
    expect(ceilingOf('auto', { ...run, limited: false })).toBeUndefined();
    expect(ceilingOf(undefined, { ...run, limited: false })).toBeUndefined();
  });

  it('is a share of the memory per server, limited or not; a size as it is; nothing when off', () => {
    expect(ceilingOf({ share: 0.5 }, { ...run, limited: false })).toBe(GIB);
    expect(ceilingOf({ bytes: 700 * MIB }, run)).toBe(700 * MIB);
    expect(ceilingOf('off', run)).toBeUndefined();
  });

  it('never goes below what one Vitest needs, and counts no servers as one', () => {
    expect(ceilingOf({ share: 0.01 }, run)).toBe(MIN_CEILING);
    expect(ceilingOf({ share: 0.5 }, { ...run, servers: 0 })).toBe(4 * GIB);
  });
});

describe('the memory a server holds', () => {
  it("reads VmRSS in bytes, and nothing from a zombie's status", () => {
    expect(vmRss('Name:\tnode\nVmRSS:\t  204800 kB\nThreads: 9\n')).toBe(200 * MIB);
    expect(vmRss('Name:\tnode\nState:\tZ (zombie)\n')).toBe(0);
    expect(vmRss('NotVmRSS:\t100 kB\n')).toBe(0);
    expect(vmRss('VmRSS:\t100  kB\n')).toBe(100 * 1024);
    expect(vmRss('VmRSS:\t100 MB\n')).toBe(0);
  });

  it('adds every process below the server, across its threads, once each, and nothing for one that ended while read', () => {
    const proc = {
      '/proc/10/status': 'VmRSS:\t999 kB',
      '/proc/11/status': 'VmRSS:\t1024 kB',
      '/proc/12/status': 'VmRSS:\t2048 kB',
      '/proc/10/task/10/children': '11',
      '/proc/10/task/20/children': '12 13',
      '/proc/11/task/11/children': '12',
      '/proc/12/task/12/children': '10 14',
      '/proc/14/status': 'VmRSS:\t4096 kB',
      '/proc/14/task/14/children': '11',
    };
    const tasks: Record<string, string[]> = { '/proc/10/task': ['10', '20'], '/proc/11/task': ['11'], '/proc/12/task': ['12'], '/proc/14/task': ['14'] };
    const fs = {
      read: files(proc),
      list: (dir: string): string[] => {
        const t = tasks[dir];
        if (!t) throw new Error(`ENOENT: ${dir}`);
        return t;
      },
    };
    // The server's own rss is what it measured itself (5 MiB), not /proc/10's; 13 ended: no status, no tasks.
    // 12 lists the server again and 14 lists 11 again (a cycle and a duplicate); 14 is reached only through 12.
    expect(treeRss(10, 5 * MIB, fs)).toBe(5 * MIB + 1 * MIB + 2 * MIB + 4 * MIB);
  });

  it('is the server alone where there is no /proc', () => {
    expect(treeRss(10, 7 * MIB, { read: files({}), list: () => { throw new Error('ENOENT'); } })).toBe(7 * MIB);
  });

  it('reads this process tree for real on Linux, and at least its own rss everywhere', async () => {
    const own = process.memoryUsage.rss();
    expect(treeRss(process.pid, own)).toBeGreaterThanOrEqual(own);
    if (process.platform !== 'linux') return;
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' });
    try {
      await new Promise((resolve) => child.once('spawn', resolve));
      expect(treeRss(process.pid, 0)).toBeGreaterThan(0);
    } finally {
      child.kill();
    }
  });
});
