/**
 * Lock — every plugin host has a `check`, and every `check` behaves the same way.
 *
 * PRINCIPLES 7 asks three things of an extension surface: the plugin is data validated against
 * one published schema; there is a **`check` command that renders it every way it can be
 * seen**; and the bar is measured. Until 2026-09-22 the first was built in nine hosts and the
 * second in one — `flagstaff check` — so an author writing a plugin for any of the other eight
 * found out what it did by shipping it into a program. A surface nobody can check is a surface
 * nobody outside this repository can write against.
 *
 * The eight checks are written per package, because each renders something different and each
 * package is an independent product. What they share is the **contract with the author**, and
 * that is what this file holds, identically, for every host:
 *
 *   1. a plugin this host reads is reported, contribution by contribution, and ends in `ok`;
 *   2. a malformed plugin is refused with a code from the family's vocabulary and a `fix`;
 *   3. a plugin with **nothing for this host** is refused too — `E_NO_CONTRIBUTION`. The schema
 *      allows unknown keys on purpose, so the same object registers everywhere, which means a
 *      misspelled key is silent. This is how that typo tells on itself;
 *   4. no argument is a usage error, exit 2.
 *
 * burgee's returns its report as data rather than printing it — its commands are documents the
 * engine renders — so it gets the same four cases in its own shape below.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { check as bellpull } from '../packages/bellpull/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { checkPlugin as burgee } from '../packages/burgee/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as caique } from '../packages/caique/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as closeout } from '../packages/closeout/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as linegauge } from '../packages/linegauge/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as paratext } from '../packages/paratext/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as roundel } from '../packages/roundel/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as seniority } from '../packages/seniority/src/check.js';

const dir = mkdtempSync(join(tmpdir(), 'plugin-check-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let serial = 0;
/** A plugin module on disk, because `check` takes a path — that is how an author runs it. */
function file(source: string): string {
  serial += 1;
  const at = join(dir, `p${String(serial)}.mjs`);
  writeFileSync(at, source);
  return at;
}

type Check = (argv: readonly string[], write: (s: string) => void) => Promise<number>;

async function run(check: Check, argv: readonly string[]): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await check(argv, (s) => {
    out += s;
  });
  return { code, out };
}

/** One plugin per host that it genuinely reads — the shapes each host's own suite registers. */
const HOSTS: { name: string; check: Check; valid: string; key: string }[] = [
  { name: 'bellpull', check: bellpull, key: 'resolvers', valid: "{ name: 't', resolvers: { asdf: { rank: -10, paths: ['{ASDF_DATA_DIR}/shims'], when: { envAny: ['ASDF_DATA_DIR'] } } } }" },
  { name: 'caique', check: caique, key: 'widgets', valid: "{ name: 't', widgets: { rating: { static: () => 'yes / no', sample: { running: {}, done: {} } } } }" },
  { name: 'closeout', check: closeout, key: 'handlers', valid: "{ name: 't', handlers: [{ name: 'unlock', run() {} }] }" },
  { name: 'linegauge', check: linegauge, key: 'widths', valid: "{ name: 't', widths: { icons: { ranges: [[0xE0A0, 0xE0A0]], columns: 2, why: 'a Nerd Font glyph, measured in the test' } } }" },
  { name: 'paratext', check: paratext, key: 'capabilities', valid: "{ name: 't', capabilities: { beep: { name: 'beep', osc: 'BEL', when: { tty: true }, encode: '\\u0007', fallback: '' } } }" },
  { name: 'roundel', check: roundel, key: 'tokens', valid: "{ name: 't', tokens: { ok: '#336699' } }" },
  { name: 'seniority', check: seniority, key: 'sources', valid: "{ name: 't', sources: { vault: { rank: 25, read: () => undefined } } }" },
];

describe.each(HOSTS)('$name check', ({ name, check, valid, key }) => {
  it('reports a plugin it reads, contribution by contribution, and ends in ok', async () => {
    const { code, out } = await run(check, [file(`export default ${valid};`)]);
    expect(out, `${name} check did not describe the plugin it was given`).toContain(`t — 1 ${key}`);
    expect(out.trimEnd().split('\n').at(-1), 'ok is the last line, after everything that justifies it').toBe('t: ok');
    expect(code).toBe(0);
  });

  it('refuses a malformed plugin with a code and a fix', async () => {
    const { code, out } = await run(check, [file(`export default { ${key}: {} };`)]);
    expect(out).toMatch(/^E_PLUGIN_[A-Z]+: /);
    expect(out).toContain('\n  fix: ');
    expect(code).toBe(1);
  });

  it('refuses a plugin that contributes nothing it reads, so a misspelled key tells on itself', async () => {
    const { code, out } = await run(check, [file("export default { name: 't', spinnerz: { dots: {} } };")]);
    expect(out).toContain('E_NO_CONTRIBUTION');
    expect(code).toBe(1);
  });

  it('is a usage error with no file', async () => {
    const { code, out } = await run(check, []);
    expect(out).toContain(`usage: ${name} check`);
    expect(code).toBe(2);
  });
});

describe('burgee check returns its report as data', () => {
  it('describes contributed commands and hooks', async () => {
    const report = await burgee(file("export default { name: 't', contract: 1, commands: [{ path: ['deploy'], description: 'ship it', options: {}, effects: 'non_idempotent' }], hooks: { preRun: { filter: { command: /^deploy/ }, handler() {} } } };"));
    expect(report).toEqual({
      name: 't',
      commands: [{ path: 'deploy', description: 'ship it', effects: 'non_idempotent' }],
      hooks: [{ stage: 'preRun', applies: 'commands matching /^deploy/' }],
    });
  });

  it('refuses a malformed plugin as a document with an exit code', async () => {
    const report = await burgee(file('export default { commands: [] };'));
    expect(report).toMatchObject({ refused: { code: expect.stringMatching(/^E_PLUGIN_/), fix: expect.any(String) }, exitCode: 1 });
  });

  it('refuses a plugin that contributes nothing it reads', async () => {
    expect(await burgee(file("export default { name: 't', contract: 1, spinnerz: {} };"))).toMatchObject({ refused: { code: 'E_NO_CONTRIBUTION' }, exitCode: 1 });
  });

  it('runs a contributed command through the same door a first-party one takes', async () => {
    // No `effects`: `checkCommand` refuses this in a program, so `check` must refuse it too —
    // validating the shape alone would have said ok to a plugin the program then rejects.
    const report = await burgee(file("export default { name: 't', contract: 1, commands: [{ path: ['deploy'], description: 'ship it', options: {}, run() {} }] };"));
    expect(report).toMatchObject({ refused: { code: 'E_PLUGIN_SCHEMA' }, exitCode: 1 });
  });
});
