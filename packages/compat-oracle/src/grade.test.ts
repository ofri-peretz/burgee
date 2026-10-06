/**
 * `grade()` end to end, on make-believe hosts vendored into a scratch directory.
 *
 * The grade is the published number, so these pin what reaches it: the shims a run writes
 * (control vs target, ESM vs CJS, public vs internal), the exact command each runner is
 * started with and the environment it inherits, how a run that dies is told apart from one
 * that fails, and what the counts come out as.
 *
 * Three runners are driven for real — node:test, node-tap and exit-code need nothing but
 * `node`, so the counts below are the counts a real child printed. The others (mocha, ava,
 * vitest) and every failure to *start* a suite go through a fake `execFileSync` that records
 * the call and answers with canned output: the argv is the thing under test there, and a
 * real spawn would add minutes and nothing a reader could check. `npm install` only ever
 * reaches the fake.
 *
 * The scratch directory sits inside this package, not under the OS temp dir, because a
 * control run resolves the incumbent the way the vendored tree does — by walking up to the
 * workspace's `node_modules`.
 */
import { type ExecFileSyncOptions } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Host } from './hosts.js';
import { ALIAS_HOOK, aliasHook, cjsLoad, entryBody, grade, installSuiteDeps, internalShimBody, jestGlobals, peerHook, readBaseline, targetInternalBody } from './run.js';

interface Call {
  file: string;
  args: string[];
  options: ExecFileSyncOptions & { env: NodeJS.ProcessEnv };
}

/** The real `execFileSync`, past the seam: the peer hook's child is this test's own, not a runner's. */
const realExec = (await vi.importActual<typeof import('node:child_process')>('node:child_process')).execFileSync;

const seam = vi.hoisted(() => ({
  /** When set, every `execFileSync` goes here instead of spawning. */
  exec: undefined as undefined | ((call: { file: string; args: string[]; options: unknown }) => string),
  calls: [] as { file: string; args: string[]; options: unknown }[],
  /** When set, `symlinkSync` throws — the platform that refuses a link. */
  refuseLinks: false,
}));

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return {
    ...real,
    execFileSync: (file: string, args: string[], options: unknown) => {
      seam.calls.push({ file, args, options });
      if (seam.exec !== undefined) return seam.exec({ file, args, options });
      return real.execFileSync(file, args, options as ExecFileSyncOptions);
    },
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    symlinkSync: (...args: Parameters<typeof real.symlinkSync>) => {
      if (seam.refuseLinks) throw Object.assign(new Error('EPERM: operation not permitted, symlink'), { code: 'EPERM' });
      real.symlinkSync(...args);
    },
  };
});

const PKG = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** A workspace package's root: its entry, then up to the nearest manifest. */
function installed(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return dir;
}
/** The workspace's own copies, which a control run of these fake hosts resolves. */
const COMMANDER = installed('commander');
const AVA = installed('ava');
const MOCHA = installed('mocha');
const VITEST = installed('vitest');

let vendorDir: string;

beforeEach(() => {
  vendorDir = mkdtempSync(join(PKG, '.grade-'));
  seam.exec = undefined;
  seam.calls = [];
  seam.refuseLinks = false;
});

afterEach(() => {
  rmSync(vendorDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const host = (over: Partial<Host> = {}): Host => ({
  name: 'fake',
  repo: 'file:///nowhere',
  testDir: 'test',
  testGlob: '*.test.js',
  imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }],
  runner: 'node:test',
  target: 'fake',
  status: 'active',
  ...over,
});

interface Layout {
  pkg?: Record<string, unknown>;
  source?: Record<string, unknown>;
}

/** Vendor `files` under the host's test dir, the way `vendor()` leaves a directory. */
function vendored(h: Host, files: Record<string, string>, { pkg = { type: 'module' }, source }: Layout = {}): string {
  const hostDir = join(vendorDir, h.name);
  mkdirSync(join(hostDir, h.testDir), { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(hostDir, h.testDir, rel)), { recursive: true });
    writeFileSync(join(hostDir, h.testDir, rel), body);
  }
  writeFileSync(join(hostDir, 'package.json'), JSON.stringify(pkg));
  if (source !== undefined) writeFileSync(join(hostDir, '.source.json'), JSON.stringify(source));
  return hostDir;
}

const read = (...at: string[]): string => readFileSync(join(...at), 'utf8');
const SUMMARY = (tests: number, pass: number): string => `TAP version 13\n# tests ${tests}\n# pass ${pass}\n# fail ${tests - pass}\n`;
/** A fake runner that prints `output` and exits 0. */
const prints = (output: string) => () => output;
/** A child that exited non-zero, as `execFileSync` throws it. */
const dies = (fields: { stdout?: string; stderr?: string; status?: number | null; message?: string }) => (): never => {
  throw Object.assign(new Error(fields.message ?? 'Command failed'), fields);
};
/** A node-tap file: a program that prints its own TAP. */
const tapScript = (lines: string[]): string => `process.stdout.write(${JSON.stringify(`TAP version 14\n${lines.join('\n')}\n`)});`;
/** A host whose control is the workspace's commander, so the incumbent's own files are on disk. */
const incumbent = (over: Partial<Host> = {}): Host => host({ npmName: 'commander', ...over });
/** `npm install` succeeds silently; anything else is a runner printing one passing case. */
const npmThenSummary = ({ file }: { file: string }): string => (file === 'npm' ? '' : SUMMARY(1, 1));
const only = (): Call => {
  expect(seam.calls).toHaveLength(1);
  return seam.calls[0] as Call;
};

