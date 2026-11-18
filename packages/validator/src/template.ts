import { type Step } from './check.js';
import { type Node } from './schema.js';

/**
 * A template literal as a small regular language: the pieces below, read two ways from one tree.
 * `check` reads the steps of a machine (check.ts, `isTemplate`), which never backtracks; the JSON
 * Schema writer reads a pattern made from the same tree. One tree, so the two cannot disagree.
 *
 * Which schemas may stand in a template's hole is what TypeScript's own template literal types
 * allow, read as the text `String(value)` writes for a value: a string, a number, a bigint, a
 * boolean, `null`, `undefined`, and literals, enums, unions and nullables of those.
 */

/** A piece of a template: some text, one UTF-16 unit inside a range, any number of a piece, one piece of several, or several in a row. */
type Piece =
  | { readonly is: 'text'; readonly text: string }
  | { readonly is: 'range'; readonly low: number; readonly high: number }
  | { readonly is: 'any' }
  | { readonly is: 'star'; readonly of: Piece }
  | { readonly is: 'either'; readonly of: readonly Piece[] }
  | { readonly is: 'row'; readonly of: readonly Piece[] };

/** What a template node holds in `value`: the steps `check` reads and the pattern JSON Schema is given. */
interface Template {
  readonly steps: readonly Step[];
  readonly source: string;
  readonly tree: Piece;
}

// Stryker disable next-line NumericLiteral: equivalent, there is no UTF-16 unit above 0xffff for a wider range to take in
const LAST_UNIT = 0xff_ff;
const HEX = 16;
const UNIT_DIGITS = 4;
const [ZERO, ONE, NINE] = [0x30, 0x31, 0x39];

const text = (value: string): Piece => ({ is: 'text', text: value });
const range = (low: number, high: number): Piece => ({ is: 'range', low, high });
const star = (of: Piece): Piece => ({ is: 'star', of });
const either = (...of: Piece[]): Piece => ({ is: 'either', of });
const row = (...of: Piece[]): Piece => ({ is: 'row', of });
const maybe = (of: Piece): Piece => either(of, row());

/*
 * The pieces below are made when this module loads, by calls a bundler cannot see through: each is
 * marked free of side effects, so a program that never builds a template carries none of them
 * (wave4.test.ts holds the marks, as own.test.ts holds the kinds').
 */
const DIGIT = /* @__PURE__ */ range(ZERO, NINE);
const DIGITS = /* @__PURE__ */ row(DIGIT, /* @__PURE__ */ star(DIGIT));
/** A whole number as JSON writes one (RFC 8259 §6): no plus, no leading zero. */
const WHOLE = /* @__PURE__ */ row(/* @__PURE__ */ maybe(/* @__PURE__ */ text('-')), /* @__PURE__ */ either(/* @__PURE__ */ text('0'), /* @__PURE__ */ row(/* @__PURE__ */ range(ONE, NINE), /* @__PURE__ */ star(DIGIT))));
/** A number as JSON writes one, which is what `String` writes for every finite double: `1e+21` included. */
const NUMBER = /* @__PURE__ */ row(
  WHOLE,
  /* @__PURE__ */ maybe(/* @__PURE__ */ row(/* @__PURE__ */ text('.'), DIGITS)),
  /* @__PURE__ */ maybe(/* @__PURE__ */ row(/* @__PURE__ */ either(/* @__PURE__ */ text('e'), /* @__PURE__ */ text('E')), /* @__PURE__ */ maybe(/* @__PURE__ */ either(/* @__PURE__ */ text('+'), /* @__PURE__ */ text('-'))), DIGITS)),
);
const ANY = /* @__PURE__ */ star({ is: 'any' });

/** The text `String` writes for a literal's value, which is what TypeScript's template literal types read it as. */
const written = (value: unknown, index: number): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean' || value === null || value === undefined) return String(value);
  throw new TypeError(`part ${String(index)} of the template is a literal that has no text. fix: use a string, number, bigint, boolean, null or undefined`);
};

/** Whether a string or number schema adds nothing to its kind: a template can say "a string" or "a number", not "a string of five". */
const isBare = (schema: Node): boolean =>
  schema.min <= 0 && schema.max === Number.MAX_VALUE && schema.pattern === null && schema.rule === null;

const isBareNumber = (schema: Node): boolean =>
  schema.min === -Number.MAX_VALUE && schema.max === Number.MAX_VALUE && schema.above === -Infinity && schema.below === Infinity && schema.step === 0;

function refused(index: number, what: string): never {
  throw new TypeError(`part ${String(index)} of the template is ${what}, which has no text a template can match. fix: use a string, number, bigint, boolean, literal or enum schema, or a union or nullable of them, with no bounds`);
}

