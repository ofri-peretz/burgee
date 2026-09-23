/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * seniority's one door to the process (Y9, D-131) — the same seam `burgee`, `paratext`,
 * `flagstaff`, `roundel` and `caique` each have one of.
 *
 * Only the drop-in façades open it: `seniority/dotenv`'s `config()` and `seniority/rc`, whose
 * incumbents read the environment and the working directory **by default**, and whose own
 * suites assert exactly that (`process.env.BASIC` after a bare `config()`; `rc`'s
 * `process.env[name + '_envOption']`). A drop-in that refused the default would not be a
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
