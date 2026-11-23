import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { command, DEFAULT_RUNS, props, toText } from './command-props.js';
import { compareContracts } from './diff-contract.js';
import { runProps } from './props-run.js';

import { program } from './index.js';

const FIXTURES = fileURLToPath(new URL('__fixtures__/props/', import.meta.url));
const OLD = join(FIXTURES, 'shop-old.yaml');
const NEW = join(FIXTURES, 'shop-new.yaml');
const ONE = join(FIXTURES, 'one.yaml');
const TEXT = Symbol.for('burgee.text');

const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();

const makeDir = scratchDirs();

describe('apicontract props, through burgee', () => {
  // burgee's first run loads its renderers lazily; paying that here keeps each case under 5 s.
  beforeAll(async () => {
    await runBurgee(program, { argv: ['--version'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is described for --help and the MCP tool list, and only --emit writes', () => {
    expect(command.name).toBe('props');
    expect(command.description).toBe('Property tests drawn from the contract: validator agreement, round-trip, normalisation and diff soundness, with no server');
    expect(command.effects).toBe('idempotent');
    expect(command.examples).toEqual([
      { command: 'apicontract props openapi.yaml', description: 'the properties on every payload, 1000 values each' },
      { command: 'apicontract props new.yaml --against old.yaml --seed 7', description: 'also check that what diff calls compatible is, replayably' },
      { command: 'apicontract props openapi.yaml --emit test/arbitraries.ts --runs 0', description: 'write fast-check arbitraries for your own tests' },
    ]);
    expect(command.arguments).toEqual([{ name: 'contract', description: 'the contract: a file, or git:<ref>:<path>' }]);
    expect(command.options).toEqual({
      against: { type: 'string', description: 'the contract before, to check diff soundness against: a file, or git:<ref>:<path>', placeholder: 'old' },
      runs: { type: 'number', default: 1000, description: 'values drawn per payload and property', placeholder: 'n' },
      seed: { type: 'number', description: 'the seed to draw from (default: one from the clock, printed)', placeholder: 'n' },
      mode: { type: 'string', choices: ['backward', 'forward', 'full'], description: 'the compatibility question soundness checks, as in diff (default backward)' },
      side: { type: 'string', choices: ['caller', 'server'], description: 'whose code the question is about, as in diff (default caller)' },
      emit: { type: 'string', description: 'write the fast-check arbitraries to this file', placeholder: 'file' },
    });
    expect(DEFAULT_RUNS).toBe(1000);
  });

  it('takes the seed from the clock, as a 32-bit whole number', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2 ** 32 + 5);
    const r = await runBurgee(program, { argv: ['props', ONE, '--runs', '1', '--json'] });
    expect((r.json as { data: { seed: number } }).data.seed).toBe(5);
  });

  it('exits 0 with every tally in the --json envelope when the properties hold', async () => {
    const r = await runBurgee(program, { argv: ['props', NEW, '--against', OLD, '--runs', '30', '--seed', '9', '--json'] });
    expect(r.code).toBe(0);
    const { data } = r.json as { data: Record<string, unknown> };
    expect(data).toMatchObject({ seed: 9, runs: 30, contract: NEW, against: OLD, counterexamples: [], changed: false });
    expect(data).not.toHaveProperty('exitCode');
    expect((data.tallies as Record<'soundness', { checked: number }>).soundness.checked).toBeGreaterThan(0);
  });

  it('prints the seed it chose, so a run with none still replays', async () => {
    const r = await runBurgee(program, { argv: ['props', NEW, '--runs', '2', '--json'] });
    const { data } = r.json as { data: { seed: number } };
    expect(Number.isInteger(data.seed)).toBe(true);
    const again = await runBurgee(program, { argv: ['props', NEW, '--runs', '2', '--seed', String(data.seed), '--json'] });
    expect((again.json as { data: unknown }).data).toEqual(data);
  });

  it('writes the arbitraries with --emit and says it changed something', () => {
    const dir = makeDir('apicontract-props-');
    const data = props({ cwd: dir, contract: NEW, runs: 1, seed: 1, emit: 'test/arbitraries.mjs' });
    expect(data).toMatchObject({ emitted: 'test/arbitraries.mjs', changed: true });
    expect(readFileSync(join(dir, 'test/arbitraries.mjs'), 'utf8')).toContain("import fc from 'fast-check';");
    expect(text(data)).toMatch(/\n\narbitraries written to test\/arbitraries\.mjs$/);
  });

  it('leaves an emitted module that is already up to date alone, and says nothing changed', () => {
    const dir = makeDir('apicontract-props-');
    props({ cwd: dir, contract: NEW, runs: 0, seed: 1, emit: 'arbitraries.mjs' });
    const file = join(dir, 'arbitraries.mjs');
    const before = statSync(file).mtimeMs;
    const again = props({ cwd: dir, contract: NEW, runs: 0, seed: 1, emit: 'arbitraries.mjs' });
    expect(again).toMatchObject({ emitted: 'arbitraries.mjs', changed: false });
    expect(statSync(file).mtimeMs).toBe(before);
    expect(text(again)).toMatch(/\n\narbitraries in arbitraries\.mjs already up to date$/);
    writeFileSync(file, 'stale');
    expect(props({ cwd: dir, contract: NEW, runs: 0, seed: 1, emit: 'arbitraries.mjs' })).toMatchObject({ changed: true });
    expect(readFileSync(file, 'utf8')).toContain("import fc from 'fast-check';");
  });
});

describe('props, with no bug', () => {
  it('prints ok and every tally, and nothing else, with no against, emit or exit code in the data', () => {
    const data = props({ cwd: '.', contract: ONE, runs: 5, seed: 2 });
    expect(data).not.toHaveProperty('against');
    expect(data).not.toHaveProperty('emitted');
    expect(data).not.toHaveProperty('exitCode');
    expect(data.changed).toBe(false);
    expect(text(data)).toMatch(/^ok: .*one\.yaml, 5 run\(s\) per payload, seed 2\n {2}agreement {3}\d+ checked, \d+ discarded, 0 failed\n {2}round-trip {2}\d+ checked, \d+ discarded, 0 failed\n {2}normalise {3}\d+ checked, \d+ discarded, 0 failed\n {2}soundness {3}0 checked, 0 discarded, 0 failed$/);
  });

  it('reads a git:<ref>:<path> contract through the git reader it is given', () => {
    const data = props({ cwd: '.', contract: 'git:HEAD:one.yaml', runs: 1, seed: 1, git: () => readFileSync(ONE, 'utf8') });
    expect(data.contract).toBe('git:HEAD:one.yaml');
  });

  it('makes the folders the arbitraries go in', () => {
    const dir = makeDir('apicontract-props-');
    props({ cwd: dir, contract: ONE, runs: 0, seed: 1, emit: 'a/b/arbitraries.mjs' });
    expect(readFileSync(join(dir, 'a/b/arbitraries.mjs'), 'utf8')).toContain("import fc from 'fast-check';");
  });

  it('fails on a single counterexample', () => {
    const accepting = { validator: () => ({ accepts: () => true, paths: () => [] }) };
    const data = props({ cwd: '.', contract: ONE, runs: 50, seed: 1, subject: accepting });
    expect(data.counterexamples).toHaveLength(1);
    expect(data.exitCode).toBe(ExitCode.RUNTIME);
  });
});

describe('props, with a planted classifier bug', () => {
  it('exits 1 with the counterexample, the seed that replays it and a fix line', () => {
    const blind = { compare: (...args: Parameters<typeof compareContracts>) => ({ ...compareContracts(...args), findings: [] }) };
    const data = props({ cwd: '.', contract: OLD, against: NEW, runs: 100, seed: 4, subject: blind });
    expect(data).toMatchObject({ exitCode: ExitCode.RUNTIME, fix: 'each counterexample is a bug in the code its property names: replay it with --seed 4' });
    const shown = text(data);
    expect(shown).toMatch(/^failed: .*shop-old\.yaml, 100 run\(s\) per payload, seed 4\n {2}agreement {3}\d+ checked, 0 discarded, 0 failed\n/);
    expect(shown).toContain('\n\ncounterexamples (replay with the same --seed):\n  soundness  placeOrder body:application/json: called compatible (backward)');
    expect(shown).toMatch(/\n {4}value: \{"items":\[\{"sku":".*","quantity":11\}\]\}/);
  });
});

describe('toText', () => {
  it('names reported keywords with three places at most, and payloads it could not check', () => {
    const report = {
      ...runProps({ format: 'x', document: {}, operations: [] }, { runs: 1, seed: 1 }),
      reported: [
        { keyword: 'pattern', at: ['/a', '/b', '/c', '/d', '/e'] },
        { keyword: 'not', at: ['/'] },
      ],
      skipped: [{ operation: 'op', payload: 'body', reason: 'why' }],
      counterexamples: [{ property: 'agreement' as const, operation: 'op', payload: 'body', value: 'x'.repeat(400), detail: 'd' }],
    };
    const shown = toText(report, 'c.yaml', undefined, false);
    expect(shown).toContain('\n  pattern  /a, /b, /c and 2 more\n  not  /\n');
    expect(shown).toContain('\n\nnot checked:\n  op body: why');
    expect(shown).toContain(`value: "${'x'.repeat(299)}…`);
    expect(toText({ ...report, counterexamples: [{ ...report.counterexamples[0]!, value: 'x'.repeat(298) }] }, 'c.yaml', undefined, false)).toContain(`value: "${'x'.repeat(298)}"\n`);
    expect(toText({ ...report, reported: [{ keyword: 'pattern', at: ['/a', '/b', '/c'] }] }, 'c.yaml', undefined, false)).toContain('\n\nvalues made without these keywords, and kept only where the validator accepted them:\n  pattern  /a, /b, /c\n');
    expect(toText({ ...report, counterexamples: [{ ...report.counterexamples[0]!, value: undefined }] }, 'c.yaml', undefined, false)).toContain('value: undefined');
  });
});
