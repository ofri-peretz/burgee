/**
 * apicontract-lint R10 (new rules warn first) and R11 (judged by the old rules): the rules read
 * through git. Most cases give `runLint` a planted `LintGit`; the last block runs real git on a
 * temp repository with a planted history.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ambientRuntime, run } from 'bellpull';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { runLint, toText } from './command-lint.js';
import { changesOf, cutoffOf, gitIn, type LintGit, newRulesOf, type Resolved, rulesetOfText } from './lint-history.js';
import { ConfigError, UsageError, validateConfig } from './run-config.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();
const makeDir = scratchDirs();
const scratch = (files: Record<string, string>): string => {
  const dir = makeDir('apicontract-lint-history-');
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
};

const API = "openapi: 3.1.0\ninfo: { title: t, version: '1', description: d }\npaths:\n  /b/:\n    get: { operationId: getB, description: d, tags: [b], responses: { '200': { description: ok } } }\n";
const SLASH = 'path-no-trailing-slash';
const NOW = new Date('2026-11-23T00:00:00.000Z');
const BASE = 'abc1234def';
const OLD = 'old0000aaa';
const json = (lint: object): string => JSON.stringify({ input: 'api.yaml', lint });

interface Planted {
  readonly commits?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly head?: string | undefined;
  readonly mergeBase?: string;
  readonly before?: string;
}

/** A `LintGit` over planted commits, recording the dates `before` was asked about. */
const planted = (plant: Planted): LintGit & { asked: Date[]; shown: string[] } => {
  const asked: Date[] = [];
  const shown: string[] = [];
  const commits = new Map(Object.entries(plant.commits ?? {}));
  return {
    asked,
    shown,
    commit: async (ref) => {
      if (ref === 'HEAD') return 'head' in plant ? plant.head : 'head';
      return commits.has(ref) ? ref : undefined;
    },
    mergeBase: async () => plant.mergeBase,
    before: async (date) => {
      asked.push(date);
      return plant.before;
    },
    show: async (commit, path) => {
      shown.push(`${commit}:${path}`);
      return commits.get(commit)?.[path];
    },
  };
};

/** A run in a scratch folder whose working config is `lint`. */
const lintIn = async (lint: object, git: LintGit, extra: { rulesFrom?: string; files?: Record<string, string> } = {}) => {
  const dir = scratch({ 'api.yaml': API, ...extra.files });
  const config = validateConfig(JSON.parse(json(lint)), join(dir, 'contractdiff.config.json'));
  return runLint({ cwd: dir, specs: [], config, git, now: NOW, ...(extra.rulesFrom === undefined ? {} : { rulesFrom: extra.rulesFrom }) });
};
const levelOf = (data: Record<string | symbol, unknown>, rule: string): string | undefined => (data.findings as { rule: string; level: string }[]).find((finding) => finding.rule === rule)?.level;
const summary = (data: Record<string | symbol, unknown>): string => text(data).split('\n').find((line) => / error\(s\), /u.test(line)) as string;

const spectral = (description: string) => `rules:\n  ids:\n    description: ${description}\n    given: $.info\n    then: { field: title, function: truthy }\n    severity: error\n`;

