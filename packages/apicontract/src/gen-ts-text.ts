/**
 * Source text for names and literals, as the TypeScript printer writes them: string escapes,
 * property names, enum member names, and the `PascalCase` used for root type aliases.
 */

const HEX = 16;
const UNIT_WIDTH = 4;
const SPACE = 0x20;
const ASCII_MAX = 0x7f;

const NAMED_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['\t', String.raw`\t`],
  ['\v', String.raw`\v`],
  ['\f', String.raw`\f`],
  ['\b', String.raw`\b`],
  ['\r', String.raw`\r`],
  ['\n', String.raw`\n`],
  ['\\', String.raw`\\`],
  ['"', String.raw`\"`],
]);

const DIGIT = /^\d$/;

const escapeUnit = (unit: string, next: string): string => {
  const named = NAMED_ESCAPES.get(unit);
  if (named !== undefined) return named;
  // eslint-disable-next-line conventions/prefer-code-point -- escapes are written per UTF-16 code unit; a code point would merge a surrogate pair
  const code = unit.charCodeAt(0);
  // A NUL before a digit would read as an octal escape, so it is spelled out.
  if (code === 0) return DIGIT.test(next) ? String.raw`\x00` : String.raw`\0`;
  if (code >= SPACE && code <= ASCII_MAX) return unit;
  return String.raw`\u${code.toString(HEX).toUpperCase().padStart(UNIT_WIDTH, '0')}`;
};

/** A double-quoted string literal: control and non-ASCII code units become escapes. */
export const quote = (text: string): string => {
  let out = '"';
  for (let index = 0; index < text.length; index++) {
    out += escapeUnit(text.charAt(index), text.charAt(index + 1));
  }
  return `${out}"`;
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z_$0-9]*$/;
const INVALID_RUN = /[^A-Za-z_$0-9]+/g;
const INVALID_RUN_THEN_NEXT = /[^A-Za-z_$0-9]+(.)?/g;
const INVALID_UNIT = /[^A-Za-z_$0-9]/;

/** A property name: a number or an identifier stays bare, anything else is quoted. */
export const propertyName = (index: unknown): string => {
  if (typeof index === 'number' && !(index < 0)) return String(index);
  if (typeof index !== 'string') return quote(String(index));
  if (String(Number(index)) === index && !index.startsWith('-')) return index;
  return IDENTIFIER.test(index) ? index : quote(index);
};

/**
 * Upstream tests a trailing invalid character with a global regular expression, whose `lastIndex`
 * survives the call: after one hit the next test misses, whatever it is given. The flag stands in
 * for that `lastIndex`, so the names come out the same.
 */
export interface NameState {
  sticky: boolean;
}

const lastUnit = (state: NameState, last: string): string => {
  if (state.sticky) {
    state.sticky = false;
    return last.toUpperCase();
  }
  if (INVALID_UNIT.test(last)) {
    state.sticky = true;
    return '';
  }
  return last.toUpperCase();
};

/** A name for an enum or a values array: runs of invalid characters go, the next letter is raised. */
export const memberName = (name: string, state: NameState): string => {
  const sanitized = name.replaceAll(INVALID_RUN_THEN_NEXT, (match) => lastUnit(state, match.charAt(match.length - 1)));
  return Number(name[0]) >= 0 ? `Value${name}` : sanitized;
};

const SPECIAL: ReadonlyMap<string, string> = new Map([['+', 'Plus']]);

const invalidRunsReplaced = (name: string, state: NameState): string => {
  // `String#match` rewinds the shared regular expression upstream, hit or miss.
  state.sticky = false;
  const runs = name.match(INVALID_RUN);
  if (runs === null) return name;
  return runs[0] === name ? `"${name}"` : name.replaceAll(INVALID_RUN, (run) => SPECIAL.get(run) ?? '_');
};

/** The name of one enum member: `Value` before a leading digit, `ValueMinus` for a leading `-`. */
export const enumMemberName = (given: string, state: NameState): string => {
  if (IDENTIFIER.test(given)) return given;
  let name = given;
  if (Number(name[0]) >= 0) name = `Value${name}`.replace('.', '_');
  else if (name.startsWith('-')) name = `ValueMinus${name.slice(1)}`;
  return invalidRunsReplaced(name, state);
};

const LOWER_UPPER = /([\p{Ll}\d])(\p{Lu})/gu;
const UPPER_UPPER_LOWER = /(\p{Lu})([\p{Lu}][\p{Ll}])/gu;
const NOT_WORD = /[^\p{L}\d]+/giu;
const BOUNDARY = '\0';
const SPLIT = `$1${BOUNDARY}$2`;

const words = (value: string): string[] => {
  const marked = value
    .trim()
    .replaceAll(LOWER_UPPER, SPLIT)
    .replaceAll(UPPER_UPPER_LOWER, SPLIT)
    .replaceAll(NOT_WORD, BOUNDARY);
  return marked.split(BOUNDARY).filter((word) => word !== '');
};

const pascalWord = (word: string, index: number): string => {
  const first = word.charAt(0);
  const initial = index > 0 && first >= '0' && first <= '9' ? `_${first}` : first.toUpperCase();
  return initial + word.slice(1).toLowerCase();
};

/** `change-case`'s `pascalCase` with its default options. */
export const pascalCase = (value: string): string => words(value).map(pascalWord).join('');
