/**
 * `truepass/vitest-reporter`: the per-case time budget as a vitest reporter.
 *
 *   // vitest.config.ts
 *   reporters: ['default', ['truepass/vitest-reporter', { budgetMs: 5000, exempt: { 'src/e2e.test.ts > boots': 'a real browser' } }]]
 *
 * After the run it reads each case's own duration (body plus its beforeEach/afterEach) and sets
 * the exit code to 1 when one is over the budget and still over it alone. A run with coverage on
 * is not judged: the instrument slows the body. See `budget.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';

import { budgetFrom, type Candidate, DEFAULT_BUDGET_MS, DEFER_ENV, type Exemptions, judge, type Machine, overBudget, realMachine, repoPath } from './budget.js';
import { cwd as processCwd, pid, setExitCode } from './runtime.js';

export interface BudgetOptions {
  /** Milliseconds a case may take; `TRUEPASS_BUDGET_MS` overrides it. Default 5000. */
  budgetMs?: number;
  /** Cases that may take longer, keyed `<file> > <full name>`, each with the reason. */
  exempt?: Exemptions;
  /** What file keys are relative to. Default: the directory vitest runs in. */
  root?: string;
  /** The advice printed under the slow cases. */
  hint?: string;
}

/** The slice of a vitest TestModule the reporter reads. */
interface Module {
  moduleId: string;
  children: { allTests: () => Iterable<{ fullName: string; name: string; diagnostic: () => { duration: number } | undefined }> };
}

// eslint-disable-next-line import-next/no-default-export -- vitest loads a reporter given by name from its default export
export default class TruepassBudget {
  private coverage = false;
  private config: string | undefined;

  constructor(
    private readonly options: BudgetOptions = {},
    private readonly machine: Machine = realMachine(),
  ) {}

  onInit(vitest: { config: { coverage?: { enabled?: boolean } }; vite?: { config?: { configFile?: string } } }): void {
    this.coverage = vitest.config.coverage?.enabled === true;
    this.config = vitest.vite?.config?.configFile;
  }

  async onTestRunEnd(modules: ReadonlyArray<Module>): Promise<void> {
    const budget = budgetFrom(this.machine.env, this.options.budgetMs ?? DEFAULT_BUDGET_MS);
    if (budget === 0 || this.coverage) return;
    const cwd = processCwd();
    const root = this.options.root ?? cwd;
    // Stryker disable next-line ArrayDeclaration: equivalent, a planted entry has no duration and is never over the budget
    const cases: Candidate[] = [];
    for (const module of modules) {
      for (const test of module.children.allTests()) {
        const diagnostic = test.diagnostic();
        if (diagnostic === undefined) continue;
        cases.push({ file: repoPath(root, module.moduleId), path: module.moduleId, name: test.fullName, title: test.name, duration: diagnostic.duration, cwd, config: this.config, budget });
      }
    }
    const candidates = overBudget(cases, budget, this.options.exempt);
    if (candidates.length === 0) return;
    const defer = this.machine.env[DEFER_ENV];
    if (defer !== undefined && defer !== '') {
      mkdirSync(defer, { recursive: true });
      writeFileSync(join(defer, `${String(pid())}-${String(this.machine.now()).replace('.', '_')}.json`), `${JSON.stringify(candidates)}\n`);
      this.machine.write(`\n${String(candidates.length)} case(s) over the ${String(budget)} ms budget in this run; \`truepass budget ${defer}\` judges them alone after the battery.\n`);
      return;
    }
    if (!(await judge(candidates, budget, this.options.hint, this.machine))) setExitCode(ExitCode.RUNTIME);
  }
}
