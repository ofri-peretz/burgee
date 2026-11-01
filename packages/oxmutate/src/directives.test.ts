import { describe, expect, it } from 'vitest';

import { rangeDisables } from './directives.js';

const src = (...lines: string[]): string => lines.join('\n');
/** Prose that mentions a disable, built so the repository's own directive lint does not read it as one. */
const said = (prose: string): string => `// ${'Stryker'} disable ${prose}`;

describe("Stryker's disable/restore ranges, read by line as written", () => {
  // compat-oracle's hosts.ts: a row graded in another process, its mutants off from the comment to
  // the row's end. Before this oxmutate graded all 116 such mutants as if no directive were there.
  const row = src(
    'const hosts = [',
    '  {',
    '    // Stryker disable all: graded in another process, against its baseline file',
    "    name: 'supports-color',",
    "    runner: 'ava',",
    '  },',
    '  // Stryker restore all',
    '  {',
    "    name: 'ora',",
    '  },',
    '];',
  );

  it('turns every mutator off from the line after `disable all` until `restore all`', () => {
    const r = rangeDisables(row, 'hosts.ts');
    expect(r.errors).toEqual([]);
    expect(r.reasonFor(4, 'StringLiteral')).toBe('graded in another process, against its baseline file');
    expect(r.reasonFor(5, 'ObjectLiteral')).toBe('graded in another process, against its baseline file');
  });

  it('leaves the lines before the disable and after the restore on', () => {
    const r = rangeDisables(row, 'hosts.ts');
    expect(r.reasonFor(1, 'ArrayDeclaration')).toBeUndefined();
    expect(r.reasonFor(3, 'StringLiteral')).toBeUndefined();
    expect(r.reasonFor(9, 'StringLiteral')).toBeUndefined();
  });

  // Stryker never sees a restore above a closing bracket; oxmutate reads it where it is written.
  it('honours a restore above a closing bracket, where Stryker would not', () => {
    const r = rangeDisables(src('{', '  // Stryker disable all: a table read only at load, held by its own check', '  a: 1,', '  // Stryker restore all', '}', "const b = 'x';"), 'a.ts');
    expect(r.reasonFor(3, 'NumericLiteral')).toBeDefined();
    expect(r.reasonFor(6, 'StringLiteral')).toBeUndefined();
  });

  it('turns off only the named mutators, and restores them by name, any case', () => {
    const r = rangeDisables(src('// Stryker disable StringLiteral, BlockStatement: equivalent, the catch returns undefined either way', 'x', '// oxmutate restore stringliteral', 'y'), 'a.ts');
    expect(r.reasonFor(2, 'StringLiteral')).toMatch(/^equivalent/u);
    expect(r.reasonFor(2, 'BlockStatement')).toMatch(/^equivalent/u);
    expect(r.reasonFor(2, 'ConditionalExpression')).toBeUndefined();
    expect(r.reasonFor(4, 'StringLiteral')).toBeUndefined();
    expect(r.reasonFor(4, 'BlockStatement')).toMatch(/^equivalent/u);
  });

  it('runs a disable with no restore to the end of the file', () => {
    expect(rangeDisables(src('// Stryker disable all: data, read once at load and checked by its generator', 'a', 'b'), 'a.ts').reasonFor(3, 'StringLiteral')).toBeDefined();
  });

  it('reads any spacing and any case, in the list and around the comment', () => {
    const r = rangeDisables(src('//Stryker  Disable  StringLiteral ,BlockStatement : spaced out, and still a directive', 'x'), 'a.ts');
    expect(r.errors).toEqual([]);
    expect(r.reasonFor(2, 'StringLiteral')).toBe('spaced out, and still a directive');
    expect(r.reasonFor(2, 'BlockStatement')).toBe('spaced out, and still a directive');
  });

  it('takes prose that mentions a directive for prose: no rule and no error', () => {
    const r = rangeDisables(src(said('all of the rows below until the table ends'), 'x', said('this table'), 'y'), 'a.ts');
    expect(r.errors).toEqual([]);
    expect(r.reasonFor(4, 'StringLiteral')).toBeUndefined();
  });

  it('leaves `disable next-line` to config.ts, and refuses a range without a reason', () => {
    const r = rangeDisables(src('// Stryker disable next-line StringLiteral: the message is not part of the contract', 'x', '// Stryker disable all', 'y'), 'a.ts');
    expect(r.reasonFor(2, 'StringLiteral')).toBeUndefined();
    expect(r.reasonFor(4, 'StringLiteral')).toBeUndefined();
    expect(r.errors).toEqual([expect.stringMatching(/^a\.ts:3: disable comment without a reason/u)]);
  });
});
