/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the informational Controls do not spend a graded cell's 30 minutes.
 *
 * compat.yml's `matrix` cell ran Controls (`compat-oracle --control`) after its hard-gated suite
 * on every OS. Off Linux it is informational, and on Windows it was half the job: 542–883 s of
 * the cell's 17 m 35 s – 28 m 28 s over the ten dispatched runs at `b62cf2a105`
 * (D-20261028-windows-pinned-sha-counts), when the build and the suite before it took 8–14 min.
 * The slowest run left the cell 92 s from the cancel that the windows-lane-holds intent counts.
 *
 * So the off-Linux Controls run in a job of their own, `controls`, on the same OSes and Node,
 * informational as before. The `matrix` cell runs them on Linux only, where they are a gate.
 * Moving them out must not drop them, so both halves are held here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

interface Step {
  if?: string;
  run?: string;
  'continue-on-error'?: unknown;
}
interface Job {
  strategy?: { matrix?: { os?: unknown; node?: unknown } };
  steps?: Step[];
}

const WORKFLOW = join(import.meta.dirname, '..', '.github', 'workflows', 'compat.yml');
const jobs = (loadYaml(readFileSync(WORKFLOW, 'utf8')) as { jobs: Record<string, Job> }).jobs;
const controlsStep = (job: Job | undefined): Step | undefined => job?.steps?.find((s) => /bin\.js --control\b/u.test(s.run ?? ''));

describe('compat.yml: the off-Linux Controls run outside the graded cell', () => {
  it('the matrix cell runs Controls on Linux only, as a gate', () => {
    const step = controlsStep(jobs['matrix']);
    expect(step, 'matrix has no Controls step: Linux lost its gate').toBeDefined();
    expect(step?.if).toContain("matrix.os == 'ubuntu-latest'");
    expect(step?.['continue-on-error'], 'on Linux the Controls are a gate').toBeUndefined();
  });

  it('a `controls` job runs them on macOS and Windows, on the matrix Node, informational', () => {
    const job = jobs['controls'];
    const step = controlsStep(job);
    expect(step, 'no `controls` job runs `--control`: moving them dropped them').toBeDefined();
    const os = String(job?.strategy?.matrix?.os);
    expect(os).toContain('macos-latest');
    expect(os).toContain('windows-latest');
    expect(os).not.toContain('ubuntu-latest');
    expect(job?.strategy?.matrix?.node).toEqual(jobs['matrix']?.strategy?.matrix?.node);
    expect(step?.['continue-on-error']).toBe(true);
  });
});
