/**
 * YAML for configuration files, with no dependency (D-20260930-seniority-yaml).
 *
 * `parse(text)` returns what `js-yaml`'s `load(text)` returns — the value `cosmiconfig` hands
 * its caller for a `.yaml`, a `.yml` or an extensionless rc file — for the part of YAML 1.2
 * that a configuration file is written in:
 *
 * - block mappings and sequences, including a sequence at its key's own indentation and a
 *   mapping written inline after `- `;
 * - flow `[…]` and `{…}`, nested and across lines;
 * - plain scalars, one line or folded over several; single- and double-quoted scalars with
 *   every YAML escape; `|` and `>` block scalars with chomping and an indentation indicator;
 * - comments, `---` / `...` document markers, directives (skipped), anchors and aliases;
 * - the core schema `js-yaml` 5 loads by default: `null`, booleans, integers (`0x`, `0o`),
 *   floats (`.inf`, `.nan`) and strings, and the `!!str` / `!!int` / … tags that force one.
 *
 * Merge keys (`<<`) are an ordinary key here because they are in js-yaml 5's default load too:
 * its `CORE_SCHEMA` leaves `!!merge` out. What this does **not** read is refused by name with
 * the line and column — explicit `? ` keys and custom tags — never guessed at. A document is one
 * document: a second `---` with content is the same error `load` throws.
 *
 * The errors are `YAMLException`s whose message is js-yaml's: the reason, then `(line:column)`,
 * 1-based. cosmiconfig prefixes `YAML Error in <file>:` and its own suite asserts the result,
 * so the wording is the contract and is kept word for word where js-yaml has a word for it.
 *
 * Nothing here imports anything, and no other module in the package imports this one
 * (`shape.test.ts` holds both halves of that): a program that reads no YAML never loads it.
 */

/** Where an error is, 0-based, in the shape of js-yaml's `mark`. */
export interface Mark {
  line: number;
  column: number;
  position: number;
}

/** A document this parser cannot read, with the reason and where. */
export class YAMLException extends Error {
  readonly reason: string;
  readonly mark: Mark | undefined;
  constructor(reason: string, mark?: Mark, snippet = '') {
    super(mark === undefined ? reason : `${reason} (${String(mark.line + 1)}:${String(mark.column + 1)})${snippet}`);
    this.name = 'YAMLException';
    this.reason = reason;
    this.mark = mark;
  }
}

const UNRESOLVED = Symbol('unresolved');
type Resolver = (source: string, explicit: boolean) => unknown;

const oneOf =
  (values: readonly string[], result: unknown): Resolver =>
  (source) =>
    values.includes(source) ? result : UNRESOLVED;
const resolveNull = oneOf(['', '~', 'null', 'Null', 'NULL'], null);
const resolveTrue = oneOf(['true', 'True', 'TRUE'], true);
const resolveFalse = oneOf(['false', 'False', 'FALSE'], false);
const resolveBool: Resolver = (source, explicit) => {
  const value = resolveTrue(source, explicit);
  return value === UNRESOLVED ? resolveFalse(source, explicit) : value;
};

const DECIMAL = 10;
const OCTAL = 8;
const HEX = 16;
const RADIX = new Map([
  ['b', 2],
  ['o', OCTAL],
  ['x', HEX],
]);
const resolveInt: Resolver = (source, explicit) => {
  // An implicit `0b101` or `-0x1F` is a string in the core schema; `!!int` reads both.
  if (!(explicit ? /^[-+]?(?:0b[01]+|0o[0-7]+|0x[\dA-Fa-f]+|\d+)$/u : /^(?:0o[0-7]+|0x[\dA-Fa-f]+|[-+]?\d+)$/u).test(source)) return UNRESOLVED;
  const sign = source.startsWith('-') ? -1 : 1;
  const digits = source.replace(/^[-+]/u, '');
  const radix = RADIX.get(digits.charAt(1)) ?? DECIMAL;
  const value = sign * Number.parseInt(radix === DECIMAL ? digits : digits.slice(2), radix);
  return Number.isFinite(value) ? value : UNRESOLVED;
};

