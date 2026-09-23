/**
 * Z1 — the shape lock.
 *
 * A working CLI is ONE file: `npm i`, write it, run it. No build step, no config
 * file, no directory convention, no codegen, no scaffold.
 *
 * This is the test that keeps burgee a library rather than another oclif. oclif
 * has every capability burgee plans and does 10.9M downloads a week against
 * commander's 508M; the difference is shape, not features. If this test ever
 * needs a second authored file, a config, or a build step to pass, that shape
 * has been lost and CI must go red.
 *
 * It installs the real packed tarball rather than importing from source, because
 * importing from source would not prove that a stranger can do this.
 */
import { execFileSync } from 'node:child_process';

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. */
const WINDOWS = process.platform === 'win32';
function npm(args: string[], options: Parameters<typeof execFileSync>[2]): string {
  return String(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', args, { ...options, shell: WINDOWS }));
}

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

/** One `$ node cli.mjs …` session from a README transcript: argv, the exit it states, and what it prints. */
interface Session {
  argv: string[];
  code: number;
  output: string;
}

/** A README's "Start here": the file it tells a stranger to write, and the transcript it promises. */
function quickstart(readme: string): { source: string; transcript: Session[] } {
  const text = readFileSync(readme, 'utf8');
  const at = text.search(/\n## [^\n]*Start here\n/);
  const section = text.slice(at, text.indexOf('\n## ', at + 1));
  const transcript = (/```console\n([\s\S]*?)```/.exec(section)?.[1] ?? '')
    .trim()
    .split(/\n\n(?=\$ )/)
    .map((block) => {
      const [command = '', ...output] = block.split('\n');
      const [typed = '', exit] = command.replace(/^\$ node cli\.mjs/, '').split('#');
      return {
        argv: typed.trim().split(/\s+/).filter((a) => a !== ''),
        code: exit === undefined ? 0 : Number(/exit (\d+)/.exec(exit)?.[1]),
        output: output.join('\n'),
      };
    });
  return { source: /```js\n([\s\S]*?)```/.exec(section)?.[1] ?? '', transcript };
}

/**
 * The whole CLI. Every character a user has to write — **read from the README's "Start here"**,
 * not copied from it.
 *
 * It used to be a copy, and the copy is how burgee@0.10.0 shipped a quickstart that threw: the
 * test's version declared `effects: 'read_only'`, the README's did not, and `defineCommand`
 * refuses a runnable command without one. Every commit proved that *a* one-file CLI works, and
 * the one a stranger pastes first was never run. The transcript under it is run too, byte for
 * byte, so the output the README promises is the output there is.
 *
 * `.mjs`, not `.js`: the extension carries the module type, so this works in any
 * project regardless of whether its package.json declares `"type"`. With a `.js`
 * file Node either falls back to syntax detection — printing
 * MODULE_TYPELESS_PACKAGE_JSON to stderr on every run, which would corrupt the
 * clean output this project exists to promise — or fails outright. One file with
 * no config beats one file plus a config field.
 *
 * The package README (npm's page) and the repository's (GitHub's) both open with it.
 */
const QUICKSTARTS = {
  'packages/burgee/README.md': quickstart(join(pkgRoot, 'README.md')),
  'README.md': quickstart(join(pkgRoot, '..', '..', 'README.md')),
};
const ONE_FILE = QUICKSTARTS['packages/burgee/README.md'].source;

let dir: string;

function cliIn(cwd: string, argv: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ['cli.mjs', ...argv], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

const cli = (...argv: string[]): ReturnType<typeof cliIn> => cliIn(dir, argv);

/** `npm pack` in `cwd`, into `into`; returns the tarball's absolute path. */
function pack(cwd: string, into: string): string {
  return join(into, npm(['pack', '--silent', '--pack-destination', into], { cwd, encoding: 'utf8' }).trim());
}

/*
 * Every family package burgee depends on is packed and installed beside it, rather than
 * resolved from the registry. burgee@0.4.0 had no dependencies, so `npm install <tgz>`
 * had nothing to fetch and this went unnoticed; burgee@0.5.0 depends on `roundel`, and a
 * release bumps both at once — so on the Version Packages branch the version burgee asks
 * for is the one this very release is about to publish, and Z1 failed with a registry
 * 404 on every release that bumps a sibling.
 *
 * Installing the sibling's tarball is also the stricter test: it proves the artifacts
 * being released work together, rather than that burgee works against whatever copy of
 * roundel npm already happens to serve.
 */
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'burgee-shape-'));
  const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const siblings = Object.keys(manifest.dependencies ?? {})
    .map((name) => join(pkgRoot, '..', name))
    .filter((at) => existsSync(join(at, 'package.json')))
    .map((at) => pack(at, dir));
  npm(['install', '--no-audit', '--no-fund', '--silent', pack(pkgRoot, dir), ...siblings], {
    cwd: dir,
    stdio: 'ignore',
  });
  writeFileSync(join(dir, 'cli.mjs'), ONE_FILE);
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Z1 — one file, npm i, no build step', () => {
  describe.each(Object.entries(QUICKSTARTS))('%s "Start here"', (readme, { source, transcript }) => {
    let at: string;
    beforeAll(() => {
      // Its own directory, sharing the install: the one-file assertion below holds for `dir`.
      at = mkdtempSync(join(tmpdir(), 'burgee-readme-'));
      symlinkSync(join(dir, 'node_modules'), join(at, 'node_modules'), 'junction');
      writeFileSync(join(at, 'cli.mjs'), source);
    });
    afterAll(() => rmSync(at, { recursive: true, force: true }));

    it('has a file and a transcript to run', () => {
      expect(source, readme).toContain("from 'burgee'");
      expect(transcript.length).toBeGreaterThanOrEqual(3);
    });

    it.each(transcript.map((t) => [t.argv.join(' '), t] as const))('$ node cli.mjs %s', (_argv, session) => {
      const r = cliIn(at, session.argv);
      expect(`${r.stdout}${r.stderr}`.trimEnd()).toBe(session.output);
      expect(r.code).toBe(session.code);
    });
  });

  /*
   * The bin a user gets from `npm install burgee`, run the way a shell runs it — through the
   * symlink npm made, not as `node dist/cli.js`. burgee@0.10.0 had no shebang and this is the
   * spelling that failed; `node …` never reads line one.
   */
  it.skipIf(WINDOWS)('the installed `burgee` command runs as a command', () => {
    const out = execFileSync(join(dir, 'node_modules', '.bin', 'burgee'), ['--help'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(out).toContain('Usage: burgee');
  });

  it('runs a CLI whose entire source is a single file', () => {
    const r = cli('--name', 'ada');
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('hello, ada');
  });

  it('serves --json from the same declaration, with the envelope', () => {
    const r = cli('--json', '--name', 'ada');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, data: { greeting: 'hello, ada' } });
  });

  it('a missing required option is a usage error (exit 2) that names the flag', () => {
    const r = cli();
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--name/);
  });

  it('an unknown option is a usage error (exit 2), not a runtime failure', () => {
    // E1/E2: the caller mistyped a flag. That is category 2, and it must never be
    // reported as 1, which is what an agent branches on to decide whether to retry.
    const r = cli('--nope');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/--nope/);
    expect(r.stderr).not.toMatch(/\bat \w+ \(/); // no stack on a usage error
  });

  it('help aligns every flag in one column', () => {
    const r = cli('--help');
    expect(r.code).toBe(0);
    // The column each description starts in — the end of the gutter, not its start,
    // since the gutter begins at a different place for every flag length.
    const cols = r.stdout
      .split('\n')
      .filter((l) => l.startsWith('  --'))
      .map((l) => /\s{2,}(?=\S)/.exec(l.slice(3)))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m.index + m[0].length + 3);
    expect(cols.length).toBeGreaterThan(1);
    expect(new Set(cols).size).toBe(1);
  });

  it('the user authored exactly one file, and never ran a build', () => {
    const authored = readdirSync(dir).filter(
      (f) => !['node_modules', 'package.json', 'package-lock.json'].includes(f) && !f.endsWith('.tgz'),
    );
    expect(authored).toEqual(['cli.mjs']);
  });

  it('stays silent in an ordinary project too, where package.json declares no type', () => {
    // The realistic case: `npm init -y` leaves no "type" field. A .js entry would
    // warn on stderr here (or fail); a .mjs entry must be clean.
    const plain = mkdtempSync(join(tmpdir(), 'burgee-plain-'));
    try {
      writeFileSync(join(plain, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', main: 'index.js' }));
      npm(['install', '--no-audit', '--no-fund', '--silent', join(dir, 'node_modules/burgee')], {
        cwd: plain,
        stdio: 'ignore',
      });
      writeFileSync(join(plain, 'cli.mjs'), ONE_FILE);
      const stdout = execFileSync(process.execPath, ['cli.mjs', '--name', 'ada'], {
        cwd: plain,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(stdout).toContain('hello, ada');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  }, 120_000);

  it('is consumable from CommonJS too — the same ESM file, through require(esm) (K2)', () => {
    // No dual build. Every entry exposes a `default` condition beside `import`, and the
    // library has no top-level await, so Node >= 22.12 loads the ESM file from require().
    // A commander user on CommonJS can still change one import; without this they could not.
    const cjs = join(dir, 'probe.cjs');
    writeFileSync(
      cjs,
      [
        "const { defineCommand, run } = require('burgee');",
        "const { Command } = require('burgee/commander');",
        "if (typeof Command !== 'function') throw new Error('burgee/commander has no Command');",
        "run(defineCommand({ name: 'g', options: { name: { type: 'string', required: true } }, effects: 'read_only',",
        '  run: ({ options }) => ({ greeting: `hello, ${options.name}` }) }), { argv: ["--name", "ada"] });',
        '',
      ].join('\n'),
    );
    try {
      const out = execFileSync(process.execPath, [cjs], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(out).toContain('hello, ada');
    } finally {
      rmSync(cjs, { force: true }); // the one-file assertion above must stay true
    }
  });

  /**
   * Zero *external* runtime dependencies (K1/Z3).
   *
   * Not zero dependencies. burgee sits on top of its own family and consumes the layers
   * below it — `roundel` for colour, and the rest as they land — which is the arrangement
   * `scripts/package-shape-lock.test.ts` declares and the reason the same WCAG code no
   * longer exists twice. What the claim was ever about survives intact: everything a
   * caller installs comes from this repo, so there is one supply chain to audit.
   *
   * `--depth 1` reads burgee's own dependants only; each family package is held to this
   * same rule by the shape lock, so the whole tree is covered by induction rather than by
   * walking it here.
   */
  it('the package it installed depends on nothing outside this repo (K1/Z3)', () => {
    const family = readdirSync(join(pkgRoot, '..'));
    const manifest = JSON.parse(
      npm(['ls', 'burgee', '--json', '--depth', '1'], { cwd: dir, encoding: 'utf8' }),
    ) as { dependencies?: Record<string, { dependencies?: Record<string, unknown> }> };
    const installed = Object.keys(manifest.dependencies?.burgee?.dependencies ?? {});

    expect(
      installed.filter((d) => !family.includes(d)),
      'a dependency from outside this repo is a second supply chain to audit',
    ).toEqual([]);
  });
});