describe('--rules-from (R11)', () => {
  it('applies the rules at the ref and lists what the working tree changed, not applied', async () => {
    const commits = { [BASE]: { 'contractdiff.config.json': json({ extends: ['recommended', '.spectral.yaml'], rules: { [SLASH]: 'warn', 'operation-tags': 'off' } }), '.spectral.yaml': spectral('old') } };
    const git = planted({ commits, before: OLD });
    const working = { extends: ['recommended', '.spectral.yaml'], rules: { [SLASH]: 'error', 'info-description': 'off' } };
    const data = await lintIn(working, git, { rulesFrom: BASE, files: { '.spectral.yaml': spectral('new') } });
    expect(levelOf(data, SLASH)).toBe('warn');
    expect(data.exitCode).toBeUndefined();
    expect(data.rulesFrom).toBe(`${BASE} (abc1234)`);
    expect(data.rulesetChanged).toStrictEqual([
      { id: 'ids', from: 'error', to: 'error', definition: true },
      { id: 'info-description', from: 'warn', to: 'off', definition: false },
      { id: 'operation-tags', from: 'off', to: 'warn', definition: false },
      { id: SLASH, from: 'warn', to: 'error', definition: false },
    ]);
    // The rules at the ref set nothing at `error` that is new, so warn-first asks git nothing.
    const lines = text(data).split('\n');
    expect(lines.slice(0, 7)).toStrictEqual([
      `rules changed since ${BASE} (abc1234), not applied`,
      '  info   ruleset-changed  ids: its definition changed',
      '  info   ruleset-changed  info-description: warn → off',
      '  info   ruleset-changed  operation-tags: off → warn',
      `  info   ruleset-changed  ${SLASH}: warn → error`,
      `         fix: merge the change first; until then the rules come from ${BASE} (abc1234)`,
      '',
    ]);
    expect(summary(data)).toMatch(new RegExp(`; rules from ${BASE} \\(abc1234\\); warn first: 1 \\(ids\\)\\.$`, 'u'));
    expect(git.asked).toStrictEqual([new Date('2026-11-09T00:00:00.000Z')]);
    // Only the config and the ruleset files are read at a ref; a built-in ruleset is not a file.
    expect(git.shown).toStrictEqual([`${BASE}:contractdiff.config.json`, `${BASE}:.spectral.yaml`, `${OLD}:contractdiff.config.json`]);
  });

  it('reads merge-base as the base with origin/main, and a ref with no config there as the defaults', async () => {
    const git = planted({ commits: { [BASE]: {} }, mergeBase: BASE });
    const data = await lintIn({ rules: { [SLASH]: 'error' } }, git, { rulesFrom: 'merge-base' });
    expect(levelOf(data, SLASH)).toBe('warn');
    expect(data.rulesFrom).toBe(`merge-base (abc1234)`);
    expect(data.rulesetChanged).toStrictEqual([{ id: SLASH, from: 'warn', to: 'error', definition: false }]);
  });

  it('says when nothing changed, and when there is no repository or no config', async () => {
    const same = { rules: { [SLASH]: 'warn' } };
    const unchanged = await lintIn(same, planted({ commits: { [BASE]: { 'contractdiff.config.json': json(same) } } }), { rulesFrom: BASE });
    expect(unchanged.rulesetChanged).toStrictEqual([]);
    expect(text(unchanged).startsWith('api.yaml')).toBe(true);
    expect('warnFirstUnchecked' in unchanged).toBe(false);
    const outside = await lintIn({ rules: { [SLASH]: 'error' } }, planted({ head: undefined }), { rulesFrom: 'merge-base' });
    expect(levelOf(outside, SLASH)).toBe('error');
    expect(outside.rulesFrom).toBe('the working tree: not a git repository');
    expect(outside.rulesetChanged).toStrictEqual([]);
    expect(text(outside).startsWith('api.yaml')).toBe(true);
    expect(summary(outside)).toMatch(/; rules from the working tree: not a git repository; warn first not checked: not a git repository\.$/u);
    const dir = scratch({ 'api.yaml': API });
    const bare = await runLint({ cwd: dir, specs: ['api.yaml'], config: undefined, git: planted({}), rulesFrom: BASE, now: NOW });
    expect(bare.rulesFrom).toBe('the working tree: there is no config to read at a ref');
    expect(bare.rulesetChanged).toStrictEqual([]);
    expect(text(bare).startsWith('api.yaml')).toBe(true);
  });

  it('refuses a ref git cannot find, a config that is not JSON, and rules at the ref it cannot read', async () => {
    await expect(lintIn({}, planted({}), { rulesFrom: 'merge-base' })).rejects.toThrow('`--rules-from merge-base` names no commit here');
    await expect(lintIn({}, planted({}), { rulesFrom: 'nope' })).rejects.toThrow(
      new UsageError('`--rules-from nope` names no commit here. fix: fetch it first (in CI, `git fetch origin main`), or pass a ref this checkout has'),
    );
    const dir = scratch({ 'api.yaml': API });
    const config = validateConfig({ input: 'api.yaml' }, join(dir, 'contractdiff.config.mjs'));
    await expect(runLint({ cwd: dir, specs: [], config, git: planted({}), rulesFrom: BASE })).rejects.toThrow(
      new UsageError('`--rules-from` reads contractdiff.config.json at the ref, and the config is contractdiff.config.mjs. fix: move the config to contractdiff.config.json, or drop --rules-from'),
    );
    const broken = planted({ commits: { [BASE]: { 'contractdiff.config.json': '{' } } });
    await expect(lintIn({}, broken, { rulesFrom: BASE })).rejects.toThrow(ConfigError);
    await expect(lintIn({}, broken, { rulesFrom: BASE })).rejects.toThrow(/^contractdiff\.config\.json at abc1234 cannot be used:\n {2}- it is not JSON \(.+\)\. fix: correct it in a commit, or pass a later ref$/u);
    const missing = planted({ commits: { [BASE]: { 'contractdiff.config.json': json({ extends: ['.spectral.yaml'] }) } } });
    await expect(lintIn({}, missing, { rulesFrom: BASE })).rejects.toThrow(
      '`lint.extends` names .spectral.yaml, which cannot be read (it is not in commit abc1234). fix: correct its path',
    );
    const invalid = planted({ commits: { [BASE]: { 'contractdiff.config.json': JSON.stringify({ lint: { rules: { [SLASH]: 'fatal' } } }) } } });
    await expect(lintIn({}, invalid, { rulesFrom: BASE })).rejects.toThrow(/^contractdiff\.config\.json at abc1234 cannot be used:\n {2}- `lint\.rules` must map rule ids/u);
  });
});

