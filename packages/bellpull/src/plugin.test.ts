/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The `resolvers` plugin host — PLAN step 1.5, `plugin-contract` R5a, R6, R7, R8.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { contributions, CONTRACT, directories, PluginError, register, registered, reset, substitute, validate } from './plugin.js';
import { type Runtime } from './runtime.js';

const linux = (env: Record<string, string | undefined> = {}): Runtime => ({ platform: 'linux', env, cwd: '/w' });

beforeEach(() => reset());

describe('a plugin is one plain object, shared by the family', () => {
  it('accepts a plugin that contributes nothing bellpull understands', () => {
    // The R1 property: a flagstaff plugin registers here and contributes nothing, and that
    // is not an error. Without it the family's "one object" claim is false.
    expect(() => register({ name: 'acme', spinners: { dots: { frames: ['.'], interval: 80, static: '.' } } })).not.toThrow();
    expect(registered()).toHaveLength(1);
    expect(contributions()).toEqual([]);
  });

  it('refuses a plugin that is not an object', () => {
    expect(() => register(() => undefined)).toThrow(PluginError);
    expect(() => register([])).toThrow(PluginError);
  });

  it('refuses a plugin with no name, because a shadowed resolver has to be reportable', () => {
    try {
      register({ resolvers: {} });
      expect.unreachable();
    } catch (error) {
      expect((error as PluginError).code).toBe('E_PLUGIN_SCHEMA');
      expect((error as PluginError).fix).toContain('name');
    }
  });

  it('refuses a newer contract than it knows, naming the package to upgrade (R6)', () => {
    try {
      register({ name: 'acme', contract: CONTRACT + 1 });
      expect.unreachable();
    } catch (error) {
      expect((error as PluginError).code).toBe('E_PLUGIN_CONTRACT');
      expect((error as PluginError).fix).toContain('bellpull');
    }
  });

  it('declares the same contract number as the rest of the family', () => {
    expect(CONTRACT).toBe(1);
  });
});

describe('a resolver is data, with no function anywhere in it (R7)', () => {
  it('registers a version manager’s shims as a search order', () => {
    register({
      name: 'asdf',
      resolvers: { asdf: { rank: -10, paths: ['{ASDF_DATA_DIR}/shims'], when: { envAny: ['ASDF_DATA_DIR'] } } },
    });
    expect(directories(linux({ ASDF_DATA_DIR: '/home/me/.asdf' }))).toEqual([{ dir: '/home/me/.asdf/shims', resolver: 'asdf', rank: -10 }]);
  });

  it('survives JSON, which is what "data" has to mean to be worth claiming', () => {
    const plugin = { name: 'asdf', contract: 1, resolvers: { asdf: { rank: -10, paths: ['/opt/shims'] } } };
    expect(() => validate(JSON.parse(JSON.stringify(plugin)))).not.toThrow();
  });

  it('projects the search order without resolving anything', () => {
    register({ name: 'a', resolvers: { late: { rank: 5, paths: ['/late'] } } });
    register({ name: 'b', resolvers: { early: { rank: -5, paths: ['/early'] } } });
    // rank, not registration order: a version manager registered second must still be able
    // to sit in front of PATH.
    expect(contributions().map((c) => c.name)).toEqual(['early', 'late']);
  });

  it('later wins on the same name, and says who it shadowed', () => {
    register({ name: 'a', resolvers: { shims: { rank: -1, paths: ['/a'] } } });
    register({ name: 'b', resolvers: { shims: { rank: -1, paths: ['/b'] } } });
    expect(contributions()).toEqual([{ name: 'shims', from: 'b', resolver: { rank: -1, paths: ['/b'] }, shadowed: ['a'] }]);
  });
});

