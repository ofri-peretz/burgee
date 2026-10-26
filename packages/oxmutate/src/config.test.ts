import { describe, expect, it } from 'vitest';

import { disables } from './config.js';
import { globToRegExp } from './files.js';

describe('disable comments, Stryker syntax', () => {
  it('apply to the next line, for the named mutators, with the reason kept', () => {
    const src = 'a\n// Stryker disable next-line EqualityOperator,ConditionalExpression: boundary is checked by the caller\nif (x < 1) {}\n';
    expect(disables(src, 'f.ts').disables).toEqual([{ line: 3, mutators: ['EqualityOperator', 'ConditionalExpression'], reason: 'boundary is checked by the caller' }]);
  });
  it('a directive without a reason is an error, as burgee already requires', () => {
    const { errors } = disables('// Stryker disable next-line all\nx();\n', 'f.ts');
    expect(errors[0]).toMatch(/without a reason/);
  });
  it('oxmutate spells the same directive', () => {
    expect(disables('// oxmutate disable next-line all: generated code\nx();\n', 'f.ts').disables[0]?.mutators).toBe('all');
  });
});

describe('mutate globs', () => {
  it('match nested files, braces and negations as Stryker reads them', () => {
    expect(globToRegExp('src/**/*.ts').test('src/a/b/c.ts')).toBe(true);
    expect(globToRegExp('src/**/*.ts').test('src/c.ts')).toBe(true);
    expect(globToRegExp('src/**/*.{test,spec}.*').test('src/x/a.spec.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/a/b.ts')).toBe(false);
  });
});
