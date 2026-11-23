/**
 * apicontract-lint R12 (`--since`, forwards-only adoption): the full ruleset runs only on the
 * operations added or changed since a ref; the rest run `lint.legacy`. Most cases give `runLint` a
 * planted `LintGit`; the last block runs real git on a temp repository with a planted history.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';
import { runBurgee } from 'burgee/testing';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { contractAt, runLint, toText } from './command-lint.js';
import { type Contract } from './core/model.js';
import { touches } from './lint-engine.js';
import { type LintGit } from './lint-history.js';
import { touchedOf } from './lint-since.js';
import { ConfigError, validateConfig } from './run-config.js';

import { program } from './index.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();
const makeDir = scratchDirs();
const scratch = (files: Record<string, string>): string => {
  const dir = makeDir('apicontract-lint-since-');
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
};

const BASE = 'abc1234def';
/** `getA` as it was: no tags, no description, so two recommended rules find it. */
const A = "  /a:\n    get: { operationId: getA, responses: { '200': { description: ok } } }\n";
const OLD = `openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths:\n${A}`;
/** `getA` untouched, `getB` new: the same two problems on each. */
const NEW = `${OLD}  /b:\n    get: { operationId: getB, responses: { '200': { description: ok } } }\n`;

interface Planted {
  readonly files?: Readonly<Record<string, string>>;
  readonly head?: string | undefined;
  readonly mergeBase?: string;
}

/** A `LintGit` with one commit, `BASE`, holding `files`. */
const planted = (plant: Planted): LintGit => ({
  commit: async (ref) => {
    if (ref === 'HEAD') return 'head' in plant ? plant.head : 'head';
    return ref === BASE ? BASE : undefined;
  },
  mergeBase: async () => plant.mergeBase,
  before: async () => undefined,
  show: async (commit, path) => (commit === BASE ? plant.files?.[path] : undefined),
});

/** A run in a scratch folder linting `api.yaml` as it is now, `NEW` unless given. */
const lintSince = async (git: LintGit, options: { since?: string; lint?: object; api?: string } = {}) => {
  const dir = scratch({ 'api.yaml': options.api ?? NEW });
  const config = validateConfig({ input: 'api.yaml', lint: options.lint ?? {} }, join(dir, 'contractdiff.config.json'));
  return runLint({ cwd: dir, specs: [], config, git, ...(options.since === undefined ? {} : { since: options.since }) });
};
const found = (data: Record<string | symbol, unknown>): string[] => (data.findings as { rule: string; pointer: string }[]).map((finding) => `${finding.rule} ${finding.pointer}`);
const summary = (data: Record<string | symbol, unknown>): string => text(data).split('\n').find((line) => / error\(s\), /u.test(line)) as string;

const B_ONLY = ['operation-description #/paths/~1b/get', 'operation-tags #/paths/~1b/get'];
const EVERYWHERE = ['info-description #', 'operation-description #/paths/~1a/get', 'operation-tags #/paths/~1a/get', 'operation-description #/paths/~1b/get', 'operation-tags #/paths/~1b/get'];
/** `getA` with a new required parameter, which it does not describe: a change `diff` reports. */
const PARAMETER = "getA, parameters: [{ name: q, in: query, required: true, schema: { type: string } }],";

