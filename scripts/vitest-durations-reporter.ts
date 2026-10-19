/**
 * windows-lane-holds R1 — every case's duration and its effective timeout, from the cell itself.
 *
 * vitest's `json` reporter records a duration but not the timeout the case ran under, and "above
 * half its timeout" (R2, `scripts/slow-cases.mts`) needs both. So this reporter writes one small
 * file per vitest run into `$VITEST_DURATIONS_DIR`: `{ version, cwd, platform, node, cases }`,
 * each case `{ file, name, state, duration, timeout }`. `vitest-timeouts.config.ts` adds it beside
 * the default reporter only when that variable is set, which `compat.yml`'s `matrix` and `floor`
 * cells do; every other run is untouched.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Reporter, type TestModule } from 'vitest/node';

import { type DurationCase, type DurationReport } from './slow-cases.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** vitest's own default `testTimeout`, until `onInit` reads the configured one. */
const VITEST_DEFAULT_TIMEOUT_MS = 5_000;

/** POSIX separators on every OS, so a Windows report names a file the way a Linux one does. */
const posix = (path: string): string => path.split('\\').join('/');

// eslint-disable-next-line import-next/no-default-export -- vitest loads a reporter given by path from its default export
export default class DurationsReporter implements Reporter {
  private testTimeout = VITEST_DEFAULT_TIMEOUT_MS;

  onInit(vitest: { config: { testTimeout: number } }): void {
    this.testTimeout = vitest.config.testTimeout;
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const dir = process.env['VITEST_DURATIONS_DIR'];
    if (dir === undefined || dir === '') return;
    const cases: DurationCase[] = [];
    for (const module of modules) {
      for (const test of module.children.allTests()) {
        const diagnostic = test.diagnostic();
        if (diagnostic === undefined) continue;
        cases.push({
          file: posix(relative(ROOT, module.moduleId)),
          name: test.fullName,
          state: test.result().state,
          duration: Math.round(diagnostic.duration),
          timeout: test.options.timeout ?? module.project.config.testTimeout ?? this.testTimeout,
        });
      }
    }
    const cwd = posix(relative(ROOT, process.cwd())) || '.';
    const report: DurationReport = { version: 1, cwd, platform: process.platform, node: process.version, cases };
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${cwd === '.' ? 'root' : cwd.replaceAll('/', '__')}-${process.pid}.json`), `${JSON.stringify(report)}\n`);
  }
}