describe('warn first (R10)', () => {
  it('runs a rule at warn while it is newer at error than warnFor, and says so', async () => {
    const git = planted({ commits: { [OLD]: { 'contractdiff.config.json': json({ extends: ['agent-ready'] }) } }, before: OLD });
    const data = await lintIn({ rules: { [SLASH]: 'error' }, warnFor: '30d' }, git);
    expect(levelOf(data, SLASH)).toBe('warn');
    expect(data.warnFirst).toStrictEqual([SLASH]);
    expect(data.exitCode).toBeUndefined();
    expect(summary(data)).toMatch(/; warn first: 1 \(path-no-trailing-slash\)\.$/u);
    expect(git.asked).toStrictEqual([new Date('2026-10-24T00:00:00.000Z')]);
    expect('rulesFrom' in data).toBe(false);
  });

  it('runs a rule at its own level once it was at error at the cutoff, and every rule warns when no commit is that old', async () => {
    const atError = await lintIn({ rules: { [SLASH]: 'error' } }, planted({ commits: { [OLD]: { 'contractdiff.config.json': json({ rules: { [SLASH]: 'error' } }) } }, before: OLD }));
    expect(levelOf(atError, SLASH)).toBe('error');
    expect('warnFirst' in atError).toBe(false);
    const young = await lintIn({ rules: { [SLASH]: 'error', 'operation-tags': 'error' } }, planted({}));
    expect(young.warnFirst).toStrictEqual(['operation-tags', SLASH]);
    expect(summary(young)).toMatch(/; warn first: 2 \(operation-tags, path-no-trailing-slash\)\.$/u);
    const off = await lintIn({ rules: { [SLASH]: 'error' } }, planted({ commits: { [OLD]: { 'contractdiff.config.json': json({ rules: { [SLASH]: 'off' } }) } }, before: OLD }));
    expect(off.warnFirst).toStrictEqual([SLASH]);
  });

  it('asks git nothing with warnFor 0d, or when no rule is at error', async () => {
    const zero = planted({});
    expect(levelOf(await lintIn({ rules: { [SLASH]: 'error' }, warnFor: '0d' }, zero), SLASH)).toBe('error');
    const warned = planted({});
    expect(levelOf(await lintIn({ rules: { [SLASH]: 'warn' } }, warned), SLASH)).toBe('warn');
    expect([zero.asked, warned.asked]).toStrictEqual([[], []]);
  });

  it('says why it was not checked', async () => {
    const unreadable = await lintIn({ rules: { [SLASH]: 'error' } }, planted({ commits: { [OLD]: { 'contractdiff.config.json': '{' } }, before: OLD }));
    expect(levelOf(unreadable, SLASH)).toBe('error');
    expect(unreadable.warnFirstUnchecked).toMatch(/^the rules at old0000 cannot be read \(contractdiff\.config\.json at old0000 cannot be used:\)$/u);
    const dir = scratch({ 'api.yaml': API });
    const config = validateConfig({ input: 'api.yaml', lint: { rules: { [SLASH]: 'error' } } }, join(dir, 'contractdiff.config.mjs'));
    const module = await runLint({ cwd: dir, specs: [], config, git: planted({}), now: NOW });
    expect(module.warnFirstUnchecked).toBe('the config is not JSON, so its history is not read');
    expect(summary(module)).toMatch(/; warn first not checked: the config is not JSON, so its history is not read\.$/u);
  });

  it('counts from the time the run starts when no time is given', async () => {
    const git = planted({});
    const dir = scratch({ 'api.yaml': API });
    const config = validateConfig({ input: 'api.yaml', lint: { rules: { [SLASH]: 'error' } } }, join(dir, 'contractdiff.config.json'));
    const started = Date.now();
    await runLint({ cwd: dir, specs: [], config, git });
    const asked = (git.asked[0] as Date).getTime() + 14 * 86_400_000;
    expect(asked).toBeGreaterThanOrEqual(started);
    expect(asked).toBeLessThanOrEqual(Date.now());
  });
});

