/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout check` — driven in this process, through `check()` itself.
 *
 * `scripts/plugin-check-lock.test.ts` holds the contract every host's `check` shares, but it
 * runs in the workspace's process and is invisible to this package's coverage. This file is
 * closeout's own: the argument handling the shared lock does not reach (`--help`, `--version`,
 * an unknown flag), the two shapes a plugin module can export, the phase each handler resolves
 * to, and the one error `check` does not own and must not swallow.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { check, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE } from './check.js';
import { register } from './plugin.js';

const dir = mkdtempSync(join(tmpdir(), 'closeout-check-'));
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
    expect(out.startsWith('usage: closeout check <plugin-file>\n')).toBe(true);
    expect(out).toContain('-V, --version  print the version');
    expect(code).toBe(EXIT_OK);
  });

  it.each(['--version', '-V'])('%s prints the package version and exits 0', async (flag) => {
    expect(await run([flag])).toEqual({ code: EXIT_OK, out: `${version}\n` });
  });

  it('an unknown flag is a usage error that names the flag', async () => {
    expect(await run(['--json'])).toEqual({ code: EXIT_USAGE, out: 'unknown option --json\nusage: closeout check <plugin-file>\n' });
  });

  it('no argument is a usage error with the bare usage line', async () => {
    expect(await run([])).toEqual({ code: EXIT_USAGE, out: 'usage: closeout check <plugin-file>\n' });
  });
});

describe('the report', () => {
  it('lists each handler in the order it will run, with its phase, then ends in ok', async () => {
    // Contributed restore-last-but-first and unphased-in-the-middle: the report is the run order
    // (flush, release, restore), not the order the author wrote them in.
    const { code, out } = await run([
      file("export default { name: 'acme', handlers: [{ name: 'late', phase: 'release', run() {} }, { name: 'write', phase: 'flush', run() {} }, { name: 'unlock', run() {} }] };"),
    ]);
    expect(out).toBe('acme — 3 handlers\n  acme:write  runs in the flush phase\n  acme:late  runs in the release phase\n  acme:unlock  runs in the release phase\nacme: ok\n');
    expect(code).toBe(EXIT_OK);
  });

  it('reads a module with no default export as the plugin itself', async () => {
    const { code, out } = await run([file("export const name = 'bare';\nexport const handlers = [{ name: 'unlock', run() {} }];")]);
    expect(out).toBe('bare — 1 handlers\n  bare:unlock  runs in the release phase\nbare: ok\n');
    expect(code).toBe(EXIT_OK);
  });

  it('reports only the plugin it was given, whatever was registered before', async () => {
    register({ name: 'earlier', handlers: [{ name: 'stale', run() {} }] });
    const { out } = await run([file("export default { name: 'fresh', handlers: [{ name: 'unlock', run() {} }] };")]);
    expect(out).toBe('fresh — 1 handlers\n  fresh:unlock  runs in the release phase\nfresh: ok\n');
  });

  it('reports a plugin that registers itself on import once, not twice', async () => {
    const plugin = new URL('./plugin.ts', import.meta.url).href;
    const { out } = await run([
      file(`import { register } from ${JSON.stringify(plugin)};\nconst p = { name: 'eager', handlers: [{ name: 'unlock', run() {} }] };\nregister(p);\nexport default p;`),
    ]);
    expect(out).toBe('eager — 1 handlers\n  eager:unlock  runs in the release phase\neager: ok\n');
  });

  it('refuses a plugin that registers but contributes no handler, with the code and the fix', async () => {
    const { code, out } = await run([file("export default { name: 'quiet', tokens: {} };")]);
    expect(out).toBe(
      'quiet — 0 handlers\nE_NO_CONTRIBUTION: quiet registers, but contributes nothing closeout reads\n' +
        '  fix: add a `handlers` section — a key another package in the family reads is allowed in the same object, but `closeout check` cannot show it\n',
    );
    expect(code).toBe(EXIT_RUNTIME);
  });

  it('refuses a malformed plugin with its code and fix, and prints no report', async () => {
    const { code, out } = await run([file("export default { name: 'typo', handlers: [{ name: 'unlock', phase: 'Restore', run() {} }] };")]);
    expect(out).toMatch(/^E_PLUGIN_SCHEMA: plugin "typo": handlers\[0\]: "Restore" is not a phase a plugin may use\n {2}fix: use one of /);
    expect(out).not.toContain('handlers\n');
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
