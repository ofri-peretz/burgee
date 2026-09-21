/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a changeset names a package changesets will actually version.
 *
 * `.changeset/` is a queue, and its contract is that a release empties it. A changeset for a
 * package the configuration excludes is never consumed: it sits in the directory forever,
 * and — because `changesets/action` opens a Version PR whenever the directory is non-empty —
 * every push to `main` raises a Version PR whose `changeset version` produces **no file
 * changes at all**. Two of those were opened and closed by hand on 2026-09-21 (#399, #408),
 * each an empty `chore(release): version packages` commit, each sitting at 0 checks against
 * 3 required ones because the release token raises no runs.
 *
 * The shape is self-inflicted and it compounds. `Changeset present` requires a changeset for
 * any change under `packages/`, `compat-oracle` lives there, and `privatePackages.version`
 * was `false` — so the check obliged authors to write files the configuration guaranteed
 * could never be consumed. Nine had accumulated.
 *
 * Two exclusions do this, and both are checked here: a package listed in `ignore`, and a
 * private package when `privatePackages.version` is not `true`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGESET_DIR = join(REPO_ROOT, '.changeset');

interface Config {
  ignore?: string[];
  privatePackages?: { version?: boolean };
}

/** Every package name a pending changeset names, with the file that names it. */
function pending(): { file: string; name: string }[] {
  return readdirSync(CHANGESET_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .flatMap((file) => {
      const text = readFileSync(join(CHANGESET_DIR, file), 'utf8');
      const front = /^---\n([\s\S]*?)\n---/m.exec(text)?.[1] ?? '';
      return [...front.matchAll(/^'([^']+)':/gm)].map((m) => ({ file, name: m[1] as string }));
    });
}

/** `private: true` in the workspace, whether or not changesets would version it. */
function isPrivate(name: string): boolean {
  for (const dir of ['packages', 'apps']) {
    const at = join(REPO_ROOT, dir, name.replace(/^@[^/]+\//u, ''), 'package.json');
    try {
      return (JSON.parse(readFileSync(at, 'utf8')) as { private?: boolean }).private === true;
    } catch {
      continue;
    }
  }
  return false;
}

describe('every pending changeset names a package a release will version', () => {
  const config = JSON.parse(readFileSync(join(CHANGESET_DIR, 'config.json'), 'utf8')) as Config;
  const ignored = new Set(config.ignore ?? []);
  const versionsPrivate = config.privatePackages?.version === true;

  it('names nothing the `ignore` list excludes', () => {
    expect(pending().filter(({ name }) => ignored.has(name))).toEqual([]);
  });

  it('names no private package while `privatePackages.version` is off', () => {
    // The whole failure: with versioning off, `changeset status` still reports the bump and
    // `changeset version` writes nothing, so the queue never drains and the Version PR is
    // empty rather than absent.
    const stranded = versionsPrivate ? [] : pending().filter(({ name }) => isPrivate(name));
    expect(
      stranded,
      'these changesets can never be consumed: the package is private and `privatePackages.version` is not true, so every push to main opens an empty Version PR. Either version private packages or do not write changesets for them',
    ).toEqual([]);
  });
});