describe('a host that cannot be graded yet', () => {
  it('is an error when nothing is vendored, and says how to vendor it', () => {
    const g = grade(host(), vendorDir, 'fake', 7);
    expect(g).toEqual({ host: 'fake', target: 'fake', files: 0, tests: 0, passed: 0, failed: 0, skipped: 0, reference: 7, rate: 0, error: 'not vendored: run `npm run compat -- --vendor`' });
  });

  it('is an error when the test dir holds no file the glob calls a test', () => {
    vendored(host(), { 'helper.js': '' });
    expect(grade(host(), vendorDir, 'fake').error).toBe('no test files vendored');
  });

  it('is a note, not an error, when the target is not built — and names the first entry that is missing', () => {
    const h = host({ imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }, { upstream: '../x.js', subpath: '/no-such-entry', reexportDefault: false }] });
    vendored(h, { 'a.test.js': '' });
    // `vitest` resolves and `vitest/no-such-entry` does not: the note names the second.
    const g = grade(h, vendorDir, 'vitest');
    expect(g).toMatchObject({ reference: 0, passed: 0, note: 'target not built yet: vitest/no-such-entry' });
    expect(g.error).toBeUndefined();
    expect(seam.calls).toEqual([]);
  });
});

/** A TypeScript test file the TypeScript loader must load, holding a lock the other file checks. */
const typed = (name: string): string =>
  [
    "import test from 'node:test';",
    "import assert from 'node:assert';",
    "import { existsSync, rmSync, writeFileSync } from 'node:fs';",
    'enum Kind { One = 1 }',
    `test('${name}', async () => {`,
    "  assert.equal(existsSync('busy'), false);",
    "  writeFileSync('busy', '');",
    '  await new Promise((resolve) => setTimeout(resolve, 200));',
    "  rmSync('busy');",
    '  assert.equal(Kind.One, 1);',
    '});',
  ].join('\n');

describe('a node:test suite, run for real', () => {
  const suite = [
    "import test from 'node:test';",
    "import assert from 'node:assert';",
    "test('one', () => {});",
    "test('two', () => {});",
    "test('three', () => { assert.fail('no'); });",
    "test('four', { skip: true }, () => {});",
  ].join('\n');

  it('counts the passes, the failure and the skip as the runner reports them', () => {
    vendored(host(), { 'a.test.js': suite });
    // node:test counts the skip in `# tests` and not in `# pass`, so it comes off `tests` only.
    expect(grade(host(), vendorDir, 'fake', 5)).toEqual({ host: 'fake', target: 'fake', files: 1, tests: 3, passed: 2, failed: 1, skipped: 1, reference: 5, rate: 2 / 5 });
  });

  it('loads TypeScript through the declared loader, one file at a time when upstream asks', () => {
    // ink 8's `npm test` is `node --import=tsx --test --test-concurrency=1`. An `enum` is not
    // erasable, so Node's own type stripping refuses the file: it loads only through `tsx`.
    // The two files share a lock the first holds for 200 ms, so they agree only when run serially.
    const h = host({ testGlob: '*.test.ts', tsLoader: 'tsx', testConcurrency: 1, suiteTimeoutMs: 120_000 });
    vendored(h, { 'a.test.ts': typed('a'), 'b.test.ts': typed('b') });
    expect(grade(h, vendorDir, 'fake', 2)).toMatchObject({ files: 2, tests: 2, passed: 2, failed: 0 });
    // Without the loader, the same files do not load at all.
    expect(grade(host({ testGlob: '*.test.ts' }), vendorDir, 'fake', 2)).toMatchObject({ passed: 0 });
  });

  it('grades internal-only files on their own line, outside the gate', () => {
    vendored(host(), { 'a.test.js': "import test from 'node:test';\ntest('a', () => {});\n", 'internal.test.js': suite }, { source: { internalFiles: ['internal.test.js'] } });
    const g = grade(host(), vendorDir, 'fake', 1);
    expect(g).toMatchObject({ files: 1, tests: 1, passed: 1, rate: 1, internals: { files: 1, tests: 3, passed: 2 } });
  });
});

