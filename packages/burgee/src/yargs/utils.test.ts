/**
 * Locks for four CodeQL findings in `burgee/yargs` (alerts #17–#27), each a defect carried
 * over from upstream yargs 18.1.0 verbatim.
 *
 * 1. parse-command backtracked quadratically (#17–#21). `split(/\s+(?![^[]*]|[^<]*>)/)`
 *    runs both lookaheads to the end of the string from every whitespace run, and
 *    `/\.*[\][<>]/g` / `/\.+[\]>]/` restart the dot run from every dot. Measured on the
 *    unfixed code, node v24.13.0, macOS: 5k / 10k / 20k repetitions took 46 / 165 / 681 ms
 *    for the split and 11 / 42 / 166 ms for the dots — double the input, four times the
 *    time. The locks below time one input each against a 1 s budget: the fix reads them in
 *    2-18 ms (node v24.12.0, macOS), and upstream's regexes did not finish them in 12 s.
 * 2. apply-extends' `/\.json|\..*rc$/` is the same shape on a run of dots (#22).
 * 3. `pkgConf('__proto__')` read `obj[key]` bare, handed Object.prototype to applyExtends,
 *    and applyExtends deletes `extends` from the object it is given (#27). Both halves are
 *    closed: pkgConf reads own keys only, and applyExtends copies instead of deleting.
 * 4. zsh completions escaped `:` and not `\` (#23–#26), so `_describe`, which strips one
 *    level of backslashes, completed `a\b` as `ab`.
 *
 * The rewrites must answer exactly as the regexes did — yargs' own suite grades this façade
 * (816 of 816) — so the first two are also checked against the original regexes over every
 * short string of the characters that matter.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { discard } from '../__fixtures__/scratch-dir.js';
import yargs from '../yargs.js';

import { applyExtends, isConfigPath, parseCommand, type ParsedCommand } from './utils.js';

/** Each case: one adversarial input, timed once, against a budget the fix meets 50x over and the
 * backtracking it replaced misses by 10x or more. A case's own `timeout` holds it to 5 s. */
const BUDGET_MS = 1_000;
const CASE_MS = 5_000;

function elapsed(fn: () => unknown): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

/** Upstream's parse-command, verbatim — the reference the rewrite is held to. */
function upstreamParseCommand(cmd: string): ParsedCommand {
  const splitCommand = cmd.replace(/\s{2,}/g, ' ').split(/\s+(?![^[]*]|[^<]*>)/);
  const bregex = /\.*[\][<>]/g;
  const firstCommand = splitCommand.shift();
  if (!firstCommand) throw new Error(`No command found in: ${cmd}`);
  const parsed: ParsedCommand = { cmd: firstCommand.replace(bregex, ''), demanded: [], optional: [] };
  splitCommand.forEach((c, i) => {
    let variadic = false;
    c = c.replace(/\s/g, '');
    if (/\.+[\]>]/.test(c) && i === splitCommand.length - 1) variadic = true;
    if (/^\[/.test(c)) parsed.optional.push({ cmd: c.replace(bregex, '').split('|'), variadic });
    else parsed.demanded.push({ cmd: c.replace(bregex, '').split('|'), variadic });
  });
  return parsed;
}

/** Every string over `alphabet` up to `max` long, prefixed so the first word is never empty. */
function* strings(alphabet: string[], max: number, prefix = ''): Generator<string> {
  yield prefix;
  if (max === 0) return;
  for (const c of alphabet) yield* strings(alphabet, max - 1, prefix + c);
}

function outcome(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (err) {
    return { threw: (err as Error).message };
  }
}

/** yargs' `getOptions()` is public at runtime and missing from its typings. */
function configObjects(y: unknown): unknown[] {
  return (y as { getOptions(): { configObjects?: unknown[] } }).getOptions().configObjects ?? [];
}

