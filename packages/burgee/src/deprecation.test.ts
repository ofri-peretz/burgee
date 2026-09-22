/**
 * D1 / M5: a deprecation names its replacement, so help, `--schema` and the warning all carry
 * it. burgee's own door refuses a bare `deprecated: true`; the façades do not go through that
 * door, because commander and yargs accept the bare form and their graded suites expect it.
 */
import { describe, expect, it } from 'vitest';

import { renderHelp } from './help.js';
import { defineCommand } from './index.js';
import { Manifest } from './manifest.js';

const run = (): undefined => undefined;

describe('a deprecation names its replacement (D1, M5)', () => {
  it('refuses a command deprecated with no replacement, and says how to name one', () => {
    expect(() => defineCommand({ name: 'old', deprecated: true, effects: 'read_only', run })).toThrow(/command "old" is deprecated with no replacement.*deprecated: '/);
  });
  it('refuses an option deprecated with no replacement', () => {
    expect(() => defineCommand({ name: 'x', options: { legacy: { type: 'boolean', deprecated: true } }, effects: 'read_only', run })).toThrow(/option "legacy" of "x" is deprecated with no replacement/);
  });
  it('refuses an empty replacement, which would render as "use " and name nothing', () => {
    expect(() => defineCommand({ name: 'old', deprecated: '', effects: 'read_only', run })).toThrow(/no replacement/);
  });
  it('accepts a named replacement, and false', () => {
    expect(() => defineCommand({ name: 'old', deprecated: 'new', options: { legacy: { type: 'boolean', deprecated: '--force' } }, effects: 'read_only', run })).not.toThrow();
    expect(() => defineCommand({ name: 'kept', deprecated: false, effects: 'read_only', run })).not.toThrow();
  });
  it('a façade node still renders the bare form, as commander and yargs do', () => {
    const manifest = new Manifest();
    manifest.add({ path: ['app'], options: {} });
    manifest.add({ path: ['app', 'old'], description: 'Legacy', deprecated: true, options: {}, run });
    const root = manifest.find(['app']);
    if (root === undefined) throw new Error('fixture');
    expect(renderHelp(manifest, root)).toMatch(/old +Legacy \(deprecated\)/);
  });
});
