import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Lock for the seam (design R1 of `cli-testing-harness`): the only files in any
 * package that may read `process` are `runtime.ts` (the real runtime),
 * `testing-helpers.ts` (the harness's documented env swap) and `execute.ts` (the
 * execution core, whose job is to own argv, the streams and the exit).
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
  'burgee/src/execute.ts',
  // The commander front-end reproduces commander's process contract — process.argv
  // when parse() is called bare, process.exit when no exitOverride is set, the env for
  // Option.env(), stdout/stderr as the default output configuration. That contract is
  // what commander's own suite grades (C1); `parse(argv, { stdout, stderr, exit })`
  // is the injectable seam for everything else.
  'burgee/src/commander-command.ts',
  // The yargs front-end reproduces yargs' process contract the same way, through one
  // platform shim (yargs-shim.ts: argv, cwd, exit, env, columns), its parser's Node
  // mixin (yargs-parser.ts: cwd, env, require), hideBin/getProcessArgvBin and
  // setBlocking (yargs-utils.ts), and cliui's terminal width fallback (yargs-cliui.ts).
  // yargs' own suite swaps process.argv/exit/env per test and grades exactly that.
  'burgee/src/yargs-shim.ts',
  'burgee/src/yargs-parser.ts',
  'burgee/src/yargs-utils.ts',
  'burgee/src/yargs-cliui.ts',
  // `burgee dev` is a developer tool that owns the process's stdio by definition: the CLI
  // hands it the Runtime's streams, and `load()` imports the entry as a fresh module graph,
  // which only the real module loader can do. Dev-time only, never reached by the framework.
  'burgee/src/dev.ts',
  // The one line the whole compatibility gate turns on: it reads COMPAT_TARGET to
  // decide which implementation the vendored suites grade.
  'compat-oracle/src/shim.ts',
  // The oracle's own CLI entry. Internal tooling, never published; report.ts takes a
  // writer so this is the only file in that package that names the process.
  'compat-oracle/src/bin.ts',
  // Spawns the host's own suite in a child process, which needs execPath and an env
  // carrying COMPAT_TARGET. A test runner exists to launch processes; internal, never
  // published.
  'compat-oracle/src/run.ts',
]);
// The bare global only: `shim.process.exit` is a member of the yargs platform-shim object,
// which is precisely the seam this lock wants code to go through.
const PROCESS_READ = /(?<![.\w])process\.(env|argv|exit|exitCode|stdout|stderr|stdin|cwd)\b/;

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
        // POSIX separators on every OS: the allow-list is written with them.
        const rel = relative(PACKAGES, f).split(sep).join('/');
        if (ALLOWED.has(rel)) continue;
        // CRLF checkouts (Windows) would otherwise leave a \r that stops the comment-stripping regex.
        const lines = readFileSync(f, 'utf-8').split(/\r?\n/);
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
