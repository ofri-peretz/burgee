/** truefit's schemas as a module exports them without `standardJson`: plain, and wrapped by `truefit/standard`. */
import { number, object, optional, string } from 'truefit';
import { standard } from 'truefit/standard';

export const Pet = object({ id: number(), name: string(), tag: optional(string()) });

export const Owner = standard(object({ email: string() }));

/** Not a schema: left out of `"*"` without a word, as any other helper export is. */
export const version = 1;
