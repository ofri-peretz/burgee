/**
 * apicontract-lint R13 (`--stats`, `--idle`): per-rule counts kept in a file across runs, counted
 * once per commit, and the rules that found nothing for a while listed as `rule-idle`.
 */
import { readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runBurgee } from 'burgee/testing';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { runLint, toText } from './command-lint.js';
import { type LintGit } from './lint-history.js';
import { countRun, idleCutoff, idleDays, idleOf, type Stats, statsOf } from './lint-stats.js';
import { UsageError, validateConfig } from './run-config.js';

import { program } from './index.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();
const makeDir = scratchDirs();
const scratch = (files: Record<string, string>): string => {
  const dir = makeDir('apicontract-lint-stats-');
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
};

/** One operation without tags or a description: `operation-tags` and `operation-description` find it, `path-no-trailing-slash` does not. */
const API = "openapi: 3.1.0\ninfo: { title: t, version: '1', description: d }\npaths:\n  /a:\n    get: { operationId: getA, responses: { '200': { description: ok } } }\n";
const DAY1 = new Date('2026-08-01T00:00:00.000Z');
const DAY100 = new Date('2026-11-08T00:00:00.000Z');

/** A `LintGit` whose `HEAD` is `head`, and that knows nothing else. */
const at = (head: string | undefined): LintGit => ({ commit: async (ref) => (ref === 'HEAD' ? head : undefined), mergeBase: async () => undefined, before: async () => undefined, show: async () => undefined });

const lintIn = (dir: string, options: { head?: string | undefined; now: Date; idle?: string; rules?: object }) =>
  runLint({
    cwd: dir,
    specs: [],
    config: validateConfig({ input: 'api.yaml', lint: { rules: options.rules ?? {} } }, join(dir, 'contractdiff.config.json')),
    git: at('head' in options ? options.head : 'c1'),
    now: options.now,
    stats: 'stats.json',
    ...(options.idle === undefined ? {} : { idle: options.idle }),
  });
const saved = (dir: string): Stats => JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf8')) as Stats;
const summary = (data: Record<string | symbol, unknown>): string => text(data).split('\n').find((line) => / error\(s\), /u.test(line)) as string;

