import { parseAsync } from './async.js';
import { keysOf } from './issues.js';
import { parse, type Parsed } from './parse.js';
import { type Out, type Schema } from './schema.js';

/**
 * Standard Schema (standardschema.dev, version 1): the `~standard` member a library reads to
 * validate with a schema it did not make. On a subpath of its own, as a wrapper: a node does not
 * carry the member, so a schema that is never handed to such a library pays nothing for it.
 *
 * The interface below is the specification's `StandardSchemaV1`, written out here because this
 * package has no dependencies; it was read from the copy zod 4.6.7 ships.
 *
 * `validate` is one call of `parse`: it does not first try one way and then another. A schema with
 * a rule or a map to await is wrapped with `standardAsync`, whose `validate` is one call of
 * `parseAsync` and answers with a promise.
 */

/**
 * The name this library gives itself in `~standard.vendor`. The package's public name is not
 * chosen yet (it is a working name), so this is the one place that has to change when it is.
 */
const VENDOR = 'validator';

interface StandardIssue {
  readonly message: string;
  /** The keys from the root to the value at fault: an index into an array is a number. */
  readonly path: readonly (string | number)[];
}

type StandardResult<O> = { readonly value: O; readonly issues?: undefined } | { readonly issues: readonly StandardIssue[] };

interface StandardProps<I, O, R> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (value: unknown) => R;
  /** The input and the output type, for a library to infer from. There is no such value: it is `undefined`. */
  readonly types?: { readonly input: I; readonly output: O } | undefined;
}

/** A schema of this library that is also a Standard Schema, validating at once. */
type Standard<T, O> = Schema<T, O> & { readonly '~standard': StandardProps<T, Out<T, O>, StandardResult<Out<T, O>>> };

/** The same, validating with a promise. */
type StandardAsync<T, O> = Schema<T, O> & { readonly '~standard': StandardProps<T, Out<T, O>, Promise<StandardResult<Out<T, O>>>> };

/** What `parse` answered, as the specification writes a result: the value, or the issues with their paths as arrays. */
const result = <O>(parsed: Parsed<O>, value: unknown): StandardResult<O> =>
  parsed.ok ? { value: parsed.value } : { issues: parsed.issues.map((issue) => ({ message: issue.message, path: keysOf(issue.path, value) })) };

/** The schema with `~standard` on it, under the vendor's name: the same node otherwise, frozen. */
const wrapped = <S>(schema: object, validate: (value: unknown) => unknown): S => Object.freeze({ ...schema, '~standard': Object.freeze({ version: 1, vendor: VENDOR, validate }) }) as S;

/**
 * The schema as a Standard Schema: `standard(Order)['~standard'].validate(value)` is
 * `{ value }` or `{ issues }`, from one call of `parse`. The result is still a schema of this
 * library: `check`, `issues` and `parse` read it as they read the one it was made from.
 */
const standard = <T, O>(schema: Schema<T, O>): Standard<T, O> => wrapped(schema, (value) => result(parse(schema, value), value));

/** The same for a schema with a rule or a map to await: `validate` answers with a promise, from one call of `parseAsync`. */
const standardAsync = <T, O>(schema: Schema<T, O>): StandardAsync<T, O> => wrapped(schema, async (value) => result(await parseAsync(schema, value), value));

export { type Standard, standard, type StandardAsync, standardAsync, type StandardIssue, type StandardProps, type StandardResult, VENDOR };
