/**
 * Lock: `burgee/meow` refuses a `null` where meow 14.1.0 refuses it, with meow's message.
 *
 * Both checks used `typeof x === 'object'`, which `null` passes:
 *
 * - `importMeta: null` reached `importMeta.url` and threw "Cannot read properties of null",
 *   where meow's `!options.importMeta?.url` throws its own "The `importMeta` option is
 *   required" TypeError.
 * - `input: null` and `input: []` were read as "no `input`", where meow's
 *   `Object.prototype.toString.call(input) === '[object Object]'` refuses both.
 */
import { describe, expect, it } from 'vitest';

import meow from '../meow.js';

const importMeta = import.meta;

describe('meow refuses null the way upstream does', () => {
  it('importMeta: null is the importMeta TypeError, not a null dereference', () => {
    expect(() => meow({ importMeta: null as unknown as ImportMeta, argv: [] })).toThrow(new TypeError('The `importMeta` option is required. Its value must be `import.meta`.'));
  });

  // `as never`: meow's own types refuse these, as `burgee/meow`'s now do; the checks are for the
  // JavaScript caller the compiler cannot see.
  it.each([{ input: null }, { input: [] }, { input: ['a'] }])('input: $input is refused', ({ input }) => {
    expect(() => meow({ importMeta, argv: [], input: input as never })).toThrow(new TypeError('The `input` option must be a string or an object.'));
  });

  it.each([{ input: 'string' }, { input: { isRequired: false } }])('input: $input is still accepted', ({ input }) => {
    expect(() => meow({ importMeta, argv: [], input: input as never })).not.toThrow();
  });
});
