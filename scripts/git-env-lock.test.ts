/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Git-env lock — no root test sees a GIT_* variable, so no test's `git init` can reach the
 * developer's repository (see vitest-git-env-setup.ts).
 *
 * Proven red, 2026-10-18: with `GIT_DIR=<a scratch repo>/.git` exported, as lefthook's pre-push
 * does, this case and all 24 cases of `scripts/affected.test.ts` failed without the setup file
 * (25 failures); with it, 34/34 pass. From a worktree's pre-push (GIT_DIR inside
 * `.git/worktrees/`) the same `git init` set `core.bare = true` on the real repository. In CI
 * and from a plain shell nothing is exported, so this can only fail where the bug can bite.
 */

import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('root tests run without the caller git environment', () => {
  it('no GIT_* variable reaches a test, whatever hook launched the suite', () => {
    expect(Object.keys(process.env).filter((key) => key.startsWith('GIT_'))).toEqual([]);
  });

  // setupFiles run in the workers, after the main process has loaded the config and started any
  // globalSetup; a git call there still saw pre-push's GIT_DIR. Importing the setup from the config
  // clears it in the main process, so every worker and child it spawns starts clean.
  it('the root config clears the git environment in the main process too', () => {
    expect(read('vitest.root.config.ts')).toMatch(/^dropGitEnv\(\);$/mu);
  });

  // The changed-lines lane runs package suites through oxmutate, not turbo, so turbo's strict env
  // never strips GIT_DIR. From pre-push, a package test's `git init` (oxmutate's lanes.test.ts,
  // compat-oracle's vendor tests) then set core.bare = true on the shared repository (2026-11-01).
  it('the changed-lines lane unsets every GIT_* variable before it runs anything', () => {
    const script = read('scripts/mutation-changed.sh');
    const unset = script.indexOf("compgen -e | grep '^GIT_'");
    expect(unset).toBeGreaterThan(script.indexOf('set -euo pipefail'));
    expect(unset).toBeLessThan(script.indexOf('git fetch --quiet'));
  });

  // turbo's strict env and the changed-lines lane both strip GIT_DIR before a package suite runs,
  // but a package test re-run by any other path (case-budget's re-measure, a hand run from a hook)
  // does not. oxmutate's diskguard.test.ts ran `git init` with the inherited env, and from a
  // worktree's pre-push that re-initialised the shared repository as bare (2026-11-12). So a
  // package test that runs `git init` passes every git call `env: withoutGit()`, and defines it.
  it('every package test that runs git init gives each git call an env without GIT_*', () => {
    expect(gitEnvProblems(packageTests())).toEqual([]);
  });

  it('the package check finds a git init with the inherited env, and passes one without it', () => {
    const helper = "const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));\n";
    expect(gitEnvProblems([['a.test.ts', "execFileSync('git', ['init', '-q'], { cwd: root });\n"]])).toEqual(['a.test.ts: a git call without env: withoutGit()', 'a.test.ts: runs git init and defines no withoutGit that drops every GIT_* key']);
    expect(gitEnvProblems([['b.test.ts', "const git = (...args: string[]) => execFileSync('git', args, { cwd });\ngit('init', '-q');\n"]])).toHaveLength(2);
    expect(gitEnvProblems([['c.test.ts', `${helper}execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore', env: withoutGit() });\n`]])).toEqual([]);
    expect(gitEnvProblems([['d.test.ts', "execFileSync('git', ['ls-files'], { cwd: root });\n"]]), 'no git init, nothing to hold').toEqual([]);
  });
});

/** Every `*.test.ts` under a package's `src/`, as `[path, text]`. */
function packageTests(): [string, string][] {
  const packages = new URL('../packages/', import.meta.url);
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const src = new URL(`${entry.name}/src/`, packages);
      let files: string[];
      try {
        files = readdirSync(src, { recursive: true, encoding: 'utf8' });
      } catch {
        return [];
      }
      return files.filter((file) => file.endsWith('.test.ts')).map((file): [string, string] => [`packages/${entry.name}/src/${file}`, readFileSync(new URL(file, src), 'utf8')]);
    });
}

const GIT_CALL = /\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*'git'\s*,/gu;
const RUNS_INIT = /\(\s*'git'\s*,\s*\[[^\]]*'init'|\bgit\(\s*'init'/u;

/** The call's text from `name(` to its matching `)`. */
function callAt(text: string, start: number): string {
  let depth = 0;
  for (let i = text.indexOf('(', start); i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

/** Each test that runs `git init` and lets a git call inherit the caller's GIT_* variables. */
export function gitEnvProblems(files: readonly (readonly [string, string])[]): string[] {
  return files.flatMap(([path, text]) => {
    if (!RUNS_INIT.test(text)) return [];
    const bare = [...text.matchAll(GIT_CALL)].filter((m) => !callAt(text, m.index).includes('env: withoutGit()'));
    const defined = /const withoutGit = [^\n]*startsWith\('GIT_'\)/u.test(text);
    return [...bare.map(() => `${path}: a git call without env: withoutGit()`), ...(defined ? [] : [`${path}: runs git init and defines no withoutGit that drops every GIT_* key`])];
  });
}