describe('--stats and --idle (R13)', () => {
  it('counts a run into the file once per commit, and says so', async () => {
    const dir = scratch({ 'api.yaml': API });
    const first = await lintIn(dir, { now: DAY1 });
    expect([first.changed, first.stats]).toStrictEqual([true, { file: 'stats.json', counted: true }]);
    expect(summary(first)).toMatch(/; stats: this run counted in stats\.json\.$/u);
    const stats = saved(dir);
    expect(stats.lastRun).toBe('c1');
    expect(stats.rules['operation-tags']).toStrictEqual({ firstRun: DAY1.toISOString(), runs: 1, findings: 1, lastFinding: DAY1.toISOString() });
    expect(stats.rules['path-no-trailing-slash']).toStrictEqual({ firstRun: DAY1.toISOString(), runs: 1, findings: 0 });
    expect(Object.keys(stats.rules)).toStrictEqual(Object.keys(stats.rules).sort());
    expect(readFileSync(join(dir, 'stats.json'), 'utf8')).toBe(`${JSON.stringify(stats, undefined, 2)}\n`);
    // The same commit again: nothing changes, so CI re-running a job counts nothing twice. Not even written.
    const old = new Date('2026-01-01T00:00:00.000Z');
    utimesSync(join(dir, 'stats.json'), old, old);
    const again = await lintIn(dir, { now: DAY100 });
    expect([again.changed, again.stats]).toStrictEqual([false, { file: 'stats.json', counted: false }]);
    expect(summary(again)).toMatch(/; stats: this commit already counted in stats\.json\.$/u);
    expect(saved(dir)).toStrictEqual(stats);
    expect(statSync(join(dir, 'stats.json')).mtime).toStrictEqual(old);
    // The next commit counts.
    await lintIn(dir, { head: 'c2', now: DAY100 });
    expect(saved(dir).rules['operation-tags']).toStrictEqual({ firstRun: DAY1.toISOString(), runs: 2, findings: 2, lastFinding: DAY100.toISOString() });
    expect(saved(dir).rules['path-no-trailing-slash']).toStrictEqual({ firstRun: DAY1.toISOString(), runs: 2, findings: 0 });
  });

  it('counts once a day outside a repository', async () => {
    const dir = scratch({ 'api.yaml': API });
    await lintIn(dir, { head: undefined, now: DAY1 });
    expect(saved(dir).lastRun).toBe('2026-08-01');
    expect((await lintIn(dir, { head: undefined, now: new Date('2026-08-01T23:00:00.000Z') })).changed).toBe(false);
  });

  it('lists the rules that ran and found nothing in the days given', async () => {
    const dir = scratch({ 'api.yaml': API });
    await lintIn(dir, { now: DAY1 });
    const data = await lintIn(dir, { head: 'c2', now: DAY100, idle: '90d' });
    const idle = (data.stats as { idle: { id: string }[] }).idle.map((entry) => entry.id);
    expect(idle).toContain('path-no-trailing-slash');
    expect(idle).not.toContain('operation-tags');
    expect((data.stats as { idle: unknown[] }).idle[idle.indexOf('path-no-trailing-slash')]).toStrictEqual({ id: 'path-no-trailing-slash', runs: 2, since: DAY1.toISOString(), found: false });
    const lines = text(data).split('\n');
    expect(lines[0]).toBe('rules with no finding in 90d');
    expect(lines).toContain('  info   rule-idle  path-no-trailing-slash: has found nothing since its first run 2026-08-01, in 2 run(s)');
    const fix = lines.indexOf('         fix: set each to "off" in `lint.rules` if what it guards cannot come back; keep it if it is a tripwire');
    expect([fix > 0, lines[fix + 1]]).toStrictEqual([true, '']);
    expect(summary(data)).toMatch(new RegExp(`; stats: this run counted in stats\\.json; idle 90d: ${String(idle.length)}\\.$`, 'u'));
    // 100 days is not idle for 101.
    const none = await lintIn(dir, { head: 'c3', now: DAY100, idle: '101d' });
    expect((none.stats as { idle: unknown[] }).idle).toStrictEqual([]);
    expect(text(none).split('\n')[0]).not.toBe('rules with no finding in 101d');
    expect(summary(none)).toMatch(/; idle 101d: 0\.$/u);
  });

  it('refuses --idle without --stats, a number of days it cannot read, and a file it did not write', async () => {
    const dir = scratch({ 'api.yaml': API });
    const config = validateConfig({ input: 'api.yaml' }, join(dir, 'contractdiff.config.json'));
    await expect(runLint({ cwd: dir, specs: [], config, git: at('c1'), idle: '90d' })).rejects.toThrow(
      '`--idle` reads the counts `--stats` keeps. fix: add `--stats lint-stats.json`, a file your CI caches',
    );
    await expect(lintIn(dir, { now: DAY1, idle: '3m' })).rejects.toThrow('`--idle 3m` is not a number of days. fix: write `--idle 90d`');
    writeFileSync(join(dir, 'stats.json'), '{}');
    await expect(lintIn(dir, { now: DAY1 })).rejects.toThrow('`--stats stats.json` is not a stats file lint wrote. fix: delete it, or name another file; the next run starts it again');
  });

  it('is on the command line, and changes nothing without --stats', async () => {
    const dir = scratch({ 'api.yaml': API });
    const r = await runBurgee(program, { argv: ['lint', join(dir, 'api.yaml'), '--idle', '90d'] });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('`--idle` reads the counts `--stats` keeps');
    const plain = await runLint({ cwd: dir, specs: ['api.yaml'], config: undefined, git: at('c1') });
    expect(plain.changed).toBe(false);
    expect(Object.keys(plain)).not.toContain('stats');
    const counted = await runBurgee(program, { argv: ['lint', join(dir, 'api.yaml'), '--stats', join(dir, 'cli.json'), '--json'] });
    expect(JSON.parse(readFileSync(join(dir, 'cli.json'), 'utf8'))).toMatchObject({ version: 1 });
    expect(counted.code).toBe(0);
  });
});

