import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { markReader, markText, markWriter, parseMark } from './progress-file.js';

// This runs on Linux, macOS and Windows in CI, which the end-to-end runs do not: two descriptors
// on one file, one of them opened with truncation while the other is held, is where they differ.
const dir = mkdtempSync(path.join(tmpdir(), 'oxmutate-progress-'));
afterAll(() => discard(dir));

describe('a progress file, read in place while it is rewritten', () => {
  it('shows the reader each mark the writer leaves, a shorter one after a longer one too', () => {
    const file = path.join(dir, 'a.progress');
    const reader = markReader(file);
    expect(reader.read()).toBe('');
    // The writer opens after the reader, as a worker does after the scheduler, and truncates.
    const writer = markWriter(file);
    writer.write('1234567 1794000000000\n');
    expect(reader.read()).toBe('1234567 1794000000000');
    writer.write('8 1794000000001\n');
    expect(reader.read()).toBe('8 1794000000001');
    expect(reader.read().split(' ')).toEqual(['8', '1794000000001']);
    writer.write('');
    expect(reader.read()).toBe('');
    writer.write('99 1794000000002\n');
    expect(reader.read()).toBe('99 1794000000002');
    writer.close();
    reader.close();
  });

  it('shows the reader a mark another process wrote by replacing the file’s contents', () => {
    const file = path.join(dir, 'b.progress');
    const reader = markReader(file);
    // The server writes an isolated batch's mark this way (child.ts).
    writeFileSync(file, '42 1794000000003\n');
    expect(reader.read()).toBe('42 1794000000003');
    writeFileSync(file, '');
    expect(reader.read()).toBe('');
    reader.close();
  });

  it('a second writer on the file starts from an empty mark', () => {
    const file = path.join(dir, 'c.progress');
    const reader = markReader(file);
    const first = markWriter(file);
    first.write('a-long-mutant-id 1794000000004\n');
    first.close();
    const second = markWriter(file);
    expect(reader.read()).toBe('');
    second.write('7 1\n');
    expect(reader.read()).toBe('7 1');
    second.close();
    reader.close();
  });

  it('writes nothing for an empty mark on a new file, and pads only to what was written', () => {
    const file = path.join(dir, 'e.progress');
    const writer = markWriter(file);
    writer.write('');
    expect(statSync(file).size).toBe(0);
    writer.write('123 456\n');
    writer.write('');
    expect(statSync(file).size).toBe('123 456\n'.length);
    writer.close();
  });

  it('closes its descriptor: a closed side can no longer read or write', () => {
    const file = path.join(dir, 'f.progress');
    const reader = markReader(file);
    const writer = markWriter(file);
    writer.close();
    reader.close();
    expect(() => writer.write('1 2\n')).toThrow();
    expect(() => reader.read()).toThrow();
  });

  it('leaves a file that can be removed once both sides have closed it', () => {
    const file = path.join(dir, 'd.progress');
    const reader = markReader(file);
    const writer = markWriter(file);
    writer.write('1 2\n');
    writer.close();
    reader.close();
    expect(() => rmSync(file)).not.toThrow();
  });
});

describe('marks', () => {
  it('writes a cold run as `<id> <since>` and a warm run with the running test’s dry-run time', () => {
    expect(markText('m1', 1700, undefined)).toBe('m1 1700\n');
    expect(markText('m1', 1700)).toBe('m1 1700\n');
    expect(markText('m1', 1700, 0)).toBe('m1 1700 0\n');
    expect(markText('m1', 1700, 12)).toBe('m1 1700 12\n');
  });

  it('reads what it wrote: the id, the start, and the test time when there is one', () => {
    expect(parseMark('m1 1700 12')).toEqual({ id: 'm1', since: 1700, testMs: 12 });
    expect(parseMark('m1 1700 0')).toEqual({ id: 'm1', since: 1700, testMs: 0 });
    expect(parseMark('m1 1700')).toEqual({ id: 'm1', since: 1700, testMs: undefined });
    expect(parseMark('m1')).toEqual({ id: 'm1', since: 0, testMs: undefined });
  });
});
