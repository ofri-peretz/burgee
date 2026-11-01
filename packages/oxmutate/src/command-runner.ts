/**
 * The command runner (Stryker's `testRunner: 'command'`): any test command, one process per
 * mutant, the escape hatch for a suite that is not Vitest. A non-zero exit kills the mutant, a run
 * past its budget is a timeout, and a zero exit is a survivor. There is no coverage, so every
 * mutant runs the whole command, as with Stryker's.
 *
 * An arbitrary command cannot be served sources from memory, so this is the one path with a
 * sandbox: a copy of the project under `<root>/.oxmutate-tmp/`, with the instrumented files
 * written into it. Inside the project, as Stryker's `.stryker-tmp` is, so module resolution walks
 * up to the same `node_modules` (a monorepo's hoisted ones included). The armed mutant reaches the
 * instrumented code through `__OXMUTATE_ACTIVE_MUTANT__`, which the runtime header reads.
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ambientRuntime, run as spawn } from 'bellpull';

import { ACTIVE_MUTANT_ENV, env } from './runtime.js';

export interface CommandMutant {
  id: string;
  status: string;
  statusReason?: string | undefined;
  testsCompleted?: number | undefined;
}

export interface CommandRunOptions {
  root: string;
  command: string;
  /** Instrumented sources, absolute path in the project → code. */
  codeMap: Record<string, string>;
  concurrency: number;
  timeoutMS: number;
  timeoutFactor: number;
  dryRunTimeoutMinutes: number;
}

const SANDBOX_DIR = '.oxmutate-tmp';
/** Stryker's default `ignorePatterns`, plus this sandbox. */
const SKIP = new Set(['node_modules', '.git', 'reports', 'coverage', '.stryker-tmp', SANDBOX_DIR]);

/**
 * A copy of the project under `<root>/.oxmutate-tmp/`, for the paths that need files on disk (the
 * command runner, the type checker). Inside the project so module resolution walks up to the same
 * `node_modules`; entry by entry, since a directory cannot be copied into itself.
 */
export function makeSandbox(root: string): string {
  const parent = path.join(root, SANDBOX_DIR);
  mkdirSync(parent, { recursive: true });
  const sandbox = mkdtempSync(path.join(parent, 'sandbox-'));
  for (const entry of readdirSync(root)) if (!SKIP.has(entry)) cpSync(path.join(root, entry), path.join(sandbox, entry), { recursive: true });
  rebaseExtends(root, sandbox);
  return sandbox;
}

/** A relative `"extends"` that a tsconfig holds, quoted: the path is group 2. */
const RELATIVE_EXTENDS = /("extends"\s*:\s*")(\.{1,2}\/[^"]*)(")/g;

/**
 * A tsconfig's relative `extends` resolves from the file that holds it, and the sandbox sits two
 * directories deeper than the project, so one that climbs out of the project (a monorepo package's
 * `../../tsconfig.base.json`) would now point at nothing. Each copied tsconfig is rewritten to
 * reach the same file from its new place. `from` and `to` are the same directory, before and after.
 */
function rebaseExtends(from: string, to: string): void {
  for (const entry of readdirSync(to, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const copied = path.join(to, entry.name);
    if (entry.isDirectory()) rebaseExtends(path.join(from, entry.name), copied);
    else if (/^tsconfig.*\.json$/.test(entry.name)) {
      const text = readFileSync(copied, 'utf8');
      const rebased = text.replace(RELATIVE_EXTENDS, (_match, open: string, rel: string, close: string) => {
        const relative = path.relative(to, path.resolve(from, rel)).split(path.sep).join('/');
        return `${open}${relative.startsWith('.') ? relative : `./${relative}`}${close}`;
      });
      if (rebased !== text) writeFileSync(copied, rebased);
    }
  }
}

const MS_PER_MINUTE = 60_000;
/** How much of a failing dry run's output the error keeps. */
const OUTPUT_TAIL = 1500;
/**
 * The least slack a process-per-mutant run gets: Stryker's own default `timeoutMS`. oxmutate's
 * 500 ms default is sized for a warm in-process run; a fresh process's start-up varies by seconds
 * on a loaded machine, and at 500 ms the e2e fixture read false timeouts (2026-10-27).
 */
const PROCESS_SLACK_MS = 5000;

/** Runs the command over every mutant not already decided; returns the dry run's time. */
export async function runCommandMutants(o: CommandRunOptions, mutants: CommandMutant[]): Promise<{ dryMs: number; executions: number }> {
  const sandbox = makeSandbox(o.root);
  try {
    for (const [file, code] of Object.entries(o.codeMap)) writeFileSync(path.join(sandbox, path.relative(o.root, file)), code);
    // Stryker splits the command on spaces and runs it without a shell; so does this.
    const [command = '', ...args] = o.command.trim().split(/\s+/);
    const once = (timeout: number, id?: string): ReturnType<typeof spawn> =>
      spawn(command, args, { cwd: sandbox, runtime: ambientRuntime(), timeout, env: id ? { ...env, [ACTIVE_MUTANT_ENV]: id } : { ...env } });

    const dryBudget = o.dryRunTimeoutMinutes * MS_PER_MINUTE;
    const dry = await once(dryBudget);
    if (!dry.ok) {
      const why = dry.duration >= dryBudget ? `took longer than dryRunTimeoutMinutes (${String(o.dryRunTimeoutMinutes)})` : `exited ${String(dry.code)}`;
      throw new Error(`the command \`${o.command}\` ${why} with no mutant active: ${(dry.stderr || dry.stdout).trim().slice(-OUTPUT_TAIL)}. fix: make the command pass on the unmutated project first`);
    }
    const budget = Math.max(o.timeoutMS, PROCESS_SLACK_MS) + o.timeoutFactor * dry.duration;
    const queue = mutants.filter((m) => m.status !== 'Ignored');
    let executions = 0;
    const worker = async (): Promise<void> => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        const r = await once(budget, m.id);
        executions++;
        m.testsCompleted = 1;
        if (r.ok) m.status = 'Survived';
        else if (r.signal !== null && r.duration >= budget) {
          m.status = 'Timeout';
          m.statusReason = `the command ran past ${String(Math.round(budget))} ms`;
        } else m.status = 'Killed';
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, o.concurrency) }, worker));
    return { dryMs: dry.duration, executions };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}
