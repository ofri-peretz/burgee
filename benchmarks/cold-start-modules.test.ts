/**
 * Lock — what a B2 cold-start fixture loads before it prints, by name.
 *
 * B2's `burgee ÷ cac` went 1.322 → 1.559 between 2026-09-09 and 2026-10-08, and the band only
 * said so a month later, because a timing ratio moves 0.02 between two runs of one commit and a
 * step of 0.05 hides inside a few of those. What moved was not a timing at all. The `burgee`
 * fixture loaded **13 modules** on 2026-09-09 and **27** on 2026-10-08, for 2.5 KB more source:
 *
 *   - `0750ebc` precedence from `seniority` (+2 at the time, one package boundary)
 *   - `3ea38c3` E5/O5 through `closeout`'s barrel (+8; `linegauge` came too and went lazy later)
 *   - `08976ae` `ctx.interactive` from `roundel/terminal` (+2, on the dispatch path)
 *   - and `burgee/commander` went 16 → 24 in `61c51f9`, `bellpull/cross-spawn`'s graph.
 *
 * Each was a decision with a reason, and none of them was a decision about start-up, because
 * nothing put the module list in front of the PR that grew it. Every ES module costs a resolve,
 * a package-scope lookup, a compile and a link whatever its size: an interleaved A/B on
 * 2026-10-09 measured the 13 → 27 step as **+6.2 ms of CPU per run**, matching CI's +6.3 ms, and
 * in a simulation folding three of closeout's eight files into one recovered 0.7 ms of it alone.
 *
 * So the list is locked the way `weight.test.ts` locks bytes: a module joining or leaving the
 * start-up path of either fixture fails here, and the PR that wants it updates the list below —
 * where a reviewer sees the cost was chosen. It is the exact set, not a count: a count lets one
 * module in for each one that leaves, and the trade is the thing to look at.
 *
 * The second half pins what the builtin imports cost. An ES `import` of `node:util` or `node:fs`
 * builds a namespace over every export and pulls ~24 Node internals with it (`worker_threads`,
 * `fs/promises`, `readline`); burgee reads both through `process.getBuiltinModule` in its
 * `runtime.ts` seam instead (4% of the process, measured). The markers below are the internals
 * only that namespace build loads, so a new `import … from 'node:fs'` on the core path fails here.
 *
 * Deterministic: it is the module graph, read by a `module.registerHooks` load hook — the
 * recorder `scripts/independence-install-lock.test.ts` uses — not a clock.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(HERE, 'fixtures', 'cold-start');

/** Spawning is slow on a Windows runner; this asserts what loads, never how fast. */
const SPAWN_TIMEOUT_MS = 120_000;

/**
 * Records every module the load hook sees and Node's own internal load list, on the way out.
 * Its own builtins come through `getBuiltinModule` too: an ES `import … from 'node:fs'` here
 * would load the very markers the last case looks for, in every spawn, and that case could
 * never fail.
 */
const RECORDER = `const { registerHooks } = process.getBuiltinModule('node:module');
const { writeFileSync } = process.getBuiltinModule('node:fs');
const loaded = [];
registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url);
    return nextLoad(url, context);
  },
});
process.on('exit', () => writeFileSync(process.env.STARTUP_OUT, JSON.stringify({ loaded, internals: process.moduleLoadList })));
`;

interface Startup {
  /** Every non-builtin module, as `<package>/<path under dist>`, or `fixture:<file>`. */
  modules: string[];
  /** Node internals loaded beyond what a bare `node` fixture loads. */
  internals: string[];
}

const dir = mkdtempSync(join(tmpdir(), 'startup-'));
const recorder = join(dir, 'recorder.mjs');
writeFileSync(recorder, RECORDER);

/** A dist file named by its package, so a workspace symlink and an npm install read the same. */
function named(url: string): string {
  const m = /\/(?:packages|node_modules)\/((?:@[^/]+\/)?[^/]+)\/dist\/(.+)$/.exec(url);
  return m === null ? `fixture:${url.slice(url.lastIndexOf('/') + 1)}` : `${m[1] ?? ''}/${m[2] ?? ''}`;
}

function startup(fixture: string): Startup & { raw: string[] } {
  const out = join(dir, `${fixture}.json`);
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(recorder).href, join(FIXTURES, `${fixture}.mjs`), 'greet', 'ada'], {
    cwd: HERE,
    encoding: 'utf8',
    env: { ...process.env, STARTUP_OUT: out },
  });
  expect(r.stderr, `${fixture} wrote to stderr`).toBe('');
  expect(r.stdout).toBe('Hello, ada!\n');
  const { loaded, internals } = JSON.parse(readFileSync(out, 'utf8')) as { loaded: string[]; internals: string[] };
  const files = loaded.filter((u) => !u.startsWith('node:'));
  return { modules: files.map(named).sort(), internals, raw: files };
}

