/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Run a workflow step's own shell for many scenarios, from one `bash` started by Node.
 *
 * Why (windows-lane-holds R6). The locks that run a workflow step's `run:` body used to start
 * one `bash` from Node per case. On `main`'s full Windows cells the first of those cost seconds
 * and sometimes most of a 30 s timeout: `changeset-check-lock`'s first case took 3.2–8.5 s over
 * ten cells and 65.9 s in run 40537347822, and `dependabot-automerge-lock`'s first took 29.7 s
 * in run 40513685943. The same file's later spawns took under a second. A `bash` started by
 * `bash` is not that kind of cold start. On macOS each one is about 15 ms.
 *
 * How. One driver `bash` runs, for each scenario, the step as its own `bash -x` in a subshell.
 * The subshell unsets every variable the step reads, then exports only that scenario's
 * variables, its own `$GITHUB_OUTPUT` and its own `$GITHUB_STEP_SUMMARY`, so nothing leaks from
 * one scenario to the next. The `-x` trace goes to a file per scenario, so a wrong answer still
 * arrives with the path that produced it. Every path in the driver is relative to `$root`, the
 * driver's working directory, so it names no Windows path.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** One run of the step: the variables it is given, and where it runs. */
export interface StepScenario {
  env: Record<string, string>;
  /** The working directory, relative to the root. Default: an empty `<name>/cwd`. */
  cwd?: string;
}

/** What one scenario's step left behind. */
export interface StepRun {
  /** Its `$GITHUB_OUTPUT`, empty when it never wrote one. */
  output: string;
  /** The driver's exit and stderr, then the step's `bash -x` trace and its own `exit <n>` line. */
  trace: string;
}

/** A value as one single-quoted bash word. */
const word = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** A file's text, or nothing when the step never wrote it. */
const readIfThere = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');

let spawned = 0;

/** How many `bash` processes this module has started from Node in this test file. */
export function bashSpawns(): number {
  return spawned;
}

/**
 * Write `script` under `root` and run it once per scenario, all inside one `bash` started from
 * Node. `variables` names every variable the step reads, so each scenario starts without them.
 */
export function runStepScenarios(
  root: string,
  { script, variables, scenarios, env }: { script: string; variables: readonly string[]; scenarios: Record<string, StepScenario>; env: NodeJS.ProcessEnv },
): Record<string, StepRun> {
  writeFileSync(join(root, 'step.sh'), script);
  const unset = [...new Set([...variables, 'GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY'])];
  const lines = ['root=$PWD'];
  for (const [name, scenario] of Object.entries(scenarios)) {
    if (!/^[a-z0-9-]+$/u.test(name)) throw new Error(`scenario names are lower-case words joined by "-": ${name}`);
    const cwd = scenario.cwd ?? `${name}/cwd`;
    mkdirSync(join(root, name), { recursive: true });
    mkdirSync(join(root, cwd), { recursive: true });
    writeFileSync(join(root, name, 'output'), '');
    const exports = Object.entries(scenario.env).map(([key, value]) => `${key}=${word(value)}`);
    lines.push(
      `( unset ${unset.join(' ')}`,
      `  export ${[...exports, `GITHUB_OUTPUT="$root/${name}/output"`, `GITHUB_STEP_SUMMARY="$root/${name}/summary"`].join(' ')}`,
      `  cd "$root/"${word(cwd)} || exit 97`,
      `  bash -x "$root/step.sh" 2>"$root/${name}/trace"`,
      `  echo "exit $?" >>"$root/${name}/trace" )`,
    );
  }
  writeFileSync(join(root, 'driver.sh'), `${lines.join('\n')}\n`);
  spawned += 1;
  const run = spawnSync('bash', ['driver.sh'], { cwd: root, env, encoding: 'utf8' });
  const driver = `driver: exit ${String(run.status ?? run.signal)}${run.error ? ` (${run.error.message})` : ''}${run.stderr ? `\n${run.stderr}` : ''}`;
  return Object.fromEntries(
    Object.keys(scenarios).map((name) => [name, { output: readIfThere(join(root, name, 'output')), trace: `${driver}\n${readIfThere(join(root, name, 'trace'))}` }]),
  );
}
