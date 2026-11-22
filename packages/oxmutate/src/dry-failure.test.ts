import { describe, expect, it } from 'vitest';

import { dryFix, emptyDryRun, firstError, VITEST_SAID } from './dry-failure.js';

const FALLBACK = 'make the suite pass first';

describe('dryFix', () => {
  it('names container.network when a test failed reaching the network inside a container', () => {
    for (const e of ['getaddrinfo ENOTFOUND github.com', 'getaddrinfo EAI_AGAIN api.example.com', 'connect ECONNREFUSED 127.0.0.1:443', 'connect ENETUNREACH 1.2.3.4:443', 'fetch failed']) {
      const fix = dryFix(['unrelated', e], true, FALLBACK);
      expect(fix).toContain('no network (--network=none by default)');
      expect(fix).toContain('container.network');
    }
  });

  it('names the build and container.install when the tests import build output the checkout lacks', () => {
    for (const e of ["Cannot find module '/w/src/lib/asar.js' imported from /w/src/bin/asar.mjs", 'Error [ERR_MODULE_NOT_FOUND]: x', 'Failed to resolve entry for package "x-parser". The package may have incorrect main', 'Failed to resolve import "./gen.js" from "src/a.ts"']) {
      const fix = dryFix([e], true, FALLBACK);
      expect(fix).toContain('container.install: "<the install> && <your build, such as yarn build>"');
      expect(fix).toContain('container.include');
    }
  });

  it('says only the fallback outside a container, or for any other error', () => {
    expect(dryFix(['ENOTFOUND x'], false, FALLBACK)).toBe(FALLBACK);
    expect(dryFix(['Cannot find module y'], false, FALLBACK)).toBe(FALLBACK);
    expect(dryFix(['expected 1 to be 2'], true, FALLBACK)).toBe(FALLBACK);
    expect(dryFix([], true, FALLBACK)).toBe(FALLBACK);
  });

  it('prefers the network when both show', () => {
    expect(dryFix(['Cannot find module z', 'ENOTFOUND x'], true, FALLBACK)).toContain('container.network');
  });
});

describe('emptyDryRun', () => {
  it('keeps the old line when Vitest said nothing', () => {
    expect(emptyDryRun('')).toBe('the dry run ran no tests. fix: check the Vitest config the run used, or set allowEmpty');
    expect(emptyDryRun('some other stderr\n')).toBe('the dry run ran no tests. fix: check the Vitest config the run used, or set allowEmpty');
  });

  it('says what Vitest said, and names the Vitest version for a thread-pool conflict', () => {
    const said = emptyDryRun(`noise\n${VITEST_SAID}options.minThreads and options.maxThreads must not conflict\n${VITEST_SAID}second\n`);
    expect(said).toBe('the dry run ran no tests: Vitest said options.minThreads and options.maxThreads must not conflict. fix: oxmutate supports Vitest 4.1 or later (its peerDependency), and this project is on an older one: upgrade vitest');
  });

  it('names the config for any other Vitest error', () => {
    expect(emptyDryRun(`${VITEST_SAID}Failed to load config\n`)).toBe('the dry run ran no tests: Vitest said Failed to load config. fix: check the Vitest config the run used, or set allowEmpty');
  });
});

describe('firstError', () => {
  it('quotes the first non-blank line of the first error, cut at 200 characters', () => {
    expect(firstError(['\n  Error: process.chdir() is not supported in workers\n    at x', 'later'])).toBe(' First error: Error: process.chdir() is not supported in workers.');
    expect(firstError(['x'.repeat(300)])).toBe(` First error: ${'x'.repeat(200)}.`);
  });

  it('says nothing when there is no error to quote', () => {
    expect(firstError([])).toBe('');
    expect(firstError(['  \n '])).toBe('');
  });
});