describe('parseCommand is linear and answers as upstream did (#17–#21)', () => {
  // One case per shape around the generated string: as one case the ~200,000 commands read 5.4 s
  // on CI (D-20261101-tests-under-5s). Each shape still sees every string, and the three together
  // every command the single case did.
  it.each([
    ['after a command name', (tail: string) => `x${tail}`],
    ['before a command name', (tail: string) => `${tail}x`],
    ['alone', (tail: string) => tail],
  ] as const)('matches the upstream regexes on every short string of whitespace, dots, brackets and pipes: %s', (_shape, shape) => {
    const alphabet = [' ', '\t', '.', '[', ']', '<', '>', 'a', '|'];
    const mismatches: string[] = [];
    let checked = 0;
    for (const tail of strings(alphabet, 5)) {
      const cmd = shape(tail);
      const ours = JSON.stringify(outcome(() => parseCommand(cmd)));
      if (ours !== JSON.stringify(outcome(() => upstreamParseCommand(cmd)))) mismatches.push(JSON.stringify(cmd));
      checked++;
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(50_000);
  });

  it('keeps the shapes yargs documents', () => {
    expect(parseCommand('get <source> [proxy..]')).toEqual({
      cmd: 'get',
      demanded: [{ cmd: ['source'], variadic: false }],
      optional: [{ cmd: ['proxy'], variadic: true }],
    });
    expect(parseCommand('run <a|b> [c d]')).toEqual(upstreamParseCommand('run <a|b> [c d]'));
  });

  // 16-18 ms each here for 80,000 words; upstream did not finish them in 12 s.
  it.each([' ', '\t'])('splits 80,000 words separated by %j in linear time', { timeout: CASE_MS }, (sep) => {
    const cmd = `cmd${`${sep}a`.repeat(80_000)}`;
    expect(elapsed(() => parseCommand(cmd))).toBeLessThan(BUDGET_MS);
  });

  // About 7 ms each here; upstream did not finish either in 12 s.
  it.each([
    ['cmd', 1_600_000],
    ['cmd x', 400_000],
  ])('strips brackets after a run of dots in linear time, after %j (%i dots)', { timeout: CASE_MS }, (head, dots) => {
    const cmd = `${head}${'.'.repeat(dots)}`;
    expect(elapsed(() => parseCommand(cmd))).toBeLessThan(BUDGET_MS);
  });
});

describe('applyExtends tells a path from a module in linear time (#22)', () => {
  it('matches /\\.json|\\..*rc$/ on every short string of dots, line breaks and the letters it looks for', () => {
    const upstream = /\.json|\..*rc$/;
    const mismatches: string[] = [];
    for (const s of strings(['.', 'r', 'c', 'j', 's', 'o', 'n', '\n', '\u2028', 'x'], 5)) {
      if (isConfigPath(s) !== upstream.test(s)) mismatches.push(JSON.stringify(s));
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  // About 7-8 ms each here for 1,000,000 dots; upstream's regex did not finish them in 12 s.
  it('isConfigPath reads a run of 1,000,000 dots in linear time', { timeout: CASE_MS }, () => {
    const dots = '.'.repeat(1_000_000);
    expect(elapsed(() => isConfigPath(dots))).toBeLessThan(BUDGET_MS);
  });

  it('applyExtends reads a run of 1,000,000 dots in `extends` in linear time', { timeout: CASE_MS }, () => {
    const config = { extends: '.'.repeat(1_000_000) };
    expect(elapsed(() => applyExtends(config, tmpdir()))).toBeLessThan(BUDGET_MS);
  });
});

describe("pkgConf('__proto__') never reaches Object.prototype (#27)", () => {
  it('leaves an inherited `extends` on Object.prototype alone and loads nothing from it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'burgee-pkgconf-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"fixture"}');
      writeFileSync(join(dir, 'injected.json'), '{"injected":true}');
      const y = yargs([]);
      // What an earlier pollution would leave behind. Upstream reads `obj['__proto__']`,
      // gets Object.prototype, finds this as an own `extends`, loads the file it names, and
      // then runs `delete config.extends` on Object.prototype itself.
      Object.defineProperty(Object.prototype, 'extends', { value: './injected.json', configurable: true, writable: true });
      try {
        y.pkgConf('__proto__', dir);
        expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'extends')).toBe(true);
      } finally {
        delete (Object.prototype as { extends?: unknown }).extends;
      }
      expect(configObjects(y)).toEqual([]);
    } finally {
      discard(dir);
    }
  });

  it('applyExtends never writes to the object it is given, and returns it without `extends`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'burgee-extends-'));
    try {
      writeFileSync(join(dir, 'base.json'), '{"level":1,"base":true}');
      const config = { extends: './base.json', level: 2 };
      const frozen = Object.freeze({ ...config });
      expect(applyExtends(frozen, dir)).toEqual({ level: 2, base: true });
      expect(frozen).toEqual(config);
    } finally {
      discard(dir);
    }
  });

  it('still reads a key the package.json really has', () => {
    const dir = mkdtempSync(join(tmpdir(), 'burgee-pkgconf-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"fixture","demo":{"level":3}}');
      expect(configObjects(yargs([]).pkgConf('demo', dir))).toEqual([{ level: 3 }]);
    } finally {
      discard(dir);
    }
  });
});

describe('zsh completions escape the backslash as well as the colon (#23–#26)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function complete(args: string[]): Promise<string[]> {
    vi.stubEnv('SHELL', '/bin/zsh');
    const y = yargs([])
      .command('a\\b:c', 'a command with both in its name')
      .option('mode', { choices: ['x\\y', 'p:q', 'r\\'], describe: 'pick one' })
      .option('w\\z', { type: 'string', describe: 'odd key' });
    return (await y.getCompletion(args)) as string[];
  }

  it('escapes command names and option keys for `_describe`', async () => {
    const out = await complete(['']);
    expect(out).toContain('a\\\\b\\:c:a command with both in its name');
    expect(await complete(['--'])).toContain('--w\\\\z:odd key');
  });

  it('escapes option choices, so a trailing backslash cannot swallow the next separator', async () => {
    expect(await complete(['--mode', ''])).toEqual(['x\\\\y', 'p\\:q', 'r\\\\']);
  });
});