const floor = (): string[] => startup('node').internals;

/**
 * The start-up path of `fixtures/cold-start/burgee.mjs` — `import { run } from 'burgee'` and
 * one `greet ada` — on 2026-10-09. Sixteen of burgee's own, `closeout`'s barrel (E5, O5: the run
 * owns the process, so its exits are bound before the handler runs), `seniority/precedence`
 * (V-family, every invocation) and `roundel/terminal` (`ctx.interactive`, loaded on dispatch).
 */
const CORE = [
  'burgee/agent.js',
  'burgee/argv.js',
  'burgee/ctx.js',
  'burgee/define-error.js',
  'burgee/definition.js',
  'burgee/errors.js',
  'burgee/execute.js',
  'burgee/exit-code.js',
  'burgee/index.js',
  'burgee/manifest.js',
  'burgee/names.js',
  'burgee/pkg.js',
  'burgee/plugin.js',
  'burgee/runtime.js',
  'burgee/shutdown.js',
  'burgee/validate.js',
  'closeout/ambient.js',
  'closeout/cursor.js',
  'closeout/deadline.js',
  'closeout/index.js',
  'closeout/install.js',
  'closeout/once.js',
  'closeout/registry.js',
  'closeout/report.js',
  'fixture:burgee.mjs',
  'roundel/terminal.js',
  'seniority/precedence.js',
];

/**
 * `fixtures/cold-start/burgee-commander.mjs`. `bellpull/cross-spawn` is nine of these and cannot
 * go lazy: `parse()` is synchronous and commander's own suite mocks the spawn inside it (D-102).
 */
const COMMANDER = [
  'bellpull/ambient.js',
  'bellpull/cross-spawn.js',
  'bellpull/enoent.js',
  'bellpull/escape.js',
  'bellpull/executable.js',
  'bellpull/runtime.js',
  'bellpull/shebang.js',
  'bellpull/spawn-args.js',
  'bellpull/which.js',
  'burgee/commander.js',
  'burgee/commander/argument.js',
  'burgee/commander/command.js',
  'burgee/commander/error.js',
  'burgee/commander/help.js',
  'burgee/commander/option.js',
  'burgee/definition.js',
  'burgee/errors.js',
  'burgee/exit-code.js',
  'burgee/facade-failure.js',
  'burgee/manifest.js',
  'burgee/names.js',
  'burgee/plugin.js',
  'burgee/runtime.js',
  'burgee/schema.js',
  'burgee/suggest.js',
  'fixture:burgee-commander.mjs',
];

/**
 * Internals that only an ES import's namespace build loads: `node:util`'s pulls the worker and
 * diff machinery, `node:fs`'s pulls `fs/promises` and, through `FileHandle.readLines`, readline.
 * None of them is anything `greet ada` calls.
 */
const NAMESPACE_MARKERS = ['NativeModule worker_threads', 'NativeModule internal/util/diff', 'NativeModule internal/fs/promises', 'NativeModule internal/readline/interface'];

const CHANGED = 'the start-up module list changed: each ES module is 0.2-0.4 ms of CPU on every run of every program. If the change is wanted, update the list in this file and say what it bought in the PR';

describe('B2 start-up path, by module', () => {
  it(
    "`import 'burgee'` and one command load exactly the locked list",
    () => {
      const { modules, raw } = startup('burgee');
      // One proof the normaliser saw real dist files, so an empty match cannot pass as a list.
      expect(raw.some((u) => u.includes('/dist/execute.js'))).toBe(true);
      expect(modules, CHANGED).toEqual(CORE);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "`import { Command } from 'burgee/commander'` and one command load exactly the locked list",
    () => {
      expect(startup('burgee-commander').modules, CHANGED).toEqual(COMMANDER);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'the core path builds no builtin namespace: node:util and node:fs come through process.getBuiltinModule',
    () => {
      const base = new Set(floor());
      const extra = startup('burgee').internals.filter((m) => !base.has(m));
      // The markers exist on this Node: an ES import of each builtin does load them.
      const probe = spawnSync(process.execPath, ['--input-type=module', '-e', "import 'node:util'; import 'node:fs'; process.stdout.write(JSON.stringify(process.moduleLoadList))"], { encoding: 'utf8' });
      const imported = new Set(JSON.parse(probe.stdout) as string[]);
      for (const marker of NAMESPACE_MARKERS) expect(imported.has(marker), `${marker} is no longer what an ES import of a builtin loads — re-derive the markers`).toBe(true);
      expect(extra.filter((m) => NAMESPACE_MARKERS.includes(m)), 'an ES import of node:util or node:fs is back on the start-up path; read it through runtime.ts `builtin()`').toEqual([]);
    },
    SPAWN_TIMEOUT_MS,
  );
});
