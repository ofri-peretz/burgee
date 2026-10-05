/**
 * controlroom R17 and R22 — the Ink ecosystem, and a whole Ink app, run unchanged on
 * `controlroom/ink` through one documented package.json line.
 *
 * `examples/ink-ecosystem` installs `ink-spinner`, `ink-text-input` and `ink-select-input` from
 * npm as published; `examples/chat-cli-ink` is `examples/chat-cli` written for Ink. Each resolves
 * `'ink'` with `"ink": "file:./ink"` — a two-line package that re-exports `controlroom/ink`,
 * versioned at the ink API it implements so every component's peer range on ink is met and npm
 * installs no other ink (D-20261005-controlroom-ink-alias says why a bare `npm:` alias cannot do
 * it). Each one's own `node --test` checks that every `'ink'` it reaches is the drop-in, and then
 * what each component draws and reports.
 *
 * **They are installed the way a user installs them: alone.** Neither is a workspace (the root
 * `workspaces` excludes both), because in a monorepo a package named `ink` that is not ink
 * poisons hoisting — measured 2026-10-05: with `examples/ink-ecosystem` a workspace, npm 11.16
 * linked the root `node_modules/ink` to its shim and **dropped the real ink 6.8.0 the benchmarks
 * declare**, since a link versioned 6.8.0 satisfies `"ink": "6.8.0"`, so B4 and B2 would have
 * measured the drop-in against itself. So this lock does what the independence install does:
 * packs `controlroom` and its in-family closure from this tree, gives each example those
 * tarballs, installs it into an empty directory, and runs its tests there. The registry packages
 * (the three components, React, the reconciler) come from npm, as the oracle's suites do.
 *
 * It reads `dist/`, so it needs the packages built, as the independence install does.
 */
import { execFile, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** One pack of seven packages, two installs from the registry, and two `node --test` runs. */
const SETUP_TIMEOUT_MS = 300_000;

/** `controlroom` and the in-family packages it declares, which the registry does not have at this version. */
const FAMILY = ['controlroom', 'caique', 'closeout', 'flagstaff', 'linegauge', 'paratext', 'roundel'];

/** The line under test, as each example's package.json and controlroom's README write it. */
const LINE = '"ink": "file:./ink"';

/**
 * Each example and the number of cases its `node --test` must pass, so a test file that stopped
 * being found reads as a failure here rather than as zero failures.
 */
const EXAMPLES = [
  { dir: 'examples/ink-ecosystem', cases: 7 },
  { dir: 'examples/chat-cli-ink', cases: 12 },
] as const;

/** npm, without assuming a POSIX shell — the reasoning is `pack-list-lock.test.ts`'s. */
const NPM_CLI = process.env['npm_execpath'];
const WINDOWS = process.platform === 'win32';
function npm(args: string[], cwd: string): Promise<{ stdout: string }> {
  const io = { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 } as const;
  if (NPM_CLI?.endsWith('npm-cli.js') === true) return run(process.execPath, [NPM_CLI, ...args], io);
  return run(WINDOWS ? 'npm.cmd' : 'npm', args, { ...io, shell: WINDOWS });
}

/** Deleting two installs goes to a detached process, as the independence install's does. */
function discard(dir: string): void {
  spawn(process.execPath, ['-e', 'require("node:fs").rmSync(process.argv[1], { recursive: true, force: true })', dir], { detached: true, stdio: 'ignore' }).unref();
}

interface Outcome {
  /** Where `node_modules/ink` lands in the install: the example's own shim, or the path of whatever npm put there. */
  ink: string;
  code: number;
  pass: number;
  fail: number;
  output: string;
}

/** Copy one example out, point its in-family dependencies at this tree's tarballs, install it alone, run its tests. */
async function installAndTest(example: string, tarballs: Map<string, string>, base: string): Promise<Outcome> {
  const dir = join(base, example.replace('examples/', ''));
  cpSync(join(root, example), dir, { recursive: true, filter: (from) => !from.includes('node_modules') });
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  for (const [name, file] of tarballs) manifest.dependencies[name] = `file:${file}`;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  await npm(['install', '--no-package-lock', '--no-audit', '--no-fund', '--prefer-offline', '--ignore-scripts', '--silent'], dir);
  const installed = realpathSync(join(dir, 'node_modules', 'ink'));
  const ink = installed === realpathSync(join(dir, 'ink')) ? 'the shim' : installed;
  let code = 0;
  let output = '';
  try {
    ({ stdout: output } = await run(process.execPath, ['--test', '--test-reporter=tap'], { cwd: dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    code = typeof err.code === 'number' ? err.code : 1;
    output = err.stdout ?? String(e);
  }
  const count = (label: string): number => Number(new RegExp(`^# ${label} (\\d+)$`, 'mu').exec(output)?.[1] ?? Number.NaN);
  return { ink, code, pass: count('pass'), fail: count('fail'), output };
}

describe('the examples that alias ink are installed alone, never as workspaces', () => {
  const workspaces = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { workspaces: string[] }).workspaces;

  it.each(EXAMPLES.map((e) => e.dir))('%s is excluded from the root workspaces', (dir) => {
    expect(workspaces).toContain('examples/*');
    expect(workspaces).toContain(`!${dir}`);
  });

  it.each(EXAMPLES.map((e) => e.dir))('%s resolves ink with the documented line', (dir) => {
    expect(readFileSync(join(root, dir, 'package.json'), 'utf8')).toContain(LINE);
    expect(readFileSync(join(root, dir, 'ink', 'index.js'), 'utf8')).toBe("export * from 'controlroom/ink';\n");
  });

  it("controlroom's README documents the same line, in its Migrating section", () => {
    const readme = readFileSync(join(root, 'packages/controlroom/README.md'), 'utf8');
    const migrating = readme.slice(readme.indexOf('## Migrating'), readme.indexOf('\n## ', readme.indexOf('## Migrating') + 1));
    expect(migrating).toContain(LINE);
    expect(migrating).toContain("export * from 'controlroom/ink';");
  });
});

describe('R17 and R22 — installed alone, each example runs its own checks on controlroom/ink', () => {
  let base: string;
  const outcomes = new Map<string, Outcome>();

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'burgee-ink-alias-'));
    const packs = join(base, 'tarballs');
    mkdirSync(packs);
    const { stdout } = await npm(['pack', '--json', '--pack-destination', packs, ...FAMILY.map((name) => `--workspace=packages/${name}`)], root);
    const tarballs = new Map((JSON.parse(stdout) as { name: string; filename: string }[]).map((p) => [p.name, join(packs, p.filename)]));
    // One after the other: two registry installs at once are what the endpoint scanner punishes.
    // eslint-disable-next-line reliability/no-await-in-loop -- sequential on purpose, for the reason above
    for (const { dir } of EXAMPLES) outcomes.set(dir, await installAndTest(dir, tarballs, base));
  }, SETUP_TIMEOUT_MS);

  afterAll(() => discard(base));

  describe.each(EXAMPLES)('$dir', ({ dir, cases }) => {
    const outcome = (): Outcome => {
      const o = outcomes.get(dir);
      if (o === undefined) throw new Error(`${dir} was not installed`);
      return o;
    };

    it('installs no ink but the shim', () => {
      expect(outcome().ink).toBe('the shim');
    });

    it(`passes all ${String(cases)} of its own cases`, () => {
      const { code, pass, fail, output } = outcome();
      expect({ code, pass, fail }, output).toEqual({ code: 0, pass: cases, fail: 0 });
    });
  });
});
