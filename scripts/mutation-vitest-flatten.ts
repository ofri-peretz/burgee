/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * A package's Vitest config with its `projects` folded into one, for an oxmutate run.
 *
 * oxmutate hands Vitest its runner as an option of the run, not of the config, and a project
 * does not inherit it. So under a config with `projects` the dry run collected nothing:
 * `oxmutate: the dry run ran no tests`, on every pull request that changed a line of burgee,
 * whose config splits its tests into a parallel pool and a serial group of shell-driving files
 * (measured 2026-10-29 on #1362; the same changed lines with the projects folded: 50 mutants,
 * 50 killed). One project's worth of config runs the same files: `include` is the union of the
 * projects', and what the split was for, keeping slow shells apart, does not change a verdict.
 */
interface Project {
  test?: { include?: string[] };
}

interface Config {
  test?: { projects?: unknown[]; include?: string[] } & Record<string, unknown>;
}

/** `base` with no `projects`, including every file one of them included. Unchanged without any. */
export function flattenProjects<C extends Config>(base: C): C {
  const { projects, ...test } = base.test ?? {};
  if (projects === undefined) return base;
  const include = projects.flatMap((p) => (typeof p === 'object' && p !== null ? ((p as Project).test?.include ?? []) : []));
  return { ...base, test: { ...test, include: [...new Set(include)] } };
}
