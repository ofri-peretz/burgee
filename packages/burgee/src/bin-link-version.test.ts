/**
 * `burgee --version` through the bin link npm installs, the way every user runs it. Found by
 * the U12 trial (2026-10-08): `node_modules/.bin/burgee --version` printed the installing
 * project's version and `npx burgee --version` printed "no version declared", because the
 * owning package.json was looked up from the link's directory. Runs the built `dist/cli.js`;
 * `turbo.json` makes `test` depend on `build`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OWN = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('burgee --version through a bin link', () => {
  it('prints burgee\'s own version, not the installing project\'s', () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-binlink-'));
    mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{ "name": "project", "version": "0.0.0" }');
    const link = join(dir, 'node_modules', '.bin', 'burgee');
    // Windows has no unprivileged symlink; npm writes a shim there, which passes the real path.
    try {
      symlinkSync(join(ROOT, 'dist', 'cli.js'), link);
    } catch {
      return;
    }
    const out = execFileSync(process.execPath, [link, '--version'], { cwd: dir, encoding: 'utf8' });
    expect(out.trim()).toBe(OWN);
  });
});