const resolved = (levels: Resolved['levels'], all: Resolved['all'] = {}): Resolved => ({ levels, all });
const rule = (description: string) => ({ description, given: { select: 'document' as const }, then: { function: 'truthy' as const }, fix: 'f' });

describe('the pieces', () => {
  it('changesOf: added, removed, re-levelled and redefined rules, in id order', () => {
    expect(changesOf(resolved({ b: 'warn', a: 'error', c: 'warn' }, { b: rule('gone'), c: rule('one'), d: rule('same') }), resolved({ a: 'error', c: 'error', e: 'warn', d: 'warn' }, { c: rule('two'), d: rule('same') }))).toStrictEqual([
      // `b` is defined only at the base: that it no longer runs is the change, not its definition.
      { id: 'b', from: 'warn', to: undefined, definition: false },
      { id: 'c', from: 'warn', to: 'error', definition: true },
      { id: 'd', from: undefined, to: 'warn', definition: false },
      { id: 'e', from: undefined, to: 'warn', definition: false },
    ]);
    expect(changesOf(resolved({}, { x: rule('one') }), resolved({}, {}))).toStrictEqual([]);
  });

  it('newRulesOf: rules at error that did not run then', () => {
    expect(newRulesOf({ a: 'error', b: 'error', c: 'warn', d: 'error' }, { a: 'error', b: 'warn', d: 'off' })).toStrictEqual(['d']);
    expect(newRulesOf({ a: 'error' }, {})).toStrictEqual(['a']);
  });

  it('rulesetOfText: reads a redocly.yaml in a folder as Redocly', () => {
    const read = rulesetOfText('rules/redocly.yaml', () => 'rules:\n  rule/x: { subject: { type: Root }, assertions: { defined: true } }\n', 'contractdiff.config.json');
    expect(Object.keys(read.rules)).toStrictEqual(['rule/x']);
  });

  it('toText: says each change, a level and a definition at once, and a rule that does not run', () => {
    const changed = [
      { id: 'a', from: undefined, to: 'error' as const, definition: false },
      { id: 'b', from: 'warn' as const, to: undefined, definition: false },
      { id: 'c', from: 'warn' as const, to: 'error' as const, definition: true },
    ];
    expect(toText({ inputs: [], findings: [], counts: {} }, {}, [], { from: 'main (abc1234)', changed }).split('\n').slice(1, 4)).toStrictEqual([
      '  info   ruleset-changed  a: not run → error',
      '  info   ruleset-changed  b: warn → not run',
      '  info   ruleset-changed  c: warn → error, and its definition changed',
    ]);
  });

  it('cutoffOf: now less the days', () => {
    expect(cutoffOf('1d', NOW)).toStrictEqual(new Date('2026-11-22T00:00:00.000Z'));
    expect(cutoffOf('0d', NOW)).toStrictEqual(NOW);
    // Only a whole `<n>d`: anything else is no time at all.
    expect([cutoffOf('x1d', NOW).getTime(), cutoffOf('1dx', NOW).getTime(), cutoffOf('x', NOW).getTime()]).toStrictEqual([Number.NaN, Number.NaN, Number.NaN]);
  });
});

