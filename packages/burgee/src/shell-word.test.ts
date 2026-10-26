/**
 * fix-lines-every-shell — a `fix:` line is quoted for the shell that will run it: POSIX `sh` off
 * Windows, PowerShell on it (D-20261012-fix-lines-shell-target). The platform is a parameter, so
 * both forms are pinned here on every machine; `fix-line-runs.test.ts` runs the PowerShell form
 * in `pwsh` (R3).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { host } from './runtime.js';
import { shellLine, shellWord } from './unknown-option.js';

describe('fix-lines-every-shell R1', () => {
  it('R1 — PowerShell form on win32', () => {
    expect(shellWord("it's", 'win32')).toBe("'it''s'");
    expect(shellWord('@a', 'win32')).toBe("'@a'");
    expect(shellWord('a,b', 'win32')).toBe("'a,b'");
    expect(shellWord('--%', 'win32')).toBe("'--%'");
    expect(shellWord('C:\\Users\\RUNNER~1\\x', 'win32')).toBe("'C:\\Users\\RUNNER~1\\x'");
    // A word POSIX leaves bare and PowerShell reads as written stays bare: no bytes change for it.
    for (const word of ['greet', '--code=0', 'a@b', 'user.name', './x/y', '50%', '--%x', 'a--%']) expect(shellWord(word, 'win32')).toBe(word);
  });

  it('R1 — POSIX form is unchanged', () => {
    expect(shellWord("it's", 'linux')).toBe("'it'\\''s'");
    expect(shellWord("it's", 'darwin')).toBe("'it'\\''s'");
    // `@`, `,` and `--%` mean nothing to sh: bare, as they always were.
    for (const word of ['@a', 'a,b', '--%', 'greet']) expect(shellWord(word, 'linux')).toBe(word);
    expect(shellWord('Ada L', 'linux')).toBe("'Ada L'");
  });

  it('R1 — the default is the platform this process runs on, and a line quotes every word with it', () => {
    expect(shellWord("it's")).toBe(shellWord("it's", host.platform));
    expect(shellLine(['tool', 'fail', "it's", 'a,b'])).toBe(['tool', 'fail', "it's", 'a,b'].map((w) => shellWord(w, host.platform)).join(' '));
  });
});

/** The POSIX quote-escape (quote, backslash, quote, quote) as it appears in source: one backslash in `String.raw`, two in any other string. */
const POSIX_ESCAPE = /'\\{1,2}''/gu;

/**
 * The files allowed to write it, and how many times. `unknown-option.ts` is the one quoter;
 * `completions.ts` quotes inside the generated bash, zsh and fish scripts (`sq`), which are POSIX
 * by definition and never a `fix` line; this file pins the POSIX form, and `typed-positionals.test.ts`
 * pins it in the bash, zsh and fish lines that list a choice holding a quote. By count, so a second
 * quoter added to an allowed file still fails.
 */
const ALLOWED: Record<string, number> = { 'unknown-option.ts': 1, 'completions.ts': 1, 'shell-word.test.ts': 2, 'typed-positionals.test.ts': 3 };

const SRC = dirname(fileURLToPath(import.meta.url));
const SKIPPED = new Set(['__snapshots__', '__fixtures__']);
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIPPED.has(e.name) ? [] : sources(join(dir, e.name));
    return e.name.endsWith('.ts') ? [join(dir, e.name)] : [];
  });
}

describe('fix-lines-every-shell R2', () => {
  it('R2 — no second quoter', () => {
    const found: Record<string, number> = {};
    for (const file of sources(SRC)) {
      const count = readFileSync(file, 'utf8').match(POSIX_ESCAPE)?.length ?? 0;
      if (count > 0) found[relative(SRC, file).split('\\').join('/')] = count;
    }
    expect(found).toEqual(ALLOWED);
  });
});
