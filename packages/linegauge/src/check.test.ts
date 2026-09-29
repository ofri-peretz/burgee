/**
 * `linegauge check` — driven in this process, through `check()` itself.
 *
 * `scripts/plugin-check-lock.test.ts` holds the contract every host's `check` shares, but it
 * runs in the workspace's process and is invisible to this package's coverage. This file is
 * linegauge's own: the argument handling the shared lock does not reach (`--help`, `--version`,
 * an unknown flag), the report's exact rows — the span, the built-in answer and the new one —
 * the two shapes a plugin module can export, and the one error `check` does not own and must
 * not swallow.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { check, EXIT_OK, EXIT_RUNTIME, EXIT_USAGE } from './check.js';
import { overrides, register, setOverrides } from './plugin.js';

const dir = mkdtempSync(join(tmpdir(), 'linegauge-check-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Registration is global, so every case starts and ends with nothing registered. */
afterEach(() => {
  for (const name of [...overrides().keys()]) setOverrides(name, {});
});

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
    expect(out.startsWith('usage: linegauge check <plugin-file>\n')).toBe(true);
    expect(out).toContain('-V, --version  print the version');
    expect(code).toBe(EXIT_OK);
  });

  it.each(['--version', '-V'])('%s prints the package version and exits 0', async (flag) => {
    expect(await run([flag])).toEqual({ code: EXIT_OK, out: `${version}\n` });
  });

  it('an unknown flag is a usage error that names the flag', async () => {
    expect(await run(['--wide'])).toEqual({ code: EXIT_USAGE, out: 'unknown option --wide\nusage: linegauge check <plugin-file>\n' });
  });

  it('no argument is a usage error with the bare usage line', async () => {
    expect(await run([])).toEqual({ code: EXIT_USAGE, out: 'usage: linegauge check <plugin-file>\n' });
  });
});

describe('the report', () => {
  it('lists every range with its span, the built-in answer and the new one, then ends in ok', async () => {
    const plugin = `export default { name: 'acme', widths: {
      icons: { ranges: [[0xE0A0, 0xE0A0], [0xF000, 0xF2FF]], columns: 2, why: 'Nerd Font' },
      marks: { ranges: [[0x301, 0x301]], columns: 1, why: 'reserves a cell' },
    } };`;
    const { code, out } = await run([file(plugin)]);
    expect(out).toBe(
      'acme — 3 widths\n' +
        '  icons  U+E0A0  built-in 1 → 2  — Nerd Font\n' +
        '  icons  U+F000..U+F2FF  built-in 1 → 2  — Nerd Font\n' +
        '  marks  U+0301  built-in 0 → 1  — reserves a cell\n' +
        'acme: ok\n',
    );
    expect(code).toBe(EXIT_OK);
  });

  it('writes a code point past U+FFFF with all of its digits', async () => {
    const { out } = await run([file("export default { name: 'emoji', widths: { narrow: { ranges: [[0x1F600, 0x1F600]], columns: 1, why: 'a font with no emoji' } } };")]);
    expect(out).toContain('  narrow  U+1F600  built-in 2 → 1  — a font with no emoji\n');
  });

  it('reads a module with no default export as the plugin itself', async () => {
    const { code, out } = await run([file("export const name = 'bare';\nexport const widths = { icons: { ranges: [[0xE0A0, 0xE0A0]], columns: 2, why: 'x' } };")]);
    expect(out).toBe('bare — 1 widths\n  icons  U+E0A0  built-in 1 → 2  — x\nbare: ok\n');
    expect(code).toBe(EXIT_OK);
  });

  it('measures the built-in answer with every earlier plugin taken down, and leaves only this one registered', async () => {
    register({ name: 'earlier', widths: { hide: { ranges: [[0xe0_a0, 0xe0_a0]], columns: 0, why: 'registered before check ran' } } });
    const { out } = await run([file("export default { name: 'later', widths: { icons: { ranges: [[0xE0A0, 0xE0A0]], columns: 2, why: 'x' } } };")]);
    expect(out, 'the "built-in" column showed another plugin’s answer').toContain('built-in 1 → 2');
    expect([...overrides().keys()]).toEqual(['later']);
  });
});

describe('refusals', () => {
  it('refuses a plugin that registers but contributes no width, with the code and the fix', async () => {
    const { code, out } = await run([file("export default { name: 'quiet', tokens: { ok: '#336699' } };")]);
    expect(out).toBe(
      'quiet — 0 widths\nE_NO_CONTRIBUTION: quiet registers, but contributes nothing linegauge reads\n' +
        '  fix: add a `widths` section — a key another package in the family reads is allowed in the same object, but `linegauge check` cannot show it\n',
    );
    expect(code).toBe(EXIT_RUNTIME);
  });

  it('refuses `widths: null` with the schema code and prints no report', async () => {
    const { code, out } = await run([file("export default { name: 'nil', widths: null };")]);
    expect(out).toBe('E_PLUGIN_SCHEMA: `widths` is an object keyed by name\n  fix: widths: { "nerd-font-icons": { ranges: [[0xE000, 0xF8FF]], columns: 2, why: "…" } }\n');
    expect(code).toBe(EXIT_RUNTIME);
  });

  it('refuses an override with no ranges, rather than reporting it as zero rows', async () => {
    const { code, out } = await run([file("export default { name: 'rangeless', widths: { icons: { columns: 2, why: 'x' } } };")]);
    expect(out).toBe('E_PLUGIN_SCHEMA: widths.icons.ranges is a non-empty array of [low, high] pairs\n  fix: ranges: [[0xE000, 0xF8FF]]\n');
    expect(code).toBe(EXIT_RUNTIME);
  });

  it('refuses a plugin file that registers itself on import, with the code and the fix', async () => {
    const host = new URL('plugin.ts', import.meta.url).pathname;
    const { code, out } = await run([file(`import { register } from '${host}';\nregister({ name: 'eager', widths: { bad: { ranges: [[2, 1]], columns: 1, why: 'x' } } });\nexport default {};`)]);
    expect(out).toBe('E_PLUGIN_SCHEMA: widths.bad.ranges[0] runs backwards: [2, 1]\n  fix: each range is [low, high], both integers in U+0000..U+10FFFF, low first\n');
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
