/**
 * declaration-summaries R3 — what ships carries summaries, not design essays.
 *
 * `declaration-summaries.test.ts` proves the rule on fixtures. This reads what npm would
 * actually upload: for every published package, the declaration files in
 * `npm pack --dry-run --json`'s list, from the built `dist/`, and fails on any JSDoc block with a
 * second paragraph of prose. A package whose build stops calling `strip-comments.mjs`, or a new
 * declaration extension the walker skips, ships its essays again and goes red here (on
 * 2026-10-20, before the rule, 349 such blocks shipped across the ten packages, 120 of them in
 * burgee).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DECLARATION, multiParagraphBlocks } from './declaration-summaries.mts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** `npm pack` over each package, one real pack of a real tree. */
const PACK_TIMEOUT_MS = 120_000;

const published = readdirSync(join(root, 'packages'))
  .filter((dir) => existsSync(join(root, 'packages', dir, 'package.json')))
  .filter((dir) => (JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) as { private?: boolean }).private !== true);

/** The package-relative paths npm would pack, without assuming a POSIX shell (`pack-list-lock.test.ts` says why). */
function packed(dir: string): string[] {
  const cli = process.env['npm_execpath'];
  const args = ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const io = { cwd: join(root, 'packages', dir), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] } as const;
  const out = cli?.endsWith('.js') === true ? execFileSync(process.execPath, [cli, ...args], io) : execFileSync('npm', args, { ...io, shell: process.platform === 'win32' });
  return (JSON.parse(out) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path);
}

describe('every packed declaration carries summaries only (declaration-summaries R3)', () => {
  it('there are published packages to read', () => {
    expect(published.length).toBeGreaterThanOrEqual(10);
  });

  it.each(published)(
    '%s: no JSDoc block in a packed .d.ts has a second paragraph',
    (dir) => {
      const declarations = packed(dir).filter((file) => DECLARATION.test(file));
      expect(declarations.length).toBeGreaterThan(0);
      const essays = declarations.flatMap((file) => multiParagraphBlocks(readFileSync(join(root, 'packages', dir, file), 'utf8')).map((block) => `${file}: ${block.split('\n')[1]?.trim() ?? block}`));
      expect(essays).toEqual([]);
    },
    PACK_TIMEOUT_MS,
  );
});
