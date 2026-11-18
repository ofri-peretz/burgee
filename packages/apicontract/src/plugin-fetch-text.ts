/**
 * Writing generated source safely. Every name, path and example in a client or a mock comes from the
 * user's spec, so each one enters the generated file as a JSON literal, with the characters a page or
 * an older parser could misread (`<`, `>`, U+2028, U+2029) escaped as well.
 */
const UNSAFE: Readonly<Record<string, string>> = { '<': '\\u003C', '>': '\\u003E', '\u2028': '\\u2028', '\u2029': '\\u2029' };

/** A value as a TypeScript literal, safe to place in generated source. */
export const literal = (value: unknown): string => JSON.stringify(value).replaceAll(/[<>\u2028\u2029]/gu, (character) => UNSAFE[character] as string);

/** Lines of a file, ending in a newline. */
export const lines = (...text: readonly string[]): string => `${text.join('\n')}\n`;

/** Whether a name can be written as a bare property key. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

/** A property key: bare when it can be, a literal otherwise. */
export const key = (name: string): string => (IDENTIFIER.test(name) ? name : literal(name));
