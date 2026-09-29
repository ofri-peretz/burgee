/**
 * `paratext check` — driven in this process, through `check()` itself.
 *
 * `scripts/plugin-check-lock.test.ts` holds the contract every host's `check` shares, but it
 * runs in the workspace's process and is invisible to this package's coverage. This file is
 * paratext's own: the argument handling the shared lock does not reach (`--help`, `--version`,
 * an unknown flag), the two shapes a plugin module can export, both projections of every
 * capability in the report, and the one error `check` does not own and must not swallow.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { check, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE } from './check.js';

const dir = mkdtempSync(join(tmpdir(), 'paratext-check-'));
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

const BEEP = "{ name: 'beep', osc: 'BEL', when: { tty: true }, encode: '\\u0007', fallback: '' }";

describe('arguments', () => {
  it.each(['--help', '-h'])('%s prints the help and exits 0, rather than importing a file by that name', async (flag) => {
    const { code, out } = await run([flag]);
    expect(out.startsWith('usage: paratext check <plugin-file>\n')).toBe(true);
    expect(out).toContain('-V, --version  print the version');
    expect(code).toBe(EXIT_OK);
  });

  it.each(['--version', '-V'])('%s prints the package version and exits 0', async (flag) => {
    expect(await run([flag])).toEqual({ code: EXIT_OK, out: `${version}\n` });
  });

  it('an unknown flag is a usage error that names the flag', async () => {
    expect(await run(['--json'])).toEqual({ code: EXIT_USAGE, out: 'unknown option --json\nusage: paratext check <plugin-file>\n' });
  });

  it('no argument is a usage error with the bare usage line', async () => {
    expect(await run([])).toEqual({ code: EXIT_USAGE, out: 'usage: paratext check <plugin-file>\n' });
  });
});

describe('the report', () => {
  it('lists each capability with both projections, then ends in ok', async () => {
    const { code, out } = await run([file(`export default { name: 'acme', capabilities: { beep: ${BEEP}, title: { name: 'title', osc: 2, when: {}, encode: 'x{text}', fallback: '{text}' } } };`)]);
    expect(out).toBe('acme — 2 capabilities\n  beep  osc BEL  encode "\\u0007"  fallback ""\n  title  osc 2  encode "x{text}"  fallback "{text}"\nacme: ok\n');
    expect(code).toBe(EXIT_OK);
  });

  it('reads a module with no default export as the plugin itself', async () => {
    const { code, out } = await run([file(`export const name = 'bare';\nexport const capabilities = { beep: ${BEEP} };`)]);
    expect(out).toBe('bare — 1 capabilities\n  beep  osc BEL  encode "\\u0007"  fallback ""\nbare: ok\n');
    expect(code).toBe(EXIT_OK);
  });

  it('refuses a plugin that registers but contributes no capability, with the code and the fix', async () => {
    const { code, out } = await run([file("export default { name: 'quiet', tokens: {} };")]);
    expect(out).toBe(
      'quiet — 0 capabilities\nE_NO_CONTRIBUTION: quiet registers, but contributes nothing paratext reads\n' +
        '  fix: add a `capabilities` section — a key another package in the family reads is allowed in the same object, but `paratext check` cannot show it\n',
    );
    expect(code).toBe(EXIT_RUNTIME);
  });

  it('refuses a malformed plugin with its code and fix, and prints no report', async () => {
    const { code, out } = await run([file("export default { name: 'typo', capabilities: { beep: { name: 'beep', osc: 'BEL', when: {}, encode: '\\u0007' } } };")]);
    expect(out).toMatch(/^E_NO_STATIC_PROJECTION: plugin "typo": capabilities\.beep: fallback must be a template, even if it is empty — rule 6 has no opt-out\n {2}fix: add `fallback: "…"`/);
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
