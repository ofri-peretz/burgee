/**
 * Read a JavaScript or TypeScript config module as data, without running it (apicontract-kit,
 * rejected alternative "migrating by running the incumbent"). Hey API and orval configs are object
 * literals: `export default defineConfig({ … })`, `export default { … }`, `module.exports = { … }`.
 *
 * Objects, arrays, strings, numbers, `true`, `false`, `null` and `undefined` are read. Anything
 * else (a function, a call, a variable, a spread, a template with `${}`) is kept as an `Unreadable`
 * holding its source text, so the migration reports it as a finding instead of guessing.
 */

/** A value the reader could not take as data, with the source text it was written as. */
export interface Unreadable {
  readonly unreadable: string;
}

export type Literal = null | undefined | boolean | number | string | Unreadable | readonly Literal[] | { readonly [key: string]: Literal };

export const isUnreadable = (value: unknown): value is Unreadable =>
  typeof value === 'object' && value !== null && Object.keys(value).length === 1 && typeof (value as { unreadable?: unknown }).unreadable === 'string';

const WORDS: ReadonlyMap<string, Literal> = new Map<string, Literal>([
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
]);

/** A bare word: a keyword, a number, or a name. */
const WORD = /-?[\w$.]+/uy;
const KEY = /[\w$]+/uy;

/** What may follow a value a word stands for: the end of the text, or a separator. */
const ENDS = new Set(['', ',', ';', ')', ']', '}']);

/** The match of a sticky pattern at `at`, if any. */
const stickyMatch = (pattern: RegExp, source: string, index: number): string | undefined => {
  pattern.lastIndex = index;
  return pattern.exec(source)?.[0];
};

class Reader {
  constructor(
    private readonly source: string,
    private at: number,
  ) {}

  /** Skip spaces and comments. */
  private blank(): void {
    for (;;) {
      const rest = this.source.slice(this.at);
      const skipped = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/u.exec(rest)?.[0];
      if (skipped === undefined) return;
      this.at += skipped.length;
    }
  }

  private peek(): string {
    this.blank();
    return this.source.charAt(this.at);
  }

  /** The end of a quoted string that starts at `start`, past its closing quote. */
  private endOfString(start: number): number {
    const quote = this.source.charAt(start);
    let index = start + 1;
    // Stryker disable next-line EqualityOperator: equivalent, one step past the end slices the same text
    while (index < this.source.length && this.source.charAt(index) !== quote) index += this.source.charAt(index) === '\\' ? 2 : 1;
    return index + 1;
  }

  /** Skip one value whatever it is, brackets and strings balanced, and return its text. */
  private skip(): Unreadable {
    const start = this.at;
    let depth = 0;
    // Stryker disable next-line EqualityOperator: equivalent, one step past the end slices the same text
    while (this.at < this.source.length) {
      const char = this.source.charAt(this.at);
      if (depth === 0 && /[,;)\]}]/u.test(char)) break;
      if (/["'`]/u.test(char)) {
        this.at = this.endOfString(this.at);
        continue;
      }
      if (/[([{]/u.test(char)) depth += 1;
      else if (/[)\]}]/u.test(char)) depth -= 1;
      this.at += 1;
    }
    return { unreadable: this.source.slice(start, this.at).trim() };
  }

  private string(): string | Unreadable {
    const start = this.at;
    const end = this.endOfString(start);
    const body = this.source.slice(start + 1, end - 1);
    this.at = end;
    if (this.source.charAt(start) === '`' && body.includes('${')) return { unreadable: this.source.slice(start, end) };
    return body.replaceAll(/\\(.)/gu, '$1');
  }

  private list(): Literal[] {
    this.at += 1;
    const items: Literal[] = [];
    while (this.peek() !== ']' && this.at < this.source.length) {
      items.push(this.value());
      if (this.peek() === ',') this.at += 1;
    }
    this.at += 1;
    return items;
  }

  private key(): string | undefined {
    const char = this.peek();
    if (/["'`]/u.test(char)) {
      const read = this.string();
      return typeof read === 'string' ? read : undefined;
    }
    const word = stickyMatch(KEY, this.source, this.at);
    if (word === undefined) return undefined;
    this.at += word.length;
    return word;
  }

  private object(): Record<string, Literal> {
    this.at += 1;
    const entries: [string, Literal][] = [];
    while (this.peek() !== '}' && this.at < this.source.length) {
      const start = this.at;
      const key = this.key();
      if (key !== undefined && this.peek() === ':') {
        this.at += 1;
        entries.push([key, this.value()]);
      } else {
        // A spread, a method, a computed key or a shorthand: kept whole under its own text.
        this.at = start;
        const skipped = this.skip();
        entries.push([skipped.unreadable, skipped]);
      }
      if (this.peek() === ',') this.at += 1;
    }
    this.at += 1;
    return Object.fromEntries(entries);
  }

  value(): Literal {
    const char = this.peek();
    if (char === '{') return this.object();
    if (char === '[') return this.list();
    if (/["'`]/u.test(char)) return this.string();
    const word = stickyMatch(WORD, this.source, this.at);
    if (word !== undefined && ENDS.has(this.source.slice(this.at + word.length).trimStart().charAt(0))) {
      if (WORDS.has(word)) {
        this.at += word.length;
        return WORDS.get(word);
      }
      // `word` is digits, letters, `$`, `_` and dots: `Number` reads exactly the numeric literals among them.
      if (!Number.isNaN(Number(word))) {
        this.at += word.length;
        return Number(word);
      }
    }
    return this.skip();
  }
}

/**
 * The value a config module exports by default, as data; `undefined` when it exports nothing
 * this reader recognises. A name exported by reference (`export default config`) is unreadable.
 */
export const readExport = (source: string): Literal => {
  // Where the exported value starts, past `export default`, `module.exports =` and `defineConfig(`.
  const found = /(?:export\s+default|module\.exports\s*=)\s*(?:[$A-Z_a-z][\w$]*\s*\(\s*)?/u.exec(source);
  return found === null ? undefined : new Reader(source, found.index + found[0].length).value();
};
