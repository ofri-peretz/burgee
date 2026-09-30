/**
 * `seniority check <plugin-file>`, driven in-process: `check.ts` takes argv and a writer and
 * returns an exit code, which is what makes this possible without spawning `cli.js`.
 *
 * Plugin files are real `.mjs` files in a temp directory, because the command's first act is an
 * `import()` of a path, and a path is what a user hands it.
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { check, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE } from './check.js';
import { register, registered, reset } from './plugin.js';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'seniority-check-')));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  reset();
});

/** The registry a plugin file imports to register itself — the same module instance `check` resets. */
const PLUGIN_MODULE = JSON.stringify(new URL('./plugin.ts', import.meta.url).href);

let files = 0;
/** A plugin module on disk; each call a fresh file, so no import is served from the module cache. */
const plugin = (body: string): string => {
  files += 1;
  const at = join(root, `plugin-${String(files)}.mjs`);
  writeFileSync(at, body);
  return at;
};

/** Run the command and collect everything it wrote. */
const run = async (argv: readonly string[]): Promise<{ code: number; out: string }> => {
  let out = '';
  const code = await check(argv, (s) => {
    out += s;
  });
  return { code, out };
};

describe('arguments', () => {
  it.each([['-h'], ['--help']])('%s prints the help and exits 0', async (flag) => {
    const { code, out } = await run([flag]);
    expect(code).toBe(EXIT_OK);
    expect(out).toMatch(/^usage: seniority check <plugin-file>\n\nLoad a plugin file/);
    expect(out).toContain('-V, --version  print the version');
  });

  it.each([['-V'], ['--version']])('%s prints the package’s own version and exits 0', async (flag) => {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(await run([flag])).toEqual({ code: EXIT_OK, out: `${version}\n` });
  });

  it('refuses no argument, and a flag it does not know, as usage errors — never as a file', async () => {
    expect(await run([])).toEqual({ code: EXIT_USAGE, out: 'usage: seniority check <plugin-file>\n' });
    expect(await run(['--nope'])).toEqual({ code: EXIT_USAGE, out: 'unknown option --nope\nusage: seniority check <plugin-file>\n' });
  });

  it('is the constant contract the family restates: 0, 1, 2', () => {
    expect([EXIT_OK, EXIT_RUNTIME, EXIT_USAGE]).toEqual([0, 1, 2]);
  });
});

describe('a plugin that contributes', () => {
  it('names each source, and says ok last', async () => {
    const at = plugin('export default { name: "acme", sources: { vault: { rank: 15, values: { a: 1 } }, ci: { rank: 12, read: () => undefined } } };');
    expect(await run([at])).toEqual({ code: EXIT_OK, out: 'acme — 2 sources\n  vault\n  ci\nacme: ok\n' });
  });

  it('reads a module with no default export as the plugin itself', async () => {
    const at = plugin('export const name = "named"; export const sources = { vault: { rank: 15, values: {} } };');
    expect(await run([at])).toEqual({ code: EXIT_OK, out: 'named — 1 sources\n  vault\nnamed: ok\n' });
  });

  it('checks the plugin alone: earlier registrations, and its own import-time one, are cleared first', async () => {
    register({ name: 'earlier', sources: { other: { rank: 15, values: {} } } });
    const at = plugin(`import { register } from ${PLUGIN_MODULE};\nconst p = { name: "self", sources: { vault: { rank: 15, values: {} } } };\nregister(p);\nexport default p;`);
    expect(await run([at])).toEqual({ code: EXIT_OK, out: 'self — 1 sources\n  vault\nself: ok\n' });
    expect(registered().map((p) => p.name)).toEqual(['self']);
  });
});

describe('refusals', () => {
  it('refuses a plugin that contributes nothing seniority reads, after saying what it found', async () => {
    const at = plugin('export default { name: "empty", flags: {} };');
    const { code, out } = await run([at]);
    expect(code).toBe(EXIT_RUNTIME);
    expect(out).toMatch(/^empty — 0 sources\nE_NO_CONTRIBUTION: empty registers, but contributes nothing seniority reads\n {2}fix: add a `sources` section/);
    expect(out).not.toContain('ok');
  });

  it('refuses a malformed plugin with its code and fix, not a stack', async () => {
    const at = plugin('export default { name: "bad", sources: { vault: { rank: 0, values: {} } } };');
    const { code, out } = await run([at]);
    expect(code).toBe(EXIT_RUNTIME);
    expect(out).toMatch(/^E_PLUGIN_SCHEMA: plugin "bad": source "vault" has rank 0\n {2}fix: a rank is an integer strictly between/);
  });

  it('refuses a plugin whose own import-time registration throws, through the same door', async () => {
    const at = plugin(`import { register } from ${PLUGIN_MODULE};\nregister({ name: "" });\nexport default {};`);
    const { code, out } = await run([at]);
    expect(code).toBe(EXIT_RUNTIME);
    expect(out).toMatch(/^E_PLUGIN_SCHEMA: a plugin needs a name\n {2}fix: /);
  });

  it('rethrows anything that is not a plugin refusal — a missing file is the program’s to report', async () => {
    await expect(run([join(root, 'no-such-plugin.mjs')])).rejects.toThrow(/no-such-plugin\.mjs/);
  });
});