describe('`when` decides whether a resolver applies', () => {
  beforeEach(() => {
    register({
      name: 'windows-only',
      resolvers: { choco: { rank: -1, paths: ['C:\\ProgramData\\chocolatey\\bin'], when: { platform: ['win32'] } } },
    });
  });

  it('drops a resolver whose platform is not this one', () => {
    expect(directories(linux())).toEqual([]);
  });

  it('keeps it where it belongs', () => {
    expect(directories({ platform: 'win32', env: {}, cwd: 'C:\\w' })).toHaveLength(1);
  });

  it('drops a resolver whose environment variable is not set', () => {
    reset();
    register({ name: 'nvm', resolvers: { nvm: { rank: -1, paths: ['{NVM_BIN}'], when: { envAny: ['NVM_BIN'] } } } });
    expect(directories(linux())).toEqual([]);
    expect(directories(linux({ NVM_BIN: '/nvm/bin' }))).toHaveLength(1);
  });
});

/**
 * The security half. A resolver decides what `run('node')` means, so the two refusals in
 * `plugin.ts`'s header are asserted here with the attack each one stops.
 */
describe('a resolver may only contribute absolute directories', () => {
  it('refuses a relative path at register(), where the author can see it', () => {
    try {
      register({ name: 'bad', resolvers: { local: { rank: -1, paths: ['node_modules/.bin'] } } });
      expect.unreachable();
    } catch (error) {
      expect((error as PluginError).code).toBe('E_PLUGIN_SCHEMA');
      // The message has to explain the attack, not just name the rule.
      expect((error as PluginError).fix).toContain('write');
    }
  });

  it('refuses `./` and `../`, which are the same attack spelled out', () => {
    expect(() => register({ name: 'bad', resolvers: { r: { rank: 0, paths: ['./bin'] } } })).toThrow(PluginError);
    expect(() => register({ name: 'bad', resolvers: { r: { rank: 0, paths: ['../../bin'] } } })).toThrow(PluginError);
  });

  it('drops a {VAR} that expands to something relative, which register() could not have known', () => {
    register({ name: 'tpl', resolvers: { r: { rank: 0, paths: ['{BASE}/bin'] } } });
    expect(substitute('{BASE}/bin', linux({ BASE: 'relative' }))).toBeUndefined();
    expect(directories(linux({ BASE: 'relative' }))).toEqual([]);
    expect(directories(linux({ BASE: '/opt' }))).toEqual([{ dir: '/opt/bin', resolver: 'r', rank: 0 }]);
  });

  it('drops a {VAR} carrying a PATH separator rather than splitting one entry into two', () => {
    // `BASE=/opt:/tmp/evil` would otherwise contribute `/tmp/evil/bin` as well.
    expect(substitute('{BASE}/bin', linux({ BASE: '/opt:/tmp/evil' }))).toBeUndefined();
  });

  it('drops an unset {VAR} instead of expanding it to nothing', () => {
    // Without this, `{NVM_BIN}/x` with NVM_BIN unset becomes `/x` — a directory at the
    // filesystem root, searched ahead of PATH.
    expect(substitute('{NVM_BIN}/x', linux())).toBeUndefined();
  });

  it('refuses a resolver with no paths, since a search order with nothing in it finds nothing', () => {
    expect(() => register({ name: 'bad', resolvers: { r: { rank: 0, paths: [] } } })).toThrow(PluginError);
  });

  it('refuses a resolver with no rank, because the rank is where it sits relative to PATH', () => {
    expect(() => register({ name: 'bad', resolvers: { r: { paths: ['/opt/bin'] } } })).toThrow(PluginError);
  });

  it('refuses a malformed `when` rather than applying always', () => {
    expect(() => register({ name: 'bad', resolvers: { r: { rank: 0, paths: ['/o'], when: { platform: 'win32' } } } })).toThrow(PluginError);
  });
});

describe('the error vocabulary is the family’s (R8)', () => {
  it('carries a code and a fix on every refusal', () => {
    const refusals: unknown[] = [null, { name: '' }, { name: 'a', resolvers: 1 }, { name: 'a', resolvers: { r: { rank: 0, paths: ['x'] } } }];
    for (const plugin of refusals) {
      try {
        register(plugin);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(PluginError);
        expect((error as PluginError).code).toMatch(/^E_/);
        expect((error as PluginError).fix.length).toBeGreaterThan(0);
      }
    }
  });
});
