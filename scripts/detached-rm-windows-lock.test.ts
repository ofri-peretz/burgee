/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a test cleanup that spawns `rm` never does it on Windows.
 *
 * Test files hand their scratch directories to a detached `rm` instead of waiting on an unlink
 * (#1136, #1137, #1144). Windows has no `rm`, so the spawn fails with ENOENT, and nothing is listening
 * for the child's `error` event, so that failure is an uncaught exception that fails the suite.
 * `npm test` runs the root suite and every package suite on the windows-latest cell of compat.yml.
 * Windows runners are discarded, so skipping the delete there costs nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('detached rm on Windows', () => {
  it("every spawn('rm' line is guarded by process.platform !== 'win32'", () => {
    const files = execFileSync('git', ['ls-files', '*.ts', '*.mts'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((file) => file !== 'scripts/detached-rm-windows-lock.test.ts');
    const sites = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ file, line: i + 1, text: line }))
        .filter(({ text }) => text.includes("spawn('rm'")),
    );
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.filter(({ text }) => !text.includes("process.platform !== 'win32'")).map(({ file, line }) => `${file}:${line}`)).toEqual([]);
  });
});
