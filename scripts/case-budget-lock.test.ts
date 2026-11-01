/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — no test case takes more than five seconds, and the gate that says so cannot quietly stop
 * running (D-20261101-tests-under-5s).
 *
 * The gate is `scripts/vitest-case-budget-reporter.ts`. It only gates a run it is loaded into, so
 * this holds the places it has to be: every vitest config in a workspace loads it (through
 * `timeouts`, or `caseBudget` for a config with its own clocks), the required `Unit Tests` job and
 * the pre-push hook run those configs without turning it off, and `NIGHTLY_ONLY` — the one
 * exemption — names only cases that really are kept off a pull request and really do run in the
 * weekly local run (`npm run mutation:weekly`; D-20261101-no-mutation-in-gha moved them out of CI).
 *
 * Proven red on main's state before the cases were fixed: the root suite alone exited 1 naming
 * `plan-progress-lock.test.ts`'s two cases at 47.6 s and 21.9 s.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { readWorkflow, REPO_ROOT, type Step } from './required-checks.mjs';
import { budgetFrom, CASE_BUDGET_MS, caseKey, describeOverBudget, NIGHTLY_ONLY, overBudget, strict, withoutGitEnv } from './vitest-case-budget-reporter.js';

describe('the budget', () => {
  it('is the owner’s five seconds, and a case at exactly the budget is within it', () => {
    expect(CASE_BUDGET_MS).toBe(5_000);
    const cases = [
      { file: 'a.test.ts', name: 'at', duration: 5_000 },
      { file: 'a.test.ts', name: 'over', duration: 5_001 },
      { file: 'b.test.ts', name: 'way over', duration: 90_000 },
      { file: 'b.test.ts', name: 'fast', duration: 3 },
    ];
    expect(overBudget(cases, CASE_BUDGET_MS, {}).map((c) => c.name)).toEqual(['way over', 'over']);
  });

  it('exempts a case NIGHTLY_ONLY names, and only that case', () => {
    const cases = [
      { file: 'a.test.ts', name: 'heavy', duration: 9_000 },
      { file: 'a.test.ts', name: 'heavy too', duration: 9_000 },
    ];
    expect(overBudget(cases, CASE_BUDGET_MS, { [caseKey(cases[0]!)]: 'a real install' }).map((c) => c.name)).toEqual(['heavy too']);
  });

  it('reads VITEST_CASE_BUDGET_MS, where 0 turns the gate off, and refuses one that is not a number', () => {
    expect(budgetFrom({})).toBe(CASE_BUDGET_MS);
    expect(budgetFrom({ VITEST_CASE_BUDGET_MS: '' })).toBe(CASE_BUDGET_MS);
    expect(budgetFrom({ VITEST_CASE_BUDGET_MS: '0' })).toBe(0);
    expect(budgetFrom({ VITEST_CASE_BUDGET_MS: '2500' })).toBe(2_500);
    expect(() => budgetFrom({ VITEST_CASE_BUDGET_MS: 'soon' })).toThrow(/not a number/);
    expect(() => budgetFrom({ VITEST_CASE_BUDGET_MS: '-1' })).toThrow(/not a number/);
  });

  it('judges strictly on CI, whatever the load; off CI an overloaded machine leaves a case unjudged', () => {
    expect(strict({ CI: 'true' })).toBe(true);
    expect(strict({})).toBe(false);
    expect(strict({ CI: 'false' })).toBe(false);
  });

  it('re-measures a case without a single GIT_* variable, which from pre-push names the developer’s repository', () => {
    expect(withoutGitEnv({ GIT_DIR: '/r/.git/worktrees/w', GIT_INDEX_FILE: 'i', GITHUB_ACTIONS: 'true', PATH: '/bin' })).toEqual({ GITHUB_ACTIONS: 'true', PATH: '/bin' });
  });

  it('names each slow case with both readings, and what to do about it', () => {
    const text = describeOverBudget([{ file: 'a.test.ts', name: 's > slow', duration: 6_200.4, alone: 5_900 }], CASE_BUDGET_MS);
    expect(text).toContain('1 test case over the 5000 ms per-case budget');
    expect(text).toContain('6200 ms, 5900 ms alone  a.test.ts > s > slow');
    expect(text).toContain('NIGHTLY_ONLY');
  });
});

/** Every workspace directory, from the root manifest's globs. */
function workspaces(): string[] {
  const globs = (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { workspaces: string[] }).workspaces;
  return globs.flatMap((glob) =>
    glob.endsWith('/*')
      ? readdirSync(join(REPO_ROOT, glob.slice(0, -2)), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => `${glob.slice(0, -2)}/${e.name}`)
      : [glob],
  );
}

describe('every suite loads the gate', () => {
  const configs = [
    'vitest.root.config.ts',
    'packages/oxmutate/compat/vitest.config.ts',
    ...workspaces()
      .map((dir) => `${dir}/vitest.config.ts`)
      .filter((file) => existsSync(join(REPO_ROOT, file))),
  ];

  it('finds the configs — otherwise the case below holds nothing', () => {
    expect(configs.length).toBeGreaterThan(20);
  });

  it.each(configs)('%s spreads `timeouts` or `caseBudget` from vitest-timeouts.config.ts', (file) => {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    expect(text).toMatch(/vitest-timeouts\.config/u);
    expect(text).toMatch(/\.\.\.(?:timeouts|caseBudget)\b/u);
  });

  it('the shared clocks carry the reporter', () => {
    const text = readFileSync(join(REPO_ROOT, 'vitest-timeouts.config.ts'), 'utf8');
    expect(text).toContain("'./scripts/vitest-case-budget-reporter.ts'");
    expect(text).toMatch(/\.\.\.caseBudget,\n\};/u);
  });
});

