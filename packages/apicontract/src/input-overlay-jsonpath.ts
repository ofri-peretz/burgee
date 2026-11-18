/**
 * The RFC 9535 JSONPath queries an Overlay `target` and `copy` are written in: enough of the RFC
 * for the Overlay specification's own examples and test suite, and a refusal with a `fix:` line
 * for the rest.
 *
 * Read: the root `$`; child segments `.name`, `.*`, `['name']`, `["name"]`, `[n]` (negative from
 * the end), `[*]` and unions of those (`['a','b']`); descendant segments `..name`, `..*`, `..[…]`;
 * filters `[?…]` with `@` and `$` queries, existence tests, the comparisons `==`, `!=`, `<`, `<=`,
 * `>`, `>=` over string, number, `true`, `false` and `null` literals, `&&`, `||`, `!` and
 * parentheses. Not read: array slices (`[1:3]`) and the function extensions (`length()`,
 * `count()`, `match()`, `search()`, `value()`).
 *
 * A query returns nodes, each with its parent and the key it is held under, so an action can
 * change or remove what it selected.
 */

type Json = unknown;

/** A selected value, and where it is held: `parent[key]`, or the root when there is no parent. */
export interface Node {
  readonly value: Json;
  readonly parent: Record<string, Json> | Json[] | undefined;
  readonly key: string | number | undefined;
}

type Selector =
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'wildcard' }
  | { readonly kind: 'index'; readonly index: number }
  | { readonly kind: 'filter'; readonly test: Expression };

interface Segment {
  readonly descendant: boolean;
  readonly selectors: readonly Selector[];
}

interface Query {
  /** `$` (the document) or `@` (the node a filter is testing). */
  readonly root: '$' | '@';
  readonly segments: readonly Segment[];
}

type Comparator = '==' | '!=' | '<' | '<=' | '>' | '>=';

type Expression =
  | { readonly kind: 'or' | 'and'; readonly left: Expression; readonly right: Expression }
  | { readonly kind: 'not'; readonly operand: Expression }
  | { readonly kind: 'exists'; readonly query: Query }
  | { readonly kind: 'compare'; readonly op: Comparator; readonly left: Operand; readonly right: Operand };

type Operand = { readonly kind: 'literal'; readonly value: Json } | { readonly kind: 'query'; readonly query: Query };

/** A query this reader cannot parse. The message ends in a `fix:` line. */
export class JsonPathError extends Error {
  constructor(path: string, reason: string, fix: string) {
    super(`cannot read the JSONPath \`${path}\`: ${reason}. fix: ${fix}`);
    this.name = 'JsonPathError';
  }
}

const NAME_FIRST = /[A-Za-z_\u0080-\uFFFF]/;
// RFC 9535 does not allow `-` in a shorthand name; the Overlay specification's own examples write
// `@.x-oai-traits`, so it is read.
const NAME_REST = /[\w\-\u0080-\uFFFF]/;
const COMPARATORS: readonly Comparator[] = ['==', '!=', '<=', '>=', '<', '>'];

