/**
 * truepass's command line, declared once on burgee: help, `--json`, `--schema` and the MCP
 * server are projected from this declaration. Handlers return data; the text a person reads
 * rides along under burgee's text symbol.
 */
import { readFileSync, rmSync } from 'node:fs';

import { defineCommand, defineProgram, ExitCode, UsageError } from 'burgee';

import { budgetFrom, judge, type Machine, readCandidates, realMachine } from './budget.js';
import { check } from './check.js';
import { git as realGit, type Git } from './git.js';

const TEXT = Symbol.for('burgee.text');

const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** The program, over a given git: the real one in the bin, a fake one in the tests. */
export function createProgram(git: Git, machine: Machine = realMachine()) {
  const diff = defineCommand({
    name: 'diff',
    description: 'Report assertions moved to a weaker matcher and snapshots changed with no reason, in the commits since a base',
    effects: 'read_only',
    examples: [
      { command: 'truepass diff', description: 'the commits since origin/main, as a lefthook pre-push step' },
      { command: 'truepass diff --base main --json', description: 'the same findings as the --json envelope' },
    ],
    options: { base: { type: 'string', default: 'origin/main', description: 'the ref the range starts from' } },
    run: async ({ options }) => {
      const base = String(options.base);
      let findings;
      try {
        findings = await check(base, git);
      } catch (e) {
        throw new UsageError(`git could not compare against ${base}: ${(e as Error).message}`, `fetch ${base} first, or pass --base with a ref this checkout has`);
      }
      const data: Record<string | symbol, unknown> = { base, findings };
      if (findings.length > 0) data['exitCode'] = ExitCode.RUNTIME;
      data[TEXT] = () => (findings.length === 0 ? `no findings since ${base}` : findings.map((f) => `${f.path}:${String(f.line)} ${f.check} ${f.message}`).join('\n'));
      return data;
    },
  });
  const budget = defineCommand({
    name: 'budget',
    description: 'Judge the test cases a battery read over the per-case time budget, each measured again alone',
    effects: 'read_only',
    examples: [{ command: 'truepass budget node_modules/.cache/truepass-budget', description: 'after `turbo run test` ran with TRUEPASS_BUDGET_DEFER set to that directory' }],
    arguments: [{ name: 'dir', description: 'the directory the runs left their candidates in; emptied once read' }],
    run: async ({ args }) => {
      const dir = String(args['dir']);
      const candidates = readCandidates(dir);
      rmSync(dir, { recursive: true, force: true });
      const ms = budgetFrom(machine.env, candidates[0]?.budget);
      const passed = ms === 0 || (await judge(candidates, ms, undefined, machine));
      const data: Record<string | symbol, unknown> = { budgetMs: ms, remeasured: candidates.length, passed };
      if (!passed) data['exitCode'] = ExitCode.RUNTIME;
      data[TEXT] = () => (passed ? `no test case over the ${String(ms)} ms budget (${String(candidates.length)} re-measured alone)` : `test cases over the ${String(ms)} ms budget; see above`);
      return data;
    },
  });
  return defineProgram({
    name: 'truepass',
    version: VERSION,
    description: 'Test-suite integrity: lint rules for focused, skipped, sleeping and retried tests, and a pre-push check for weakened assertions',
    commands: [diff, budget],
  });
}

export const program = createProgram(realGit);
