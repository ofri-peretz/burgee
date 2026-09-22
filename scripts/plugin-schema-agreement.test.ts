/**
 * The family schema and each host's own validator give the same verdict.
 *
 * `plugin-schema-lock` holds that the schema *names* every key a host reads. This holds that it
 * describes each one *correctly*: a definition stricter than its host refuses a plugin that
 * works — in a model's hands, since five eval cases give it the schema as the contract — and one
 * looser than its host teaches a shape the host then rejects. Neither is visible from the file.
 *
 * Only data-level rules are compared. JSON Schema cannot say "is a function", so `static`, `run`,
 * `read` and `handler` are described and required, not typed; a host refusing a non-function
 * there is the host's half, and no case below asks the schema to agree with it.
 *
 * The schema is walked with flagstaff's own `check`, the code a plugin is refused by, rather
 * than a second walker that could disagree with it.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { validate as bellpull } from '../packages/bellpull/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { validate as burgee } from '../packages/burgee/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { validate as caique } from '../packages/caique/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { validate as closeout } from '../packages/closeout/src/plugin.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check, type Root } from '../packages/flagstaff/src/conforms.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { validate as seniority } from '../packages/seniority/src/plugin.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FAMILY = JSON.parse(readFileSync(join(root, 'packages/flagstaff/src/schema.json'), 'utf8')) as Root;

const schemaAccepts = (plugin: unknown): boolean => check(plugin, FAMILY, 'plugin') === undefined;
function hostAccepts(validate: (plugin: unknown) => void, plugin: unknown): boolean {
  try {
    validate(plugin);
    return true;
  } catch {
    return false;
  }
}

const noop = (): string => '';
const base = { name: 't' };

/** Per host: one plugin it reads, and data-level mistakes it refuses, each one the schema can express. */
const HOSTS = [
  {
    host: 'bellpull',
    validate: bellpull,
    valid: { ...base, resolvers: { asdf: { rank: -10, paths: ['{ASDF_DATA_DIR}/shims', '/opt/bin', 'C:\\tools'], when: { envAny: ['ASDF_DATA_DIR'], platform: ['linux'] } } } },
    refused: {
      'a resolver with no rank': { ...base, resolvers: { a: { paths: ['/opt/bin'] } } },
      'a resolver with no paths': { ...base, resolvers: { a: { rank: 1, paths: [] } } },
      'a relative path': { ...base, resolvers: { a: { rank: 1, paths: ['bin'] } } },
      'a `when.platform` that is not a list': { ...base, resolvers: { a: { rank: 1, paths: ['/opt/bin'], when: { platform: 'linux' } } } },
    },
  },
  {
    host: 'caique',
    validate: caique,
    valid: { ...base, widgets: { rating: { static: noop, sample: { running: {}, done: {} } } } },
    refused: {
      'a widget with no static projection': { ...base, widgets: { rating: { frame: noop } } },
      'a sample missing `done`': { ...base, widgets: { rating: { static: noop, sample: { running: {} } } } },
    },
  },
  {
    host: 'closeout',
    validate: closeout,
    valid: { ...base, handlers: [{ name: 'unlock', phase: 'flush', run: noop }] },
    refused: {
      'handlers that are not a list': { ...base, handlers: { unlock: { name: 'unlock', run: noop } } },
      'a handler with no name': { ...base, handlers: [{ run: noop }] },
      'the `restore` phase, which is closeout’s own': { ...base, handlers: [{ name: 'unlock', phase: 'restore', run: noop }] },
    },
  },
  {
    host: 'seniority',
    validate: seniority,
    valid: { ...base, sources: { vault: { rank: 25, values: { region: 'us' }, location: 'vault://app' } } },
    refused: {
      'rank 0, which would tie the flag': { ...base, sources: { vault: { rank: 0, values: {} } } },
      'rank 40, which would tie the default': { ...base, sources: { vault: { rank: 40, values: {} } } },
      'a fractional rank': { ...base, sources: { vault: { rank: 2.5, values: {} } } },
      '`values` that are not an object': { ...base, sources: { vault: { rank: 5, values: 'region=us' } } },
    },
  },
  {
    host: 'burgee',
    validate: burgee,
    valid: {
      ...base,
      contract: 1,
      enforce: 'pre',
      commands: [{ path: ['deploy'], description: 'ship it', options: { dryRun: { type: 'boolean' } }, effects: 'non_idempotent' }],
      hooks: { preRun: { filter: { command: /^deploy/ }, handler: noop } },
    },
    refused: {
      'a command with no path': { ...base, contract: 1, commands: [{ options: {}, effects: 'read_only' }] },
      'an option of no known type': { ...base, contract: 1, commands: [{ path: ['x'], options: { tags: { type: 'array' } }, effects: 'read_only' }] },
      'an effects burgee does not know': { ...base, contract: 1, commands: [{ path: ['x'], options: {}, effects: 'sometimes' }] },
      'a hook stage that does not exist': { ...base, contract: 1, hooks: { later: { handler: noop } } },
      'an enforce that is neither pre nor post': { ...base, contract: 1, enforce: 'first' },
    },
  },
];

describe.each(HOSTS)('$host and the family schema agree', ({ host, validate, valid, refused }) => {
  it(`both accept a plugin ${host} reads`, () => {
    expect(hostAccepts(validate, valid), `${host} refused its own valid fixture`).toBe(true);
    expect(check(valid, FAMILY, 'plugin'), `the family schema refused a plugin ${host} accepts`).toBeUndefined();
  });

  it.each(Object.entries(refused))('both refuse %s', (_, plugin) => {
    expect(hostAccepts(validate, plugin), `${host} accepted it`).toBe(false);
    expect(schemaAccepts(plugin), `the family schema accepts what ${host} refuses — its definition is looser than the host`).toBe(false);
  });
});
