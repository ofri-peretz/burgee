/**
 * meow's help block and package reading, piece by piece: the trims at their edges, where the
 * description comes from, and the names normalisation and the process title take.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { host } from '../runtime.js';

import { buildHelp, cutTrailingTabs, normalizePackage, setProcessTitle, trimNewlines } from './present.js';
import { type Settings } from './types.js';

afterEach(() => vi.restoreAllMocks());

describe('the trims, at their edges', () => {
  it('trims newlines from both ends, and an all-newline text to nothing', () => {
    expect(trimNewlines('\r\n\nhelp  \n\r')).toBe('help  ');
    expect(trimNewlines('\n\r\n')).toBe('');
    expect(trimNewlines('')).toBe('');
  });

  it('cuts trailing tabs with the newlines after them, and leaves a text with none', () => {
    expect(cutTrailingTabs('a\n\t\t\n\n')).toBe('a\n');
    expect(cutTrailingTabs('\t\n')).toBe('');
    expect(cutTrailingTabs('\n\n')).toBe('\n\n');
    expect(cutTrailingTabs('a\t b')).toBe('a\t b');
  });
});

describe('buildHelp', () => {
  it('prints nothing but the closing newline for an empty help', () => {
    expect(buildHelp({ help: '' }, {})).toBe('\n');
  });

  it('strips an indent of one before redenting', () => {
    expect(buildHelp({ help: ' a\n  b' }, {})).toBe('\n  a\n   b\n');
  });

  it('takes the package description only when the options do not name one', () => {
    expect(buildHelp({}, { description: 'From the package' })).toBe('\nFrom the package\n');
    expect(buildHelp({ description: 'Mine' }, { description: 'From the package' })).toBe('\nMine\n');
  });

  it('prints no description for false, undefined or an empty string', () => {
    // `undefined` is what a caller spreading an unset option hands in, which the type does not admit.
    for (const description of [false, undefined, ''] as const) expect(buildHelp({ description } as Settings, { description: 'From the package' })).toBe('\n');
  });
});

describe('normalizePackage', () => {
  it('keys a string bin by the unscoped name, and strips a scope only at the start', () => {
    expect(normalizePackage({ name: '@acme/tool', bin: 'cli.js' })['bin']).toEqual({ tool: 'cli.js' });
    expect(normalizePackage({ name: 'tool@acme/x', bin: 'cli.js' })['bin']).toEqual({ 'tool@acme/x': 'cli.js' });
  });

  it('leaves an object bin as it is', () => {
    expect(normalizePackage({ name: 'tool', bin: { other: 'cli.js' } })['bin']).toEqual({ other: 'cli.js' });
  });
});

describe('setProcessTitle', () => {
  const titled = (pkg: Record<string, unknown>): unknown[] => {
    const set = vi.spyOn(host, 'setTitle').mockImplementation(() => undefined);
    setProcessTitle(pkg);
    const titles = set.mock.calls.map(([title]) => title);
    set.mockRestore();
    return titles;
  };

  it('takes the unscoped name for a string bin, the first key of an object bin, and the name without one', () => {
    expect(titled({ name: '@acme/tool', bin: 'cli.js' })).toEqual(['tool']);
    expect(titled({ name: 'tool@acme/x', bin: 'cli.js' })).toEqual(['tool@acme/x']);
    expect(titled({ name: '@acme/tool', bin: { run: 'cli.js' } })).toEqual(['run']);
    expect(titled({ name: '@acme/tool' })).toEqual(['@acme/tool']);
  });

  it('sets no title for a package with no name', () => {
    expect(titled({})).toEqual([]);
  });
});
