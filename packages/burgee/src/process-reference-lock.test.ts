import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Lock for the seam (design R1 of `cli-testing-harness`): the only files in any
 * package that may read `process` are `runtime.ts` (the real runtime),
 * `testing-helpers.ts` (the harness's documented env swap) and `index.ts` (the
 * framework entry, whose job is to own argv, the streams and the exit).
 * Everything else reads its
 * `Runtime`, which is what lets a test substitute the world.
 */
const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * burgee/src/index.ts is the third: it is the framework's entry, and a CLI
 * framework's whole job is to own argv, the streams and the exit. Every one of
 * those is injectable through RunOptions, so tests never reach the real process;
 * the defaults are the only place the real one is named.
 */
const ALLOWED = new Set([
  'burgee/src/runtime.ts',
  'burgee/src/testing-helpers.ts',
  'burgee/src/index.ts',
]);
const PROCESS_READ = /\bprocess\.(env|argv|exit|exitCode|stdout|stderr|stdin|cwd)\b/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      sourceFiles(p, out);
    } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && p.includes(`${join(dir, '')}`)) {
      out.push(p);
    }
  }
  return out;
}

describe('process references stay behind the Runtime seam', () => {
  it('no layer source reads process.* outside the three files that own it', () => {
    const offenders: string[] = [];
    for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const src = join(PACKAGES, pkg.name, 'src');
      let files: string[];
      try {
        files = sourceFiles(src);
      } catch {
        continue;
      }
      for (const f of files) {
        const rel = relative(PACKAGES, f);
        if (ALLOWED.has(rel)) continue;
        const lines = readFileSync(f, 'utf-8').split('\n');
        lines.forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '');
          const isComment = /^\s*(\*|\/\*)/.test(line);
          if (PROCESS_READ.test(code) && !isComment) {
            offenders.push(`${rel}:${i + 1}`);
          }
        });
      }
    }
    expect(offenders, 'read the Runtime instead').toEqual([]);
  });
});
