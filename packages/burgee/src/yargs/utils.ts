/**
 * yargs' small internal modules — yerror, parse-command, argsert, obj-filter, is-promise,
 * levenshtein, maybe-async-result, set-blocking, apply-extends, process-argv — ported
 * for `burgee/yargs`. Its suite imports four of these by their upstream file paths; the
 * oracle shims those paths to this entry, so the names here are the upstream names.
 */
 
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { host } from '../runtime.js';

export class YError extends Error {
  constructor(msg?: string | null) {
    super(msg || 'yargs error');
    this.name = 'YError';
    if (Error.captureStackTrace) Error.captureStackTrace(this, YError);
  }
}

export interface Positional {
  cmd: string[];
  variadic: boolean;
}

export interface ParsedCommand {
  cmd: string;
  demanded: Positional[];
  optional: Positional[];
}

/*
 * Upstream's parse-command is three regexes that backtrack quadratically on a long run of
 * whitespace or dots: 20,000 of them took 0.7 s, and the time grows with the square of the
 * length. Each helper below gives the same answer as the regex it replaces, in one pass.
 */

/** `s.split(/\s+(?![^[]*]|[^<]*>)/)`: a whitespace run splits unless it sits inside `[…]` or `<…>`. */
function splitOutsideBrackets(s: string): string[] {
  // inside[i]: the nearest `[`/`]` at or after i is `]`, or the nearest `<`/`>` is `>`.
  const inside: boolean[] = [];
  for (let i = s.length, square = false, angle = false; i >= 0; i--) {
    const c = s[i];
    if (c === ']' || c === '[') square = c === ']';
    else if (c === '>' || c === '<') angle = c === '>';
    inside[i] = square || angle;
  }
  const parts: string[] = [];
  let start = 0;
  for (const m of s.matchAll(/\s+/g)) {
    const end = m.index + m[0].length;
    if (!inside[end]) {
      parts.push(s.slice(start, m.index));
      start = end;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/** `s.replace(/\.*[\][<>]/g, '')`: drop every bracket along with the dots right before it. */
function stripBrackets(s: string): string {
  let out = '';
  let dots = '';
  for (const c of s) {
    if (c === '.') dots += c;
    else {
      if (!'[]<>'.includes(c)) out += dots + c;
      dots = '';
    }
  }
  return out + dots;
}

export function parseCommand(cmd: string): ParsedCommand {
  const extraSpacesStrippedCommand = cmd.replace(/\s{2,}/g, ' ');
  const splitCommand = splitOutsideBrackets(extraSpacesStrippedCommand);
  const firstCommand = splitCommand.shift();
  if (!firstCommand) throw new Error(`No command found in: ${cmd}`);
  const parsedCommand: ParsedCommand = { cmd: stripBrackets(firstCommand), demanded: [], optional: [] };
  splitCommand.forEach((c, i) => {
    let variadic = false;
    c = c.replace(/\s/g, '');
    // `/\.+[\]>]/.test(c)`
    if ((c.includes('.]') || c.includes('.>')) && i === splitCommand.length - 1) variadic = true;
    if (/^\[/.test(c)) parsedCommand.optional.push({ cmd: stripBrackets(c).split('|'), variadic });
    else parsedCommand.demanded.push({ cmd: stripBrackets(c).split('|'), variadic });
  });
  return parsedCommand;
}

const positionName = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

export function argsert(arg1: string | any[], arg2?: any, arg3?: number): void {
  function parseArgs(): [ParsedCommand, any, number | undefined] {
    return typeof arg1 === 'object' ? [{ cmd: '', demanded: [], optional: [] }, arg1, arg2] : [parseCommand(`cmd ${arg1}`), arg2, arg3];
  }
  try {
    let position = 0;
    const [parsed, callerArguments, _length] = parseArgs();
    const args: any[] = [].slice.call(callerArguments);
    while (args.length && args.at(-1) === undefined) args.pop();
    const length = _length || args.length;
    if (length < parsed.demanded.length) {
      throw new YError(`Not enough arguments provided. Expected ${parsed.demanded.length} but received ${args.length}.`);
    }
    const totalCommands = parsed.demanded.length + parsed.optional.length;
    if (length > totalCommands) {
      throw new YError(`Too many arguments provided. Expected max ${totalCommands} but received ${length}.`);
    }
    parsed.demanded.forEach((demanded) => {
      const arg = args.shift();
      const observedType = guessType(arg);
      const matchingTypes = demanded.cmd.filter((type) => type === observedType || type === '*');
      if (matchingTypes.length === 0) argumentTypeError(observedType, demanded.cmd, position);
      position += 1;
    });
    parsed.optional.forEach((optional) => {
      if (args.length === 0) return;
      const arg = args.shift();
      const observedType = guessType(arg);
      const matchingTypes = optional.cmd.filter((type) => type === observedType || type === '*');
      if (matchingTypes.length === 0) argumentTypeError(observedType, optional.cmd, position);
      position += 1;
    });
  } catch (err: any) {
    console.warn(err.stack);
  }
}

function guessType(arg: any): string {
  if (Array.isArray(arg)) return 'array';
  if (arg === null) return 'null';
  return typeof arg;
}

function argumentTypeError(observedType: string, allowedTypes: string[], position: number): never {
  throw new YError(`Invalid ${positionName[position] || 'manyith'} argument. Expected ${allowedTypes.join(' or ')} but received ${observedType}.`);
}

export function objFilter<T extends object>(original: T = {} as T, filter: (k: string, v: any) => boolean = () => true): T {
  const obj: any = {};
  Object.keys(original).forEach((key) => {
    if (filter(key, (original as any)[key])) obj[key] = (original as any)[key];
  });
  return obj;
}

export function isPromise(maybePromise: any): maybePromise is Promise<any> {
  return !!maybePromise && !!maybePromise.then && typeof maybePromise.then === 'function';
}

export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  let i: number;
  for (i = 0; i <= b.length; i++) matrix[i] = [i];
  let j: number;
  for (j = 0; j <= a.length; j++) (matrix[0] as number[])[j] = j;
  for (i = 1; i <= b.length; i++) {
    for (j = 1; j <= a.length; j++) {
      const row = matrix[i] as number[];
      const prev = matrix[i - 1] as number[];
      if (b.charAt(i - 1) === a.charAt(j - 1)) row[j] = prev[j - 1] as number;
      else if (i > 1 && j > 1 && b.charAt(i - 2) === a.charAt(j - 1) && b.charAt(i - 1) === a.charAt(j - 2)) {
        row[j] = ((matrix[i - 2] as number[])[j - 2] as number) + 1;
      } else row[j] = Math.min((prev[j - 1] as number) + 1, Math.min((row[j - 1] as number) + 1, (prev[j] as number) + 1));
    }
  }
  return (matrix[b.length] as number[])[a.length] as number;
}

export function maybeAsyncResult<T>(
  getResult: (() => T | Promise<T>) | T | Promise<T>,
  resultHandler: (result: T) => any,
  errorHandler: (err: Error) => any = (err) => {
    throw err;
  },
): any {
  try {
    const result = typeof getResult === 'function' ? (getResult as () => T | Promise<T>)() : getResult;
    return isPromise(result) ? result.then((r) => resultHandler(r)) : resultHandler(result as T);
  } catch (err: any) {
    return errorHandler(err);
  }
}

export function setBlocking(blocking: boolean): void {
  if (typeof process === 'undefined') return;
  [host.stdout, host.stderr].forEach((_stream) => {
    const stream = _stream as any;
    if (stream._handle && stream.isTTY && typeof stream._handle.setBlocking === 'function') stream._handle.setBlocking(blocking);
  });
}

function getProcessArgvBinIndex(): number {
  if (isBundledElectronApp()) return 0;
  return 1;
}

function isBundledElectronApp(): boolean {
  return isElectronApp() && !host.defaultApp;
}

function isElectronApp(): boolean {
  return !!host.versions['electron'];
}

export function hideBin(argv: string[]): string[] {
  return argv.slice(getProcessArgvBinIndex() + 1);
}

export function getProcessArgvBin(): string {
  return host.argv[getProcessArgvBinIndex()] as string;
}

const nodeRequire = createRequire(import.meta.url);

let previouslyVisitedConfigs: string[] = [];

/**
 * `extends` in a config object. The upstream resolves a bare specifier with
 * `import.meta.resolve` and then loads it through `require`; both are done from here.
 */
export function applyExtends(config: Record<string, any>, cwd: string, mergeExtends?: boolean): Record<string, any> {
  let defaultConfig: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(config, 'extends')) {
    if (typeof config.extends !== 'string') return defaultConfig;
    const isPath = isConfigPath(config.extends);
    let pathToDefault: string;
    if (!isPath) {
      try {
        pathToDefault = import.meta.resolve(config.extends);
      } catch {
        return config;
      }
    } else pathToDefault = resolve(cwd, config.extends);
    checkForCircularExtends(pathToDefault);
    previouslyVisitedConfigs.push(pathToDefault);
    defaultConfig = isPath ? JSON.parse(readFileSync(pathToDefault, 'utf8')) : nodeRequire(config.extends);
    delete config.extends;
    defaultConfig = applyExtends(defaultConfig, dirname(pathToDefault), mergeExtends);
  }
  previouslyVisitedConfigs = [];
  return mergeExtends ? mergeDeep(defaultConfig, config) : Object.assign({}, defaultConfig, config);
}

/**
 * `/\.json|\..*rc$/.test(s)` in linear time (the regex is quadratic on a run of dots).
 * `.*` stops at a line terminator, so the `.` it starts from must come after the last one,
 * and the last `.` before the closing `rc` is the one with the shortest span to check.
 */
export function isConfigPath(s: string): boolean {
  if (s.includes('.json')) return true;
  if (!s.endsWith('rc')) return false;
  const dot = s.lastIndexOf('.', s.length - 3);
  return dot !== -1 && !/[\n\r\u2028\u2029]/.test(s.slice(dot + 1, -2));
}

function checkForCircularExtends(cfgPath: string): void {
  if (previouslyVisitedConfigs.indexOf(cfgPath) > -1) throw new YError(`Circular extended configurations: '${cfgPath}'.`);
}

function mergeDeep(config1: Record<string, any>, config2: Record<string, any>): Record<string, any> {
  const target: Record<string, any> = {};
  function isObject(obj: any): boolean {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
  }
  Object.assign(target, config1);
  for (const key of Object.keys(config2)) {
    if (key === '__proto__') continue;
    if (isObject(config2[key]) && isObject(target[key])) target[key] = mergeDeep(config1[key], config2[key]);
    else target[key] = config2[key];
  }
  return target;
}

export function objectKeys<T extends object>(object: T): (keyof T)[] {
  return Object.keys(object) as (keyof T)[];
}
