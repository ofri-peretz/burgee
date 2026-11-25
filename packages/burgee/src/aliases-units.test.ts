/**
 * `unalias` on a hand-built manifest (`aliases.ts`): which command a word is matched against,
 * the part `command-aliases.test.ts` cannot isolate through a whole run.
 */
import { describe, expect, it } from 'vitest';

import { unalias } from './aliases.js';
import { type Manifest } from './manifest.js';

/** `remote` (no aliases), `remote add|a`, `remote add deep|d`, and `other inner quick|q`. */
const manifest = {
  commands: [
    { path: ['remote'], options: {} },
    { path: ['remote', 'add'], aliases: ['a'], options: {} },
    { path: ['remote', 'add', 'deep'], aliases: ['d'], options: {} },
    { path: ['other'], options: {} },
    { path: ['other', 'inner'], options: {} },
    { path: ['other', 'inner', 'quick'], aliases: ['q'], options: {} },
  ],
} as unknown as Manifest;

describe('unalias', () => {
  it('matches a word against the children of the command before it, not its grandchildren', () => {
    expect(unalias(manifest, ['a'], [])).toEqual(['a']);
    expect(unalias(manifest, ['remote', 'd'], [])).toEqual(['remote', 'd']);
  });

  it('needs every segment of the parent to match, not just one', () => {
    expect(unalias(manifest, ['remote', 'add', 'q'], [])).toEqual(['remote', 'add', 'q']);
  });

  it('rewrites an alias three levels down to the last segment of its path', () => {
    expect(unalias(manifest, ['remote', 'a', 'd'], [])).toEqual(['remote', 'add', 'deep']);
    expect(unalias(manifest, ['remote', 'add', 'deep'], [])).toEqual(['remote', 'add', 'deep']);
  });

  it('passes over a command with no aliases when the word is not its name', () => {
    expect(unalias(manifest, ['zzz'], [])).toEqual(['zzz']);
  });

  it('starts from the given root, and leaves everything after -- as typed', () => {
    expect(unalias(manifest, ['a'], ['remote'])).toEqual(['add']);
    expect(unalias(manifest, ['remote', '--', 'a'], [])).toEqual(['remote', '--', 'a']);
  });
});