/** A recursive-descent parser over one query string. */
const createParser = (path: string) => {
  let at = 0;
  const fail = (reason: string, fix = 'write the query as RFC 9535 describes it'): never => {
    throw new JsonPathError(path, `${reason} at character ${String(at)}`, fix);
  };
  const blank = (): void => {
    while (at < path.length && ' \t\n\r'.includes(path.charAt(at))) at += 1;
  };
  const take = (text: string): boolean => {
    if (!path.startsWith(text, at)) return false;
    at += text.length;
    return true;
  };

  const quoted = (): string => {
    const quote = path.charAt(at);
    at += 1;
    let text = '';
    while (at < path.length && path.charAt(at) !== quote) {
      if (path.charAt(at) === '\\') at += 1;
      text += path.charAt(at);
      at += 1;
    }
    if (!take(quote)) fail('a string is not closed');
    return text;
  };

  const integer = (): number => {
    const match = /^-?\d+/.exec(path.slice(at));
    if (match === null) return fail(`\`${path.charAt(at)}\` is not a selector`);
    at += match[0].length;
    if (path.charAt(at) === ':') fail('array slices are not read', 'select the items by index, or with a filter');
    return Number(match[0]);
  };

  const shorthand = (): Selector => {
    if (take('*')) return { kind: 'wildcard' };
    if (!NAME_FIRST.test(path.charAt(at))) fail('a name is expected after `.`');
    const start = at;
    while (at < path.length && NAME_REST.test(path.charAt(at))) at += 1;
    return { kind: 'name', name: path.slice(start, at) };
  };

  // Filled in below: a filter's selector and its expression call each other.
  let expression: () => Expression;

  const selector = (): Selector => {
    blank();
    if (path.charAt(at) === "'" || path.charAt(at) === '"') return { kind: 'name', name: quoted() };
    if (take('*')) return { kind: 'wildcard' };
    if (take('?')) return { kind: 'filter', test: expression() };
    return { kind: 'index', index: integer() };
  };

  const bracketed = (): Selector[] => {
    const selectors = [selector()];
    blank();
    while (take(',')) {
      selectors.push(selector());
      blank();
    }
    if (!take(']')) fail('a `]` is expected');
    return selectors;
  };

  const segments = (): Segment[] => {
    const list: Segment[] = [];
    for (;;) {
      const mark = at;
      blank();
      if (take('..')) {
        list.push({ descendant: true, selectors: take('[') ? bracketed() : [shorthand()] });
      } else if (take('.')) {
        list.push({ descendant: false, selectors: [shorthand()] });
      } else if (take('[')) {
        list.push({ descendant: false, selectors: bracketed() });
      } else {
        at = mark;
        return list;
      }
    }
  };

  const query = (): Query | undefined => {
    blank();
    const root = path.charAt(at);
    if (root !== '$' && root !== '@') return undefined;
    at += 1;
    return { root, segments: segments() };
  };

  const literal = (): Operand => {
    if (path.charAt(at) === "'" || path.charAt(at) === '"') return { kind: 'literal', value: quoted() };
    for (const [word, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (take(word)) return { kind: 'literal', value };
    }
    const match = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(path.slice(at));
    if (match === null) {
      return /^[a-z]\w*\(/.test(path.slice(at))
        ? fail('function extensions are not read', 'compare the value directly, or select it with a filter')
        : fail('a value or a query is expected');
    }
    at += match[0].length;
    return { kind: 'literal', value: Number(match[0]) };
  };

  const operand = (): Operand => {
    const found = query();
    return found === undefined ? literal() : { kind: 'query', query: found };
  };

  const basic = (): Expression => {
    blank();
    if (take('!')) return { kind: 'not', operand: basic() };
    if (take('(')) {
      const inner = expression();
      blank();
      if (!take(')')) fail('a `)` is expected');
      return inner;
    }
    const left = operand();
    blank();
    const op = COMPARATORS.find((candidate) => take(candidate));
    if (op === undefined) {
      if (left.kind === 'literal') fail('a value on its own is not a test', 'compare it with something, e.g. `@.name == …`');
      return { kind: 'exists', query: (left as { query: Query }).query };
    }
    blank();
    return { kind: 'compare', op, left, right: operand() };
  };

  const binary = (kind: 'and' | 'or', symbol: string, next: () => Expression) => (): Expression => {
    let left = next();
    blank();
    while (take(symbol)) {
      left = { kind, left, right: next() };
      blank();
    }
    return left;
  };

  expression = binary('or', '||', binary('and', '&&', basic));

  return {
    parse: (): Query => {
      blank();
      if (!take('$')) fail('a query starts with `$`');
      const parsed: Query = { root: '$', segments: segments() };
      blank();
      if (at < path.length) fail(`\`${path.slice(at)}\` is not read`);
      return parsed;
    },
  };
};

/** Parse an RFC 9535 query. */
export const parse = (path: string): Query => createParser(path).parse();

const isObject = (value: Json): value is Record<string, Json> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A node's children, in document order. */
const children = (node: Node): Node[] => {
  const { value } = node;
  if (Array.isArray(value)) return value.map((item, index) => ({ value: item, parent: value, key: index }));
  if (!isObject(value)) return [];
  return Object.entries(value).map(([key, item]) => ({ value: item, parent: value, key }));
};

/** A node and every node under it, the node first. */
const descendants = (node: Node): Node[] => [node, ...children(node).flatMap((child) => descendants(child))];

const deepEqual = (left: Json, right: Json): boolean => {
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  if (isObject(left) && isObject(right)) {
    const keys = Object.keys(left);
    // eslint-disable-next-line conventions/consistent-existence-index-check -- own members only: an inherited `toString` is not a member
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
  }
  return left === right;
};

/** Nothing: a query that selects no single node. It equals only itself. */
const NOTHING = Symbol('nothing');

const lessThan = (left: Json, right: Json): boolean =>
  (typeof left === 'number' && typeof right === 'number') || (typeof left === 'string' && typeof right === 'string') ? left < right : false;

const compare = (op: Comparator, left: Json, right: Json): boolean => {
  const equal = deepEqual(left, right);
  const less = lessThan(left, right);
  const results: Record<Comparator, boolean> = {
    '==': equal,
    '!=': !equal,
    '<': less,
    '<=': less || equal,
    '>': lessThan(right, left),
    '>=': lessThan(right, left) || equal,
  };
  return results[op];
};

/** The children of `node` one selector picks; a filter asks `test` of each child. */
const select = (node: Node, selector: Selector, test: (expression: Expression, current: Node) => boolean): Node[] => {
  const all = children(node);
  switch (selector.kind) {
    case 'wildcard': {
      return all;
    }
    case 'name': {
      return isObject(node.value) ? all.filter(({ key }) => key === selector.name) : [];
    }
    case 'index': {
      if (!Array.isArray(node.value)) return [];
      const index = selector.index < 0 ? node.value.length + selector.index : selector.index;
      return all.filter(({ key }) => key === index);
    }
    default: {
      return all.filter((child) => test(selector.test, child));
    }
  }
};

const createEvaluator = (document: Json) => {
  const rootNode: Node = { value: document, parent: undefined, key: undefined };

  const run = (query: Query, current: Node): Node[] => {
    let nodes = [query.root === '$' ? rootNode : current];
    for (const { descendant, selectors } of query.segments) {
      const from = descendant ? nodes.flatMap((node) => descendants(node)) : nodes;
      nodes = from.flatMap((node) => selectors.flatMap((selector) => select(node, selector, test)));
    }
    return nodes;
  };

  const valueOf = (operand: Operand, current: Node): Json | typeof NOTHING => {
    if (operand.kind === 'literal') return operand.value;
    const nodes = run(operand.query, current);
    return nodes.length === 1 ? nodes[0]?.value : NOTHING;
  };

  const test = (expression: Expression, current: Node): boolean => {
    switch (expression.kind) {
      case 'or': {
        return test(expression.left, current) || test(expression.right, current);
      }
      case 'and': {
        return test(expression.left, current) && test(expression.right, current);
      }
      case 'not': {
        return !test(expression.operand, current);
      }
      case 'exists': {
        return run(expression.query, current).length > 0;
      }
      default: {
        return compare(expression.op, valueOf(expression.left, current), valueOf(expression.right, current));
      }
    }
  };

  return { run: (query: Query): Node[] => run(query, rootNode) };
};

/** The nodes of `document` an RFC 9535 query selects, in document order, each with where it is held. */
export const query = (document: Json, path: string): Node[] => createEvaluator(document).run(parse(path));