describe('--since (R12)', () => {
  it('lints in full only what is new since the ref, and counts what it skipped', async () => {
    const data = await lintSince(planted({ files: { 'api.yaml': OLD } }), { since: BASE });
    expect(found(data)).toStrictEqual(B_ONLY);
    expect(data.since).toStrictEqual({ from: 'abc1234def (abc1234)', skipped: 1 });
    expect(summary(data)).toBe('0 error(s), 2 warning(s). Checked 11 rule(s) on 1 input(s), 4 node(s); not carried: none; since abc1234def (abc1234): 1 untouched operation(s) skipped.');
    // Without --since, every operation and the document itself.
    const all = await lintSince(planted({ files: { 'api.yaml': OLD } }));
    expect(found(all)).toStrictEqual(EVERYWHERE);
    expect(Object.keys(all)).not.toContain('since');
    expect(summary(all)).not.toMatch(/since/u);
  });

  it('lints a changed operation in full, whatever the verdict; a change diff does not see is no change', async () => {
    const changed = NEW.replace('getA,', PARAMETER);
    expect(found(await lintSince(planted({ files: { 'api.yaml': NEW } }), { since: BASE, api: changed }))).toStrictEqual([
      'operation-description #/paths/~1a/get',
      'operation-tags #/paths/~1a/get',
      'parameter-description #/paths/~1a/get/parameters/0',
    ]);
    // A description is not the contract: `diff` reports nothing, so `getA` stays untouched.
    expect(found(await lintSince(planted({ files: { 'api.yaml': NEW } }), { since: BASE, api: NEW.replace('getA,', 'getA, description: d,') }))).toStrictEqual([]);
  });

  it('runs the rules lint.legacy names on untouched operations too, and refuses one it does not know', async () => {
    const git = planted({ files: { 'api.yaml': OLD } });
    expect(found(await lintSince(git, { since: BASE, lint: { legacy: ['operation-tags', 'info-description'] } }))).toStrictEqual([
      'info-description #',
      'operation-tags #/paths/~1a/get',
      'operation-description #/paths/~1b/get',
      'operation-tags #/paths/~1b/get',
    ]);
    const refused = lintSince(git, { since: BASE, lint: { legacy: ['operation-tags', 'nope'] } });
    await expect(refused).rejects.toBeInstanceOf(ConfigError);
    await expect(lintSince(git, { since: BASE, lint: { legacy: ['nope'] } })).rejects.toThrow('`lint.legacy` names `nope`, which is not a rule. fix: use one of description-length, description-overlap, example-valid, ');
  });

  it('skips every operation of a file that did not change', async () => {
    const same = await lintSince(planted({ files: { 'api.yaml': NEW } }), { since: BASE });
    expect([found(same), same.since]).toStrictEqual([[], { from: 'abc1234def (abc1234)', skipped: 2 }]);
  });

  it('lints in full a file that is new at the ref, or that nothing read there', async () => {
    const runs = await Promise.all([{}, { 'api.yaml': '{' }, { 'api.yaml': 'just: text\n' }].map((files) => lintSince(planted({ files }), { since: BASE })));
    for (const data of runs) {
      expect(found(data)).toStrictEqual(EVERYWHERE);
      expect(data.since).toStrictEqual({ from: 'abc1234def (abc1234)', skipped: 0 });
    }
  });

  it('reads lint.since from the config, and the flag over it; merge-base is the base with origin/main', async () => {
    const files = { 'api.yaml': OLD };
    expect((await lintSince(planted({ files }), { lint: { since: BASE } })).since).toStrictEqual({ from: 'abc1234def (abc1234)', skipped: 1 });
    expect((await lintSince(planted({ files, mergeBase: BASE }), { lint: { since: 'nope' }, since: 'merge-base' })).since).toStrictEqual({ from: 'merge-base (abc1234)', skipped: 1 });
  });

  it('lints everything outside a repository, and says so; a ref it cannot find inside one is a command line to fix', async () => {
    const outside = await lintSince(planted({ head: undefined }), { since: 'merge-base' });
    expect(found(outside)).toStrictEqual(EVERYWHERE);
    expect(outside.since).toStrictEqual({ unapplied: 'not a git repository, so every operation is linted' });
    expect(summary(outside)).toMatch(/; since not applied: not a git repository, so every operation is linted\.$/u);
    await expect(lintSince(planted({}), { since: 'nope' })).rejects.toThrow('`--since nope` names no commit here. fix: fetch it first (in CI, `git fetch origin main`), or pass a ref this checkout has');
  });

  it('is on the command line', async () => {
    const dir = scratch({ 'api.yaml': NEW });
    const r = await runBurgee(program, { argv: ['lint', join(dir, 'api.yaml'), '--since', 'no-such-ref-here'] });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('`--since no-such-ref-here` names no commit here');
  });
});