describe('the exit-code runner, for a suite with nothing to parse', () => {
  it('grades the whole suite as one bit, and fails it if any file exits non-zero', () => {
    const h = host({ runner: 'exit-code' });
    vendored(h, { 'a.test.js': 'process.exit(0);\n', 'b.test.js': "throw new Error('assert');\n" });
    expect(grade(h, vendorDir, 'fake', 1)).toEqual({ host: 'fake', target: 'fake', files: 2, tests: 1, passed: 0, failed: 1, skipped: 0, reference: 1, rate: 0, mode: 'exit-code' });
  });

  it('passes the bit when every file exits 0', () => {
    const h = host({ runner: 'exit-code' });
    vendored(h, { 'a.test.js': 'console.log({ a: 1 });\n' });
    expect(grade(h, vendorDir, 'fake', 1)).toMatchObject({ tests: 1, passed: 1, failed: 0, rate: 1, mode: 'exit-code' });
  });

  it('is an error, not a failure, when a file could not be started at all', () => {
    const h = host({ runner: 'exit-code', env: { FROM_HOST: '1' } });
    vendored(h, { 'a.test.js': '' });
    seam.exec = dies({ status: null, message: `spawn ENOENT ${'x'.repeat(300)}` });
    const g = grade(h, vendorDir, 'fake', 1);
    expect(g).toMatchObject({ files: 1, passed: 0, error: `a.test.js: spawn ENOENT ${'x'.repeat(200 - 'spawn ENOENT '.length)}` });
    expect(g.mode).toBeUndefined();
    const call = only();
    expect(call.file).toBe(process.execPath);
    expect(call.args).toEqual([join(vendorDir, 'fake', 'test', 'a.test.js')]);
    expect(call.options).toMatchObject({ cwd: join(vendorDir, 'fake'), timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    expect(call.options.env).toMatchObject({ FROM_HOST: '1', COMPAT_TARGET: 'fake' });
  });
});

describe('the node-tap runner: one spawn per file', () => {
  it('reads the TAP a failing file printed before it exited non-zero, and adds the files up', () => {
    const h = host({ runner: 'tap' });
    vendored(h, { 'a.test.js': tapScript(['ok 1 - a', 'ok 2 - b', '1..2']), 'b.test.js': `${tapScript(['ok 1 - c', 'not ok 2 - d', '1..2'])}\nprocess.exitCode = 1;` });
    expect(grade(h, vendorDir, 'fake', 4)).toEqual({ host: 'fake', target: 'fake', files: 2, tests: 4, passed: 3, failed: 1, skipped: 0, reference: 4, rate: 0.75 });
  });

  it('is an error naming the file and the first line of stderr that is not a stack frame', () => {
    const h = host({ runner: 'tap', tsLoader: 'tsx' });
    vendored(h, { 'a.test.js': '' });
    seam.exec = dies({ stdout: '', stderr: '\n    at Object.<anonymous> (a.js:1:1)\nSyntaxError: Unexpected token\n' });
    expect(grade(h, vendorDir, 'fake').error).toBe('a.test.js: SyntaxError: Unexpected token');
    // The TypeScript preload comes before the file.
    expect(only().args.slice(0, 3)).toEqual(['--no-warnings', '--import', import.meta.resolve('tsx')]);
  });

  it('falls back to the spawn message, cut to the excerpt, when there is no output of either kind', () => {
    const h = host({ runner: 'tap' });
    vendored(h, { 'a.test.js': '' });
    seam.exec = dies({ message: 'y'.repeat(300) });
    expect(grade(h, vendorDir, 'fake').error).toBe(`a.test.js: ${'y'.repeat(300)}`.slice(0, 200));
  });
});

describe('the runner each host is started with', () => {
  it('starts mocha from the workspace with the TAP reporter and mocha’s own 2 s default', () => {
    const h = host({ runner: 'mocha' });
    vendored(h, { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    expect(grade(h, vendorDir, 'fake', 1)).toMatchObject({ passed: 1, rate: 1 });
    const dir = join(vendorDir, 'fake', 'test');
    expect(only().args).toEqual([join(MOCHA, 'bin', 'mocha.js'), '--reporter', 'tap', '--timeout', '2000', join(dir, 'a.test.js')]);
  });

  it('hands mocha the host’s timeout and preamble, and never grades the preamble as a file', () => {
    const h = host({ runner: 'mocha', timeoutMs: 5000, preamble: 'setup.test.js' });
    vendored(h, { 'a.test.js': '', 'setup.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    expect(grade(h, vendorDir, 'fake').files).toBe(1);
    const dir = join(vendorDir, 'fake', 'test');
    expect(only().args.slice(1)).toEqual(['--reporter', 'tap', '--timeout', '5000', '--require', join(dir, 'setup.test.js'), join(dir, 'a.test.js')]);
  });

  it('starts ava from the workspace with --tap', () => {
    const h = host({ runner: 'ava' });
    vendored(h, { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(h, vendorDir, 'fake');
    expect(only().args).toEqual([join(AVA, 'entrypoints', 'cli.js'), '--tap', join(vendorDir, 'fake', 'test', 'a.test.js')]);
  });

  it('starts the ava a host pins beside its suite, and finds a 6.x entry named cli.mjs', () => {
    const h = host({ runner: 'ava', suiteDeps: ['ava@6.4.1'] });
    const hostDir = vendored(h, { 'a.test.js': '' });
    const ava = join(hostDir, 'node_modules', 'ava');
    mkdirSync(join(ava, 'entrypoints'), { recursive: true });
    writeFileSync(join(ava, 'package.json'), JSON.stringify({ name: 'ava', version: '6.4.1', main: 'entrypoints/main.mjs' }));
    writeFileSync(join(ava, 'entrypoints', 'main.mjs'), '');
    writeFileSync(join(ava, 'entrypoints', 'cli.mjs'), '');
    seam.exec = prints(SUMMARY(1, 1));
    grade(h, vendorDir, 'fake');
    expect(realpathSync(only().args[0] as string)).toBe(realpathSync(join(ava, 'entrypoints', 'cli.mjs')));
  });

  it('starts vitest at the sub-package root with tap-flat, and writes the config the files come through', () => {
    const h = host({ runner: 'vitest', packageDir: 'packages/p', testDir: 'packages/p/test', vitestConfig: { snapshotSerializers: ['s'] } });
    const hostDir = vendored(h, { 'a.test.js': '', 'deep/b.test.js': '' });
    seam.exec = prints('ok 1 - a\nnot ok 2 - b\n1..2\n');
    expect(grade(h, vendorDir, 'fake', 2)).toMatchObject({ files: 2, tests: 2, passed: 1, failed: 1, rate: 0.5 });
    const root = join(hostDir, 'packages', 'p');
    expect(only().args).toEqual([join(VITEST, 'vitest.mjs'), 'run', '--root', root, '--reporter=tap-flat']);
    const config = read(root, 'vitest.config.mjs');
    expect(config).toContain(`test: { include: ["test/a.test.js", "test/deep/b.test.js"], globals: true, setupFiles: ['./vitest.setup.mjs'], snapshotSerializers: ["s"] } };`);
    expect(config).toContain('function hoistJestMocks(');
    expect(read(root, 'vitest.setup.mjs')).toBe(jestGlobals());
  });

  it('writes no extra config keys for a vitest host that declares none', () => {
    const h = host({ runner: 'vitest' });
    const hostDir = vendored(h, { 'a.test.js': '' });
    seam.exec = prints('ok 1 - a\n1..1\n');
    grade(h, vendorDir, 'fake');
    expect(read(hostDir, 'vitest.config.mjs')).toContain(`test: { include: ["test/a.test.js"], globals: true, setupFiles: ['./vitest.setup.mjs'] } };`);
  });

  it('runs every suite from the vendored root with the ambient colour removed and the host’s env on top', () => {
    vi.stubEnv('FORCE_COLOR', '3');
    vi.stubEnv('NO_COLOR', '1');
    vi.stubEnv('COLORTERM', 'truecolor');
    vi.stubEnv('TERM', 'xterm-256color');
    vi.stubEnv('KEPT', 'yes');
    vi.stubEnv('OVERRIDDEN', 'ambient');
    vi.stubEnv('COMPAT_TARGET', 'ambient');
    const h = host({ env: { TERM: 'dumb', OVERRIDDEN: 'host' } });
    vendored(h, { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(h, vendorDir, 'fake');
    const { options } = only();
    expect(options).toMatchObject({ encoding: 'utf8', cwd: join(vendorDir, 'fake'), stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    expect(options.env).toMatchObject({ KEPT: 'yes', TERM: 'dumb', OVERRIDDEN: 'host', COMPAT_TARGET: 'fake' });
    for (const gone of ['FORCE_COLOR', 'NO_COLOR', 'COLORTERM']) expect(options.env, gone).not.toHaveProperty(gone);
    expect(only().args).toEqual(['--test', '--test-reporter=tap', join(vendorDir, 'fake', 'test', 'a.test.js')]);
  });
});

describe('a suite that did not reach its summary', () => {
  it('keeps the output a failing runner printed', () => {
    vendored(host(), { 'a.test.js': '' });
    seam.exec = dies({ stdout: SUMMARY(2, 1), status: 1 });
    expect(grade(host(), vendorDir, 'fake', 2)).toMatchObject({ files: 1, tests: 2, passed: 1, failed: 1, rate: 0.5 });
  });

  it('is an error carrying the reason from stderr when the suite never started', () => {
    vendored(host(), { 'a.test.js': '' });
    seam.exec = dies({ stdout: '', stderr: '\n    at Module._resolveFilename (node:internal)\nError: Cannot find module\n    at x\n' });
    expect(grade(host(), vendorDir, 'fake', 3)).toMatchObject({ files: 1, tests: 0, passed: 0, reference: 3, error: 'Error: Cannot find module' });
  });

  it('falls back to the spawn message, cut to 200 characters, with no stdout or stderr at all', () => {
    vendored(host(), { 'a.test.js': '' });
    seam.exec = dies({ message: 'z'.repeat(300) });
    expect(grade(host(), vendorDir, 'fake').error).toBe('z'.repeat(200));
  });

  it('reports an internal run that could not start as nothing registered, and keeps the public grade', () => {
    vendored(host(), { 'a.test.js': '', 'i.test.js': '' }, { source: { internalFiles: ['i.test.js'] } });
    let n = 0;
    seam.exec = () => (n++ === 0 ? SUMMARY(1, 1) : dies({ stderr: 'boom' })());
    expect(grade(host(), vendorDir, 'fake', 1)).toMatchObject({ passed: 1, rate: 1, internals: { files: 1, tests: 0, passed: 0 } });
    expect(seam.calls).toHaveLength(2);
  });
});

describe('declared exclusions, on the control and on a target', () => {
  const excludes = [{ match: 'gone upstream', why: 'x' }];

  it('are a broken control when one matches no case — the control fixes the reference', () => {
    vendored(host({ excludes }), { 'a.test.js': '' });
    seam.exec = prints('ok 1 - a\n1..1\n');
    expect(grade(host({ excludes }), vendorDir, 'fake').error).toBe('exclusion matched no case: gone upstream');
  });

  it('are not required to match on a target run', () => {
    const h = host({ excludes, imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }] });
    vendored(h, { 'a.test.js': '' });
    seam.exec = prints('ok 1 - a\n1..1\n');
    expect(grade(h, vendorDir, 'vitest')).toMatchObject({ target: 'vitest', passed: 1, tests: 1 });
  });
});

describe('the shims a run writes', () => {
  const tap = prints(SUMMARY(1, 1));

  it('re-exports the control package, or its declared `control` entry, for the control run', () => {
    const h = host({ imports: [{ upstream: '../index.js', subpath: '', reexportDefault: true }, { upstream: '../x.js', subpath: '/x', reexportDefault: false, control: 'fake/lib/x.js' }] });
    const hostDir = vendored(h, { 'a.test.js': '' });
    seam.exec = tap;
    grade(h, vendorDir, 'fake');
    expect(read(hostDir, 'shim.js')).toBe("// generated per run — COMPAT_TARGET=fake\nexport * from 'fake';\nexport { default } from 'fake';\n");
    expect(read(hostDir, 'shim-1.js')).toBe("// generated per run — COMPAT_TARGET=fake\nexport * from 'fake/lib/x.js';\n");
  });

  it('re-exports the target on a target run, whatever the control entry says, as .mjs under a CommonJS package', () => {
    const h = host({ imports: [{ upstream: '../x.js', subpath: '/config', reexportDefault: false, control: 'fake/lib/x.js' }] });
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: {} });
    seam.exec = tap;
    grade(h, vendorDir, 'vitest');
    expect(read(hostDir, 'shim.mjs')).toBe("// generated per run — COMPAT_TARGET=vitest\nexport * from 'vitest/config';\n");
  });

  it('writes a CommonJS shim for a `shim: cjs` host, unwrapping the default only where it is declared', () => {
    const h = host({ shim: 'cjs', imports: [{ upstream: '../index.js', subpath: '', reexportDefault: true }, { upstream: '../x.js', subpath: '/x', reexportDefault: false }] });
    const hostDir = vendored(h, { 'a.test.js': '' });
    seam.exec = tap;
    grade(h, vendorDir, 'fake');
    expect(read(hostDir, 'shim.cjs')).toBe(`// generated per run — COMPAT_TARGET=fake\n${cjsLoad('fake')}\nmodule.exports = loaded?.default ?? loaded;\n`);
    expect(read(hostDir, 'shim-1.cjs')).toBe(`// generated per run — COMPAT_TARGET=fake\n${cjsLoad('fake/x')}\nmodule.exports = loaded;\n`);
  });
});

/**
 * `Host.alias` — `@inkjs/ui`'s shape: a suite whose subject is built on the incumbent. The
 * library stays itself on both runs, and only a target run moves the incumbent under it.
 * `semver` stands in for the target because it is in this workspace and tiny.
 */
/** An aliasing host whose library, on both runs, is `node:path`. */
const lib = (over: Partial<Host> = {}): Host => host({ alias: 'the-incumbent', imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false, control: 'node:path' }], ...over });
const hook = (hostDir: string): string => join(hostDir, ALIAS_HOOK);

describe('a host that grades a library built on the incumbent', () => {

  it('hands the suite the library itself on both runs', () => {
    const hostDir = vendored(lib(), { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(lib(), vendorDir, 'fake');
    expect(read(hostDir, 'shim.js')).toBe("// generated per run — COMPAT_TARGET=fake\nexport * from 'node:path';\n");
    grade(lib(), vendorDir, 'semver');
    expect(read(hostDir, 'shim.js')).toBe("// generated per run — COMPAT_TARGET=semver\nexport * from 'node:path';\n");
  });

  it('loads the hook into a target run, after whatever NODE_OPTIONS already held, and into a control run never', () => {
    vi.stubEnv('NODE_OPTIONS', '--no-warnings');
    const hostDir = vendored(lib(), { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(lib(), vendorDir, 'semver');
    expect(read(hook(hostDir))).toBe(aliasHook({ 'the-incumbent': import.meta.resolve('semver') }, 'semver'));
    expect((seam.calls[0] as Call).options.env.NODE_OPTIONS).toBe(`--no-warnings --import=${pathToFileURL(hook(hostDir)).href}`);
    // A control run removes the previous run's hook and loads nothing.
    grade(lib(), vendorDir, 'fake');
    expect(existsSync(hook(hostDir))).toBe(false);
    expect((seam.calls[1] as Call).options.env.NODE_OPTIONS).toBe('--no-warnings');
  });

  it('starts NODE_OPTIONS with the hook when nothing else is in it', () => {
    vi.stubEnv('NODE_OPTIONS', undefined);
    const hostDir = vendored(lib(), { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(lib(), vendorDir, 'semver');
    expect(only().options.env.NODE_OPTIONS).toBe(`--import=${pathToFileURL(hook(hostDir)).href}`);
  });

  // `Host.migrated` — boxen 9's shape: the suite's `chalk` is the one boxen draws with, so a
  // target run sends it to the drop-in a migrated program would import instead.
  it('sends each migrated sibling to its drop-in on a target run, beside the alias, and on the control nowhere', () => {
    const h = lib({ migrated: { 'the-sibling': 'vitest' } });
    const hostDir = vendored(h, { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(h, vendorDir, 'semver');
    expect(read(hook(hostDir))).toBe(aliasHook({ 'the-incumbent': import.meta.resolve('semver'), 'the-sibling': import.meta.resolve('vitest') }, 'semver'));
    grade(h, vendorDir, 'fake');
    expect(existsSync(hook(hostDir))).toBe(false);
  });

  it('loads the hook for a host that only migrates a sibling, with no alias of its own', () => {
    const h = host({ migrated: { 'the-sibling': 'vitest' } });
    const hostDir = vendored(h, { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(h, vendorDir, 'semver');
    expect(read(hook(hostDir))).toBe(aliasHook({ 'the-sibling': import.meta.resolve('vitest') }, 'semver'));
  });

  // For real: the sibling is whatever the run says in the runner's own child process.
  it('resolves a migrated sibling to the drop-in in the runner’s children', () => {
    const h = host({ migrated: { 'the-sibling': 'semver' } });
    const suite = [
      "import test from 'node:test';",
      "import assert from 'node:assert';",
      "test('the sibling is the drop-in', async () => {",
      "  const { default: semver } = await import('the-sibling');",
      "  assert.equal(semver.valid('1.2.3'), '1.2.3');",
      '});',
    ].join('\n');
    vendored(h, { 'a.test.js': suite });
    expect(grade(h, vendorDir, 'vitest')).toMatchObject({ tests: 1, passed: 1 });
  });

  it('writes no hook for a host that aliases nothing', () => {
    const hostDir = vendored(host(), { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(host(), vendorDir, 'vitest');
    expect(existsSync(hook(hostDir))).toBe(false);
  });

  it('is a note when the target the alias moves to is not built, whatever the library’s own entries are', () => {
    vendored(lib(), { 'a.test.js': '' });
    expect(grade(lib(), vendorDir, 'no-such-target-anywhere')).toMatchObject({ passed: 0, note: 'target not built yet: no-such-target-anywhere' });
  });

  // For real, because the claim is about resolution in a child process the oracle never sees.
  it('sends the incumbent to the target in the runner’s own children, and leaves it alone on the control', () => {
    const suite = [
      "import test from 'node:test';",
      "import assert from 'node:assert';",
      "test('the incumbent is whatever the run says it is', async () => {",
      "  const { default: semver } = await import('the-incumbent');",
      "  assert.equal(semver.valid('1.2.3'), '1.2.3');",
      '});',
    ].join('\n');
    vendored(lib(), { 'a.test.js': suite });
    expect(grade(lib(), vendorDir, 'semver')).toMatchObject({ tests: 1, passed: 1 });
    expect(grade(lib(), vendorDir, 'fake')).toMatchObject({ tests: 1, passed: 0, failed: 1 });
  });
});

/**
 * `Host.peers` — controlroom/ink's shape: a target that imports the program's own React. On a
 * target run the peers it imports resolve from the suite's tree, so the suite and the target
 * share one copy; the control loads nothing. `vitest` stands in for the target because it is
 * in this workspace and has a package root to find.
 */
/** A host whose target brings `the-peer`. */
const peered = (over: Partial<Host> = {}): Host => host({ peers: ['the-peer'], ...over });

/** A package of `the-peer` under `at`, whose entry and subpath both say who owns this copy. */
function peerCopy(at: string, says: string): void {
  mkdirSync(join(at, 'node_modules', 'the-peer'), { recursive: true });
  writeFileSync(join(at, 'node_modules', 'the-peer', 'package.json'), JSON.stringify({ name: 'the-peer', type: 'module', exports: { '.': './index.js', './sub.js': './sub.js' } }));
  writeFileSync(join(at, 'node_modules', 'the-peer', 'index.js'), `export default ${JSON.stringify(says)};\n`);
  writeFileSync(join(at, 'node_modules', 'the-peer', 'sub.js'), `export default ${JSON.stringify(`${says}/sub`)};\n`);
}

describe('a host whose target brings optional peers', () => {
  it('writes the peer hook on a target run, scoped to the target package and resolving from the suite', () => {
    const hostDir = vendored(peered(), { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(peered(), vendorDir, 'vitest');
    const inside = `${pathToFileURL(installed('vitest')).href}/`;
    const from = pathToFileURL(join(hostDir, 'package.json')).href;
    expect(read(hook(hostDir))).toBe(peerHook({ redirects: {}, peers: ['the-peer'], inside, from, target: 'vitest' }));
    expect(only().options.env.NODE_OPTIONS).toContain(`--import=${pathToFileURL(hook(hostDir)).href}`);
  });

  it('carries the alias too, for a host that has both', () => {
    const h = peered({ alias: 'the-incumbent', imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false, control: 'node:path' }] });
    const hostDir = vendored(h, { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(h, vendorDir, 'vitest');
    expect(read(hook(hostDir))).toContain(`const redirects = ${JSON.stringify({ 'the-incumbent': import.meta.resolve('vitest') })};`);
    expect(read(hook(hostDir))).toContain('const peers = ["the-peer"];');
  });

  it('loads nothing on the control', () => {
    vi.stubEnv('NODE_OPTIONS', undefined);
    const hostDir = vendored(peered(), { 'a.test.js': '' });
    seam.exec = prints(SUMMARY(1, 1));
    grade(peered(), vendorDir, 'fake');
    expect(existsSync(hook(hostDir))).toBe(false);
    expect(only().options.env.NODE_OPTIONS).toBeUndefined();
  });

  // For real: a target package with its own copy of the peer, a suite with another, and a child
  // process that imports the target with the hook loaded and without it.
  it('sends a peer the target imports to the suite’s copy, and leaves every other importer alone', () => {
    const root = join(vendorDir, 'fake');
    const target = join(vendorDir, 'target-package');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
    peerCopy(root, 'suite');
    peerCopy(target, 'target');
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'target-package', type: 'module' }));
    writeFileSync(join(target, 'index.js'), "import peer from 'the-peer';\nimport sub from 'the-peer/sub.js';\nexport default [peer, sub];\n");
    const hookFile = join(vendorDir, 'peer-hook.mjs');
    const inside = `${pathToFileURL(realpathSync(target)).href}/`;
    writeFileSync(hookFile, peerHook({ redirects: {}, peers: ['the-peer'], inside, from: pathToFileURL(join(root, 'package.json')).href, target: 'target-package' }));
    const probe = `import(${JSON.stringify(pathToFileURL(join(target, 'index.js')).href)}).then((m) => process.stdout.write(m.default.join(',')))`;
    const run = (args: string[]): string => String(realExec(process.execPath, [...args, '--input-type=module', '-e', probe], { cwd: root, encoding: 'utf8' }));
    expect(run([`--import=${pathToFileURL(hookFile).href}`])).toBe('suite,suite/sub');
    expect(run([])).toBe('target,target/sub');
  });
});

describe('the target’s own module behind an internal path', () => {
  it('re-exports each name the suite imports from the target package’s file, by absolute URL', () => {
    expect(targetInternalBody('/pkg', { file: 'dist/a.js', names: { default: 'parse', bsu: 'bsu' } })).toBe(`export { parse as default, bsu } from '${pathToFileURL('/pkg/dist/a.js').href}';\n`);
  });

  it('is written on a target run only; the control still gets the host’s own file', () => {
    const h = incumbent({ targetInternals: { 'lib/command.js': { file: 'package.json', names: { default: 'Command' } } } });
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: ['lib/command.js'] } });
    seam.exec = prints(SUMMARY(1, 1));
    grade(h, vendorDir, 'vitest');
    expect(read(hostDir, 'lib', 'command.js')).toBe(`// generated per run — COMPAT_TARGET=vitest\n${targetInternalBody(installed('vitest'), { file: 'package.json', names: { default: 'Command' } })}`);
    grade(h, vendorDir, 'commander');
    expect(read(hostDir, 'lib', 'command.js')).toBe(`// generated per run — COMPAT_TARGET=commander\nexport * from '${join(COMMANDER, 'lib', 'command.js')}';\n`);
  });
});

describe('the internal shims a run writes', () => {
  const tap = prints(SUMMARY(1, 1));
  const shipped = join(COMMANDER, 'lib', 'command.js');

  it('points the control at the file the incumbent ships, by absolute path — never at one named export', () => {
    // A named export is for the target, whose main entry is not the host's file layout.
    const h = incumbent({ internalExports: { 'lib/command.js': 'Command' } });
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: ['lib/command.js'] } });
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    expect(read(hostDir, 'lib', 'command.js')).toBe(`// generated per run — COMPAT_TARGET=commander\nexport * from '${shipped}';\n`);
  });

  it('points the control at the package by name for a file it does not ship', () => {
    const h = incumbent();
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: ['lib/not-shipped.js'] } });
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    expect(read(hostDir, 'lib', 'not-shipped.js')).toBe("// generated per run — COMPAT_TARGET=commander\nexport * from 'commander';\n");
  });

  it('points a target run at the target, with the one named export the host declares', () => {
    const h = incumbent({ internalExports: { 'lib/command.js': 'Command' } });
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: ['lib/command.js', 'lib/help.js'] } });
    seam.exec = tap;
    grade(h, vendorDir, 'vitest');
    expect(read(hostDir, 'lib', 'command.js')).toBe(`// generated per run — COMPAT_TARGET=vitest\n${internalShimBody('vitest', 'module', 'Command')}`);
    expect(read(hostDir, 'lib', 'help.js')).toBe("// generated per run — COMPAT_TARGET=vitest\nexport * from 'vitest';\n");
  });

  it('writes a .cjs path as CommonJS whatever the package type says', () => {
    const h = incumbent();
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: ['build/index.cjs'] } });
    seam.exec = tap;
    grade(h, vendorDir, 'vitest');
    expect(read(hostDir, 'build', 'index.cjs')).toBe("// generated per run — COMPAT_TARGET=vitest\nconst loaded = require('vitest');\nmodule.exports = loaded?.default ?? loaded;\n");
  });

  it('anchors the shims at the sub-package, and resolves the incumbent from beside a suite that pins its own', () => {
    const h = incumbent({ packageDir: 'packages/p', testDir: 'packages/p/test', suiteDeps: ['commander@14.0.0'] });
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: ['lib/command.js'] } });
    // The pinned copy beside the suite, which the workspace's own resolver never reaches.
    const beside = join(hostDir, 'node_modules', 'commander');
    mkdirSync(join(beside, 'lib'), { recursive: true });
    writeFileSync(join(beside, 'package.json'), JSON.stringify({ name: 'commander', version: '14.0.0', main: 'index.js' }));
    writeFileSync(join(beside, 'index.js'), '');
    writeFileSync(join(beside, 'lib', 'command.js'), '');
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    expect(read(hostDir, 'packages', 'p', 'lib', 'command.js')).toBe(`// generated per run — COMPAT_TARGET=commander\nexport * from '${join(realpathSync(beside), 'lib', 'command.js')}';\n`);
  });

  it('links, rather than shims, the incumbent’s own file on the control of a cache-busting CJS host', () => {
    const h = incumbent({ shim: 'cjs' });
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: {}, source: { internals: ['lib/command.js'] } });
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    const at = join(hostDir, 'lib', 'command.js');
    expect(lstatSync(at).isSymbolicLink()).toBe(true);
    expect(realpathSync(at)).toBe(realpathSync(shipped));
    // Unlinked first on the next run, never written through into the incumbent.
    grade(h, vendorDir, 'commander');
    expect(lstatSync(at).isSymbolicLink()).toBe(true);
    expect(read(shipped)).not.toContain('generated per run');
  });

  it('links the compiled file on the control of a host that publishes its internals elsewhere, and shims the target', () => {
    // ink's shape, on commander's files: the suite names `src/…`, the tarball ships `lib/…`.
    const h = incumbent({ internalDir: 'src', publishedInternalDir: 'lib' });
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: ['src/command.js'] } });
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    const at = join(hostDir, 'src', 'command.js');
    // A link, not `export *`, which would drop the `default` ink's `parseKeypress` is.
    expect(lstatSync(at).isSymbolicLink()).toBe(true);
    expect(realpathSync(at)).toBe(realpathSync(shipped));
    grade(h, vendorDir, 'vitest');
    expect(lstatSync(at).isSymbolicLink()).toBe(false);
    expect(read(at)).toBe("// generated per run — COMPAT_TARGET=vitest\nexport * from 'vitest';\n");
  });

  it('falls back to an ordinary shim where the platform refuses the link', () => {
    const h = incumbent({ shim: 'cjs' });
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: {}, source: { internals: ['lib/command.js'] } });
    seam.exec = tap;
    seam.refuseLinks = true;
    grade(h, vendorDir, 'commander');
    const at = join(hostDir, 'lib', 'command.js');
    expect(lstatSync(at).isSymbolicLink()).toBe(false);
    expect(read(at)).toBe(`// generated per run — COMPAT_TARGET=commander\nconst loaded = require('${shipped}');\nmodule.exports = loaded?.default ?? loaded;\n`);
  });

  it('writes no internal shim, and needs no incumbent installed, for a suite that imports no internals', () => {
    const h = host({ npmName: 'not-installed-anywhere' });
    const hostDir = vendored(h, { 'a.test.js': '' }, { source: { internals: [] } });
    seam.exec = tap;
    expect(grade(h, vendorDir, 'not-installed-anywhere').error).toBeUndefined();
    expect(existsSync(join(hostDir, 'lib'))).toBe(false);
  });
});

