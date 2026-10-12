/**
 * Compiled executables are found by content, and the vendor step's sweep removes and records
 * every one. The lock over the committed tree is in `vendored-suite.test.ts`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { executableAt, executableFormat, stripExecutables } from './binaries.js';

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
/** A word, big-endian, padded to the eight bytes the Mach-O checks need. */
const word = (w: number, next = 0): Uint8Array => {
  const b = Buffer.alloc(8);
  b.writeUInt32BE(w, 0);
  b.writeUInt32BE(next, 4);
  return b;
};

/** A minimal PE: `MZ`, the header offset at 0x3C, and `PE\0\0` where it points. */
function pe(signature = 'PE\0\0'): Buffer {
  const b = Buffer.alloc(0x80);
  b.write('MZ', 0, 'latin1');
  b.writeUInt32LE(0x40, 0x3c);
  b.write(signature, 0x40, 'latin1');
  return b;
}

describe('executableFormat', () => {
  it('reads ELF off its four magic bytes', () => {
    expect(executableFormat(bytes(0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0))).toBe('ELF');
  });

  it('reads every thin Mach-O magic, in both byte orders', () => {
    for (const magic of [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe]) expect(executableFormat(word(magic))).toBe('Mach-O');
  });

  it('reads a universal Mach-O, and tells it from a Java class file that opens the same way', () => {
    expect(executableFormat(word(0xcafebabe, 2))).toBe('Mach-O');
    expect(executableFormat(word(0xcafebabf, 2))).toBe('Mach-O');
    // A class file's next word is its version, 45 and up: not an executable here.
    expect(executableFormat(word(0xcafebabe, 0x0000_0034))).toBeUndefined();
  });

  it('reads PE only when the DOS header points at a real `PE\\0\\0`', () => {
    expect(executableFormat(bytes(0x4d, 0x5a), bytes(0x50, 0x45, 0, 0))).toBe('PE');
    // `MZ` is two printable characters a text file could open with.
    expect(executableFormat(bytes(0x4d, 0x5a), bytes(0x50, 0x45, 0x41, 0x52))).toBeUndefined();
    expect(executableFormat(bytes(0x4d, 0x5a))).toBeUndefined();
  });

  it('calls text, a shebang script and a short file nothing', () => {
    expect(executableFormat(Buffer.from('#!/usr/bin/env node\nprocess.exit(0);\n'))).toBeUndefined();
    expect(executableFormat(Buffer.from('export default 1;\n'))).toBeUndefined();
    expect(executableFormat(bytes(0x7f))).toBeUndefined();
    expect(executableFormat(bytes())).toBeUndefined();
  });
});

describe('the sweep over a vendored copy', () => {
  let dir = '';
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads a file on disk, including a PE whose signature sits past the first bytes read', () => {
    dir = mkdtempSync(join(tmpdir(), 'binaries-'));
    writeFileSync(join(dir, 'tool.exe'), pe());
    writeFileSync(join(dir, 'not.exe'), pe('NOPE'));
    // `MZ` and nothing after it: too short to hold a header offset at all.
    writeFileSync(join(dir, 'mz.txt'), 'MZ');
    expect(executableAt(join(dir, 'tool.exe'))).toBe('PE');
    expect(executableAt(join(dir, 'not.exe'))).toBeUndefined();
    expect(executableAt(join(dir, 'mz.txt'))).toBeUndefined();
  });

  it('removes every executable at any depth, by content and not by name, and records each', () => {
    dir = mkdtempSync(join(tmpdir(), 'binaries-'));
    mkdirSync(join(dir, 'test', 'fixtures'), { recursive: true });
    // execa's two have no extension, which is the shape a name-based rule would miss.
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(60)]);
    writeFileSync(join(dir, 'test', 'fixtures', 'fast-exit-linux'), elf);
    writeFileSync(join(dir, 'test', 'fixtures', 'fast-exit-darwin'), word(0xcffaedfe));
    // A script with a binary-sounding name stays: it is text.
    writeFileSync(join(dir, 'test', 'fixtures', 'noop.exe'), '#!/usr/bin/env node\n');
    writeFileSync(join(dir, 'test', 'a.js'), 'test("a", () => {});\n');
    // A link is not followed: it could reach outside the copy, and it is not itself a binary.
    symlinkSync(join(dir, 'test', 'fixtures', 'fast-exit-linux'), join(dir, 'test', 'link'));

    const omitted = stripExecutables(dir);

    expect(omitted).toEqual([
      { path: 'test/fixtures/fast-exit-darwin', format: 'Mach-O', sha256: createHash('sha256').update(word(0xcffaedfe)).digest('hex') },
      { path: 'test/fixtures/fast-exit-linux', format: 'ELF', sha256: createHash('sha256').update(elf).digest('hex') },
    ]);
    expect(existsSync(join(dir, 'test', 'fixtures', 'fast-exit-linux'))).toBe(false);
    expect(existsSync(join(dir, 'test', 'fixtures', 'fast-exit-darwin'))).toBe(false);
    expect(existsSync(join(dir, 'test', 'fixtures', 'noop.exe'))).toBe(true);
    expect(existsSync(join(dir, 'test', 'a.js'))).toBe(true);
  });

  it('returns nothing, and touches nothing, where there is nothing to omit', () => {
    dir = mkdtempSync(join(tmpdir(), 'binaries-'));
    writeFileSync(join(dir, 'a.js'), '');
    expect(stripExecutables(dir)).toEqual([]);
    expect(existsSync(join(dir, 'a.js'))).toBe(true);
  });
});
