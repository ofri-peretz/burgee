/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — pre-push runs the battery two tasks at a time.
 *
 * Ten tasks at once (turbo's default) starve a machine whose endpoint scanner inspects every new
 * process and file: a git process cost 2.5 to 22 s and the cases that spawn one timed out at 30 s,
 * on 24 pushes in one day (2026-11-23). `vitest-timeouts.config.ts` measured two tasks at a time
 * clean on 2 of 2 runs, at +37 s. The battery still runs every task; only how many run together
 * is bounded.
 *
 * What fails here: the flag dropped, or the battery no longer one turbo run of the three tasks.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('the pre-push battery', () => {
  const hook = (loadYaml(readFileSync(join(ROOT, 'lefthook.yml'), 'utf8')) as { 'pre-push': { commands: Record<string, { run: string }> } })['pre-push'];
  const run = hook.commands['battery']?.run ?? '';

  it('is one turbo run of typecheck, test and build', () => {
    expect(run).toMatch(/turbo run typecheck test build /);
  });

  it('runs two tasks at a time', () => {
    expect(run).toMatch(/ --concurrency=2(\s|$)/);
  });
});
