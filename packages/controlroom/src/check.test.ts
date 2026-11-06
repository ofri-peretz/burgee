import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { check, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE } from './check.js';

const dir = mkdtempSync(join(tmpdir(), 'controlroom-check-'));
afterAll(() => discard(dir));

let n = 0;
function file(source: string): string {
  n += 1;
  const path = join(dir, `plugin-${String(n)}.mjs`);
  writeFileSync(path, source);
  return path;
}

async function run(argv: string[]): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await check(argv, (s) => void (out += s));
  return { code, out };
}

describe('controlroom check', () => {
  it('reports each keymap as the hint it generates, each pane as what draws it, and ends in ok', async () => {
    const path = file(`export default {
      name: 'vim-keys',
      keymaps: { vim: { keys: { h: 'tab.prev', l: 'tab.next', q: 'quit' }, labels: { 'tab.prev': 'switch tab', 'tab.next': 'switch tab' } }, silent: { keys: { z: 'zz' } } },
      panes: { log: { component: 'log-tail', label: 'Log' }, tabs: { component: 'tab-bar' } },
    };`);
    const { code, out } = await run([path]);
    expect(code).toBe(EXIT_OK);
    expect(out).toBe(
      [
        'vim-keys — 2 keymaps, 2 panes',
        '  keymap vim  3 keys  hint: h/l switch tab',
        '  keymap silent  1 keys  hint: (no labels: bound, not advertised)',
        `  pane log  drawn by flagstaff's "log-tail", labelled "Log"`,
        `  pane tabs  drawn by flagstaff's "tab-bar"`,
        'vim-keys: ok',
        '',
      ].join('\n'),
    );
  });

  it('a module without a default export is read as the plugin itself', async () => {
    const { code, out } = await run([file(`export const name = 'named'; export const panes = { p: { component: 'tasks' } };`)]);
    expect(code).toBe(EXIT_OK);
    expect(out).toMatch(/^named: ok$/mu);
  });

  it('refuses a malformed plugin with a code and a fix', async () => {
    const { code, out } = await run([file(`export default { name: 'bad', keymaps: { k: { keys: { h: 1 } } } };`)]);
    expect(code).toBe(EXIT_RUNTIME);
    expect(out).toMatch(/^E_PLUGIN_SCHEMA: keymaps\.k\.keys must map.*\n {2}fix: /u);
  });

  it('refuses a plugin with nothing for this host: a misspelled key tells on itself', async () => {
    const { code, out } = await run([file(`export default { name: 'typo', keymap: { k: { keys: {} } } };`)]);
    expect(code).toBe(EXIT_RUNTIME);
    expect(out).toBe(
      'typo — 0 keymaps, 0 panes\nE_NO_CONTRIBUTION: typo registers, but contributes nothing controlroom reads\n' +
        '  fix: add a `keymaps` or `panes` section — a key another package in the family reads is allowed in the same object, but `controlroom check` cannot show it\n',
    );
  });

  it('no argument, or an unknown option, is a usage error', async () => {
    expect(await run([])).toEqual({ code: EXIT_USAGE, out: 'usage: controlroom check <plugin-file>\n' });
    expect((await run(['--nope'])).out).toMatch(/^unknown option --nope/u);
  });

  it.each(['--help', '-h'])('%s prints the help and exits 0', async (flag) => {
    const { code, out } = await run([flag]);
    expect(out).toMatch(/Exit 0 when it contributes/u);
    expect(code).toBe(EXIT_OK);
  });

  it.each(['--version', '-V'])('%s prints the version and exits 0', async (flag) => {
    const { code, out } = await run([flag]);
    expect(out).toMatch(/^\d+\.\d+\.\d+\n$/u);
    expect(code).toBe(EXIT_OK);
  });

  it('exits with the family’s three codes', () => {
    expect([EXIT_OK, EXIT_RUNTIME, EXIT_USAGE]).toEqual([0, 1, 2]);
  });

  it('an error that is not a refusal is not swallowed', async () => {
    await expect(run([join(dir, 'missing.mjs')])).rejects.toThrow();
  });
});

describe('a .json plugin', () => {
  it('is read as data, byte-order mark and all, and reported as the same module would be', async () => {
    const data = { name: 42 };
    const asModule = await run([file(`export default ${JSON.stringify(data)};`)]);
    const json = join(dir, 'plugin-as-data.json');
    writeFileSync(json, `\uFEFF${JSON.stringify(data)}`);
    expect(await run([json])).toEqual(asModule);
  });
});
