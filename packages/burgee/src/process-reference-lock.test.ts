import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Lock for the seam (design R1 of `cli-testing-harness`): in each package exactly one
 * file may name `process`, and everything else reads the `Runtime` or the live `host`
 * that file exports — which is what lets a test substitute the world.
 */
const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * burgee is down to one entry (PLAN 4.3, Y9). It used to carry nine, and the eight that
 * went are worth naming, because most of them looked load-bearing:
 *
 * - `execute.ts`, the execution core that owns argv, the streams and the exit — all of it
 *   already injectable through `RunOptions`, so only the *defaults* named the process.
 * - `commander/command.ts` and the four yargs files (`yargs/shim.ts`, `yargs-parser.ts`,
 *   `yargs/utils.ts`, `yargs/cliui.ts`). These reproduce their incumbents' process
 *   contracts and the incumbents' own suites grade exactly that, so the seam they went
 *   behind had to stay *live*: `host` is getters, not a captured object literal. Measured
 *   before and after the move, commander 1360/1360 and yargs 804/804, unchanged.
 * - `testing-helpers.ts`, the harness's documented env swap. It still mutates the real env
 *   in place — that is the whole point of it — but it reaches that env through `host`.
 * - `dev.ts`, which was simply stale: it contains no `process` read at all. Its entry had
 *   outlived the code that earned it, which is the failure mode an allow-list invites.
 */
const ALLOWED = new Set([
  // One entry per package, each named `runtime.ts` — PLAN 4.3 (Y9). The long notes that used
  // to sit here, recording what each façade read from the process and which of those reads its
  // incumbent's suite actually graded, moved into the seams themselves: the reasoning belongs
  // beside the code it constrains, not in the list of exceptions it is no longer an exception
  // to. `git log -- packages/burgee/src/process-reference-lock.test.ts` has them.
  //
  // `seniority`, `linegauge`, `closeout`, `bellpull` and `caique`'s other files are absent
  // because they name the process nowhere. That is the stronger claim, and it is the one
  // seniority's own `shape.test.ts` makes (R11): a package that takes `env`, `cwd` and `argv`
  // as arguments has already done what a seam is for.
  'burgee/src/runtime.ts',
  'paratext/src/runtime.ts',
  'flagstaff/src/runtime.ts',
  'roundel/src/runtime.ts',
  'caique/src/runtime.ts',
  // compat-oracle is internal tooling — `private: true`, never published, not one of the nine
  // layers. Its three entries are each the job of owning a process rather than a lapse into
  // one: `bin.ts` is a CLI entry, `run.ts` spawns the host suites and needs `execPath`, and
  // `shim.ts` is *copied into the vendored package's own module graph*, where an import of
  // anything in this repository would not resolve. The last of those cannot go behind a seam
  // at all, which is why the step counts published packages.
  'compat-oracle/src/shim.ts',
  'compat-oracle/src/bin.ts',
  'compat-oracle/src/run.ts',
]);
/**
 * The bare global, or the same global reached through `globalThis` — and nothing else.
 * `shim.process.exit` is a member of the yargs platform-shim object, which is precisely the
 * seam this lock wants code to go through, so a `.process` on some other receiver stays
 * legal. `globalThis.process` is not some other receiver: it is the process, spelled the
 * long way, and before 2026-09-08 the `(?<![.\w])` lookbehind let it through — which meant
 * any module in any package could read `globalThis.process.env.X` and stay green. Optional
 * chaining (`process?.env`, `globalThis.process?.env`) is a read like any other.
 */
const PROCESS_READ = /(?:(?<=\bglobalThis\.)|(?<![.\w]))process\??\.(env|argv|exit|exitCode|stdout|stderr|stdin|cwd)\b/;

/**
 * The other two ways to reach the process, neither of which `PROCESS_READ` can see.
 *
 * The seams themselves showed this up. `flagstaff/src/runtime.ts` reads the world through
 * `import process from 'node:process'` and `roundel/src/runtime.ts` through a guarded
 * `(globalThis as { process?: … }).process` bound to a local — and **both files pass the
 * pattern above untouched**. Their being on the allow-list is a statement of intent, not
 * something the lock was enforcing.
 *
 * Which means any file in any package could have done the same and stayed green: bind the
 * global once, then read `proc.env` forever, because the member read is now on a local whose
 * name a textual pattern cannot distinguish from any other. That is the same hole the
 * `globalThis.` lookbehind closed in 2026-09-08, reopened through a different door.
 *
 * So the *binding* is what is caught here, wherever the process is bound from. The allow-list
 * governs both patterns, so the five seams stay legal and nothing else can copy them.
 */