describe('the required check and the pre-push hook run it', () => {
  const turnsOff = /VITEST_CASE_BUDGET_MS|--reporter/u;

  it("Quality (Full)'s Unit Tests job runs the root suite, defers the package suites' candidates, then judges them", () => {
    const job = readWorkflow('quality-full.yml').jobs['test'];
    expect(job?.name).toBe('Unit Tests (Turbo)');
    expect(JSON.stringify(job)).not.toMatch(turnsOff);
    const steps = (job?.steps ?? []) as (Step & { env?: Record<string, string> })[];
    const at = (pattern: RegExp): number => steps.findIndex((s) => pattern.test(s.run ?? ''));
    const root = at(/npx vitest run --config vitest\.root\.config\.ts/u);
    const suites = at(/turbo run test/u);
    const judge = at(/npx tsx scripts\/case-budget\.ts "\$RUNNER_TEMP\/case-budget"/u);
    expect([root, suites, judge].every((i) => i >= 0), 'a step went missing').toBe(true);
    expect(suites).toBeLessThan(judge);
    expect(steps[suites]?.env?.['VITEST_CASE_BUDGET_DEFER']).toBe('${{ runner.temp }}/case-budget');
    expect(steps[root]?.env?.['VITEST_CASE_BUDGET_DEFER'], 'the root suite runs alone and judges its own cases').toBeUndefined();
  });

  it('the pre-push hook defers the battery’s candidates, judges them after it, and runs the root suite with the gate on', () => {
    const hooks = loadYaml(readFileSync(join(REPO_ROOT, 'lefthook.yml'), 'utf8')) as { 'pre-push': { commands: Record<string, { run: string; priority: number }> } };
    const { battery, 'case-budget': judge, 'root-suite': root } = hooks['pre-push'].commands;
    expect(battery?.run).toMatch(/^rm -rf node_modules\/\.cache\/case-budget && VITEST_CASE_BUDGET_DEFER="\$PWD\/node_modules\/\.cache\/case-budget" npx --no turbo run typecheck test build/u);
    expect(judge?.run).toBe('npx --no tsx scripts/case-budget.ts node_modules/.cache/case-budget');
    expect(judge!.priority).toBeGreaterThan(battery!.priority);
    expect(root?.run).toBe('npx --no vitest run --config vitest.root.config.ts');
    for (const c of Object.values(hooks['pre-push'].commands)) expect(c.run).not.toMatch(turnsOff);
  });

  it('turbo hands the budget variables to every test task', () => {
    const turbo = JSON.parse(readFileSync(join(REPO_ROOT, 'turbo.json'), 'utf8')) as { tasks: { test: { passThroughEnv: string[] } } };
    expect(turbo.tasks.test.passThroughEnv).toEqual(expect.arrayContaining(['VITEST_CASE_BUDGET_MS', 'VITEST_CASE_BUDGET_DEFER']));
  });

  it('only the compat cells turn it off, where correctness is graded on every OS', () => {
    const offs = readdirSync(join(REPO_ROOT, '.github/workflows'))
      .filter((f) => f.endsWith('.yml'))
      .flatMap((f) => [...readFileSync(join(REPO_ROOT, '.github/workflows', f), 'utf8').matchAll(/VITEST_CASE_BUDGET_MS: (.*)$/gmu)].map((m) => `${f}: ${m[1] ?? ''}`));
    expect(offs).toEqual(['compat.yml: "0"', 'compat.yml: "0"']);
  });
});

describe('NIGHTLY_ONLY names only cases that run in the weekly local run', () => {
  const entries = Object.entries(NIGHTLY_ONLY);
  // Each of these runs oxmutate end to end, and no mutation runs in GitHub Actions
  // (D-20261101-no-mutation-in-gha): `npm run mutation:weekly` runs them, not a workflow.
  const weekly = readFileSync(join(REPO_ROOT, 'scripts/mutation-weekly.sh'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
  const run = /env BURGEE_NIGHTLY=1 OXMUTATE_REQUIRE_NATIVE=1 npm exec -w oxmutate -- vitest run ([^\n;]+)/u.exec(weekly)?.[1] ?? '';

  it('the weekly run sets BURGEE_NIGHTLY for them, and no workflow does', () => {
    expect(run, 'scripts/mutation-weekly.sh runs no BURGEE_NIGHTLY vitest run').not.toBe('');
    const workflows = readdirSync(join(REPO_ROOT, '.github/workflows')).filter((f) => /\.ya?ml$/u.test(f));
    const setting = workflows.filter((f) => /^[^#\n]*\bBURGEE_NIGHTLY\b/mu.test(readFileSync(join(REPO_ROOT, '.github/workflows', f), 'utf8')));
    expect(setting).toEqual([]);
  });

  it.each(entries)('%s', (key, reason) => {
    expect(reason.length, 'every exemption says what heavy operation it needs').toBeGreaterThan(40);
    const [file = '', ...names] = key.split(' > ');
    expect(existsSync(join(REPO_ROOT, file)), `${file} does not exist`).toBe(true);
    const source = readFileSync(join(REPO_ROOT, file), 'utf8');
    // Kept off a pull request: the file reads BURGEE_NIGHTLY, and the case's own title is in it.
    expect(source).toContain("process.env['BURGEE_NIGHTLY'] === '1'");
    const title = names.at(-1) ?? '';
    expect([title, title.replaceAll("'", "\\'")].some((t) => source.includes(t)), `${file} has no case titled "${title}"`).toBe(true);
    // And run weekly: the local run's BURGEE_NIGHTLY step names the file.
    expect(file.startsWith('packages/oxmutate/'), `${file}: the weekly step runs in packages/oxmutate`).toBe(true);
    expect(run.split(/\s+/u)).toContain(file.replace('packages/oxmutate/', ''));
  });
});
