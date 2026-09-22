/**
 * The plugins page's headline — one plugin object extends every layer — is a file every host's
 * own `check` accepts, not an illustration.
 *
 * `examples/plugins/acme.mjs` is embedded verbatim in `apps/docs/content/docs/plugins.mdx`. This
 * runs each of the nine `check` commands against it, the command an author runs, and the family
 * schema over it. A host that starts refusing the example, or an example that stops contributing
 * to a host, fails here before the page says something the packages do not do.
 */
import { readFileSync } from 'node:fs';
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