describe('the files a suite reaches by path (`entries`, dotenv 18)', () => {
  const tap = prints(SUMMARY(1, 1));
  const shipped = join(COMMANDER, 'index.js');
  const entry = { at: 'dist/index.cjs', control: 'index.js', target: '/sub', names: ['config', 'parse'], runs: '/sub/cli' };

  it('links each one to the incumbent’s own file on the control, so the incumbent is `require.main`', () => {
    const h = incumbent({ entries: [entry] });
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: {} });
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    const at = join(hostDir, 'dist', 'index.cjs');
    expect(lstatSync(at).isSymbolicLink()).toBe(true);
    expect(realpathSync(at)).toBe(realpathSync(shipped));
    // Unlinked first on the next run, never written through into the incumbent.
    grade(h, vendorDir, 'commander');
    expect(read(shipped)).not.toContain('generated per run');
  });

  it('requires the incumbent’s file instead where the platform refuses the link', () => {
    const h = incumbent({ entries: [entry] });
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: {} });
    seam.exec = tap;
    seam.refuseLinks = true;
    grade(h, vendorDir, 'commander');
    expect(read(hostDir, 'dist', 'index.cjs')).toBe(`// generated per run — COMPAT_TARGET=commander\nmodule.exports = require(${JSON.stringify(shipped)});\n`);
  });

  it('writes upstream’s index.js pointed at the target on a target run: the module, its names, its CLI', () => {
    const h = incumbent({ entries: [entry, { at: 'dist/config.cjs', control: 'index.js', target: '/sub/config' }] });
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: {} });
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    // The target here is commander too, under another name: a target run is any run whose
    // target is not the control's, and only the body is under test.
    grade({ ...h, npmName: 'not-this' }, vendorDir, 'commander');
    expect(lstatSync(join(hostDir, 'dist', 'index.cjs')).isSymbolicLink()).toBe(false);
    expect(read(hostDir, 'dist', 'index.cjs')).toBe(entryBody('commander', entry));
    expect(read(hostDir, 'dist', 'config.cjs')).toBe(
      ['// generated per run — COMPAT_TARGET=commander', "const loaded = require(\"commander/sub/config\");", 'module.exports = loaded?.default ?? loaded;', ''].join('\n'),
    );
  });

  it('is a module Node can name the exports of, and runs the CLI only as the main module', () => {
    expect(entryBody('t', entry).split('\n')).toEqual([
      '// generated per run — COMPAT_TARGET=t',
      'const loaded = require("t/sub");',
      'module.exports = loaded?.default ?? loaded;',
      'module.exports.config = module.exports.config;',
      'module.exports.parse = module.exports.parse;',
      'if (require.main === module) require("t/sub/cli").run(process.argv.slice(2));',
      '',
    ]);
  });

  /**
   * The vendored root of a `selfExports` host answers to the incumbent's own name, so a resolver
   * anchored *at* it finds itself by self-reference: the control's entry would be linked to a
   * file of the vendored tree instead of the installed incumbent. Anchored inside
   * `node_modules`, the package-scope lookup stops and the installed copy is what resolves.
   */
  it('links the control to the copy installed beside the suite, not to the vendored root that shares its name', () => {
    const h = incumbent({ entries: [{ ...entry, control: 'main.js' }], suiteDeps: ['commander@9.9.9'], selfExports: { '.': './dist/index.cjs' } });
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: { name: 'commander', exports: { '.': './dist/index.cjs' }, devDependencies: { commander: '9.9.9' } } });
    const beside = join(hostDir, 'node_modules', 'commander');
    mkdirSync(beside, { recursive: true });
    writeFileSync(join(beside, 'package.json'), JSON.stringify({ name: 'commander', version: '9.9.9', main: 'main.js' }));
    writeFileSync(join(beside, 'main.js'), 'module.exports = {};\n');
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    // No install was needed: the pin is satisfied by the copy beside the suite, found as itself.
    expect(seam.calls.filter((c) => c.file === 'npm')).toEqual([]);
    expect(realpathSync(join(hostDir, 'dist', 'index.cjs'))).toBe(realpathSync(join(beside, 'main.js')));
  });

  it('writes nothing for a host that declares none', () => {
    const h = incumbent();
    const hostDir = vendored(h, { 'a.test.js': '' }, { pkg: {} });
    seam.exec = tap;
    grade(h, vendorDir, 'commander');
    expect(existsSync(join(hostDir, 'dist'))).toBe(false);
  });
});

