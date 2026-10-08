/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `bellpull check` — driven in this process, through `check()` itself.
 *
 * `scripts/plugin-check-lock.test.ts` holds the contract every host's `check` shares, but it
 * runs in the workspace's process and is invisible to this package's coverage. This file is
 * bellpull's own: the argument handling the shared lock does not reach (`--help`, `--version`,
 * an unknown flag), the two shapes a plugin module can export, the resolvers in the order they
 * are searched, and the one error `check` does not own and must not swallow.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { check, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE } from './check.js';

const dir = mkdtempSync(join(tmpdir(), 'bellpull-check-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let serial = 0;
/** A plugin module on disk, because `check` takes a path — that is how an author runs it. */
function file(source: string): string {
  serial += 1;
  const at = join(dir, `p${String(serial)}.mjs`);
  writeFileSync(at, source);
  return at;
}

async function run(argv: readonly string[]): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await check(argv, (s) => {
    out += s;
  });
  return { code, out };
}

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('arguments', () => {
  it.each(['--help', '-h'])('%s prints the help and exits 0, rather than importing a file by that name', async (flag) => {
    const { code, out } = await run([flag]);
    expect(out.startsWith('usage: bellpull check <plugin-file>\n')).toBe(true);
    expect(out).toContain('-V, --version  print the version');
    expect(code).toBe(EXIT_OK);
  });

  it.each(['--version', '-V'])('%s prints the package version and exits 0', async (flag) => {
    expect(await run([flag])).toEqual({ code: EXIT_OK, out: `${version}\n` });
  });

  it('an unknown flag is a usage error that names the flag', async () => {
    expect(await run(['--json'])).toEqual({ code: EXIT_USAGE, out: 'unknown option --json\nusage: bellpull check <plugin-file>\n' });
  });

  it('no argument is a usage error with the bare usage line', async () => {
    expect(await run([])).toEqual({ code: EXIT_USAGE, out: 'usage: bellpull check <plugin-file>\n' });
  });
});

describe('the report', () => {
  it('lists each resolver in search order — by rank, not as written — then ends in ok', async () => {
    const { code, out } = await run([file("export default { name: 'managers', resolvers: { late: { rank: 5, paths: ['/late'] }, asdf: { rank: -10, paths: ['{ASDF_DATA_DIR}/shims'] } } };")]);
    expect(out).toBe('managers — 2 resolvers\n  asdf\n  late\nmanagers: ok\n');
    expect(code).toBe(EXIT_OK);
  });

  it('reads a module with no default export as the plugin itself', async () => {
    const { code, out } = await run([file("export const name = 'bare';\nexport const resolvers = { shims: { rank: -1, paths: ['/opt/shims'] } };")]);
    expect(out).toBe('bare — 1 resolvers\n  shims\nbare: ok\n');
    expect(code).toBe(EXIT_OK);
  });

  it('refuses a plugin that registers but contributes no resolver, with the code and the fix', async () => {
    const { code, out } = await run([file("export default { name: 'quiet', spinners: {} };")]);
    expect(out).toBe(
      'quiet — 0 resolvers\nE_NO_CONTRIBUTION: quiet registers, but contributes nothing bellpull reads\n' +
        '  fix: add a `resolvers` section — a key another package in the family reads is allowed in the same object, but `bellpull check` cannot show it\n',
    );
    expect(code).toBe(EXIT_RUNTIME);
  });

  it('refuses a malformed plugin with its code and fix, and prints no report', async () => {
    const { code, out } = await run([file("export default { name: 'typo', resolvers: { local: { rank: 0, paths: ['bin'] } } };")]);
    expect(out).toMatch(/^E_PLUGIN_SCHEMA: plugin "typo": resolver "local": "bin" is not an absolute path\n {2}fix: use an absolute path/);
    expect(code).toBe(EXIT_RUNTIME);
  });

  it('refuses an unknown key under `when`, naming it and the keys allowed, rather than ending in ok', async () => {
    // `env` for `envAny`: the condition was never read, so the resolver applied on every
    // machine, and `check` said `ok` to it.
    const { code, out } = await run([file("export default { name: 'typo', resolvers: { asdf: { rank: -10, paths: ['/opt/asdf/shims'], when: { env: ['ASDF_DATA_DIR'] } } } };")]);
    expect(out).toBe(
      'E_PLUGIN_SCHEMA: plugin "typo": resolver "asdf": `when.env` is not a condition bellpull reads\n' +
        '  fix: the keys a `when` allows are `platform` and `envAny`; rename it to one of them, or remove it\n',
    );
    expect(code).toBe(EXIT_RUNTIME);
  });
});

describe('what check does not own', () => {
  it('rethrows an error that is not a plugin refusal, rather than dressing it as one', async () => {
    const missing = join(dir, 'does-not-exist.mjs');
    let out = '';
    await expect(check([missing], (s) => void (out += s))).rejects.toThrow(/does-not-exist\.mjs/);
    expect(out).toBe('');
  });
});