/** The piece a schema stands for in a hole: the texts of the values it accepts. */
const pieceOf = (schema: Node, index: number): Piece => {
  switch (schema.kind) {
    case 'string': {
      if (!isBare(schema)) refused(index, 'a string with bounds, a pattern or a format');
      return ANY;
    }
    case 'number': {
      if (!isBareNumber(schema)) refused(index, 'a number with bounds');
      return schema.int ? WHOLE : NUMBER;
    }
    case 'bigint': {
      const [min, max] = schema.value as readonly unknown[];
      if (min !== -Infinity || max !== Infinity) refused(index, 'a bigint with bounds');
      return WHOLE;
    }
    case 'boolean': {
      return either(text('true'), text('false'));
    }
    case 'literal': {
      return text(written(schema.value, index));
    }
    case 'enum': {
      return either(...[...(schema.values as ReadonlySet<unknown>)].map((value) => text(written(value, index))));
    }
    case 'union': {
      return either(...(schema.fields as readonly Node[]).map((member) => pieceOf(member, index)));
    }
    case 'nullable': {
      return either(pieceOf(schema.item as Node, index), text('null'));
    }
    case 'template': {
      return (schema.value as Template).tree;
    }
    default: {
      refused(index, `a schema of the kind ${typeof schema.kind === 'string' ? JSON.stringify(schema.kind) : typeof schema.kind}`);
    }
  }
};

/** A split: on to the steps `first` and `second` places on from this one. */
const split = (first: number, second: number): Step => [1, first, second];

/** A jump: a split whose two ways are one. */
const jump = (to: number): Step => split(to, to);

/** A step no unit is inside: what an `either` of nothing is. */
const NONE: Step = [0, 1, 0];

/**
 * The steps of a piece (Thompson, 1968). Every jump is counted from the step that makes it, so a
 * piece's steps mean the same wherever they are put, and leaving a piece is stepping past its last.
 */
const stepsOf = (piece: Piece): Step[] => {
  switch (piece.is) {
    case 'text': {
      // One step a UTF-16 unit, as `check` reads the string: a pair is two.
      return Array.from({ length: piece.text.length }, (_, index): Step => {
        // eslint-disable-next-line conventions/prefer-code-point -- a unit, not a code point: the machine reads the string one UTF-16 unit at a time
        const code = piece.text.charCodeAt(index);
        return [0, code, code];
      });
    }
    case 'range': {
      return [[0, piece.low, piece.high]];
    }
    case 'any': {
      return [[0, 0, LAST_UNIT]];
    }
    case 'star': {
      // Into the piece or past it; at its end, back to the split.
      const inner = stepsOf(piece.of);
      return [split(1, inner.length + 2), ...inner, jump(-(inner.length + 1))];
    }
    case 'row': {
      return piece.of.flatMap(stepsOf);
    }
    case 'either': {
      // Two ways at a time, from the last: into the first or past it, and at its end a jump past the rest.
      const ways = piece.of.map(stepsOf);
      if (ways.length === 0) return [NONE];
      return ways.reduceRight((rest, way) => [split(1, way.length + 2), ...way, jump(rest.length + 1), ...rest]);
    }
  }
};

/** The characters a pattern has to escape outside a class, under the `u` flag. */
const SYNTAX = /[\^$\\.*+?()[\]{}|/]/gu;

/** A UTF-16 unit as an escape the `u` flag reads as itself, even when it is half of a pair. */
const unit = (code: number): string => `\\u${code.toString(HEX).padStart(UNIT_DIGITS, '0')}`;

/** The pattern of a piece, read under the `u` flag. */
const sourceOf = (piece: Piece): string => {
  switch (piece.is) {
    case 'text': {
      return piece.text.replaceAll(SYNTAX, '\\$&');
    }
    case 'range': {
      return `[${unit(piece.low)}-${unit(piece.high)}]`;
    }
    case 'any': {
      return '[\\s\\S]';
    }
    case 'star': {
      return `(?:${sourceOf(piece.of)})*`;
    }
    case 'row': {
      return piece.of.map(sourceOf).join('');
    }
    case 'either': {
      return piece.of.length === 0 ? '[]' : `(?:${piece.of.map(sourceOf).join('|')})`;
    }
  }
};

/** The parts of a template: text, or a schema for a hole. */
type Part = string | Node;

/** A template's tree, steps and pattern, from its parts. */
const compile = (parts: readonly Part[]): Template => {
  const tree = row(...parts.map((part, index) => (typeof part === 'string' ? text(part) : pieceOf(part, index))));
  return Object.freeze({ steps: Object.freeze(stepsOf(tree)), source: `^${sourceOf(tree)}$`, tree });
};

/** How a template is named in a message: its parts, a hole as `${…}` with the kind it holds. */
const describe = (parts: readonly Part[]): string =>
  `a string of the template \`${parts.map((part) => (typeof part === 'string' ? part.replaceAll('`', '\\`') : `\${${String(part.kind)}}`)).join('')}\``;

export { compile, describe, type Part, type Template };
