import { describe, expect, it } from 'vitest';

import { bindingNames, platformPackage, platformTag } from './platform.js';

describe('platformTag', () => {
  it('names each of the six release targets as its npm/ directory does', () => {
    expect(platformTag({ platform: 'darwin', arch: 'arm64' })).toBe('darwin-arm64');
    expect(platformTag({ platform: 'darwin', arch: 'x64' })).toBe('darwin-x64');
    expect(platformTag({ platform: 'linux', arch: 'x64', glibc: '2.35' })).toBe('linux-x64-gnu');
    expect(platformTag({ platform: 'linux', arch: 'arm64', glibc: '2.39' })).toBe('linux-arm64-gnu');
    expect(platformTag({ platform: 'linux', arch: 'x64' })).toBe('linux-x64-musl');
    expect(platformTag({ platform: 'win32', arch: 'x64' })).toBe('win32-x64-msvc');
  });

  it('reads an empty glibc version as musl, and ignores glibc off Linux', () => {
    expect(platformTag({ platform: 'linux', arch: 'arm64', glibc: '' })).toBe('linux-arm64-musl');
    expect(platformTag({ platform: 'darwin', arch: 'arm64', glibc: '2.35' })).toBe('darwin-arm64');
    expect(platformTag({ platform: 'win32', arch: 'arm64', glibc: '2.35' })).toBe('win32-arm64-msvc');
  });

  it('passes an unlisted platform through as <platform>-<arch>', () => {
    expect(platformTag({ platform: 'freebsd', arch: 'x64' })).toBe('freebsd-x64');
  });
});

describe('platformPackage', () => {
  it('is oxmutate-<tag>', () => {
    expect(platformPackage({ platform: 'linux', arch: 'x64', glibc: '2.35' })).toBe('oxmutate-linux-x64-gnu');
    expect(platformPackage({ platform: 'win32', arch: 'x64' })).toBe('oxmutate-win32-x64-msvc');
  });
});

describe('bindingNames', () => {
  it('tries the bundled release core first, then the development build', () => {
    expect(bindingNames({ platform: 'linux', arch: 'x64', glibc: '2.35' })).toEqual(['oxmutate.linux-x64-gnu.node', 'oxmutate.linux-x64.node']);
    expect(bindingNames({ platform: 'win32', arch: 'x64' })).toEqual(['oxmutate.win32-x64-msvc.node', 'oxmutate.win32-x64.node']);
  });

  it('names the file once where the two agree (macOS)', () => {
    expect(bindingNames({ platform: 'darwin', arch: 'arm64' })).toEqual(['oxmutate.darwin-arm64.node']);
  });
});