describe('COMPAT_TAP_DIR keeps the raw TAP', () => {
  it('writes each run’s output under the host, target and kind', () => {
    const keep = join(vendorDir, 'tap-out');
    vi.stubEnv('COMPAT_TAP_DIR', keep);
    const h = host({ imports: [{ upstream: '../x.js', subpath: '', reexportDefault: false }] });
    vendored(h, { 'a.test.js': '', 'i.test.js': '' }, { source: { internalFiles: ['i.test.js'] } });
    let n = 0;
    seam.exec = () => (n++ === 0 ? 'public TAP\n# tests 1\n# pass 1\n# fail 0\n' : 'internal TAP\n');
    grade(h, vendorDir, 'vitest/config');
    expect(read(keep, 'fake.vitest_config.public.tap')).toBe('public TAP\n# tests 1\n# pass 1\n# fail 0\n');
    expect(read(keep, 'fake.vitest_config.internal.tap')).toBe('internal TAP\n');
  });

  it('keeps nothing for a run that produced no output, or when the variable is empty', () => {
    const keep = join(vendorDir, 'tap-out');
    vi.stubEnv('COMPAT_TAP_DIR', keep);
    vendored(host(), { 'a.test.js': '' });
    seam.exec = dies({ stderr: 'boom' });
    grade(host(), vendorDir, 'fake');
    expect(existsSync(keep)).toBe(false);
    vi.stubEnv('COMPAT_TAP_DIR', '');
    seam.exec = prints(SUMMARY(1, 1));
    grade(host(), vendorDir, 'fake');
    expect(existsSync(keep)).toBe(false);
  });
});

