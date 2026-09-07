/**
 * Vendors a host's own test suite and points it at our shim.
 *
 * The rewrite is one specifier and nothing else, scripted so it is reproducible
 * from a clean checkout (C6/R2). The upstream commit is recorded beside the
 * tests, and a scheduled job re-runs this to make the treadmill visible.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Host } from './hosts.js';

/** Length of an ISO date, `YYYY-MM-DD`. */
const ISO_DATE = 10;

export interface VendorResult {
  host: string;
  commit: string;
  files: number;
  excluded: string[];
}

/** Upstream tests import the library by one specifier; we point that at the shim. */
export function rewrite(source: string, specifier: string): string {
  return source.split(`'${specifier}'`).join(`'../shim.js'`).split(`"${specifier}"`).join(`"../shim.js"`);
}

/** A file that reaches into the host's internals is out of scope, and says so by name. */
export function testsInternals(source: string): boolean {
  return /from ['"]\.\.\/lib\//.test(source) || /require\(['"]\.\.\/lib\//.test(source);
}

export function vendor(host: Host, into: string): VendorResult {
  const clone = mkdtempSync(join(tmpdir(), `vendor-${host.name}-`));
  try {
    execFileSync('git', ['clone', '--depth', '1', host.repo, clone], { stdio: 'ignore' });
    const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

    const from = join(clone, host.testDir);
    const dest = join(into, host.name, 'tests');
    rmSync(join(into, host.name), { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });

    const excluded: string[] = [];
    let files = 0;

    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        cpSync(join(from, entry.name), join(dest, entry.name), { recursive: true });
        continue;
      }
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.cjs') && !entry.name.endsWith('.ts')) continue;
      const source = readFileSync(join(from, entry.name), 'utf8');
      if (testsInternals(source)) {
        excluded.push(entry.name);
        continue;
      }
      writeFileSync(join(dest, entry.name), rewrite(source, host.importSpecifier));
      files += 1;
    }

    writeFileSync(
      join(into, host.name, '.source.json'),
      `${JSON.stringify({ repo: host.repo, commit, vendored: new Date().toISOString().slice(0, ISO_DATE), files, excluded }, null, 2)}\n`,
    );
    return { host: host.name, commit, files, excluded };
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}
