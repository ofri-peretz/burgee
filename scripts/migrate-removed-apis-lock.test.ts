/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every removed API `burgee migrate` reports on an off-major project is the incumbent's own
 * changelog, not an opinion (migrate-older-majors R6a, R7).
 *
 * An off-major row tells a maintainer which lines will break, and the move gate refuses a move on
 * the strength of the same rows, so a row with no source is a work item and a refusal nobody can
 * check. Each row cites `CHANGELOG.md` at a released tag, anchored to the release heading of the
 * version it names, and quotes the line. The lock is offline: it holds the citation's shape and
 * never fetches it. That each row is true of the drop-in at every claimed major is the other half,
 * `packages/burgee/src/migrate-majors.test.ts`, because it loads the built entries.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree, and `migrate-majors.ts` is not an export
import { REMOVED_APIS } from '../packages/burgee/src/migrate-majors.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPOS = { commander: 'tj/commander\\.js', yargs: 'yargs/yargs' } as const;

describe('migrate-older-majors — the removed-API table', () => {
  it.each(REMOVED_APIS.map((row) => [row.api, row] as const))("%s cites its incumbent's changelog at a pinned tag, by release heading", (_, row) => {
    expect(row.removedIn).toMatch(/^\d+\.\d+\.\d+$/);
    const anchor = row.removedIn.replaceAll('.', '');
    expect(row.source).toMatch(new RegExp(`^https://github\\.com/${REPOS[row.host]}/blob/v\\d+\\.\\d+\\.\\d+/CHANGELOG\\.md#${anchor}-\\d{4}-\\d{2}-\\d{2}$`));
    expect(row.quote.trim()).not.toBe('');
    expect(row.replacement.trim()).not.toBe('');
  });

  it('names each API once', () => {
    expect(new Set(REMOVED_APIS.map((row) => row.api)).size).toBe(REMOVED_APIS.length);
  });

  it('each api is named on the migrate docs page, with its source', () => {
    const page = readFileSync(join(ROOT, 'apps/docs/content/docs/migrate.mdx'), 'utf8');
    for (const row of REMOVED_APIS) {
      expect(page, `${row.api} is not on the migrate page with its release and source`).toContain(`| \`${row.api}\` | [${row.host} ${row.removedIn}](${row.source}) |`);
    }
  });
});