const resolveFloat: Resolver = (source) => {
  if (!/^(?:[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/u.test(source)) return UNRESOLVED;
  const sign = source.startsWith('-') ? -1 : 1;
  const body = source.replace(/^[-+]/u, '').toLowerCase();
  if (body === '.inf') return sign * Number.POSITIVE_INFINITY;
  if (body === '.nan') return Number.NaN;
  const value = sign * Number.parseFloat(body);
  return Number.isFinite(value) ? value : UNRESOLVED;
};

const resolveStr: Resolver = (source) => source;

/** The core schema's scalar tags, by their short name. */
const SCALARS = new Map<string, Resolver>([
  ['null', resolveNull],
  ['bool', resolveBool],
  ['int', resolveInt],
  ['float', resolveFloat],
  ['str', resolveStr],
]);
const IMPLICIT = [resolveNull, resolveBool, resolveInt, resolveFloat];

/** A plain scalar's value: the first of null, bool, int and float that reads it, else the string. */
function resolvePlain(source: string): unknown {
  for (const resolve of IMPLICIT) {
    const value = resolve(source, false);
    if (value !== UNRESOLVED) return value;
  }
  return source;
}

const ESCAPES = new Map([
  ['0', '\0'],
  ['a', '\u0007'],
  ['b', '\b'],
  ['t', '\t'],
  ['\t', '\t'],
  ['n', '\n'],
  ['v', '\v'],
  ['f', '\f'],
  ['r', '\r'],
  ['e', '\u001B'],
  [' ', ' '],
  ['"', '"'],
  ['/', '/'],
  ['\\', '\\'],
  ['N', '\u0085'],
  ['_', '\u00A0'],
  ['L', '\u2028'],
  ['P', '\u2029'],
]);
/** How many hex digits follow `\x`, `\u` and `\U`: one byte, one UTF-16 unit, one code point. */
const BYTE_DIGITS = 2;
const UNIT_DIGITS = 4;
const POINT_DIGITS = 8;
const HEX_WIDTH = new Map([
  ['x', BYTE_DIGITS],
  ['u', UNIT_DIGITS],
  ['U', POINT_DIGITS],
]);
const MAX_CODE_POINT = 0x10_ff_ff;
const FLOW_INDICATORS = ',[]{}';
/** `---` and `...` are three characters. */
const MARKER = 3;
const CORE_TAG = 'tag:yaml.org,2002:';
/** js-yaml 5's default `maxDepth`: deeper nesting is refused rather than left to overflow the stack. */
const MAX_DEPTH = 100;
const MAP_ENTRY = 'bad indentation of a mapping entry';
const SEQUENCE_ENTRY = 'bad indentation of a sequence entry';
const DOCUMENT_END = 'end of the stream or a document separator is expected';
// Built from a string so the control characters are escapes a reader can see, not bytes.
const NON_PRINTABLE = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F-\\x84\\x86-\\x9F\\uFFFE\\uFFFF]', 'u');

type Kind = 'scalar' | 'mapping' | 'sequence';
/** How a block node was reached: at the start of its own line, after `- `, or after `key: `. */
type Context = 'line' | 'entry' | 'value';
interface Props {
  anchor?: string;
  tag?: string;
}
/** A node read up to where it could still turn out to be a mapping key. */
interface Candidate {
  value: unknown;
  kind: Kind;
  /** The scalar's text before resolution, for a tag to re-read; `undefined` for a collection or an alias. */
  raw: string | undefined;
  plain: boolean;
}
/** Where a block node starts and what bounds it: see `blockNode`. */
interface NodeStart {
  parent: number;
  context: Context;
  reason: string;
  start: number;
}
/** A block mapping, once its first key and that key's `:` are read. */
interface MapStart {
  col: number;
  key: unknown;
  keyAt: number;
  props: Props | undefined;
  start: number;
  reason: string;
}

const blank = (c: string): boolean => c === '' || c === ' ' || c === '\t' || c === '\n';
const indented = (line: string): boolean => line.startsWith(' ') || line.startsWith('\t');
const scalar = (value: unknown, raw: string, plain = false): Candidate => ({ value, kind: 'scalar', raw, plain });
const collection = (value: unknown, kind: Kind): Candidate => ({ value, kind, raw: undefined, plain: false });

/** A tag's value for a node, or the reason there is none. `!` alone keeps a scalar a string. */
function tagged(tag: string, node: Candidate): { value: unknown } | { reason: string } {
  if (tag === '!') return { value: node.kind === 'scalar' ? node.raw : node.value };
  const name = tag.startsWith('!!') ? `${CORE_TAG}${tag.slice(2)}` : tag;
  const short = name.startsWith(CORE_TAG) ? name.slice(CORE_TAG.length) : '';
  if (node.kind !== 'scalar') return short === (node.kind === 'mapping' ? 'map' : 'seq') ? { value: node.value } : { reason: `unknown ${node.kind} tag !<${name}>` };
  return taggedScalar(name, short, node.raw as string);
}

/** A scalar under a core-schema tag: re-read by that tag's resolver, or an empty `!!map` / `!!seq`. */
function taggedScalar(name: string, short: string, raw: string): { value: unknown } | { reason: string } {
  const cannot = { reason: `cannot resolve a node with !<${name}> explicit tag` };
  const resolver = SCALARS.get(short);
  if (resolver !== undefined) {
    const value = resolver(raw, true);
    return value === UNRESOLVED ? cannot : { value };
  }
  if (short !== 'map' && short !== 'seq') return { reason: `unknown scalar tag !<${name}>` };
  if (raw !== '') return cannot;
  return { value: short === 'map' ? {} : [] };
}

/** One break between two lines of a block scalar: `>` folds a plain-to-plain break into a space. */
function separator(previous: string, line: string, empties: number, folded: boolean): string {
  if (!folded || indented(previous) || indented(line)) return '\n'.repeat(empties + 1);
  return empties === 0 ? ' ' : '\n'.repeat(empties);
}

/** A block scalar's lines (`''` for an empty one) joined, then chomped: `-` strips the end, `+` keeps it. */
function joinBlock(lines: readonly string[], folded: boolean, chomp: string): string {
  let out = '';
  let empties = 0;
  let previous: string | undefined;
  for (const line of lines) {
    if (line === '') {
      empties++;
      continue;
    }
    out += (previous === undefined ? '\n'.repeat(empties) : separator(previous, line, empties, folded)) + line;
    previous = line;
    empties = 0;
  }
  const content = previous !== undefined;
  if (chomp === '+') return out + '\n'.repeat(content ? empties + 1 : empties);
  return chomp === '' && content ? `${out}\n` : out;
}

/**
 * Read one YAML document into plain values. Throws `YAMLException` for anything outside the
 * subset above, and for input that is not YAML at all.
 */
export function parse(text: string): unknown {
  const src = text.replace(/\r\n?/gu, '\n').replace(/^\uFEFF/u, '');
  let pos = 0;
  let depth = 0;
  const anchors = new Map<string, unknown>();

  const at = (p = pos): string => src.charAt(p);
  const endOf = (p: number): number => {
    const end = src.indexOf('\n', p);
    return end === -1 ? src.length : end;
  };
  /** A `#` starts a comment only after a blank; glued to a token it is part of the line. */
  const isComment = (): boolean => at() === '#' && blank(at(pos - 1));
  const lineEnds = (): boolean => at() === '' || at() === '\n' || isComment();
  const columnOf = (p: number): number => p - src.lastIndexOf('\n', p - 1) - 1;
  const fail = (reason: string, where = pos): never => {
    const line = src.slice(0, where).split('\n').length - 1;
    const mark = { line, column: columnOf(where), position: where };
    const gutter = ` ${String(line + 1)} | `;
    throw new YAMLException(reason, mark, `\n\n${gutter}${src.split('\n')[line] as string}\n${' '.repeat(gutter.length + mark.column)}^`);
  };
  const isMarker = (p = pos): boolean => columnOf(p) === 0 && (src.startsWith('---', p) || src.startsWith('...', p)) && blank(at(p + MARKER));
  const skipSpace = (): void => {
    while (at() === ' ' || at() === '\t') pos++;
  };
  const skipComment = (): void => {
    if (isComment()) pos = endOf(pos);
  };
  const skipName = (): void => {
    while (!blank(at()) && !FLOW_INDICATORS.includes(at())) pos++;
  };
  const isEntry = (): boolean => at() === '-' && blank(at(pos + 1));

  /**
   * From a line break or a line start, on to the first character of the next line that has
   * content. Returns its indentation, or -1 at the end of the input or at a document marker —
   * the two places where every open block collection ends.
   */
  const nextLine = (): number => {
    for (;;) {
      if (at() === '\n') pos++;
      const start = pos;
      skipSpace();
      skipComment();
      if (at() === '\n') continue;
      if (at() === '' || isMarker()) return -1;
      const tab = src.indexOf('\t', start);
      if (tab !== -1 && tab < pos) fail('tab characters must not be used in indentation', tab);
      return pos - start;
    }
  };
  /** After an inline node: a comment may follow on its line and nothing else may. */
  const endLine = (reason: string): number => {
    skipSpace();
    skipComment();
    if (!lineEnds()) fail(reason);
    return nextLine();
  };
  const enter = (): void => {
    depth += 1;
    if (depth > MAX_DEPTH) fail(`nesting exceeded maxDepth (${String(MAX_DEPTH)})`);
  };

  const readProp = (props: Props): void => {
    const start = pos;
    pos++;
    skipName();
    const name = src.slice(start + 1, pos);
    if (src.charAt(start) === '!') {
      if (props.tag !== undefined) fail('duplication of a tag property', start);
      props.tag = `!${name}`;
      return;
    }
    if (props.anchor !== undefined) fail('duplication of an anchor property', start);
    if (name === '') fail('name of an anchor node must contain at least one character', start + 1);
    props.anchor = name;
  };
  const readProps = (): Props | undefined => {
    let props: Props | undefined;
    while (at() === '&' || at() === '!') {
      props ??= {};
      readProp(props);
      skipSpace();
    }
    return props;
  };

  /** Apply a node's tag and record its anchor. */
  const finish = (props: Props | undefined, node: Candidate, where: number): unknown => {
    let { value } = node;
    if (props?.tag !== undefined) {
      const result = tagged(props.tag, node);
      if ('reason' in result) fail(result.reason, where);
      else value = result.value;
    }
    if (props?.anchor !== undefined) anchors.set(props.anchor, value);
    return value;
  };

  /**
   * A mapping entry, defined as an own property so `__proto__` is a key and never a prototype.
   * The duplicate check reads the own property for the same reason: an inherited name such as
   * `constructor` is not a key the document already set.
   */
  const put = (map: Record<string, unknown>, key: unknown, value: unknown, where: number): void => {
    if (typeof key === 'object' && key !== null) fail('object-based map does not support complex keys', where);
    const name = String(key);
    if (Object.getOwnPropertyDescriptor(map, name) !== undefined) fail('duplicated mapping key', where);
    Object.defineProperty(map, name, { value, enumerable: true, configurable: true, writable: true });
  };

  const alias = (props: Props | undefined): Candidate => {
    if (props !== undefined) fail('alias node should not have any properties');
    pos++;
    const start = pos;
    skipName();
    const name = src.slice(start, pos);
    if (name === '') fail('name of an alias node must contain at least one character', start);
    if (!anchors.has(name)) fail(`unidentified alias "${name}"`, start);
    return { value: anchors.get(name), kind: 'scalar', raw: undefined, plain: false };
  };

  /** Whether the plain scalar being read ends at `pos`: at `: `, at ` #`, or (in flow) at an indicator. */
  const plainEnds = (flow: boolean): boolean => {
    const c = at();
    if (c === ':') return blank(at(pos + 1)) || (flow && FLOW_INDICATORS.includes(at(pos + 1)));
    if (c === '#') return blank(at(pos - 1));
    return flow && FLOW_INDICATORS.includes(c);
  };
  /** One line of a plain scalar. Trailing blanks are not part of it. */
  const plainLine = (flow: boolean): string => {
    const start = pos;
    let end = pos;
    while (at() !== '' && at() !== '\n' && !plainEnds(flow)) {
      pos++;
      if (!blank(at(pos - 1))) end = pos;
    }
    return src.slice(start, end);
  };

  /**
   * Where a block plain scalar continues: the next line with text, if it is indented past
   * `parent` and is not a comment or a marker, and how many empty lines come before it.
   * Indentation is spaces; a tab after them is only the blank before the text.
   */
  const continuation = (parent: number): { text: number; empties: number } | undefined => {
    let line = pos + 1;
    let empties = 0;
    for (;;) {
      let text = line;
      while (at(text) === ' ') text++;
      const indent = text - line;
      while (at(text) === ' ' || at(text) === '\t') text++;
      if (at(text) !== '\n') return indent <= parent || at(text) === '' || at(text) === '#' || isMarker(line) ? undefined : { text, empties };
      empties++;
      line = text + 1;
    }
  };
  /** The rest of a block plain scalar, folded: a break is a space and each empty line a newline. A `: ` on a later line is refused with `reason`. */
  const plainMore = (first: string, parent: number, reason: string): string => {
    const more = (): ReturnType<typeof continuation> => (at() === '\n' ? continuation(parent) : undefined);
    let out = first;
    for (let next = more(); next !== undefined; next = more()) {
      pos = next.text;
      out += (next.empties === 0 ? ' ' : '\n'.repeat(next.empties)) + plainLine(false);
      skipSpace();
      if (at() === ':') fail(reason);
    }
    return out;
  };

  /** After a line break inside a quoted scalar: one space, or one newline for each empty line that follows. */
  const fold = (parent: number, kind: string): string => {
    let breaks = 0;
    for (skipSpace(); at() === '\n'; skipSpace()) {
      pos++;
      breaks++;
    }
    if (isMarker()) fail(`unexpected end of the document within a ${kind} quoted scalar`);
    if (at() !== '' && columnOf(pos) <= parent) fail('deficient indentation');
    return breaks === 0 ? ' ' : '\n'.repeat(breaks);
  };

  const escape = (parent: number): string => {
    const c = at();
    pos++;
    if (c === '\n') {
      // An escaped line break joins the lines, empty ones included — js-yaml's reading.
      fold(parent, 'double');
      return '';
    }
    const simple = ESCAPES.get(c);
    if (simple !== undefined) return simple;
    const width = HEX_WIDTH.get(c);
    if (width === undefined) return fail('unknown escape sequence', pos - 1);
    for (let i = 0; i < width; i++) if (!/[\dA-Fa-f]/u.test(at(pos + i))) fail('expected hexadecimal character', pos + i);
    const code = Number.parseInt(src.slice(pos, pos + width), HEX);
    if (code > MAX_CODE_POINT) fail('expected a Unicode code point', pos);
    pos += width;
    return String.fromCodePoint(code);
  };

  const quoted = (parent: number): string => {
    const quote = at();
    const kind = quote === '"' ? 'double' : 'single';
    pos++;
    let out = '';
    let spaces = '';
    for (;;) {
      const c = at();
      if (c === '') fail(`unexpected end of the stream within a ${kind} quoted scalar`);
      pos++;
      if (c === quote && !(quote === "'" && at() === "'")) return out + spaces;
      if (c === ' ' || c === '\t') spaces += c;
      else {
        // Blanks before a line break are dropped; anywhere else they are kept.
        out += c === '\n' ? fold(parent, kind) : spaces + quotedText(c, quote, parent);
        spaces = '';
      }
    }
  };
  /** One character of a quoted scalar that is neither a blank nor a line break. */
  const quotedText = (c: string, quote: string, parent: number): string => {
    if (c !== quote) return c === '\\' && quote === '"' ? escape(parent) : c;
    // `''` inside single quotes is one quote.
    pos++;
    return "'";
  };

  const chompOnce = (chomp: string, c: string): string => {
    if (chomp !== '') fail('repeat of a chomping mode identifier');
    return c;
  };
  const widthOnce = (indent: number, c: string, parent: number): number => {
    if (indent !== -1) fail('repeat of an indentation width identifier');
    if (c === '0') fail('bad explicit indentation width of a block scalar; it cannot be less than one');
    return Math.max(parent, 0) + Number(c);
  };
  /** A block scalar's header, after `|` or `>`: chomping and an indentation indicator, in either order. */
  const blockHeader = (parent: number): { chomp: string; indent: number } => {
    let chomp = '';
    let indent = -1;
    for (let c = at(); c !== '' && '+-0123456789'.includes(c); c = at()) {
      if (c === '+' || c === '-') chomp = chompOnce(chomp, c);
      else indent = widthOnce(indent, c, parent);
      pos++;
    }
    skipSpace();
    skipComment();
    if (!lineEnds()) fail('a line break is expected');
    return { chomp, indent };
  };
  /** A block scalar's lines, from its header's line break to the first line indented less than its own. */
  const blockLines = (parent: number, width: number): string[] => {
    const lines: string[] = [];
    let indent = width;
    while (at() === '\n') {
      const line = pos + 1;
      let text = line;
      while (at(text) === ' ' && (indent === -1 || text - line < indent)) text++;
      if (at(text) === '') break;
      if (at(text) === '\n') {
        lines.push('');
        pos = text;
        continue;
      }
      if (indent === -1) indent = text - line;
      if (text - line < indent || indent <= parent || isMarker(line)) break;
      pos = endOf(text);
      lines.push(src.slice(text, pos));
    }
    return lines;
  };
  /** `|` or `>`, from its indicator to the end of its last content line. */
  const blockScalar = (parent: number): string => {
    const folded = at() === '>';
    pos++;
    const { chomp, indent } = blockHeader(parent);
    return joinBlock(blockLines(parent, indent), folded, chomp);
  };

  /** Blanks, comments and line breaks inside `[…]` or `{…}`; a line inside one is indented past the block it sits in. */
  const flowSpace = (parent: number): void => {
    let crossed = false;
    for (;;) {
      skipSpace();
      skipComment();
      if (at() === '') fail('unexpected end of the stream within a flow collection');
      if (at() !== '\n') break;
      pos++;
      crossed = true;
    }
    if (crossed && columnOf(pos) <= parent) fail('deficient indentation');
  };

  const flowNode = (parent: number): unknown => {
    const start = pos;
    const props = readProps();
    if (props !== undefined) flowSpace(parent);
    const c = at();
    if (c === '*') return alias(props).value;
    if (c === '[' || c === '{') return finish(props, collection(flow(parent), c === '[' ? 'sequence' : 'mapping'), start);
    if (c === '"' || c === "'") {
      const raw = quoted(parent);
      return finish(props, scalar(raw, raw), start);
    }
    // A character no plain scalar starts with leaves the node empty, and the collection refuses it.
    const raw = '#@`|>%'.includes(c) ? '' : plainLine(true);
    return finish(props, scalar(resolvePlain(raw), raw), start);
  };

  /** One entry of a flow collection: a value, or `key: value` — a one-pair mapping inside `[…]`. */
  const flowEntry = (out: Record<string, unknown> | unknown[], parent: number): void => {
    const keyAt = pos;
    const key = flowNode(parent);
    flowSpace(parent);
    if (at() !== ':') {
      if (Array.isArray(out)) out.push(key);
      else put(out, key, null, keyAt);
      return;
    }
    pos++;
    flowSpace(parent);
    const value = flowNode(parent);
    const pairs: Record<string, unknown> = Array.isArray(out) ? {} : out;
    put(pairs, key, value, keyAt);
    if (Array.isArray(out)) out.push(pairs);
  };

  const flow = (parent: number): unknown => {
    enter();
    const close = at() === '{' ? '}' : ']';
    const out: Record<string, unknown> | unknown[] = close === '}' ? {} : [];
    pos++;
    flowSpace(parent);
    while (at() !== close) {
      if (at() === ',') fail("expected the node content, but found ','");
      flowEntry(out, parent);
      flowSpace(parent);
      if (at() === close) break;
      if (at() !== ',') fail('missed comma between flow collection entries');
      pos++;
      flowSpace(parent);
    }
    pos++;
    depth -= 1;
    return out;
  };

  /** Read what may be a key: an alias, a flow collection, a quoted scalar, or one line of a plain one. */
  const candidate = (props: Props | undefined, parent: number, reason: string): Candidate => {
    const c = at();
    if (c === '*') return alias(props);
    if (c === '[' || c === '{') return collection(flow(parent), c === '[' ? 'sequence' : 'mapping');
    if (c === '"' || c === "'") {
      const raw = quoted(parent);
      return scalar(raw, raw);
    }
    if (c === '?' && blank(at(pos + 1))) fail('explicit mapping keys are not supported');
    if ('@`|>%'.includes(c)) fail(reason);
    const raw = plainLine(false);
    return scalar(resolvePlain(raw), raw, true);
  };
  /**
   * Whether `pos` is at a block mapping's `:`. A plain key never stops at a `:` without a blank
   * after it (that `:` is part of the scalar), so a glued one here follows a quoted, flow or
   * alias key, where YAML makes it the separator — and a block mapping still wants the blank.
   */
  const isColon = (): boolean => {
    if (at() !== ':') return false;
    if (!blank(at(pos + 1))) fail('a whitespace character is expected after the key-value separator within a block mapping', pos + 1);
    return true;
  };

  /** The value after a block mapping's `:` — on the same line, below it, or nothing — and the next line's indent. */
  const mapValue = (col: number): [unknown, number] => {
    pos++;
    skipSpace();
    if (!lineEnds()) return blockNode(col, 'value', MAP_ENTRY);
    const indent = endLine('');
    if (indent > col || (indent === col && isEntry())) return blockNode(col, 'line', MAP_ENTRY);
    return [null, indent];
  };

  /** A block mapping whose first key is read and whose `:` is at `pos`. */
  const blockMap = (first: MapStart): [unknown, number] => {
    enter();
    const { col, reason } = first;
    const out: Record<string, unknown> = {};
    let { key, keyAt } = first;
    for (;;) {
      const [value, indent] = mapValue(col);
      put(out, key, value, keyAt);
      if (indent > col) fail(MAP_ENTRY);
      if (indent < col) {
        depth -= 1;
        return [finish(first.props, collection(out, 'mapping'), first.start), indent];
      }
      keyAt = pos;
      const keyProps = readProps();
      const next = candidate(keyProps, col, reason);
      skipSpace();
      if (!isColon()) fail("expected ':' after a mapping key");
      key = finish(keyProps, next, keyAt);
    }
  };

  /** A block sequence whose first `- ` is at `pos`. */
  const blockSeq = (col: number, props: Props | undefined, start: number, reason: string): [unknown, number] => {
    enter();
    const out: unknown[] = [];
    let indent = col;
    while (indent === col && isEntry()) {
      pos++;
      skipSpace();
      let value: unknown = null;
      if (lineEnds()) {
        indent = endLine('');
        if (indent > col) [value, indent] = blockNode(col, 'line', reason);
      } else [value, indent] = blockNode(col, 'entry', reason);
      out.push(value);
    }
    if (indent > col) fail(SEQUENCE_ENTRY);
    depth -= 1;
    return [finish(props, collection(out, 'sequence'), start), indent];
  };

  /** Properties alone on their line belong to the node below, if there is one; else to an empty scalar. */
  const nodeBelow = ({ parent, context, reason, start }: NodeStart, props: Props): [unknown, number] => {
    const indent = endLine('');
    if (indent > parent || (indent === parent && context === 'value' && isEntry())) return blockNode(parent, 'line', reason, props);
    return [finish(props, scalar(null, ''), start), indent];
  };

  /** A scalar, flow collection or alias in block context — or, if a `: ` follows it, a mapping's first key. */
  const inlineNode = ({ parent, context, reason, start }: NodeStart, own: Props | undefined, inherited: Props | undefined): [unknown, number] => {
    const col = columnOf(start);
    const keyAt = pos;
    const node = candidate(own, parent, reason);
    skipSpace();
    if (isColon()) {
      // After `key: `, or after a quoted key that spans lines, the `:` is where the line goes wrong.
      if (context === 'value' || src.slice(keyAt, pos).includes('\n')) fail(reason);
      return blockMap({ col, key: finish(own, node, start), keyAt, props: inherited, start, reason });
    }
    if (node.plain) {
      node.raw = plainMore(node.raw as string, parent, context === 'entry' ? SEQUENCE_ENTRY : reason);
      node.value = resolvePlain(node.raw);
    }
    return [finish(own ?? inherited, node, start), endLine(reason)];
  };

  /**
   * A node in block context, starting at `pos`, whose children must be indented past `parent`.
   * It consumes through the end of its last line and returns its value and the indentation of
   * the next line with content (-1 at the end), which is where its caller decides what is next.
   * `reason` is what trailing text on its line is refused as — js-yaml words it after the
   * nearest enclosing mapping, or the document when there is none.
   */
  function blockNode(parent: number, context: Context, reason: string, inherited?: Props): [unknown, number] {
    const start = pos;
    const own = readProps();
    if (own !== undefined && lineEnds()) return nodeBelow({ parent, context, reason, start }, own);
    const props = own ?? inherited;
    if (isEntry()) {
      // Not after `key: `, and not after properties on the same line: `&a - x` is no sequence.
      if (context === 'value' || own !== undefined) fail(reason);
      return blockSeq(columnOf(pos), props, start, reason);
    }
    if (at() === '|' || at() === '>') {
      const raw = blockScalar(parent);
      return [finish(props, scalar(raw, raw), start), nextLine()];
    }
    return inlineNode({ parent, context, reason, start }, own, inherited);
  }

  /** Skip `%` directive lines, which must be followed by `---`. */
  const directives = (): void => {
    let indent = 0;
    while (at() === '%' && indent === 0) {
      pos = endOf(pos);
      indent = nextLine();
    }
    if (!(isMarker() && at() === '-')) fail('directives end mark is expected');
  };
  /** One document, from `pos`, which is at its first content or its `---`. */
  const document = (): [unknown, number] => {
    if (!(isMarker() && at() === '-')) return blockNode(-1, 'line', DOCUMENT_END);
    pos += MARKER;
    skipSpace();
    const indent = lineEnds() ? endLine('') : 0;
    return indent === -1 ? [null, indent] : blockNode(-1, 'line', DOCUMENT_END);
  };
  const stream = (): unknown[] => {
    const documents: unknown[] = [];
    let indent = nextLine();
    while (pos < src.length) {
      if (at() === '%' && indent === 0) directives();
      if (isMarker() && at() === '.') {
        pos += MARKER;
        indent = endLine(DOCUMENT_END);
        continue;
      }
      const [value, next] = document();
      documents.push(value);
      if (next !== -1) fail(DOCUMENT_END);
      indent = next;
    }
    return documents;
  };

  const bad = NON_PRINTABLE.exec(src);
  if (bad !== null) fail('the stream contains non-printable characters', bad.index + 1);
  const documents = stream();
  if (documents.length === 0) throw new YAMLException('expected a document, but the input is empty');
  if (documents.length > 1) throw new YAMLException('expected a single document in the stream, but found more');
  return documents[0];
}
