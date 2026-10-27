/**
 * The type checker (Stryker's `checkers: ['typescript']`): a surviving mutant that does not
 * type-check is a CompileError, not a survivor. A survivor is what someone writes a test for, and
 * a test cannot kill a program the compiler refuses; Stryker's TypeScript checker exists for the
 * same reason.
 *
 * It checks survivors only, where Stryker checks every mutant before running it. A killed mutant
 * that would not have compiled changes nothing anyone acts on, and a full project type check per
 * mutant is the costliest step there is. The difference: such a mutant is Killed here where Stryker
 * would score it CompileError, which can move a score that enables the checker by its share.
 *
 * The project's own compiler, `tsgo` when installed and `tsc` otherwise, over its own tsconfig.
 * Survivors are checked in batches with at most one mutant per file, and each error is laid at the
 * mutant in the file it names. An error in a file no mutant of the batch touched (a type that
 * flowed across files) sends that batch back one mutant at a time, so no verdict is a guess.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ambientRuntime, run as spawn } from 'bellpull';

import { makeSandbox } from './command-runner.js';

export interface CheckMutant {
  id: string;
  /** Repository-relative to the project root. */
  file: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
  replacement: string;
}

export interface CheckOptions {
  root: string;
  tsconfig: string;
  /** The compiler command, split on spaces (default: the project's tsgo, else `npx tsc`). */
  command?: string | undefined;
  concurrency: number;
}

const OUTPUT_TAIL = 1500;
/** `src/a.ts(3,7): error TS2322: …` — tsc's and tsgo's `--pretty false` shape. */
const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS\d+: .*)$/;

/** The source with one mutant applied. Columns are UTF-16 and 1-based, as JavaScript counts. */
export function applyMutant(source: string, m: Pick<CheckMutant, 'start' | 'end' | 'replacement'>): string {
  const starts = [0];
  for (let i = source.indexOf('\n'); i !== -1; i = source.indexOf('\n', i + 1)) starts.push(i + 1);
  const at = (p: { line: number; column: number }): number => (starts[p.line - 1] ?? 0) + p.column - 1;
  return source.slice(0, at(m.start)) + m.replacement + source.slice(at(m.end));
}

/** Errors per file (repository-relative), from the compiler's output. */
export function parseDiagnostics(output: string, cwd: string): Map<string, string> {
  const errors = new Map<string, string>();
  for (const line of output.split('\n')) {
    const hit = DIAGNOSTIC.exec(line.trim());
    if (!hit) continue;
    const file = path.relative(cwd, path.resolve(cwd, hit[1] ?? '')).split(path.sep).join('/');
    if (!errors.has(file)) errors.set(file, `${hit[4] ?? ''} (line ${hit[2] ?? ''})`);
  }
  return errors;
}

/** Batches of survivors with at most one per file, so each error names its mutant. */
export function batches<T extends { file: string }>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (const m of items) {
    const free = out.find((b) => !b.some((x) => x.file === m.file));
    if (free) free.push(m);
    else out.push([m]);
  }
  return out;
}

function compiler(o: CheckOptions): string[] {
  if (o.command) return o.command.trim().split(/\s+/);
  const tsgo = path.join(o.root, 'node_modules', '.bin', 'tsgo');
  return existsSync(tsgo) ? [tsgo] : ['npx', 'tsc'];
}

/** The undetected mutants that do not type-check, each with the compiler's first error in its file. */
export async function checkSurvivors(o: CheckOptions, survivors: readonly CheckMutant[]): Promise<Map<string, string>> {
  const failing = new Map<string, string>();
  if (survivors.length === 0) return failing;
  const [command = '', ...prefix] = compiler(o);
  const args = [...prefix, '--noEmit', '--pretty', 'false', '-p', o.tsconfig];
  const sandboxes = Array.from({ length: Math.max(1, Math.min(o.concurrency, survivors.length)) }, () => makeSandbox(o.root));
  try {
    const check = async (sandbox: string): Promise<{ ok: boolean; errors: Map<string, string>; output: string }> => {
      const r = await spawn(command, args, { cwd: sandbox, runtime: ambientRuntime() });
      return { ok: r.ok, errors: parseDiagnostics(`${r.stdout}\n${r.stderr}`, sandbox), output: `${r.stdout}${r.stderr}` };
    };
    const base = await check(sandboxes[0] ?? '');
    if (!base.ok) throw new Error(`the project does not type-check with no mutant applied (\`${[command, ...args].join(' ')}\`): ${base.output.trim().slice(-OUTPUT_TAIL)}. fix: make the type check pass first, or drop checkers`);

    const original = (file: string): string => readFileSync(path.join(o.root, file), 'utf8');
    const run = async (sandbox: string, batch: readonly CheckMutant[]): Promise<void> => {
      for (const m of batch) writeFileSync(path.join(sandbox, m.file), applyMutant(original(m.file), m));
      const r = await check(sandbox);
      for (const m of batch) writeFileSync(path.join(sandbox, m.file), original(m.file));
      if (r.ok) return;
      const touched = new Set(batch.map((m) => m.file));
      if (batch.length > 1 && [...r.errors.keys()].some((f) => !touched.has(f))) {
        for (const m of batch) await run(sandbox, [m]); // an error that crossed files: one at a time
        return;
      }
      for (const m of batch) {
        const error = r.errors.get(m.file) ?? (batch.length === 1 ? [...r.errors.values()][0] : undefined);
        if (error) failing.set(m.id, error);
      }
    };
    const queue = batches(survivors);
    await Promise.all(
      sandboxes.map(async (sandbox) => {
        for (let b = queue.shift(); b; b = queue.shift()) await run(sandbox, b);
      }),
    );
    return failing;
  } finally {
    for (const s of sandboxes) rmSync(s, { recursive: true, force: true });
  }
}