describe('the pieces', () => {
  const ISO = DAY1.toISOString();
  it.each([
    ['not JSON', '{'],
    ['another version', '{"version":2,"rules":{}}'],
    ['no rules', '{"version":1}'],
    ['a list of rules', '{"version":1,"rules":[]}'],
    ['a lastRun that is not a string', '{"version":1,"lastRun":1,"rules":{}}'],
    ['a rule that is not a record', '{"version":1,"rules":{"a":1}}'],
    ['one good rule and one bad', `{"version":1,"rules":{"a":{"firstRun":"${ISO}","runs":1,"findings":0},"b":1}}`],
    ['a bad first run', `{"version":1,"rules":{"a":{"firstRun":"x","runs":1,"findings":0}}}`],
    ['a negative count', `{"version":1,"rules":{"a":{"firstRun":"${ISO}","runs":-1,"findings":0}}}`],
    ['a fraction', `{"version":1,"rules":{"a":{"firstRun":"${ISO}","runs":1,"findings":0.5}}}`],
    ['a bad last finding', `{"version":1,"rules":{"a":{"firstRun":"${ISO}","runs":1,"findings":1,"lastFinding":"x"}}}`],
    ['a date that is not a string', `{"version":1,"rules":{"a":{"firstRun":1,"runs":1,"findings":0}}}`],
    ['null', 'null'],
  ])('statsOf refuses %s', (_, input) => {
    expect(() => statsOf(input, 'f.json')).toThrow(UsageError);
  });

  it('statsOf reads what countRun wrote, and nothing as empty', () => {
    const stats = countRun(statsOf(undefined, 'f'), { counts: { a: { checked: 1, failed: 1 } }, findings: [{ rule: 'a', level: 'warn', file: 'f', pointer: '#', message: 'm', fix: 'x' }] }, { key: 'k', now: DAY1 });
    expect(statsOf(JSON.stringify(stats), 'f')).toStrictEqual(stats);
    expect(statsOf(undefined, 'f')).toStrictEqual({ version: 1, rules: {} });
    expect(statsOf(`{"version":1,"rules":{"a":{"firstRun":"${ISO}","runs":0,"findings":0}}}`, 'f').rules.a?.runs).toBe(0);
  });

  it('countRun: keeps the rules in id order as new ones join', () => {
    const before: Stats = { version: 1, lastRun: 'k1', rules: { b: { firstRun: ISO, runs: 1, findings: 0 } } };
    const after = countRun(before, { counts: { a: { checked: 1, failed: 0 }, b: { checked: 1, failed: 0 } }, findings: [] }, { key: 'k2', now: DAY1 });
    expect(Object.keys(after.rules)).toStrictEqual(['a', 'b']);
    expect(countRun(before, { counts: {}, findings: [] }, { key: 'k1', now: DAY1 })).toBe(before);
  });

  it('idleDays: whole days only', () => {
    expect(idleDays('90d')).toBe(90);
    expect(() => idleDays('x90d')).toThrow(UsageError);
  });

  it('idleOf: by the last finding, else the first run, at or before the cutoff; a rule with no counts is not idle', () => {
    const stats: Stats = {
      version: 1,
      rules: { found: { firstRun: '2026-01-01T00:00:00.000Z', runs: 3, findings: 1, lastFinding: '2026-06-01T00:00:00.000Z' }, never: { firstRun: '2026-06-01T00:00:00.000Z', runs: 2, findings: 0 } },
    };
    expect(idleOf(stats, ['never', 'found', 'unknown'], new Date('2026-06-01T00:00:00.000Z'))).toStrictEqual([
      { id: 'found', runs: 3, since: '2026-06-01T00:00:00.000Z', found: true },
      { id: 'never', runs: 2, since: '2026-06-01T00:00:00.000Z', found: false },
    ]);
    expect(idleOf(stats, ['found', 'never'], new Date('2026-05-31T23:59:59.999Z'))).toStrictEqual([]);
    expect(idleCutoff(2, DAY1)).toStrictEqual(new Date('2026-07-30T00:00:00.000Z'));
  });

  it('toText: an idle rule that found something once', () => {
    const stats = { file: 's.json', counted: true, idleFor: '30d', idle: [{ id: 'r', runs: 4, since: '2026-06-01T00:00:00.000Z', found: true }] };
    expect(toText({ inputs: [], findings: [], counts: {} }, {}, [], { stats }).split('\n').slice(0, 2)).toStrictEqual(['rules with no finding in 30d', '  info   rule-idle  r: last found something 2026-06-01, in 4 run(s)']);
  });
});
