/**
 * The judge, tested — because a benchmark is worth exactly as much as its scoring rule, and
 * this one decides numbers the docs site publishes.
 *
 * `judge()` is pure: an outcome and a task in, a verdict out. Four of the cases below are
 * mistakes this file caught while it was written — an error envelope read from the wrong
 * stream, a bare scalar counted as an envelope, bytes counted on one stream, and a hang
 * scored as a correct exit.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { judge, measure, method, type RunOutcome, SCHEMA_BYTES_BUDGET, SKILL_BYTES_BUDGET, type Task } from './axes/reliability.js';
import { gateFailures } from './record.js';

const run = (over: Partial<RunOutcome> = {}): RunOutcome => ({ hung: false, status: 0, stdout: '', stderr: '', ...over });
const task = (over: Partial<Task> = {}): Task => ({ id: 't', args: [], expect: 'ok', json: false, ...over });

describe('exit codes, which decide an agent’s next move', () => {
  it('0 is success, and only for a task that expected success', () => {
    expect(judge(task({ expect: 'ok' }), run({ status: 0 })).exitCorrect).toBe(true);
    expect(judge(task({ expect: 'usage-error' }), run({ status: 0 })).exitCorrect).toBe(false);
  });

  it('2 means "your command is wrong" — an agent should rewrite, not retry', () => {
    expect(judge(task({ expect: 'usage-error' }), run({ status: 2 })).exitCorrect).toBe(true);
    expect(judge(task({ expect: 'runtime-error' }), run({ status: 2 })).exitCorrect).toBe(false);
  });

  /** The distinction the whole axis exists to measure, and the one both incumbents fail. */
  it('1 for a usage error is wrong: indistinguishable from a retryable failure', () => {
    expect(judge(task({ expect: 'usage-error' }), run({ status: 1 })).exitCorrect).toBe(false);
    expect(judge(task({ expect: 'runtime-error' }), run({ status: 1 })).exitCorrect).toBe(true);
  });

  it('any non-zero that is not 2 counts as a runtime failure', () => {
    expect(judge(task({ expect: 'runtime-error' }), run({ status: 7 })).exitCorrect).toBe(true);
  });
});

describe('a hang is never a pass', () => {
  it('scores no exit code as correct, whatever the task expected', () => {
    for (const expected of ['ok', 'usage-error', 'runtime-error'] as const) {
      expect(judge(task({ expect: expected }), run({ hung: true, status: null })).exitCorrect).toBe(false);
    }
  });

  /**
   * The case the guard is actually for. A timed-out child usually leaves `status: null`,
   * which fails the code check on its own — so removing the guard changes nothing above.
   * A kill that *does* leave a status is where a hang could be scored as a correct exit.
   */
  it('is a failure even when the killed process left an otherwise-correct status', () => {
    expect(judge(task({ expect: 'usage-error' }), run({ hung: true, status: 2 })).exitCorrect).toBe(false);
    expect(judge(task({ expect: 'ok' }), run({ hung: true, status: 0 })).exitCorrect).toBe(false);
  });
});

describe('structured output', () => {
  it('reads the envelope off stdout when the command worked', () => {
    expect(judge(task({ json: true }), run({ stdout: '{"ok":true}' })).jsonParsed).toBe(true);
  });

  /**
   * The bug this caught: burgee's engine put a failure envelope on stderr (until D-140 moved it
   * to stdout), and judging stdout alone scored that envelope as a failure, which read as burgee
   * managing 25% on its own headline feature. A CLI under comparison may still do the same.
   */
  it('reads it off stderr when the command failed and put it there', () => {
    expect(judge(task({ json: true }), run({ status: 2, stderr: '{"ok":false,"error":{"code":2}}' })).jsonParsed).toBe(true);
  });

  it('is null when the task never asked for JSON, so it cannot dilute the rate', () => {
    expect(judge(task({ json: false }), run({ stdout: 'Hello' })).jsonParsed).toBeNull();
  });

  it('refuses help text, which is what an agent gets from a CLI without --json', () => {
    expect(judge(task({ json: true }), run({ stdout: 'Usage: demo <command>' })).jsonParsed).toBe(false);
  });

  it('refuses a bare scalar: valid JSON is not an envelope an agent can address', () => {
    expect(judge(task({ json: true }), run({ stdout: '42' })).jsonParsed).toBe(false);
    expect(judge(task({ json: true }), run({ stdout: '"done"' })).jsonParsed).toBe(false);
  });

  it('accepts an array, which is addressable', () => {
    expect(judge(task({ json: true }), run({ stdout: '[{"id":1}]' })).jsonParsed).toBe(true);
  });
});

