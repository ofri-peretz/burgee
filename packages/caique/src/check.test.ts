/**
 * `caique check`, in-process: `check()` takes argv and a writer and returns the exit code, so
 * every line an author reads and every code the bin leaves with is asserted here without
 * spawning. `cli.ts` is the ten lines that hand it `process.argv` and `process.stdout`.
 *
 * The plugin files are real modules written to a temporary directory, because what `check`
 * does first is `import()` one — a default export, a module of named exports, a file that
 * throws while it loads — and a stub of `import()` would test none of that.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { check, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE } from './check.js';
import { PluginError, registered } from './plugin.js';

let dir = '';
let files = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'caique-check-'));
  // A plugin that refuses itself while it loads needs the host's own error class, the one a
  // real plugin would import from caique; handed over on globalThis so the fixture stays a file.
  (globalThis as Record<string, unknown>)['__caiquePluginError'] = PluginError;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete (globalThis as Record<string, unknown>)['__caiquePluginError'];
});

/** Writes `source` as a fresh module — a new name each time, so no import is served from cache. */
function pluginFile(source: string): string {
  files += 1;
  const file = join(dir, `plugin-${String(files)}.mjs`);
  writeFileSync(file, source);
  return file;
}

/** Runs `check` and returns its exit code and everything it wrote. */
async function run(argv: readonly string[]): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await check(argv, (s) => {
    out += s;
  });
  return { code, out };
}

describe('the arguments', () => {
  it.each(['--help', '-h'])('%s prints the help and exits 0 without loading anything', async (flag) => {
    const { code, out } = await run([flag]);
    expect(code).toBe(EXIT_OK);
    expect(out).toMatch(/^usage: caique check <plugin-file>\n\nLoad a plugin file/);
    expect(out).toContain('-V, --version');
  });

  it.each(['--version', '-V'])('%s prints the package version and exits 0', async (flag) => {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(await run([flag])).toEqual({ code: EXIT_OK, out: `${version}\n` });
  });

  it('no argument is a usage error, exit 2', async () => {
    expect(await run([])).toEqual({ code: EXIT_USAGE, out: 'usage: caique check <plugin-file>\n' });
  });

  it('an unknown flag is a usage error naming the flag, never a path to import', async () => {
    expect(await run(['--nope'])).toEqual({ code: EXIT_USAGE, out: 'unknown option --nope\nusage: caique check <plugin-file>\n' });
  });
});

describe('a plugin that contributes', () => {
  it('lists each widget’s static projection rendered with its sample, then ok as the last line', async () => {
    const file = pluginFile(`export default {
      name: 'acme',
      tokens: { error: '#b3261e' },
      widgets: {
        'acme-rating': { static: (spec) => spec.message + ' [' + spec.phase + ']', sample: { running: { phase: 'asking' }, done: { phase: 'answered' } } },
      },
    };`);
    expect(await run([file])).toEqual({ code: EXIT_OK, out: 'acme — 1 widgets\n  acme-rating  static "preview [answered]"\nacme: ok\n' });
  });

  it('reads a module of named exports as the plugin when there is no default export', async () => {
    const file = pluginFile(`export const name = 'named';
      export const widgets = { 'named-kind': { static: () => 'drawn', sample: { running: null, done: null } } };`);
    expect(await run([file])).toEqual({ code: EXIT_OK, out: 'named — 1 widgets\n  named-kind  static "drawn"\nnamed: ok\n' });
  });

  it('says a widget without a sample cannot be previewed, rather than rendering it with nothing', async () => {
    const file = pluginFile(`export default { name: 'bare', widgets: { 'bare-kind': { static: () => 'never shown' } } };`);
    const { code, out } = await run([file]);
    expect(code).toBe(EXIT_OK);
    expect(out).toContain('  bare-kind  (no sample — give the widget a `sample` to preview its static projection)\n');
    expect(out).not.toContain('never shown');
  });

  it('forgets whatever was registered before, so the report is this file’s alone', async () => {
    await run([pluginFile(`export default { name: 'first', widgets: { 'first-kind': { static: () => '' } } };`)]);
    await run([pluginFile(`export default { name: 'second', widgets: { 'second-kind': { static: () => '' } } };`)]);
    expect(registered().map((p) => p.name)).toEqual(['second']);
  });
});

describe('a refusal is the code, the message and the fix, exit 1 (R8)', () => {
  it('a plugin that registers but contributes no widget — how a misspelled `widgets` tells on itself', async () => {
    const file = pluginFile(`export default { name: 'typo', widget: { 'typo-kind': { static: () => '' } } };`);
    const { code, out } = await run([file]);
    expect(code).toBe(EXIT_RUNTIME);
    expect(out).toMatch(/^typo — 0 widgets\nE_NO_CONTRIBUTION: typo registers, but contributes nothing caique reads\n {2}fix: add a `widgets` section/);
    expect(out).not.toContain('typo: ok');
  });

  it('a static projection that throws on its own sample, by its message or by the value thrown — never followed by ok', async () => {
    // This case used to pin exit 0 and `loud: ok` after both rows said the projection threw: a
    // widget whose `static` throws gives a pipe, an agent and a screen reader nothing.
    const file = pluginFile(`export default { name: 'loud', widgets: {
      'loud-error': { static: () => { throw new Error('no spec.choices'); }, sample: { running: {}, done: {} } },
      'loud-value': { static: () => { throw 'a bare string'; }, sample: { running: {}, done: {} } },
      'loud-fine': { static: () => 'drawn', sample: { running: {}, done: {} } },
    } };`);
    const fix = '  fix: make `static` return a string for its `sample.done` — it is what a pipe, an agent and a screen reader get, and a throw leaves them nothing\n';
    expect(await run([file])).toEqual({
      code: EXIT_RUNTIME,
      out:
        'loud — 3 widgets\n  loud-error  static projection threw: no spec.choices\n  loud-value  static projection threw: a bare string\n  loud-fine  static "drawn"\n' +
        `E_NO_STATIC_PROJECTION: plugin "loud": widget "loud-error"’s static projection threw on its own sample: no spec.choices\n${fix}` +
        `E_NO_STATIC_PROJECTION: plugin "loud": widget "loud-value"’s static projection threw on its own sample: a bare string\n${fix}`,
    });
  });

  it('a plugin the schema refuses', async () => {
    const file = pluginFile(`export default { name: 'acme', widgets: { 'acme-rating': { frame: () => '' } } };`);
    expect(await run([file])).toEqual({
      code: EXIT_RUNTIME,
      out: 'E_NO_STATIC_PROJECTION: plugin "acme": widget "acme-rating" has no static projection\n  fix: add `static: (spec) => "…"` — it is what a pipe, an agent and a screen reader get\n',
    });
  });

  it('a plugin file that refuses itself while it loads, before any line of the report could run', async () => {
    const file = pluginFile(`throw new globalThis.__caiquePluginError('E_PLUGIN_CONTRACT', 'refused on import', 'lower the contract');`);
    expect(await run([file])).toEqual({ code: EXIT_RUNTIME, out: 'E_PLUGIN_CONTRACT: refused on import\n  fix: lower the contract\n' });
  });
});

describe('what is not a refusal', () => {
  it('rethrows any other error, so the bin reports it as the crash it is', async () => {
    const file = pluginFile(`throw new TypeError('not a plugin problem');`);
    await expect(run([file])).rejects.toThrow(new TypeError('not a plugin problem'));
  });
});
