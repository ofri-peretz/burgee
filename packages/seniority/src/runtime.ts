/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * seniority's one door to the process (Y9, D-135) — the same seam `burgee`, `paratext`,
 * `flagstaff`, `roundel` and `caique` each have one of.
 *
 * Only the drop-in façades open it: `seniority/dotenv`'s `config()`, `seniority/rc`, and the
 * cosmiconfig explorer's `global` search, whose incumbents read the environment and the working
 * directory **by default**, and whose own suites assert exactly that (`process.env.BASIC` after
 * a bare `config()`; `rc`'s `process.env[name + '_envOption']`; cosmiconfig's global directory
 * under `XDG_CONFIG_HOME`, through `env-paths` — D-20260930-seniority-xdg-config-home). A drop-in that refused the default would not be a
 * drop-in: every migrating caller would need an edit. The resolver — `precedence`, `config`,
 * `explain` — never imports this file, so everything R11 was written to protect stays pure,
 * and every façade still takes the world as an argument first.
 */
const host = (globalThis as { process?: { env?: Record<string, string | undefined>; cwd?: () => string } }).process;

/** The process's environment, or `undefined` on a runtime with no process. */
export function ambientEnv(): Record<string, string | undefined> | undefined {
  return host?.env;
}

/** The process's working directory, or `undefined` on a runtime with no process. */
export function ambientCwd(): string | undefined {
  return host?.cwd?.();
}

/**
 * What `seniority/dotenv/cli` needs from a process: dotenv 18's `dotenv run` reads its
 * environment and working directory, forwards signals to the child it starts, and leaves with
 * that child's exit code. The command line is the one drop-in that *is* a program, so it takes
 * the whole object — from here, the seam, and never by naming the global itself.
 */
export interface CliProcess {
  env: Record<string, string | undefined>;
  cwd: () => string;
  platform: string;
  pid: number;
  stdin: { isTTY?: boolean };
  exitCode?: number | string | null | undefined;
  exit: (code?: number) => void;
  kill: (pid: number, signal?: string | number) => unknown;
  on: (event: string, listener: () => void) => unknown;
  removeListener: (event: string, listener: () => void) => unknown;
}

/** The process itself, for the command line; `undefined` on a runtime with none. */
export function ambientProcess(): CliProcess | undefined {
  return host as CliProcess | undefined;
}
