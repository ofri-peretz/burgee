import { emit } from './emit.js';
import { type Schema } from './schema.js';

/**
 * The just-in-time door (spec.md R5): the emitter's text, run through `new Function`.
 *
 * Opt-in, on its own subpath, for servers that allow it. A page under a Content Security Policy,
 * React Native and Hermes do not, which is why the default entry interprets and never imports this.
 */
export const compile = <T>(schema: Schema<T>): ((value: unknown) => value is T) =>
  // eslint-disable-next-line secure-coding/no-unsafe-deserialization, node-security/detect-eval-with-expression -- The text is written by `emit` from a schema's own data, every string in it through JSON.stringify; no input reaches it
  new Function(`return ${emit(schema)};`)() as (value: unknown) => value is T;