describe('recovery bytes', () => {
  it('counts both streams, because an agent reads both', () => {
    expect(judge(task(), run({ stdout: 'abc', stderr: 'de' })).bytes).toBe(5);
  });
});

/** The `skill-bytes` record among a variant's, if it has one. */
const skillOf = (records: ReturnType<typeof measure>): (typeof records)[number] | undefined => records.find((r) => r.metric === 'skill-bytes');

/**
 * agent-skill R6 — `skill-bytes`, beside `schema-bytes`: the bytes of `--skill`, the summary an
 * agent loads whole before it calls anything. Gated on burgee at its committed budget, the demo's
 * first measurement, so a skill that starts inlining options grows past it and fails the ratchet.
 */
describe('skill-bytes, measured and gated (agent-skill R6)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-skill-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  /** A program that answers `--skill` with `bytes` bytes of skill, and nothing else. */
  const bin = (name: string, bytes: number | undefined): string => {
    const file = join(dir, `${name}.mjs`);
    const body = bytes === undefined ? 'process.exit(2);' : `if (process.argv.includes('--skill')) process.stdout.write('---\\nname: x\\n---\\n' + 'é'.repeat(${String(Math.max(0, Math.floor((bytes - 18) / 2)))}));`;
    writeFileSync(file, body);
    return file;
  };

  it('the budget is the demo’s committed SKILL.md, measured in bytes', () => {
    const committed = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'examples/demo-cli-burgee/SKILL.md'));
    expect(committed.byteLength).toBeLessThanOrEqual(SKILL_BYTES_BUDGET);
  });

  it('burgee’s skill is measured in bytes and gated at the budget; inside it, the ratchet holds', () => {
    const record = skillOf(measure({ id: 'burgee', bin: bin('inside', SKILL_BYTES_BUDGET) }, [task()]));
    expect(record?.unit).toBe('bytes');
    expect(record?.median).toBeLessThanOrEqual(SKILL_BYTES_BUDGET);
    expect(record?.gate?.max).toBe(SKILL_BYTES_BUDGET);
    expect(gateFailures(record === undefined ? [] : [record])).toEqual([]);
  });

  it('a skill grown past its budget fails the ratchet', () => {
    const record = skillOf(measure({ id: 'burgee', bin: bin('grown', SKILL_BYTES_BUDGET + 64) }, [task()]));
    expect(record?.median).toBeGreaterThan(SKILL_BYTES_BUDGET);
    expect(gateFailures(record === undefined ? [] : [record]).map((f) => f.record.metric)).toEqual(['skill-bytes']);
  });

  it('a variant with no --skill gets no record, never a zero; another variant’s is reported ungated', () => {
    expect(skillOf(measure({ id: 'commander', bin: bin('none', undefined) }, [task()]))).toBeUndefined();
    expect(skillOf(measure({ id: 'other', bin: bin('other', 100) }, [task()]))?.gate).toBeUndefined();
  });
});

/** The `schema-bytes` record among a variant's, if it has one. */
const schemaOf = (records: ReturnType<typeof measure>): (typeof records)[number] | undefined => records.find((r) => r.metric === 'schema-bytes');

/**
 * schema-bytes-gated R1, R2 — `--schema` is the whole surface an agent reads to discover a CLI,
 * and it grew from 1,678 to 4,752 B with nothing failing in the PRs that grew it
 * (B-20261012-agent-schema-bytes-no-gate). burgee's record is gated at the committed budget, so
 * the next growth is a decision written in its own PR, not a band breach found afterwards.
 */
