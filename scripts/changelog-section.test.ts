/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a GitHub Release carries its own version's notes, not the package's history.
 *
 * `release.yml` passed the whole `CHANGELOG.md` to `gh release create --notes-file`, so every
 * release page repeated every release before it. `scripts/changelog-section.sh` slices the one
 * `## <version>` section; this runs it, and checks the workflow still calls it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts/changelog-section.sh');

function section(changelog: string, version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'changelog-section-'));
  const file = join(dir, 'CHANGELOG.md');
  writeFileSync(file, changelog);
  return execFileSync('bash', [SCRIPT, file, version], { encoding: 'utf8' });
}

const CHANGELOG = [
  '# pkg',
  '',
  '## 1.2.0',
  '',
  '### Minor Changes',
  '',
  '- a feature',
  '',
  '  ```md',
  '  ## not a heading, it is inside a fence',
  '  ```',
  '',
  '### Patch Changes',
  '',
  '- a fix',
  '',
  '## 1.1.0',
  '',
  '- older',
  '',
].join('\n');

describe('changelog-section.sh', () => {
  it('prints the version’s section and stops at the next version', () => {
    const out = section(CHANGELOG, '1.2.0');
    expect(out.startsWith('### Minor Changes')).toBe(true);
    expect(out).toContain('### Patch Changes');
    expect(out).toContain('- a fix');
    expect(out).not.toContain('older');
    expect(out).not.toContain('# pkg');
  });

  it('does not end the section on a `## ` line inside a code fence', () => {
    expect(section(CHANGELOG, '1.2.0')).toContain('## not a heading');
  });

  it('prints the last section to the end of the file', () => {
    expect(section(CHANGELOG, '1.1.0').trim()).toBe('- older');
  });

  it('prints nothing for a version with no section, so the caller falls back to generated notes', () => {
    expect(section(CHANGELOG, '9.9.9')).toBe('');
  });

  it('does not match a version that only shares a prefix', () => {
    expect(section(CHANGELOG, '1.2')).toBe('');
  });

  it('is what release.yml hands to `gh release create`', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
    expect(workflow).toContain('bash scripts/changelog-section.sh "$PKG_DIR/CHANGELOG.md" "$PKG_VER"');
    expect(workflow, 'the whole CHANGELOG.md is back as the release notes').not.toContain('notes="$PKG_DIR/CHANGELOG.md"');
  });
});
