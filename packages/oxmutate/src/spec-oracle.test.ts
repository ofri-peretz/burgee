import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { summarizeSpec, tracesFor, type SpecMutant, type SpecOracle } from './spec-oracle.js';

const tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxmutate-spec-oracle-')));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

/**
 * A stand-in for quint, so no test reaches the network: it records its arguments, writes one ITF
 * file where `--out-itf` says, and fails with the given output when FAKE_QUINT_FAIL is set.
 */
const fake = path.join(tmp, 'fake-quint.mjs');
writeFileSync(
  fake,
  `import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
writeFileSync(process.env.FAKE_QUINT_ARGS, JSON.stringify(args));
if (process.env.FAKE_QUINT_FAIL === 'stderr') { process.stderr.write('  ' + 'e'.repeat(1500) + 'END  \\n'); process.exit(2); }
if (process.env.FAKE_QUINT_FAIL === 'stdout') { process.stdout.write('only stdout\\n'); process.exit(4); }
writeFileSync(args[args.indexOf('--out-itf') + 1].replace('{seq}', '0'), '{"states":[]}');
`,
);
const argsFile = path.join(tmp, 'args.json');
const recorded = (): string[] => JSON.parse(readFileSync(argsFile, 'utf8')) as string[];

const quint = (o: Partial<SpecOracle> = {}): SpecOracle => ({ name: 'counter', backend: 'quint', model: 'specs/counter.qnt', quint: `node ${fake}`, replay: [], files: [], ...o });

describe('tracesFor', () => {
  it('itf: the given directory, resolved from the root, with nothing run', async () => {
    expect(await tracesFor({ name: 'p', backend: 'itf', dir: 'traces/p', replay: [], files: [] }, '/proj', '/work')).toBe(path.resolve('/proj', 'traces/p'));
    expect(await tracesFor({ name: 'p', backend: 'itf', replay: [], files: [] }, '/proj', '/work')).toBe(path.resolve('/proj'));
  });

  it('quint: runs quint run --mbt into the work directory with the defaults', async () => {
    vi.stubEnv('FAKE_QUINT_ARGS', argsFile);
    const work = path.join(tmp, 'w1');
    const dir = await tracesFor(quint(), tmp, work);
    expect(dir).toBe(path.join(work, 'spec-counter'));
    expect(recorded()).toEqual(['run', path.join(tmp, 'specs/counter.qnt'), '--mbt', '--n-traces', '100', '--max-samples', '100', '--max-steps', '20', '--out-itf', path.join(dir, 't{seq}.itf.json')]);
    expect(existsSync(path.join(dir, 't0.itf.json'))).toBe(true);
  });

  it('quint: passes the oracle trace count, step count and seed', async () => {
    vi.stubEnv('FAKE_QUINT_ARGS', argsFile);
    // Any run of spaces separates the words of the command.
    const dir = await tracesFor(quint({ traces: 7, maxSteps: 3, seed: '0x2a', quint: `node  ${fake}` }), tmp, path.join(tmp, 'w2'));
    expect(recorded()).toEqual(['run', path.join(tmp, 'specs/counter.qnt'), '--mbt', '--n-traces', '7', '--max-samples', '7', '--max-steps', '3', '--out-itf', path.join(dir, 't{seq}.itf.json'), '--seed', '0x2a']);
  });

  // A POSIX shell shim stands in for npx on PATH; Windows resolves npx.cmd, which this shim is not.
  it.skipIf(process.platform === 'win32')('quint: by default the pinned version through npx', async () => {
    const bin = path.join(tmp, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\nexec node ${fake} "$@"\n`);
    chmodSync(path.join(bin, 'npx'), 0o755);
    vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`);
    vi.stubEnv('FAKE_QUINT_ARGS', argsFile);
    await tracesFor(quint({ quint: undefined }), tmp, path.join(tmp, 'w3'));
    expect(recorded().slice(0, 3)).toEqual(['-y', '@informalsystems/quint@0.33.0', 'run']);
  });

  it('quint: a failed run names the oracle, the exit code, the last 1000 characters and the fix', async () => {
    vi.stubEnv('FAKE_QUINT_ARGS', argsFile);
    vi.stubEnv('FAKE_QUINT_FAIL', 'stderr');
    const error = await tracesFor(quint(), tmp, path.join(tmp, 'w4')).catch((e: unknown) => e as Error);
    expect((error as Error).message).toBe(`spec oracle counter: quint run exited 2: ${'e'.repeat(997)}END. fix: run the same quint command by hand on specs/counter.qnt`);
  });

  it('quint: with nothing on stderr the error quotes stdout; with no model it says so', async () => {
    vi.stubEnv('FAKE_QUINT_ARGS', argsFile);
    vi.stubEnv('FAKE_QUINT_FAIL', 'stdout');
    await expect(tracesFor(quint({ model: undefined }), tmp, path.join(tmp, 'w5'))).rejects.toThrow('spec oracle counter: quint run exited 4: only stdout. fix: run the same quint command by hand on (no model)');
    expect(recorded()[1]).toBe(tmp);
  });
});