describe('schema-bytes, measured in bytes and gated (schema-bytes-gated)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-schema-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  /**
   * A program that answers `--schema` with a JSON object of exactly `bytes` UTF-8 bytes, padded
   * with two-byte characters so a count of characters and a count of bytes disagree.
   */
  const bin = (name: string, bytes: number): string => {
    const file = join(dir, `${name}.mjs`);
    const pad = bytes - '{"s":""}'.length;
    const body = `if (process.argv.includes('--schema')) process.stdout.write('{"s":"' + 'é'.repeat(${String(Math.floor(pad / 2))}) + '${pad % 2 === 1 ? 'x' : ''}"}');`;
    writeFileSync(file, body);
    return file;
  };

  it('the method says both bytes records are gated', () => {
    expect(method).toMatch(/`schema-bytes` and `skill-bytes` are each gated at the demo’s committed budget\.$/);
  });

  it('the budget is the measurement it was set at, rounded up to 50 B (D-20261012-schema-bytes-budget, D-20261026-schema-bytes-registered-formats)', () => {
    expect(SCHEMA_BYTES_BUDGET % 50).toBe(0);
    expect(SCHEMA_BYTES_BUDGET).toBe(4_700);
  });

  it('burgee’s schema is measured in bytes, not characters, and gated at the budget', () => {
    const record = schemaOf(measure({ id: 'burgee', bin: bin('inside', SCHEMA_BYTES_BUDGET) }, [task()]));
    expect(record?.unit).toBe('bytes');
    expect(record?.median).toBe(SCHEMA_BYTES_BUDGET);
    expect(record?.gate?.max).toBe(SCHEMA_BYTES_BUDGET);
    expect(record?.gate?.why).toMatch(/schema-bytes-gated/);
    expect(record?.note).toMatch(/^bytes of `--schema`/);
    expect(gateFailures(record === undefined ? [] : [record])).toEqual([]);
  });

  it('a reading one byte over the budget fails the gate', () => {
    const record = schemaOf(measure({ id: 'burgee', bin: bin('over', SCHEMA_BYTES_BUDGET + 1) }, [task()]));
    expect(record?.median).toBe(SCHEMA_BYTES_BUDGET + 1);
    expect(gateFailures(record === undefined ? [] : [record]).map((f) => f.record.metric)).toEqual(['schema-bytes']);
  });

  it('a variant with no --schema gets no record, never a zero', () => {
    const none = join(dir, 'none.mjs');
    writeFileSync(none, 'process.exit(2);');
    expect(measure({ id: 'commander', bin: none }, [task()]).map((r) => r.metric)).toEqual(['hangs-per-100', 'exit-code-accuracy', 'structured-output-rate', 'recovery-bytes']);
  });

  it('another variant’s schema is reported ungated', () => {
    const record = schemaOf(measure({ id: 'other', bin: bin('other', 100) }, [task()]));
    expect(record?.median).toBe(100);
    expect(record?.gate).toBeUndefined();
  });
});

/**
 * agent-headroom C1 — the "before" figure beside the "after" (intent constraint 5): `--schema`
 * indented, as a person asks for it, reported next to `schema-bytes` and never gated.
 */
describe('schema-bytes-pretty, the figure the compact schema is read against (agent-headroom C1)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-pretty-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'pretty.mjs');
  writeFileSync(file, "const doc = { a: [1, 2], b: { c: 'd' } };\nif (process.argv.includes('--schema')) process.stdout.write(JSON.stringify(doc, null, process.argv.includes('--format=json-pretty') ? 2 : 0));");

  it('is the bytes of --schema --format=json-pretty, beside schema-bytes, and carries no gate', () => {
    const records = measure({ id: 'burgee', bin: file }, [task()]);
    const compact = records.find((r) => r.metric === 'schema-bytes');
    const pretty = records.find((r) => r.metric === 'schema-bytes-pretty');
    expect(compact?.median).toBe(Buffer.byteLength(JSON.stringify({ a: [1, 2], b: { c: 'd' } })));
    expect(pretty?.median).toBe(Buffer.byteLength(JSON.stringify({ a: [1, 2], b: { c: 'd' } }, null, 2)));
    expect(pretty?.unit).toBe('bytes');
    expect(pretty?.gate).toBeUndefined();
    expect(records.map((r) => r.metric).indexOf('schema-bytes-pretty')).toBe(records.map((r) => r.metric).indexOf('schema-bytes') + 1);
  });
});
