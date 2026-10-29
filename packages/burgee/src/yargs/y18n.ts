/**
 * y18n 5 — yargs' string table — ported for `burgee/yargs`. The 29 locales ship with
 * burgee under `locales/`, never written (yargs runs y18n with `updateFiles: false`).
 *
 * **English is never read from disk** (`yargs-compat` X9, A-20261028-yargs-locale-read-at-runtime).
 * It is in the module graph (`y18n-locales.ts`, generated from `locales/`), so a program bundled
 * into one file, such as a `bun build --compile` binary whose files live in a virtual `/$bunfs`,
 * speaks it with nothing beside it. Another locale is read from `locales/` on first use, and **a
 * read that fails for any reason serves English**: y18n rethrew every error but `ENOENT`, so a
 * drive answering `EUNKNOWN` (igir#2244) failed every run of every program on that machine. A
 * locale burgee does not ship is its own keys, as on y18n, and is not looked for on disk at all.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'node:util';

import { EN, SHIPPED } from './y18n-locales.js';

export interface Y18N {
  __: (...args: any[]) => string;
  __n: (...args: any[]) => string;
  setLocale: (locale: string) => void;
  getLocale: () => string;
  updateLocale: (obj: Record<string, any>) => void;
  locale: string;
}

interface Y18NOptions {
  /** Where `locales/` is, or how to find it: asked only when a locale other than English is first read. */
  directory?: string | (() => string);
  updateFiles?: boolean;
  locale?: string;
  fallbackToLanguage?: boolean;
}

class Table {
  directory: string | (() => string);
  locale: string;
  fallbackToLanguage: boolean;
  cache: Record<string, Record<string, any>> = Object.create(null);

  constructor(opts: Y18NOptions) {
    this.directory = opts.directory || './locales';
    this.locale = opts.locale || 'en';
    this.fallbackToLanguage = typeof opts.fallbackToLanguage === 'boolean' ? opts.fallbackToLanguage : true;
  }

  __(...args: any[]): string {
    if (typeof args[0] !== 'string') return this.taggedLiteral(args[0], ...args);
    const str: string = args.shift();
    let cb: any = function () {};
    if (typeof args.at(-1) === 'function') cb = args.pop();
    if (!this.cache[this.locale]) this.readLocaleFile();
    cb();
    const table = this.cache[this.locale] as Record<string, any>;
    return format(...[table[str] || str].concat(args));
  }

  __n(...args: any[]): string {
    const singular: string = args.shift();
    const plural: string = args.shift();
    const quantity: number = args.shift();
    let cb: any = function () {};
    if (typeof args.at(-1) === 'function') cb = args.pop();
    if (!this.cache[this.locale]) this.readLocaleFile();
    const table = this.cache[this.locale] as Record<string, any>;
    let str = quantity === 1 ? singular : plural;
    if (table[singular]) {
      const entry = table[singular];
      str = entry[quantity === 1 ? 'one' : 'other'];
    }
    cb();
    const values: any[] = [str];
    if (~str.indexOf('%d')) values.push(quantity);
    return format(...values.concat(args));
  }

  setLocale(locale: string): void {
    this.locale = locale;
  }

  getLocale(): string {
    return this.locale;
  }

  updateLocale(obj: Record<string, any>): void {
    if (!this.cache[this.locale]) this.readLocaleFile();
    const table = this.cache[this.locale] as Record<string, any>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) table[key] = obj[key];
    }
  }

  private taggedLiteral(parts: string[], ...args: any[]): string {
    let str = '';
    parts.forEach((part, i) => {
      const arg = args[i + 1];
      str += part;
      if (typeof arg !== 'undefined') str += '%s';
    });
    return this.__(...[str].concat([].slice.call(args, 1)));
  }

  private readLocaleFile(): void {
    this.cache[this.locale] = this.load(this.locale);
  }

  /**
   * The table for `locale`. The file is y18n's choice, the locale's own or else its language's,
   * made from the list of what ships rather than by asking the disk. English is a copy of the
   * embedded table, so `updateStrings()` on one instance never reaches another.
   */
  private load(locale: string): Record<string, any> {
    const language = locale.split('_')[0] as string;
    const file = SHIPPED.includes(locale) ? locale : this.fallbackToLanguage && SHIPPED.includes(language) ? language : undefined;
    if (file === undefined) return {};
    if (file !== 'en') {
      try {
        const directory = typeof this.directory === 'string' ? this.directory : this.directory();
        return JSON.parse(readFileSync(resolve(directory, `${file}.json`), 'utf-8'));
      } catch {
        // Unreadable, not JSON, or no `locales/` to be found: English, never a failed run.
      }
    }
    return { ...EN };
  }
}

export function y18n(opts: Y18NOptions): Y18N {
  const table = new Table(opts);
  return {
    __: table.__.bind(table),
    __n: table.__n.bind(table),
    setLocale: table.setLocale.bind(table),
    getLocale: table.getLocale.bind(table),
    updateLocale: table.updateLocale.bind(table),
    locale: table.locale,
  };
}