const PROCESS_BIND = /(?:from\s*['"]node:process['"]|require\(\s*['"]node:process['"]\s*\)|\bglobalThis\s*(?:as[^)]*)?\)?\s*\.\s*process\b)/;

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

/**
 * The one other file allowed to name the process, per package: the program `package.json`
 * declares as its `bin`. Derived, not listed — the note above says an allow-list's failure mode
 * is an entry that outlives the code that earned it, and one read from `bin` cannot. Every plugin
 * host grew a `check` command on 2026-09-22 and each is a ten-line `cli.ts` that hands argv, a
 * writer and an exit code to a pure `check.ts`; a command line owns its process by definition.
 */
function binSources(pkg: string): Set<string> {
  let manifest: { bin?: Record<string, string> | string };
  try {
    manifest = JSON.parse(readFileSync(join(PACKAGES, pkg, 'package.json'), 'utf-8')) as { bin?: Record<string, string> | string };
  } catch {
    return new Set();
  }
  const targets = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});
  return new Set(targets.map((t) => `${pkg}/src/${t.replace('./dist/', '').replace(/\.js$/u, '.ts')}`));
}

/** A file that may name the process: a package's runtime seam, or the program it declares. */
const ownsProcess = (pkg: string, rel: string): boolean => ALLOWED.has(rel) || binSources(pkg).has(rel);

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
        if (ownsProcess(pkg.name, rel)) continue;
        // CRLF checkouts (Windows) would otherwise leave a \r that stops the comment-stripping regex.
        const lines = readFileSync(f, 'utf-8').split(/\r?\n/);
        lines.forEach((line, i) => {
          // Comments, then string literals. The second was added 2026-09-14: closeout's
          // `exit-hook` façade carries the incumbent's own warning text verbatim — "use
          // gracefulExit() instead of process.exit()" — and three lines of a *message*
          // tripped a lock about *calls*. A checker that reads printed source and not the
          // shape is the defect this repository has caught in itself before; quoted spans are
          // not code, so they are removed before the pattern ever sees them.
          const code = line
            .replace(/\/\/.*$/, '')
            .replace(/'(?:[^'\\]|\\.)*'/g, "''")
            .replace(/"(?:[^"\\]|\\.)*"/g, '""')
            .replace(/`(?:[^`\\$]|\\.)*`/g, '``');
          const isComment = /^\s*(\*|\/\*)/.test(line);
          // `PROCESS_BIND` needs the string literals `code` has just blanked — an import
          // specifier *is* one — so it gets its own stripping: trailing `//` comments go, quoted
          // spans stay. It caught `chalk.ts:216` on the first run, which is a **comment** saying
          // where the cast it used to hold has moved to. A checker that reads printed source and
          // not shape is the defect this file already carries a paragraph about; catching it in
          // the check itself, on the day the check was written, is the argument for the paragraph.
          const uncommented = line.replace(/\/\/.*$/, '');
          if (!isComment && (PROCESS_READ.test(code) || PROCESS_BIND.test(uncommented))) {
            offenders.push(`${rel}:${i + 1}`);
          }
        });
      }
    }
    expect(offenders, 'read the Runtime instead').toEqual([]);
  });

  // The lock is only as good as its pattern, so the pattern gets its own row-by-row test.
  // Every `caught` line failed to match before 2026-09-08 and would have shipped a process
  // read past the seam; every `ignored` line is the member access the lookbehind exists for.
  it.each([
    'const level = process.env["FORCE_COLOR"];',
    'const argv = process.argv.slice(2);',
    'const argv = process?.argv;',
    'globalThis.process.env.COMPAT_TARGET = "burgee";',
    'const env = globalThis.process.env;',
    'const env = globalThis.process?.env ?? {};',
    'globalThis.process.exit(1);',
    'if (globalThis.process.stdout.isTTY) redraw();',
  ])('catches %j', (line) => {
    expect(PROCESS_READ.test(line)).toBe(true);
  });

  // The binding pattern gets the same treatment, for the same reason: both of these were
  // proven against a real file in `linegauge/src`, a package with no allow-list entry, and both
  // were green before `PROCESS_BIND` existed.
  it.each([
    "import process from 'node:process';",
    'import process from "node:process";',
    "import { env } from 'node:process';",
    "const { env } = require('node:process');",
    'const proc = (globalThis as { process?: Proc }).process;',
    'const proc = globalThis.process;',
  ])('catches the binding %j', (line) => {
    expect(PROCESS_BIND.test(line)).toBe(true);
  });

  it.each([
    "import { readFileSync } from 'node:fs';",
    'const preprocess = { env: {} };',
    "// the guarded `globalThis.process` cast that used to sit here moved to `./runtime.js`",
  ])('leaves the non-binding %j alone', (line) => {
    // The comment case is the one that matters: it was the first thing the new pattern caught,
    // and it was a line of prose. Comments are stripped before the pattern sees them.
    expect(PROCESS_BIND.test(line.replace(/\/\/.*$/, ''))).toBe(false);
  });

  it.each([
    'shim.process.exit(code);',
    'rt.process.env;',
    'const { env } = options.process;',
    'this.process.argv;',
    'const preprocess = { env: {} };',
    'notglobalThis.process.env;',
    'const p = globalThis.processes.env;',
  ])('leaves %j alone', (line) => {
    expect(PROCESS_READ.test(line)).toBe(false);
  });
});
