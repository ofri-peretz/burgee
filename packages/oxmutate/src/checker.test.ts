import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyMutant, batches, checkSurvivors, parseDiagnostics } from './checker.js';

const typed = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'typed');

describe('the type checker', () => {
  it('applies a mutant at UTF-16 columns, end exclusive', () => {
    const source = "const a = 'é';\nreturn fast ? 'fast' : 'safe';\n";
    expect(applyMutant(source, { start: { line: 2, column: 15 }, end: { line: 2, column: 21 }, replacement: '""' })).toBe("const a = 'é';\nreturn fast ? \"\" : 'safe';\n");
  });

  it('reads the first error per file from --pretty false output, relative to the project', () => {
    const out = "src/a.ts(3,7): error TS2322: Type '\"\"' is not assignable to type 'Mode'.\nsrc/a.ts(9,1): error TS1005: ';' expected.\n/abs/p/src/b.ts(1,1): error TS2304: Cannot find name 'x'.\nnot a diagnostic\n";
    const errors = parseDiagnostics(out, '/abs/p');
    expect(errors.get('src/a.ts')).toBe("TS2322: Type '\"\"' is not assignable to type 'Mode'. (line 3)");
    expect(errors.get('src/b.ts')).toBe("TS2304: Cannot find name 'x'. (line 1)");
    expect(errors.size).toBe(2);
  });

  it('batches at most one mutant per file', () => {
    const groups = batches([{ file: 'a' }, { file: 'a' }, { file: 'b' }, { file: 'a' }]);
    expect(groups.map((g) => g.map((m) => m.file).join(''))).toEqual(['ab', 'a', 'a']);
  });

  it('refuses the mutants that do not compile, with the error, and passes the ones that do', async () => {
    const source = readFileSync(path.join(typed, 'src/pick.ts'), 'utf8');
    const line = source.split('\n').findIndex((l) => l.includes("'fast' : 'safe'")) + 1;
    const col = (needle: string): number => (source.split('\n')[line - 1] ?? '').indexOf(needle) + 1;
    const refused = await checkSurvivors({ root: typed, tsconfig: 'tsconfig.json', concurrency: 2 }, [
      { id: 'fast', file: 'src/pick.ts', start: { line, column: col("'fast'") }, end: { line, column: col("'fast'") + 6 }, replacement: '""' },
      { id: 'safe', file: 'src/pick.ts', start: { line, column: col("'safe'") }, end: { line, column: col("'safe'") + 6 }, replacement: "'fast'" },
    ]);
    expect([...refused.keys()]).toEqual(['fast']);
    expect(refused.get('fast')).toMatch(/^TS2322: .*not assignable to type 'Mode'/);
  }, 120_000);

  it('stops with a reason when the project does not type-check unmutated', async () => {
    await expect(checkSurvivors({ root: typed, tsconfig: 'missing.json', concurrency: 1 }, [{ id: 'x', file: 'src/pick.ts', start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, replacement: '' }])).rejects.toThrow(/does not type-check with no mutant applied/);
  }, 120_000);
});
