/**
 * R15 — one render engine. controlroom lays out regions and routes keys; it never paints.
 * Every byte reaches the terminal through flagstaff (`frameWriter`, `hoist`) or closeout
 * (the mode switches and their restores). This fails on the first file under `src/` that
 * writes to a stream itself, spells an escape sequence, or reaches for the process's
 * streams or console — outside the files named below as the one boundary each surface has.
 *
 * `controlroom/ink` has one of its own. Ink's suite grades its write protocol byte for byte
 * and write for write, which flagstaff's frame writer does not produce, so the drop-in writes
 * in exactly one file, `ink/terminal.ts`, with every sequence taken from the family
 * (`paratext/csi`, `closeout/cursor`); and it reaches the process's streams and console in
 * exactly one, `ink/process.ts` (D-20261005-controlroom-ink-drop-in). Every other file under
 * `ink/` is held to the whole rule.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));

const RULES = {
  write: /\.write\s*\(/u,
  streams: /process\.(?:stdout|stderr)/u,
  console: /console\./u,
  escape: /\\u001B\[|\\x1b\[/u,
} as const;
type Rule = keyof typeof RULES;

/** Each boundary, and the part of the rule that is its job. */
const BOUNDARIES: Readonly<Record<string, readonly Rule[]>> = {
  'runtime.ts': ['write', 'streams', 'console', 'escape'],
  'ink/terminal.ts': ['write'],
  'ink/process.ts': ['streams', 'console'],
};

/** What a file is held to: every rule but its own boundary's. */
export const rulesFor = (file: string): Rule[] => (Object.keys(RULES) as Rule[]).filter((rule) => !(BOUNDARIES[file] ?? []).includes(rule));

/** The lines of a source that break any of `rules`, comments aside: a doc comment may name what it forbids. */
export function offences(source: string, rules: readonly Rule[] = Object.keys(RULES) as Rule[]): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && rules.some((rule) => RULES[rule].test(line)));
}

/** Every source file under `src/`, relative to it, tests and declarations aside. */
function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) return sources(at);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts') ? [relative(SRC, at)] : [];
  });
}

describe('R15 — controlroom never paints on its own', () => {
  it('no source file writes to a stream, spells an escape sequence or reaches for the streams, outside its boundary', () => {
    const found = sources().flatMap((file) => offences(readFileSync(join(SRC, file), 'utf8'), rulesFor(file)).map((line) => `${file}: ${line.trim()}`));
    expect(found).toEqual([]);
  });

  it('walks into ink/, so the drop-in is held to the rule too', () => {
    expect(sources()).toEqual(expect.arrayContaining(['ink/render.ts', 'ink/instance.ts', 'ink/terminal.ts']));
  });

  it('exempts each boundary from its own job only', () => {
    expect(offences('out.write(x)', rulesFor('ink/terminal.ts'))).toEqual([]);
    expect(offences("const up = '\\u001B[1A';", rulesFor('ink/terminal.ts'))).toHaveLength(1);
    expect(offences('process.stdout.columns', rulesFor('ink/terminal.ts'))).toHaveLength(1);
    expect(offences('process.stdout', rulesFor('ink/process.ts'))).toEqual([]);
    expect(offences('console.log(1)', rulesFor('ink/process.ts'))).toEqual([]);
    expect(offences('out.write(x)', rulesFor('ink/process.ts'))).toHaveLength(1);
    expect(rulesFor('ink/render.ts')).toEqual(Object.keys(RULES));
  });

  it('the check is not blind: it finds each kind of offence, and ignores one in a comment', () => {
    expect(offences('rt.stdout.write(x);')).toHaveLength(1);
    expect(offences("const up = '\\u001B[1A';")).toHaveLength(1);
    expect(offences('process.stdout.columns')).toHaveLength(1);
    expect(offences('console.log(1)')).toHaveLength(1);
    expect(offences('/** never .write( here */\n// nor .write( here')).toEqual([]);
  });
});
