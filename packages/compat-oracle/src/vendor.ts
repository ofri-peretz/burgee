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

/** Name of the generated shim for the n-th public import a host's tests use. */
export function shimName(index: number): string {
  return index === 0 ? 'shim.js' : `shim-${index}.js`;
}

/** Upstream tests import the library by public specifiers; each is pointed at a shim. */
export function rewrite(source: string, imports: Host['imports']): string {
  let out = source;
  imports.forEach(({ upstream }, i) => {
    const shim = `../${shimName(i)}`;
    out = out.split(`'${upstream}'`).join(`'${shim}'`).split(`"${upstream}"`).join(`"${shim}"`);
  });
  return out;
}

const INTERNAL = /(?:from|require\()\s*['"]\.\.\/(?:lib|build)\//;

/**
 * A file is out of scope only when it reaches into internals AND never imports a public
 * entry — it is testing a helper module, not the surface we promise. A public-surface
 * test that *also* imports an internal (yargs' 429 tests importing `YError`) is kept,
 * and the internal import is shimmed.
 */
export function testsInternals(source: string, host: Host): boolean {
  if (!INTERNAL.test(source)) return false;
  const publicSpecs = host.imports.filter((i) => i.kind !== 'internal').map((i) => i.upstream);
  return !publicSpecs.some((spec) => source.includes(`'${spec}'`) || source.includes(`"${spec}"`));
}

export function vendor(host: Host, into: string): VendorResult {
  const clone = mkdtempSync(join(tmpdir(), `vendor-${host.name}-`));
  try {
    execFileSync('git', ['clone', '--depth', '1', host.repo, clone], { stdio: 'ignore' });
    const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

    const from = join(clone, host.testDir);
    // Upstream's own directory name, because suites use cwd-relative paths into it.
    const dest = join(into, host.name, host.testDir);
    rmSync(join(into, host.name), { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });

    for (const extra of host.extraDirs ?? []) {
      cpSync(join(clone, extra), join(into, host.name, extra), { recursive: true });
    }

    // Suites run from vendor/<host>/ as if it were the upstream repo root, and some read
    // ./package.json there (yargs uses it as a JSON config fixture; without one yargs
    // prints usage and process.exit()s, killing the runner before its summary). It gets a
    // minimal one with a *different* name: upstream's own name plus its exports map would
    // make Node's self-reference rule resolve `import 'yargs'` to a file that is not here.
    const upstream = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')) as { type?: string };
    writeFileSync(
      join(into, host.name, 'package.json'),
      `${JSON.stringify({ name: `@vendored/${host.name}-suite`, private: true, type: upstream.type ?? 'commonjs' }, null, 2)}\n`,
    );

    const excluded: string[] = [];
    let files = 0;

    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        cpSync(join(from, entry.name), join(dest, entry.name), { recursive: true });
        continue;
      }
      if (!/\.(m?js|cjs|ts)$/.test(entry.name)) continue;
      const source = readFileSync(join(from, entry.name), 'utf8');
      if (testsInternals(source, host)) {
        excluded.push(entry.name);
        continue;
      }
      writeFileSync(join(dest, entry.name), rewrite(source, host.imports));
      files += 1;
    }

    writeFileSync(
      join(into, host.name, '.source.json'),
      `${JSON.stringify({ repo: host.repo, commit, vendored: new Date().toISOString().slice(0, ISO_DATE), files, excluded }, null, 2)}\n`,
    );
    // A stale shim from a previous target would silently grade the wrong thing.
    host.imports.forEach((_, i) => rmSync(join(into, host.name, shimName(i)), { force: true }));
    return { host: host.name, commit, files, excluded };
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}
