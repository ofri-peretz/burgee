/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — the Version PR re-converges the foundation weights it moves.
 *
 * A version bump changes a package's tarball: `1.0.9` → `1.0.10` is one more byte in its
 * `package.json`. Each foundation package's `src/weight.test.ts` holds its packed size equal to
 * the band (`.sdlc/bands/foundation-ceilings.json`), so a bump that adds a digit failed the
 * Version PR it was made in: #1142 went red on the published-suites cells with
 * `expected { ours: 233515 } to deeply equal { ours: 233514 }` for seniority, and stayed red,
 * because nothing on the release path re-measured. `changeset:version` (which
 * `scripts/release-window.mts version` runs for the Version PR) regenerated the doc versions,
 * the package docs and the lockfile, and never ran `weight:converge`.
 *
 * Read from `package.json`, the one place the release path takes the steps from.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { scripts } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

/** The script's steps, as the shell runs them: `a && b && c`. */
const steps = (script: string | undefined): string[] => (script ?? '').split('&&').map((step) => step.trim());

describe('changeset:version re-converges the foundation weights (Version PR #1142)', () => {
  it('runs weight:converge, after every step that changes what a package ships', () => {
    const version = steps(scripts['changeset:version']);
    expect(version[0]).toBe('changeset version');
    // Last: the versions, the package docs and the lockfile are all written before the packages are measured.
    expect(version.at(-1)).toBe('npm run weight:converge');
  });

  it('weight:converge is the script that rewrites the band', () => {
    expect(scripts['weight:converge']).toBe('node scripts/weight-converge.mjs');
  });
});
