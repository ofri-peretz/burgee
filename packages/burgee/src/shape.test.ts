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

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * The whole CLI. Every character a user has to write.
 *
 * `.mjs`, not `.js`: the extension carries the module type, so this works in any
 * project regardless of whether its package.json declares `"type"`. With a `.js`
 * file Node either falls back to syntax detection — printing
 * MODULE_TYPELESS_PACKAGE_JSON to stderr on every run, which would corrupt the
 * clean output this project exists to promise — or fails outright. One file with
 * no config beats one file plus a config field.
 */
const ONE_FILE = `import { defineCommand, run } from 'burgee';

run(defineCommand({
  name: 'greet',
  description: 'Greet someone by name',
  options: { name: { type: 'string', required: true, description: 'who to greet' } },
  run: ({ options }) => ({ greeting: \`hello, \${options.name}\` }),
}));
`;

let dir: string;

function cli(...argv: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ['cli.mjs', ...argv], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'burgee-shape-'));
  const tarball = npm(['pack', '--silent', '--pack-destination', dir], {
    cwd: pkgRoot,
    encoding: 'utf8',
  }).trim();
  npm(['install', '--no-audit', '--no-fund', '--silent', join(dir, tarball)], {
    cwd: dir,
    stdio: 'ignore',
  });
  writeFileSync(join(dir, 'cli.mjs'), ONE_FILE);
}, 120_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Z1 — one file, npm i, no build step', () => {
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
        "run(defineCommand({ name: 'g', options: { name: { type: 'string', required: true } },",
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
