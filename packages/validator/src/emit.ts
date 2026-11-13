import { type Node, type Schema } from './schema.js';

/**
 * The code emitter (spec.md R4): a node written out as straight-line JavaScript with no imports
 * and no runtime of ours. `apicontract gen validator` writes this text to a file; `./jit` runs it.
 *
 * It answers exactly what `check` answers (R2). Scalars are inlined at the place they are tested;
 * an array, an object or a union becomes one function, written once however often it is used.
 */

interface Emitter {
  /** `const` declarations, in the order they must appear. */
  readonly lines: string[];
  /** The function already written for a node. */
  readonly named: Map<Node, string>;
}

const isObject = (ref: string): string => `typeof ${ref} === "object" && ${ref} !== null && !Array.isArray(${ref})`;

const declare = (emitter: Emitter, prefix: string, source: string): string => {
  const name = `${prefix}${String(emitter.lines.length)}`;
  emitter.lines.push(`const ${name} = ${source};`);
  return name;
};

const string = (emitter: Emitter, schema: Node, ref: string): string => {
  const parts = [`typeof ${ref} === "string"`];
  if (schema.min > 0) parts.push(`${ref}.length >= ${String(schema.min)}`);
  if (schema.max < Number.MAX_VALUE) parts.push(`${ref}.length <= ${String(schema.max)}`);
  if (schema.pattern !== null) parts.push(`${declare(emitter, 'r', String(schema.pattern))}.test(${ref})`);
  return parts.join(' && ');
};

// Both bounds are always written: the default ones are what refuse `NaN` and the infinities.
const number = (schema: Node, ref: string): string => {
  const parts = [`typeof ${ref} === "number"`, `${ref} >= ${String(schema.min)}`, `${ref} <= ${String(schema.max)}`];
  if (schema.int) parts.push(`Number.isInteger(${ref})`);
  return parts.join(' && ');
};

const member = (schema: Node, ref: string): string => {
  const tests = [...(schema.values as ReadonlySet<unknown>)].map((value) => `${ref} === ${JSON.stringify(value)}`);
  return tests.length === 0 ? 'false' : `(${tests.join(' || ')})`;
};

const array = (emitter: Emitter, schema: Node): string => {
  const bounds = [schema.min > 0 ? ` || v.length < ${String(schema.min)}` : '', schema.max < Number.MAX_VALUE ? ` || v.length > ${String(schema.max)}` : ''];
  const item = test(emitter, schema.item as Node, 'v[i]');
  return `(v) => {
  if (!Array.isArray(v)${bounds.join('')}) return false;
  for (let i = 0; i < v.length; i++) if (!(${item})) return false;
  return true;
}`;
};

const object = (emitter: Emitter, schema: Node): string => {
  const fields = schema.fields as readonly Node[];
  const tests = (schema.keys as readonly string[]).map((key, index) => {
    const field = fields[index] as Node;
    const ref = `v[${JSON.stringify(key)}]`;
    const inner = test(emitter, field, ref);
    return field.optional ? `(${ref} === undefined || (${inner}))` : `(${inner})`;
  });
  return `(v) => ${[isObject('v'), ...tests].join('\n  && ')}`;
};

const union = (emitter: Emitter, schema: Node): string => {
  const cases = Object.entries(schema.cases as Readonly<Record<string, Node>>).map(
    ([tag, chosen]) => `    case ${JSON.stringify(tag)}: return ${test(emitter, chosen, 'v')};`,
  );
  return `(v) => {
  if (!(${isObject('v')})) return false;
  switch (v[${JSON.stringify(schema.tag)}]) {
${cases.join('\n')}
    default: return false;
  }
}`;
};

/** The function for a node that needs one, written the first time it is asked for. */
const named = (emitter: Emitter, schema: Node, write: (emitter: Emitter, schema: Node) => string): string => {
  const known = emitter.named.get(schema);
  if (known !== undefined) return known;
  const name = declare(emitter, 'f', write(emitter, schema));
  emitter.named.set(schema, name);
  return name;
};

/** A boolean expression that is true when `ref` is what the schema describes. */
function test(emitter: Emitter, schema: Node, ref: string): string {
  switch (schema.kind) {
    case 'string': {
      return string(emitter, schema, ref);
    }
    case 'number': {
      return number(schema, ref);
    }
    case 'boolean': {
      return `typeof ${ref} === "boolean"`;
    }
    case 'literal': {
      return `${ref} === ${JSON.stringify(schema.value)}`;
    }
    case 'enum': {
      return member(schema, ref);
    }
    case 'array': {
      return `${named(emitter, schema, array)}(${ref})`;
    }
    case 'object': {
      return `${named(emitter, schema, object)}(${ref})`;
    }
    case 'discriminated': {
      return `${named(emitter, schema, union)}(${ref})`;
    }
  }
}

/**
 * JavaScript for a function `(value) => boolean` that answers what `check(schema, value)` answers.
 * It is one expression, so `export const isOrder = ${emit(Order)};` is a module.
 */
export const emit = <T>(schema: Schema<T>): string => {
  const emitter: Emitter = { lines: [], named: new Map() };
  const entry = test(emitter, schema, 'v');
  return `(() => {\n${emitter.lines.join('\n')}\nreturn (v) => ${entry};\n})()`;
};
