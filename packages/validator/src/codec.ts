import { parse, type Parsed, type ParseOptions } from './parse.js';
import { type Codec, type Node, type Schema } from './schema.js';

/**
 * The other direction of a codec: a value of its output schema, held to that schema, encoded, and
 * the result held to the input schema. `parse` is the first direction, decoding.
 *
 * What comes back is what the input schema's `parse` makes of the encoded value, so its defaults and
 * transforms run on the way out as they would on a value that arrived.
 */
const encode = <I, O>(schema: Codec<I, O>, value: unknown, options: ParseOptions = {}): Parsed<I> => {
  if (schema.kind !== 'codec') {
    throw new TypeError(`cannot encode with a schema of the kind ${typeof schema.kind === 'string' ? JSON.stringify(schema.kind) : typeof schema.kind}: only a codec has a second direction. fix: build it with \`codec(input, output, { decode, encode })\``);
  }
  const output = parse(schema.key as Schema<O>, value, options);
  if (!output.ok) return output;
  const encoded = (schema.value as (value: unknown) => unknown)(output.value);
  // The codec's own schema is the input schema with the decoding map on it: the input schema is what that map wraps.
  return parse(((schema.item as Node).item as Node) as Schema<I>, encoded, options);
};

export { encode };
