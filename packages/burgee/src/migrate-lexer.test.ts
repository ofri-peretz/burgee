/**
 * `burgee migrate`'s scanner at the ends of its literals, and the report's smaller branches.
 *
 * The scanner steps over strings, templates, regular expressions and comments so that a
 * specifier-shaped string inside one is not rewritten. migrate.test.ts holds the five
 * positions; these are the literals that *end badly* — an escape, a newline, the end of the
 * file — where a scanner that stepped one character too far or too short either swallows
 * the next real import or rewrites text inside the literal. Each case puts a real import
 * right after the literal, so both failures show up as a wrong list of sites.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DirtyTreeError, majorOf, migrate, REQUIRE_NAMESPACE, rewriteSource, scan } from './migrate.js';

const specifiers = (source: string): string[] => scan(source).sites.map((s) => s.specifier);

describe('the scanner steps over each literal exactly', () => {
  it('reads a regular expression at the very start of a file as one, not as a division', () => {
    expect(specifiers("/import 'chalk'/.test(x);\nimport ora from 'ora';\n")).toEqual(['ora']);
  });

  it('reads a / after a closing bracket as a division', () => {
    // Were `(a)/` read as opening a regex, it would run to the next `/` and swallow the import.
    expect(specifiers("const r = (a) / 2; import ora from 'ora'; const s = b / 2;\n")).toEqual(['ora']);
  });

  it('honours an escaped quote inside a string', () => {
    // Were the string ended at `\'`, `from 'chalk'` would read as an import.
    expect(specifiers("const s = 'a\\' from 'chalk' b';\nimport ora from 'ora';\n")).toEqual(['ora']);
  });

  it('honours an escaped backtick inside a template', () => {
    expect(specifiers("const t = `a \\` import x from 'chalk'`;\nimport ora from 'ora';\n")).toEqual(['ora']);
  });

  it('honours an escaped slash inside a regular expression', () => {
    expect(specifiers("const r = /a\\/import 'chalk'/;\nimport ora from 'ora';\n")).toEqual(['ora']);
  });

  it('ends a regular expression that meets a newline at the newline', () => {
    // An unterminated regex cannot span lines; the next line is code again.
    expect(specifiers("const r = x = /unterminated\nimport ora from 'ora';\n")).toEqual(['ora']);
  });

  it('reads to the end of the file for a string, template, regex or comment left open', () => {
    // Each open literal holds an import-shaped text, which stepping out of it early would read.
    expect(specifiers("import ora from 'ora';\nconst s = \"x import y from 'chalk'")).toEqual(['ora']);
    expect(specifiers("import ora from 'ora';\nconst t = `x ${1} import y from 'chalk'")).toEqual(['ora']);
    expect(specifiers("import ora from 'ora';\nconst r = /x import y from 'chalk'")).toEqual(['ora']);
    expect(specifiers("import ora from 'ora';\n// import y from 'chalk'")).toEqual(['ora']);
    expect(specifiers("import ora from 'ora';\n/* open import x from 'chalk'")).toEqual(['ora']);
  });
});

describe('what a rewrite refuses', () => {
  it('lists every refusal in a file in line order, whatever kind found it first', () => {
    const source = "const m = await import(name);\nimport x from 'commander/lib/command.js';\nconst n = require(other);\n";
    expect(rewriteSource(source).refused.map((r) => [r.line, r.reason])).toEqual([
      [1, 'non-literal-specifier'],
      [2, 'deep-import'],
      [3, 'non-literal-specifier'],
    ]);
  });
});

describe('a require() whose two sides return different kinds of value (A29)', () => {
  it('is refused, not rewritten', () => {
    // No pair in today's tables differs — `migrate-require.test.ts` measures every one — so the
    // table is changed for the length of this case: chalk read as an incumbent whose require()
    // hands back its export itself, against a target whose require() hands back a namespace.
    const namespace = REQUIRE_NAMESPACE as string[];
    const at = namespace.indexOf('chalk');
    namespace.splice(at, 1);
    try {
      const result = rewriteSource("const chalk = require('chalk');\n");
      expect(result.refused).toEqual([{ line: 1, specifier: 'chalk', reason: 'require-of-default' }]);
      expect(result.source).toBe("const chalk = require('chalk');\n");
    } finally {
      namespace.splice(at, 0, 'chalk');
    }
    expect(rewriteSource("const chalk = require('chalk');\n").refused).toEqual([]);
  });
});

describe('the report', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const project = (lockfile?: string): string => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-migrate-pm-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { chalk: '^6.0.0' } }));
    writeFileSync(join(dir, 'a.js'), "import chalk from 'chalk';\n");
    if (lockfile !== undefined) writeFileSync(join(dir, lockfile), '');
    return dir;
  };
  const next = async (at: string): Promise<string> => (await migrate({ dir: at, dryRun: true, status: async () => undefined })).next;

  it('writes the next step for the package manager whose lockfile is there', async () => {
    // Pinned since U12-2, to the version roundel's own manifest declares.
    const roundel = `roundel@^${(JSON.parse(readFileSync(new URL('../../roundel/package.json', import.meta.url), 'utf8')) as { version: string }).version}`;
    expect(await next(project('yarn.lock'))).toBe(`yarn add ${roundel} && yarn remove chalk`);
    rmSync(dir, { recursive: true, force: true });
    expect(await next(project('bun.lockb'))).toBe(`bun add ${roundel} && bun remove chalk`);
    rmSync(dir, { recursive: true, force: true });
    expect(await next(project('bun.lock'))).toBe(`bun add ${roundel} && bun remove chalk`);
  });

  it('counts one uncommitted change in the singular', () => {
    expect(new DirtyTreeError([' M a.js']).message).toBe('the git tree has 1 uncommitted change');
    expect(new DirtyTreeError([' M a.js', '?? b.js']).message).toBe('the git tree has 2 uncommitted changes');
  });

  it('reads no major from a range with no number in it', () => {
    expect(majorOf('*')).toBeUndefined();
    expect(majorOf('latest')).toBeUndefined();
    expect(majorOf('^3.0.7')).toBe(3);
  });
});