const m = (id: string, file: string, status: string, extra: Partial<SpecMutant> = {}): SpecMutant => ({ id, file, line: 1, mutatorName: 'M', replacement: 'r', status, ...extra });

const located = (id: string): object => ({ id, file: 'src/c.ts', line: 1, mutatorName: 'M', replacement: 'r' });

describe('summarizeSpec: the F metrics over the modelled files', () => {
  const oracle: SpecOracle = { name: 'counter', backend: 'itf', replay: [], files: [] };
  const mutants = [
    // killed by the spec, missed by the tests: a test-spec gap, with its trace
    m('a', 'src/c.ts', 'Survived', { specCoveredBy: ['r1'], spec: { oracle: 'counter', status: 'Killed', killedBy: ['r2', 'r1'] } }),
    m('b', 'src/c.ts', 'NoCoverage', { specCoveredBy: ['r1'], spec: { oracle: 'counter', status: 'Killed' } }),
    // killed by both: no gap
    m('c', 'src/c.ts', 'Killed', { specCoveredBy: ['r1'], spec: { oracle: 'counter', status: 'Killed', killedBy: ['r1'] } }),
    // reached, not killed, tests miss: an escape
    m('d', 'src/c.ts', 'Survived', { specCoveredBy: ['r1'], spec: { oracle: 'counter', status: 'Survived' } }),
    // unreached, tests miss: an escape
    m('e', 'src/c.ts', 'NoCoverage', { specCoveredBy: [] }),
    // tests kill it, the spec does not: neither
    m('f', 'src/c.ts', 'Timeout'),
    // out of the denominator
    m('g', 'src/c.ts', 'Ignored', { specCoveredBy: ['r1'], spec: { oracle: 'counter', status: 'Killed' } }),
    m('h', 'src/other.ts', 'Survived', { specCoveredBy: ['r1'], spec: { oracle: 'counter', status: 'Killed' } }),
  ];

  it('counts, shares, gaps, escapes and the median replay cost', () => {
    const names: Record<string, string> = { r2: 'replays t3.itf.json' };
    expect(summarizeSpec({ oracle, modelledFiles: new Set(['src/c.ts']), traces: 12, mutants, testName: (id) => names[id] ?? `?${id}`, specMs: [10, 9, 2, 30] })).toEqual({
      name: 'counter',
      backend: 'itf',
      traces: 12,
      modelled: 6,
      mappingCoverage: (100 * 4) / 6,
      specKillShare: (100 * 3) / 6,
      testSpecGap: [
        { ...located('a'), trace: 'replays t3.itf.json' },
        { ...located('b'), trace: '?' },
      ],
      specEscapes: [located('d'), located('e')],
      msPerSpecExecution: 10,
    });
  });

  it('an oracle over no mutants reports zeros, not NaN', () => {
    const s = summarizeSpec({ oracle, modelledFiles: new Set(['src/none.ts']), traces: 0, mutants, testName: String, specMs: [] });
    expect([s.modelled, s.mappingCoverage, s.specKillShare, s.msPerSpecExecution]).toEqual([0, 0, 0, 0]);
  });

  it('the median of an odd count is the middle value', () => {
    expect(summarizeSpec({ oracle, modelledFiles: new Set(), traces: 0, mutants: [], testName: String, specMs: [30, 10, 20] }).msPerSpecExecution).toBe(20);
  });
});
