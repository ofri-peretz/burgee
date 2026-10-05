/**
 * R15 — one render engine. controlroom lays out regions and routes keys; it never paints.
 * Every byte reaches the terminal through flagstaff (`frameWriter`, `hoist`) or closeout
 * (the mode switches and their restores). This fails on the first file under `src/` that
 * writes to a stream itself, or that names the process outside `runtime.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const WRITES = /\.write\s*\(|process\.(?:stdout|stderr)|console\.|\\u001B\[|\\x1b\[/u;

/** What `WRITES` finds in a source, comments aside: a doc comment may name what it forbids. */
export function offences(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && WRITES.test(line));
}

describe('R15 — controlroom never paints on its own', () => {
  it('no source file writes to a stream, spells an escape sequence or reaches for process.stdout', () => {
    const found = readdirSync(SRC)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'runtime.ts')
      .flatMap((f) => offences(readFileSync(join(SRC, f), 'utf8')).map((line) => `${f}: ${line.trim()}`));
    expect(found).toEqual([]);
  });

  it('the check is not blind: it finds each kind of offence, and ignores one in a comment', () => {
    expect(offences('rt.stdout.write(x);')).toHaveLength(1);
    expect(offences("const up = '\\u001B[1A';")).toHaveLength(1);
    expect(offences('process.stdout.columns')).toHaveLength(1);
    expect(offences('console.log(1)')).toHaveLength(1);
    expect(offences('/** never .write( here */\n// nor .write( here')).toEqual([]);
  });
});
