/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Tells a test file whether this run is collecting coverage, so a timing can stop grading it.
 *
 * vitest's v8 provider starts precise coverage through `node:inspector` inside the worker. It
 * sets no environment variable a test could read (`NODE_V8_COVERAGE` is the other mechanism,
 * and vitest does not use it), so the only documented way to tell a test is `provide`/`inject`
 * from a `globalSetup`, which is what this is. `migrate-bench.test.ts` is the reader: under
 * coverage every block of the code it times carries a counter, and the CPU yardstick it divides
 * by — a `RegExp` walk, run as irregexp's generated code — carries none.
 */
import { type TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Whether this run is collecting coverage — instrumented code is not the code a user runs. */
    coverageEnabled: boolean;
  }
}

/** vitest's `globalSetup`. */
export function setup(project: TestProject): void {
  project.provide('coverageEnabled', project.globalConfig.coverage.enabled);
}
