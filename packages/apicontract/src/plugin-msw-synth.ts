/**
 * A value for a schema when the spec gives no example (apicontract-clients R6): a pure function of
 * the schema and a seed, so the same spec mocks the same bytes on every run. It honours `const`,
 * `enum`, `format` (the table below), `minimum`/`maximum` and their exclusive forms, `minLength`/
 * `maxLength`, `minItems`, `allOf`/`anyOf`/`oneOf` (the first branch) and `$ref`; a nested `example`
 * or `examples[0]` is used as written.
 *
 * ponytail: `pattern`, `multipleOf`, `uniqueItems` and a required property that refers back to its
 * own schema are not honoured; a value for one may not validate. Add them when a fixture needs it.
 */
import { pointerGet } from './core/resolve.js';

type Dict = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A value for each format a mock is likely to meet. */
const FORMATS: Readonly<Record<string, string>> = {
  date: '2024-01-15',
  'date-time': '2024-01-15T09:30:00Z',
  time: '09:30:00Z',
  email: 'user@example.com',
  uuid: '3f2b6c1e-8d4a-4c7e-9b1f-5a6d7e8f9a0b',
  uri: 'https://example.com/',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
};

/** FNV-1a's 32-bit offset basis and prime. */
const FNV_OFFSET = 2_166_136_261;
const FNV_PRIME = 16_777_619;
/** The ANSI C linear congruential generator; its low bits repeat, so a draw reads the high half. */
const LCG_MULTIPLIER = 1_103_515_245;
const LCG_INCREMENT = 12_345;
const HIGH_HALF = 16;
/** How far above its minimum an unbounded number may go. */
const SPAN = 99;

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

/** FNV-1a: a seed from text, e.g. an operation id. */
export const seedOf = (text: string): number => {
  let hash = FNV_OFFSET;
  for (const character of text) hash = Math.imul(hash ^ (character.codePointAt(0) as number), FNV_PRIME) >>> 0;
  return hash;
};

/** The example a schema or a media type carries: `example`, then `examples[0]`. */
export const exampleOf = (node: Dict): { readonly value: unknown } | undefined => {
  if (node.example !== undefined) return { value: node.example };
  if (Array.isArray(node.examples) && node.examples.length > 0) return { value: node.examples[0] };
  return undefined;
};

const typeOf = (node: Dict): unknown => {
  // A list with only `null` in it finds nothing, which reads as `null` below.
  if (Array.isArray(node.type)) return node.type.find((type) => type !== 'null');
  if (node.type !== undefined) return node.type;
  if (node.properties !== undefined) return 'object';
  return node.items === undefined ? undefined : 'array';
};

const bound = (node: Dict, inclusive: string, exclusive: string, step: number): number | undefined => {
  if (typeof node[inclusive] === 'number') return node[inclusive];
  return typeof node[exclusive] === 'number' ? Math.floor(node[exclusive]) + step : undefined;
};

/** A value `schema` accepts, the same for the same seed. `root` is what a `$ref` resolves against. */
export const synth = (schema: unknown, seed: number, root: unknown = schema): unknown => {
  let state = seed >>> 0;
  /** A whole number below `count`. */
  const draw = (count: number): number => {
    state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return (state >>> HIGH_HALF) % count;
  };
  const open = new Set<string>();

  /** `undefined` only for a reference back into a schema already being built. */
  const value = (node: unknown): unknown => {
    if (!isDict(node)) return null;
    if (typeof node.$ref === 'string') {
      if (open.has(node.$ref)) return undefined;
      open.add(node.$ref);
      const target = value(pointerGet(root, node.$ref));
      open.delete(node.$ref);
      return target;
    }
    if ('const' in node) return node.const;
    if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[draw(node.enum.length)];
    const example = exampleOf(node);
    if (example !== undefined) return example.value;
    return composed(node);
  };

  /** `allOf` merges its parts when each is an object; `oneOf` and `anyOf` take their first branch. */
  const composed = (node: Dict): unknown => {
    if (Array.isArray(node.allOf)) {
      const parts = node.allOf.map((part) => value(part));
      return parts.every((part) => isDict(part)) ? Object.assign({}, ...parts) : parts[0];
    }
    const [branch] = [node.oneOf, node.anyOf].find((list) => Array.isArray(list)) ?? [];
    return branch === undefined ? typed(node) : value(branch);
  };

  const text = (node: Dict): string => {
    const format = String(node.format);
    // eslint-disable-next-line conventions/consistent-existence-index-check -- Own keys only: a `format: toString` must not find an inherited function
    if (Object.hasOwn(FORMATS, format)) return FORMATS[format] as string;
    const word = WORDS[draw(WORDS.length)] as string;
    // A missing bound pads nothing and cuts nothing.
    return word.padEnd(node.minLength as number, word).slice(0, node.maxLength as number);
  };

  const typed = (node: Dict): unknown => {
    switch (typeOf(node)) {
      case 'string':
        return text(node);
      case 'integer':
      case 'number': {
        const low = bound(node, 'minimum', 'exclusiveMinimum', 1) ?? 0;
        const high = bound(node, 'maximum', 'exclusiveMaximum', -1) ?? low + SPAN;
        return low + draw(high - low + 1);
      }
      case 'boolean':
        return draw(2) === 0;
      case 'array': {
        const item = value(node.items);
        const count = typeof node.minItems === 'number' ? Math.max(node.minItems, 1) : 1;
        return item === undefined ? [] : Array.from({ length: count }, (_, index) => (index === 0 ? item : value(node.items)));
      }
      case 'object':
        return Object.fromEntries(
          Object.entries(isDict(node.properties) ? node.properties : {})
            .map(([name, property]) => [name, value(property)])
            .filter((entry) => entry[1] !== undefined),
        );
      default:
        return null;
    }
  };

  return value(schema) ?? null;
};
