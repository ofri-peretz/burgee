/**
 * y18n 5 — yargs' string table — ported for `burgee/yargs`. The 29 locales ship with
 * burgee under `locales/`, read on first use of a locale, never written (yargs runs
 * y18n with `updateFiles: false`).
 */
 
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'node:util';

export interface Y18N {
  __: (...args: any[]) => string;
  __n: (...args: any[]) => string;
  setLocale: (locale: string) => void;
  getLocale: () => string;
  updateLocale: (obj: Record<string, any>) => void;
  locale: string;
}

interface Y18NOptions {
  directory?: string;
  updateFiles?: boolean;
  locale?: string;
  fallbackToLanguage?: boolean;
}

function fileExistsSync(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

class Table {
  directory: string;
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
    let localeLookup: Record<string, any> = {};
    const languageFile = this.resolveLocaleFile(this.directory, this.locale);
    try {
      localeLookup = JSON.parse(readFileSync(languageFile, 'utf-8'));
    } catch (err: any) {
      if (err instanceof SyntaxError) err.message = `syntax error in ${languageFile}`;
      if (err.code === 'ENOENT') localeLookup = {};
      else throw err;
    }
    this.cache[this.locale] = localeLookup;
  }

  private resolveLocaleFile(directory: string, locale: string): string {
    let file = resolve(directory, './', `${locale}.json`);
    if (this.fallbackToLanguage && !fileExistsSync(file) && ~locale.lastIndexOf('_')) {
      const languageFile = resolve(directory, './', `${locale.split('_')[0]}.json`);
      if (fileExistsSync(languageFile)) file = languageFile;
    }
    return file;
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
