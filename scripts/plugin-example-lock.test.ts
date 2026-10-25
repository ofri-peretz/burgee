/**
 * The plugins page's headline — one plugin object extends every layer — is a file every host's
 * own `check` accepts, not an illustration.
 *
 * `examples/plugins/acme.mjs` is embedded verbatim in `apps/docs/content/docs/plugins.mdx`. This
 * runs each of the nine `check` commands against it, the command an author runs, and the family
 * schema over it. A host that starts refusing the example, or an example that stops contributing
 * to a host, fails here before the page says something the packages do not do.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { check as bellpull } from '../packages/bellpull/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { checkPlugin as burgee } from '../packages/burgee/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as caique } from '../packages/caique/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as closeout } from '../packages/closeout/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as schemaCheck, type Root } from '../packages/flagstaff/src/conforms.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { validate as flagstaff } from '../packages/flagstaff/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as linegauge } from '../packages/linegauge/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as paratext } from '../packages/paratext/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as roundel } from '../packages/roundel/src/check.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check as seniority } from '../packages/seniority/src/check.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXAMPLE = join(root, 'examples/plugins/acme.mjs');
/** The example's default export — the object an author exports, as each host loads it. */
async function loadExample(): Promise<Record<string, unknown>> {
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the module under test is this repository's own committed example, named by a constant
  return ((await import(EXAMPLE)) as { default: Record<string, unknown> }).default;
}

type Check = (argv: readonly string[], write: (s: string) => void) => Promise<number>;

/** The hosts whose `check` is a command printing a report — flagstaff's lives in its bin, run below. */
const COMMANDS: { host: string; check: Check }[] = [
  { host: 'bellpull', check: bellpull },
  { host: 'caique', check: caique },
  { host: 'closeout', check: closeout },
  { host: 'linegauge', check: linegauge },
  { host: 'paratext', check: paratext },
  { host: 'roundel', check: roundel },
  { host: 'seniority', check: seniority },
];

describe('one plugin object extends every layer', () => {
  it.each(COMMANDS)('$host check accepts it and names what it contributes', async ({ host, check }) => {
    let out = '';
    const code = await check([EXAMPLE], (s) => {
      out += s;
    });
    expect(out.trimEnd().split('\n').at(-1), `${host} check did not end in ok:\n${out}`).toBe('acme: ok');
    expect(code).toBe(0);
  });

  it('burgee check accepts it and reports the contributed command', async () => {
    const report = await burgee(EXAMPLE);
    expect(report).toMatchObject({ name: 'acme', commands: [{ path: 'doctor', effects: 'read_only' }] });
  });

  // `plugin-contract` C2 and C3: the one command an author runs reaches every layer the example
  // extends, each through its own installed `check` (the workspace links them under
  // `node_modules/`, built before this suite), and flagstaff's renders the spinner in all five
  // modes. A layer that stops running, or starts refusing, fails here by name.
  it('burgee check runs every other layer’s own check on it, and each accepts it', async () => {
    const report = (await burgee(EXAMPLE)) as { layers?: { host: string; exitCode?: number; output?: string }[] };
    const ran = (report.layers ?? []).map(({ host, exitCode, output }) => ({ host, exitCode, ok: output?.trimEnd().endsWith('acme: ok') }));
    expect(ran).toEqual(['roundel', 'flagstaff', 'linegauge', 'paratext', 'seniority', 'bellpull', 'closeout', 'caique'].map((host) => ({ host, exitCode: 0, ok: true })));
  });

  // The intent's third criterion, as worded: `burgee check` on a plugin missing `static` fails
  // with `E_NO_STATIC_PROJECTION`. flagstaff is the layer that refuses; burgee carries its code and
  // fix. The plugin sits under the repository's `node_modules/.cache` so the walk up finds the
  // workspace's flagstaff, as it would in an author's project.
  it('burgee check refuses a spinner with no static projection, with flagstaff’s own code and fix', async () => {
    mkdirSync(join(root, 'node_modules', '.cache'), { recursive: true });
    const dir = mkdtempSync(join(root, 'node_modules', '.cache', 'plugin-c3-'));
    try {
      const file = join(dir, 'no-static.mjs');
      writeFileSync(file, "export default { name: 'nostatic', contract: 1, spinners: { bare: { frames: ['a', 'b'], interval: 80 } } };\n");
      expect(await burgee(file)).toMatchObject({ refused: { code: 'E_NO_STATIC_PROJECTION', message: expect.stringMatching(/^flagstaff: /u) as string, fix: expect.any(String) as string }, exitCode: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('burgee check carries flagstaff’s rendering of the spinner in all five modes', async () => {
    const report = (await burgee(EXAMPLE)) as { layers?: { host: string; output?: string }[] };
    const flagstaffSaid = report.layers?.find((layer) => layer.host === 'flagstaff')?.output ?? '';
    for (const mode of ['tty', 'pipe', 'ci', 'json', 'accessible']) expect(flagstaffSaid, `no ${mode} rendering`).toMatch(new RegExp(`^ {2}${mode} +\\S`, 'mu'));
  });

  it('flagstaff accepts it — validated against its slice and registered', async () => {
    const plugin = await loadExample();
    expect(() => flagstaff(plugin)).not.toThrow();
  });

  it('the whole family schema describes it, key by key', async () => {
    const family = JSON.parse(readFileSync(join(root, 'packages/flagstaff/src/schema.json'), 'utf8')) as Root & { properties: Record<string, unknown> };
    const plugin = await loadExample();
    expect(schemaCheck(plugin, family, 'plugin')).toBeUndefined();
    const undescribed = Object.keys(plugin).filter((key) => !(key in family.properties));
    expect(undescribed, 'the example uses a key the published schema does not describe').toEqual([]);
  });
});