const contract = (yaml: string): Contract => contractAt(yaml) as Contract;

describe('the pieces', () => {
  it('touchedOf: added and changed operations of the new contract, never a removed one', () => {
    const touched = touchedOf(contract(NEW), contract(NEW.replace('getA,', PARAMETER)));
    expect([...touched.ids]).toStrictEqual(['getA']);
    expect(touched.sources).toStrictEqual(['#/paths/~1a/get']);
    expect([...touchedOf(contract(NEW), contract(NEW)).ids]).toStrictEqual([]);
    // `getB` removed: a finding of the old contract, and nothing to lint in the new one.
    expect(touchedOf(contract(NEW), contract(OLD))).toStrictEqual({ ids: new Set(), sources: [] });
  });

  it('touches: by the node operation, else by its pointer at or under a touched one', () => {
    const touched = { ids: new Set(['getB']), sources: ['#/paths/~1b/get'] };
    const [a, b] = contract(NEW).operations as [Contract['operations'][number], Contract['operations'][number]];
    expect([touches(touched, { pointer: '#/x', value: {}, operation: b }), touches(touched, { pointer: '#/paths/~1b/get', value: {}, operation: a })]).toStrictEqual([true, false]);
    expect(['#/paths/~1b/get', '#/paths/~1b/get/responses', '#/paths/~1b/getter', '#/paths/~1b', '#'].map((pointer) => touches(touched, { pointer, value: {} }))).toStrictEqual([true, true, false, false, false]);
  });

  it('contractAt: undefined for text that does not parse or that no adapter reads', () => {
    expect(contractAt(NEW)?.operations.map((operation) => operation.id)).toStrictEqual(['getA', 'getB']);
    expect([contractAt('{'), contractAt('just: text\n')]).toStrictEqual([undefined, undefined]);
  });

  it('toText: the since note, applied or not', () => {
    const empty = { inputs: [], findings: [], counts: {} };
    expect(toText(empty, {}, [], { since: { from: 'main (abc1234)', skipped: 3 } })).toBe('0 error(s), 0 warning(s). Checked 0 rule(s) on 0 input(s), 0 node(s); not carried: none; since main (abc1234): 3 untouched operation(s) skipped.');
    expect(toText(empty, {}, [], { since: { unapplied: 'why' } })).toMatch(/; since not applied: why\.$/u);
  });
});

const git = async (cwd: string, ...args: string[]): Promise<string> => {
  const result = await run('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, runtime: ambientRuntime() });
  expect(result.stderr).not.toMatch(/fatal/u);
  return result.stdout.trim();
};

describe('--since, on a planted repository', () => {
  it('reads the input at the ref through git, by its path from the config folder', async () => {
    const dir = scratch({ 'api.yaml': OLD, 'contractdiff.config.json': '{"input":"api.yaml"}' });
    await git(dir, 'init', '-q', '-b', 'main');
    await git(dir, 'add', '.');
    await git(dir, 'commit', '-q', '-m', 'one');
    writeFileSync(join(dir, 'api.yaml'), NEW);
    const config = validateConfig({ input: 'api.yaml' }, join(dir, 'contractdiff.config.json'));
    const data = await runLint({ cwd: dir, specs: [], config, since: 'HEAD' });
    expect(found(data)).toStrictEqual(B_ONLY);
    expect(data.since).toMatchObject({ skipped: 1 });
    // A spec named on the command line is read from the folder it was named in, and found by git all the same.
    const named = await runLint({ cwd: dir, specs: [join(dir, 'api.yaml')], config, since: 'HEAD' });
    expect(found(named)).toStrictEqual(B_ONLY);
  });
});