describe('installing what a vendored suite declares', () => {
  it('installs into the vendored directory, with no lockfile, when a pin is missing', () => {
    const hostDir = vendored(host(), { 'a.test.js': '' }, { pkg: { type: 'module', devDependencies: { 'pinned-dep': '1.2.3' } } });
    const said: string[] = [];
    seam.exec = prints('');
    installSuiteDeps(host(), hostDir, (s) => said.push(s));
    expect(said).toEqual(["  installing fake's suite dependencies into vendor/fake/node_modules: pinned-dep@1.2.3\n"]);
    expect(only()).toEqual({
      file: 'npm',
      args: ['install', '--no-audit', '--no-fund', '--no-package-lock', '--prefix', hostDir],
      options: { stdio: ['ignore', 'ignore', 'inherit'], timeout: 300_000 },
    });
  });

  it('installs nothing when every pin is already beside the suite, or nothing is declared', () => {
    const hostDir = vendored(host(), { 'a.test.js': '' }, { pkg: { devDependencies: { 'pinned-dep': '1.2.3' } } });
    mkdirSync(join(hostDir, 'node_modules', 'pinned-dep'), { recursive: true });
    writeFileSync(join(hostDir, 'node_modules', 'pinned-dep', 'package.json'), JSON.stringify({ name: 'pinned-dep', version: '1.2.3' }));
    installSuiteDeps(host(), hostDir);
    rmSync(join(hostDir, 'package.json'));
    installSuiteDeps(host(), hostDir);
    expect(seam.calls).toEqual([]);
  });

  it('runs before the suite, silently, as part of a grade', () => {
    vendored(host(), { 'a.test.js': '' }, { pkg: { devDependencies: { 'pinned-dep': '1.2.3' } } });
    seam.exec = npmThenSummary;
    expect(grade(host(), vendorDir, 'fake')).toMatchObject({ passed: 1 });
    expect(seam.calls.map((c) => c.file)).toEqual(['npm', process.execPath]);
  });
});

describe('the baseline on disk', () => {
  it('is empty when there is none, and read whole from a single file', () => {
    expect(readBaseline(join(vendorDir, 'absent'))).toEqual({});
    const file = join(vendorDir, 'baseline.json');
    writeFileSync(file, JSON.stringify({ chalk: { reference: 58, passed: 58, rate: 1 } }));
    expect(readBaseline(file)).toEqual({ chalk: { reference: 58, passed: 58, rate: 1 } });
  });
});
