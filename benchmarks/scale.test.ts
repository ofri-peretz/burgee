/**
 * Z5's bench (`axes/scale.ts`): the 250-command fixture is generated, it is the program it says it
 * is, help and schema never import a lazy handler, the perf axis emits both sizes, and the 3× gate
 * fires above itself. A budget that has never failed is not a budget (`ratchet.test.ts`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { answerProblem, msRecord, programSource, proveFixtures, ratioRecord, SCALE_RATIO_CEILING, scaleRounds, SIZES, SURFACES, writeFixtures } from './axes/scale.js';
import { gateFailures } from './record.js';

/**
 * Under `benchmarks/`, as the bench's own fixtures are, because a fixture imports `burgee` and only
 * resolves it from inside the workspace; `.fixtures-*\/` keeps it out of git. Removed after the file.
 */
const made: string[] = [];
const scratch = (prefix: string): string => {
  const dir = mkdtempSync(join(import.meta.dirname, `.fixtures-${prefix}`));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe('the scale fixtures are generated, not committed (Z5, design gate 2026-10-25)', () => {
  it('writes a 30- and a 250-command program, one handler in ten in a module of its own', () => {
    const dir = join(scratch('scale-test-'), 'scale');
    const entries = writeFixtures(dir);
    expect([...entries.keys()]).toEqual([30, 250]);
    for (const [size, entry] of entries) {
      expect(existsSync(entry)).toBe(true);
      expect(readdirSync(join(dir, String(size), 'cmds'))).toHaveLength(size / 10);
      expect(programSource(size).match(/defineCommand\(/g)).toHaveLength(size);
    }
  });

  it('writes under a directory benchmarks/.gitignore ignores, so nothing generated is committed', () => {
    const r = spawnSync('git', ['check-ignore', '-q', 'benchmarks/.fixtures-scale/250/cli.mjs'], { cwd: join(import.meta.dirname, '..') });
    expect(r.status).toBe(0);
  });
});

describe('each fixture is proved before it is timed', () => {
  const dir = join(scratch('scale-test-'), 'scale');
  const entries = writeFixtures(dir);

  it('answers --help and --schema as the program it was generated as, importing no lazy handler', () => {
    expect(() => proveFixtures(entries)).not.toThrow();
  });

  it('refuses a schema with a command missing, a help that does not name the last command, and a handler that loaded', () => {
    expect(answerProblem(250, '--schema', { status: 0, stderr: '', stdout: JSON.stringify({ commands: [{ name: 'cmd-001' }] }) })).toBe('--schema lists 1 generated commands, not 250');
    expect(answerProblem(30, '--help', { status: 0, stderr: '', stdout: 'cmd-001\ncmd-029\n' })).toBe('--help does not name cmd-030');
    expect(answerProblem(30, '--help', { status: 0, stderr: 'loaded cmd-010\n', stdout: 'cmd-030' })).toBe('imported a lazy handler: loaded cmd-010');
    expect(answerProblem(30, '--schema', { status: 0, stderr: '', stdout: 'not json' })).toMatch(/^--schema did not parse/);
  });

  it('counts only the generated commands, not the completion command burgee adds', () => {
    const commands = [...Array.from({ length: 30 }, (_, i) => ({ name: `cmd-${String(i + 1).padStart(3, '0')}` })), { name: 'completion' }];
    expect(answerProblem(30, '--schema', { status: 0, stderr: '', stdout: JSON.stringify({ commands }) })).toBeUndefined();
  });
});

describe('the records, and the gate on them', () => {
  it('emits an ms row per size and surface, carrying the range, and a gated ratio row per surface', () => {
    const rows = SIZES.flatMap((size) => SURFACES.map((surface) => msRecord(size, surface, [3, 1, 2])));
    expect(rows.map((r) => r.variant)).toEqual(['30 commands, --help', '30 commands, --schema', '250 commands, --help', '250 commands, --schema']);
    expect(rows[0]).toMatchObject({ metric: 'scale-start-ms', median: 2, detail: { commands: 30, range: '1–3' } });
    const ratio = ratioRecord('--schema', [20, 40], [10, 10]);
    expect(ratio).toMatchObject({ variant: '250 ÷ 30 commands, --schema', metric: 'scale-ratio', median: 2, gate: { max: SCALE_RATIO_CEILING }, detail: { range: '2–4' } });
  });

  it('is the decision’s 3×, gates the median of paired rounds, and fires one step over it', () => {
    expect(SCALE_RATIO_CEILING).toBe(3);
    expect(gateFailures([ratioRecord('--help', [30, 30, 30], [10, 10, 10])])).toEqual([]);
    expect(gateFailures([ratioRecord('--help', [31, 31, 31], [10, 10, 10])])).toHaveLength(1);
    // A failing-first ceiling of 0, as it was before the readings set it: any measurement is red.
    expect(gateFailures([ratioRecord('--help', [11], [10], 0)])).toHaveLength(1);
  });

  it('runs a whole multiple of four rounds, never more than it was asked for past the floor', () => {
    expect(scaleRounds(52)).toBe(32);
    expect(scaleRounds(92)).toBe(32);
    expect(scaleRounds(8)).toBe(8);
    expect(scaleRounds(5)).toBe(8);
    expect(scaleRounds(1)).toBe(4);
  });
});
