import { emitWith } from './emit.js';
import { type Schema } from './schema.js';

/**
 * The just-in-time door (spec.md R5): the emitter's text, run through `new Function`.
 *
 * Opt-in, on its own subpath, for servers that allow it. A page under a Content Security Policy,
 * React Native and Hermes do not, which is why the default entry interprets and never imports this.
 */
export const compile = <T>(schema: Schema<T>): ((value: unknown) => value is T) => {
  const { source, hooks } = emitWith(schema);
  // eslint-disable-next-line node-security/detect-eval-with-expression -- The text is written by `emit` from a schema's own data, every string in it through JSON.stringify; no input reaches it
  const build = new Function(`return ${source};`)() as (hooks: readonly unknown[]) => (value: unknown) => value is T;
  return build(hooks);
};