const git = async (cwd: string, ...args: string[]): Promise<string> => {
  const result = await run('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, runtime: ambientRuntime() });
  expect(result.stderr).not.toMatch(/fatal/u);
  return result.stdout.trim();
};

describe('gitIn, on a planted repository', () => {

  it('answers the four questions, and undefined where git has no answer', async () => {
    const dir = scratch({});
    const sub = join(dir, 'api');
    mkdirSync(sub);
    writeFileSync(join(sub, 'contractdiff.config.json'), '{"one":1}');
    await git(dir, 'init', '-q', '-b', 'main');
    await git(dir, 'add', '.');
    await git(dir, 'commit', '-q', '-m', 'one');
    const first = await git(dir, 'rev-parse', 'HEAD');
    writeFileSync(join(sub, 'contractdiff.config.json'), '{"two":2}');
    await git(dir, 'commit', '-q', '-am', 'two');
    const second = await git(dir, 'rev-parse', 'HEAD');
    const inSub = gitIn(sub);
    expect(await inSub.commit('HEAD')).toBe(second);
    expect(await inSub.commit('HEAD~1')).toBe(first);
    expect(await inSub.commit('nope')).toBeUndefined();
    expect(await inSub.mergeBase()).toBeUndefined();
    await git(dir, 'update-ref', 'refs/remotes/origin/main', first);
    expect(await inSub.mergeBase()).toBe(first);
    expect(await inSub.before(new Date('2030-01-01T00:00:00.000Z'))).toBe(second);
    expect(await inSub.before(new Date('2000-01-01T00:00:00.000Z'))).toBeUndefined();
    expect(await inSub.show(first, 'contractdiff.config.json')).toBe('{"one":1}');
    expect(await inSub.show(first, 'missing.json')).toBeUndefined();
    expect(await gitIn(dir).commit('HEAD')).toBe(second);
    // A hook's GIT_DIR does not lead it to another repository.
    const ambient = ambientRuntime();
    expect(await gitIn(scratch({}), { ...ambient, env: { ...ambient.env, GIT_DIR: join(dir, '.git') } }).commit('HEAD')).toBeUndefined();
  });

  it('reads no repository, and no folder, as no answer', async () => {
    expect(await gitIn(scratch({})).commit('HEAD')).toBeUndefined();
    expect(await gitIn(join(scratch({}), 'missing')).commit('HEAD')).toBeUndefined();
  });
});
