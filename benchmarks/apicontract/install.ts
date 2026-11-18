/**
 * R4: installs packages at pinned versions into a temporary folder, never the repository's
 * lockfile, and prints the folder. The folder is keyed by the exact specs, so a second run with the
 * same versions reuses it; a version bump is a new folder (and, per the intent, a reviewed PR).
 *
 *   npx tsx benchmarks/apicontract/install.ts openapi-typescript@7.13.0 typescript@5.9.3
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { spawnSync } from '../spawn.js';

const ERROR_CHARS = 2000;
const KEY_CHARS = 16;
/** Folder names stay readable but short of any path limit. */
const NAME_CHARS = 80;

/** Exact `name@version` specs only: a range would make the folder's contents depend on the day. */
export function assertPinned(spec: string): void {
  const at = spec.lastIndexOf('@');
  if (at <= 0 || !/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/.test(spec.slice(at + 1))) throw new Error(`"${spec}" is not pinned. fix: name an exact version, e.g. openapi-typescript@7.13.0`);
}

/** Installs `specs` into one folder under the OS temp directory and returns it. */
export function install(specs: readonly string[], { root = path.join(tmpdir(), 'apicontract-corpus-tools') } = {}): string {
  for (const spec of specs) assertPinned(spec);
  const sorted = specs.toSorted();
  const key = createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, KEY_CHARS);
  const dir = path.join(root, `${sorted.map((s) => s.replaceAll('/', '+')).join('_').slice(0, NAME_CHARS)}-${key}`);
  const done = path.join(dir, '.installed');
  if (existsSync(done)) return dir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), '{"private":true,"type":"module"}\n');
  const result = spawnSync('npm', ['i', '--no-audit', '--no-fund', '--silent', '--legacy-peer-deps', '--no-package-lock', ...sorted], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`npm i ${sorted.join(' ')} failed: ${(result.stderr || result.stdout).trim().slice(0, ERROR_CHARS)}`);
  writeFileSync(done, `${sorted.join('\n')}\n`);
  return dir;
}

/** A package's binary inside an installed folder. */
export const bin = (dir: string, name: string): string => path.join(dir, 'node_modules', '.bin', name);

if (process.argv[1] === import.meta.filename) {
  const specs = process.argv.slice(2);
  if (specs.length === 0) throw new Error('usage: install.ts <pkg>@<version> [...]');
  process.stdout.write(`${install(specs)}\n`);
}
